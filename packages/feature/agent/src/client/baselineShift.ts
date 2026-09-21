/**
 * Telling a turn's authored work apart from a shift of its baseline.
 *
 * Snapshots record every mutating tool call honestly, so
 * `git checkout -b x origin/main` shows up as a call that rewrote 200 files.
 * That is true, and useless to aggregate across: the 17k lines it moved are
 * other people's commits, and they bury everything the turn actually did.
 *
 * There is no signal in a snapshot that says "this was a branch switch" —
 * commits carry the tool name and the files, not the project's own git HEAD —
 * so size stands in for intent. That makes this a symptom-level fix with two
 * known limits, both deliberate:
 *
 *   - It can only be applied to LEADING calls. A baseline shift in the MIDDLE
 *     of a range poisons the diff just as badly, and dropping the calls around
 *     it would silently discard real work. Catching that needs the project's
 *     git HEAD recorded per snapshot, and the range cut at the last change.
 *   - A wide mechanical edit (a codemod, a formatter run) is indistinguishable
 *     from a branch switch by file count. Callers must surface the skip and
 *     let the user undo it rather than applying it silently.
 */

/**
 * File count at or above which a call reads as a baseline shift.
 *
 * A judgement call, not a measurement: hand-authored turns land well below it,
 * bulk mechanical ones well above.
 */
export const BASELINE_SHIFT_FILES = 50;

/** The shape this module needs from a call — its size, nothing else. */
export interface CallSize {
  readonly files: ReadonlyArray<unknown>;
  /** Server capped the file list (200+ files). */
  readonly truncated?: boolean;
}

/** Did this call move the baseline instead of authoring the work? */
export function isBaselineShift(call: CallSize): boolean {
  // `truncated` is checked separately because a capped call reports exactly
  // the cap as its length, never its real size.
  return call.truncated === true || call.files.length >= BASELINE_SHIFT_FILES;
}

/**
 * How many calls at the START of the list read as baseline shifts.
 *
 * Never returns the full length: a range has to span something, so the last
 * call is always kept even when it too looks like a shift. A single call is
 * therefore never skipped — with nothing after it, "skip it" would leave the
 * aggregate with no content and no way to explain itself.
 */
export function countLeadingBaselineShifts(calls: ReadonlyArray<CallSize>): number {
  let i = 0;
  while (i < calls.length - 1 && isBaselineShift(calls[i])) i++;
  return i;
}
