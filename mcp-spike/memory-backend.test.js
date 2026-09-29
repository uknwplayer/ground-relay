import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createDemoMemoryBackend } from './memory-backend.js';

test('backend creates a memory that can be read and searched', () => {
  const backend = createDemoMemoryBackend();
  try {
    const created = backend.create({ id: 'test-123', content: 'persistent write spike' });
    assert.equal(created.id, 'test-123');
    assert.equal(backend.get('test-123')?.item?.content, 'persistent write spike');
    assert.equal(backend.search('write spike', 5)[0]?.item?.id, 'test-123');
    assert.equal(backend.status().writable, true);
  } finally { backend.close(); }
});

test('created memory survives backend close and reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-write-spike-'));
  const databasePath = join(dir, 'memory.sqlite');
  try {
    const first = createDemoMemoryBackend({ databasePath });
    first.create({ id: 'test-123', content: 'persistent write spike' });
    first.close();
    const second = createDemoMemoryBackend({ databasePath });
    try {
      assert.equal(second.get('test-123')?.item?.content, 'persistent write spike');
      assert.equal(second.status().persistence, 'file-backed');
    } finally { second.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('old database initializes append-only event schema without losing memory items', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-migration-'));
  const databasePath = join(dir, 'memory.sqlite');
  try {
    const old = new DatabaseSync(databasePath);
    old.exec(`
      CREATE TABLE memory_items (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO memory_items VALUES ('legacy-001','global','context','legacy content','legacy','2026-09-28T00:00:00.000Z');
    `);
    old.close();

    const first = createDemoMemoryBackend({ databasePath });
    assert.equal(first.get('legacy-001')?.item?.content, 'legacy content');
    assert.equal(first.status().events, 0);
    first.close();

    const second = createDemoMemoryBackend({ databasePath });
    second.close();

    const inspect = new DatabaseSync(databasePath);
    const eventTable = inspect.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_events'").get();
    const successorIndex = inspect.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='memory_events_one_successor'").get();
    assert.equal(eventTable?.name, 'memory_events');
    assert.equal(successorIndex?.name, 'memory_events_one_successor');
    assert.equal(inspect.prepare("SELECT content FROM memory_items WHERE id='legacy-001'").get()?.content, 'legacy content');
    inspect.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('revision preserves old item and current search hides historical versions', () => {
  const backend = createDemoMemoryBackend();
  try {
    const original = backend.create({ id: 'rev-old', content: 'cloudflare old statement' });
    assert.equal(original.id, 'rev-old');

    const revised = backend.revise({
      id: 'rev-old',
      content: 'cloudflare new statement',
      reason: 'knowledge changed',
      newId: 'rev-new'
    });

    assert.equal(revised.revised, true);
    assert.equal(revised.previous.id, 'rev-old');
    assert.equal(revised.previous.content, 'cloudflare old statement');
    assert.equal(revised.current.id, 'rev-new');
    assert.equal(revised.current.content, 'cloudflare new statement');
    assert.deepEqual(revised.relation, { type: 'revision', from: 'rev-old', to: 'rev-new' });

    const oldDescriptor = backend.get('rev-old');
    assert.equal(oldDescriptor.item.content, 'cloudflare old statement');
    assert.equal(oldDescriptor.state.current, false);
    assert.equal(oldDescriptor.state.supersededBy, 'rev-new');
    assert.equal(oldDescriptor.state.supersessionType, 'revision');

    const newDescriptor = backend.get('rev-new');
    assert.equal(newDescriptor.item.content, 'cloudflare new statement');
    assert.equal(newDescriptor.state.current, true);
    assert.equal(newDescriptor.state.revisedFrom, 'rev-old');

    assert.deepEqual(backend.search('cloudflare old', 5), []);
    assert.deepEqual(backend.search('cloudflare', 5).map((entry) => entry.item.id), ['rev-new']);

    const audit = backend.search('cloudflare old', 5, true);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].item.id, 'rev-old');
    assert.equal(audit[0].state.current, false);
  } finally {
    backend.close();
  }
});

test('confirmation is append-only repeatable and may target historical memory', () => {
  const backend = createDemoMemoryBackend();
  try {
    backend.create({ id: 'confirm-old', content: 'old fact' });
    backend.revise({ id: 'confirm-old', content: 'new fact', newId: 'confirm-new' });

    const first = backend.confirm({ id: 'confirm-new', note: 'checked once' });
    const second = backend.confirm({ id: 'confirm-new', note: 'checked twice' });
    const historical = backend.confirm({ id: 'confirm-old', note: 'historical audit' });

    assert.equal(first.confirmed, true);
    assert.equal(first.confirmationCount, 1);
    assert.equal(second.confirmationCount, 2);
    assert.equal(backend.get('confirm-new').state.confirmationCount, 2);
    assert.equal(historical.confirmationCount, 1);
    assert.equal(backend.get('confirm-old').state.current, false);
    assert.equal(backend.get('confirm-old').state.confirmationCount, 1);
  } finally { backend.close(); }
});

test('supersede links existing current memories and rejects invalid history graphs', () => {
  const backend = createDemoMemoryBackend();
  try {
    backend.create({ id: 'sup-a', content: 'first' });
    backend.create({ id: 'sup-b', content: 'second' });
    backend.create({ id: 'sup-c', content: 'third' });

    assert.throws(
      () => backend.supersede({ oldId: 'sup-a', newId: 'sup-a' }),
      (error) => error?.code === 'memory_same_id'
    );

    const linked = backend.supersede({ oldId: 'sup-a', newId: 'sup-b', reason: 'new source' });
    assert.equal(linked.superseded, true);
    assert.deepEqual(linked.relation, { type: 'supersede', from: 'sup-a', to: 'sup-b' });
    assert.equal(backend.get('sup-a').state.current, false);
    assert.equal(backend.get('sup-a').state.supersededBy, 'sup-b');
    assert.equal(backend.get('sup-b').state.supersededFrom, 'sup-a');

    assert.throws(
      () => backend.supersede({ oldId: 'sup-a', newId: 'sup-c' }),
      (error) => error?.code === 'memory_not_current'
    );

    assert.throws(
      () => backend.supersede({ oldId: 'sup-b', newId: 'sup-a' }),
      (error) => error?.code === 'memory_cycle_detected'
    );
  } finally { backend.close(); }
});

test('decision record persists structured rationale and duplicate id leaves no partial event', () => {
  const backend = createDemoMemoryBackend();
  try {
    const before = backend.status();
    const result = backend.recordDecision({
      id: 'decision-001',
      decision: 'Use D1',
      rationale: 'Remote durable SQL-like storage',
      alternatives: ['local sqlite', 'postgres'],
      context: 'durability spike',
      scope: 'project:persistent-memory'
    });

    assert.equal(result.recorded, true);
    assert.equal(result.item.id, 'decision-001');
    assert.equal(result.item.kind, 'decision');
    assert.equal(result.item.content, 'Use D1');
    assert.deepEqual(result.decision, {
      rationale: 'Remote durable SQL-like storage',
      alternatives: ['local sqlite', 'postgres'],
      context: 'durability spike'
    });

    const read = backend.get('decision-001');
    assert.equal(read.item.scope, 'project:persistent-memory');
    assert.deepEqual(read.state.decision, result.decision);
    assert.equal(backend.status().events, before.events + 1);

    const eventsBeforeConflict = backend.status().events;
    assert.throws(
      () => backend.recordDecision({
        id: 'decision-001',
        decision: 'Duplicate',
        rationale: 'Should fail'
      }),
      (error) => error?.code === 'memory_id_conflict'
    );
    assert.equal(backend.status().events, eventsBeforeConflict);
    assert.equal(backend.get('decision-001').item.content, 'Use D1');
  } finally { backend.close(); }
});

test('malformed stored decision metadata returns deterministic semantic error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-decision-corrupt-'));
  const databasePath = join(dir, 'memory.sqlite');
  try {
    const backend = createDemoMemoryBackend({ databasePath });
    backend.recordDecision({ id: 'decision-bad', decision: 'A', rationale: 'because' });
    backend.close();

    const mutate = new DatabaseSync(databasePath);
    mutate.prepare("UPDATE memory_events SET metadata_json = '{bad-json' WHERE memory_id = 'decision-bad' AND type = 'decision_recorded'").run();
    mutate.close();

    const reopened = createDemoMemoryBackend({ databasePath });
    try {
      assert.throws(
        () => reopened.get('decision-bad'),
        (error) => error?.code === 'memory_metadata_invalid' && !error.message.includes('{bad-json')
      );
    } finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('duplicate revision newId rolls back without relation event', () => {
  const backend = createDemoMemoryBackend();
  try {
    backend.create({ id: 'dup-old', content: 'old' });
    backend.create({ id: 'dup-existing', content: 'existing' });
    const before = backend.status();

    assert.throws(
      () => backend.revise({ id: 'dup-old', content: 'new', newId: 'dup-existing' }),
      (error) => error?.code === 'memory_id_conflict'
    );

    assert.equal(backend.status().events, before.events);
    assert.equal(backend.get('dup-old').state.current, true);
    assert.equal(backend.get('dup-existing').item.content, 'existing');
  } finally { backend.close(); }
});

test('close and reopen preserves semantic items events confirmations and decision metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-semantic-reopen-'));
  const databasePath = join(dir, 'memory.sqlite');
  try {
    const first = createDemoMemoryBackend({ databasePath });
    first.create({ id: 'persist-old', content: 'before' });
    first.revise({ id: 'persist-old', content: 'after', newId: 'persist-new' });
    first.confirm({ id: 'persist-new', note: 'verified' });
    first.recordDecision({
      id: 'persist-decision',
      decision: 'Keep history',
      rationale: 'Auditability',
      alternatives: ['overwrite']
    });
    const firstStatus = first.status();
    first.close();

    const second = createDemoMemoryBackend({ databasePath });
    try {
      assert.equal(second.get('persist-old').state.supersededBy, 'persist-new');
      assert.equal(second.get('persist-new').state.confirmationCount, 1);
      assert.deepEqual(second.get('persist-decision').state.decision, {
        rationale: 'Auditability',
        alternatives: ['overwrite']
      });
      assert.equal(second.status().events, firstStatus.events);
    } finally { second.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
