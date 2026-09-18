# Built-in Bots

One directory per Bot, each with a `BOT.md` at its root — the same shape a user's own
Bot has (`/bot` creates those). The **directory set IS the registry**: both consumers
derive from `listBuiltinBots()` in
`packages/feature/agent/src/server/lib/builtinBots.ts`, so adding a built-in Bot is
`mkdir` + files, with no TypeScript list to keep in sync.

This file is a file, not a directory, so the scan never sees it as a Bot.

## What makes them different from registered Bots

|  | built-in (`/bots`) | registered (`bot.json`) |
|---|---|---|
| discovered by | directory scan of the install root | absolute paths in `~/.cockpit/bot.json` |
| in the Bots panel | yes, with a "Built-in" chip, no delete button | yes, removable |
| `@name` dispatch | yes — and survives a corrupt `bot.json` | yes |
| writable | **no** | yes (that is where a Bot's memory lives) |

Built-ins are merged into the listing at read time and never written into `bot.json`:
their path moves with the install (npm global dir vs repo checkout, and again per
`COCKPIT_HOME`), so a persisted row would become a dead entry the user cannot delete
after the next upgrade. On a name clash the built-in wins, and `POST /api/bots` with a
built-in's path reports it as already present rather than writing a row.

## The read-only rule

A Bot normally writes its own memory. A built-in cannot: the install root is
root-owned under `npm i -g`, is replaced wholesale on upgrade, and is shared by every
`COCKPIT_HOME` on the machine — so writes are refused, lost, or leak between a user's
dev and prod data.

So **a built-in Bot must be one that has nothing to remember**, and its `BOT.md` must
say so, telling the session not to follow `bot-turn`'s writing protocol and to point
the user at `/bot` when they ask it to remember something. `cockpit-helper` qualifies
because it answers every question by fetching opencockpit.dev live in the same turn.

Do not "fix" this by copying a built-in into `~/.cockpit` on first run. That trades
this limitation for a worse one: the copy stops receiving BOT.md updates forever,
which is exactly the drift the built-in skill mechanism rewrites its copy on every
dispatch to avoid — and rewriting is what a Bot's directory can never survive.

## Adding one

1. `mkdir bots/<name>` with a `BOT.md` (frontmatter: `name`, `description` — the
   description is what `@` autocomplete shows).
2. State the read-only rule in it, as `cockpit-helper/BOT.md` does.
3. Nothing else. `package.json#files` already ships `bots`, and no list needs editing.
