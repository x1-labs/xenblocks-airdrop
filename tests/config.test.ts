import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config';

/**
 * Test the lockTimeoutSeconds config parsing.
 * We need minimal env vars set for loadConfig to not throw on unrelated fields.
 */

// Save and restore env between tests
const envBackup: Record<string, string | undefined> = {};
const REQUIRED_ENV = {
  AIRDROP_TRACKER_PROGRAM_ID: 'xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv',
  RPC_ENDPOINT: 'http://localhost:8899',
  KEYPAIR_PATH: '/tmp/test-keypair.json',
  XNM_TOKEN_MINT: '11111111111111111111111111111111',
  XBLK_TOKEN_MINT: '11111111111111111111111111111112',
  XUNI_TOKEN_MINT: '11111111111111111111111111111113',
  TOKEN_TYPES: 'xnm,xblk,xuni',
};

function setEnv(overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({
    ...REQUIRED_ENV,
    ...overrides,
  })) {
    process.env[key] = value;
  }
}

describe('lockTimeoutSeconds config', () => {
  beforeEach(() => {
    // Backup relevant env vars
    const keys = [
      ...Object.keys(REQUIRED_ENV),
      'LOCK_TIMEOUT_SECONDS',
      'DRY_RUN',
      'TOKEN_PROGRAM',
    ];
    for (const key of keys) {
      envBackup[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should default to 1800 when LOCK_TIMEOUT_SECONDS is not set', () => {
    setEnv();
    delete process.env.LOCK_TIMEOUT_SECONDS;

    const config = loadConfig();

    expect(config.lockTimeoutSeconds).toBe(1800n);
  });

  it('should parse LOCK_TIMEOUT_SECONDS from env', () => {
    setEnv({ LOCK_TIMEOUT_SECONDS: '600' });

    const config = loadConfig();

    expect(config.lockTimeoutSeconds).toBe(600n);
  });

  it('should accept minimum value (60)', () => {
    setEnv({ LOCK_TIMEOUT_SECONDS: '60' });

    const config = loadConfig();

    expect(config.lockTimeoutSeconds).toBe(60n);
  });

  it('should accept maximum value (3600)', () => {
    setEnv({ LOCK_TIMEOUT_SECONDS: '3600' });

    const config = loadConfig();

    expect(config.lockTimeoutSeconds).toBe(3600n);
  });

  it('should throw for value below 60', () => {
    setEnv({ LOCK_TIMEOUT_SECONDS: '30' });

    expect(() => loadConfig()).toThrow(
      'LOCK_TIMEOUT_SECONDS must be between 60 and 3600'
    );
  });

  it('should throw for value above 3600', () => {
    setEnv({ LOCK_TIMEOUT_SECONDS: '7200' });

    expect(() => loadConfig()).toThrow(
      'LOCK_TIMEOUT_SECONDS must be between 60 and 3600'
    );
  });
});
