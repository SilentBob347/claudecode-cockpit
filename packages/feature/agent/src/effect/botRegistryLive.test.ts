// Registry service over a throwaway COCKPIT_HOME (paths.ts reads it at module
// load, so env is set before importing).
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect, Exit } from "effect"

// .native to match botRegistryLive; on Windows the JS realpath keeps 8.3 short
// names (C:\\Users\\RUNNER~1\\…) and the native one expands them, so a fixture
// path built with the wrong one never equals what the registry stores.
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bot-registry-")))
process.env.COCKPIT_HOME = path.join(root, "cockpit")
// Pins the built-in Bot scan to this temp tree: COCKPIT_ROOT is otherwise the
// checkout (or, for a Cockpit-spawned agent, the installed package), which would
// mix the real shipped Bots into every assertion here.
process.env.COCKPIT_ROOT = root
// A built-in has two directories: the shipped seed under the install root, and
// the copy installed into the user's Bot folder on first listing, which is the
// one it actually runs from.
const BUILTIN_SEED = path.join(root, "bots", "site")
const BUILTIN_HOME = path.join(root, "cockpit", "bots", "site")

type Services = typeof import("@cockpit/effect-services")
let services: Services
let live: typeof import("./botRegistryLive")

const makeBot = (dirName: string, manifest: string): string => {
  const dir = path.join(root, dirName)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "BOT.md"), manifest)
  return dir
}

const run = <A, E>(fn: (registry: import("@cockpit/effect-services").BotRegistryService) => Effect.Effect<A, E>) =>
  Effect.runPromiseExit(
    Effect.gen(function* () {
      return yield* fn(yield* services.BotRegistryService)
    }).pipe(Effect.provide(live.BotRegistryServiceLive)),
  )

const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail" ? (exit.cause.error as { _tag: string; reason?: string }) : null

