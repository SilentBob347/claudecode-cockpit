---
name: bot-run
description: "How to run an @bot line: delegate it to its own session and wait for the result."
hidden: true
---

# Running an @bot line

Every `[subagent·@name]` line in the message is that Bot's work, not yours. Hand it to a session of
its own and wait for the answer — you are the dispatcher for these lines, not the executor.

Do **not** read the Bot's `BOT.md` or `bot-turn` yourself. They are listed at the end of the
message under "pass the path along; do not open them yourself" — that is the only reason you have
those paths. The child reads them and works from them; keeping them out of this session is the
point.

## 1. Write a self-contained brief

The child sees none of this conversation. Everything it needs goes in the brief: the user's
intent in their own words, the context you have accumulated here (which repository, which files
are in scope, what was already decided, what it should NOT re-litigate), and what "done" looks
like. This is the whole value of delegating from here rather than letting the user type it — the
brief you write is the part the user did not have to.

Start it with both paths, in this order — the general contract, then the particular Bot:

> Read `<the bot-turn path>` for how a Bot turn works, then `<the Bot's BOT.md path>` for who this
> Bot is and which of its files to read. Follow its "Before working" section, then do the task in
> the voice its identity files define.

Both paths are in the list at the end of the message. Pass them verbatim; a child that is missing
`bot-turn` has no write-lock protocol and will invent one.

**Write only what you learned here; never assert what the Bot remembers.** You have not read its
files — it has. A brief that says "this is already settled in its memory" is a guess dressed as a
citation, and the child will take it as a premise it may not re-open. Say where a constraint
actually came from ("the user said so in this conversation"), and leave its memory to it.

## 2. Delegate — fire every @bot line before waiting on any of them

```bash
BRIEF=$(mktemp /tmp/cockpit-brief.XXXXXX)
cat > "$BRIEF" <<'EOF_BRIEF'
<the brief>
EOF_BRIEF

curl -sS --fail-with-body -X POST "{{BASE_URL}}/api/sessions/delegate" \
  -H "Content-Type: application/json" -H "x-cockpit-run-id: $COCKPIT_RUN_ID" \
  --data-binary @- <<EOF_JSON
{"cwd": "${COCKPIT_CWD:-$PWD}", "title": "@<name>: <short label>", "briefPath": "$BRIEF"}
EOF_JSON
```

The body is `{ cwd, engine?, model?, title?, prompt? | briefPath? }`:

- **Do not delete the brief file.** The POST returns before the child has read it: the endpoint
  only checks that the file exists, and the child is handed the *path*. Tidying up `$BRIEF` after
  the call leaves it with a task it cannot read.
- **`cwd` has two right answers, decided by what the line asks for:**

  | The `@name` line is | `cwd` |
  |---|---|
  | ordinary work | `${COCKPIT_CWD:-$PWD}` — exactly as written above, a variable you never resolve yourself |
  | "导出 / export", "复盘 / review", "装上 / attach" | the Bot's own directory: `dirname` of the BOT.md path listed at the end of the message |

  Ordinary work happens in the project, and the Bot reaches its own files by absolute path. The
  three maintenance verbs are work *on the Bot*: its files are the subject, its `.locks/` is
  there, and a review writes `.reviews/` into it — a child sitting in some unrelated project would
  reach all of that by absolute path for no reason, and `git` inside the Bot's own repository
  would not work at all. Taking `dirname` of that path is not opening it; the rule against reading
  it stands.

  **`COCKPIT_CWD` is this session's own working directory, exported by Cockpit.** Leave it as a
  variable in the JSON — the heredoc expands it. Never substitute a path you worked out instead:
  not the git root, not the nearest directory with a CLAUDE.md, not any parent that looks more
  like a project than where you are. Doing that silently moves the child one or more levels above
  where the user is working, and its transcript then lands under a different project in the
  session list — which is what happened when a session working inside a subdirectory delegated a
  child at the repository root instead. It is also not `pwd`: `pwd` follows any `cd` this turn has
  made, which is why the fallback is only there for a Cockpit too old to export the variable.
- Leave `engine` and `model` unset. Bot manifests expose only `name` and `description`, and the
  dispatcher must not open `BOT.md` to invent an engine preference.
