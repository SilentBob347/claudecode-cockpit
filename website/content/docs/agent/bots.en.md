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

## Built-in Bots

Cockpit ships with Bots of its own — `@cockpit-helper` answers questions about OpenCockpit by
reading this site live. They appear in the **Bots** panel with a *Built-in* chip and no delete
button, and they are ready before you create anything.

A built-in is installed into `~/.cockpit/bots/<name>/` the first time Cockpit lists its Bots, and
that copy is the Bot: it is what the panel shows, what the folder button opens, and what `@name`
runs. It is yours to edit. Cockpit keeps the files it installed up to date per file, so a shipped
file you have not touched picks up improvements with each upgrade, while a file you have edited —
or anything the Bot wrote itself — is never overwritten. Delete the folder to go back to the
version that ships: the next listing installs it afresh.

## Tag a Bot into a task

Start a line with its registered name:

```text
@product summarize this week's roadmap changes
```

OpenCockpit marks this as a Bot turn. The current agent writes a self-contained brief, starts a
separate session, and waits for its result. The Bot session reads the shared Bot contract, then its
own `BOT.md` and only the context files relevant to the task. The result in the current chat
includes a link to the full child session.

Ordinary work runs in the current project. The three housekeeping requests below — review, attach,
share — run in the Bot's own directory instead, because that directory is what they act on.

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

The row records the Skill's **registered name**, not the path you typed — a name still means
something on another machine, which is what lets a shared Bot arrive with its tools intact. A Skill
that is not registered is recorded by absolute path instead, and the Bot says so: that row will
only work here.

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

## Share a Bot

A Bot's working directory is the wrong thing to hand over. It holds this user's memory, its open
commitments, the reports its reviews wrote, and paths that exist on one machine. Ask the Bot for a
shareable copy instead:

```text
@product export to ~/code/product-bot-template
```

It builds a **new** Bot directory at that path: the `BOT.md`, its identity files and its own Skills
come across; its memory, relationships, commitments, evidence and project notes are recreated as
empty files. The source Bot is not changed. Anything the Bot has grown that the export does not recognise stays
behind by default and is listed in the report, so you can name the parts worth carrying over —
usually a procedure general enough to be useful to someone else.

The report ends with the Skill names the exported table references. That list is the whole
installation requirement: whoever receives the directory registers a Skill under each of those
names, adds the Bot, and it works. Where they keep those Skills is their business.

What to do with the directory is yours — a repository of your own is the usual answer. Cockpit does
not publish it, and does not register the copy here either.

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
