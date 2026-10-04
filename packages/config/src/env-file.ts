import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

/** Minimal `.env` parser: KEY=VALUE, `#` comments, optional surrounding quotes. */
export const parseEnvFile = (contents: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
};

/**
 * Walk up from `from` looking for a `.env` file, then apply it to `process.env`.
 * Existing environment variables always win, so real deployments are unaffected.
 */
export const loadNearestEnv = (from: string = process.cwd()): string | null => {
  let current = from;
  for (;;) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      const parsed = parseEnvFile(readFileSync(candidate, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return null;
    current = parent;
  }
};

/**
 * Resolve a relative path found in `.env` against the directory that holds that
 * file (the monorepo root), so dev artefacts like `.data/pglite` are shared
 * consistently no matter which workspace process is running.
 */
export const resolveFromEnvRoot = (value: string, envPath: string | null): string => {
  if (!envPath || isAbsolute(value)) return value;
  return resolve(dirname(envPath), value);
};
