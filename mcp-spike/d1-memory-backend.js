import { randomUUID } from 'node:crypto';
import { deriveMemoryState, semanticError, wouldCreateCycle } from './memory-semantics.js';

const DEFAULT_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

function requireText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required D1 configuration: ${name}`);
  }
  return value;
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    memoryId: row.memoryId,
    relatedMemoryId: row.relatedMemoryId ?? null,
    note: row.note ?? null,
    metadataJson: row.metadataJson ?? null,
    source: row.source,
    createdAt: row.createdAt
  };
}

export function createD1MemoryBackend({
  accountId,
  databaseId,
  apiToken,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = fetch
}) {
  const safeAccountId = requireText('accountId', accountId);
  const safeDatabaseId = requireText('databaseId', databaseId);
  const safeApiToken = requireText('apiToken', apiToken);
  const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/accounts/${encodeURIComponent(safeAccountId)}/d1/database/${encodeURIComponent(safeDatabaseId)}/query`;

  async function post(body, label) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${safeApiToken}`
        },
        body: JSON.stringify(body)
      });
    } catch {
      const error = new Error(`D1 ${label} failed: network error`);
      error.d1NetworkFailure = true;
      throw error;
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new Error(`D1 ${label} failed: HTTP ${response.status} invalid JSON`);
    }

    if (!response.ok || envelope?.success !== true || !Array.isArray(envelope?.result)) {
      throw new Error(`D1 ${label} failed: HTTP ${response.status}`);
    }
    return envelope.result;
  }

  async function query(sql, params = []) {
    const results = await post({ sql, params }, 'query');
    const first = results[0];
    if (!first || first.success === false) {
      const error = new Error('D1 query failed: statement 0');
      error.d1SqlFailure = true;
      throw error;
    }
    return first.results ?? [];
  }

  async function queryBatch(statements) {
    const results = await post({ batch: statements }, 'batch');
    if (results.length !== statements.length) {
      throw new Error('D1 batch failed: result count mismatch');
    }
    const failedIndex = results.findIndex((result) => result?.success === false);
    if (failedIndex >= 0) {
      const error = new Error(`D1 batch failed: statement ${failedIndex}`);
      error.statementIndex = failedIndex;
      error.d1SqlFailure = true;
      throw error;
    }
    return results.map((result) => result?.results ?? []);
  }

  async function getItem(id) {
    const rows = await query(`
      SELECT id, scope, kind, content, source, created_at AS createdAt
      FROM memory_items
      WHERE id = ?
    `, [id]);
    return rows[0] ?? null;
  }

  async function descriptor(id) {
    const [items, outgoingRows, incomingRows, confirmationRows, decisionRows] = await queryBatch([
      {
        sql: `SELECT id, scope, kind, content, source, created_at AS createdAt FROM memory_items WHERE id = ?`,
        params: [id]
      },
      {
        sql: `SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt FROM memory_events WHERE memory_id = ? AND type IN ('revision','supersede') ORDER BY created_at ASC, id ASC`,
        params: [id]
      },
      {
        sql: `SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt FROM memory_events WHERE related_memory_id = ? AND type IN ('revision','supersede') ORDER BY created_at ASC, id ASC`,
        params: [id]
      },
      {
        sql: `SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt FROM memory_events WHERE memory_id = ? AND type = 'confirmation' ORDER BY created_at ASC, id ASC`,
        params: [id]
      },
      {
        sql: `SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt FROM memory_events WHERE memory_id = ? AND type = 'decision_recorded' ORDER BY created_at ASC, id ASC LIMIT 1`,
        params: [id]
      }
    ]);

    const item = items[0] ?? null;
    if (!item) return null;
    return {
      item,
      state: deriveMemoryState({
        outgoing: outgoingRows.map(mapEvent),
        incoming: incomingRows.map(mapEvent),
        confirmations: confirmationRows.map(mapEvent),
        decisionEvent: mapEvent(decisionRows[0])
      })
    };
  }

  async function relationEdges() {
    return query(`
      SELECT type, memory_id AS memoryId, related_memory_id AS relatedMemoryId
      FROM memory_events
      WHERE type IN ('revision','supersede')
    `);
  }

  return {
    async init() {
      await queryBatch([
        {
          sql: `CREATE TABLE IF NOT EXISTS memory_items (
            id TEXT PRIMARY KEY,
            scope TEXT NOT NULL,
            kind TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL
          );`,
          params: []
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS memory_events (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            memory_id TEXT NOT NULL,
            related_memory_id TEXT,
            note TEXT,
            metadata_json TEXT,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            CHECK (related_memory_id IS NULL OR related_memory_id <> memory_id)
          );`,
          params: []
        },
        {
          sql: `CREATE UNIQUE INDEX IF NOT EXISTS memory_events_one_successor
                ON memory_events(memory_id)
                WHERE type IN ('revision','supersede');`,
          params: []
        }
      ]);
    },

    async status() {
      const rows = await query(`
        SELECT
          (SELECT COUNT(*) FROM memory_items) AS records,
          (SELECT COUNT(*) FROM memory_events) AS events
      `);
      return {
        backend: 'cloudflare-d1',
        records: Number(rows?.[0]?.records ?? 0),
        events: Number(rows?.[0]?.events ?? 0),
        writable: true,
        persistence: 'remote-durable'
      };
    },

    async create({
      id = randomUUID(),
      scope = 'global',
      kind = 'context',
      content,
      source = 'mcp_write_spike',
      createdAt = new Date().toISOString()
    }) {
      try {
        await query(`
          INSERT INTO memory_items (id, scope, kind, content, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, scope, kind, content, source, createdAt]);
      } catch (error) {
        if (error?.d1SqlFailure) throw semanticError('memory_id_conflict');
        throw error;
      }
      return getItem(id);
    },

    async get(id) {
      return descriptor(id);
    },

    async search(searchQuery, limit = 5, includeHistory = false) {
      const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
      const historyClause = includeHistory ? '' : `AND NOT EXISTS (
        SELECT 1 FROM memory_events e
        WHERE e.memory_id = memory_items.id AND e.type IN ('revision','supersede')
      )`;
      const rows = await query(`
        SELECT id, scope, kind, content, source, created_at AS createdAt
        FROM memory_items
        WHERE (
          instr(lower(content), lower(?)) > 0
          OR instr(lower(id), lower(?)) > 0
          OR instr(lower(scope), lower(?)) > 0
          OR instr(lower(kind), lower(?)) > 0
        )
        ${historyClause}
        ORDER BY created_at DESC, id ASC
        LIMIT ?
      `, [searchQuery, searchQuery, searchQuery, searchQuery, boundedLimit]);
      return Promise.all(rows.map((row) => descriptor(row.id)));
    },

    async revise({ id, content, reason, newId = randomUUID() }) {
      const previousDescriptor = await descriptor(id);
      if (!previousDescriptor) throw semanticError('memory_not_found');
      if (!previousDescriptor.state.current) throw semanticError('memory_not_current');

      const previous = previousDescriptor.item;
      const createdAt = new Date().toISOString();
      const eventId = randomUUID();
      try {
        await queryBatch([
          {
            sql: `INSERT INTO memory_items (id, scope, kind, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [newId, previous.scope, previous.kind, content, 'mcp_revision', createdAt]
          },
          {
            sql: `INSERT INTO memory_events (id, type, memory_id, related_memory_id, note, metadata_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [eventId, 'revision', id, newId, reason ?? null, null, 'mcp_revision', createdAt]
          }
        ]);
      } catch (error) {
        if (error?.statementIndex === 0) throw semanticError('memory_id_conflict');
        if (error?.statementIndex === 1) throw semanticError('memory_successor_conflict');
        throw error;
      }

      return {
        revised: true,
        previous,
        current: await getItem(newId),
        relation: { type: 'revision', from: id, to: newId }
      };
    },

    async confirm({ id, note }) {
      const current = await descriptor(id);
      if (!current) throw semanticError('memory_not_found');
      const createdAt = new Date().toISOString();
      const event = {
        id: randomUUID(),
        type: 'confirmation',
        memoryId: id,
        relatedMemoryId: null,
        note: note ?? null,
        metadataJson: null,
        source: 'mcp_confirmation',
        createdAt
      };
      try {
        await query(`
          INSERT INTO memory_events (id, type, memory_id, related_memory_id, note, metadata_json, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [event.id, event.type, event.memoryId, null, event.note, null, event.source, event.createdAt]);
      } catch (error) {
        if (error?.d1SqlFailure) throw semanticError('memory_event_conflict');
        throw error;
      }
      const state = (await descriptor(id)).state;
      return {
        confirmed: true,
        item: current.item,
        event,
        confirmationCount: state.confirmationCount,
        lastConfirmedAt: state.lastConfirmedAt
      };
    },

    async supersede({ oldId, newId, reason }) {
      if (oldId === newId) throw semanticError('memory_same_id');
      const previousDescriptor = await descriptor(oldId);
      const currentDescriptor = await descriptor(newId);
      if (!previousDescriptor || !currentDescriptor) throw semanticError('memory_not_found');
      if (!previousDescriptor.state.current) throw semanticError('memory_not_current');
      const edges = await relationEdges();
      if (wouldCreateCycle(edges, oldId, newId)) throw semanticError('memory_cycle_detected');
      if (!currentDescriptor.state.current) throw semanticError('memory_not_current');

      const createdAt = new Date().toISOString();
      try {
        await query(`
          INSERT INTO memory_events (id, type, memory_id, related_memory_id, note, metadata_json, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [randomUUID(), 'supersede', oldId, newId, reason ?? null, null, 'mcp_supersede', createdAt]);
      } catch (error) {
        if (error?.d1SqlFailure) throw semanticError('memory_successor_conflict');
        throw error;
      }
      return {
        superseded: true,
        previous: previousDescriptor.item,
        current: currentDescriptor.item,
        relation: { type: 'supersede', from: oldId, to: newId }
      };
    },

    async recordDecision({
      decision,
      rationale,
      alternatives = [],
      context,
      scope = 'global',
      id = randomUUID()
    }) {
      const createdAt = new Date().toISOString();
      const eventId = randomUUID();
      const metadata = { rationale, alternatives: [...alternatives] };
      if (context !== undefined) metadata.context = context;
      const metadataJson = JSON.stringify(metadata);

      try {
        await queryBatch([
          {
            sql: `INSERT INTO memory_items (id, scope, kind, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [id, scope, 'decision', decision, 'mcp_decision_record', createdAt]
          },
          {
            sql: `INSERT INTO memory_events (id, type, memory_id, related_memory_id, note, metadata_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [eventId, 'decision_recorded', id, null, null, metadataJson, 'mcp_decision_record', createdAt]
          }
        ]);
      } catch (error) {
        if (error?.statementIndex === 0) throw semanticError('memory_id_conflict');
        if (error?.statementIndex === 1) throw semanticError('memory_event_conflict');
        throw error;
      }

      return {
        recorded: true,
        item: await getItem(id),
        event: {
          id: eventId,
          type: 'decision_recorded',
          memoryId: id,
          relatedMemoryId: null,
          note: null,
          metadataJson,
          source: 'mcp_decision_record',
          createdAt
        },
        decision: metadata
      };
    },

    async close() {}
  };
}
