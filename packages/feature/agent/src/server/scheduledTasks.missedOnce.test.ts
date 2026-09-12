/**
 * A `once` task must not be silently retired because the process was down when it
 * came due.
 *
 * Timers are plain setTimeout and die with the process, so a `once` task whose moment
 * passes during a restart has nothing to resume it. scheduleTask used to flip
 * `completed = true` for every expired `once` task — and because the panel renders a
 * completed task with `lastResult !== 'success'` as a failure, a task that never ran
 * was indistinguishable from one that ran and failed, with nothing in the log either.
 *
 * Both tasks here use an unsupported engine so sendChatMessageEff fails its allowlist
 * pre-flight and no real engine is ever dispatched — what is under test is the
 * scheduling decision (fire vs. retire), not the run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CWD = '/Users/x/proj';

let home: string;
let manager: typeof import('./scheduledTasks').scheduledTaskManager;
let getTasks: () => Promise<import('./scheduledTasks').ScheduledTask[]>;

const task = (id: string, dueMsAgo: number) => ({
  id,
  cwd: CWD,
  tabId: 'tab-1',
  sessionId: `sess-${id}`,
  engine: 'no-such-engine', // fails the allowlist pre-flight; never reaches an engine
  message: 'do the thing',
  type: 'once' as const,
  nextFireTime: Date.now() - dueMsAgo,
  paused: false,
  createdAt: Date.now() - dueMsAgo - 1000,
});

beforeAll(async () => {
  // COCKPIT_HOME is read at paths.ts module load, so it must be set before the import.
  home = mkdtempSync(join(tmpdir(), 'cockpit-home-'));
  process.env.COCKPIT_HOME = home;

  writeFileSync(
    join(home, 'scheduled-tasks.json'),
    JSON.stringify([
      task('within-grace', 60 * 1000), // 1 min late  → should still run
      task('beyond-grace', 25 * 60 * 60 * 1000), // 25 h late → should be retired
    ]),
    'utf-8',
  );

  const mod = await import('./scheduledTasks');
  manager = mod.scheduledTaskManager;
  getTasks = () => mod.scheduledTaskManager.getTasks();
  await manager.init();
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.COCKPIT_HOME;
});

const find = async (id: string) => (await getTasks()).find((t) => t.id === id)!;

describe('scheduleTask: once task that came due while the process was down', () => {
  it('fires a task missed inside the grace window', async () => {
    // The catch-up timer is armed with a ~0 delay, so it lands a tick after init().
    const deadline = Date.now() + 10_000;
    let t = await find('within-grace');
    while (!t.lastFiredAt && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      t = await find('within-grace');
    }
    expect(t.lastFiredAt).toBeTruthy();
    // It ran; the run itself failed on the unsupported engine, which is the point —
    // the task reached dispatch instead of being dropped before it.
    expect(t.lastResult).toBe('error');
    expect(t.completed).toBe(true);
  });

  it('retires a task missed beyond the grace window without running it', async () => {
    const t = await find('beyond-grace');
    expect(t.completed).toBe(true);
    expect(t.lastFiredAt).toBeUndefined();
    // The marker that separates "never ran" from "ran and failed".
    expect(t.unread).toBe(true);
  });
});
