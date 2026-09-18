# Built-in Bots

One directory per Bot, each with a `BOT.md` at its root — the same shape a user's own
Bot has (`/bot` creates those). The **directory set IS the registry**: both consumers
derive from `listBuiltinBots()` in
`packages/feature/agent/src/server/lib/builtinBots.ts`, so adding a built-in Bot is
`mkdir` + files, with no TypeScript list to keep in sync.

This file is a file, not a directory, so the scan never sees it as a Bot.

**These directories are seeds, not homes.** Each one is installed into
`~/.cockpit/bots/<name>` on first listing, and *that copy* is the Bot: it is the path
the panel prints, the folder button opens and `@name` dispatch reads. Nothing is ever
written back here. See the module comment in `builtinBots.ts` for why, and read
"Staying up to date" below before assuming a copy goes stale.

## What makes them different from registered Bots

|  | built-in (`/bots`) | registered (`bot.json`) |
|---|---|---|
| discovered by | directory scan of the install root | absolute paths in `~/.cockpit/bot.json` |
| in the Bots panel | yes, with a "Built-in" chip, no delete button | yes, removable |
| `@name` dispatch | yes — and survives a corrupt `bot.json` | yes |
| lives in | `~/.cockpit/bots/<name>`, installed from the seed | wherever the user made it |
| writable | yes — it is an ordinary copy | yes |

Built-ins are merged into the listing at read time and never written into `bot.json`:
their path moves with the install (npm global dir vs repo checkout, and again per
`COCKPIT_HOME`), so a persisted row would become a dead entry the user cannot delete
after the next upgrade. On a name clash the built-in wins, and `POST /api/bots` with a
built-in's path reports it as already present rather than writing a row.

## Staying up to date

The install root cannot host a Bot: it is root-owned under `npm i -g`, replaced
wholesale on upgrade, and shared by every `COCKPIT_HOME`, so a Bot living there could
not be opened, edited or written to. Hence the copy. The obvious cost of any copy is
drift — it stops receiving `BOT.md` updates the day it is made — and that is not paid
here, because the install is *tracked*:

- `~/.cockpit/bots/.builtin-installs.json` records the hash of the seed each copy was
  installed from.
- Copy still matches that hash and a newer seed shipped → the copy is replaced. An
  untouched built-in keeps improving with every upgrade.
- Copy no longer matches → the user has made it theirs. It is never touched again, at
  this or any later version.
- Deleting the folder resets it: the next listing installs the shipped version and
  starts tracking again.

Built-in *skills* solve the same problem differently — they rewrite their copy on
every dispatch — which works only because a skill directory has no user state in it.
A Bot's directory does, which is why this one compares before it writes.

## Memory

A built-in Bot's directory is writable like any other, so `bot-turn`'s writing
protocol works. Whether a given built-in *should* use it is the Bot's own decision,
stated in its `BOT.md`. `cockpit-helper` opts out: it answers every question by
fetching opencockpit.dev live in the same turn, so a stored copy would only ever be a
stale answer waiting to be given.

Bear in mind that memory a built-in writes lives only in that user's copy, and that
editing the Bot's own files is what stops future upgrades from reaching it (above).
Both are fine; neither is obvious from inside a session.

## Adding one

1. `mkdir bots/<name>` with a `BOT.md` (frontmatter: `name`, `description` — the
   description is what `@` autocomplete shows). The directory name is the `@name` and
   the installed folder name, so it must match the frontmatter `name`.
2. Say in it whether the Bot keeps memory, as `cockpit-helper/BOT.md` does.
3. Nothing else. `package.json#files` already ships `bots`, and no list needs editing.
