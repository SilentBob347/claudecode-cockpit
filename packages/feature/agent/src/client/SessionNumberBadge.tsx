'use client';

import { SessionNumberChip, sessionNumberClass, sessionNumberRing, sessionNumberWash, type SessionNumberStatus } from '@cockpit/shared-ui';

interface SessionNumberBadgeProps {
  projectNumber?: number | string;
  sessionNumber?: number | string;
  /** The two numbers as one "1.6" string, which is how every sessionNumbers map
   *  stores them. Takes the place of splitting at each call site — that was the
   *  same three-line IIFE copied into every list. When it is absent but a live
   *  status exists, the round badge uses `·`, matching the project list. */
  coordinate?: string;
  /** Session state, carried by the round chip and its running ring only. */
  status?: SessionNumberStatus;
  /** Translated name of that state, exposed as the chip's tooltip/aria text —
   *  the colour is the whole label now, so the words have to live somewhere. */
  statusLabel?: string;
  /** Bot that dispatched the session: the round chip becomes a robot head, the
   *  same mark the tab strip shows, so a session found in a list and the tab it
   *  opens into are recognisably the same thing. */
  bot?: string;
  className?: string;
}

/** Narrow the free-form `session.status` string the session lists carry down to
 *  the three states the badge knows about. */
export function badgeStatus(status: string | undefined): SessionNumberStatus {
  return status === 'loading' || status === 'unread' ? status : 'normal';
}

/** Compact navigation coordinates: square project number + circular session
 *  number. Same two shapes and the same wash as the sidebar / tab bar badges
 *  this coordinate points at — it only works as a pointer if it looks like the
 *  thing it names, so the colours come from the shared `sessionNumberClass`
 *  rather than a second hand-written copy of them.
 *
 *  `status` decorates the ROUND chip only. Running/unread is a property of the
 *  session, not of the project it sits in, and animating both chips together turns
 *  a two-glyph coordinate into one moving blob you can no longer read as
 *  "project 5, session 1". The square chip therefore always stays idle. */
export function SessionNumberBadge({ projectNumber, sessionNumber, coordinate, status = 'normal', statusLabel, bot, className = '' }: SessionNumberBadgeProps) {
  if (coordinate) {
    const [project, session] = coordinate.split('.');
    projectNumber ??= project;
    sessionNumber ??= session;
  }
  if (projectNumber == null && sessionNumber == null && status !== 'normal') {
    sessionNumber = '·';
  }
  if (projectNumber == null && sessionNumber == null) return null;

  const coordinateLabel = [projectNumber, sessionNumber].filter((value) => value != null).join('.');

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9px] font-medium leading-none tabular-nums flex-shrink-0 ${className}`}
      aria-label={statusLabel ? `${coordinateLabel} · ${statusLabel}` : coordinateLabel}
    >
      {projectNumber != null && (
        <span className={`flex h-4 w-4 items-center justify-center border rounded-[4px] ${sessionNumberClass('normal', false)}`}>{projectNumber}</span>
      )}
      {/* The round chip is the Bot-aware one: a Bot drives a SESSION, and the
          square names the project it happens to sit in. */}
      {sessionNumber != null && (
        <SessionNumberChip
          wash={sessionNumberWash(status, false)}
          ring={sessionNumberRing(status)}
          bot={bot}
          title={statusLabel}
        >
          {sessionNumber}
        </SessionNumberChip>
      )}
    </span>
  );
}
