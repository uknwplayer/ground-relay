import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDemoMemoryBackend } from './memory-backend.js';
import { createMemoryOperations } from './memory-service.js';
import { PROBE_IDS, runSemanticRestartProbe } from './semantic-restart-probe.js';

function toolCaller(backend) {
  const operations = createMemoryOperations(backend);
  return async (name, args) => operations[name](args);
}

test('first semantic restart probe seeds fixed append-only history through tool operations', async () => {
  const backend = createDemoMemoryBackend();
  try {
    const result = await runSemanticRestartProbe(toolCaller(backend));
    assert.equal(result.ok, true);
    assert.equal(result.preexisting, false);
    assert.equal(result.seeded, true);
    assert.equal(result.revision, true);
    assert.equal(result.confirmation, true);
    assert.equal(result.supersession, true);
    assert.equal(result.decision, true);
    assert.equal(result.currentSearch, true);
    assert.equal(result.historySearch, true);
    assert.deepEqual(result.ids, PROBE_IDS);
    assert.equal(backend.get(PROBE_IDS.old).state.supersededBy, PROBE_IDS.current);
    assert.equal(backend.get(PROBE_IDS.current).state.confirmationCount, 1);
    assert.equal(backend.get(PROBE_IDS.supersedeOld).state.supersededBy, PROBE_IDS.supersedeCurrent);
    assert.equal(backend.get(PROBE_IDS.decision).item.kind, 'decision');
  } finally {
    backend.close();
  }
});

test('second semantic restart probe after reopen verifies preexisting state without new writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'semantic-restart-probe-'));
  const databasePath = join(dir, 'memory.sqlite');
  try {
    const first = createDemoMemoryBackend({ databasePath });
    const seeded = await runSemanticRestartProbe(toolCaller(first));
    const eventsAfterFirst = first.status().events;
    first.close();

    const second = createDemoMemoryBackend({ databasePath });
    try {
      const verified = await runSemanticRestartProbe(toolCaller(second));
      assert.equal(seeded.preexisting, false);
      assert.equal(verified.ok, true);
      assert.equal(verified.preexisting, true);
      assert.equal(verified.seeded, false);
      assert.equal(verified.revision, true);
      assert.equal(verified.confirmation, true);
      assert.equal(verified.supersession, true);
      assert.equal(verified.decision, true);
      assert.equal(verified.currentSearch, true);
      assert.equal(verified.historySearch, true);
      assert.equal(second.status().events, eventsAfterFirst);
    } finally {
      second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
