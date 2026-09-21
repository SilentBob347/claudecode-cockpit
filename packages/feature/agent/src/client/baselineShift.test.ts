/**
 * Which leading calls the aggregate view drops.
 *
 * The interesting cases are all boundaries: the skip must never eat the whole
 * list (a range needs something to span), must not reach past the first
 * normal call, and must leave a lone call alone no matter its size.
 */
import { describe, it, expect } from 'vitest';
import {
  BASELINE_SHIFT_FILES,
  isBaselineShift,
  countLeadingBaselineShifts,
  type CallSize,
} from './baselineShift';

/** A call touching `n` files. */
const call = (n: number, truncated = false): CallSize => ({
  files: new Array(n).fill(null),
  truncated,
});

const BIG = call(BASELINE_SHIFT_FILES);
const SMALL = call(3);

describe('isBaselineShift', () => {
  it('reads a wide call as a baseline shift', () => {
    expect(isBaselineShift(BIG)).toBe(true);
    expect(isBaselineShift(call(BASELINE_SHIFT_FILES - 1))).toBe(false);
  });

  it('reads a capped call as a shift whatever its reported length', () => {
    // A truncated call reports the cap, not its real size — and a cap can in
    // principle be configured below the file threshold, so the flag has to
    // count on its own rather than relying on length to catch it.
    expect(isBaselineShift({ files: [null], truncated: true })).toBe(true);
  });

  it('leaves ordinary authored calls alone', () => {
    expect(isBaselineShift(SMALL)).toBe(false);
    expect(isBaselineShift({ files: [] })).toBe(false);
  });
});

describe('countLeadingBaselineShifts', () => {
  it('skips nothing when the turn is all authored work', () => {
    expect(countLeadingBaselineShifts([SMALL, SMALL, SMALL])).toBe(0);
  });

  it('skips a leading branch switch', () => {
    // The reported case: `git checkout -b x origin/main` first, real work after.
    expect(countLeadingBaselineShifts([BIG, SMALL, SMALL])).toBe(1);
  });

  it('skips a run of them', () => {
    expect(countLeadingBaselineShifts([BIG, BIG, SMALL])).toBe(2);
  });

  it('stops at the first authored call and does not resume', () => {
    // A shift in the MIDDLE is out of scope — dropping calls around it would
    // discard real work, so it stays in the range (and stays wrong).
    expect(countLeadingBaselineShifts([BIG, SMALL, BIG, SMALL])).toBe(1);
  });

  it('always leaves one call to span', () => {
    expect(countLeadingBaselineShifts([BIG, BIG, BIG])).toBe(2);
  });

  it('never skips a lone call', () => {
    expect(countLeadingBaselineShifts([BIG])).toBe(0);
  });

  it('handles an empty list', () => {
    expect(countLeadingBaselineShifts([])).toBe(0);
  });
});
