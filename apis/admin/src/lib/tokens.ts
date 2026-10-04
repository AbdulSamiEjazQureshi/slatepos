/** Opaque token helpers: refresh tokens and one-time codes are stored hashed. */

const randomBase64Url = (bytes: number): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString('base64url');
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(new Uint8Array(digest)).toString('hex');
};

export type IssuedToken = { token: string; hash: string };

/** 48 random bytes → URL-safe opaque refresh token. Only the hash is stored. */
export const issueRefreshToken = async (): Promise<IssuedToken> => {
  const token = randomBase64Url(48);
  return { token, hash: await sha256Hex(token) };
};

export const hashRefreshToken = (token: string): Promise<string> => sha256Hex(token);

/** Numeric OTP code for email/SMS verification. */
export const issueOtpCode = async (digits = 6): Promise<{ code: string; hash: string }> => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const code = String((buffer[0] ?? 0) % 10 ** digits).padStart(digits, '0');
  return { code, hash: await sha256Hex(code) };
};
