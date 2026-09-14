import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkOriginGate, hostnameOfHostHeader, type OriginGateInput } from './auth';

const local = (over: Partial<OriginGateInput>): OriginGateInput => ({
  method: 'GET',
  host: 'localhost:3456',
  origin: undefined,
  remoteAddr: '127.0.0.1',
  forwarded: undefined,
  isWs: false,
  ...over,
});

// The runner may itself live inside a token-mode cockpit: pin the env per test.
beforeEach(() => {
  delete process.env.COCKPIT_ALLOWED_HOSTS;
  delete process.env.COCKPIT_TOKEN;
});
afterEach(() => {
  delete process.env.COCKPIT_ALLOWED_HOSTS;
  delete process.env.COCKPIT_TOKEN;
});

describe('hostnameOfHostHeader', () => {
  it('strips ports and IPv6 brackets', () => {
    expect(hostnameOfHostHeader('localhost:3456')).toBe('localhost');
    expect(hostnameOfHostHeader('127.0.0.1')).toBe('127.0.0.1');
    expect(hostnameOfHostHeader('[::1]:3457')).toBe('::1');
    expect(hostnameOfHostHeader(undefined)).toBeNull();
  });
});

describe('checkOriginGate — DNS rebinding (Host)', () => {
  it('passes loopback names from a local peer', () => {
    for (const host of ['localhost:3456', '127.0.0.1:3457', '[::1]:3456', 'app.localhost:3456']) {
      expect(checkOriginGate(local({ host })).action).toBe('pass');
    }
  });

  it('denies a foreign Host from a local peer, even on GET', () => {
    expect(checkOriginGate(local({ host: 'evil.example:3456' })).action).toBe('deny');
    expect(checkOriginGate(local({ host: undefined })).action).toBe('deny');
  });

  it('honours COCKPIT_ALLOWED_HOSTS', () => {
    process.env.COCKPIT_ALLOWED_HOSTS = 'cockpit.test, other.test';
    expect(checkOriginGate(local({ host: 'cockpit.test:3456' })).action).toBe('pass');
  });

  it('does not let a client-supplied forwarding header bypass the Host check (token mode off)', () => {
    // DNS rebinding: same-origin to evil.example, so the page can add X-Forwarded-For freely.
    expect(checkOriginGate(local({ host: 'evil.example:3456', forwarded: '1.2.3.4' })).action).toBe('deny');
    expect(
      checkOriginGate(local({ method: 'POST', host: 'evil.example:3456', origin: 'http://evil.example:3456', forwarded: '1.2.3.4' })).action,
    ).toBe('deny');
  });

  it('defers forwarded requests to the token gate when token mode is on', () => {
    process.env.COCKPIT_TOKEN = 'test-token';
    expect(checkOriginGate(local({ host: 'abc.ngrok.app', forwarded: '1.2.3.4' })).action).toBe('pass');
    // Without a forwarding header the loopback peer is token-exempt, so Host still applies.
    expect(checkOriginGate(local({ host: 'evil.example:3456' })).action).toBe('deny');
  });

  it('lets a token-less tunnel through only via COCKPIT_ALLOWED_HOSTS', () => {
    process.env.COCKPIT_ALLOWED_HOSTS = 'abc.ngrok.app';
    expect(checkOriginGate(local({ host: 'abc.ngrok.app', forwarded: '1.2.3.4' })).action).toBe('pass');
  });

  it('does not check Host for non-loopback peers (explicit LAN exposure)', () => {
    expect(checkOriginGate(local({ host: '192.168.1.9:3457', remoteAddr: '192.168.1.20' })).action).toBe('pass');
  });
});

describe('checkOriginGate — CSRF (Origin)', () => {
  it('passes a same-origin POST', () => {
    const d = checkOriginGate(local({ method: 'POST', origin: 'http://localhost:3456' }));
    expect(d.action).toBe('pass');
  });

  it('passes a POST with no Origin (curl, CLI, skills)', () => {
    expect(checkOriginGate(local({ method: 'POST' })).action).toBe('pass');
  });

  it('denies a cross-site POST', () => {
    expect(checkOriginGate(local({ method: 'POST', origin: 'https://evil.example' })).action).toBe('deny');
    expect(checkOriginGate(local({ method: 'POST', origin: 'http://127.0.0.1:3456' })).action).toBe('deny');
  });

  it('denies Origin: null and garbage', () => {
    expect(checkOriginGate(local({ method: 'POST', origin: 'null' })).action).toBe('deny');
    expect(checkOriginGate(local({ method: 'DELETE', origin: 'not a url' })).action).toBe('deny');
  });

  it('ignores Origin on safe methods', () => {
    expect(checkOriginGate(local({ method: 'GET', origin: 'https://evil.example' })).action).toBe('pass');
  });

  it('applies the Origin rule to WebSocket upgrades', () => {
    expect(checkOriginGate(local({ isWs: true, origin: 'https://evil.example' })).action).toBe('deny');
    expect(checkOriginGate(local({ isWs: true, origin: 'http://localhost:3456' })).action).toBe('pass');
  });
});
