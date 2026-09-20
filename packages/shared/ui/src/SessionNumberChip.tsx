'use client';

import type { ReactNode } from 'react';

/**
 * SessionNumberChip — the round session marker, in its two shapes.
 *
 * Three surfaces draw this chip: the tab strip, the coordinate badge every
 * session list renders (SessionNumberBadge), and the sidebar's per-project
 * badges. Each used to hand-roll the same span, which was survivable while the
 * only thing that varied was a colour class.
 *
 * A Bot-dispatched session changes the chip's SHAPE, and shape is markup — a
 * robot mask over the wash, the digit nudged down to the head's centre, and the
 * running ring lifted out of the mask. Three copies of THAT is exactly how the
 * engine chips drifted before EngineBadge existed, so it lives here once.
 *
 * Deliberately dumb: callers own the colours (`sessionNumberWash` / `sessionNumberRing`,
 * or their own pinned/active variants) and the surrounding layout; this owns the shape.
 *
 * Ring and wash arrive as two props, not one class string: on the robot variant
 * they land on different elements (see 2. below), so the split has to exist
 * before this component, in sessionNumberStyles.
 *
 * Two things the robot variant has to get right, both non-obvious:
 *
 * 1. It is 20px against the circle's 16. `mask-size: contain` fits the WHOLE
 *    robot — antenna and ears included — inside the box, so at equal box sizes
 *    the head comes out smaller than the circle it replaces. The negative margin
 *    spends the extra 4px symmetrically outside the 16px slot, so the number
 *    lands exactly where it sits on a round chip and no caller's layout moves.
 *
 * 2. A mask clips the element's pseudo-elements too, and the running ring is a
 *    `::after` at inset:-2px — OUTSIDE the chip. Masked, it would disappear, and
 *    a Bot session is the one you most want to see running. So the ring stays on
 *    an unmasked wrapper and only the wash + digit are masked.
 */

const DIGIT = 'font-mono text-[9px] font-medium leading-none tabular-nums transition-colors';

interface SessionNumberChipProps {
  /** Usually the session number; `·` in lists that have no coordinate for it. */
  children: ReactNode;
  /** Background wash + numeral colour — normally `sessionNumberWash(status, isActive)`,
   *  or a caller's own variant (the tab strip's pinned amber, for instance). */
  wash: string;
  /** The running ring — `sessionNumberRing(status)`. Empty string when idle. */
  ring?: string;
  /** Bot name without the `@` (see feature-agent shared/botSession.ts). Set = robot. */
  bot?: string;
  /** Extra classes on the outermost node (hover effects, margins). */
  className?: string;
  /** Hover text. Defaults to `@bot` on a Bot chip, so every list gets the name free. */
  tooltip?: string;
  title?: string;
  role?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
}

export function SessionNumberChip({
  children,
  wash,
  ring = '',
  bot,
  className = '',
  tooltip,
  title,
  role,
  ariaLabel,
  ariaHidden,
}: SessionNumberChipProps) {
  const shared = {
    title,
    role,
    'aria-label': ariaLabel,
    'aria-hidden': ariaHidden ? ('true' as const) : undefined,
    'data-tooltip': tooltip ?? (bot ? `@${bot}` : undefined),
  };

  if (!bot) {
    // One element carries both halves — nothing is masked, so nothing gets clipped.
    return (
      <span
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${DIGIT} ${ring} ${wash} ${className}`}
        {...shared}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={`relative -m-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center ${ring} ${className}`}
      {...shared}
    >
      <span
        className={`session-number-bot flex h-full w-full items-center justify-center ${DIGIT} ${wash}`}
      >
        {/* The head's centre sits one antenna below the box's, so the digit
            follows it down instead of floating in the robot's forehead. */}
        <span className="translate-y-[1.5px]">{children}</span>
      </span>
    </span>
  );
}
