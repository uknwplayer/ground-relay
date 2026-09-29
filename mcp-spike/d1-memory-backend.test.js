import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1MemoryBackend } from './d1-memory-backend.js';

function envelope(results = []) {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result: results }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function okEnvelope(rows = []) {
  return envelope([{ success: true, results: rows, meta: {} }]);
}

test('requires account database and token without exposing token', () => {
  assert.throws(
    () => createD1MemoryBackend({ accountId: '', databaseId: 'db', apiToken: 'super-secret' }),
    (error) => error.message.includes('accountId') && !error.message.includes('super-secret')
  );
});

test('init creates item event schema and successor index non-destructively in one batch', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return envelope((body.batch ?? []).map(() => ({ success: true, results: [], meta: {} })));
  };
  const backend = createD1MemoryBackend({ accountId: 'acct', databaseId: 'db', apiToken: 'token', fetchImpl });

  await backend.init();

  assert.equal(calls.length, 1);
  assert.equal(Array.isArray(calls[0].batch), true);
  assert.equal(calls[0].batch.length, 3);
  const sql = calls[0].batch.map((entry) => entry.sql).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS memory_items/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS memory_events/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS memory_events_one_successor/);
  assert.doesNotMatch(sql, /DROP\s+/i);
  assert.deepEqual(calls[0].batch.map((entry) => entry.params), [[], [], []]);
});

test('decision write uses one parameterized batch and failed batch is sanitized', async () => {
  const seen = [];
  let failBatch = false;
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    seen.push(body);
    if (body.batch) {
      if (failBatch) {
        return envelope([
          { success: true, results: [], meta: {} },
          { success: false, results: [], meta: {}, error: 'token super-secret should never surface' }
        ]);
      }
      return envelope(body.batch.map(() => ({ success: true, results: [], meta: {} })));
    }
    if (/WHERE id = \?/.test(body.sql)) {
      return okEnvelope([{ id: 'decision-1', scope: 'global', kind: 'decision', content: 'Use D1', source: 'mcp_decision_record', createdAt: '2026-09-29T12:00:00.000Z' }]);
    }
    return okEnvelope([]);
  };
  const backend = createD1MemoryBackend({ accountId: 'acct', databaseId: 'db', apiToken: 'super-secret', fetchImpl });

  const result = await backend.recordDecision({
    id: 'decision-1',
    decision: 'Use D1',
    rationale: 'Durable',
    alternatives: ['local']
  });
  assert.equal(result.item.id, 'decision-1');
  const writeBatch = seen.find((body) => body.batch?.some((entry) => /INSERT INTO memory_items/.test(entry.sql)));
  assert.ok(writeBatch);
  assert.equal(writeBatch.batch.length, 2);
  assert.deepEqual(writeBatch.batch[0].params.slice(0, 4), ['decision-1', 'global', 'decision', 'Use D1']);
  assert.equal(writeBatch.batch[1].params.includes('Use D1'), false);

  failBatch = true;
  await assert.rejects(
    () => backend.recordDecision({ id: 'decision-2', decision: 'Other', rationale: 'R' }),
    (error) => (error?.code === 'memory_event_conflict' || error.message.includes('D1')) && !error.message.includes('super-secret')
  );
});

