import type { ChangeClass } from '@cockpit/shared-utils';

/** Subdued chip marking a test-only or docs-only change. */
export function ChangeClassChip({ cls }: { cls: ChangeClass }) {
  return (
    <span
      className={`text-[10px] px-1 py-px rounded flex-shrink-0 ${
        cls === 'test'
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400/80'
          : 'bg-sky-500/15 text-sky-600 dark:text-sky-400/80'
      }`}
    >
      {cls}
    </span>
  );
}
