A single message can be more than one command. If you start several lines with `/`, `/@` or `@`, OpenCockpit annotates each command line **in place** with a compact tag (where it runs, which Skill or Bot it uses) and gathers the files needed to run it at the end of the message — your original layout, blank lines, and line order are all preserved. It's the fastest way to say "clarify this, then fix it, then have a sub-agent review the fix" without sending three separate messages. **The order and any parallelism are left for the AI to decide once it reads the message — Cockpit no longer forces a numbered sequence.**

This builds directly on the [slash menu](/en/docs/agent/message-input/#slash-menu-) and [Skills](/en/docs/agent/skills/) — the same commands, now chainable.

## One message, several commands

Each line that starts with a known command is annotated in place:

| Marker | Where the command runs |
|---|---|
| `/verb` | the **main session** — the AI continues in the current chat |
| `/@verb` | a **sub-agent** — Cockpit delegates the step to a separate agent and reports back |
| `@bot` | a **sub-agent** working as a registered Bot — see below |

`verb` is any built-in command (`/qa`, `/fx`, `/cr`, …) or any [installed skill](/en/docs/agent/skills/#custom-skills) of the same name. A verb is everything from the marker up to the first space, and whether it counts as a command is decided purely by whether a skill of that name is registered — so `/new-branch`, `/qa`, `/2fa` and `/db:query` all work, while a line like `/usr/local/bin` stays ordinary text because nothing is registered under it.

Here's a three-step message:

```text
Here is the failing test output: payment webhook 500s on retries.
/fx
figure out why the idempotency key isn't being honored
/@cr
audit the fix for race conditions and missing rollbacks
```

Cockpit annotates it in place — roughly:

```text
Here is the failing test output: payment webhook 500s on retries.
[main session·fx] figure out why the idempotency key isn't being honored
[subagent·cr] audit the fix for race conditions and missing rollbacks

Read these skill files first, then act accordingly:
- fx: ~/.cockpit/skills/fx/SKILL.md
- cr: ~/.cockpit/skills/cr/SKILL.md
```

You write four lines; the AI receives your original layout, with each command line lit up as a `[where·which skill]` tag and a skill list appended at the end. Reading the tag:

- `[main session·fx]` = run in the main session, using the fx skill; `[subagent·cr]` = delegate to a sub-agent, using the cr skill.
- When the whole message has a single `/` command, the locus is dropped and only `[fx]` remains (a lone main-session command needs no disambiguation). The locus appears only when it's ambiguous: two or more commands, or any sub-agent step (`/@` or `@`).
- Which one runs first, and whether any run in parallel, is up to the AI once it reads the message — Cockpit doesn't sequence them for it.

## How a message is split

The rules are line-based and predictable:

- **A command line** is any line that starts with `/`, `/@` or `@` followed by a known skill or registered Bot name. Lines that start with a slash but aren't a real command (`/usr/local/bin`, `@mention`) are left as ordinary text.
- **A command's body** is everything after the verb on that line, **plus the contiguous non-blank lines directly below it, up to a blank line or the next command line**. The body follows the tag: `[main session·fx] <body>`.
- **A blank line is a hard boundary**: a paragraph set off by a blank line is *not* folded into the command above it. So a closing remark meant for the whole message (e.g. "also fix everything else"), written as its own paragraph after a blank line, stays global instead of being mistaken for part of a command.
- **Everything else is kept verbatim**: ordinary text before, between, or after commands stays exactly where you put it — paste an error log or state the goal once, wherever you wrote it.

## Main session vs sub-agent — `/` vs `/@`

- `/verb` keeps the work **in the current chat**. Use it for work you want to watch and steer turn by turn.
- `/@verb` hands that command to a **sub-agent**. Use it for self-contained work — a review pass, an exploration, a focused investigation — that you want done and summarized without cluttering the main thread.

A common shape is "do the work in the main session, then send a sub-agent to check it":

```text
/go
implement the retry backoff described in the ticket
/@cr
review what was just written for correctness and style
```

## Built-ins and your own skills, mixed

A workflow can freely mix [built-in commands](/en/docs/agent/skills/) and your [installed skills](/en/docs/agent/skills/#custom-skills) — they resolve through the same "read this SKILL.md" path. If a skill you installed shares a name with a built-in, **your skill wins**: a `/cr` you authored shadows the built-in `/cr`, so your edits always take effect.

## Bots — `@bot`

A Bot is a persistent, file-native subagent: a plain directory with a `BOT.md` at its root and long-term context beside it. Create one with the built-in `/bot` Skill, then register it from the **Bots** panel or by opening its `BOT.md` in Explorer and clicking **Add as Bot**.

Every line starting with a registered `@name` is handed to its own session. The dispatcher passes the Bot contract and `BOT.md` paths to that session without reading the Bot's private working context itself. A normal turn is read-only; the Bot updates its files only when explicitly asked to remember, update, correct, or forget something. Several Bots can appear in one message, alongside `/` and `/@` commands:

```text
@product summarize what changed in the roadmap this week

@finance check the Q3 budget against it
```

`@name` is only recognized for registered Bots; `@somebody` or an old-style `@cr` stays ordinary text.

See [Bots](/en/docs/agent/bots/) for creation, deliberate memory, attaching Skills, reviews, and scheduled follow-up.

## Autocomplete follows your cursor

The command menu no longer triggers only at the very start of the box. Type `/`, `/@` or `@` at the start of **any line** — including the second, third, or fourth — and the autocomplete dropdown appears for that line, filtered as you type. `Tab` or `Enter` inserts the selected command. That's what makes stacking commands line by line comfortable.

## When nothing is rewritten

Cockpit leaves a message completely untouched only when it contains **no known command** at all. As soon as there's a single `/verb`, `/@verb` or `@bot`, that command line is annotated with a tag and the skill list is appended at the end of the message — a single command included, just without the locus, rendered as `[verb] your trailing text`.

## Next

- [Skills](/en/docs/agent/skills/) — the built-in commands and how to install your own
- [Bots](/en/docs/agent/bots/) — persistent subagents you tag with `@name`
- [Message Input](/en/docs/agent/message-input/) — everything else the message box does
- [Sessions](/en/docs/agent/sessions/) — running multiple chat tabs
