/**
 * Password hashing with Argon2id via Bun's native implementation.
 * Bun.password is backed by a hardened Argon2 implementation — no native
 * module to compile, and it never leaves the process.
 */

const ARGON2_OPTIONS = {
  algorithm: 'argon2id',
  memoryCost: 19_456, // 19 MiB (OWASP minimum)
  timeCost: 2
} as const;

export const hashPassword = (password: string): Promise<string> =>
  Bun.password.hash(password, ARGON2_OPTIONS);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  Bun.password.verify(password, hash);
