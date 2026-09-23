import type { OutputStyle } from './effect/agentClient';

/**
 * Human-editable form of the output-styles list, used by the one-textarea manager:
 *
 *   # Concise
 *   Answer in at most three sentences.
 *   Skip preamble.
 *
 *   # Teacher
 *   Explain the why before the how.
 *
 * A line starting with `# ` (a level-1 heading) opens a style and names it;
 * every line up to the next one is its content, verbatim — real newlines, no
 * escaping, and deeper headings (`## …`) are ordinary content. The only thing a
 * style body cannot contain is a line that starts with `# ` itself.
 *
 * Ids are matched back by name, so renaming a style in the text issues it a new
 * id (sessions that selected the old name fall back to "none" — the server
 * never injects an id it cannot find).
 */
export function formatOutputStylesMarkdown(styles: OutputStyle[]): string {
  return styles.map((s) => `# ${s.name}\n${s.content}`).join('\n\n');
}

export type ParseOutputStylesResult =
  | { ok: true; styles: OutputStyle[] }
  /** `line` is 1-based. `reason` distinguishes the two failure kinds for the UI. */
  | { ok: false; line: number; reason: 'content-before-heading' | 'empty-style' | 'duplicate-name' };

const HEADING = /^#\s+(.*)$/;

export function parseOutputStylesMarkdown(text: string, previous: OutputStyle[] = []): ParseOutputStylesResult {
  const idByName = new Map(previous.map((s) => [s.name, s.id]));
  const entries: Array<{ name: string; line: number; body: string[] }> = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const heading = line.match(HEADING);
    if (heading) {
      entries.push({ name: heading[1].trim(), line: index + 1, body: [] });
      continue;
    }
    const current = entries[entries.length - 1];
    if (!current) {
      if (line.trim()) return { ok: false, line: index + 1, reason: 'content-before-heading' };
      continue;
    }
    current.body.push(line);
  }

  const seen = new Set<string>();
  const styles: OutputStyle[] = [];
  for (const entry of entries) {
    const content = entry.body.join('\n').trim();
    // `# ` with no name, or a name with no body: both would be dropped by the
    // server, so say so here instead of silently losing the row on save.
    if (!entry.name || !content) return { ok: false, line: entry.line, reason: 'empty-style' };
    if (seen.has(entry.name)) return { ok: false, line: entry.line, reason: 'duplicate-name' };
    seen.add(entry.name);
    styles.push({ id: idByName.get(entry.name) ?? '', name: entry.name, content });
  }
  return { ok: true, styles };
}
