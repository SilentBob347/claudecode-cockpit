---
title: Reviewing a Bot
---

# Review — "复盘 / review / 体检 / 整理记忆 / 有没有过期的"

A Bot only ever grows. Facts go stale, preferences start contradicting each other, finished
commitments stay open. A normal `@name` turn never notices — it reads for the task at hand. This
mode is the sweep that does, and it is the one time the whole directory is read.

The Bot is the one whose `BOT.md` you were handed; there is nothing to resolve.

**Read everything** in its directory — except `.env*`, `secrets/` and any other credential file,
which are skipped unopened — then check eleven things:

| Check | What to look for |
|---|---|
| Stale | `expires` passed, or a time-bound entry (numbers, versions, roles, status) whose `confirmed` date is old |
| Contradiction | Two entries claiming different things about one subject — classify it, see below |
| Dangling | An `active` commitment whose `next-check` has passed, whose `done-when` already holds, or that has had no movement and no dates at all |
| Unsourced | An entry with no `source`, or a `source` pointing at nothing in `evidence/refs.md` |
| Duplicate | The same information written in two files |
| Placeholder | A scaffolded file still holding only its heading and comment |
| Broken skill | A row in the Skills table whose file no longer exists |
| Orphaned | An `active` conclusion whose basis was superseded or disputed — judge it by reading, no field records this |
| Oversized | The directory outgrew its read rules — see "Growing up" below |
| Frozen machinery | `BOT.md` restates something that now lives in the `bot-turn` skill — the write lock, the entry format, the non-recording list, the reading or reporting rules. Its copy can no longer be improved; propose replacing it with the per-Bot content only |
| Fake entry | A realistic-looking `## title` + metadata block sitting inside a fenced example in `BOT.md` — it will be read back as a fact. Propose turning it into placeholders |

Not every apparent contradiction is one. Classify before proposing anything:

| Class | Example | Handling |
|---|---|---|
| Temporal | an address changed from A to B | the newer one supersedes the older; keep the old as history |
| Scope | CNY domestically, USD overseas | **not a conflict** — split into two scoped entries, never pick one |
| Authority | an `inferred` entry contradicts a `user-confirmed` one | the inferred side loses |
| Normative | two rules forbid each other | stop and ask the user; never resolve it yourself |
| Factual | two credible sources disagree | keep both, mark them disputed, ask — never silently take the newer |

"Last write wins" is never the rule for preferences, commitments or user-confirmed facts.

**Orphaned** is the one check nothing on the page marks for you. Entries do not record what they
were derived from, so read for it: a decision that rests on a fact, a procedure that assumes a tool
or a version, a project plan built on a constraint. When that basis is now `superseded`, `expired`
or disputed, the conclusion on top of it is suspect even though it still says `active`. Report it;
do not decide it — the conclusion may well survive its original reason.

**Growing up.** A Bot outgrows its own read rules, and the review is when that gets noticed and
fixed. Flag `Oversized` when a single memory file passes roughly 200 lines, or when what `BOT.md`
reads "always" no longer fits comfortably in a turn. The fix, once the user agrees, is yours to
carry out:

- split the oversized file by subject into several files under the same directory;
- add an `INDEX.md` per split directory: one line per entry — title, one clause, file name;
- rewrite that Bot's `## Before working` so it reads the indexes first and opens individual
  entries on demand, keeping commitments and the current project as "always".

That is the whole of it: no budget arithmetic, no retrieval layer. Do it when the size says so,
not before.

**Write the list to a uniquely named `.reviews/<YYYY-MM-DD>-<HHMMSS>.md` and change nothing
else.** If that name already exists, add a short unique suffix rather than overwriting it. This is
the sole Bot-directory write that does not take the memory write lock: the report is a work
product, not memory, and is never read back as fact. The next review opens it only to see what was
already looked at. This turn ends when you answer, so that path is what lets the work be picked up
later.

**Report the same numbered list and change nothing in the Bot.** One row per finding: type, file and entry, what is
wrong, and the suggested action. Mark the rows you cannot decide alone — whether a number changed
or a promise was kept is the user's knowledge, not yours. End with: reply with the numbers to
apply, or "all".

```text
@robert review — 12 entries, 5 findings

 #  Type           Entry                        Problem                              Suggestion
 1  Stale          memory/facts.md#q3-budget    confirmed 2026-03, holds figures     ask the user for the current figure
 2  Contradiction  relationships/user.md        "use tables" vs "keep it short"      keep the newer one, supersede the older
 3  Dangling       commitments/active.md#list   no movement in 6 months              confirm; mark done if finished
 4  Unsourced      memory/facts.md#npm-stats    figures with no source               add a refs.md link, or downgrade to an observation
 5  Placeholder    identity/persona.md          still the scaffold                   ask the user for two or three lines
 6  Orphaned       memory/facts.md#npm-metric   rests on #npm-stats, now superseded   re-check whether the decision still holds
 7  Oversized      memory/facts.md              310 lines, read every turn            split by subject + INDEX.md, update Before working

1, 3 and 6 need your answer first. Reply with numbers ("1 3") or "all".
Saved to .reviews/2026-09-18-143012.md
```

Offer both ways to carry on: reply **in this session** with the numbers, or say
`@<name> apply .reviews/<review-file>.md rows 1 3` in any chat — a fresh session reads the file and has
the whole list back.

**Apply only the picked rows**, routing by `BOT.md`'s `## Updating`. Read
`{{COCKPIT_DIR}}/skills/bot-turn/writing.md` first if you have not already — the sweep itself is
read-only, but applying rows is a write and needs the lock and the metadata rules. Prefer `status: superseded` (plus `supersedes`
on the replacement) over deleting when the old entry explains how the current one came to be. Then
report which files you read and which you changed, and tick the applied rows in
`.reviews/<date>.md` so a later pass does not raise them again.

If the directory is too large to read in one pass, review one check at a time and say so — a
partial sweep that is honest about its scope beats a shallow one over everything.