beforeAll(async () => {
  services = await import("@cockpit/effect-services")
  live = await import("./botRegistryLive")
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("BotRegistryServiceLive", () => {
  it("registers by BOT.md path, then reports the directory as already added", async () => {
    const dir = makeBot("arc", "---\nname: arc\ndescription: Decisions\n---\n")
    const first = await run((r) => r.add(path.join(dir, "BOT.md")))
    expect(first).toMatchObject({ _tag: "Success", value: { name: "arc", valid: true, alreadyExists: false } })
    // The stored path is whatever realpath canonicalizes to; what matters is that
    // all three spellings land on the SAME entry, so assert against that, not
    // against the fixture path.
    const stored = Exit.isSuccess(first) ? (first.value as { path: string }).path : ""
    expect(stored).toBeTruthy()
    const again = await run((r) => r.add(`${dir}/`))
    expect(again).toMatchObject({ _tag: "Success", value: { path: stored, alreadyExists: true } })
  })

  it("rejects relative paths, missing directories, missing BOT.md and name clashes", async () => {
    expect(failure(await run((r) => r.add("relative/bot")))).toMatchObject({ _tag: "ValidationError", reason: "must be absolute" })
    expect(failure(await run((r) => r.add(path.join(root, "nope"))))?.reason).toContain("directory not found")
    // An unreadable directory is not a missing one — the errno has to survive,
    // or the user hunts for a folder that is sitting right there.
    // chmod 0o000 blocks nothing for root, and on Windows only toggles the
    // read-only bit — the read still succeeds and there is no errno to check.
    if (process.getuid?.() !== 0 && process.platform !== "win32") {
      const sealed = path.join(root, "sealed")
      fs.mkdirSync(sealed, { recursive: true })
      fs.writeFileSync(path.join(sealed, "BOT.md"), "---\nname: sealed\n---\n")
      fs.chmodSync(path.join(sealed, "BOT.md"), 0o000)
      try {
        const reason = failure(await run((r) => r.add(sealed)))?.reason ?? ""
        expect(reason).toContain("EACCES")
        expect(reason).not.toContain("not found")
      } finally {
        fs.chmodSync(path.join(sealed, "BOT.md"), 0o644)
      }
    }
    fs.mkdirSync(path.join(root, "empty"))
    expect(failure(await run((r) => r.add(path.join(root, "empty"))))?.reason).toContain("BOT.md not found")
    const twin = makeBot("twin", "---\nname: arc\n---\n")
    expect(failure(await run((r) => r.add(twin)))?.reason).toContain("@arc is already registered")
  })

  it("lists broken Bots as invalid and removes registrations without touching files", async () => {
    const dir = makeBot("broken", "# no frontmatter\n")
    const added = await run((r) => r.add(dir))
    expect(added._tag).toBe("Success")
    const stored = Exit.isSuccess(added) ? (added.value as { path: string }).path : ""
    fs.rmSync(path.join(dir, "BOT.md"))

    const listed = await run((r) => r.list)
    const broken = Exit.isSuccess(listed) ? listed.value.find((bot) => bot.path === stored) : undefined
    expect(broken).toMatchObject({ valid: false, name: "broken" })

    await run((r) => r.remove(broken!.id))
    const after = await run((r) => r.list)
    expect(Exit.isSuccess(after) && after.value.some((bot) => bot.path === stored)).toBe(false)
    expect(fs.existsSync(dir)).toBe(true)
    expect(failure(await run((r) => r.remove(broken!.id)))).toMatchObject({ _tag: "NotFoundError" })
  })

  // bot.json is a plain file the user is invited to hand-edit, so a stray comma
  // is a realistic state. Reading it as `{bots: []}` and then writing that back
  // deletes every registration and reports success — the add must fail instead,
  // leaving the bytes exactly as the user left them.
  it("refuses to touch a malformed bot.json instead of replacing it", async () => {
    const registryFile = path.join(root, "cockpit", "bot.json")
    const keeper = makeBot("keeper", "---\nname: keeper\n---\n")
    expect((await run((r) => r.add(keeper)))._tag).toBe("Success")

    const corrupt = '{"bots": [{"id": "bot-1", "path": "/x",}]}'
    fs.writeFileSync(registryFile, corrupt)

    const newcomer = makeBot("newcomer", "---\nname: newcomer\n---\n")
    const exit = await run((r) => r.add(newcomer))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(fs.readFileSync(registryFile, "utf-8")).toBe(corrupt)

    // Listing must fail too: "you have no Bots" is the same lie, one step earlier.
    expect(Exit.isFailure(await run((r) => r.list))).toBe(true)

    fs.writeFileSync(registryFile, JSON.stringify({ bots: [] }))
  })

  // ── Built-in Bots (shipped under <install root>/bots, never in bot.json) ──

  it("lists built-ins first, installed under COCKPIT_HOME, as unremovable virtual entries", async () => {
    fs.mkdirSync(BUILTIN_SEED, { recursive: true })
    fs.writeFileSync(path.join(BUILTIN_SEED, "BOT.md"), "---\nname: site\ndescription: Reads the website\n---\n")

    const listed = await run((r) => r.list)
    expect(Exit.isSuccess(listed)).toBe(true)
    const bots = Exit.isSuccess(listed) ? listed.value : []
    expect(bots[0]).toMatchObject({
      id: "builtin:site",
      // The user's copy, not the install root the seed sits in: this path is
      // what the panel prints and what the folder button opens.
      path: BUILTIN_HOME,
      name: "site",
      description: "Reads the website",
      valid: true,
      builtin: true,
      addedAt: "",
    })
    expect(fs.existsSync(path.join(BUILTIN_HOME, "BOT.md"))).toBe(true)
    // Registered Bots carry no `builtin` key at all, so the panel's chip and its
    // hidden delete button key off one thing.
    expect(bots.filter((bot) => bot.id !== "builtin:site").every((bot) => bot.builtin === undefined)).toBe(true)

    expect(failure(await run((r) => r.remove("builtin:site")))).toMatchObject({
      _tag: "ValidationError",
      reason: "built-in Bots cannot be removed",
    })
  })

  it("reports either of a built-in's paths as already present instead of writing a row", async () => {
    const registryFile = path.join(root, "cockpit", "bot.json")
    const before = fs.readFileSync(registryFile, "utf-8")
    // Both are paths a user can paste into "Add bot" — the one the panel shows,
    // and the seed they may have found by browsing the install.
    for (const dir of [BUILTIN_HOME, BUILTIN_SEED]) {
      const exit = await run((r) => r.add(dir))
      expect(exit).toMatchObject({ _tag: "Success", value: { id: "builtin:site", builtin: true, alreadyExists: true } })
    }
    // The row would be filtered out of every later list and would outlive the
    // install it points into, so it must never reach the file.
    expect(fs.readFileSync(registryFile, "utf-8")).toBe(before)
  })

  it("drops a hand-written registration of a built-in's directory, letting the built-in win", async () => {
    const registryFile = path.join(root, "cockpit", "bot.json")
    const before = JSON.parse(fs.readFileSync(registryFile, "utf-8")) as { bots: unknown[] }
    fs.writeFileSync(
      registryFile,
      JSON.stringify({
        // Pointing at the SEED: rows like this were written by hand back when a
        // built-in could only be reached by adding its shipped path, and they
        // are still on disk. Matching only the installed path would let them
        // resurface as a second card the moment the built-in moved.
        bots: [...before.bots, { id: "bot-manual", path: BUILTIN_SEED, addedAt: new Date().toISOString() }],
      }),
    )

    const listed = await run((r) => r.list)
    const rows = Exit.isSuccess(listed)
      ? listed.value.filter((bot) => bot.path === BUILTIN_SEED || bot.path === BUILTIN_HOME)
      : []
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("builtin:site")

    fs.writeFileSync(registryFile, JSON.stringify(before))
  })

  it("refuses a registered Bot that would be shadowed by a built-in's name", async () => {
    // It would list, add and then never answer an `@site` line: built-ins come
    // first, and the earliest entry for a name wins at dispatch.
    const shadow = makeBot("shadow", "---\nname: site\n---\n")
    expect(failure(await run((r) => r.add(shadow)))?.reason).toContain("@site is already registered")
  })
})
