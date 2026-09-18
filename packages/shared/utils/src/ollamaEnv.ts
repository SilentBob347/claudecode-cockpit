/**
 * Central resolution + storage for the Ollama / LLM connection config.
 *
 * The connection has two fields — server root `baseUrl` and `apiKey` — kept
 * together as a pair (a given server URL has its own key). They are persisted in
 * a dedicated file (OLLAMA_CONFIG_FILE), NOT settings.json, so the key is never
 * shipped to the browser via GET /api/settings.
 *
 * Resolution priority per field:  config file  >  env var  >  default.
 * (baseUrl env: OLLAMA_BASE_URL — just the server root, no /v1/ suffix;
 *  apiKey env: OLLAMA_API_KEY — third-party plugin key, EFFECT.md §0 exemption.)
 *
 * If baseUrl is set WITH /v1/ by mistake, we strip it — be forgiving.
 */
import {
  OLLAMA_CONFIG_FILE,
  readJsonFile,
  mutateJsonFile,
} from './paths';

const DEFAULT_BASE = 'http://127.0.0.1:11434';
/** Placeholder key ollama's OpenAI-compatible endpoint accepts for keyless local servers. */
const DEFAULT_API_KEY = 'ollama';

export interface OllamaStoredConfig {
  baseUrl?: string;
  apiKey?: string;
  /**
   * The model the last ollama run actually used, on any session. Ollama serves whatever
   * this machine pulled, so there is no id worth hardcoding as "the default" — this is the
   * only honest one, and it is what a new session falls back to before the catalog's first
   * entry (engines/ollama.ts). Written by dispatch, not by the config route.
   */
  lastModel?: string;
}

type ConfigSource = 'file' | 'env' | 'default';

/** What the picker shows on open: effective values (masked key) + where each came from. */
export interface OllamaEffectiveConfig {
  baseUrl: string;
  baseUrlSource: ConfigSource;
  hasKey: boolean;
  maskedKey: string;
  keySource: ConfigSource;
}

/** Normalize a server root: strip a trailing /v1/ and any trailing slashes. */
function normalizeBase(raw: string): string {
  return raw.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
}

/** Mask all but the last 4 chars, e.g. sk-1234abcd → sk-•••••bcd */
export function maskOllamaKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return key.replace(/./g, '•');
  return `${key.slice(0, 3)}${'•'.repeat(Math.max(4, key.length - 7))}${key.slice(-4)}`;
}

/** Raw stored config from the config file. Returns {} when unset. */
export async function readOllamaStoredConfig(): Promise<OllamaStoredConfig> {
  return readJsonFile<OllamaStoredConfig>(OLLAMA_CONFIG_FILE, {});
}

/**
 * Merge a partial config into the stored file. A field set to '' clears it
 * (falls back to env/default on next resolve); a field left `undefined` is
 * untouched. Lock-serialized read-modify-write so concurrent saves don't race.
 */
export async function writeOllamaStoredConfig(
  patch: OllamaStoredConfig
): Promise<OllamaStoredConfig> {
  return mutateJsonFile<OllamaStoredConfig>(OLLAMA_CONFIG_FILE, {}, (cur) => {
    const next: OllamaStoredConfig = { ...cur };
    if (patch.baseUrl !== undefined) {
      const v = patch.baseUrl.trim();
      if (v) next.baseUrl = v;
      else delete next.baseUrl;
    }
    if (patch.apiKey !== undefined) {
      const v = patch.apiKey.trim();
      if (v) next.apiKey = v;
      else delete next.apiKey;
    }
    if (patch.lastModel !== undefined) {
      const v = patch.lastModel.trim();
      if (v) next.lastModel = v;
      else delete next.lastModel;
    }
    return next;
  });
}

/** The model the last ollama run used, or undefined when none ever has. */
export async function readOllamaLastModel(): Promise<string | undefined> {
  return (await readOllamaStoredConfig()).lastModel?.trim() || undefined;
}

/**
 * Remember the model a run resolved to. A no-op when it is already the recorded one — this
 * is called on every dispatch and mutateJsonFile always rewrites the file.
 */
export async function rememberOllamaLastModel(model: string): Promise<void> {
  const v = model.trim();
  if (!v) return;
  if ((await readOllamaStoredConfig()).lastModel === v) return;
  await writeOllamaStoredConfig({ lastModel: v });
}

/** Server root (no /v1/), resolved by priority. */
export async function resolveOllamaBaseURL(): Promise<string> {
  const cfg = await readOllamaStoredConfig();
  const raw = cfg.baseUrl?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_BASE;
  return normalizeBase(raw);
}

/** OpenAI-compatible base URL (with /v1/) for the AI SDK. */
export async function resolveOllamaOpenAIBaseURL(): Promise<string> {
  return `${await resolveOllamaBaseURL()}/v1/`;
}

/** Both connection fields resolved by priority — used when creating the model. */
export async function resolveOllamaConnection(): Promise<{
  baseUrl: string;
  apiKey: string;
}> {
  const cfg = await readOllamaStoredConfig();
  const baseUrl = normalizeBase(
    cfg.baseUrl?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_BASE
  );
  const apiKey =
    cfg.apiKey?.trim() || process.env.OLLAMA_API_KEY || DEFAULT_API_KEY;
  return { baseUrl, apiKey };
}

/**
 * Effective config for display: resolved values plus the source of each.
 * The placeholder default key ('ollama') is reported as hasKey=false so the UI
 * doesn't present it as a real configured credential.
 */
export async function getOllamaEffectiveConfig(): Promise<OllamaEffectiveConfig> {
  const cfg = await readOllamaStoredConfig();

  let baseUrl: string;
  let baseUrlSource: ConfigSource;
  if (cfg.baseUrl?.trim()) {
    baseUrl = normalizeBase(cfg.baseUrl.trim());
    baseUrlSource = 'file';
  } else if (process.env.OLLAMA_BASE_URL) {
    baseUrl = normalizeBase(process.env.OLLAMA_BASE_URL);
    baseUrlSource = 'env';
  } else {
    baseUrl = DEFAULT_BASE;
    baseUrlSource = 'default';
  }

  let rawKey: string;
  let keySource: ConfigSource;
  if (cfg.apiKey?.trim()) {
    rawKey = cfg.apiKey.trim();
    keySource = 'file';
  } else if (process.env.OLLAMA_API_KEY) {
    rawKey = process.env.OLLAMA_API_KEY;
    keySource = 'env';
  } else {
    rawKey = ''; // placeholder DEFAULT_API_KEY is not a real credential
    keySource = 'default';
  }

  return {
    baseUrl,
    baseUrlSource,
    hasKey: !!rawKey,
    maskedKey: maskOllamaKey(rawKey),
    keySource,
  };
}
