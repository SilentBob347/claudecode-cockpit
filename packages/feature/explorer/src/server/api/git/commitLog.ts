import { classifyFiles, type ChangeClass } from '@cockpit/shared-utils';

export const COMMIT_RECORD_SEPARATOR = '\x1e';
export const COMMIT_FIELD_SEPARATOR = '\x00';

export interface ParsedCommitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  changeClass: ChangeClass | null;
}

/** Parse metadata plus `--name-only` output from the commits route's git log. */
export function parseCommitLog(stdout: string): ParsedCommitLogEntry[] {
  return stdout
    .split(COMMIT_RECORD_SEPARATOR)
    .filter((record) => record.includes(COMMIT_FIELD_SEPARATOR))
    .map((record) => {
      const [
        rawHash,
        shortHash,
        author,
        authorEmail,
        date,
        subject,
        body = '',
        names = '',
      ] = record.split(COMMIT_FIELD_SEPARATOR);
      const files = names
        .replace(/^\r?\n/, '')
        .trimEnd()
        .split(/\r?\n/)
        .filter(Boolean);

      return {
        hash: rawHash.replace(/^\r?\n+/, ''),
        shortHash,
        author,
        authorEmail,
        date,
        subject,
        body: body.trim(),
        changeClass: classifyFiles(files),
      };
    });
}
