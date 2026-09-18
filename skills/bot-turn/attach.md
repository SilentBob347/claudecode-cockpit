---
title: Attaching a skill to a Bot
---

# Attach a skill — "装上 / 安装 / attach / 加个技能"

"安装 / install / attach a skill" for a Bot means one thing: **the Bot learns that a tool exists
and when to reach for it.** Add a row to that Bot's Skills table. Do not copy the SKILL.md, do not
symlink it, do not touch `skills.json`, and do not install any binary the skill talks about.

Two neighbouring requests are different jobs — if that is what the user meant, say so and stop:

- *"make `/name` available in chat"* → registering in the skills registry (the Skills panel, or the
  SKILL.md button in the file explorer). Nothing to do with Bots.
- *"install the CLI this skill uses"* → installing software. Check `which <cli>` and tell the user
  what is missing; do not install it as a side effect of attaching a skill.

Steps:

1. Read that SKILL.md's frontmatter for its `name` and `description`. Refuse a path that does not
   exist or has no frontmatter `name`.
2. Write one row into `BOT.md`'s `## Skills` table — name, when to use it (one clause, derived from
   the description but phrased for this Bot's work), absolute path. This is a write: follow
   `{{COCKPIT_DIR}}/skills/bot-turn/writing.md`, lock included. Create the `## Skills` section if
   the BOT.md predates it.
3. Say exactly which row you added, and name the two things you did not do (no global registration,
   no binary installed) so the user can correct you in one line.

A skill this Bot itself grew — a procedure that hardened into a repeatable operating manual — lives
at `<bot>/skills/<name>/SKILL.md` and gets a row in the same table. The line against
memory/procedures.md: a procedure is prose about how something was done; a skill is an operating
manual meant to be followed step by step.
