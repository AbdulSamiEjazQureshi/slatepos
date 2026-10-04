import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

/** PGlite is single-process. Two dev servers sharing its directory corrupt WAL. */
export function acquirePgliteLock(directory: string): () => void {
  const path = `${directory}.lock`;
  const owner = `${process.pid}\n`;
  const acquire = () => {
    const descriptor = openSync(path, 'wx');
    try {
      writeFileSync(descriptor, owner);
    } finally {
      closeSync(descriptor);
    }
  };
  try {
    acquire();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const pid = Number(readFileSync(path, 'utf8').trim());
    let alive = true;
    if (Number.isSafeInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
      } catch (probe) {
        alive = (probe as NodeJS.ErrnoException).code !== 'ESRCH';
      }
    }
    if (alive)
      throw new Error(
        `Embedded database is already in use (PID ${pid}). Stop the other API, migration or seed process, or choose another PGLITE_DIR.`
      );
    unlinkSync(path);
    acquire();
  }
  const release = () => {
    if (existsSync(path) && readFileSync(path, 'utf8') === owner) unlinkSync(path);
    process.off('exit', release);
  };
  process.once('exit', release);
  return release;
}
