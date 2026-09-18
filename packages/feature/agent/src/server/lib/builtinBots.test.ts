/**
 * Two halves: the invariants the shipped `bots/` directory carries alone (no
 * TypeScript list enforces them any more), and the scan's behaviour on the
 * malformed cases, checked against a throwaway COCKPIT_ROOT.
 *
 * COCKPIT_ROOT is pinned before the import because paths.ts resolves the
 * directory once at module load — and a Cockpit-spawned agent inherits the
 * *installed* package's COCKPIT_ROOT, which would point this test at a
 * different checkout entirely.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = process.cwd();
process.env.COCKPIT_ROOT = REPO_ROOT;

type Mod = typeof import('./builtinBots');
let mod: Mod;

beforeAll(async () => {
  mod = await import('./builtinBots');
});

describe('shipped bots/ directory', () => {
  it('resolves to the repo bots/ dir and lists cockpit-helper', () => {
    const bots = mod.listBuiltinBots();
    const helper = bots.find((b) => b.name === 'cockpit-helper');
    expect(helper).toBeDefined();
    expect(helper!.path).toBe(path.join(REPO_ROOT, 'bots', 'cockpit-helper'));
    expect(helper!.id).toBe('builtin:cockpit-helper');
    expect(helper!.builtin).toBe(true);
    // Never "added": the panel must not render an install-time date for these.
    expect(helper!.addedAt).toBe('');
  });

  it('every built-in: frontmatter name matches its directory name', () => {
    // The directory name is the id and the path; `name` is what `@name`
    // dispatches. If they disagree the Bot is still reachable, but under a name
    // that has no obvious relationship to the folder someone is editing.
    const mismatched = mod
      .listBuiltinBots()
      .filter((b) => b.id !== `builtin:${path.basename(b.path)}` || b.name !== path.basename(b.path));
    expect(mismatched.map((b) => b.path)).toEqual([]);
  });

  it('every built-in: has a description for the @ autocomplete', () => {
    const missing = mod.listBuiltinBots().filter((b) => !(b.valid && b.description));
    expect(missing.map((b) => b.name)).toEqual([]);
  });

  it('every built-in: states the read-only rule in its BOT.md', () => {
    // A built-in that follows bot-turn's writing protocol would write into the
    // install root — refused under `npm i -g`, and wiped by the next upgrade.
    // The only thing standing between a Bot session and that is its own BOT.md.
    const silent = mod.listBuiltinBots().filter((b) => {
      const text = fs.readFileSync(path.join(b.path, 'BOT.md'), 'utf-8').toLowerCase();
      return !text.includes('read-only');
    });
    expect(silent.map((b) => b.name)).toEqual([]);
  });

  it('ignores README.md, which is a file rather than a Bot directory', () => {
    expect(mod.listBuiltinBots().map((b) => b.name)).not.toContain('README');
  });
});

describe('scan behaviour', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-bots-')));
  let scoped: Mod;

  const makeDir = (name: string, manifest?: string): string => {
    const dir = path.join(root, 'bots', name);
    fs.mkdirSync(dir, { recursive: true });
    if (manifest !== undefined) fs.writeFileSync(path.join(dir, 'BOT.md'), manifest);
    return dir;
  };

  beforeAll(async () => {
    makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    makeDir('plain-dir'); // no BOT.md
    makeDir('broken', '---\nname: NOT A NAME\n---\n');
    fs.writeFileSync(path.join(root, 'bots', 'README.md'), '# not a bot\n');
    vi.resetModules();
    process.env.COCKPIT_ROOT = root;
    scoped = await import('./builtinBots');
    process.env.COCKPIT_ROOT = REPO_ROOT;
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.resetModules();
  });

  it('lists only directories holding a parseable BOT.md', () => {
    // 'broken' is omitted rather than listed invalid: a built-in cannot be
    // removed or fixed from the UI, so a red card would be permanent noise.
    expect(scoped.listBuiltinBots().map((b) => b.name)).toEqual(['good']);
  });

  it('matches a directory by path, so the same one cannot be registered twice', () => {
    expect(scoped.findBuiltinBotByPath(path.join(root, 'bots', 'good'))?.name).toBe('good');
    expect(scoped.findBuiltinBotByPath(path.join(root, 'bots', 'plain-dir'))).toBeUndefined();
  });

  it('recognises built-in ids', () => {
    expect(scoped.isBuiltinBotId('builtin:good')).toBe(true);
    expect(scoped.isBuiltinBotId('bot-2545ac97')).toBe(false);
  });
});
