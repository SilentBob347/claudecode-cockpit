import { describe, it, expect } from 'vitest';
import {
  sanitizedSpawnEnv,
  HOST_ONLY_ENV_KEYS,
} from './spawnEnv';

const BASE = {
  PATH: '/usr/bin',
  HOME: '/home/u',
  ANTHROPIC_API_KEY: 'sk-test',
  NODE_ENV: 'production',
  NEXT_DEPLOYMENT_ID: '',
  TURBOPACK: 'auto',
  PORT: '43457',
  COCKPIT_PORT: '43457',
} satisfies NodeJS.ProcessEnv;

describe('sanitizedSpawnEnv', () => {
  it('removes every host-only variable from project children', () => {
    const env = sanitizedSpawnEnv({}, BASE);
    for (const key of HOST_ONLY_ENV_KEYS) {
      expect(key in env, `${key} must not reach the child`).toBe(false);
    }
  });

  it('keeps the namespaced Cockpit port for CLI bridges', () => {
    expect(sanitizedSpawnEnv({}, BASE).COCKPIT_PORT).toBe('43457');
  });

  // COCKPIT_CWD is the session's own working directory, and skills use it wherever
  // something has to identify the session — delegation, the Bot write-lock owner
  // file, the status lookups keyed on cwd + sessionId. `pwd` cannot stand in: it
  // follows a `cd`, and Claude Code resets the shell's cwd between commands.
  it('carries the session identity a skill cannot work out for itself', () => {
    const env = sanitizedSpawnEnv({ COCKPIT_RUN_ID: 'run-1', COCKPIT_CWD: '/work/project' }, BASE);
    expect(env.COCKPIT_RUN_ID).toBe('run-1');
    expect(env.COCKPIT_CWD).toBe('/work/project');
  });

  it('omits an unknown cwd instead of exporting an empty one', () => {
    // Engines pass `ctx.cwd || undefined`: cwd is '' when unknown, and an exported
    // empty string would make `${COCKPIT_CWD:-$PWD}` look answered when it is not.
    expect('COCKPIT_CWD' in sanitizedSpawnEnv({ COCKPIT_CWD: undefined }, BASE)).toBe(false);
  });

  it('deletes rather than blanks — an empty string is not good enough', () => {
    // NEXT_DEPLOYMENT_ID arrives as "" and would still read as "set" downstream.
    const env = sanitizedSpawnEnv({}, BASE);
    expect(env.NEXT_DEPLOYMENT_ID).toBeUndefined();
    expect(Object.keys(env)).not.toContain('NEXT_DEPLOYMENT_ID');
  });

  it('passes everything else through untouched', () => {
    expect(sanitizedSpawnEnv({}, BASE)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/u',
      ANTHROPIC_API_KEY: 'sk-test',
      COCKPIT_PORT: '43457',
    });
  });

  it('applies overrides after stripping, so a caller can set a stripped key back', () => {
    expect(sanitizedSpawnEnv({ NODE_ENV: 'test' }, BASE).NODE_ENV).toBe('test');
    expect(sanitizedSpawnEnv({ PORT: '43457' }, BASE).PORT).toBe('43457');
  });

  it('treats an undefined override as a delete (empty string would break the SDK)', () => {
    const env = sanitizedSpawnEnv({ ANTHROPIC_AUTH_TOKEN: undefined }, {
      ...BASE,
      ANTHROPIC_AUTH_TOKEN: 'stale',
    });
    expect(Object.keys(env)).not.toContain('ANTHROPIC_AUTH_TOKEN');
  });

  it('never returns undefined values — the SDK types env as Record<string, string>', () => {
    const env = sanitizedSpawnEnv({}, { ...BASE, SOMETHING_UNSET: undefined });
    expect(Object.values(env).every((v) => typeof v === 'string')).toBe(true);
  });

  it('does not mutate the base env it was handed', () => {
    const base = { ...BASE };
    sanitizedSpawnEnv({ FORCE_COLOR: '0' }, base);
    expect(base).toEqual(BASE);
  });
});
