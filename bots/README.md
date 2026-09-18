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
here, because the install is *tracked, file by file*.
`~/.cockpit/bots/.builtin-installs.json` holds the hash of every file installed, and
each one falls into one of four cases when a newer version ships:

| The file | On upgrade |
|---|---|
| still exactly as we wrote it | replaced with the new version |
| changed since we wrote it (by the user or by the Bot) | left alone, at this and every later version |
| gone from the new version, ours and untouched | deleted, so it stops instructing the Bot |
| never installed by us — the Bot's own memory | untouched, and not our business |

Per file, not per Bot, and the reason is memory: a Bot with memory writes into its own
directory on an ordinary turn, so judging the tree as a whole would read the first
remembered fact as "the user has taken this over" and cut the Bot off from every later
fix. Per file, memory lands in paths we never installed and the shipped files go on
being maintained. Deleting the folder resets everything and starts tracking afresh.

Updates are staged and swapped in whole, and are skipped entirely while a Bot session
holds `.locks/write` — nothing here is urgent enough to race a Bot mid-write.

Built-in *skills* solve the same problem differently — they rewrite their copy on
every dispatch — which works only because a skill directory has no user state in it.
A Bot's directory does, which is why this one compares before it writes.

## Memory

A built-in Bot's directory is writable like any other, so `bot-turn`'s writing protocol
applies unchanged and a built-in may keep memory. Two things are true of a built-in's
memory in particular, and its `BOT.md` is the only place they can be said:

- **It lives in that user's copy only.** Nothing is shared between installs, and
  nothing comes back to this repository.
- **What must never be recorded is Bot-specific.** `writing.md` already rules out
  anything re-readable from the source system; each built-in has to name what its
  source system is. `cockpit-helper` names opencockpit.dev — it remembers the person
  it works with, and never the site, because the site is always its own newest copy
  one fetch away while a stored copy is a stale answer waiting to be given.

A built-in that has nothing worth remembering should say so in its `BOT.md` rather
than leaving the question open: an empty `memory/` invites a session to fill it.

## Adding one

1. `mkdir bots/<name>` with a `BOT.md` (frontmatter: `name`, `description` — the
   description is what `@` autocomplete shows). The directory name is the `@name` and
   the installed folder name, so it must match the frontmatter `name`.
2. Say in it whether the Bot keeps memory, as `cockpit-helper/BOT.md` does.
3. Nothing else. `package.json#files` already ships `bots`, and no list needs editing.
