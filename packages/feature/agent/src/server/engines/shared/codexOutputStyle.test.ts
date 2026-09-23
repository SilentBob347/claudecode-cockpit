import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncCodexOutputStyle, wrapCodexOutputStyle } from './codexOutputStyle';

let dir: string;
let file: string;

const dev = (texts: string[]) =>
  JSON.stringify({
    type: 'response_item',
    payload: { type: 'message', role: 'developer', content: texts.map((text) => ({ type: 'input_text', text })) },
  });
const meta = JSON.stringify({ type: 'session_meta', payload: { id: 't', cwd: '/x' } });
const user = JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] } });

const write = (lines: string[]) => fs.writeFileSync(file, lines.join('\n') + '\n');
const firstDevTexts = () => {
  const line = fs.readFileSync(file, 'utf-8').split('\n').find((l) => l.includes('"developer"'))!;
  return (JSON.parse(line).payload.content as Array<{ text: string }>).map((c) => c.text);
};

beforeEach(() => {
  dir = fs.mkdtempSync(join(os.tmpdir(), 'codex-style-'));
  file = join(dir, 'rollout.jsonl');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('syncCodexOutputStyle', () => {
  it('inserts into the first developer message when absent', () => {
    write([meta, dev(['<skills/>']), dev(['<other/>']), user]);
    expect(syncCodexOutputStyle(file, 'Be brief.')).toBe('inserted');
    expect(firstDevTexts()).toEqual([wrapCodexOutputStyle('Be brief.'), '<skills/>']);
  });

  it('does not touch the file when already in step', () => {
    write([meta, dev([wrapCodexOutputStyle('Be brief.'), '<skills/>']), user]);
    const before = fs.statSync(file).mtimeMs;
    const content = fs.readFileSync(file, 'utf-8');
    expect(syncCodexOutputStyle(file, 'Be brief.')).toBe('unchanged');
    expect(fs.readFileSync(file, 'utf-8')).toBe(content);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('replaces a different style and removes it when none is selected', () => {
    write([meta, dev([wrapCodexOutputStyle('Old.'), '<skills/>']), user]);
    expect(syncCodexOutputStyle(file, 'New.')).toBe('updated');
    expect(firstDevTexts()).toEqual([wrapCodexOutputStyle('New.'), '<skills/>']);
    expect(syncCodexOutputStyle(file, undefined)).toBe('removed');
    expect(firstDevTexts()).toEqual(['<skills/>']);
    expect(syncCodexOutputStyle(file, undefined)).toBe('unchanged');
  });

  it('rewrites marked copies elsewhere (e.g. a compaction record)', () => {
    const compacted = JSON.stringify({
      type: 'compacted',
      payload: { replacement_history: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: wrapCodexOutputStyle('Old.') }] }] },
    });
    write([meta, dev([wrapCodexOutputStyle('Old.')]), user, compacted]);
    expect(syncCodexOutputStyle(file, 'New.')).toBe('updated');
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).not.toContain('Old.');
    expect(text.split('New.').length - 1).toBe(2);
  });

  it('leaves a rollout without a developer message alone', () => {
    write([meta, user]);
    expect(syncCodexOutputStyle(file, 'Be brief.')).toBe('no-anchor');
  });
});
