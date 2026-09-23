import { describe, expect, it } from 'vitest';
import { normalizeOutputStyles } from './outputStyles';
import { buildSystemPrompt } from '../engines/builtinAgent/prompt';

describe('normalizeOutputStyles', () => {
  it('drops unusable entries, dedupes names, keeps and reissues ids', () => {
    const out = normalizeOutputStyles([
      { id: 'a', name: ' Concise ', content: ' short \n' },
      { id: 'a', name: 'Other', content: 'x' },
      { id: 'b', name: 'Concise', content: 'dup name' },
      { id: 'c', name: '', content: 'no name' },
      { id: 'd', name: 'Empty', content: '   ' },
      'junk',
      null,
    ]);
    expect(out.map((s) => [s.name, s.content])).toEqual([['Concise', 'short'], ['Other', 'x']]);
    expect(out[0].id).toBe('a');
    expect(out[1].id).not.toBe('a');
    expect(out[1].id).toBeTruthy();
  });

  it('returns [] for non-arrays', () => {
    expect(normalizeOutputStyles(undefined)).toEqual([]);
    expect(normalizeOutputStyles({ styles: [] })).toEqual([]);
  });
});

describe('buildSystemPrompt output style', () => {
  it('appends the style last and leaves the prompt unchanged without one', () => {
    const base = buildSystemPrompt('/tmp');
    expect(buildSystemPrompt('/tmp', undefined)).toBe(base);
    const styled = buildSystemPrompt('/tmp', 'Talk like a pirate.');
    expect(styled.startsWith(base)).toBe(true);
    expect(styled.endsWith('## Output style\n\nTalk like a pirate.')).toBe(true);
  });
});
