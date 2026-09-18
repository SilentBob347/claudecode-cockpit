import {
  isInstructionGroup,
  type InstructionNode,
} from './effect/agentClient';

const tempId = () => Math.random().toString(36).slice(2, 10);

/**
 * Human-editable outline:
 *
 *   Loose instruction
 *   Group name
 *   - instruction in the group
 *
 * A top-level line becomes a group only when it owns indented list items.
 * Empty groups therefore intentionally collapse to loose instructions: without
 * children there is no syntax-level distinction for the editor to preserve.
 *
 * Multi-line instructions are spelled with a literal `\n`, because in this
 * outline the line break IS the record separator and cannot also mean "newline
 * inside one record". The escape lives ONLY between these two functions:
 * storage, the API and the send path all carry real newlines, so "what is
 * stored" always equals "what gets sent" — no consumer has to remember to
 * decode. Encode and decode must therefore stay paired; adding one without the
 * other silently splits a multi-line instruction into several on the next save.
 *
 * There is deliberately no `\\` escape, so an instruction cannot express a
 * literal backslash-n (`C:\new`, a regex `\n`) — those decode to a newline.
 * That trade buys a syntax with no backslash counting, and the round trip for
 * real newlines stays lossless either way.
 */
const encodeNewlines = (text: string): string => text.replace(/\n/g, '\\n');
const decodeNewlines = (text: string): string => text.replace(/\\n/g, '\n');

export function formatInstructionsMarkdown(nodes: InstructionNode[]): string {
  return nodes.flatMap((node) => isInstructionGroup(node)
    ? [
        encodeNewlines(node.name),
        ...(node.items.length > 0 ? node.items.map((item) => `- ${encodeNewlines(item.text)}`) : ['- ']),
      ]
    : [encodeNewlines(node.text)]
  ).join('\n');
}

export type ParseInstructionsResult =
  | { ok: true; nodes: InstructionNode[] }
  | { ok: false; line: number };

export function parseInstructionsMarkdown(text: string): ParseInstructionsResult {
  const entries: Array<{ text: string; children: string[]; isGroup: boolean }> = [];
  let current: { text: string; children: string[]; isGroup: boolean } | null = null;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    if (!rawLine.trim()) continue;

    const child = rawLine.match(/^\s*-(?:\s+(.*))?$/);
    if (child) {
      // Emptiness is judged BEFORE decoding, so a bare `- ` still means
      // "group with no children" rather than a child holding one newline.
      const childText = (child[1] ?? '').trim();
      if (!current) return { ok: false, line: index + 1 };
      current.isGroup = true;
      if (childText) current.children.push(decodeNewlines(childText));
      continue;
    }

    // Top-level entries are deliberately flush-left and have no list marker.
    if (/^\s/.test(rawLine)) {
      return { ok: false, line: index + 1 };
    }

    const rootText = rawLine.trim();
    if (!rootText) continue;
    current = { text: decodeNewlines(rootText), children: [], isGroup: false };
    entries.push(current);
  }

  return {
    ok: true,
    nodes: entries.map((entry) => entry.isGroup
      ? {
          id: tempId(),
          name: entry.text,
          items: entry.children.map((text) => ({ id: tempId(), text })),
        }
      : { id: tempId(), text: entry.text }),
  };
}
