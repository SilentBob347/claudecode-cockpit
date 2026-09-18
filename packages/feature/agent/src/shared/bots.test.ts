import path from "node:path"
import { describe, expect, it } from "vitest"
import type { BotSummary } from "@cockpit/effect-services"
import { botPaths, findNameClash, mentionableBots, parseBotDocument, resolveBot } from "./bots"

const { posix, win32 } = path

describe("BOT.md parsing", () => {
  it("reads name and description from frontmatter", () => {
    expect(parseBotDocument(posix, "---\nname: arc\ndescription: Maintains decisions\n---\n\n# Arc\n", "/x/whatever"))
      .toEqual({ name: "arc", description: "Maintains decisions" })
  })

  it("falls back to the lowercased directory name without frontmatter", () => {
    expect(parseBotDocument(posix, "# Arc\n", "/bots/Arc")).toEqual({ name: "arc", description: "" })
    expect(parseBotDocument(win32, "# Arc\n", "C:\\bots\\Arc")).toEqual({ name: "arc", description: "" })
  })

  it("rejects names that cannot be typed as @name", () => {
    expect(() => parseBotDocument(posix, "---\nname: my bot\n---\n", "/bots/x")).toThrow("must match")
  })
})

describe("botPaths", () => {
  it("accepts either the directory or its BOT.md (POSIX)", () => {
    expect(botPaths(posix, "/bots/arc/")).toEqual({ dir: "/bots/arc/", manifest: "/bots/arc/BOT.md" })
    expect(botPaths(posix, "/bots/arc/BOT.md")).toEqual({ dir: "/bots/arc", manifest: "/bots/arc/BOT.md" })
  })

  it("handles Windows separators", () => {
    expect(botPaths(win32, "C:\\bots\\arc\\BOT.md")).toEqual({ dir: "C:\\bots\\arc", manifest: "C:\\bots\\arc\\BOT.md" })
    expect(botPaths(win32, "C:\\bots\\arc")).toEqual({ dir: "C:\\bots\\arc", manifest: "C:\\bots\\arc\\BOT.md" })
  })
})

describe("registry resolution", () => {
  const record = (id: string, dir: string) => ({ id, path: dir, addedAt: "" })
  const files: Record<string, string> = {
    "/bots/a/BOT.md": "---\nname: same\n---\n",
    "/bots/b/BOT.md": "---\nname: same\n---\n",
    "/bots/c/BOT.md": "---\nname: Bad Name\n---\n",
  }
  const read = (manifest: string) => {
    if (!(manifest in files)) throw new Error(`ENOENT ${manifest}`)
    return files[manifest]
  }
  const bots: BotSummary[] = ["a", "b", "c", "missing"].map((key) => resolveBot(posix, record(key, `/bots/${key}`), read))

  it("keeps broken Bots as invalid summaries with a reason", () => {
    expect(bots.map((bot) => [bot.name, bot.valid])).toEqual([["same", true], ["same", true], ["c", false], ["missing", false]])
    expect(bots[3]).toMatchObject({ valid: false, error: expect.stringContaining("ENOENT") })
  })

  it("lets the earliest registration win a name clash for @ dispatch", () => {
    expect([...mentionableBots(posix, bots)]).toEqual([["same", "/bots/a/BOT.md"]])
  })

  it("finds clashes against other directories only", () => {
    expect(findNameClash(bots, "same", "/bots/a")?.path).toBe("/bots/b")
    expect(findNameClash(bots, "c", "/bots/z")).toBeUndefined()
  })
})
