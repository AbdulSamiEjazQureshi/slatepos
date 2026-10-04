import { randomUUID } from 'node:crypto';

/** Generate a globally unique identifier (UUID v4). */
export const newId = (): string => randomUUID();

/** Encode a monotonic-ish sortable id for cursors (timestamp + random). */
const base32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const encodeTime = (time: number, length: number): string => {
  let out = '';
  let remaining = time;
  for (let i = length - 1; i >= 0; i -= 1) {
    const mod = remaining % 32;
    out = base32[mod] + out;
    remaining = (remaining - mod) / 32;
  }
  return out;
};

const encodeRandom = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += base32[byte % 32];
  return out;
};

/** ULID — lexicographically sortable identifier useful for cursors/job ids. */
export const newUlid = (): string => `${encodeTime(Date.now(), 10)}${encodeRandom(16)}`;

export const isUlid = (value: string): boolean =>
  value.length === 26 && [...value].every((char) => base32.includes(char));

/** URL-friendly slug, safe for tenant/branch identifiers. */
export const slugify = (input: string): string =>
  input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
