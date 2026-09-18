/**
 * Ollama engine — a thin provider binding over the Built-in Agent loop.
 *
 * All the machinery (loop, tools, transcript, system prompt) lives in
 * engines/builtinAgent; this file only says WHICH model provider to talk to and
 * WHERE the transcripts go. The store directory keeps its historical name
 * (~/.cockpit/ollama-sessions) — renaming it would orphan every existing session.
 *
 * The one thing it does NOT share with the other Built-in Agent engines is a compiled-in
 * default model: ollama's catalog is whatever this machine pulled, so resolution is a
 * preflight that consults the machine (ollamaCatalog.ts) instead of a constant.
 */
import { getBuiltinSessionsRoot, readOllamaLastModel, rememberOllamaLastModel } from '@cockpit/shared-utils';
import { runBuiltinAgent, requireTextPrompt, type BuiltinAgentConfig } from './builtinAgent';
import { createOllamaModel } from './builtinAgent/model';
import { listOllamaModels, type OllamaCatalogEntry } from './ollamaCatalog';
import { readSessionModel } from './sessionModel';
import type { DispatchParams, EngineSpec } from './types';

const OLLAMA_CONFIG: BuiltinAgentConfig = {
  engine: 'ollama',
  sessionsRoot: getBuiltinSessionsRoot('ollama'),
  createModel: (model) => createOllamaModel(model),
};

type Preflight = { ok: true } | { ok: false; status: number; error: string };

const fail = (error: string): Preflight => ({ ok: false, status: 400, error });

/** `gpt-oss` when the machine only has `gpt-oss:20b` — the exact 404 this engine kept hitting. */
function matchInstalled(requested: string, models: ReadonlyArray<OllamaCatalogEntry>): string | undefined {
  const exact = models.find((m) => m.name === requested);
  if (exact) return exact.name;
  const byTag = models.filter((m) => m.name.startsWith(`${requested}:`));
  return byTag.length === 1 ? byTag[0].name : undefined;
}

const nameList = (models: ReadonlyArray<OllamaCatalogEntry>) => models.map((m) => m.name).join(', ');

/**
 * Settle on a model BEFORE the run starts, so a bad one is a 400 on the dispatch — which the
 * caller reads — rather than a `⚠️ [HTTP 404] model … not found` written into a session that
 * then has to be thrown away. Order:
 *
 *   1. the request's own `model`, verified against the catalog (a bare name is completed to
 *      its installed tag when exactly one matches, so `gpt-oss` finds `gpt-oss:20b`);
 *   2. the model this session already ran on — a follow-up turn must not silently switch
 *      engines under a session just because the caller omitted the field;
 *   3. the model the last ollama run anywhere used;
 *   4. the first model the machine reports.
 *
 * An unreachable catalog only blocks (1) when it would have been the thing doing the
 * blocking: an explicitly requested model is passed through so a server whose list endpoints
 * we can't read (a proxy, llama.cpp) still works, and the provider gets to reject it itself.
 */
async function resolveOllamaModel(params: DispatchParams): Promise<Preflight> {
  const requested = typeof params.model === 'string' ? params.model.trim() : '';
  const recorded = requested ? undefined : await readSessionModel('ollama', params.cwd, params.sessionId);
  if (recorded) {
    params.model = recorded;
    await rememberOllamaLastModel(recorded);
    return { ok: true };
  }

  const catalog = await listOllamaModels();
  if (!catalog.ok) {
    // Trust the caller when we cannot check: the run fails with the provider's own words.
    if (requested) {
      params.model = requested;
      return { ok: true };
    }
    return fail(`${catalog.reason} Cockpit picks the model from that list, and this message named none.`);
  }

  if (requested) {
    const installed = matchInstalled(requested, catalog.models);
    if (!installed) {
      return fail(
        catalog.models.length === 0
          ? `The Ollama server at ${catalog.baseUrl} has no models installed, so '${requested}' cannot run. Pull it with \`ollama pull ${requested}\`.`
          : `Model '${requested}' is not installed on the Ollama server at ${catalog.baseUrl}. Available: ${nameList(catalog.models)}.`,
      );
    }
    params.model = installed;
    await rememberOllamaLastModel(installed);
    return { ok: true };
  }

  if (catalog.models.length === 0) {
    return fail(
      `The Ollama server at ${catalog.baseUrl} has no models installed. Pull one with \`ollama pull <model>\` (e.g. \`ollama pull qwen3\`), then try again.`,
    );
  }

  const last = await readOllamaLastModel();
  const chosen = (last && matchInstalled(last, catalog.models)) || catalog.models[0].name;
  params.model = chosen;
  await rememberOllamaLastModel(chosen);
  return { ok: true };
}

export const ollamaSpec: EngineSpec = {
  name: 'ollama',
  async preflight(params) {
    const textCheck = requireTextPrompt(params);
    if (!textCheck.ok) return textCheck;
    return resolveOllamaModel(params);
  },
  runner: {
    run: (ctx) => runBuiltinAgent(ctx, OLLAMA_CONFIG),
    // No resolveTitle → teardown uses 'unread' with undefined title.
  },
};
