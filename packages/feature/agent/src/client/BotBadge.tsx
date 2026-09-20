'use client';

import { Bot } from 'lucide-react';

/**
 * BotBadge — "a Bot is driving this session, not a person".
 *
 * Sits immediately BEFORE the engine mark, so the pair reads left to right as
 * *who* asked and *what* is answering: `🤖 ✳ Claude running 20m28s`. Order
 * matters — the engine mark is present on every session, the robot only on
 * dispatched ones, so the robot has to be the element that appears, never one
 * that shifts the engine mark's slot onto something else.
 *
 * Only the running line uses it. The tab strip and the session lists mark a Bot
 * by the SHAPE of their number chip instead (SessionNumberChip) — there the chip
 * is already the "what is this" slot, while here there is no chip to reshape.
 *
 * Renders nothing without a Bot — callers pass the session's value straight
 * through and never branch themselves.
 */

interface BotBadgeProps {
  /** Bot name without the `@` (see shared/botSession.ts); null/undefined = a human's session. */
  bot?: string | null;
}

export function BotBadge({ bot }: BotBadgeProps) {
  if (!bot) return null;
  return (
    <span
      className="shrink-0 inline-flex items-center text-brand"
      data-tooltip={`@${bot}`}
      aria-label={`Bot session: @${bot}`}
      role="img"
    >
      <Bot className="h-3.5 w-3.5" />
    </span>
  );
}
