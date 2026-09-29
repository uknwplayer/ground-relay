import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDemoMemoryBackend } from './memory-backend.js';

test('backend creates a memory that can be read and searched', () => {
  const backend = createDemoMemoryBackend();
  try {
    const created = backend.create({ id: 'test-123', content: 'persistent write spike' });
    assert.equal(created.id, 'test-123');
    assert.equal(backend.get('test-123')?.content, 'persistent write spike');
    assert.equal(backend.search('write spike', 5)[0]?.id, 'test-123');
    assert.equal(backend.status().writable, true);
  } finally {
    backend.close();
  }
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
      assert.equal(second.get('test-123')?.content, 'persistent write spike');
      assert.equal(second.status().persistence, 'file-backed');
    } finally {
      second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
