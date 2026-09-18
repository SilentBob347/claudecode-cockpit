// Slash/at command dispatch. Builtin command BODIES are not in this file (nor in
// any .ts): each one is `skills/<cmd>/SKILL.md` inside the package, enumerated by
// builtinSkills.ts. Adding a builtin = adding that directory — no wiring here, and
// no second list in `packages/feature/agent/src/server/api/commands.ts`, which now
// derives the autocomplete dropdown from the same directory.
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import path, { join } from 'path';
import type { BotSummary } from '@cockpit/effect-services';
import { BOTS_FILE, COCKPIT_DIR, SKILLS_FILE } from '@cockpit/shared-utils';
import { mentionableBots, resolveBot } from '../../shared/bots';
import { listBuiltinBots } from './builtinBots';
import {
  listBuiltinSkillExtras,
  listBuiltinSkillNames,
  readBuiltinSkill,
  readBuiltinSkillExtra,
  readFrontmatterField,
} from './builtinSkills';

/** Where the RESOLVED copy of a builtin lands (~/.cockpit/skills/<cmd>/SKILL.md),
 *  i.e. user data — not to be confused with BUILTIN_SKILLS_SRC_DIR, the package's
 *  read-only `skills/` source. The copy exists so the model reads a builtin through
 *  the SAME flow as a user-defined skill ("read this skill file: <path>") instead of
 *  having the full template inlined into the prompt, and it is where {{BASE_URL}}
 *  gets substituted. */
const BUILTIN_SKILLS_OUT_DIR = join(COCKPIT_DIR, 'skills');

/**
 * Derive the base URL the AI should use in its curl recipes.
 *
 * Always `http://localhost:<COCKPIT_PORT>`. Consumers of {{BASE_URL}} are
 * /cg's curl recipes and /html's theme.css fetch, both of which the agent runs
 * via bash on the *same machine* as the server — so loopback is always
 * reachable, never needs auth, and never leaks a token into the user-visible /
 * on-disk SKILL.md. We deliberately do
 * NOT honor X-Forwarded-Host: a public/proxy URL would force the curls through
 * the auth gate (401) and is irrelevant to a co-located executor.
 */
function deriveBaseUrl(): string {
  const port = process.env.COCKPIT_PORT || process.env.PORT || '3457';
  return `http://localhost:${port}`;
}

type StepMarker = '/' | '/@' | '@';

// One command line: `/skill …`, `/@skill …` or `@bot …` at the start of a line
// (leading whitespace allowed). `/@` must precede `/` in the alternation so
// `/@research` is never read as a main-session skill named `@research`. The verb is every non-space char up to the first
// whitespace — deliberately NO character class.
//
// This regex only TOKENIZES; `isKnown()` below is the gate. Widening it is
// therefore free: a line the registry doesn't recognize (`/Users/me/foo.ts`,
// `@somebody`) falls through to the untouched-prose path exactly as before.
// A character class here, by contrast, is a silent killer — it rejected
// `/5e` (digit-first) BEFORE the registry was ever consulted, so a skill that
// was registered, listed, and offered by autocomplete still no-opped with no
// error. Skill names legitimately carry digits/`_`/`:`/`.` (see
// sanitizeName in parseSkillMd.ts), so no class can track them without drifting
// again. Let the registry decide what exists.
const COMMAND_LINE_RE = /^\s*(\/@|\/|@)(\S+?)(?:\s+|$)/;

