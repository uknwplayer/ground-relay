import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DEMO_ROWS = [
  {
    id: 'demo-001',
    scope: 'global',
    kind: 'context',
    content: 'Blue widgets are stored in bin A.',
    source: 'synthetic_test',
    createdAt: '2026-09-29T00:00:00.000Z'
  },
  {
    id: 'demo-002',
    scope: 'project:demo',
    kind: 'context',
    content: 'The metric dashboard refreshes every hour.',
    source: 'synthetic_test',
    createdAt: '2026-09-29T00:01:00.000Z'
  }
];

function ensureParentDirectory(databasePath) {
  if (databasePath === ':memory:') return;
  mkdirSync(dirname(databasePath), { recursive: true });
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
  `);

  const seedStatement = db.prepare(`
    INSERT OR IGNORE INTO memory_items (id, scope, kind, content, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const row of DEMO_ROWS) {
    seedStatement.run(row.id, row.scope, row.kind, row.content, row.source, row.createdAt);
  }

  const createStatement = db.prepare(`
    INSERT INTO memory_items (id, scope, kind, content, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const countStatement = db.prepare('SELECT COUNT(*) AS count FROM memory_items');
  const getStatement = db.prepare(`
    SELECT id, scope, kind, content, source, created_at AS createdAt
    FROM memory_items
    WHERE id = ?
  `);
  const searchStatement = db.prepare(`
    SELECT id, scope, kind, content, source, created_at AS createdAt
    FROM memory_items
    WHERE instr(lower(content), lower(?)) > 0
       OR instr(lower(id), lower(?)) > 0
       OR instr(lower(scope), lower(?)) > 0
       OR instr(lower(kind), lower(?)) > 0
    ORDER BY created_at DESC, id ASC
    LIMIT ?
  `);

  return {
    status() {
      const row = countStatement.get();
      return {
        backend: databasePath === ':memory:' ? 'sqlite-memory' : 'sqlite-file',
        records: Number(row?.count ?? 0),
        writable: true,
        persistence: databasePath === ':memory:' ? 'process-lifetime' : 'file-backed'
      };
    },

    create({ id = randomUUID(), scope = 'global', kind = 'context', content, source = 'mcp_write_spike', createdAt = new Date().toISOString() }) {
      createStatement.run(id, scope, kind, content, source, createdAt);
      return getStatement.get(id);
    },

    get(id) {
      return getStatement.get(id) ?? null;
    },

    search(query, limit = 5) {
      const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
      return searchStatement.all(query, query, query, query, boundedLimit);
    },

    close() {
      db.close();
    }
  };
}
