/**
 * Gesture latching of the three-panel swipe.
 *
 * The owner of a horizontal gesture (a scrollable pane, or the view switcher)
 * is decided on its first wheel event and kept until the wheel goes quiet.
 * Without it, a swipe drifting on or off a scroller mid-flight would change
 * hands halfway: stall a view switch, or spend a scroll's momentum on one.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveGestureOwner, GESTURE_IDLE_MS } from './SwipeableViewContainer';

const T0 = 10_000;

describe('resolveGestureOwner', () => {
  it('probes on the first event of a session', () => {
    expect(resolveGestureOwner(T0, 0, null, () => true)).toBe('inner');
    expect(resolveGestureOwner(T0, 0, null, () => false)).toBe('switcher');
  });

  it('keeps a pane even if the pointer drifts off it mid-gesture', () => {
    // The swipe began over a table; it is over blank space now. Its
    // momentum must stay with the table, not flip the view.
    expect(resolveGestureOwner(T0 + 16, T0, 'inner', () => false)).toBe('inner');
  });

  it('keeps the switcher even if a pane under the pointer gains room', () => {
    expect(resolveGestureOwner(T0 + 16, T0, 'switcher', () => true)).toBe('switcher');
  });

  it('treats momentum gaps up to the idle window as the same gesture', () => {
    expect(resolveGestureOwner(T0 + GESTURE_IDLE_MS, T0, 'inner', () => false)).toBe('inner');
  });

  it('re-probes once the wheel has been quiet past the idle window', () => {
    // A new gesture over blank space goes to the switcher, whatever the last
    // one latched onto.
    expect(resolveGestureOwner(T0 + GESTURE_IDLE_MS + 1, T0, 'inner', () => false)).toBe('switcher');
  });

  it('does not walk the DOM while a gesture is latched', () => {
    const probe = vi.fn(() => true);
    resolveGestureOwner(T0 + 16, T0, 'switcher', probe);
    expect(probe).not.toHaveBeenCalled();
  });
});
