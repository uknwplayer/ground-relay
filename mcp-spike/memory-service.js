export const MEMORY_TOOL_NAMES = Object.freeze([
  'memory_status',
  'memory_create',
  'memory_get',
  'memory_search',
  'memory_revise',
  'memory_confirm',
  'memory_supersede',
  'decision_record'
]);

const SAFE_SEMANTIC_CODES = new Set([
  'memory_not_found',
  'memory_not_current',
  'memory_successor_conflict',
  'memory_cycle_detected',
  'memory_same_id',
  'memory_id_conflict',
  'memory_event_conflict',
  'memory_metadata_invalid'
]);

export function sanitizeMemoryError(error) {
  const code = typeof error?.code === 'string' && SAFE_SEMANTIC_CODES.has(error.code)
    ? error.code
    : 'memory_backend_error';
  const safe = new Error(code);
  safe.code = code;
  return safe;
}

export function createMemoryOperations(memoryBackend) {
  return {
    async memory_status() {
      const status = await memoryBackend.status();
      return {
        ok: true,
        service: 'persistent-memory-mcp-spike',
        mode: 'read-write',
        memoryBackend: status.backend,
        records: status.records,
        events: status.events ?? 0,
        writable: status.writable,
        persistence: status.persistence,
        timestamp: new Date().toISOString()
      };
    },

    async memory_create({ id, scope = 'global', kind = 'context', content }) {
      const item = await memoryBackend.create({ id, scope, kind, content, source: 'mcp_write_spike' });
      return { created: true, item };
    },

    async memory_get({ id }) {
      const descriptor = await memoryBackend.get(id);
      if (!descriptor) return { found: false, item: null };
      return { found: true, item: descriptor.item, state: descriptor.state };
    },

    async memory_search({ query, limit = 5, includeHistory = false }) {
      const descriptors = await memoryBackend.search(query, limit, includeHistory);
      return {
        query,
        count: descriptors.length,
        items: descriptors.map(({ item, state }) => ({ ...item, state }))
      };
    },

    async memory_revise(args) {
      return memoryBackend.revise(args);
    },

    async memory_confirm(args) {
      return memoryBackend.confirm(args);
    },

    async memory_supersede(args) {
      return memoryBackend.supersede(args);
    },

    async decision_record(args) {
      return memoryBackend.recordDecision(args);
    }
  };
}
