---
title: Exporting a Bot as a template
---

# Export — "导出 / export / 生成模版 / clone 一份 / 分享给别人"

Make a **new Bot directory somewhere else**, derived from this one and fit to hand to someone
else. The source Bot is read and never changed.

What makes this worth a mode of its own is that a Bot's working directory is the wrong thing to
share: it holds the write lock, review reports, this user's memory, and paths that only exist on
this machine. Copying it wholesale hands all four to a stranger — usually into a public
repository, where the mistake cannot be taken back.

Two neighbouring requests are different jobs — if that is what the user meant, say so and stop:

- *"back this Bot up" / "sync it to my other machine"* → that is `cp -r` or a repository of the
  directory as it stands. Export deliberately **drops the memory**, which is the opposite of a
  backup.
- *"rename this Bot"* → edit `BOT.md`'s frontmatter `name` and re-register it. One Bot, not two.

## 1. Resolve the target

- **The target path is required.** If the user did not give one, ask; never pick a directory for
  them. An export usually belongs in their own repository, not under `~/.cockpit`.
- A relative target resolves against your working directory, which on an export is the Bot's own
  directory — so `../shared-bot` means a sibling of the Bot, not of the project. Resolve it, then
  say the absolute path back before writing anything.
- **The target's directory name becomes the new Bot's `name`** and must match
  `^[a-z0-9][a-z0-9-]{0,63}$`. If it does not, stop and ask for another path.
- **The target must not exist, or must be empty. Never overwrite.**

## 2. What comes across — a whitelist

| Copied | Left behind |
|---|---|
| `BOT.md`, rewritten per §3 | `memory/` `relationships/` `commitments/` `evidence/` `projects/` — recreated as empty scaffolding |
| `identity/` — all of it | `.locks/` `.reviews/` — work products, never part of a Bot |
| `skills/` — all of it | `secrets/`, `.env*`, any credential file — never opened, never copied |
| | anything else at all — by default, it stays |

**A whitelist, not a blacklist**, for one reason: a Bot directory grows. A list of things *not*
to copy is correct the day it is written and wrong the day the Bot grows a `notes/`, which then
travels into a public repository unnoticed. Deny by default, then report what was denied and let
the user name exceptions (§5) — that is the only direction that does not rot.

The scaffolding you recreate is what `/bot` creates for a new Bot: each file is a heading plus a
one-line HTML comment stating its purpose. **Never invent facts, preferences or history** to fill
them; an empty Bot with an honest `memory/facts.md` is the point.

## 3. Rewrite BOT.md

- **`name` → the target directory name.** Leaving the source's name means the recipient's
  registration is refused outright as a clash the first time they try to add it — and if they
  are the same person, it clashes with the Bot they exported from.
- `description` stays, unless the user gives a new one.
- `## Before working` and `## Updating` stay **verbatim**. They are this Bot's operating manual,
  which is exactly the thing being shared.
- `## Skills` — rewrite row by row:

| The last column holds | Do |
|---|---|
| a registered skill's name (no `/`) | nothing — a name is already portable, and carrying it over is what lets the recipient supply the tool themselves |
| a path inside the source Bot (`skills/…`) | nothing — it travelled with `skills/` and stays relative |
| an absolute path | look it up in `curl -s {{BASE_URL}}/api/skills`; if a registered skill has that path, replace the cell with its **name**. If not, leave the path and list the row in the report as "works only on the author's machine" |

Names are the whole reason a shared Bot's Skills table survives the trip: the recipient registers
a skill under that name — their own copy, their own location — and the row resolves for them
exactly as it did for the author. A path could never do that, because the only paths that exist on
both machines are the ones neither of them chose.

An absolute path that no registered skill matches cannot be fixed here: that tool is not in the
registry, so there is no name to hand over. Leave it, report it, and let the author decide whether
to register the skill and export again.

## 4. Read what you are copying

`identity/` and `skills/` are copied whole, and they are written by hand, so they are where local
traces hide. Read every file that goes across and **report — do not silently edit** (the wording
is the author's):

- absolute paths carrying a username or machine name (`/Users/<name>/…`, `/home/<name>/…`)
- company names, project code names, people's names — in a public repository these are things the
  author may never have meant to publish
- anything that looks like a credential (a token, a key, a URL with a password in it). **Stop
  here**: do not write that file into the export, and say which file and which line.

## 5. Report

Export writes only to the new directory and changes nothing under the source Bot, so it takes
**no write lock** — the same reasoning that exempts `.reviews/`: a work product is not memory. The
one thing to avoid is recording "I exported this" back into the source Bot; that would be a write,
and `writing.md` applies in full.

The report has four parts:

1. **The path**, and what now stands there: a registrable Bot with no memory in it.
2. **What came across** — the file list.
3. **What stayed behind** — per file, with counts (`memory/facts.md` 12 entries,
   `commitments/active.md` 3 open). Then ask, once: *are any of these general enough to belong in
   the new Bot?* If the user names some, copy those entries across with their metadata intact.
   This is the only moment an export touches remembered content, and it happens on their say-so.
4. **What the recipient has to supply** — every skill name the exported `## Skills` table now
   references. That list is the Bot's whole installation requirement: register a skill under each
   of those names and the table resolves. Follow it with what will *not* resolve — the rows left as
   absolute paths — plus everything §4 found.

## 6. Do not register it

Say the directory path and the two ways to register it — the **Bots** panel → **Add bot** with
that path, or opening its `BOT.md` in the file explorer and clicking **Add as Bot** — and stop
there. An export is usually on its way into a repository and then to someone else; registering it
here would decide, on the user's behalf, that it belongs to this machine.
