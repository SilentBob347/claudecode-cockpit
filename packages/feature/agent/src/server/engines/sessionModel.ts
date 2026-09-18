/**
 * A session's model, server side.
 *
 * Which model a session runs on is persisted per project in
 * `~/.cockpit/projects/<enc>/session.json` under `<engine>Models[sessionId]` — the map the
 * chat-header picker writes through POST /api/project-state, and the one the tab restores
 * from on load.
 *
 * That picker used to be its ONLY writer, which broke every session Cockpit starts for
 * itself: POST /api/sessions/delegate accepts a `model`, passes it to the one dispatch that
 * creates the session, and recorded it nowhere. Reopening such a session showed
 * "Select model", and the far worse half — a follow-up turn sent to it without an explicit
 * `model` (the natural thing for a caller that already picked one at delegation) silently
 * fell through to the engine's compiled-in default and 404'd.
 *
 * Dispatch now reads this map when a request carries no model and writes back the model it
 * actually ran, so both writers agree on one record and "the session's model" survives
 * however the session was born.
 *
 * Only the model maps are touched here. `sessions[]` stays the tab list's business — a
 * delegated session is not an open tab, and adding it would make it one.
 */
import { getSessionFilePath, mutateJsonFile, readJsonFile } from '@cockpit/shared-utils';

/**
 * Engine id → its map key in session.json. Keep in sync with the ProjectState interface in
 * src/app/api/project-state/route.ts, which is the same file's other writer.
 */
const MODEL_MAP_KEY: Record<string, string> = {
  ollama: 'ollamaModels',
  deepseek: 'deepseekModels',
  kimi: 'kimiModels',
  glm: 'glmModels',
  claude: 'claudeModels',
  codex: 'codexModels',
};

/** Only the slice this module owns; every other key is carried through untouched. */
type ProjectStateShape = { sessions: string[] } & Record<string, unknown>;

const EMPTY: ProjectStateShape = { sessions: [] };

function mapOf(state: ProjectStateShape, key: string): Record<string, string> {
  const raw = state[key];
  return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
}

/** The model this session last ran on, or undefined when nothing ever recorded one. */
export async function readSessionModel(
  engine: string,
  cwd: string | undefined,
  sessionId: string | undefined,
): Promise<string | undefined> {
  const key = MODEL_MAP_KEY[engine];
  if (!key || !cwd || !sessionId) return undefined;
  const state = await readJsonFile<ProjectStateShape>(getSessionFilePath(cwd), EMPTY);
  return mapOf(state, key)[sessionId]?.trim() || undefined;
}

/**
 * Record the model a run resolved to. Best-effort: this is bookkeeping for the NEXT turn, so
 * a failure here must never take down the turn that is starting.
 *
 * Skipped entirely when the record already says this — it runs on every dispatch and
 * mutateJsonFile rewrites the file unconditionally. The unlocked pre-read can lose a race
 * with a concurrent picker save, which costs one redundant identical write and nothing else.
 */
export async function recordSessionModel(
  engine: string,
  cwd: string | undefined,
  sessionId: string | undefined,
  model: string,
): Promise<void> {
  const key = MODEL_MAP_KEY[engine];
  if (!key || !cwd || !sessionId || !model.trim()) return;
  const value = model.trim();
  const filePath = getSessionFilePath(cwd);
  try {
    const before = await readJsonFile<ProjectStateShape>(filePath, EMPTY);
    if (mapOf(before, key)[sessionId] === value) return;
    await mutateJsonFile<ProjectStateShape>(filePath, EMPTY, (cur) => ({
      ...cur,
      [key]: { ...mapOf(cur, key), [sessionId]: value },
    }));
  } catch (error) {
    console.error(`[engine:${engine}] failed to record session model for ${sessionId}:`, error);
  }
}
