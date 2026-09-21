'use client';

import { useRef, useEffect, useState, ReactNode, createContext, useContext } from 'react';

export type ViewType = 'agent' | 'explorer' | 'console';

const VIEWS: ViewType[] = ['agent', 'explorer', 'console'];
const VIEW_LABELS: Record<ViewType, string> = {
  agent: 'AGENT',
  explorer: 'EXPLORER',
  console: 'CONSOLE',
};

// Context for sharing swipe state between SwipeableViewContainer and ViewSwitcherBar
interface SwipeContextValue {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  dragOffset: number; // -1 to 1 range
  isDragging: boolean;
}

const SwipeContext = createContext<SwipeContextValue | null>(null);

export function useSwipeContext() {
  const context = useContext(SwipeContext);
  if (!context) {
    throw new Error('useSwipeContext must be used within SwipeableViewContainer');
  }
  return context;
}

interface SwipeableViewContainerProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  children: ReactNode; // ViewSwitcherBar + content area
  /**
   * A horizontal swipe that ran PAST the first or last view — the travel the
   * switcher itself has nothing to do with, because there is no neighbouring
   * view that way.
   *
   * That travel used to be discarded silently, which made "swipe right on the
   * agent view" a gesture the user could perform but nothing could observe.
   * Handing it out lets the host spend it on an edge action (dismissing an
   * overlay column, say) without teaching this component what that action is.
   *
   * Reported on EVERY wheel tick, not just at the end, so the host can draw
   * the gesture as it happens. That is also why this is a callback rather than
   * context or state: a gesture animation redrawn through React would re-render
   * all three (permanently mounted) views per frame. Hosts are expected to
   * write to the DOM directly here.
   */
  onOverscroll?: (state: OverscrollState) => void;
}

/** One tick of a swipe that ran past the first or last view. */
export interface OverscrollState {
  /**
   * Signed pixels past the edge, accumulated over the gesture. Positive is a
   * rightward swipe (toward a previous view); negative is leftward.
   */
  readonly offset: number;
  /** `move` while the gesture is live; `release` once the wheel goes idle. */
  readonly phase: 'move' | 'release';
  /** On `release`: whether the gesture passed the action threshold. */
  readonly triggered: boolean;
  /** Element under the gesture, so a host can scope the action to a region. */
  readonly target: Element | null;
}

/**
 * Can an ancestor still absorb a horizontal scroll going THIS way?
 *
 * The direction is the whole point. Asking only "does this element overflow"
 * hands the gesture to a pane that is already pinned against the edge the
 * user is pushing toward, so a long-line code pane swallowed every horizontal
 * swipe forever — the view switcher was unreachable over wide diffs, and any
 * edge action behind it could never fire. Once a pane has no room left in the
 * direction of travel it stops being the right owner of the gesture, exactly
 * like nested vertical scrollers handing off at their end stops.
 *
 * `deltaX > 0` is a scroll toward the right (content moves left).
 */
function canScrollHorizontally(element: Element | null, deltaX: number): boolean {
  while (element) {
    const style = window.getComputedStyle(element);
    const overflowX = style.overflowX;

    // Check if horizontal scrolling is enabled
    if (overflowX === 'auto' || overflowX === 'scroll') {
      if (hasScrollRoom(element.scrollLeft, element.scrollWidth, element.clientWidth, deltaX)) {
        return true;
      }
    }

    element = element.parentElement;
  }
  return false;
}

/**
 * Does a scroller with these metrics have room left in the direction of travel?
 *
 * Split out of the DOM walk above so the part that is easy to get backwards —
 * which end `deltaX > 0` consumes — is testable without a browser. Getting it
 * inverted does not crash or look obviously wrong; it just silently swaps
 * which edge hands the gesture on, so it is worth pinning down.
 */
export function hasScrollRoom(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  deltaX: number
): boolean {
  const max = scrollWidth - clientWidth;
  // Sub-pixel layouts leave a fractional gap on panes that are visually
  // flush; 1px of slack keeps those from counting as scrollable.
  if (max <= 1) return false;
  // deltaX > 0 scrolls toward the right, consuming the room to the right of
  // the current position; a leftward scroll consumes scrollLeft itself.
  const room = deltaX > 0 ? max - scrollLeft : scrollLeft;
  return room > 1;
}

