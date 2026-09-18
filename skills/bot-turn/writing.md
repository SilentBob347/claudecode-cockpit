---
title: Changing a Bot's files
---

# Changing a Bot's files

Read this before you create, edit or delete anything under a Bot directory. Reading its files
needs nothing from here; changing them needs all of it — the metadata every entry carries, the
bar a change has to clear, and the lock that keeps two sessions from writing at once.

## 1. Entry format

Every recorded entry is a `## <short title>` section followed by one metadata comment. Without it
an entry cannot be aged, traced, or closed later. This block is a shape, not a record — when you
copy it anywhere, keep it as placeholders:

```markdown
## <short title>
<!-- confirmed: <YYYY-MM-DD> · source: <user | session:id | evidence key> · authority: <user-confirmed | observed | inferred> · status: active -->

<What was established, as prose.>
```

- `confirmed` — the date it was last verified. `source` — `user`, `session:<id>`, or a key in
  `evidence/refs.md`.
- `authority` — `user-confirmed` (the user stated or approved it) > `observed` (a tool run or a
  file proved it) > `inferred` (you concluded it). **An `inferred` entry never overrides a
  `user-confirmed` one** — on a clash the inferred side loses, however new it is.
- `status` — `active` (default), `superseded`, `done`, `cancelled`. Add `supersedes: <title>` on
  the entry that replaces another, and `expires: <YYYY-MM-DD>` when the information is time-bound.
- A commitment carries a second comment line — without it "is this still open?" is guesswork:
  `waiting-on` (who or what it is blocked on, `nobody` when it is your move) · `next-check` (the
  date worth looking again) · `done-when` (the observable condition that closes it, not "when it
  feels finished").

Keep the body prose. This is metadata for aging entries, not a schema — never split an entry into
fields the reader has to reassemble.

## 2. Only when asked

You should be here only because the task explicitly asked to remember, update, correct or forget
something. If it did not, go back and end with a "Could be recorded" list instead.

`BOT.md`'s "Updating" section says where each kind of thing goes in *this* Bot. Regardless of
that routing:

- Every entry you write or update carries the metadata comment from §1.
- Never let an `inferred` entry overwrite a `user-confirmed` one — record the disagreement and ask.
- Editing `identity/persona.md` or `identity/principles.md` changes how every future turn behaves:
  quote the exact wording you intend to write and wait for approval. Everything else follows the
  normal rule — asked for, then written.
- **Never record**: chit-chat; guesses presented as fact; secrets (keys, tokens, passwords); full
  conversation transcripts or third-party material you were not asked to keep; anything re-readable
  from the source system (code, database rows, file contents); caches, logs, generated indexes.

## 3. The write lock

Other sessions may be reading or writing this Bot at the same time. Reads never block. Hold the
lock only around the edits, and release it even when an edit fails.

**1. Acquire.** `mkdir` is atomic, so exactly one session wins. Do not `cd` into the Bot — the
`cwd` recorded below must be the session's own working directory, which is what makes step 3
answerable.

```bash
BOT='<the Bot directory>'
SESSION_CWD="$PWD"

mkdir -p "$BOT/.locks"
if mkdir "$BOT/.locks/write" 2>/dev/null; then
  printf 'run: %s\ncwd: %s\nsince: %s\ntask: %s\n' \
    "${COCKPIT_RUN_ID:-unknown}" "$SESSION_CWD" "$(date -u +%FT%TZ)" '<short task label>' \
    > "$BOT/.locks/write/owner"
  echo acquired
else
  # `mkdir` and the owner write are two steps, so a lock taken a moment ago may
  # have no owner file yet. Absent is not the same as unowned.
  cat "$BOT/.locks/write/owner" 2>/dev/null || echo 'held; owner not written yet'
fi
```

**2. Failed?** Another session holds it. Retry every 10s for about 2 minutes.

**3. Still locked?** Decide from `owner`, never from the clock — a three-hour-old timestamp is as
likely to be a slow task as a crash.

- `run:` is your own `$COCKPIT_RUN_ID` → your own lock, from a turn of this session that died
  holding it (a session keeps the same run id across turns). Clearing it is safe.
- Otherwise ask whether that run is still alive, using the two lines the file records:

  ```bash
  curl -sS --get "{{BASE_URL}}/api/sessions/status" \
    --data-urlencode "cwd=<the cwd line>" --data-urlencode "sessionId=<the run line>"
  ```

  `status: running` → **it is working. Wait, or stop and tell the user. Do not clear it.**
  Any other status, or a 404 → that run has ended and left the lock behind.

- No `owner` file at all → either the holder is mid-acquire, or it crashed between the two steps.
  Keep retrying; after the window it is decided the same way as any other foreign lock.
- Even then, **clearing someone else's lock is the user's call**, not yours: quote the `owner`
  file and the status you got, and let them run `rm -rf <bot>/.locks/write`. Never delete another
  session's lock on a timer.

**4. Holding it:** re-read every file you are about to change — what you read before the lock may
be stale. Then edit.

**5. Release:** `rm -rf "$BOT/.locks/write"`. Do this even when an edit failed halfway.
