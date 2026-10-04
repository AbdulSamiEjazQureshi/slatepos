import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquirePgliteLock } from './pglite-lock';

describe('embedded database ownership', () => {
  test('prevents simultaneous opens and releases cleanly', () => {
    const directory = mkdtempSync(join(tmpdir(), 'roms-lock-'));
    const path = join(directory, 'db');
    try {
      const release = acquirePgliteLock(path);
      expect(() => acquirePgliteLock(path)).toThrow('already in use');
      release();
      acquirePgliteLock(path)();
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
  test('recovers a lock left by a process that exited', () => {
    const directory = mkdtempSync(join(tmpdir(), 'roms-lock-'));
    try {
      const path = join(directory, 'db');
      writeFileSync(`${path}.lock`, '2147483647\n');
      acquirePgliteLock(path)();
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