function createStatefulD1Fetch() {
  const state = { items: new Map(), events: [] };

  const normalizeEvent = (event) => ({
    id: event.id,
    type: event.type,
    memoryId: event.memoryId,
    relatedMemoryId: event.relatedMemoryId,
    note: event.note,
    metadataJson: event.metadataJson,
    source: event.source,
    createdAt: event.createdAt
  });

  function run(statement) {
    const sql = statement.sql;
    const params = statement.params ?? [];

    if (/CREATE TABLE|CREATE UNIQUE INDEX/.test(sql)) return { success: true, results: [], meta: {} };

    if (/INSERT INTO memory_items/.test(sql)) {
      const [id, scope, kind, content, source, createdAt] = params;
      if (state.items.has(id)) return { success: false, results: [], meta: {} };
      state.items.set(id, { id, scope, kind, content, source, createdAt });
      return { success: true, results: [], meta: {} };
    }

    if (/INSERT INTO memory_events/.test(sql)) {
      const [id, type, memoryId, relatedMemoryId, note, metadataJson, source, createdAt] = params;
      if (state.events.some((event) => event.id === id)) return { success: false, results: [], meta: {} };
      if (relatedMemoryId === memoryId) return { success: false, results: [], meta: {} };
      if ((type === 'revision' || type === 'supersede') && state.events.some((event) => event.memoryId === memoryId && (event.type === 'revision' || event.type === 'supersede'))) {
        return { success: false, results: [], meta: {} };
      }
      state.events.push({ id, type, memoryId, relatedMemoryId, note, metadataJson, source, createdAt });
      return { success: true, results: [], meta: {} };
    }

    if (/SELECT \(SELECT COUNT\(\*\) AS/.test(sql) || /AS records/.test(sql)) {
      return { success: true, results: [{ records: state.items.size, events: state.events.length }], meta: {} };
    }
    if (/COUNT\(\*\).*memory_items/.test(sql)) return { success: true, results: [{ count: state.items.size }], meta: {} };
    if (/COUNT\(\*\).*memory_events/.test(sql)) return { success: true, results: [{ count: state.events.length }], meta: {} };

    if (/FROM memory_items\s+WHERE id = \?/.test(sql.replace(/\n/g, ' '))) {
      const item = state.items.get(params[0]);
      return { success: true, results: item ? [item] : [], meta: {} };
    }

    if (/FROM memory_events/.test(sql) && /related_memory_id = \?/.test(sql)) {
      return { success: true, results: state.events.filter((e) => e.relatedMemoryId === params[0] && (e.type === 'revision' || e.type === 'supersede')).map(normalizeEvent), meta: {} };
    }
    if (/FROM memory_events/.test(sql) && /WHERE memory_id = \?/.test(sql) && /type IN \('revision','supersede'\)/.test(sql)) {
      return { success: true, results: state.events.filter((e) => e.memoryId === params[0] && (e.type === 'revision' || e.type === 'supersede')).map(normalizeEvent), meta: {} };
    }
    if (/FROM memory_events/.test(sql) && /type = 'confirmation'/.test(sql)) {
      return { success: true, results: state.events.filter((e) => e.memoryId === params[0] && e.type === 'confirmation').map(normalizeEvent), meta: {} };
    }
    if (/FROM memory_events/.test(sql) && /type = 'decision_recorded'/.test(sql)) {
      const event = state.events.find((e) => e.memoryId === params[0] && e.type === 'decision_recorded');
      return { success: true, results: event ? [normalizeEvent(event)] : [], meta: {} };
    }
    const compactSql = sql.replace(/\s+/g, ' ');
    if (/SELECT type, memory_id AS memoryId, related_memory_id AS relatedMemoryId FROM memory_events WHERE type IN/.test(compactSql)) {
      return { success: true, results: state.events.filter((e) => e.type === 'revision' || e.type === 'supersede').map(normalizeEvent), meta: {} };
    }

    if (/instr\(lower\(content\)/.test(sql)) {
      const query = String(params[0]).toLowerCase();
      const limit = Number(params.at(-1));
      const currentOnly = /NOT EXISTS/.test(sql);
      const rows = [...state.items.values()].filter((item) => {
        const matches = [item.content, item.id, item.scope, item.kind].some((value) => String(value).toLowerCase().includes(query));
        if (!matches) return false;
        if (!currentOnly) return true;
        return !state.events.some((e) => e.memoryId === item.id && (e.type === 'revision' || e.type === 'supersede'));
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, limit);
      return { success: true, results: rows, meta: {} };
    }

    throw new Error(`unexpected SQL in fake D1: ${sql}`);
  }

  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.batch) {
      const snapshot = { items: new Map(state.items), events: state.events.map((event) => ({ ...event })) };
      const results = [];
      for (const statement of body.batch) {
        const result = run(statement);
        results.push(result);
        if (result.success === false) {
          state.items = snapshot.items;
          state.events = snapshot.events;
          while (results.length < body.batch.length) results.push({ success: false, results: [], meta: {} });
          break;
        }
      }
      return envelope(results);
    }
    return envelope([run(body)]);
  };

  return { fetchImpl, state };
}

test('D1 semantic operations match immutable SQLite contract', async () => {
  const fake = createStatefulD1Fetch();
  const backend = createD1MemoryBackend({ accountId: 'acct', databaseId: 'db', apiToken: 'token', fetchImpl: fake.fetchImpl });
  await backend.init();

  await backend.create({ id: 'old', content: 'cloudflare old', createdAt: '2026-09-29T12:00:00.000Z' });
  const revised = await backend.revise({ id: 'old', content: 'cloudflare new', newId: 'new', reason: 'changed' });
  assert.equal(revised.previous.content, 'cloudflare old');
  assert.equal(revised.current.content, 'cloudflare new');

  const old = await backend.get('old');
  const current = await backend.get('new');
  assert.equal(old.item.content, 'cloudflare old');
  assert.equal(old.state.current, false);
  assert.equal(old.state.supersededBy, 'new');
  assert.equal(current.state.revisedFrom, 'old');

  assert.deepEqual((await backend.search('cloudflare', 5)).map((entry) => entry.item.id), ['new']);
  assert.deepEqual((await backend.search('cloudflare old', 5, true)).map((entry) => entry.item.id), ['old']);

  const confirmed = await backend.confirm({ id: 'new', note: 'checked' });
  assert.equal(confirmed.confirmationCount, 1);
  assert.equal((await backend.get('new')).state.confirmationCount, 1);

  await backend.create({ id: 'manual-old', content: 'manual old' });
  await backend.create({ id: 'manual-new', content: 'manual new' });
  const superseded = await backend.supersede({ oldId: 'manual-old', newId: 'manual-new', reason: 'better' });
  assert.equal(superseded.relation.type, 'supersede');
  assert.equal((await backend.get('manual-old')).state.supersededBy, 'manual-new');

  const decision = await backend.recordDecision({
    id: 'decision-semantic',
    decision: 'Keep immutable history',
    rationale: 'Auditability',
    alternatives: ['overwrite'],
    context: 'semantic layer'
  });
  assert.deepEqual(decision.decision, { rationale: 'Auditability', alternatives: ['overwrite'], context: 'semantic layer' });
  assert.deepEqual((await backend.get('decision-semantic')).state.decision, decision.decision);

  const status = await backend.status();
  assert.equal(status.backend, 'cloudflare-d1');
  assert.equal(status.records, 5);
  assert.equal(status.events, 4);
  assert.equal(status.persistence, 'remote-durable');
});

test('D1 rejects same-id branching cycles duplicate revision IDs and malformed metadata safely', async () => {
  const fake = createStatefulD1Fetch();
  const backend = createD1MemoryBackend({ accountId: 'acct', databaseId: 'db', apiToken: 'token', fetchImpl: fake.fetchImpl });
  await backend.init();

  await backend.create({ id: 'a', content: 'A' });
  await backend.create({ id: 'b', content: 'B' });
  await backend.create({ id: 'c', content: 'C' });

  await assert.rejects(() => backend.supersede({ oldId: 'a', newId: 'a' }), (error) => error?.code === 'memory_same_id');
  await backend.supersede({ oldId: 'a', newId: 'b' });
  await assert.rejects(() => backend.supersede({ oldId: 'a', newId: 'c' }), (error) => error?.code === 'memory_not_current');
  await assert.rejects(() => backend.supersede({ oldId: 'b', newId: 'a' }), (error) => error?.code === 'memory_cycle_detected');

  await backend.create({ id: 'existing', content: 'existing' });
  const eventsBefore = fake.state.events.length;
  await assert.rejects(() => backend.revise({ id: 'c', content: 'new', newId: 'existing' }), (error) => error?.code === 'memory_id_conflict');
  assert.equal(fake.state.events.length, eventsBefore);
  assert.equal((await backend.get('c')).state.current, true);

  await backend.recordDecision({ id: 'bad-meta', decision: 'X', rationale: 'Y' });
  fake.state.events.find((event) => event.memoryId === 'bad-meta' && event.type === 'decision_recorded').metadataJson = '{bad-json';
  await assert.rejects(() => backend.get('bad-meta'), (error) => error?.code === 'memory_metadata_invalid' && !error.message.includes('{bad-json'));
});

test('D1 API failures remain sanitized', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    success: false,
    errors: [{ code: 7500, message: 'token super-secret invalid' }],
    result: []
  }), { status: 403, headers: { 'content-type': 'application/json' } });
  const backend = createD1MemoryBackend({ accountId: 'acct', databaseId: 'db', apiToken: 'super-secret', fetchImpl });
  await assert.rejects(
    () => backend.init(),
    (error) => error.message.includes('D1') && !error.message.includes('super-secret')
  );
});
