import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackendFromEnv } from './memory-backend-factory.js';

function okEnvelope(results = []) {
  return new Response(JSON.stringify({ success: true, errors: [], result: [{ success: true, results }] }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

test('defaults to local SQLite file backend', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-factory-'));
  const defaultDatabasePath = join(dir, 'memory.sqlite');
  try {
    const backend = await createMemoryBackendFromEnv({}, { defaultDatabasePath });
    assert.equal(backend.status().backend, 'sqlite-file');
    assert.equal(backend.status().persistence, 'file-backed');
    backend.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('selects and initializes D1 backend when MEMORY_BACKEND=d1', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.sql);
    if (/COUNT/.test(body.sql)) return okEnvelope([{ count: 7 }]);
    return okEnvelope([]);
  };
  const backend = await createMemoryBackendFromEnv({
    MEMORY_BACKEND: 'd1',
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_D1_DATABASE_ID: 'db',
    CLOUDFLARE_API_TOKEN: 'token'
  }, { fetchImpl });

  assert.match(calls[0], /CREATE TABLE IF NOT EXISTS memory_items/);
  assert.deepEqual(await backend.status(), {
    backend: 'cloudflare-d1', records: 7, writable: true, persistence: 'remote-durable'
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
