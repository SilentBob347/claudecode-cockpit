# Builtin Slash Commands

Every subdirectory here is one builtin slash command: `skills/<cmd>/SKILL.md`
is the command's prompt, in the exact SKILL.md format a user-defined skill
uses (YAML frontmatter + body). English only.

**This directory is runtime code, not documentation.** It is listed in
`package.json#files`, so anything added here ships inside the npm package,
and the server reads these files at dispatch time. Project-internal
playbooks (`/cockpit-release`, `/cockpit-changelog`) live in
[`docs/skills/`](../docs/skills/README.md) and are never published.

## How they are loaded

`packages/feature/agent/src/server/lib/slashCommands.ts` resolves this
directory as `$COCKPIT_ROOT/skills` (same mechanism as `apps/`; `server.mjs`
sets `COCKPIT_ROOT` to the package root), then:

1. `readdir` — every subdirectory containing a `SKILL.md` is a registered
   command. There is no separate allow-list to keep in sync: the folder set
   *is* the registry, for both dispatch and the `/api/commands` autocomplete
   dropdown (whose description text comes from each file's frontmatter).
2. On dispatch the file is read, `{{BASE_URL}}` is substituted with
   `http://localhost:<port>` and `{{COCKPIT_DIR}}` with the resolved data
   directory (`$COCKPIT_HOME`, default `~/.cockpit`), and the result is written to
   `~/.cockpit/skills/<cmd>/SKILL.md` — the copy the agent is pointed at, so
   builtins travel the same "read this skill file" path as user skills.
3. Any **other** `*.md` in `skills/<cmd>/` is copied next to it with the same
   substitution. These are reference files, not commands — step 1 keys on
   directories holding a `SKILL.md`, so adding one never registers a verb.
   A SKILL.md points at `{{COCKPIT_DIR}}/skills/<cmd>/<file>.md` to defer the
   part most invocations do not need (`bot-turn` keeps its write lock and its
   review checklist out of every ordinary Bot turn this way).
4. A user-registered skill with the same `name` shadows the builtin.

Edits take effect on the next dispatch — no rebuild, no restart.

## Adding a builtin command

1. `mkdir skills/<cmd>` and write `SKILL.md` with frontmatter:

   ```yaml
   ---
   name: <cmd>            # MUST equal the directory name
   hidden: true           # optional — machinery, not a command to type: still
                          # dispatchable and still read by whoever references it,
                          # just left out of the `/` autocomplete (see bot-run)
   description: <one line — this is verbatim what the autocomplete dropdown
                 shows; it is NOT translated, and must not be given an
                 i18n commands.<cmd> key, which would silently override it>
   argument-hint: "[optional]"
   ---
   ```

2. Body is English prose. Use `{{BASE_URL}}` for any URL the agent must curl
   on the server host.

   Split it when one part is long and rarely needed: put that part in
   `skills/<cmd>/<file>.md` and have SKILL.md name the absolute path plus the
   condition for opening it. Keep the *consequence* of not opening it in
   SKILL.md — a deferred rule the model never learns it should fetch is the
   same as a deleted one.
3. That's it — no TypeScript to touch. Both the dropdown and the dispatcher
   pick it up from the directory.

The `name` must match the directory name: the directory name is what `/<cmd>`
matches and where the file is written under `~/.cockpit/skills/`, while
`name` is what the agent reads in the file. A mismatch is caught by
`skills.test.ts`.
