import { describe, expect, it } from "vitest"
import { detectBotName } from "./botSession"
import { buildChildPrompt } from "../effect/delegationLive"

describe("detectBotName", () => {
  it("names the Bot from the delegated first message", () => {
    expect(
      detectBotName(
        "Task: @glasser: OpenCockpit 外部影响力调研\n" +
          "[Delegated from Cockpit session /project?cwd=%2Fp&sessionId=s1&view=agent (cockpit)]\n\n" +
          "Read this task brief first, then carry it out: /tmp/brief"
      )
    ).toBe("glasser")
  })

  it("matches what buildChildPrompt actually writes", () => {
    const prompt = buildChildPrompt(
      { cwd: "/p", engine: "claude", title: "@arc: record the decision", prompt: "do it" },
      { link: "/project?cwd=%2Fp&sessionId=s1&view=agent", cwd: "/parent", sessionId: "s1" }
    )
    expect(detectBotName(prompt)).toBe("arc")
  })

  it("works without a parent line (a curl delegation has none)", () => {
    expect(detectBotName("Task: @arc: tidy up")).toBe("arc")
  })

  it("accepts a title with no colon after the name", () => {
    expect(detectBotName("Task: @arc tidy up")).toBe("arc")
  })

  it("leaves the DISPATCHER's own session unmarked", () => {
    expect(detectBotName("@glasser 调研一下 OpenCockpit 的外部影响力")).toBeUndefined()
    expect(detectBotName("Please ask @glasser to look into this")).toBeUndefined()
  })

  // Decided, not incidental: a delegated sub-task with no @name stays unmarked.
  it("ignores a delegated task that names no Bot", () => {
    expect(detectBotName("Task: refresh the changelog\n[Delegated from Cockpit session x (p)]")).toBeUndefined()
  })

  it("rejects mentions that cannot be Bot names", () => {
    expect(detectBotName("Task: @Glasser: uppercase is not a Bot name")).toBeUndefined()
    expect(detectBotName("Task: @-arc: leading dash")).toBeUndefined()
  })

  it("has no opinion on an empty or missing message", () => {
    expect(detectBotName("")).toBeUndefined()
    expect(detectBotName(null)).toBeUndefined()
    expect(detectBotName(undefined)).toBeUndefined()
  })
})