// Resolves skill and Bot commands before the prompt is sent to the model.
//
// Design: IN-PLACE ANNOTATION, not reorganization. The message keeps the user's
// original layout (line order, blank lines, trailing global remarks) verbatim.
// Each recognized command line is rewritten into a compact `[locus·skill]` tag
// carrying its execution locus and skill name; the full SKILL.md path is hoisted
// out to a single reference list appended at the very end (footnote style), so a
// long absolute path never clutters the content line and appears exactly once.
// Everything else — the user's own prose, before/between/after commands — is left
// untouched. This leaves sequencing/parallelism to the agent (which reads the
// whole message and the skills), instead of the wrapper over-scripting a
// "步骤 N … 依次完成" order it can't honor (`/@` delegations run independently, and
// mode-skills like `/qa` are behaviors, not sequential steps).
//
//   - `/verb` runs in the main session; `/@verb` is delegated to a subagent.
//   - `@bot` (registered in bot.json) is ALWAYS delegated to a subagent; its
//     reference is the Bot's BOT.md, which tells the subagent what to read and
//     where to write back. Several `@bot` lines may appear in one message.
//   - builtin commands (the package's skills/ dir) AND user-registered skills,
//     mixed. A user skill shadows a builtin of the same name.
//   - A command's body = its inline text on the SAME line, PLUS the contiguous
//     non-blank lines directly below it (up to the first blank line or the next
//     command line). A blank line is the HARD boundary, so a trailing global
//     remark (a paragraph after a blank line) is never absorbed — it stays put,
//     applying to everything. The body follows the tag: `[locus·skill] <body>`.
//   - Locus is shown only when it disambiguates: 2+ commands, or any subagent. A lone
//     `/verb` renders as just `[skill]`.
//   - Reference list: builtins are written to ~/.cockpit/skills/<verb>/SKILL.md;
//     user skills use their registered path — the SAME flow user-defined skills
//     use. On a builtin write failure the content is inlined (never a no-op).
//
// Builtin bodies are English-only; `language` no longer selects a translation of
// the skill, it only picks the wording of the wrapper text this function emits
// (the locus word and the reference-list header).
//
// `{{BASE_URL}}` placeholders are substituted at WRITE time with the loopback
// base URL (http://localhost:<port>) — /cg's curl recipes are executed by the
// agent on the server host, so loopback is always reachable and never needs a
// token. `_req` is kept on the signature for call-site threading but is no
// longer consulted for the base URL (see deriveBaseUrl).
export function resolveCommandPrompt(
  prompt: string,
  language = 'en',
  _req?: Request,
): string {
  const lang: 'zh' | 'en' = language.startsWith('zh') ? 'zh' : 'en';

  // Skill registry read once per dispatch (not per keystroke) so command-line
  // recognition can tell a real `/skill-name` from ordinary text-with-slash.
  const userSkills = listUserSkills();
  const builtins = new Set(listBuiltinSkillNames());
  const { bots, corrupt: registryCorrupt } = listRegisteredBots();
  const isKnown = (marker: StepMarker, cmd: string) =>
    marker === '@'
      ? bots.has(cmd)
      : builtins.has(cmd) || userSkills.some((s) => s.name === cmd);

  // Anything the user wrote as `@name` that we could not resolve. Collected so a
  // degradation can be stated IN THE MESSAGE — the model is the only party that
  // reads this text, and it is the one that can tell the user (see the note
  // appended at the end).
  const unresolved: string[] = [];

  // ── Find command lines; leave every other line exactly as written ──
  const lines = prompt.split('\n');
  const cmds: Array<{ i: number; marker: StepMarker; cmd: string; rest: string }> = [];
  lines.forEach((line, i) => {
    const m = line.match(COMMAND_LINE_RE);
    if (!m) return;
    const marker = m[1] as StepMarker;
    if (isKnown(marker, m[2])) {
      cmds.push({ i, marker, cmd: m[2], rest: line.slice(m[0].length).trim() });
      return;
    }
    // `@verb` used to mean "run this skill in a subagent"; `/@verb` does now.
    // A stored prompt written in the old spelling (a scheduled task, a draft)
    // silently degrades to prose otherwise: it still runs, still succeeds, and
    // simply never does the thing — surfacing weeks later as "why did it stop
    // reviewing anything?". A console.warn was the first attempt and reaches
    // nobody: the user is in a browser, and a scheduled task's stdout has no
    // reader at all. So it is ALSO reported in the message (see below), which
    // the model can relay. Still logged for the server-side trail.
    if (marker !== '@') return;
    if (builtins.has(m[2]) || userSkills.some((s) => s.name === m[2])) {
      console.warn(`[skills] "@${m[2]}" is not a registered Bot; the subagent form is now "/@${m[2]}" — left as plain text`);
      unresolved.push(`@${m[2]} → the subagent form for a skill is now /@${m[2]}`);
    } else if (registryCorrupt) {
      unresolved.push(`@${m[2]} → could not be resolved: ${BOTS_FILE} does not parse`);
    }
  });
  // Note the degradations even here: a message that is ONLY a retired `@skill`
  // line is the exact case A1 is about, and an early `return prompt` would drop
  // the one signal that anything went wrong.
  if (cmds.length === 0) return appendUnresolvedNote(prompt, unresolved, lang);

  // Show the execution locus only when it disambiguates: multiple commands, or
  // any subagent delegation. A lone main-session command renders as just `[skill]`.
  const showLocus = cmds.length >= 2 || cmds.some((c) => c.marker !== '/');
  const baseUrl = deriveBaseUrl();

  // Rewrite each command line into its `[locus·skill] body` tag; fold its body
  // (inline rest + the contiguous non-blank lines below it, up to a blank line or
  // the next command) into the tag line and drop those consumed lines; collect
  // each skill's path (deduped, first-seen order) for the appended reference list.
  const rendered = new Map<number, string>();
  const consumed = new Set<number>();
  // `kind` splits the reference list by what the reader is supposed to DO with
  // the path: `read` = open it now (skills), `handoff` = pass it to the session
  // you delegate to (a Bot's BOT.md). One shared "read these first" header over
  // both was actively harmful — it told the dispatcher to open the BOT.md that
  // bot-run, two lines below, tells it not to open, and the model obeyed the
  // header: it cat'd the BOT.md into this session and then said the two
  // instructions contradicted each other.
  const listed: Array<{ name: string; path: string; kind: 'read' | 'handoff' }> = [];
  const seen = new Set<string>();
  cmds.forEach((c, k) => {
    const nextCmd = k + 1 < cmds.length ? cmds[k + 1].i : lines.length;
    const bodyLines: string[] = [];
    if (c.rest) bodyLines.push(c.rest);
    for (let j = c.i + 1; j < nextCmd; j++) {
      if (lines[j].trim() === '') break; // blank line = hard body boundary
      bodyLines.push(lines[j].trim());
      consumed.add(j);
    }
    const ref: SkillRef = c.marker === '@'
      ? { name: `@${c.cmd}`, path: bots.get(c.cmd)!, content: null }
      : resolveSkillRef(c.cmd, baseUrl, userSkills);
    rendered.set(c.i, renderCommandLine(c.marker, ref, bodyLines.join('\n'), lang, showLocus));
    if (ref.path && !seen.has(ref.name)) {
      seen.add(ref.name);
      listed.push({ name: ref.name, path: ref.path, kind: c.marker === '@' ? 'handoff' : 'read' });
    }
  });

  // An `@bot` line pulls in two hidden builtins, one per side of the handoff.
  // Both are prose the model reads, both carry curl snippets, and both improve
  // independently of this file — and of the user's BOT.md files, which is the
  // point: a rule that lives here is fixed once for every Bot, a rule copied
  // into BOT.md is frozen on disk the day the Bot is created.
  //
  //   bot-run  → the DISPATCHER reads it: write a brief, delegate, poll, report.
  //   bot-turn → the CHILD reads it (dispatcher passes the path unopened): read
  //              rules, entry format, when writing is allowed, the write lock.
  //
  // Appended once each, however many `@bot` lines there are. bot-turn is listed
  // as `handoff` next to the BOT.md files it belongs with; it must reach the
  // child, and a dispatcher that reads it has pulled the Bot's whole operating
  // contract into the session it was supposed to keep out of.
  let botRunInline: string | null = null;
  if (cmds.some((c) => c.marker === '@')) {
    const run = resolveSkillRef('bot-run', baseUrl, userSkills);
    if (run.path && !seen.has(run.name)) {
      seen.add(run.name);
      listed.push({ name: run.name, path: run.path, kind: 'read' });
    } else if (!run.path) {
      // Same degraded path command lines take (builtin unwritable): inline it.
      // Dropping it instead would leave the `@bot` tags with no dispatch recipe
      // at all AND a BOT.md nobody is allowed to open — a guaranteed no-op.
      botRunInline = run.content;
    }
    const turn = resolveSkillRef('bot-turn', baseUrl, userSkills);
    // Ahead of the BOT.md paths, matching the order bot-run tells the dispatcher
    // to write into the brief: the general contract, then the particular Bot.
    // Never inlined on failure — it is addressed to the child, and inlining it
    // would put it in front of exactly the wrong reader.
    if (turn.path && !seen.has(turn.name)) {
      seen.add(turn.name);
      listed.unshift({ name: turn.name, path: turn.path, kind: 'handoff' });
    }
  }

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    out.push(rendered.get(i) ?? lines[i]);
  }
  let result = out.join('\n');

  // Append the reference list (footnote style) — each path once, after all
  // content, so it never clutters the content lines. Two blocks, because the
  // two kinds of path carry opposite instructions (see `kind` above); the
  // skills-to-read block comes first so the dispatch recipe is in hand before
  // the Bot paths it operates on.
  const block = (kind: 'read' | 'handoff', header: string): string | null => {
    const items = listed.filter((s) => s.kind === kind);
    if (items.length === 0) return null;
    const sep = lang === 'zh' ? '：' : ': ';
    return `${header}\n${items.map((s) => `- ${s.name}${sep}${s.path}`).join('\n')}`;
  };
  const blocks = [
    block('read', lang === 'zh'
      ? '请先读取以下 skill 文件，再据此执行：'
      : 'Read these skill files first, then act accordingly:'),
    block('handoff', lang === 'zh'
      ? '以下文件交给你派发的子会话去读，你只转交路径，不要自己打开：'
      : 'These files are for the session you delegate to. Pass the paths along; do not open them yourself:'),
    botRunInline,
  ].filter((b): b is string => b !== null);
  if (blocks.length > 0) result = `${result}\n\n${blocks.join('\n\n')}`;
  return appendUnresolvedNote(result, unresolved, lang);
}

