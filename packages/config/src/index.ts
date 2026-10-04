import { z } from 'zod';

export * from './env-file';

/** Environment schema. Fails fast at boot with a readable list of problems. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),

  DATABASE_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  PGLITE_DIR: z.string().default('.data/pglite'),
  DATABASE_URL: z.string().url().optional(),

  REDIS_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),

  EMAIL_PROVIDER: z.string().default('console'),
  EMAIL_PROVIDER_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('no-reply@roms.local'),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/storage'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),

  PUBLIC_API_URL: z.string().default('http://localhost:3000')
});

export type RawEnv = z.infer<typeof envSchema>;

export type AppConfig = {
  readonly env: RawEnv['NODE_ENV'];
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly logLevel: RawEnv['LOG_LEVEL'];
  readonly api: {
    readonly port: number;
    readonly host: string;
    readonly corsOrigins: string[];
  };
  readonly auth: {
    readonly jwtSecret: string;
    readonly accessTokenTtl: number;
    readonly refreshTokenTtl: number;
  };
  readonly database: {
    readonly driver: 'pglite' | 'postgres';
    readonly pgliteDir: string;
    readonly url?: string;
  };
  readonly redisUrl?: string;
  readonly email: {
    readonly provider: string;
    readonly key?: string;
    readonly from: string;
  };
  readonly storage: {
    readonly provider: 'local' | 's3';
    readonly localDir: string;
    readonly bucket?: string;
    readonly region?: string;
  };
  readonly publicApiUrl: string;
};

export type EnvInput = Record<string, string | undefined>;

const splitOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

/** Parse and normalise raw environment variables into `AppConfig`. */
export const loadConfig = (input: EnvInput = process.env): AppConfig => {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  const config: AppConfig = {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    logLevel: env.LOG_LEVEL,
    api: {
      port: env.API_PORT,
      host: env.API_HOST,
      corsOrigins: splitOrigins(env.CORS_ORIGINS)
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      accessTokenTtl: env.ACCESS_TOKEN_TTL,
      refreshTokenTtl: env.REFRESH_TOKEN_TTL
    },
    database: {
      driver: env.DATABASE_DRIVER,
      pgliteDir: env.PGLITE_DIR,
      ...(env.DATABASE_URL ? { url: env.DATABASE_URL } : {})
    },
    email: {
      provider: env.EMAIL_PROVIDER,
      ...(env.EMAIL_PROVIDER_KEY ? { key: env.EMAIL_PROVIDER_KEY } : {}),
      from: env.EMAIL_FROM
    },
    storage: {
      provider: env.STORAGE_PROVIDER,
      localDir: env.STORAGE_LOCAL_DIR,
      ...(env.STORAGE_BUCKET ? { bucket: env.STORAGE_BUCKET } : {}),
      ...(env.STORAGE_REGION ? { region: env.STORAGE_REGION } : {})
    },
    publicApiUrl: env.PUBLIC_API_URL
  };

  if (env.REDIS_URL) return { ...config, redisUrl: env.REDIS_URL };
  return config;
};
