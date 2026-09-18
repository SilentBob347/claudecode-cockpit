// Command-line resolution over a throwaway COCKPIT_HOME (paths.ts reads it at
// module load, so env is set before importing). COCKPIT_ROOT is pinned so the
// builtin skills come from this checkout.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-commands-'));
const cockpitHome = path.join(root, 'cockpit');
process.env.COCKPIT_HOME = cockpitHome;
process.env.COCKPIT_ROOT = process.cwd();

type Mod = typeof import('./slashCommands');
let resolveCommandPrompt: Mod['resolveCommandPrompt'];

const writeBot = (dirName: string, manifest: string): string => {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'BOT.md'), manifest);
  return dir;
};

let productManifest: string;
let financeManifest: string;

beforeAll(async () => {
  const product = writeBot('product', '---\nname: product\ndescription: Product context\n---\n\n# product\n');
  // No frontmatter: the name falls back to the directory name.
  const finance = writeBot('finance', '# finance\n');
  const broken = writeBot('Broken Name', '# broken\n');
  productManifest = path.join(product, 'BOT.md');
  financeManifest = path.join(finance, 'BOT.md');
  fs.mkdirSync(cockpitHome, { recursive: true });
  fs.writeFileSync(path.join(cockpitHome, 'bot.json'), JSON.stringify({
    bots: [product, finance, broken].map((p, i) => ({ id: `bot-${i}`, path: p, addedAt: '' })),
  }));
  ({ resolveCommandPrompt } = await import('./slashCommands'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveCommandPrompt', () => {
  it('delegates every registered @bot line to a subagent and lists its BOT.md', () => {
    const out = resolveCommandPrompt('@product check the roadmap\n\n@finance review the budget\nwith Q3 numbers');
    const builtin = (name: string) => path.join(cockpitHome, 'skills', name, 'SKILL.md');
    expect(out).toBe([
      '[subagent·@product] check the roadmap',
      '',
      '[subagent·@finance] review the budget\nwith Q3 numbers',
      '',
      // The dispatch recipe first, once, however many Bots the message names …
      'Read these skill files first, then act accordingly:',
      `- bot-run: ${builtin('bot-run')}`,
      '',
      // … then what the dispatcher hands over unopened, under a header that does
      // NOT say "read": the child's own contract first, then the Bots, matching
      // the order bot-run tells it to write into the brief.
      'These files are for the session you delegate to. Pass the paths along; do not open them yourself:',
      `- bot-turn: ${builtin('bot-turn')}`,
      `- @product: ${productManifest}`,
      `- @finance: ${financeManifest}`,
    ].join('\n'));
  });

  // Progressive loading: bot-turn defers its bulk to sibling .md files, which the
  // resolved copy is useless without — a path that 404s is exactly as bad as a
  // missing rule, and nothing else in the system would notice.
  it('copies a builtin\'s reference files next to its resolved SKILL.md, substituted', () => {
    resolveCommandPrompt('@product hi');
    const read = (file: string) =>
      fs.readFileSync(path.join(cockpitHome, 'skills', 'bot-turn', file), 'utf-8');
    for (const file of ['writing.md', 'review.md', 'attach.md']) {
      expect(read(file)).not.toContain('{{');
    }
    // One positive check per placeholder kind — `not.toContain('{{')` alone
    // passes on a file that never had one. Match on the substituted value only:
    // the skills write `{{COCKPIT_DIR}}/skills/...` with forward slashes, so the
    // full path is mixed-separator on Windows and never equals path.join().
    expect(read('writing.md')).toContain('http://localhost:'); // {{BASE_URL}}
    expect(read('review.md')).toContain(cockpitHome); // {{COCKPIT_DIR}}
  });

  // The silent branch: when ~/.cockpit/skills is unwritable, bot-run has no
  // path to list. Dropping it would ship `[subagent·@product]` plus a BOT.md
  // the dispatcher is told NOT to open, and no way to delegate — a guaranteed
  // no-op. It must degrade to inlining, the same way a /skill line does.
  it('inlines bot-run when the builtin cannot be written', () => {
    const skillFile = path.join(cockpitHome, 'skills', 'bot-run', 'SKILL.md');
    fs.chmodSync(skillFile, 0o444);
    try {
      const out = resolveCommandPrompt('@product hi');
      expect(out).not.toContain(skillFile);
      expect(out).toContain('# Running an @bot line');
      expect(out).toContain('/api/sessions/delegate');
    } finally {
      fs.chmodSync(skillFile, 0o644);
    }
  });

  // bot-turn is the CHILD's contract. Unwritable, it is simply absent: inlining
  // it would hand the dispatcher the Bot's whole operating manual, which is the
  // one session that must not have it.
  it('drops bot-turn rather than inlining it when the builtin cannot be written', () => {
    const skillFile = path.join(cockpitHome, 'skills', 'bot-turn', 'SKILL.md');
    fs.chmodSync(skillFile, 0o444);
    try {
      const out = resolveCommandPrompt('@product hi');
      expect(out).not.toContain('bot-turn');
      expect(out).not.toContain('# Working as a Bot');
      expect(out).toContain(`- @product: ${productManifest}`);
    } finally {
      fs.chmodSync(skillFile, 0o644);
    }
  });

  it('leaves the Bot builtins out of a message that names no Bot', () => {
    const out = resolveCommandPrompt('/@cr the diff');
    expect(out).not.toContain('bot-run');
    expect(out).not.toContain('bot-turn');
  });

  it('shows the subagent locus even for a lone @bot', () => {
    expect(resolveCommandPrompt('@product hi').split('\n')[0]).toBe('[subagent·@product] hi');
  });

  it('mixes @bot with /skill and /@skill lines', () => {
    const out = resolveCommandPrompt('@product plan it\n\n/qa\n\n/@cr the diff', 'zh');
    expect(out).toContain('[subagent·@product] plan it');
    expect(out).toContain('[主会话·qa]');
    expect(out).toContain('[subagent·cr] the diff');
    expect(out).toContain('请先读取以下 skill 文件，再据此执行：');
    expect(out).toContain('以下文件交给你派发的子会话去读，你只转交路径，不要自己打开：');
    expect(out).toContain(`- @product：${productManifest}`);
    // The Bot's own path must not sit under the "read these" header.
    expect(out.indexOf('以下文件交给')).toBeLessThan(out.indexOf(`- @product：`));
  });

  it('leaves unknown @names and invalid Bots as prose, untouched and unremarked', () => {
    // `@qa` is excluded here: it IS a real skill under the retired spelling, so
    // it gets the note tested below. These three are not commands at all.
    for (const prompt of ['@nobody hello', '@Product hello', '@robert-x hi']) {
      expect(resolveCommandPrompt(prompt)).toBe(prompt);
    }
  });

  // A stored prompt (a scheduled task, a draft) written `@cr` still runs and
  // still succeeds — it just never reviews anything. The server log was the
  // first attempt at telling someone and reaches nobody: the user is in a
  // browser, and a scheduled run's stdout has no reader. So it also has to be
  // in the message, which is the only thing that gets read.
  it('reports the retired @skill spelling in the message, not just the log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = resolveCommandPrompt('@qa review');
      expect(out.startsWith('@qa review')).toBe(true); // the line itself is untouched
      expect(out).toContain('These @ lines were not recognised');
      expect(out).toContain('@qa → the subagent form for a skill is now /@qa');
      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockClear();
      const clean = resolveCommandPrompt('@nobody hello');
      expect(clean).toBe('@nobody hello'); // a plain @mention gets no note
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  // A bot.json that exists but does not parse used to read as "no Bots
  // registered": every @name silently became prose and the turn looked fine.
  it('says so when bot.json does not parse instead of dropping every @bot line', () => {
    const registry = path.join(cockpitHome, 'bot.json');
    const good = fs.readFileSync(registry, 'utf-8');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(registry, '{"bots": [oops]}');
    try {
      const out = resolveCommandPrompt('@product check the roadmap');
      expect(out.startsWith('@product check the roadmap')).toBe(true);
      expect(out).toContain('does not parse');
      expect(error).toHaveBeenCalled();
    } finally {
      fs.writeFileSync(registry, good);
      error.mockRestore();
    }
  });

  // Built-in Bots ship under <install root>/bots and are in no registry, so
  // they must reach dispatch through a different path than bot.json — and
  // survive the failures that take the registry down.
  it('dispatches a built-in @bot that appears in no registry', () => {
    const out = resolveCommandPrompt('@cockpit-helper how do I install it');
    expect(out.startsWith('[subagent·@cockpit-helper] how do I install it')).toBe(true);
    expect(out).toContain(path.join(process.cwd(), 'bots', 'cockpit-helper', 'BOT.md'));
  });

  it('keeps built-in Bots working when bot.json does not parse', () => {
    const registry = path.join(cockpitHome, 'bot.json');
    const good = fs.readFileSync(registry, 'utf-8');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(registry, '{"bots": [oops]}');
    try {
      // The registered Bot degrades to prose (tested above); the built-in must
      // not, or one stray comma in a hand-edited file takes down a Bot that
      // never had anything to do with it.
      const out = resolveCommandPrompt('@cockpit-helper what shipped recently');
      expect(out.startsWith('[subagent·@cockpit-helper] what shipped recently')).toBe(true);
    } finally {
      fs.writeFileSync(registry, good);
      error.mockRestore();
    }
  });

  it('keeps skill-only prompts on the skill wording', () => {
    const out = resolveCommandPrompt('/@cr the diff');
    expect(out.startsWith('[subagent·cr] the diff')).toBe(true);
    expect(out).toContain('Read these skill files first, then act accordingly:');
  });
});