/**
 * Tell the reader about `@name` lines that were left as prose, so it can pass
 * that on. Silence here is the failure mode both A1 and A4 share: the turn
 * succeeds, the line simply did nothing, and nobody finds out.
 */
function appendUnresolvedNote(result: string, unresolved: string[], lang: 'zh' | 'en'): string {
  if (unresolved.length === 0) return result;
  const header = lang === 'zh'
    ? '以下 @ 开头的行没有被识别，已按普通文本处理，请告知用户：'
    : 'These @ lines were not recognised and were left as plain text. Tell the user:';
  return `${result}\n\n${header}\n${unresolved.map((u) => `- ${u}`).join('\n')}`;
}

interface SkillRef {
  name: string;
  /** Absolute SKILL.md path, or null when a builtin write failed. */
  path: string | null;
  /** Inlined SKILL.md content, present ONLY as the fallback when path is null. */
  content: string | null;
}

// Rewrite one command line into its tag. Normal case: `[locus·skill] body`
// (locus omitted for a lone main-session command), path deferred to the appended
// reference list. Degraded case (builtin write failed → no path): inline the full
// content, glued to any body with a sequence connective, so the command never
// silently no-ops.
function renderCommandLine(
  marker: StepMarker,
  ref: SkillRef,
  body: string,
  lang: 'zh' | 'en',
  showLocus: boolean,
): string {
  if (ref.path) {
    const tag = showLocus ? `[${locusWord(marker, lang)}·${ref.name}]` : `[${ref.name}]`;
    return body ? `${tag} ${body}` : tag;
  }
  const locus = showLocus ? `[${locusWord(marker, lang)}] ` : '';
  const then = body ? (lang === 'zh' ? `，然后：${body}` : `, then: ${body}`) : '';
  return `${locus}${ref.content ?? ''}${then}`;
}

