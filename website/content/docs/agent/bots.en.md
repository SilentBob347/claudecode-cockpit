**Bots** are persistent, file-native subagents. Each Bot is an ordinary directory with a `BOT.md`
manifest and the context it should carry between tasks. Tag one with `@name` and OpenCockpit hands
the work to a separate session, then brings the result and a link back to the current chat.

## Bot, Skill, or session?

| Use | What it provides | How you invoke it |
|---|---|---|
| **Skill** | Reusable instructions for one kind of task | `/skill` here, `/@skill` in a subagent |
| **Bot** | A persistent identity, long-term context, and a set of Skills | `@name task` |
| **Session** | The transcript and runtime for one piece of work | Open a tab, or let a Bot create one |

A Skill says *how to do something*. A Bot says *who is doing it, what they already know, and what
they are responsible for keeping current*. Every Bot turn still gets its own session, so you can
open it, inspect the full transcript, and continue there.

## Create and register a Bot

Run the built-in creation Skill:

```text
/bot create a product Bot that remembers roadmap decisions and open commitments
```

The agent confirms the Bot's purpose, name, and location before creating anything. By default the
directory is placed under `~/.cockpit/bots/<name>/`. Creation does not register it automatically.

Register it in either place:

- Open **Bots** in the project sidebar, choose **Add bot**, and paste the Bot directory or its
  `BOT.md` path.
- Open `BOT.md` in Explorer and choose **Add as Bot**.

Removing a Bot from the panel only removes its registry entry. Its directory and memory stay on
disk.

## Tag a Bot into a task

Start a line with its registered name:

```text
@product summarize this week's roadmap changes
```

OpenCockpit marks this as a Bot turn. The current agent writes a self-contained brief, starts a
separate session in the current project, and waits for its result. The Bot session reads the shared
Bot contract, then its own `BOT.md` and only the context files relevant to the task. The result in
the current chat includes a link to the full child session.

Several Bots can be tagged in one message. Their sessions are started before waiting, so independent
work can run in parallel:

```text
@product summarize this week's roadmap changes

@finance check the Q3 budget against them
```

Only registered Bot names are recognized. An ordinary `@mention`, an unknown name, or the old
`@skill` spelling remains plain text. Use `/@skill` to run a Skill as a subagent.

## Memory is deliberate

Bot files are readable Markdown, not a hidden vector store. A normal task is read-only. The Bot
changes its long-term context only when the task explicitly asks it to **remember, update, correct,
or forget** something:

```text
@product remember that mobile onboarding moved to Q4
```

Without that request, the Bot may finish with a short “Could be recorded” list for you to approve
later. Writes use a cooperative lock so multiple sessions can read freely while only one updates the
Bot. Every turn reports which Bot files it read and changed.

Entries carry their confirmation date, source, authority, and status. User-confirmed facts outrank
inferences, old conclusions can be superseded instead of silently overwritten, and credentials are
never read into the Bot's memory.

## Give a Bot a Skill

Address the existing Bot directly:

```text
@product attach /absolute/path/to/SKILL.md
```

This adds one row to the Bot's Skills table. It does not copy the Skill, register a global slash
command, install software, or duplicate credentials. The Bot opens that `SKILL.md` only when a task
matches its stated use.

## Review a Bot

Long-lived context gets stale. Ask the Bot to review itself:

```text
@product review its memory
```

The review checks for stale or contradictory entries, dangling commitments, missing sources,
duplicates, broken Skills, oversized context, and old operating instructions frozen into `BOT.md`.
It saves a uniquely named report under `.reviews/`, returns the numbered findings, and changes no
long-term context until you choose rows to apply.

Continue in the Bot session, or resume from any chat:

```text
@product apply .reviews/2026-09-18-143012.md rows 1 3
```

## What a Bot does not do

- A Bot does not wake itself up. If a commitment really needs proactive follow-up, create a
  [Scheduled Task](/en/docs/agent/scheduled-tasks/) that sends an `@name` prompt.
- A Bot does not automatically absorb every conversation. Durable memory is explicit.
- Registration does not move, copy, or upload its directory. Cockpit stores only the local path.
- Delegation is driven by the agent following OpenCockpit's Bot contract; it is not a hard runtime
  sandbox or permission boundary.

## Next

- [Workflows](/en/docs/agent/workflows/) — combine `@bot`, `/skill`, and `/@skill` in one message
- [Skills](/en/docs/agent/skills/) — create and install reusable task instructions
- [Scheduled Tasks](/en/docs/agent/scheduled-tasks/) — trigger a Bot on a schedule
