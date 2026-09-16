import { describe, expect, it } from 'vitest';
import { COMMIT_FIELD_SEPARATOR as F, COMMIT_RECORD_SEPARATOR as R, parseCommitLog } from './commitLog';

function record(hash: string, subject: string, body: string, files: string[]): string {
  return `${R}${[hash, hash.slice(0, 7), 'Ada', 'ada@example.com', '2026-09-16 12:00:00 +0800', subject, body, `\n${files.join('\n')}\n`].join(F)}`;
}

describe('parseCommitLog', () => {
  it('classifies test-only and docs-only commits', () => {
    const parsed = parseCommitLog(
      record('aaaaaaaa', 'tests', '', ['src/a.test.ts', 'tests/b.ts'])
      + record('bbbbbbbb', 'docs', 'details', ['README.md', 'docs/setup.rst']),
    );

    expect(parsed.map(({ hash, body, changeClass }) => ({ hash, body, changeClass }))).toEqual([
      { hash: 'aaaaaaaa', body: '', changeClass: 'test' },
      { hash: 'bbbbbbbb', body: 'details', changeClass: 'docs' },
    ]);
  });

  it('leaves mixed commits unclassified', () => {
    const [commit] = parseCommitLog(record('cccccccc', 'mixed', '', ['src/a.ts', 'src/a.test.ts']));
    expect(commit.changeClass).toBeNull();
  });
});