export function SwipeableViewContainer({ activeView, onViewChange, children, onOverscroll }: SwipeableViewContainerProps) {
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningRef = useRef(false);
  const dragOffsetRef = useRef(0);
  // Travel past the first / last view. Kept apart from dragOffsetRef because
  // the track must NOT move for it — there is no neighbouring view to reveal,
  // so shifting would just expose background. It is accumulated purely to
  // give the edge gesture a magnitude that can be thresholded.
  const overscrollRef = useRef(0);
  const overscrollTargetRef = useRef<Element | null>(null);
  // Ref indirection: the handler is bound once per view change, and a host
  // passing an inline arrow must not force a rebind on every render.
  const onOverscrollRef = useRef(onOverscroll);
  useEffect(() => { onOverscrollRef.current = onOverscroll; }, [onOverscroll]);

  // Live offset in pixels, used to trigger re-renders
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  // Whether a drag is in progress
  const [isDragging, setIsDragging] = useState(false);

  const currentIndex = VIEWS.indexOf(activeView);
  const maxPage = VIEWS.length - 1;

  // Parameters
  const SCALE_FACTOR = 6;          // Swipe sensitivity (higher = more sensitive)
  const RELEASE_TIMEOUT = 60;      // Release detection timeout (60ms)
  const SWITCH_THRESHOLD = 0.12;   // Switch threshold (lower = easier to switch)
  const TRANSITION_DURATION = 80;  // Animation duration (80ms)
  // Deliberately well above SWITCH_THRESHOLD. An edge action is not a view
  // switch you can undo by swiping back — it fires on a surface the user was
  // reading, so it should take a decisive push, not a stray flick from a
  // trackpad's diagonal drift.
  const OVERSCROLL_THRESHOLD = 0.2;

  // Reset dragOffset when activeView changes
  useEffect(() => {
    dragOffsetRef.current = 0;
    overscrollRef.current = 0;
    queueMicrotask(() => setDragOffsetPx(0));
  }, [activeView]);

  // Listen to wheel events at the document level
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Handle horizontal scroll only
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        // Do not intercept scroll events inside iframes
        const target = e.target as Element;
        if (target.tagName === 'IFRAME') return;
        // Smart check: if the target is inside a horizontally-scrollable element, let it handle the scroll
        if (canScrollHorizontally(target, e.deltaX)) {
          // Let the element handle horizontal scrolling itself
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // If a transition is in progress, a new swipe interrupts it
        if (isTransitioningRef.current) {
          isTransitioningRef.current = false;
        }

        // Calculate container width (single page width)
        const pageWidth = window.innerWidth;

        // Calculate new offset
        let newOffset = dragOffsetRef.current - e.deltaX * SCALE_FACTOR;

        // Boundary check
        const canGoLeft = currentIndex > 0;
        const canGoRight = currentIndex < maxPage;

        let overscrolled = false;
        if (!canGoLeft && newOffset > 0) {
          overscrollRef.current += newOffset;
          overscrollTargetRef.current = target;
          newOffset = 0;
          overscrolled = true;
        }
        if (!canGoRight && newOffset < 0) {
          overscrollRef.current += newOffset;
          overscrollTargetRef.current = target;
          newOffset = 0;
          overscrolled = true;
        }
        if (overscrolled) {
          onOverscrollRef.current?.({
            offset: overscrollRef.current,
            phase: 'move',
            triggered: false,
            target,
          });
        }

        // Clamp offset to one page width maximum
        newOffset = Math.max(-pageWidth, Math.min(pageWidth, newOffset));

        // Update ref and state
        dragOffsetRef.current = newOffset;
        setDragOffsetPx(newOffset);
        setIsDragging(true);

        // Clear the previous timeout
        if (wheelTimeoutRef.current) {
          clearTimeout(wheelTimeoutRef.current);
        }

        // Set timeout to detect release
        wheelTimeoutRef.current = setTimeout(() => {
          const finalOffset = dragOffsetRef.current;
          const finalOverscroll = overscrollRef.current;
          const overscrollTarget = overscrollTargetRef.current;
          overscrollRef.current = 0;
          overscrollTargetRef.current = null;
          const threshold = pageWidth * SWITCH_THRESHOLD;

          setIsDragging(false);
          isTransitioningRef.current = true;

          let newPage = currentIndex;

          if (finalOffset < -threshold && currentIndex < maxPage) {
            newPage = currentIndex + 1;
          } else if (finalOffset > threshold && currentIndex > 0) {
            newPage = currentIndex - 1;
          }

          dragOffsetRef.current = 0;
          setDragOffsetPx(0);

          if (newPage !== currentIndex) {
            onViewChange(VIEWS[newPage]);
          }
          // Reported whether or not it passed the threshold: a host drawing
          // the gesture needs the release either way, to fire its action or to
          // spring back. Skipped when the view moved — the switcher's own
          // transition owns the frame at that point.
          if (newPage === currentIndex && finalOverscroll !== 0) {
            onOverscrollRef.current?.({
              offset: finalOverscroll,
              phase: 'release',
              triggered: Math.abs(finalOverscroll) > pageWidth * OVERSCROLL_THRESHOLD,
              target: overscrollTarget,
            });
          }

          setTimeout(() => {
            isTransitioningRef.current = false;
          }, TRANSITION_DURATION);
        }, RELEASE_TIMEOUT);
      }
    };

    // Listen at document level, capture phase
    document.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [currentIndex, maxPage, onViewChange]);

  // Compute underline offset (-1 to 1 range, used by ViewSwitcherBar)
  // Use state to ensure SSR and client consistency
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const getUnderlineOffset = () => {
    if (!mounted) return 0;
    const pageWidth = window.innerWidth;
    if (!pageWidth) return 0;
    return dragOffsetPx / pageWidth;
  };

  // Context value
  const contextValue: SwipeContextValue = {
    activeView,
    onViewChange,
    dragOffset: getUnderlineOffset(),
    isDragging: mounted && isDragging,
  };

  return (
    <SwipeContext.Provider value={contextValue}>
      {children}
    </SwipeContext.Provider>
  );
}

