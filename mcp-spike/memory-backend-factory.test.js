import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackendFromEnv } from './memory-backend-factory.js';

const REQUIRED_METHODS = [
  'status', 'create', 'get', 'search',
  'revise', 'confirm', 'supersede', 'recordDecision', 'close'
];

function envelope(results = []) {
  return new Response(JSON.stringify({ success: true, errors: [], result: results }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

function assertSemanticContract(backend) {
  for (const method of REQUIRED_METHODS) {
    assert.equal(typeof backend[method], 'function', `missing backend method ${method}`);
  }
}

test('defaults to local SQLite file backend with full semantic contract', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-factory-'));
  const defaultDatabasePath = join(dir, 'memory.sqlite');
  try {
    const backend = await createMemoryBackendFromEnv({}, { defaultDatabasePath });
    assert.equal(backend.status().backend, 'sqlite-file');
    assert.equal(backend.status().persistence, 'file-backed');
    assert.equal(backend.status().events, 0);
    assertSemanticContract(backend);
    backend.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('selects and initializes D1 backend with full semantic contract when MEMORY_BACKEND=d1', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.batch) {
      return envelope(body.batch.map(() => ({ success: true, results: [], meta: {} })));
    }
    if (/AS records/.test(body.sql)) {
      return envelope([{ success: true, results: [{ records: 7, events: 3 }], meta: {} }]);
    }
    return envelope([{ success: true, results: [], meta: {} }]);
  };

  const backend = await createMemoryBackendFromEnv({
    MEMORY_BACKEND: 'd1',
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_D1_DATABASE_ID: 'db',
    CLOUDFLARE_API_TOKEN: 'token'
  }, { fetchImpl });

  assert.equal(Array.isArray(calls[0].batch), true);
  assert.match(calls[0].batch[0].sql, /CREATE TABLE IF NOT EXISTS memory_items/);
  assertSemanticContract(backend);
  assert.deepEqual(await backend.status(), {
    backend: 'cloudflare-d1',
    records: 7,
    events: 3,
    writable: true,
    persistence: 'remote-durable'
  });
});

test('D1 mode fails fast with missing named environment configuration', async () => {
  await assert.rejects(
    () => createMemoryBackendFromEnv({
      MEMORY_BACKEND: 'd1',
      CLOUDFLARE_D1_DATABASE_ID: 'db',
      CLOUDFLARE_API_TOKEN: 'super-secret'
    }),
    (error) => error.message.includes('CLOUDFLARE_ACCOUNT_ID') && !error.message.includes('super-secret')
  );
});
