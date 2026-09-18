/**
 * Two halves: the invariants the shipped `bots/` directory carries alone (no
 * TypeScript list enforces them any more), and the scan's behaviour on the
 * malformed cases, checked against a throwaway COCKPIT_ROOT.
 *
 * COCKPIT_ROOT *and* COCKPIT_HOME are pinned before the import, because paths.ts
 * resolves both once at module load. COCKPIT_ROOT because a Cockpit-spawned
 * agent inherits the *installed* package's, which would point this test at a
 * different checkout entirely — and COCKPIT_HOME because listing a built-in now
 * installs it, and a test must never write into the developer's real ~/.cockpit.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = process.cwd();
const HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-bots-home-')));
process.env.COCKPIT_ROOT = REPO_ROOT;
process.env.COCKPIT_HOME = HOME;

type Mod = typeof import('./builtinBots');
let mod: Mod;

beforeAll(async () => {
  mod = await import('./builtinBots');
});

afterAll(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe('shipped bots/ directory', () => {
  it('installs cockpit-helper under COCKPIT_HOME and lists it from there', () => {
    // The install root is root-owned under `npm i -g` and replaced on upgrade,
    // so the path the panel shows and the folder button opens must be the user's
    // own copy — never …/node_modules/@surething/cockpit/bots/cockpit-helper.
    const bots = mod.listBuiltinBots();
    const helper = bots.find((b) => b.name === 'cockpit-helper');
    expect(helper).toBeDefined();
    expect(helper!.path).toBe(path.join(HOME, 'bots', 'cockpit-helper'));
    expect(helper!.id).toBe('builtin:cockpit-helper');
    expect(helper!.builtin).toBe(true);
    // Never "added": the panel must not render an install-time date for these.
    expect(helper!.addedAt).toBe('');
    // The whole tree comes across, not just the manifest.
    expect(fs.existsSync(path.join(helper!.path, 'identity', 'persona.md'))).toBe(true);
  });

  it('every built-in: frontmatter name matches its directory name', () => {
    // The directory name is the id, the installed folder name and the path; `name`
    // is what `@name` dispatches. If they disagree the Bot is still reachable, but
    // under a name that has no obvious relationship to the folder someone is editing.
    const mismatched = mod
      .listBuiltinBots()
      .filter((b) => b.id !== `builtin:${path.basename(b.path)}` || b.name !== path.basename(b.path));
    expect(mismatched.map((b) => b.path)).toEqual([]);
  });

  it('every built-in: has a description for the @ autocomplete', () => {
    const missing = mod.listBuiltinBots().filter((b) => !(b.valid && b.description));
    expect(missing.map((b) => b.name)).toEqual([]);
  });

  it('ignores README.md, which is a file rather than a Bot directory', () => {
    expect(mod.listBuiltinBots().map((b) => b.name)).not.toContain('README');
  });
});

describe('scan behaviour', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-bots-')));
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-bots-home-')));
  const userDir = (name: string) => path.join(home, 'bots', name);
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
    process.env.COCKPIT_HOME = home;
    scoped = await import('./builtinBots');
    process.env.COCKPIT_ROOT = REPO_ROOT;
    process.env.COCKPIT_HOME = HOME;
  });

  // The whole Bot folder, bookkeeping file included: each test starts from
  // "nothing has ever been installed".
  afterEach(() => {
    fs.rmSync(path.join(home, 'bots'), { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
    vi.resetModules();
  });

  it('lists only directories holding a parseable BOT.md, and installs those', () => {
    // 'broken' is omitted rather than listed invalid: nobody can fix or remove a
    // malformed *shipped* Bot from the UI, so a red card would be permanent noise.
    // 'plain-dir' is not a Bot at all and must not be copied into the user's
    // Bot folder as one.
    expect(scoped.listBuiltinBots().map((b) => b.name)).toEqual(['good']);
    const installed = fs.readdirSync(path.join(home, 'bots')).filter((name) => !name.startsWith('.'));
    expect(installed).toEqual(['good']);
  });

  it('keeps the installed copy as it is while the shipped one has not changed', () => {
    scoped.listBuiltinBots();
    fs.writeFileSync(path.join(userDir('good'), 'BOT.md'), '---\nname: good\ndescription: Edited by hand\n---\n');
    fs.writeFileSync(path.join(userDir('good'), 'memory.md'), 'kept');

    const again = scoped.listBuiltinBots();
    expect(again[0].valid && again[0].description).toBe('Edited by hand');
    expect(fs.readFileSync(path.join(userDir('good'), 'memory.md'), 'utf-8')).toBe('kept');
  });

  it('refreshes an untouched copy when a newer version ships', () => {
    // The whole objection to copying a built-in out of the install is that the
    // copy stops receiving updates. It does not: nobody edited this one, so an
    // upgrade reaches it.
    scoped.listBuiltinBots();
    makeDir('good', '---\nname: good\ndescription: Fine, and now better\n---\n');
    try {
      const again = scoped.listBuiltinBots();
      expect(again[0].valid && again[0].description).toBe('Fine, and now better');
    } finally {
      makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    }
  });

  it('never refreshes a file the user has edited, however new the shipped one is', () => {
    scoped.listBuiltinBots();
    fs.writeFileSync(path.join(userDir('good'), 'BOT.md'), '---\nname: good\ndescription: Mine\n---\n');
    makeDir('good', '---\nname: good\ndescription: Fine, and now better\n---\n');
    try {
      // Reverting a file the user has been teaching is data loss, and an upgrade
      // is the last moment it would be noticed.
      const again = scoped.listBuiltinBots();
      expect(again[0].valid && again[0].description).toBe('Mine');

      // And it stays that way for every later version, not just this one.
      makeDir('good', '---\nname: good\ndescription: Newer still\n---\n');
      const third = scoped.listBuiltinBots();
      expect(third[0].valid && third[0].description).toBe('Mine');
    } finally {
      makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    }
  });

  it('keeps maintaining the shipped files of a Bot that has written memory', () => {
    // The reason tracking is per file. A Bot with memory writes into its own
    // directory on an ordinary turn; judging the tree as a whole would read the
    // first remembered fact as "the user has taken this over" and cut the Bot off
    // from every later BOT.md fix, silently and for good.
    scoped.listBuiltinBots();
    fs.mkdirSync(path.join(userDir('good'), 'memory'), { recursive: true });
    fs.writeFileSync(path.join(userDir('good'), 'memory', 'facts.md'), '## A fact\n');
    makeDir('good', '---\nname: good\ndescription: Fine, and now better\n---\n');
    try {
      const again = scoped.listBuiltinBots();
      expect(again[0].valid && again[0].description).toBe('Fine, and now better');
      // …and the memory survives the update, which is the other half of it.
      expect(fs.readFileSync(path.join(userDir('good'), 'memory', 'facts.md'), 'utf-8')).toBe('## A fact\n');
    } finally {
      makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    }
  });

  it('edits to one shipped file do not freeze the others', () => {
    fs.writeFileSync(path.join(root, 'bots', 'good', 'notes.md'), 'v1\n');
    try {
      scoped.listBuiltinBots();
      fs.writeFileSync(path.join(userDir('good'), 'notes.md'), 'mine\n');
      makeDir('good', '---\nname: good\ndescription: Fine, and now better\n---\n');
      fs.writeFileSync(path.join(root, 'bots', 'good', 'notes.md'), 'v2\n');

      const again = scoped.listBuiltinBots();
      expect(again[0].valid && again[0].description).toBe('Fine, and now better');
      expect(fs.readFileSync(path.join(userDir('good'), 'notes.md'), 'utf-8')).toBe('mine\n');
    } finally {
      fs.rmSync(path.join(root, 'bots', 'good', 'notes.md'), { force: true });
      makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    }
  });

  it('installs a file a later version adds, and removes one it drops', () => {
    scoped.listBuiltinBots();
    fs.mkdirSync(path.join(root, 'bots', 'good', 'identity'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bots', 'good', 'identity', 'persona.md'), 'who\n');
    try {
      scoped.listBuiltinBots();
      expect(fs.readFileSync(path.join(userDir('good'), 'identity', 'persona.md'), 'utf-8')).toBe('who\n');

      // Dropped upstream: an untouched copy of it must go too, or a file nobody
      // wrote lingers as a standing instruction to the Bot.
      fs.rmSync(path.join(root, 'bots', 'good', 'identity'), { recursive: true });
      scoped.listBuiltinBots();
      expect(fs.existsSync(path.join(userDir('good'), 'identity', 'persona.md'))).toBe(false);
      // …and the directory it emptied does not linger either.
      expect(fs.existsSync(path.join(userDir('good'), 'identity'))).toBe(false);
    } finally {
      fs.rmSync(path.join(root, 'bots', 'good', 'identity'), { recursive: true, force: true });
    }
  });

  it('defers the update while a Bot session holds the write lock', () => {
    scoped.listBuiltinBots();
    fs.mkdirSync(path.join(userDir('good'), '.locks', 'write'), { recursive: true });
    makeDir('good', '---\nname: good\ndescription: Fine, and now better\n---\n');
    try {
      // The staged swap would drop whatever that session writes between our copy
      // and our rename. Nothing here is urgent enough to race a Bot mid-write.
      expect(scoped.listBuiltinBots()[0]).toMatchObject({ description: 'Fine' });

      fs.rmSync(path.join(userDir('good'), '.locks'), { recursive: true });
      expect(scoped.listBuiltinBots()[0]).toMatchObject({ description: 'Fine, and now better' });
    } finally {
      makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    }
  });

  it('leaves a copy it did not install alone', () => {
    // Someone's own folder that happens to share a name with a Bot a later
    // release ships. We did not put it there, so we do not overwrite it.
    fs.mkdirSync(userDir('good'), { recursive: true });
    fs.writeFileSync(path.join(userDir('good'), 'BOT.md'), '---\nname: good\ndescription: Not ours\n---\n');

    const bots = scoped.listBuiltinBots();
    expect(bots[0].valid && bots[0].description).toBe('Not ours');
  });

  it('reports an installed copy the user has broken instead of hiding it', () => {
    scoped.listBuiltinBots();
    fs.writeFileSync(path.join(userDir('good'), 'BOT.md'), '---\nname: NOT A NAME\n---\n');

    const [bot] = scoped.listBuiltinBots();
    // These are the user's own files, one folder-button click away, so the fix is
    // available to them — unlike a broken seed. Disappearing with no message is
    // the one thing an editable Bot must not do.
    expect(bot.valid).toBe(false);
    expect(bot.name).toBe('good');
    expect(bot.valid === false && bot.error).toMatch(/NOT A NAME/);
  });

  it('re-installs after the copy is deleted, so deleting is a reset', () => {
    scoped.listBuiltinBots();
    fs.writeFileSync(path.join(userDir('good'), 'BOT.md'), '---\nname: good\ndescription: Mine\n---\n');
    scoped.listBuiltinBots(); // notices the edit and stops managing the copy
    fs.rmSync(userDir('good'), { recursive: true, force: true });

    const [bot] = scoped.listBuiltinBots();
    // A reset is a full reset: the shipped version is back, and it tracks
    // upgrades again as it did on the first install.
    expect(bot.valid && bot.description).toBe('Fine');
    expect(fs.existsSync(path.join(userDir('good'), 'BOT.md'))).toBe(true);
    makeDir('good', '---\nname: good\ndescription: Fine, and now better\n---\n');
    try {
      expect(scoped.listBuiltinBots()[0]).toMatchObject({ description: 'Fine, and now better' });
    } finally {
      makeDir('good', '---\nname: good\ndescription: Fine\n---\n');
    }
  });

  it('ignores an empty leftover folder rather than serving a Bot with no BOT.md', () => {
    fs.mkdirSync(userDir('good'), { recursive: true });
    const [bot] = scoped.listBuiltinBots();
    expect(bot.valid && bot.description).toBe('Fine');
  });

  it('matches both of a built-in directories, so neither can be registered again', () => {
    scoped.listBuiltinBots();
    // The installed copy is what `list` reports…
    expect(scoped.findBuiltinBotByPath(userDir('good'))?.name).toBe('good');
    // …but the seed is still a path a user can paste into "Add bot", and a row
    // for it would render a second card for a Bot that is already listed.
    expect(scoped.findBuiltinBotByPath(path.join(root, 'bots', 'good'))?.name).toBe('good');
    expect(scoped.findBuiltinBotByPath(path.join(root, 'bots', 'plain-dir'))).toBeUndefined();
  });

  it('recognises built-in ids', () => {
    expect(scoped.isBuiltinBotId('builtin:good')).toBe(true);
    expect(scoped.isBuiltinBotId('bot-2545ac97')).toBe(false);
    expect(scoped.builtinBotNameFromId('builtin:good')).toBe('good');
    expect(scoped.builtinBotNameFromId('bot-2545ac97')).toBe('');
  });
});