- `title` is optional but always worth setting — it is how the session is listed later.
- For a one-line task you may send `"prompt": "..."` instead of `briefPath` (escape `"` and `\`).
  A Bot task rarely is one: the brief carries the accumulated context, which is the whole point.
- The receipt comes back at once: `{ cwd, engine, model?, sessionId, link, title, createdAt,
  parent? }`. Post every Bot's brief first, then wait.
- A 400 names the problem — cwd missing, relative, or not a directory; a brief file that does not
  exist; too many delegated sessions already running. Report what it says; do not retry blindly.

## 3. Wait

A Bot turn routinely outlasts a single bash call's tool timeout — a working-tree code review
measured 11 minutes against a 10-minute ceiling — so the wait has to survive that. Two ways, in
order of preference:

**Run it in the background if your Bash tool can** (`run_in_background`, a job that notifies you
on exit, or equivalent). Set `BUDGET` high (3600) and launch once: the tool timeout stops applying,
you get woken when it finishes, and you are free in the meantime. This is what to reach for first.

**Otherwise wait in chunks.** Foreground, `BUDGET` about 10% under your Bash timeout (600s max →
`BUDGET=540`; can't raise it → assume 120s and use `BUDGET=100`). Each call prints where things
stand and exits; if anything is still running, run the same block again with the remaining ids.
That is the normal path, not a failure.

```bash
CWD='<the receipt's cwd, verbatim>'
SIDS='<sessionId>
<sessionId>'                     # still-running ids, ONE PER LINE
BUDGET=540                       # seconds THIS call may spend

started=$(date +%s)
deadline=$(( started + BUDGET ))
while :; do
  pending=''
  for sid in $(printf '%s\n' "$SIDS"); do
    body=$(curl -sS --fail-with-body --get "{{BASE_URL}}/api/sessions/status" \
      --data-urlencode "cwd=$CWD" --data-urlencode "sessionId=$sid") || body='{}'
    state=$(printf '%s' "$body" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("status","?"))
except Exception: print("?")')
    echo "+$(( $(date +%s) - started ))s $sid -> $state"
    # `?` = the status call failed, NOT a terminal state. Keep it pending so a
    # blip retries and a real mistake shows up as a stall, never as "finished".
    if [ "$state" = running ] || [ "$state" = '?' ]; then pending="$pending
$sid"; fi
  done
  SIDS=$(printf '%s\n' "$pending" | grep -v '^$')
  [ -z "$SIDS" ] && break
  [ "$(date +%s)" -ge "$deadline" ] && break
  if [ "$(( $(date +%s) - started ))" -lt 30 ]; then sleep 5; else sleep 15; fi
done
echo "still running: ${SIDS:-none}"
```

- **`still running: <ids>`** → the budget ran out first. Run the block again with `SIDS` set to
  exactly those ids. Nothing is wrong.
- **`still running: none`** → every Bot reached a terminal status. The last `+Ns <sid> -> <state>`
  line for each is that status; read it before writing the report.
- **Any `-> ?` line** → that status call failed and the id stays pending. If it repeats, the call
  is wrong, not the session — see below.
- One loop covers every Bot, so they run in parallel and each drops out as it finishes.
- Keep the ids newline-separated and keep `$(printf '%s\n' "$SIDS")` — a plain `for sid in $SIDS`
  reads as a single id under zsh, which does not word-split parameters.

**There is no fixed cap.** Keep waiting while the user is waiting on the answer. For scale: two
measured working-tree code reviews took 7 and 11 minutes; a Bot review sweep reads a whole
directory and takes longer. Once it has run past roughly half an hour, stop waiting silently — say
it is still going, hand over the links, and let the user decide.

**Never state an outcome you have not seen a non-`running` status for.** Hand-rolled variants of
this check go wrong in one direction only: they exit immediately and you report a result the child
never produced.

`done` = the last turn finished normally; `failed` = the engine recorded an error;
`incomplete` = stopped or interrupted, and the user can open it and carry on.

**`?` is not a status.** It means the status call itself failed — wrong `cwd`, wrong id, server
gone. The loop keeps such an id pending rather than counting it finished, so a transient blip
just retries; an id stuck on `?` for a whole budget means the call is wrong. Re-run the bare curl
without `|| body='{}'`, read the error body, and fix it. Never report `?` as an outcome.

## 4. Follow up in the same session — do not delegate twice

A Bot's answer often needs one more exchange: it asks which of two directories you meant, or the
user reads the result and wants a change. **That is a message to the session that already exists,
not a new delegation.**

```bash
curl -sS --fail-with-body -X POST "{{BASE_URL}}/api/chat" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF_JSON
{"cwd": "<the receipt's cwd, verbatim>", "sessionId": "<the receipt's sessionId>", "prompt": "<the follow-up>"}
EOF_JSON
```

- No `x-cockpit-run-id` here, unlike §2: only the delegate endpoint reads that header, to record
  which session started the child. This one continues a session that already has a parent.
- **Match the route to the engine** the receipt reported: `/api/chat` is claude; codex, ollama,
  kimi, deepseek and glm each have `/api/chat/<engine>`. Sending to the wrong one starts a
  different engine on that transcript.
- It returns `{ runKey, sessionId }` immediately, exactly like a delegation. **Wait for it the same
  way** — §3, with the same `cwd` and that `sessionId`.
- **`409 session is already running`** means the child has not finished. That is not an error to
  route around; wait for a non-`running` status first and send it then.
- Long or multi-part follow-ups go in a brief file exactly as in §1 — this body takes `prompt`
  only, so write the file and reference it in the text if it is too big to inline comfortably.

Delegating again instead is the tempting mistake, and it is expensive in a way that does not look
expensive: the new session starts from nothing, re-reads the Bot's files, and knows only what your
brief happens to restate. Everything the last turn established — what it checked, what it ruled
out, what the user already answered — is in *that* transcript, and a summary of it is not the same
thing. It has happened: a dispatcher decided Cockpit had no way to continue a session, re-delegated
with a paragraph of context, and paid for the whole task twice.

## 5. Report

One short section per Bot: its conclusion in a few lines, then `[open session](<link>)`. The full
answer lives in that session — do not paste it wholesale, and do not restate it as your own.
`lastReply` is cut at 4000 characters; when `lastReplyTruncated` is true and you need the rest,
repeat the status call with `--data-urlencode "full=1"`. Use the receipt's `link` exactly as
returned — it is the only record of the delegation, and tool output is not searchable later.

**A numbered list is a special case.** Some Bot tasks (a review sweep, for instance) end in a list
of findings the user picks from. Relay it whole with its numbering intact, and keep whatever path
the child saved it to — the user answers either in that session or by naming that file in a new
one, and dropping either detail strands the work.

Pressing stop here does not stop a delegated session — it is a separate run. Say so if the user
expects otherwise.

When the user answers your report — a correction, a pick from a numbered list, an answer to a
question the Bot asked — that reply belongs in the session it came from. Go back to §4; do not
start a second one.
