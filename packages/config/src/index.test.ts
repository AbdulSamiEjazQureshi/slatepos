import { describe, expect, test } from 'bun:test';
import { loadConfig, parseEnvFile } from './index';

describe('config', () => {
  test('applies defaults for an otherwise valid environment', () => {
    const config = loadConfig({ JWT_SECRET: 'x'.repeat(24) });
    expect(config.env).toBe('development');
    expect(config.api.port).toBe(3000);
    expect(config.database.driver).toBe('pglite');
    expect(config.auth.accessTokenTtl).toBe(900);
    expect(config.api.corsOrigins).toEqual(['http://localhost:5173']);
  });

  test('fails fast when required secrets are missing', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment configuration/);
  });

  test('splits comma-separated CORS origins', () => {
    const config = loadConfig({
      JWT_SECRET: 'x'.repeat(24),
      CORS_ORIGINS: 'https://a.test, https://b.test'
    });
    expect(config.api.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  test('parses .env files, ignoring comments and stripping quotes', () => {
    expect(parseEnvFile('A=1\n# comment\nB="two"\nC=\n')).toEqual({ A: '1', B: 'two', C: '' });
  });
});
