/**
 * Direction semantics of the three-panel swipe's scroll handoff.
 *
 * The switcher yields a horizontal gesture to a scrollable descendant, but
 * only while that descendant can still travel the way the user is pushing.
 * These cases pin down which end each direction consumes — inverting it is a
 * silent failure (both directions still "work", they just hand off at the
 * wrong edge, which is how a wide code pane used to swallow every swipe).
 */
import { describe, it, expect } from 'vitest';
import { hasScrollRoom } from './SwipeableViewContainer';

// A pane 500px wide holding 1500px of content: 1000px of travel.
const CONTENT = 1500;
const VIEWPORT = 500;
const MAX = CONTENT - VIEWPORT;

const room = (scrollLeft: number, deltaX: number) =>
  hasScrollRoom(scrollLeft, CONTENT, VIEWPORT, deltaX);

describe('hasScrollRoom', () => {
  it('yields to a pane that can still travel either way from the middle', () => {
    expect(room(MAX / 2, 1)).toBe(true);
    expect(room(MAX / 2, -1)).toBe(true);
  });

  it('stops yielding rightward once pinned against the right edge', () => {
    // Pinned right: a rightward push has nowhere to go, so the switcher
    // (or an edge action behind it) takes over instead.
    expect(room(MAX, 1)).toBe(false);
    // ...but the pane still owns the opposite direction.
    expect(room(MAX, -1)).toBe(true);
  });

  it('stops yielding leftward at the home position', () => {
    // This is the common case for the diff viewer: a freshly opened file sits
    // at scrollLeft 0, so swipe-right is free for the dismiss gesture without
    // the user having to scroll anywhere first.
    expect(room(0, -1)).toBe(false);
    expect(room(0, 1)).toBe(true);
  });

  it('never yields when the content fits', () => {
    expect(hasScrollRoom(0, VIEWPORT, VIEWPORT, 1)).toBe(false);
    expect(hasScrollRoom(0, VIEWPORT, VIEWPORT, -1)).toBe(false);
  });

  it('ignores sub-pixel overflow from fractional layouts', () => {
    // A pane 0.5px "wider" than its content is visually flush; treating it as
    // scrollable would let it eat gestures it cannot act on.
    expect(hasScrollRoom(0, VIEWPORT + 0.5, VIEWPORT, 1)).toBe(false);
  });

  it('ignores a sub-pixel remainder at either end', () => {
    expect(room(MAX - 0.5, 1)).toBe(false);
    expect(room(0.5, -1)).toBe(false);
  });
});
