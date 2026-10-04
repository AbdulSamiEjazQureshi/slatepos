/** Minimal HS256 JWT implementation using Web Crypto (no external dependency). */

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

const fromBase64Url = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, 'base64url'));

const keyCache = new Map<string, Promise<CryptoKey>>();

const getKey = (secret: string): Promise<CryptoKey> => {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const created = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  keyCache.set(secret, created);
  return created;
};

export type JwtPayload = {
  sub: string;
  sid: string;
  tid: string | null;
  pa: boolean;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

export type JwtClaimsInput = {
  subject: string;
  sessionId: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  roles: string[];
};

export const signJwt = async (
  claims: JwtClaimsInput,
  secret: string,
  ttlSeconds: number,
  now: Date = new Date()
): Promise<{ token: string; expiresIn: number }> => {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: JwtPayload = {
    sub: claims.subject,
    sid: claims.sessionId,
    tid: claims.tenantId,
    pa: claims.isPlatformAdmin,
    roles: claims.roles,
    iat,
    exp: iat + ttlSeconds,
    iss: 'roms-api',
    aud: 'roms-clients'
  };
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await getKey(secret),
    encoder.encode(signingInput)
  );
  return {
    token: `${signingInput}.${toBase64Url(new Uint8Array(signature))}`,
    expiresIn: ttlSeconds
  };
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return mismatch === 0;
};

export type VerifyResult =
  | { valid: true; payload: JwtPayload }
  | { valid: false; reason: 'malformed' | 'invalid_signature' | 'expired' };

export const verifyJwt = async (
  token: string,
  secret: string,
  now: Date = new Date()
): Promise<VerifyResult> => {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [header, body, signature] = parts as [string, string, string];
  const signingInput = `${header}.${body}`;
  let expected: Uint8Array;
  try {
    expected = new Uint8Array(
      await crypto.subtle.sign('HMAC', await getKey(secret), encoder.encode(signingInput))
    );
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!timingSafeEqual(expected, fromBase64Url(signature))) {
    return { valid: false, reason: 'invalid_signature' };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
    if (payload.exp * 1000 <= now.getTime()) return { valid: false, reason: 'expired' };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'malformed' };
  }
};
