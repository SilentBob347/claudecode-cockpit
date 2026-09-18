import yaml from "js-yaml"
import type { BotRegistration, BotSummary } from "@cockpit/effect-services"

/**
 * A Bot is a plain directory with a `BOT.md` at its root, registered in
 * `bot.json` and addressed as `@name`. Like SKILL.md, the manifest is only
 * `name` + `description` frontmatter; everything else in the directory is
 * ordinary files the Bot's subagent reads and edits directly.
 *
 * Pure: no fs, no `node:path` import (this folder is client-importable). Path
 * handling takes the platform's path API from the server caller, so Windows
 * separators work and tests can pin `path.win32` / `path.posix`.
 */
export const BOT_MANIFEST_FILE = "BOT.md"

/** The subset of `node:path` Bot path handling needs. */
export interface PathApi {
  readonly basename: (path: string) => string
  readonly dirname: (path: string) => string
  readonly join: (...parts: string[]) => string
}

export interface BotManifest {
  readonly name: string
  readonly description: string
}

// Kept in sync with the `@` verb class in commandAutocomplete: lowercase so
// `@Name` never silently misses.
const BOT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

export const isBotName = (name: string): boolean => BOT_NAME.test(name)

const isManifestPath = (path: PathApi, target: string): boolean =>
  path.basename(target).toLowerCase() === BOT_MANIFEST_FILE.toLowerCase()

/** Accepts a Bot directory or its BOT.md path; returns both. */
export const botPaths = (path: PathApi, target: string): { readonly dir: string; readonly manifest: string } => {
  const dir = isManifestPath(path, target) ? path.dirname(target) : path.join(target)
  return { dir, manifest: path.join(dir, BOT_MANIFEST_FILE) }
}

/**
 * Parse BOT.md. Frontmatter is optional; `name` falls back to the directory
 * name (lowercased), `description` to an empty string. Throws when the
 * frontmatter is malformed or the resolved name is not a valid mention token.
 */
export const parseBotDocument = (path: PathApi, content: string, dir: string): BotManifest => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  let fields: Record<string, unknown> = {}
  if (match) {
    const raw = yaml.load(match[1])
    if (raw !== undefined && raw !== null) {
      if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("BOT.md frontmatter must be a mapping")
      fields = raw as Record<string, unknown>
    }
  }
  const fallback = path.basename(dir).toLowerCase()
  const name = typeof fields.name === "string" && fields.name.trim() ? fields.name.trim() : fallback
  if (!isBotName(name)) throw new Error(`Bot name "${name}" must match [a-z0-9][a-z0-9-]*`)
  const description = typeof fields.description === "string" ? fields.description.trim() : ""
  return { name, description }
}

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Resolve one registration against its BOT.md. `read` is the caller's IO
 * (sync or pre-read content); any read or parse failure becomes an invalid
 * summary rather than an exception, so one broken Bot never hides the rest.
 */
export const resolveBot = (
  path: PathApi,
  record: BotRegistration,
  read: (manifestPath: string) => string,
): BotSummary => {
  const { dir, manifest } = botPaths(path, record.path)
  try {
    return { ...record, valid: true, ...parseBotDocument(path, read(manifest), dir) }
  } catch (cause) {
    return { ...record, valid: false, name: path.basename(dir), error: messageOf(cause) }
  }
}

/**
 * The `@name` → BOT.md lookup used by command dispatch: valid Bots only, and
 * on a name clash the earliest registration wins (the add route refuses
 * clashes, so a clash only exists after hand-editing bot.json).
 */
export const mentionableBots = (path: PathApi, bots: ReadonlyArray<BotSummary>): Map<string, string> => {
  const out = new Map<string, string>()
  for (const bot of bots) {
    if (bot.valid && !out.has(bot.name)) out.set(bot.name, botPaths(path, bot.path).manifest)
  }
  return out
}

/** The valid Bot already using `name`, excluding the directory being added. */
export const findNameClash = (
  bots: ReadonlyArray<BotSummary>,
  name: string,
  dir: string,
): BotSummary | undefined => bots.find((bot) => bot.valid && bot.name === name && bot.path !== dir)
