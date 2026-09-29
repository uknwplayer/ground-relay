import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { deriveMemoryState, semanticError, wouldCreateCycle } from './memory-semantics.js';

const DEMO_ROWS = [
  { id: 'demo-001', scope: 'global', kind: 'context', content: 'Blue widgets are stored in bin A.', source: 'synthetic_test', createdAt: '2026-09-29T00:00:00.000Z' },
  { id: 'demo-002', scope: 'project:demo', kind: 'context', content: 'The metric dashboard refreshes every hour.', source: 'synthetic_test', createdAt: '2026-09-29T00:01:00.000Z' }
];

function ensureParentDirectory(databasePath) {
  if (databasePath === ':memory:') return;
  mkdirSync(dirname(databasePath), { recursive: true });
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

export function createDemoMemoryBackend({ databasePath = ':memory:' } = {}) {
  ensureParentDirectory(databasePath);
  const db = new DatabaseSync(databasePath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      related_memory_id TEXT,
      note TEXT,
      metadata_json TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK (related_memory_id IS NULL OR related_memory_id <> memory_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS memory_events_one_successor
    ON memory_events(memory_id)
    WHERE type IN ('revision', 'supersede');
  `);

  const seedStatement = db.prepare(`
    INSERT OR IGNORE INTO memory_items (id, scope, kind, content, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of DEMO_ROWS) seedStatement.run(row.id, row.scope, row.kind, row.content, row.source, row.createdAt);

  const createStatement = db.prepare(`INSERT INTO memory_items (id, scope, kind, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertEventStatement = db.prepare(`
    INSERT INTO memory_events (id, type, memory_id, related_memory_id, note, metadata_json, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const countStatement = db.prepare('SELECT COUNT(*) AS count FROM memory_items');
  const eventCountStatement = db.prepare('SELECT COUNT(*) AS count FROM memory_events');
  const getItemStatement = db.prepare(`SELECT id, scope, kind, content, source, created_at AS createdAt FROM memory_items WHERE id = ?`);
  const outgoingStatement = db.prepare(`
    SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt
    FROM memory_events WHERE memory_id = ? AND type IN ('revision','supersede') ORDER BY created_at ASC, id ASC
  `);
  const incomingStatement = db.prepare(`
    SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt
    FROM memory_events WHERE related_memory_id = ? AND type IN ('revision','supersede') ORDER BY created_at ASC, id ASC
  `);
  const confirmationsStatement = db.prepare(`
    SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt
    FROM memory_events WHERE memory_id = ? AND type = 'confirmation' ORDER BY created_at ASC, id ASC
  `);
  const decisionEventStatement = db.prepare(`
    SELECT id, type, memory_id AS memoryId, related_memory_id AS relatedMemoryId, note, metadata_json AS metadataJson, source, created_at AS createdAt
    FROM memory_events WHERE memory_id = ? AND type = 'decision_recorded' ORDER BY created_at ASC, id ASC LIMIT 1
  `);
  const relationEdgesStatement = db.prepare(`
    SELECT type, memory_id AS memoryId, related_memory_id AS relatedMemoryId
    FROM memory_events WHERE type IN ('revision','supersede')
  `);

  function getItem(id) {
    return getItemStatement.get(id) ?? null;
  }

  function descriptor(id) {
    const item = getItem(id);
    if (!item) return null;
    const outgoing = outgoingStatement.all(id).map(mapEvent);
    const incoming = incomingStatement.all(id).map(mapEvent);
    const confirmations = confirmationsStatement.all(id).map(mapEvent);
    const decisionEvent = mapEvent(decisionEventStatement.get(id));
    return { item, state: deriveMemoryState({ outgoing, incoming, confirmations, decisionEvent }) };
  }

  function searchRows(query, limit, includeHistory) {
    const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const historyClause = includeHistory ? '' : `AND NOT EXISTS (
      SELECT 1 FROM memory_events e
      WHERE e.memory_id = memory_items.id AND e.type IN ('revision','supersede')
    )`;
    const statement = db.prepare(`
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
    `);
    return statement.all(query, query, query, query, boundedLimit);
  }

  return {
    status() {
      const row = countStatement.get();
      const eventRow = eventCountStatement.get();
      return {
        backend: databasePath === ':memory:' ? 'sqlite-memory' : 'sqlite-file',
        records: Number(row?.count ?? 0),
        events: Number(eventRow?.count ?? 0),
        writable: true,
        persistence: databasePath === ':memory:' ? 'process-lifetime' : 'file-backed'
      };
    },

    create({ id = randomUUID(), scope = 'global', kind = 'context', content, source = 'mcp_write_spike', createdAt = new Date().toISOString() }) {
      createStatement.run(id, scope, kind, content, source, createdAt);
      return getItem(id);
    },

    get(id) {
      return descriptor(id);
    },

    search(query, limit = 5, includeHistory = false) {
      return searchRows(query, limit, includeHistory).map((row) => descriptor(row.id));
    },

    confirm({ id, note }) {
      const current = descriptor(id);
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
      db.exec('BEGIN IMMEDIATE');
      try {
        insertEventStatement.run(event.id, event.type, event.memoryId, null, event.note, null, event.source, event.createdAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      const state = descriptor(id).state;
      return {
        confirmed: true,
        item: current.item,
        event,
        confirmationCount: state.confirmationCount,
        lastConfirmedAt: state.lastConfirmedAt
      };
    },

    supersede({ oldId, newId, reason }) {
      if (oldId === newId) throw semanticError('memory_same_id');
      const previousDescriptor = descriptor(oldId);
      const currentDescriptor = descriptor(newId);
      if (!previousDescriptor || !currentDescriptor) throw semanticError('memory_not_found');
      if (!previousDescriptor.state.current) throw semanticError('memory_not_current');
      const edges = relationEdgesStatement.all();
      if (wouldCreateCycle(edges, oldId, newId)) throw semanticError('memory_cycle_detected');
      if (!currentDescriptor.state.current) throw semanticError('memory_not_current');

      const createdAt = new Date().toISOString();
      const eventId = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        insertEventStatement.run(eventId, 'supersede', oldId, newId, reason ?? null, null, 'mcp_supersede', createdAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (String(error?.message ?? '').includes('memory_events_one_successor') || String(error?.message ?? '').includes('UNIQUE')) {
          throw semanticError('memory_successor_conflict');
        }
        throw error;
      }
      return {
        superseded: true,
        previous: previousDescriptor.item,
        current: currentDescriptor.item,
        relation: { type: 'supersede', from: oldId, to: newId }
      };
    },

    revise({ id, content, reason, newId = randomUUID() }) {
      const previousDescriptor = descriptor(id);
      if (!previousDescriptor) throw semanticError('memory_not_found');
      if (!previousDescriptor.state.current) throw semanticError('memory_not_current');
      const previous = previousDescriptor.item;
      const createdAt = new Date().toISOString();
      const eventId = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        createStatement.run(newId, previous.scope, previous.kind, content, 'mcp_revision', createdAt);
        insertEventStatement.run(eventId, 'revision', id, newId, reason ?? null, null, 'mcp_revision', createdAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        const message = String(error?.message ?? '');
        if (message.includes('memory_items.id')) throw semanticError('memory_id_conflict');
        if (message.includes('memory_events.memory_id') || message.includes('memory_events_one_successor')) {
          throw semanticError('memory_successor_conflict');
        }
        throw error;
      }
      return {
        revised: true,
        previous,
        current: getItem(newId),
        relation: { type: 'revision', from: id, to: newId }
      };
    },

    recordDecision({ decision, rationale, alternatives = [], context, scope = 'global', id = randomUUID() }) {
      const createdAt = new Date().toISOString();
      const eventId = randomUUID();
      const metadata = { rationale, alternatives: [...alternatives] };
      if (context !== undefined) metadata.context = context;
      const metadataJson = JSON.stringify(metadata);

      db.exec('BEGIN IMMEDIATE');
      try {
        createStatement.run(id, scope, 'decision', decision, 'mcp_decision_record', createdAt);
        insertEventStatement.run(
          eventId,
          'decision_recorded',
          id,
          null,
          null,
          metadataJson,
          'mcp_decision_record',
          createdAt
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        const message = String(error?.message ?? '');
        if (message.includes('memory_items.id')) throw semanticError('memory_id_conflict');
        if (message.includes('memory_events.id')) throw semanticError('memory_event_conflict');
        throw error;
      }

      const item = getItem(id);
      return {
        recorded: true,
        item,
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

    close() {
      db.close();
    }
  };
}
