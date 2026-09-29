import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveMemoryState,
  parseDecisionMetadata,
  wouldCreateCycle
} from './memory-semantics.js';

test('derive state marks outgoing successor as historical', () => {
  const state = deriveMemoryState({
    outgoing: [{
      type: 'revision',
      memoryId: 'mem-001',
      relatedMemoryId: 'mem-002',
      createdAt: '2026-09-29T12:00:00.000Z'
    }],
    incoming: [],
    confirmations: [
      { type: 'confirmation', createdAt: '2026-09-29T12:10:00.000Z' },
      { type: 'confirmation', createdAt: '2026-09-29T12:20:00.000Z' }
    ],
    decisionEvent: null
  });

  assert.deepEqual(state, {
    current: false,
    supersededBy: 'mem-002',
    supersessionType: 'revision',
    confirmationCount: 2,
    lastConfirmedAt: '2026-09-29T12:20:00.000Z'
  });
});

test('cycle detection follows successor chain', () => {
  const edges = [
    { type: 'revision', memoryId: 'A', relatedMemoryId: 'B' },
    { type: 'supersede', memoryId: 'B', relatedMemoryId: 'C' }
  ];

  assert.equal(wouldCreateCycle(edges, 'C', 'A'), true);
  assert.equal(wouldCreateCycle(edges, 'C', 'D'), false);
  assert.equal(wouldCreateCycle(edges, 'A', 'A'), true);
});

test('malformed decision metadata is deterministic', () => {
  assert.throws(
    () => parseDecisionMetadata('{bad-json'),
    (error) => error?.code === 'memory_metadata_invalid' && error.message === 'memory_metadata_invalid'
  );

  assert.throws(
    () => parseDecisionMetadata(JSON.stringify({ rationale: 123, alternatives: [] })),
    (error) => error?.code === 'memory_metadata_invalid'
  );
});

test('multiple incoming predecessors do not invent a single revisedFrom', () => {
  const state = deriveMemoryState({
    outgoing: [],
    incoming: [
      { type: 'revision', memoryId: 'old-a', relatedMemoryId: 'current' },
      { type: 'revision', memoryId: 'old-b', relatedMemoryId: 'current' }
    ],
    confirmations: [],
    decisionEvent: null
  });

  assert.equal(state.current, true);
  assert.equal('revisedFrom' in state, false);
  assert.equal('supersededFrom' in state, false);
});
