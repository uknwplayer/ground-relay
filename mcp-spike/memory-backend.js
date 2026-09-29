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

export function createDemoMemoryBackend() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE memory_items (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO memory_items (id, scope, kind, content, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const row of DEMO_ROWS) {
    insert.run(row.id, row.scope, row.kind, row.content, row.source, row.createdAt);
  }

  db.exec('PRAGMA query_only = ON');

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
    ORDER BY id ASC
    LIMIT ?
  `);

  return {
    status() {
      const row = countStatement.get();
      return {
        backend: 'sqlite-demo',
        records: Number(row?.count ?? 0),
        writable: false,
        persistence: 'process-lifetime'
      };
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
