/**
 * /api/commands — list builtin slash commands for the autocomplete dropdown.
 *
 * Derived from the package's `skills/` directory (one subdirectory per command,
 * each holding a SKILL.md), NOT from a hand-written table. The previous version
 * kept its own BUILTIN_COMMANDS array that had to be edited in lockstep with the
 * dispatcher's command map — listing a name here without a matching expansion
 * made the dropdown advertise a command that silently no-opped. Both sides now
 * read the same directory, so the two cannot drift.
 *
 * `description` is each SKILL.md's frontmatter `description`. A skill whose
 * frontmatter says `hidden: true` is machinery reached by other means (bot-run
 * is pulled in by an `@bot` line) and is left out of this list — it would be a
 * command the user can type but never wants.
 *
 * Also used to enumerate `.md` files under `.claude/commands/` (project +
 * global), mirroring Claude Code's command convention; that convention has been
 * retired.
 */
import { Effect } from "effect"
import { handler } from "@cockpit/effect-runtime/server"
import { listBuiltinSkillsMeta } from "../lib/builtinSkills"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CommandInfo {
  name: string
  description: string
  source: "builtin" | "skill"
}

export const GET = handler(() =>
  Effect.sync(() => {
    const commands: CommandInfo[] = listBuiltinSkillsMeta()
      .filter((s) => !s.hidden)
      .map((s) => ({
        name: `/${s.name}`,
        description: s.description,
        source: "builtin",
      }))
    return new Response(JSON.stringify(commands), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  })
)
