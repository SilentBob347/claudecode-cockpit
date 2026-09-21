# Waiting for a delegated session

Opened from `bot-run` the moment a delegate POST has returned. Everything here is about sessions
you started; a `[main session·@name]` line has no session to wait for.

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

Every terminal status reached → go back to `bot-run` and write the report.
