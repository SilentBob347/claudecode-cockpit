# Following up in a session that already exists

Opened from `bot-run` when a delegated Bot asked something back, or when the user answers your
report — a correction, a pick from a numbered list, an answer to the Bot's question.

**That is a message to the session that already exists, not a new delegation.**

```bash
curl -sS --fail-with-body -X POST "{{BASE_URL}}/api/chat" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF_JSON
{"cwd": "<the receipt's cwd, verbatim>", "sessionId": "<the receipt's sessionId>", "prompt": "<the follow-up>"}
EOF_JSON
```

- No `x-cockpit-run-id` here, unlike the delegate call: only that endpoint reads the header, to
  record which session started the child. This one continues a session that already has a parent.
- **Match the route to the engine** the receipt reported: `/api/chat` is claude; codex, ollama,
  kimi, deepseek and glm each have `/api/chat/<engine>`. Sending to the wrong one starts a
  different engine on that transcript.
- It returns `{ runKey, sessionId }` immediately, exactly like a delegation. **Wait for it the same
  way** — `wait.md`, with the same `cwd` and that `sessionId`.
- **`409 session is already running`** means the child has not finished. That is not an error to
  route around; wait for a non-`running` status first and send it then.
- Long or multi-part follow-ups go in a brief file exactly as a first brief does — this body takes
  `prompt` only, so write the file and reference it in the text if it is too big to inline
  comfortably.

Delegating again instead is the tempting mistake, and it is expensive in a way that does not look
expensive: the new session starts from nothing, re-reads the Bot's files, and knows only what your
brief happens to restate. Everything the last turn established — what it checked, what it ruled
out, what the user already answered — is in *that* transcript, and a summary of it is not the same
thing. It has happened: a dispatcher decided Cockpit had no way to continue a session, re-delegated
with a paragraph of context, and paid for the whole task twice.

**A `[main·@name]` line is not this case.** It ran here, in this transcript, so its
follow-up is simply the next thing you do — no curl, no session id. Answering it through this
endpoint would start a second, parallel turn on a session that is already yours.
