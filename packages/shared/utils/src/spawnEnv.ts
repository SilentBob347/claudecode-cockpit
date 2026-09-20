/**
 * Environment sanitizer for every child process cockpit spawns.
 *
 * WHY THIS EXISTS
 * ---------------
 * The production server calls `next({ dev: false })` and then `app.prepare()`.
 * The constructor is innocent, but `prepare()` writes into `process.env` of the
 * cockpit server process:
 *
 *     NODE_ENV="production"     NEXT_DEPLOYMENT_ID=""     TURBOPACK="auto"
 *
 * Cockpit's launcher also uses the generic `PORT` variable for the host
 * server's listening port. That value is equally unsafe in a user's project:
 * Next, Vite, and other dev servers commonly treat it as their own port.
 *
 * Every child we spawn with `{ ...process.env }` (agent engines, PTY drivers,
 * bash bubbles) inherits those. The agent then runs commands
 * in the *user's* project under production semantics — which is wrong and
 * fails in ways that point nowhere near cockpit. The canonical symptom:
 * `React.act` is a dev-only export, so a production `NODE_ENV` turns every
 * component test into `TypeError: React.act is not a function`, which reads
 * like a broken react-dom install.
 *
 * This only reproduces in prod mode (`cockpit`); the dev server takes
 * the `dev: true` branch and never sets these — so you cannot see it while
 * developing cockpit itself.
 *
 * WHY WE STRIP AT THE SPAWN BOUNDARY
 * ----------------------------------
 * We cannot fix `process.env` in the server: the Next runtime keeps reading
 * `NODE_ENV` for the lifetime of the process. So the sanitizing happens at the
 * boundary, once, here.
 *
 * WHY A DENY-LIST AND NOT AN ALLOW-LIST
 * -------------------------------------
 * `terminalHandler.ts` rebuilds its env from scratch (allow-list) and that is
 * the stricter design, but a spawned agent legitimately needs a long tail of
 * inherited variables — ANTHROPIC_*, proxy settings, PATH, whatever the user's
 * shell exported. Enumerating them is a losing game. We remove exactly what
 * Next injected and pass the rest through.
 *
 * Note we do NOT try to preserve a NODE_ENV the user exported before launching
 * cockpit: by the time `prepare()` has run, the original value is unknowable.
 * Unset is the correct default for someone else's project.
 */

/**
 * Variables injected into the server process by Next's `app.prepare()`.
 * Adding to this list is cheap; missing one costs an afternoon of debugging.
 */
export const NEXT_INJECTED_ENV_KEYS = [
  'NODE_ENV',
  'NEXT_DEPLOYMENT_ID',
  'TURBOPACK',
] as const;

/** Host-process variables that must not leak into a user's project. */
export const HOST_ONLY_ENV_KEYS = [
  ...NEXT_INJECTED_ENV_KEYS,
  'PORT',
] as const;

/**
 * WHAT COCKPIT ADDS ON THE WAY OUT
 * --------------------------------
 * Three variables reach an agent's shell that its own environment never had.
 * They are how a skill can ask about the session it is running in without the
 * model having to work the answer out — which it does badly, because the answer
 * looks derivable and is not:
 *
 * - `COCKPIT_PORT`  — kept rather than added (it is namespaced; see below).
 * - `COCKPIT_RUN_ID` — this turn's run key, so a delegating curl can name its
 *   parent session.
 * - `COCKPIT_CWD` — the session's own working directory, injected by each engine
 *   from the cwd it was started with. **Not the same as `pwd`**: an agent that
 *   `cd`s during a turn moves `pwd` and not this, and Claude Code will even
 *   reset the shell's cwd between commands. Anything that must identify the
 *   session — `POST /api/sessions/delegate`, the Bot write-lock owner file, and
 *   both `GET /api/sessions/status` lookups that key on `cwd` + `sessionId` —
 *   has to use this one. A dispatcher left to work it out from `pwd` and the
 *   surroundings once walked up to the git root and delegated a directory above
 *   the user's project, which put the child's transcript under a different
 *   project entirely.
 *
 * Added per spawn site rather than here, because only the caller knows the
 * session; this function just does not strip them.
 */

/**
 * Return type note: the two consumers disagree, so we satisfy both.
 * `child_process` options want `NodeJS.ProcessEnv`, which Next's global.d.ts
 * augments with a REQUIRED `NODE_ENV` — precisely the key we are removing. The
 * Claude Agent SDK wants `Record<string, string>`. Neither type can express
 * "a normal env that happens to have NODE_ENV unset", which is a perfectly
 * legal thing to hand to spawn(). The intersection satisfies both call sites
 * and the single cast that produces it is confined to this function.
 */
export type SpawnEnv = NodeJS.ProcessEnv & Record<string, string>;

/**
 * A copy of `process.env` with the host server's fingerprint removed, safe to
 * hand to a child process working inside a user project. `COCKPIT_PORT` stays:
 * it is deliberately namespaced and lets Cockpit CLI bridges find this server.
 *
 * @param overrides applied AFTER stripping, so infrastructure callers can
 *   deliberately restore a host-only key (the restart handoff restores PORT),
 *   or a test runner wrapper can set `NODE_ENV=test`. An `undefined` value
 *   deletes the key.
 * @param base defaults to `process.env`; injectable for tests.
 */
export function sanitizedSpawnEnv(
  overrides: Record<string, string | undefined> = {},
  base: NodeJS.ProcessEnv = process.env,
): SpawnEnv {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) out[key] = value;
  }
  for (const key of HOST_ONLY_ENV_KEYS) delete out[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  return out as SpawnEnv;
}
