/**
 * Built-in Bot registry — backed by the `bots/` directory that ships inside the
 * package, NOT by TypeScript constants and NOT by bot.json.
 *
 * `bots/<name>/BOT.md` is the whole definition, in the exact shape a user's own
 * Bot uses. The directory set IS the registry (same call as builtinSkills), so
 * adding one is `mkdir` + the usual Bot files, with no list to keep in sync.
 * That differs from built-in HTML apps, which are a hand-kept whitelist: a
 * file-viewer card is useless without a `?file=` param, whereas every directory
 * holding a BOT.md is a complete, addressable Bot.
 *
 * Two properties this module must preserve:
 *
 * 1. **Never persisted.** A built-in's path moves with the install (npm global
 *    dir vs repo checkout, and again per COCKPIT_HOME). Writing it into
 *    bot.json would leave a dead entry after any upgrade — one the user then
 *    cannot delete without hand-editing the file.
 *
 * 2. **Read-only.** The install root is root-owned under `npm i -g` and is
 *    replaced wholesale on upgrade, so a built-in Bot cannot keep memory the
 *    way a registered Bot does. Its BOT.md states this; nothing here creates,
 *    copies or writes anything.
 *
 * Synchronous for the same reason as builtinSkills: slashCommands resolves
 * `@name` inline inside Effect.gen on every dispatch and must stay sync.
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'fs';
import path, { join } from 'path';
import type { BotSummary } from '@cockpit/effect-services';
import { BUILTIN_BOTS_SRC_DIR } from '@cockpit/shared-utils';
import { BOT_MANIFEST_FILE, parseBotDocument } from '../../shared/bots';

export const BUILTIN_BOT_ID_PREFIX = 'builtin:';

export const isBuiltinBotId = (id: string): boolean => id.startsWith(BUILTIN_BOT_ID_PREFIX);

/** Absolute path of a built-in's BOT.md (may not exist). */
export function builtinBotManifestPath(name: string): string {
  return join(BUILTIN_BOTS_SRC_DIR, name, BOT_MANIFEST_FILE);
}

/**
 * Every `bots/*` subdirectory holding a readable, parseable BOT.md, as the same
 * BotSummary shape the registry service returns.
 *
 * A broken one is omitted rather than listed as invalid: a registered Bot shows
 * its error so the user can fix or remove it, but a built-in can be neither, so
 * an undeletable red card would be permanent noise. The reason is logged
 * instead. An unreadable directory means a misconfigured COCKPIT_ROOT or a
 * broken install — also logged, never silently "no built-in Bots".
 */
export function listBuiltinBots(): BotSummary[] {
  let dirs: string[];
  try {
    dirs = readdirSync(BUILTIN_BOTS_SRC_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // A missing dir is a normal state for a checkout without built-in Bots;
    // anything else (EACCES, ELOOP) means every built-in @name is silently gone.
    if (code !== 'ENOENT') {
      console.error(
        `[bots] cannot read builtin bots dir ${BUILTIN_BOTS_SRC_DIR} — all builtin Bots are unavailable:`,
        err,
      );
    }
    return [];
  }

  const bots: BotSummary[] = [];
  for (const dir of dirs) {
    const manifest = builtinBotManifestPath(dir);
    try {
      if (!statSync(manifest).isFile()) continue;
      const { name, description } = parseBotDocument(
        path,
        readFileSync(manifest, 'utf-8'),
        join(BUILTIN_BOTS_SRC_DIR, dir),
      );
      bots.push({
        id: `${BUILTIN_BOT_ID_PREFIX}${dir}`,
        path: join(BUILTIN_BOTS_SRC_DIR, dir),
        // Built-ins were never "added"; the panel does not display this.
        addedAt: '',
        valid: true,
        builtin: true,
        name,
        description,
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') continue; // a plain directory, not a Bot
      console.error(`[bots] builtin Bot "${dir}" is not usable and was skipped:`, err);
    }
  }
  return bots;
}

const realpathOr = (target: string): string => {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
};

/**
 * The built-in whose directory is `dir`, if any. Used to refuse re-adding one.
 *
 * Compared through realpath as well as literally: the add route realpaths its
 * input, while BUILTIN_BOTS_SRC_DIR is built from COCKPIT_ROOT as given. On a
 * checkout reached through a symlink the two spellings differ, and a literal
 * comparison would let the same directory be registered a second time.
 */
export function findBuiltinBotByPath(dir: string): BotSummary | undefined {
  const target = realpathOr(dir);
  return listBuiltinBots().find((bot) => bot.path === dir || realpathOr(bot.path) === target);
}