// ============================================================================
// SwipeableContent - Swipeable content area (three views)
// ============================================================================

interface SwipeableContentProps {
  children: ReactNode; // Three view contents
}

export function SwipeableContent({ children }: SwipeableContentProps) {
  const { activeView, dragOffset, isDragging } = useSwipeContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const currentIndex = VIEWS.indexOf(activeView);
  const pageCount = VIEWS.length;

  // Prevent browser from auto-scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollLeft !== 0) {
        container.scrollLeft = 0;
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate the transform for the content area
  const getTransform = () => {
    const pagePercent = 100 / pageCount;
    const basePercent = -currentIndex * pagePercent;
    // dragOffset is already -1 to 1, convert to percentage of total width
    const offsetPercent = (dragOffset / pageCount) * 100;
    const totalPercent = basePercent + (Number.isFinite(offsetPercent) ? offsetPercent : 0);
    return `translateX(${totalPercent}%)`;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ overscrollBehaviorX: 'none' }}
    >
      <div
        ref={innerRef}
        className={isDragging ? 'flex' : 'flex transition-transform duration-100 ease-out'}
        style={{
          position: 'absolute',
          top: '0px',
          bottom: '0px',
          left: '0px',
          width: `${VIEWS.length * 100}%`,
          transform: getTransform(),
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// ViewSwitcherBar - View switch buttons in the title bar (uses context for swipe state)
// ============================================================================

export function ViewSwitcherBar() {
  const { activeView, onViewChange, dragOffset, isDragging } = useSwipeContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  const currentIndex = VIEWS.indexOf(activeView);

  // Calculate underline position and width
  const calculateUnderlineStyle = () => {
    if (!containerRef.current || buttonRefs.current.length === 0) {
      return { left: 0, width: 0 };
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const buttons = buttonRefs.current.filter(Boolean) as HTMLButtonElement[];

    if (buttons.length !== VIEWS.length) {
      return { left: 0, width: 0 };
    }

    // dragOffset is -1 to 1, negative means swiping right (to previous view)
    // We need to invert it for the underline position
    const safeOffset = Number.isFinite(dragOffset) ? dragOffset : 0;
    const effectiveIndex = Math.max(0, Math.min(VIEWS.length - 1, currentIndex - safeOffset));

    const leftIndex = Math.floor(effectiveIndex);
    const rightIndex = Math.ceil(effectiveIndex);
    const fraction = effectiveIndex - leftIndex;

    const leftButton = buttons[leftIndex];
    const rightButton = buttons[rightIndex];

    if (!leftButton || !rightButton) {
      return { left: 0, width: 0 };
    }

    const leftRect = leftButton.getBoundingClientRect();
    const rightRect = rightButton.getBoundingClientRect();

    const left = leftRect.left + (rightRect.left - leftRect.left) * fraction - containerRect.left;
    const width = leftRect.width + (rightRect.width - leftRect.width) * fraction;

    return { left, width };
  };

  // Update underline position
  useEffect(() => {
    queueMicrotask(() => setUnderlineStyle(calculateUnderlineStyle()));
  }, [currentIndex, dragOffset]);

  // Listen to window resize
  useEffect(() => {
    const handleResize = () => {
      setUnderlineStyle(calculateUnderlineStyle());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, dragOffset]);

  // Compute current effective index (accounting for swipe offset)
  // When dragOffset is 0 or NaN, fall back to currentIndex
  const safeOffset = Number.isFinite(dragOffset) ? dragOffset : 0;
  const effectiveIndex = Math.max(0, Math.min(VIEWS.length - 1, currentIndex - safeOffset));
  const nearestIndex = Math.round(effectiveIndex);

  return (
    <div
      ref={containerRef}
      className="relative flex gap-4"
    >
      {VIEWS.map((view, index) => (
        <button
          key={view}
          ref={el => { buttonRefs.current[index] = el; }}
          onClick={() => onViewChange(view)}
          className={`px-4 py-1 text-sm font-medium transition-colors ${
            nearestIndex === index
              ? 'text-brand'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {VIEW_LABELS[view]}
        </button>
      ))}

      {/* Underline indicator */}
      <div
        className={`absolute bottom-0 h-0.5 bg-brand ${isDragging ? '' : 'transition-all duration-100 ease-out'}`}
        style={{
          left: underlineStyle.left,
          width: underlineStyle.width,
        }}
      />
    </div>
  );
}
