import { randomUUID } from 'node:crypto';

const DEFAULT_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

function requireText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required D1 configuration: ${name}`);
  }
  return value;
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

  async function query(sql, params = []) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${safeApiToken}`
        },
        body: JSON.stringify({ sql, params })
      });
    } catch {
      throw new Error('D1 query failed: network error');
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new Error(`D1 query failed: HTTP ${response.status} invalid JSON`);
    }

    const firstResult = Array.isArray(envelope?.result) ? envelope.result[0] : null;
    if (!response.ok || envelope?.success !== true || firstResult?.success === false) {
      throw new Error(`D1 query failed: HTTP ${response.status}`);
    }

    return firstResult?.results ?? [];
  }

  return {
    async init() {
      await query(`
        CREATE TABLE IF NOT EXISTS memory_items (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    },

    async status() {
      const rows = await query('SELECT COUNT(*) AS count FROM memory_items');
      return {
        backend: 'cloudflare-d1',
        records: Number(rows?.[0]?.count ?? 0),
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
      await query(`
        INSERT INTO memory_items (id, scope, kind, content, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, scope, kind, content, source, createdAt]);
      return this.get(id);
    },

    async get(id) {
      const rows = await query(`
        SELECT id, scope, kind, content, source, created_at AS createdAt
        FROM memory_items
        WHERE id = ?
      `, [id]);
      return rows[0] ?? null;
    },

    async search(searchQuery, limit = 5) {
      const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
      return query(`
        SELECT id, scope, kind, content, source, created_at AS createdAt
        FROM memory_items
        WHERE instr(lower(content), lower(?)) > 0
           OR instr(lower(id), lower(?)) > 0
           OR instr(lower(scope), lower(?)) > 0
           OR instr(lower(kind), lower(?)) > 0
        ORDER BY created_at DESC, id ASC
        LIMIT ?
      `, [searchQuery, searchQuery, searchQuery, searchQuery, boundedLimit]);
    },

    async close() {}
  };
}
