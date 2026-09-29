import { createDemoMemoryBackend } from './memory-backend.js';
import { createD1MemoryBackend } from './d1-memory-backend.js';

function requireEnv(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required D1 environment variable: ${name}`);
  }
  return value;
}

export async function createMemoryBackendFromEnv(
  env,
  { defaultDatabasePath = ':memory:', fetchImpl = fetch } = {}
) {
  if (env.MEMORY_BACKEND === 'd1') {
    const backend = createD1MemoryBackend({
      accountId: requireEnv(env, 'CLOUDFLARE_ACCOUNT_ID'),
      databaseId: requireEnv(env, 'CLOUDFLARE_D1_DATABASE_ID'),
      apiToken: requireEnv(env, 'CLOUDFLARE_API_TOKEN'),
      fetchImpl
    });
    await backend.init();
    return backend;
  }

  return createDemoMemoryBackend({
    databasePath: env.MEMORY_DB_PATH || defaultDatabasePath
  });
}
