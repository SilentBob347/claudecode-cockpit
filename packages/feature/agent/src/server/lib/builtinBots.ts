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
 * ## The shipped directory is a seed, not a home
 *
 * A Bot's directory is a working directory: the user opens it, edits the
 * persona, and the Bot itself writes into it. The install root can be none of
 * those things — it is root-owned under `npm i -g`, replaced wholesale on every
 * upgrade, and shared by every COCKPIT_HOME on the machine. Handing a user that
 * path (`…/node_modules/@surething/cockpit/bots/x`) offers an edit that is
 * refused outright or silently deleted by the next upgrade.
 *
 * So `listBuiltinBots` **installs** each built-in into `BOTS_DIR/<name>`
 * (`~/.cockpit/bots/<name>`) the first time it sees it, and reports that copy as
 * the Bot. Everything downstream follows from the path alone: the panel shows
 * it, the folder button opens it, and `@name` dispatch resolves its BOT.md
 * there. Nothing is ever written back to the seed.
 *
 * Copying at *list* time rather than on the folder click is deliberate — list
 * runs on the `@` autocomplete path too, so the copy exists before the user can
 * see, open or mention the Bot, and there is never a window where the panel
 * shows one directory while the Bot runs from another.
 *
 * The obvious objection to copying anything out of an install is drift: the copy
 * stops receiving updates the day it is made, and a Bot frozen at whatever
 * shipped that week is a slow, invisible regression. `syncBuiltinBot` answers it
 * by remembering the hash of the seed each copy was installed from, which is
 * enough to tell the two cases apart — an untouched copy is replaced when a
 * newer seed ships, and one the user has edited is never touched again. Neither
 * outcome needs a prompt, and neither loses work.
 *
 * Consequences worth stating, because they are the point rather than accidents:
 *
 * - **The copy is the user's the moment they edit it.** Until then it tracks the
 *   shipped version; after, it is theirs and upgrades leave it alone. Deleting it
 *   is the "reset to shipped" gesture — the next listing installs it afresh, and
 *   starts tracking again.
 * - **A broken copy is reported, not hidden.** A malformed *seed* is skipped
 *   (nobody can fix it from the UI), but a copy edited into an invalid state is
 *   listed as invalid with the reason, because the user owns those files and is
 *   one click from them. Vanishing silently is the one thing an editable Bot
 *   must not do.
 * - **Still not persisted into bot.json.** The id stays `builtin:<dir>`, the
 *   card stays undeletable, and a fresh COCKPIT_HOME gets its own copy. Only the
 *   directory moved; the registry model did not.
 * - **An uninstallable copy still leaves a working Bot.** If COCKPIT_HOME is
 *   read-only the failure is logged once per listing and the seed is used as it
 *   was before — read-only, but reachable.
 *
 * Synchronous for the same reason as builtinSkills: slashCommands resolves
 * `@name` inline inside Effect.gen on every dispatch and must stay sync.
 */
import { createHash } from 'crypto';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import path, { join } from 'path';
import type { BotSummary } from '@cockpit/effect-services';
import { BOTS_DIR, BUILTIN_BOTS_SRC_DIR } from '@cockpit/shared-utils';
import { BOT_MANIFEST_FILE, isBotName, parseBotDocument } from '../../shared/bots';

export const BUILTIN_BOT_ID_PREFIX = 'builtin:';

export const isBuiltinBotId = (id: string): boolean => id.startsWith(BUILTIN_BOT_ID_PREFIX);

/** The directory name behind `builtin:<dir>`; '' for any other id. */
export const builtinBotNameFromId = (id: string): string =>
  isBuiltinBotId(id) ? id.slice(BUILTIN_BOT_ID_PREFIX.length) : '';

/** The shipped seed of a built-in: read-only, and never a Bot's home. */
export const builtinBotSeedDir = (name: string): string => join(BUILTIN_BOTS_SRC_DIR, name);

/** Where a built-in lives once installed — writable and per-COCKPIT_HOME. */
const builtinBotUserDir = (name: string): string => join(BOTS_DIR, name);

const hasManifest = (dir: string): boolean => {
  try {
    return statSync(join(dir, BOT_MANIFEST_FILE)).isFile();
  } catch {
    return false;
  }
};

/**
 * What we last installed for a built-in, so an upgrade can tell an untouched
 * copy (safe to replace) from one the user has made their own (never touched
 * again). Kept in one file beside the copies rather than inside them, so a Bot's
 * own directory stays exactly what the user put there.
 */
const INSTALL_STATE_FILE = join(BOTS_DIR, '.builtin-installs.json');

interface InstallRecord {
  /** Hash of the seed this copy was installed from. */
  readonly seed: string;
  /** Set once the copy diverged from that seed; stops all future refreshes. */
  readonly edited?: boolean;
}

type InstallState = Record<string, InstallRecord>;

