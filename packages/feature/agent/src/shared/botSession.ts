/**
 * Bot-session detection — "did a Bot dispatch open this session, or did a human?"
 *
 * The evidence is the session's FIRST human message, because that is the one
 * message the dispatch writes itself and the one a human never sees a prompt
 * box for. `skills/bot-run` delegates with `title: "@<name>: <short label>"`,
 * and `buildChildPrompt` (effect/delegationLive.ts) puts that title on line 1 as
 * `Task: @<name>: …`. So the mark and the Bot's name come off the same line.
 *
 * The `Task:` lead-in is what keeps the rule honest: a human who types
 * `@glasser 调研一下 X` is the DISPATCHER, not the Bot session, and that message
 * is exactly what the dispatcher's own transcript starts with. Matching a bare
 * `@name` would paint the robot on both sides of the handoff.
 *
 * A delegation that names NO Bot — a plain sub-task dispatched by curl or by an
 * orchestrating turn — is deliberately left unmarked. "Bot session" means a Bot
 * is driving it, not merely that a machine opened it; widening the rule to every
 * delegated session would put the robot on ordinary sub-tasks and empty the mark
 * of the one thing it tells you. The `@name` IS the signal, which is also why
 * this returns the name rather than a boolean.
 *
 * Pure and client-importable (no node built-ins, same rule as shared/bots.ts):
 * the server stamps the result onto the /api/session-by-path payload, and the
 * tab strip + the running line render it beside the engine mark.
 */

/** `@name` uses the Bot registry's lowercase class (shared/bots.ts BOT_NAME). */
const BOT_TASK_LINE = /^Task:\s*@([a-z0-9][a-z0-9-]{0,63})(?=[\s:]|$)/

/**
 * The Bot behind a session, from its first human message — `undefined` when a
 * human started it. Callers pass the raw text; the title line is line 1, so
 * everything after the first newline is ignored.
 */
export const detectBotName = (firstUserMessage: string | null | undefined): string | undefined => {
  if (!firstUserMessage) return undefined
  const firstLine = firstUserMessage.trimStart().split("\n", 1)[0]
  return BOT_TASK_LINE.exec(firstLine)?.[1]
}
