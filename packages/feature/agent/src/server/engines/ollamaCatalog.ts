/**
 * The local Ollama catalog — the only authority on which models exist here.
 *
 * A hosted provider's model ids are stable enough to hardcode (see anthropicCompat's
 * `defaultModel`); ollama's are not. It serves whatever this machine pulled, so any id baked
 * into the source is a guess that goes stale the moment someone runs `ollama pull`/`rm`. It
 * did: the engine shipped `qwen3.5:35b-a3b-coding-nvfp4` as its default long after the local
 * tag had moved to `qwen3.6:…`, and every turn that fell through to it died with
 * `[HTTP 404] model … not found` — after the run had started, so the failure landed in the
 * transcript instead of in the dispatch response.
 *
 * `list` therefore never throws and never returns a bare empty array: it reports either the
 * models or the REASON it has none (server down, wrong URL, nothing pulled), which is what
 * lets engines/ollama.ts refuse a dispatch with something a user can act on.
 */
import { resolveOllamaBaseURL } from '@cockpit/shared-utils';

export interface OllamaCatalogEntry {
  name: string;
  size: number;
  modified_at: string;
  family?: string;
  parameter_size?: string;
}

export type OllamaCatalog =
  | { ok: true; baseUrl: string; models: OllamaCatalogEntry[] }
  /** `reason` is a full sentence naming the server — it is shown verbatim to the user. */
  | { ok: false; baseUrl: string; reason: string };

interface TagsModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { family?: string; parameter_size?: string };
}

interface OpenAIModel {
  id: string;
  created?: number;
  owned_by?: string;
}

const LIST_TIMEOUT_MS = 3000;

/** Turn a fetch rejection into the sentence a user needs, keeping the server URL in it. */
function describeFailure(baseUrl: string, cause: unknown): string {
  const msg = cause instanceof Error ? cause.message : String(cause);
  if (/abort|timeout/i.test(msg)) {
    return `The Ollama server at ${baseUrl} did not answer within ${LIST_TIMEOUT_MS}ms.`;
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(msg)) {
    return `Cannot reach the Ollama server at ${baseUrl} (${msg}). Start it with \`ollama serve\`, or set another URL in the Ollama picker.`;
  }
  return `Failed to list models from the Ollama server at ${baseUrl}: ${msg}`;
}

/**
 * Installed models, newest API first.
 *
 * `/api/tags` is ollama's own endpoint and the only one that reports size/family, so it is
 * tried first; `/v1/models` is the fallback for OpenAI-compatible servers that aren't
 * ollama itself (llama.cpp, vLLM, a proxy). A `/api/tags` that answers with an EMPTY list is
 * not evidence of an empty machine — a non-ollama server 200s on unknown paths — so it falls
 * through to `/v1/models` rather than being reported as "nothing installed".
 */
export async function listOllamaModels(): Promise<OllamaCatalog> {
  const baseUrl = await resolveOllamaBaseURL();

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    if (res.ok) {
      const data = (await res.json()) as { models?: unknown };
      const models = Array.isArray(data.models) ? (data.models as TagsModel[]) : [];
      if (models.length > 0) {
        return {
          ok: true,
          baseUrl,
          models: models.map((m) => ({
            name: m.name,
            size: m.size,
            modified_at: m.modified_at,
            family: m.details?.family,
            parameter_size: m.details?.parameter_size,
          })),
        };
      }
    }
  } catch {
    // Fall through: /v1/models may still answer, and its failure carries the reason we report.
  }

  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    if (!res.ok) {
      return {
        ok: false,
        baseUrl,
        reason: `The Ollama server at ${baseUrl} returned HTTP ${res.status} for its model list.`,
      };
    }
    const data = (await res.json()) as { data?: unknown };
    const models = Array.isArray(data.data) ? (data.data as OpenAIModel[]) : [];
    return {
      ok: true,
      baseUrl,
      models: models.map((m) => ({
        name: m.id,
        size: 0,
        modified_at: m.created ? new Date(m.created * 1000).toISOString() : '',
        family: m.owned_by || undefined,
      })),
    };
  } catch (cause) {
    return { ok: false, baseUrl, reason: describeFailure(baseUrl, cause) };
  }
}