const readInstallState = (): InstallState => {
  try {
    const raw: unknown = JSON.parse(readFileSync(INSTALL_STATE_FILE, 'utf-8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as InstallState) : {};
  } catch {
    // Missing or corrupt reads as "nothing is managed", which only costs the
    // refresh: every copy is then left exactly as the user has it.
    return {};
  }
};

const writeInstallState = (state: InstallState): void => {
  try {
    mkdirSync(BOTS_DIR, { recursive: true });
    const tmp = `${INSTALL_STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(tmp, INSTALL_STATE_FILE);
  } catch (err) {
    // Non-fatal: the Bots are installed either way, and the worst case is that
    // the same decision gets made again on the next listing.
    console.error(`[bots] cannot record builtin Bot installs in ${INSTALL_STATE_FILE}:`, err);
  }
};

/**
 * Content hash of a directory tree — relative paths and bytes, order-independent
 * — used only to answer "has this copy been touched since we wrote it?".
 *
 * Contents rather than mtimes: npm rewrites timestamps on install, and a copy is
 * "the same Bot" when the files say the same thing, whatever the clock did.
 */
function hashTree(dir: string): string {
  const hash = createHash('sha256');
  const walk = (rel: string): void => {
    const entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) hash.update(`${child}\0`).update(readFileSync(join(dir, child))).update('\0');
    }
  };
  walk('');
  return hash.digest('hex');
}

/**
 * Copy `from` onto `to` through a staging directory, so `to` is either the old
 * tree or the whole new one and never a half-written mixture — a half tree would
 * be indistinguishable from a Bot for good.
 */
function copyTreeOver(from: string, to: string, label: string): void {
  mkdirSync(BOTS_DIR, { recursive: true });
  const staging = join(BOTS_DIR, `.${label}.installing-${process.pid}-${Date.now()}`);
  const retired = `${staging}.old`;
  rmSync(staging, { recursive: true, force: true });
  try {
    cpSync(from, staging, { recursive: true });
    let hasOld = false;
    try {
      renameSync(to, retired);
      hasOld = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
    renameSync(staging, to);
    if (hasOld) rmSync(retired, { recursive: true, force: true });
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Bring a built-in's copy under BOTS_DIR in line with the shipped seed, and
 * return the directory it now lives in.
 *
 * Three cases, in the order they are checked:
 *
 * 1. **No copy** — install one and record the seed hash. Also how "delete the
 *    folder" works as a reset, `edited` included.
 * 2. **Copy matches what we installed, seed has since changed** — an upgrade
 *    shipped a better BOT.md and nobody has touched this one, so replace it.
 *    This is what makes copying out safe: an unedited built-in keeps improving.
 * 3. **Copy differs from what we installed** — the user has made it theirs.
 *    Record that once and never look again: their edits outrank our updates, and
 *    the Bot they tuned must not silently revert on an upgrade.
 *
 * A copy with no record at all (predating this file, or a folder the user
 * created under a name a later release happens to ship) is treated as case 3
 * from the start — we did not put it there, so we do not overwrite it.
 */
function syncBuiltinBot(name: string, state: InstallState): { readonly dir: string; readonly changed: boolean } {
  // `name` is a directory name read off disk; treat it as untrusted anyway, so
  // that nothing here can ever be talked into writing outside BOTS_DIR.
  if (!isBotName(name)) throw new Error(`"${name}" is not a valid built-in Bot name`);
  const dest = builtinBotUserDir(name);
  const seed = builtinBotSeedDir(name);
  if (!hasManifest(seed)) throw new Error(`no built-in Bot named "${name}"`);

  // Keyed on the copy holding a BOT.md rather than merely existing, so an empty
  // folder left by a partial delete does not shadow the Bot with nothing.
  if (!hasManifest(dest)) {
    try {
      copyTreeOver(seed, dest, name);
    } catch (err) {
      // Two processes racing the first install; the winner copied the same
      // bytes, so this is a success.
      if (!hasManifest(dest)) throw err;
    }
    state[name] = { seed: hashTree(seed) };
    return { dir: dest, changed: true };
  }

  const record = state[name];
  if (!record || record.edited) return { dir: dest, changed: false };
  const seedHash = hashTree(seed);
  if (record.seed === seedHash) return { dir: dest, changed: false };
  if (hashTree(dest) !== record.seed) {
    state[name] = { ...record, edited: true };
    return { dir: dest, changed: true };
  }
  copyTreeOver(seed, dest, name);
  state[name] = { seed: seedHash };
  return { dir: dest, changed: true };
}

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

type Parsed =
  | { readonly ok: true; readonly name: string; readonly description: string }
  | { readonly ok: false; readonly error: string };

/** Read and parse a Bot directory's BOT.md; never throws. */
function parseManifestIn(dir: string): Parsed {
  try {
    const content = readFileSync(join(dir, BOT_MANIFEST_FILE), 'utf-8');
    return { ok: true, ...parseBotDocument(path, content, dir) };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

/**
 * The directory a built-in runs from: its copy under BOTS_DIR, installed or
 * refreshed on the way past, and the seed only when that cannot be done at all.
 */
function builtinBotHome(
  name: string,
  state: InstallState,
): { readonly dir: string; readonly installed: boolean; readonly changed: boolean } {
  try {
    return { ...syncBuiltinBot(name, state), installed: true };
  } catch (err) {
    // Not fatal: the seed still answers questions, it just cannot be edited or
    // written to. Logged because an un-editable Bot is otherwise a mystery with
    // no trace anywhere — an unwritable COCKPIT_HOME is the usual cause.
    console.error(`[bots] cannot install builtin Bot "${name}" into ${BOTS_DIR} — using the read-only copy:`, err);
    return { dir: builtinBotSeedDir(name), installed: false, changed: false };
  }
}

/**
 * Every built-in, as the same BotSummary shape the registry service returns,
 * each one installed under BOTS_DIR on the way past.
 *
 * A directory with no BOT.md is not a Bot and is skipped. A *seed* whose BOT.md
 * does not parse is skipped too — the user can neither fix nor remove it, so an
 * undeletable red card would be permanent noise — and the reason is logged. An
 * installed copy that does not parse is the opposite case and is listed as
 * invalid, exactly like a registered Bot.
 *
 * An unreadable seed directory means a misconfigured COCKPIT_ROOT or a broken
 * install — also logged, never silently "no built-in Bots".
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

  const state = readInstallState();
  let stateChanged = false;
  const bots: BotSummary[] = [];
  for (const dir of dirs) {
    // Checked before installing: a plain directory under bots/ is not a Bot and
    // must not be copied into the user's Bot folder as one.
    if (!hasManifest(builtinBotSeedDir(dir))) continue;
    // The directory name becomes the Bot's `@name` and the name of the folder it
    // is installed into, so a built-in shipped under an unusable name is a
    // packaging mistake, not a user-visible state. Loud, and skipped.
    if (!isBotName(dir)) {
      console.error(`[bots] builtin Bot directory "${dir}" is not a usable Bot name and was skipped`);
      continue;
    }
    // Vet the seed on the way in, but only while there is nothing installed yet:
    // a malformed shipped Bot is ours to fix, and copying it out would hand the
    // user a broken Bot they did not write and cannot be expected to repair.
    // Once installed, the copy is the only thing worth reading — including when
    // it is the copy that is broken.
    if (!hasManifest(builtinBotUserDir(dir))) {
      const seed = parseManifestIn(builtinBotSeedDir(dir));
      if (!seed.ok) {
        console.error(`[bots] builtin Bot "${dir}" is not usable and was skipped: ${seed.error}`);
        continue;
      }
    }

    const { dir: home, installed, changed } = builtinBotHome(dir, state);
    stateChanged ||= changed;
    const manifest = parseManifestIn(home);
    // Built-ins were never "added"; the panel does not display this.
    const base = { id: `${BUILTIN_BOT_ID_PREFIX}${dir}`, path: home, addedAt: '', builtin: true as const };
    if (manifest.ok) {
      bots.push({ ...base, valid: true, name: manifest.name, description: manifest.description });
    } else if (installed) {
      bots.push({ ...base, valid: false, name: dir, error: manifest.error });
    } else {
      // The seed parsed a moment ago and does not now: it changed underneath us,
      // mid-upgrade. Nothing here can be shown, so say why and move on.
      console.error(`[bots] builtin Bot "${dir}" became unreadable and was skipped: ${manifest.error}`);
    }
  }
  // Once per listing, and only when something actually moved — the common case
  // is every built-in already installed and unchanged, which writes nothing.
  if (stateChanged) writeInstallState(state);
  return bots;
}

const realpathOr = (target: string): string => {
  try {
    // .native so this agrees with botRegistryLive, which canonicalizes the
    // same way; the JS and native implementations differ on Windows.
    return realpathSync.native(target);
  } catch {
    return target;
  }
};

/**
 * The built-in whose directory is `dir`, if any. Used to refuse re-adding one.
 *
 * Both of a built-in's directories count — the installed copy and the shipped
 * seed — because both are real paths a user can type into "Add bot", and
 * registering either would produce a second card for a Bot already listed.
 *
 * Compared through realpath as well as literally: the add route realpaths its
 * input, while these paths are built from COCKPIT_ROOT / COCKPIT_HOME as given.
 * On a checkout reached through a symlink the two spellings differ, and a
 * literal comparison would let the same directory be registered a second time.
 */
export function findBuiltinBotByPath(dir: string): BotSummary | undefined {
  const target = realpathOr(dir);
  return listBuiltinBots().find((bot) => {
    const candidates = [bot.path, builtinBotSeedDir(builtinBotNameFromId(bot.id))];
    return candidates.some((candidate) => candidate === dir || realpathOr(candidate) === target);
  });
}
