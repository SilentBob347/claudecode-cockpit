/**
 * `claude-opus-4-8-20260101` -> `Opus 4.8`. A hyphen between two digits is a
 * version separator (becomes a dot); every other hyphen is a word separator.
 *
 * Two callers, one rule: the token-stats chart labels whatever id a transcript
 * happens to carry, and the model picker's trigger has to label a model that is
 * no longer in the menu. Dropping a superseded model from the picker leaves any
 * session pinned to it running on it, so that trigger must still read as a
 * model name and not as a raw id.
 */
export function formatModelLabel(modelId: string): string {
  return modelId
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/(\d)-(?=\d)/g, '$1.')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * `gpt-5.6-terra` -> `GPT-5.6-Terra`, matching how codex spells its own model
 * names. Same job as `formatModelLabel` on the Claude side: a model dropped
 * from the picker keeps running on the sessions pinned to it, and its trigger
 * has to keep naming it.
 */
export function formatCodexModelLabel(modelId: string): string {
  return modelId
    .split('-')
    .map((part, i) => (i === 0 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('-');
}
