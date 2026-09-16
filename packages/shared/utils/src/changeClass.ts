/**
 * Conservative classification for changed files. These labels help reviewers
 * skim test-only and docs-only changes without guessing about runtime files.
 */
export type ChangeClass = 'test' | 'docs';

const TEST_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /\.(test|spec)\.[^/]+$/,
];

const DOCS_PATTERNS: ReadonlyArray<RegExp> = [
  /\.(md|mdx)$/i,
  /(^|\/)docs\//,
  /(^|\/)README[^/]*$/i,
  /(^|\/)LICENSE[^/]*$/i,
  /(^|\/)CHANGELOG[^/]*$/i,
];

/** Classify one cwd-relative path; null means regular code. */
export function classifyPath(path: string): ChangeClass | null {
  if (TEST_PATTERNS.some((re) => re.test(path))) return 'test';
  if (DOCS_PATTERNS.some((re) => re.test(path))) return 'docs';
  return null;
}

/** Classify a whole change set only when every file has the same class. */
export function classifyFiles(paths: ReadonlyArray<string>): ChangeClass | null {
  if (paths.length === 0) return null;
  const first = classifyPath(paths[0]);
  if (first === null) return null;
  return paths.every((path) => classifyPath(path) === first) ? first : null;
}
