---
name: bot
description: "Create a Bot: a plain directory with BOT.md and long-term context, addressed as @name."
argument-hint: "[what the Bot is for]"
---

# Creating a Bot

A **Bot** is a plain directory with a `BOT.md` at its root. Once registered, a line starting with
`@name` in any chat is handed to a session of its own, which reads `BOT.md` and uses the Bot's
files as its long-term context. Its files change only when the user explicitly asks (remember /
update / correct / forget), under a short write lock, so parallel sessions keep reading freely.

**This skill does one thing: create a new Bot.** Everything you can do *to* an existing Bot is
addressed to the Bot itself, not to this command — `@name 复盘一下` to review it, `@name 装上
<path to SKILL.md>` to give it a tool, `@name <task>` for ordinary work. That is where those
instructions live too, so they improve for every existing Bot at once. If the request is about a
Bot that already exists, say which `@name` line does it and stop.

`curl -s {{BASE_URL}}/api/bots` lists registered Bots with their `name`, `description` and
absolute `path` — use it to check a new name for clashes.

## 1. Create: align first, write only after confirmation

1. **Align on the Bot** — restate in a few lines what this Bot is for: its role, what it
   should remember, and what it is responsible for keeping up to date. Ask back only when the
   request is genuinely ambiguous.
2. **Tell the name and directory** — resolve both and state them exactly:
   - **You pick `<name>`** from the request: lowercase letters, digits and `-`, starting with a
     letter or digit (it becomes the `@name` mention). Check it against the registry above.
   - The user gave a directory → `<that directory>/<name>/`; none given →
     `{{COCKPIT_DIR}}/bots/<name>/`.
   - The target must not already exist, or must be empty. Never overwrite an existing directory.
3. **Write only after confirmation** — once the user agrees, create the files below with
   `Write`.
4. **Hand over registration** — do NOT register it yourself. Tell the user the directory
   path and the two ways to add it: open the **Bots** panel → **Add bot** and paste the path,
   or open `BOT.md` in the file explorer and click its **Add as Bot** button.
5. **Say what it can now be asked**, in three lines — this is the only place the user learns the
   verbs, since `@` autocomplete shows only the description:
   - `@<name> <task>` — ordinary work, in its own session, with its files as context
   - `@<name> 复盘一下` — a sweep for stale entries, contradictions and dangling commitments
   - `@<name> 装上 <path to SKILL.md>` — teach it a tool it may use

## 2. Layout

```text
<name>/
├── BOT.md                  # manifest + operating manual (the subagent reads this first)
├── identity/
│   ├── persona.md          # stable role, voice, scope
│   └── principles.md       # operating principles and boundaries
├── relationships/
│   └── user.md             # confirmed preferences of the people it works with
├── memory/
│   ├── facts.md            # durable, verified facts
│   └── procedures.md       # procedures proven by successful execution
├── projects/               # created on demand: projects/<project-name>/CONTEXT.md
├── skills/                 # created on demand: this Bot's own SKILL.md files
├── commitments/
│   └── active.md           # open promises and follow-ups
├── evidence/
│   └── refs.md             # sources backing the entries above
└── secrets/                # only if this Bot has credentials of its own — never read, never printed
```

Two more directories appear on their own and are never scaffolded: `.locks/` (the write lock) and
`.reviews/` (one uniquely timestamped file per review sweep). Both are work products, never memory — nothing
reads them as fact.

Credentials belong to the tool, not to the Bot: a skill's `.env` files stay next to that skill, so
several Bots share one copy and no key is duplicated. `<bot>/secrets/` is for the rare case where
the credential really is this Bot's own (its own account). Either way it is gitignored when the
directory is a repository.

Seed `identity/persona.md` and `identity/principles.md` from what the user told you. Every
other file starts as a heading plus a one-line HTML comment describing its purpose — never
invent facts, preferences, or history.

## 3. BOT.md

Frontmatter is only `name` and `description` (the description is what the `@` autocomplete shows).

The body says **who this Bot is** — its role, which of its files to read, which skills it has, and
where new entries belong. It does NOT restate how a Bot turn works: reading rules, entry format,
the write lock, the non-recording list and the reporting rules all live in the hidden `bot-turn`
skill, which is handed to the session alongside this file. Keep it that way. Anything written here
is copied into every Bot and frozen on the user's disk; anything in `bot-turn` is fixed once and
every existing Bot gets the fix. Put in `BOT.md` only what would be wrong in another Bot's.

````markdown
---
name: <name>
description: "<one line: what this Bot knows and maintains>"
---

# <name>

<one paragraph: role and scope>

## Before working

Read, relative to this file's directory:

- identity/persona.md and identity/principles.md — always
- relationships/user.md and commitments/active.md — always
- memory/facts.md and memory/procedures.md — when relevant to the task
- projects/<project-name>/CONTEXT.md — when the task concerns that project
- the Skills table below — always; open a listed SKILL.md only when the task matches its row

Reading rules, entry format, when writing is allowed, the write lock and the reporting rules are
the same for every Bot: they are in the `bot-turn` skill you were handed with this file. If you do
not have it, say so rather than inventing a protocol — especially the write lock.

## Skills

| Skill | When to use | File |
|---|---|---|
| <name> | <the kind of task it applies to> | <absolute path to SKILL.md> |

## Updating

Only when the task explicitly asks to remember, update, correct or forget something (`bot-turn`
§3–§4 covers the rest: metadata, what never gets recorded, the write lock). Where things go in
this Bot:

- a confirmed fact or a correction → memory/facts.md (mark the old entry `status: superseded` or replace it; never leave a contradiction)
- a decision and its reason → memory/facts.md under `## Decisions`, dated
- a user preference → relationships/user.md
- a promise made or completed → commitments/active.md, with `done-when`, `waiting-on` and
  `next-check` (`status: done` or `cancelled` when it ends)
- a procedure that just worked → memory/procedures.md
- project status changes → projects/<project-name>/CONTEXT.md, where `<project-name>` is the
  project's name in lowercase kebab-case (by default its root directory name); reuse an existing
  directory for the same project instead of creating a second one
- where the information came from → evidence/refs.md

<Anything that is true of THIS Bot only: a file it must never touch, a project whose CONTEXT.md
is authoritative, a person whose word settles a question.>
````

Adapt the lists to the Bot's purpose, but keep the sections: together with `bot-turn` they are the
only contract between the Bot and whoever runs it. Resist copying any of `bot-turn` back in here —
a frozen copy is exactly what this split exists to prevent.
