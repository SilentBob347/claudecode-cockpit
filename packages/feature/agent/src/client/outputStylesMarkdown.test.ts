import { describe, expect, it } from 'vitest';
import { formatOutputStylesMarkdown, parseOutputStylesMarkdown } from './outputStylesMarkdown';

describe('outputStylesMarkdown', () => {
  it('round-trips multi-line styles and keeps ids by name', () => {
    const styles = [
      { id: 'a1', name: 'Concise', content: 'Short answers.\n\n## Rules\n- no preamble' },
      { id: 'b2', name: 'Teacher', content: 'Explain why first.' },
    ];
    const parsed = parseOutputStylesMarkdown(formatOutputStylesMarkdown(styles), styles);
    expect(parsed).toEqual({ ok: true, styles });
  });

  it('gives renamed or new styles an empty id for the server to issue', () => {
    const parsed = parseOutputStylesMarkdown('# Renamed\nbody', [{ id: 'a1', name: 'Old', content: 'body' }]);
    expect(parsed).toEqual({ ok: true, styles: [{ id: '', name: 'Renamed', content: 'body' }] });
  });

  it('accepts an empty document as an empty list', () => {
    expect(parseOutputStylesMarkdown('  \n\n')).toEqual({ ok: true, styles: [] });
  });

  it('rejects text before the first heading', () => {
    expect(parseOutputStylesMarkdown('\nstray\n# A\nx')).toEqual({ ok: false, line: 2, reason: 'content-before-heading' });
  });

  it('rejects a style without content or name', () => {
    expect(parseOutputStylesMarkdown('# A\n\n# B\nx')).toEqual({ ok: false, line: 1, reason: 'empty-style' });
    expect(parseOutputStylesMarkdown('# \nx')).toMatchObject({ ok: false, reason: 'empty-style' });
  });

  it('rejects duplicate names', () => {
    expect(parseOutputStylesMarkdown('# A\nx\n# A\ny')).toEqual({ ok: false, line: 3, reason: 'duplicate-name' });
  });
});
