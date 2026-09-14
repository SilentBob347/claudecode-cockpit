/**
 * Pure query parsing for /api/sessions/search — shared by the route and its tests.
 */

export const MAX_SEARCH_TERMS = 12;

/** Split repeated `q` params (each may hold `a|b` alternatives) into unique terms. */
export function parseSearchTerms(raw: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.flatMap((q) => q.split('|'))) {
    const term = part.trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= MAX_SEARCH_TERMS) break;
  }
  return out;
}

/** ISO date or epoch ms → epoch ms; undefined when absent; null when unparseable. */
export function parseSince(raw: string | null): number | undefined | null {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}
