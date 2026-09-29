import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDemoMemoryBackend } from './memory-backend.js';
import {
  MEMORY_TOOL_NAMES,
  createMemoryOperations,
  sanitizeMemoryError
} from './memory-service.js';

const EXPECTED_TOOLS = [
  'decision_record',
  'memory_confirm',
  'memory_create',
  'memory_get',
  'memory_revise',
  'memory_search',
  'memory_status',
  'memory_supersede'
];

test('tool contract contains exactly eight semantic memory tools', () => {
  assert.deepEqual([...MEMORY_TOOL_NAMES].sort(), EXPECTED_TOOLS);
});

test('operations preserve exact-id reads and current versus history search', async () => {
  const backend = createDemoMemoryBackend();
  try {
    const ops = createMemoryOperations(backend);
    await ops.memory_create({ id: 'op-old', content: 'alpha historical' });
    const revised = await ops.memory_revise({ id: 'op-old', content: 'alpha current', newId: 'op-new' });
    assert.equal(revised.current.id, 'op-new');
    const oldRead = await ops.memory_get({ id: 'op-old' });
    assert.equal(oldRead.found, true);
    assert.equal(oldRead.item.id, 'op-old');
    assert.equal(oldRead.item.content, 'alpha historical');
    assert.equal(oldRead.state.current, false);
    assert.equal(oldRead.state.supersededBy, 'op-new');
    const currentSearch = await ops.memory_search({ query: 'alpha', limit: 5, includeHistory: false });
    assert.deepEqual(currentSearch.items.map((item) => item.id), ['op-new']);
    assert.equal(currentSearch.items[0].state.current, true);
    const historySearch = await ops.memory_search({ query: 'historical', limit: 5, includeHistory: true });
    assert.deepEqual(historySearch.items.map((item) => item.id), ['op-old']);
    assert.equal(historySearch.items[0].state.current, false);
  } finally {
    backend.close();
  }
});

test('operations expose confirmations supersession decisions and additive status events', async () => {
  const backend = createDemoMemoryBackend();
  try {
    const ops = createMemoryOperations(backend);
    await ops.memory_create({ id: 'sup-old', content: 'old' });
    await ops.memory_create({ id: 'sup-new', content: 'new' });
    const superseded = await ops.memory_supersede({ oldId: 'sup-old', newId: 'sup-new' });
    assert.equal(superseded.relation.type, 'supersede');
    const confirmed = await ops.memory_confirm({ id: 'sup-new', note: 'checked' });
    assert.equal(confirmed.confirmationCount, 1);
    const decision = await ops.decision_record({
      id: 'decision-op',
      decision: 'Keep append-only history',
      rationale: 'Auditability',
      alternatives: ['overwrite'],
      context: 'Task 5'
    });
    assert.equal(decision.item.kind, 'decision');
    assert.equal(decision.decision.rationale, 'Auditability');
    const status = await ops.memory_status({});
    assert.equal(status.ok, true);
    assert.equal(status.events, 3);
    assert.equal(status.writable, true);
  } finally {
    backend.close();
  }
});

test('semantic and backend failures are sanitized for MCP callers', () => {
  const semantic = Object.assign(new Error('raw details must not surface'), { code: 'memory_not_found' });
  assert.equal(sanitizeMemoryError(semantic).message, 'memory_not_found');
  const backend = new Error('SQL SELECT secret-user-content');
  assert.equal(sanitizeMemoryError(backend).message, 'memory_backend_error');
});

test('server source registers exactly eight tools and declares history search input', () => {
  const source = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  const names = [...source.matchAll(/server\.registerTool\('([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(names, EXPECTED_TOOLS);
  assert.match(source, /includeHistory:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(source, /server\.registerTool\('memory_revise'/);
  assert.match(source, /server\.registerTool\('memory_confirm'/);
  assert.match(source, /server\.registerTool\('memory_supersede'/);
  assert.match(source, /server\.registerTool\('decision_record'/);
});

test('server runs semantic restart probe only for remote durable backend and logs safe summary', () => {
  const source = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  assert.match(source, /runSemanticRestartProbe/);
  assert.match(source, /status\?\.persistence === 'remote-durable'/);
  assert.match(source, /mcp-semantic-restart-probe/);
  assert.match(source, /preexisting:/);
  assert.match(source, /revision:/);
  assert.match(source, /confirmation:/);
  assert.match(source, /supersession:/);
  assert.match(source, /decision:/);
  assert.doesNotMatch(source, /Append-only events preserve audit history across process replacement/);
});

test('server startup self-test includes one non-mutating invalid-schema rejection', () => {
  const source = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  assert.match(source, /startup-invalid-schema-call/);
  assert.match(source, /invalidRejected/);
  assert.match(source, /mcp-selftest-schema/);
});
