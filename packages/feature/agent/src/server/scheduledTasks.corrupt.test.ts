/**
 * A malformed scheduled-tasks.json must neither boot the server down nor be
 * overwritten.
 *
 * Two failure modes pull in opposite directions and both are real:
 *
 *  - Reading it as `[]` (what readJsonFile does for any error) silently
 *    unschedules everything, and the first save persists that emptiness — the
 *    user's tasks are gone, with no message anywhere.
 *  - Letting the strict read throw takes down `await scheduledTaskManager.init()`
 *    in server.mjs, which has no error boundary: one bad byte and Cockpit will
 *    not start at all.
 *
 * The resolution is to run with no timers, say so loudly, and leave the bytes
 * alone for the user to repair.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CORRUPT = '[{"id": "a", "cwd": "/x",}]'; // trailing comma — a hand-edit typo

let home: string;
let taskFile: string;
let mod: typeof import('./scheduledTasks');
/** Collected here rather than read back off the spy: `ReturnType<typeof vi.spyOn>`
 *  loses its generics, so `mock.calls` degrades to implicit `any`. */
const logged: string[] = [];
let restoreConsole: () => void;

beforeAll(async () => {
  // COCKPIT_HOME is read at paths.ts module load, so it must be set before the import.
  home = mkdtempSync(join(tmpdir(), 'cockpit-home-corrupt-'));
  process.env.COCKPIT_HOME = home;
  taskFile = join(home, 'scheduled-tasks.json');
  writeFileSync(taskFile, CORRUPT, 'utf-8');

  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => String(a)).join(' '));
  });
  restoreConsole = () => spy.mockRestore();
  mod = await import('./scheduledTasks');
});

afterAll(() => {
  restoreConsole();
  rmSync(home, { recursive: true, force: true });
});

describe('scheduledTaskManager with a malformed task file', () => {
  it('boots instead of throwing, and says why', async () => {
    await expect(mod.scheduledTaskManager.init()).resolves.toBeUndefined();
    expect(mod.scheduledTaskManager.isLoadFailed()).toBe(true);
    expect(logged.join('\n')).toContain('NO scheduled task will fire');
  });

  it('leaves the file byte-for-byte alone', () => {
    expect(readFileSync(taskFile, 'utf-8')).toBe(CORRUPT);
  });

  it('refuses the write paths rather than replacing the file', async () => {
    await expect(
      mod.scheduledTaskManager.addTask({
        cwd: '/x',
        tabId: 't',
        sessionId: 's',
        engine: 'no-such-engine',
        message: 'hi',
        type: 'once',
        nextFireTime: Date.now() + 60_000,
      } as Parameters<typeof mod.scheduledTaskManager.addTask>[0]),
    ).rejects.toThrow(/not valid JSON/);
    expect(readFileSync(taskFile, 'utf-8')).toBe(CORRUPT);
  });
});
