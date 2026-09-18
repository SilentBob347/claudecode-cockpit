import { randomUUID } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { Effect, Layer } from "effect"
import { FSError, NotFoundError, ValidationError, type CockpitError } from "@cockpit/effect-core"
import { BotRegistryService, type AddBotResult, type BotRegistration, type BotSummary } from "@cockpit/effect-services"
import { BOTS_FILE, readJsonFileForUpdate, withFileLock, writeJsonFile } from "@cockpit/shared-utils"
import { botPaths, findNameClash, parseBotDocument, resolveBot } from "../shared/bots"
import {
  builtinBotNameFromId,
  builtinBotSeedDir,
  findBuiltinBotByPath,
  isBuiltinBotId,
  listBuiltinBots,
} from "../server/lib/builtinBots"

interface BotRegistryFile {
  readonly bots: ReadonlyArray<BotRegistration>
}

const EMPTY_REGISTRY: BotRegistryFile = { bots: [] }

// ForUpdate everywhere, including the read-only list: a malformed bot.json must
// surface as an error, never as "you have no Bots". Listing it as empty is the
// first half of losing it — the next add would write that emptiness back.
const readRegistry = (): Promise<BotRegistryFile> => readJsonFileForUpdate(BOTS_FILE, EMPTY_REGISTRY)

// BOT.md files are a few KB and resolved a handful at a time; a sync read keeps
// resolveBot pure and shared with the sync dispatch path in slashCommands.
const readManifest = (manifestPath: string): string => readFileSync(manifestPath, "utf8")

/** Resolve every registration against its BOT.md (invalid ones included). */
const resolveRegisteredBots = (registry: BotRegistryFile): BotSummary[] =>
  registry.bots.map((record) => resolveBot(path, record, readManifest))

const invalidPath = (reason: string) => new ValidationError({ field: "path", reason })

/**
 * Turn a filesystem failure into a ValidationError WITHOUT discarding what
 * actually happened. `catch: () => invalidPath("directory not found")` reads
 * every errno as ENOENT, so an unreadable directory (EACCES) or a path through
 * a broken symlink (ELOOP) is reported to the user as "it isn't there" — they
 * then go looking for a missing folder that is sitting right in front of them.
 */
const fsReason = (what: string, target: string, cause: unknown): ValidationError => {
  const code = (cause as NodeJS.ErrnoException)?.code
  if (!code || code === "ENOENT") return invalidPath(`${what} not found: ${target}`)
  const detail = cause instanceof Error ? cause.message : String(cause)
  return invalidPath(`cannot read ${target} (${code}): ${detail}`)
}

/**
 * Built-ins first, then the registered Bots, with any registration pointing at
 * a built-in's directory dropped.
 *
 * The duplicate is real: before this existed, a built-in could only be reached
 * by adding its path by hand, and those bot.json rows are still on disk. Two
 * rows for one directory would render two cards and — since the earliest
 * registration wins at dispatch — hand the `@name` to whichever was added
 * first. Let the built-in win, exactly as html.json's dedupe does.
 *
 * Both of a built-in's directories are matched. A row added by hand before this
 * feature points at the shipped seed, which stops being `bot.path` the moment
 * the Bot is copied out — matching only the live path would let that old row
 * reappear as a second card the first time the user opens the built-in.
 */
const mergeBuiltins = (registered: ReadonlyArray<BotSummary>): BotSummary[] => {
  const builtins = listBuiltinBots()
  const builtinPaths = new Set(
    builtins.flatMap((bot) => [bot.path, builtinBotSeedDir(builtinBotNameFromId(bot.id))]),
  )
  return [...builtins, ...registered.filter((bot) => !builtinPaths.has(bot.path))]
}

const listBots: Effect.Effect<ReadonlyArray<BotSummary>, CockpitError> = Effect.tryPromise({
  try: async () => mergeBuiltins(resolveRegisteredBots(await readRegistry())),
  catch: (cause) => new FSError({ path: BOTS_FILE, op: "read", cause }),
})

type Registration =
  | { readonly kind: "existing"; readonly bot: BotSummary }
  | { readonly kind: "clash"; readonly bot: BotSummary }
  | { readonly kind: "added"; readonly record: BotRegistration }

