import pino, { type Logger } from 'pino';
import type { AppConfig } from '@roms/config';

export type { Logger };

/** Structured JSON logger. OpenTelemetry-friendly (plain objects, no strings). */
export const createLogger = (config: AppConfig): Logger =>
  pino({
    level: config.logLevel,
    base: { service: 'roms-api', env: config.env },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        'token',
        'refreshToken',
        'accessToken'
      ],
      remove: true
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });
