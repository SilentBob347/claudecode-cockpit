import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../functions/try.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
let calls = 0;
new Function('exports', 'fetch', compiled)(exports, () => {
  calls++;
  throw new Error('Tests must never create a sandbox');
});
const request = (path, ua = 'Mozilla/5.0', cookie = '') => exports.onRequest({
  request: new Request(`https://opencockpit.dev${path}`, { headers: { 'User-Agent': ua, Cookie: cookie } }),
  env: { E2B_API_KEY: 'test-only' },
});

test('Humans and crawlers can read the noindex confirmation without creating a sandbox', async () => {
  for (const ua of ['Mozilla/5.0', 'Googlebot', 'bingbot', 'Slackbot', '']) {
    for (const path of ['/try', '/try/']) {
      const response = await request(path, ua);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
      assert.match(response.headers.get('Cache-Control'), /no-store/);
      const html = await response.text();
      assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
      assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
      assert.match(html, /Start Demo/);
    }
  }
  assert.equal(calls, 0);
});
test('Bots remain blocked at sandbox creation for all confirmation values', async () => {
  for (const ua of ['Googlebot', 'bingbot', 'curl/8', '']) {
    for (const query of ['?confirm=1', '?confirm=0', '?confirm=']) {
      assert.equal((await request(`/try${query}`, ua)).status, 403);
    }
  }
  assert.equal(calls, 0);
});
test('Human sandbox creation retains the cooldown', async () => {
  const response = await request('/try?confirm=1', 'Mozilla/5.0', `cockpit_demo=${Date.now()}`);
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
});
