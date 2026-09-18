---
title: Attaching a skill to a Bot
---

# Attach a skill — "装上 / 安装 / attach / 加个技能"

"安装 / install / attach a skill" for a Bot means one thing: **the Bot learns that a tool exists
and when to reach for it.** Add a row to that Bot's Skills table. Do not copy the SKILL.md, do not
symlink it, do not touch `skills.json`, and do not install any binary the skill talks about.

Two neighbouring requests are different jobs — if that is what the user meant, say so and stop:

- *"make `/name` available in chat"* → registering in the skills registry (the Skills panel, or the
  SKILL.md button in the file explorer). Nothing to do with Bots — except that a registered skill
  is the one case where this command can write a portable row, so if the user is about to do both,
  say that registering first is worth it.
- *"install the CLI this skill uses"* → installing software. Check `which <cli>` and tell the user
  what is missing; do not install it as a side effect of attaching a skill.

Steps:

1. Read that SKILL.md's frontmatter for its `name` and `description`. Refuse a path that does not
   exist or has no frontmatter `name`.
2. **Decide what the last column says.** A Bot should *name* its tools rather than locate them, so
   that the row still means something on another machine:

   | The SKILL.md is | Write |
   |---|---|
   | registered — it appears in `curl -s {{BASE_URL}}/api/skills` | its **`name`**, nothing else |
   | inside this Bot (`<bot>/skills/<name>/SKILL.md`) | the path **relative to the Bot directory** |
   | neither | the absolute path, plus a plain warning that this row works on this machine only, and that registering the skill would turn it into a portable name |

   Match on the registry's `name`, not on the path you were given: a skill re-registered from a
   moved directory keeps its name, and surviving that move is the point of writing a name down.
3. Write one row into `BOT.md`'s `## Skills` table — skill name, when to use it (one clause,
   derived from the description but phrased for this Bot's work), and the cell from step 2. This is
   a write: follow `{{COCKPIT_DIR}}/skills/bot-turn/writing.md`, lock included. Create the
   `## Skills` section if the BOT.md predates it.
4. Say exactly which row you added, and name the two things you did not do (no global registration,
   no binary installed) so the user can correct you in one line.

A skill this Bot itself grew — a procedure that hardened into a repeatable operating manual — lives
at `<bot>/skills/<name>/SKILL.md` and gets a row in the same table. The line against
memory/procedures.md: a procedure is prose about how something was done; a skill is an operating
manual meant to be followed step by step.