const addBot = (inputPath: string): Effect.Effect<AddBotResult, CockpitError> =>
  Effect.gen(function* () {
    const trimmed = inputPath.trim()
    if (!trimmed) return yield* Effect.fail(invalidPath("missing"))
    if (!path.isAbsolute(trimmed)) return yield* Effect.fail(invalidPath("must be absolute"))

    const requested = botPaths(path, trimmed).dir
    // realpathSync.NATIVE, matching builtinBots — the two spellings are compared
    // against each other, so they must come from the same implementation. Node's
    // JS realpath and the native binding disagree on Windows 8.3 short names
    // (`C:\Users\RUNNER~1\…` vs `C:\Users\runneradmin\…`), which made a
    // built-in's own directory look like a new Bot and let the same folder be
    // registered twice.
    const dir = yield* Effect.try({
      try: () => realpathSync.native(requested),
      catch: (cause) => fsReason("directory", requested, cause),
    })
    // Registering a built-in would write a bot.json row that `list` then drops,
    // so the "added" toast would be followed by no new card — and the row would
    // outlive the install it points into. Report it as already present, which
    // it is: as a built-in.
    const builtin = findBuiltinBotByPath(dir)
    if (builtin) return { ...builtin, alreadyExists: true }

    const manifestPath = botPaths(path, dir).manifest
    const content = yield* Effect.try({
      try: () => readManifest(manifestPath),
      catch: (cause) => fsReason("BOT.md", manifestPath, cause),
    })
    const manifest = yield* Effect.try({
      try: () => parseBotDocument(path, content, dir),
      catch: (cause) => invalidPath(cause instanceof Error ? cause.message : String(cause)),
    })

    // The whole read → check → write cycle runs under the registry lock; the
    // outcome is returned as data so the clash becomes a typed failure below
    // instead of an exception thrown through the lock.
    const outcome = yield* Effect.tryPromise({
      try: () =>
        withFileLock(BOTS_FILE, async (): Promise<Registration> => {
          const registry = await readRegistry()
          const existing = registry.bots.find((bot) => bot.path === dir)
          if (existing) return { kind: "existing", bot: resolveBot(path, existing, readManifest) }
          // Built-ins are in the clash check because they win at dispatch: a
          // registered Bot sharing the name would be listed, addable and
          // permanently unreachable. Refusing the add says so at the one moment
          // the user can still pick another name.
          const clash = findNameClash(mergeBuiltins(resolveRegisteredBots(registry)), manifest.name, dir)
          if (clash) return { kind: "clash", bot: clash }
          const record: BotRegistration = { id: `bot-${randomUUID()}`, path: dir, addedAt: new Date().toISOString() }
          await writeJsonFile(BOTS_FILE, { bots: [...registry.bots, record] })
          return { kind: "added", record }
        }),
      catch: (cause) => new FSError({ path: BOTS_FILE, op: "write", cause }),
    })

    switch (outcome.kind) {
      case "existing":
        return { ...outcome.bot, alreadyExists: true }
      case "clash":
        return yield* Effect.fail(invalidPath(`@${manifest.name} is already registered at ${outcome.bot.path}`))
      case "added":
        return { ...outcome.record, valid: true as const, ...manifest, alreadyExists: false }
    }
  })

const removeBot = (id: string): Effect.Effect<void, CockpitError> =>
  Effect.gen(function* () {
    // Built-in Bots are virtual — they live in no file, so there is nothing to
    // remove. The panel hides their delete button; this guards the endpoint.
    if (isBuiltinBotId(id)) {
      return yield* Effect.fail(new ValidationError({ field: "id", reason: "built-in Bots cannot be removed" }))
    }
    const removed = yield* Effect.tryPromise({
      try: () =>
        withFileLock(BOTS_FILE, async () => {
          const registry = await readRegistry()
          if (!registry.bots.some((bot) => bot.id === id)) return false
          await writeJsonFile(BOTS_FILE, { bots: registry.bots.filter((bot) => bot.id !== id) })
          return true
        }),
      catch: (cause) => new FSError({ path: BOTS_FILE, op: "write", cause }),
    })
    if (!removed) return yield* Effect.fail(new NotFoundError({ resource: "bot", id }))
  })

export const BotRegistryServiceLive = Layer.succeed(BotRegistryService, {
  list: listBots,
  add: addBot,
  remove: removeBot,
})