/** Bare execution-locus word: main session vs subagent. */
function locusWord(marker: StepMarker, lang: 'zh' | 'en'): string {
  if (marker !== '/') return 'subagent';
  return lang === 'zh' ? '主会话' : 'main session';
}

// Resolve a command verb to its skill reference (name + absolute SKILL.md path).
// A user skill takes PRECEDENCE over a builtin of the same name — so a user skill
// named `cr`/`new-branch` shadows the builtin and their own edits keep taking
// effect. On a builtin write failure, path is null and the raw content is
// returned for inlining. (Callers only pass known verbs.)
function resolveSkillRef(
  cmd: string,
  baseUrl: string,
  userSkills: Array<{ name: string; path: string }>,
): SkillRef {
  const skill = userSkills.find((s) => s.name === cmd);
  if (skill) return { name: cmd, path: skill.path, content: null };
  const source = readBuiltinSkill(cmd);
  if (source === null) {
    // isKnown() stat'd this file moments ago, so a read failure here means the
    // install is being mutated underneath us. Log it: the alternative is a
    // command that vanishes from the prompt with no trace.
    console.error(`[skills] builtin "${cmd}" disappeared while resolving it`);
    return { name: cmd, path: null, content: null };
  }
  const content = substitute(source, baseUrl);
  const skillPath = writeBuiltinSkill(cmd, content, baseUrl);
  return skillPath
    ? { name: cmd, path: skillPath, content: null }
    : { name: cmd, path: null, content };
}

interface SkillRecord {
  id: string;
  path: string;
  addedAt: string;
}

// Read the user-skill registry (~/.cockpit/skills.json) and resolve each
// record's `name` from its SKILL.md frontmatter. Synchronous — runs once per
// dispatch, reads a handful of small local files; keeps resolveCommandPrompt
// sync for the five engine handlers that call it inside Effect.gen.
function listUserSkills(): Array<{ name: string; path: string }> {
  try {
    const data = JSON.parse(readFileSync(SKILLS_FILE, 'utf-8')) as {
      skills?: SkillRecord[];
    };
    const out: Array<{ name: string; path: string }> = [];
    for (const s of data.skills ?? []) {
      const name = readSkillName(s.path);
      if (name) out.push({ name, path: s.path });
    }
    return out;
  } catch {
    return [];
  }
}

