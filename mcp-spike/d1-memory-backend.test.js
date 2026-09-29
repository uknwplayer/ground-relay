import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1MemoryBackend } from './d1-memory-backend.js';

function okEnvelope(results = []) {
  return new Response(JSON.stringify({
    success: true,
    errors: [],
    messages: [],
    result: [{ success: true, results, meta: {} }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('requires account, database and token without exposing token', () => {
  assert.throws(
    () => createD1MemoryBackend({ accountId: '', databaseId: 'db', apiToken: 'super-secret' }),
    (error) => error.message.includes('accountId') && !error.message.includes('super-secret')
  );
});

test('init sends authenticated parameterized D1 query request', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return okEnvelope([]);
  };
  const backend = createD1MemoryBackend({
    accountId: 'acct', databaseId: 'db', apiToken: 'token',
    apiBaseUrl: 'https://example.test/client/v4', fetchImpl
  });

  await backend.init();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/client/v4/accounts/acct/d1/database/db/query');
  assert.equal(calls[0].options.headers.authorization, 'Bearer token');
  assert.match(calls[0].body.sql, /CREATE TABLE IF NOT EXISTS memory_items/);
  assert.deepEqual(calls[0].body.params, []);
});

test('create, get, search and status map D1 query results', async () => {
  const seen = [];
  const row = {
    id: 'test-123', scope: 'global', kind: 'context',
    content: 'persistent write spike', source: 'mcp_write_spike',
    createdAt: '2026-09-29T07:00:00.000Z'
  };
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    seen.push(body);
    if (/CREATE TABLE/.test(body.sql)) return okEnvelope([]);
    if (/INSERT INTO memory_items/.test(body.sql)) return okEnvelope([]);
    if (/COUNT\(\*\)/.test(body.sql)) return okEnvelope([{ count: 3 }]);
    if (/WHERE id = \?/.test(body.sql)) return okEnvelope([row]);
    if (/instr\(lower\(content\)/.test(body.sql)) return okEnvelope([row]);
    throw new Error(`unexpected SQL: ${body.sql}`);
  };
  const backend = createD1MemoryBackend({
    accountId: 'acct', databaseId: 'db', apiToken: 'token', fetchImpl
  });
  await backend.init();

  const created = await backend.create({
    id: row.id, scope: row.scope, kind: row.kind, content: row.content,
    source: row.source, createdAt: row.createdAt
  });
  assert.equal(created.id, 'test-123');
  assert.deepEqual(seen.find((x) => /INSERT INTO memory_items/.test(x.sql)).params, [
    row.id, row.scope, row.kind, row.content, row.source, row.createdAt
  ]);

  assert.equal((await backend.get('test-123')).content, row.content);
  assert.equal((await backend.search('write spike', 5))[0].id, 'test-123');
  assert.deepEqual(await backend.status(), {
    backend: 'cloudflare-d1', records: 3, writable: true, persistence: 'remote-durable'
  });
});

test('sanitizes Cloudflare API failures', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    success: false,
    errors: [{ code: 7500, message: 'token super-secret invalid' }],
    result: []
  }), { status: 403, headers: { 'content-type': 'application/json' } });

  const backend = createD1MemoryBackend({
    accountId: 'acct', databaseId: 'db', apiToken: 'super-secret', fetchImpl
  });

  await assert.rejects(
    () => backend.init(),
    (error) => error.message.includes('D1 query failed') && !error.message.includes('super-secret')
  );
});