// Built-in Bots (shipped under /bots) + the registry (bot.json) → name →
// absolute BOT.md path, through the same resolveBot / mentionableBots the
// registry service uses so both agree on validity and on name clashes. Sync for
// the same reason as listUserSkills.
//
// Built-ins are listed FIRST, which is what makes them win: mentionableBots
// keeps the earliest entry for a name. They are also independent of bot.json —
// a corrupt registry takes the user's Bots down with it, never the built-ins.
function listRegisteredBots(): { bots: Map<string, string>; corrupt: boolean } {
  const builtins = listBuiltinBots();
  const withBuiltins = (registered: BotSummary[]) => mentionableBots(path, [...builtins, ...registered]);
  let raw: string;
  try {
    raw = readFileSync(BOTS_FILE, 'utf-8');
  } catch {
    return { bots: withBuiltins([]), corrupt: false }; // no registry yet
  }
  try {
    const data = JSON.parse(raw) as { bots?: Array<{ id: string; path: string; addedAt: string }> };
    const read = (manifest: string) => readFileSync(manifest, 'utf-8');
    return { bots: withBuiltins((data.bots ?? []).map((r) => resolveBot(path, r, read))), corrupt: false };
  } catch (err) {
    // A file that exists but does not parse is NOT "no Bots registered". Both
    // used to collapse into an empty map, so every `@name` in the message
    // quietly became prose: no tag, no delegation, no error — the user reads a
    // plausible answer written by the wrong session. bot.json is meant to be
    // hand-editable, so this is a realistic state, and it is the one case where
    // saying nothing is worse than being wrong.
    console.error(`[skills] ${BOTS_FILE} does not parse — every registered @bot line is left as plain text:`, err);
    return { bots: withBuiltins([]), corrupt: true };
  }
}

// Extract the `name:` field from a SKILL.md YAML frontmatter block, so a
// `/name` command can be matched to its file. Sync + regex (no async
// parseSkillMd dependency); shares readFrontmatterField with the builtin
// registry so both kinds of skill are parsed by exactly one implementation.
function readSkillName(path: string): string | null {
  try {
    return readFrontmatterField(readFileSync(path, 'utf-8'), 'name');
  } catch {
    return null;
  }
}

// Write a builtin command's resolved SKILL.md to ~/.cockpit/skills/<cmd>/SKILL.md
// and return the absolute path. `content` IS a complete SKILL.md (YAML
// frontmatter + body) — identical in shape to a user-defined skill — so it's
// written verbatim, no frontmatter synthesis. Overwritten on every dispatch so
// the file always reflects the current code + the loopback base URL.
// Returns null on any failure so the caller can fall back to inlining.
//
// Synchronous fs on purpose: keeps resolveCommandPrompt's sync signature — all
// five engine chat handlers (chat.ts + chat/{codex,deepseek,kimi,ollama}.ts)
// invoke it inline inside an Effect.gen — and the payload is a single small
// local file, same pattern as notifyReviewChange.
function writeBuiltinSkill(cmd: string, content: string, baseUrl: string): string | null {
  try {
    const dir = join(BUILTIN_SKILLS_OUT_DIR, cmd);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'SKILL.md');
    writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
    // Reference files shipped beside the SKILL.md travel with it, substituted the
    // same way, so a skill can defer the bulk of itself to `<dir>/<file>.md` and
    // have the model open it only when the task calls for it (bot-turn keeps the
    // write lock and the review checklist out of every ordinary turn this way).
    // A failure here is NOT fatal: the SKILL.md is already written and is what
    // the caller was promised — losing a reference file degrades to "the model
    // reads a path that 404s and says so", not to a command that vanishes.
    for (const file of listBuiltinSkillExtras(cmd)) {
      const extra = readBuiltinSkillExtra(cmd, file);
      if (extra === null) continue;
      try {
        writeFileSync(join(dir, file), substitute(extra, baseUrl), 'utf-8');
      } catch (err) {
        console.error(`[skills] builtin "${cmd}": cannot write reference file ${file}:`, err);
      }
    }
    return filePath;
  } catch {
    return null;
  }
}

/** Placeholder substitution, identical for a SKILL.md and its reference files. */
function substitute(text: string, baseUrl: string): string {
  return text.replaceAll('{{BASE_URL}}', baseUrl).replaceAll('{{COCKPIT_DIR}}', COCKPIT_DIR);
}
