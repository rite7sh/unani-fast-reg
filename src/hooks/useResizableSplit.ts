import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// Shared by every list+detail split-panel screen (currently
// PatientHistoryScreen and AdminPatientsScreen). The list panel's width is
// drag-controlled via `containerRef`/`startDrag`; the detail panel is left
// as a plain CSS flex:1 sibling that always fills whatever remains, so no
// combination of drag position or window size can ever leave blank space
// next to it.
const DIVIDER_WIDTH = 9;
const DEFAULT_RATIO = 0.6;

type Options = {
  minLeft: number;
  minRight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function useResizableSplit({ minLeft, minRight }: Options) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  // Mirrors the container's last-measured width as state (not just a ref)
  // purely so the divider can expose it as aria-valuemax — the drag/resize
  // logic itself always re-reads elRef.current.clientWidth live instead of
  // trusting this.
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const draggingPointerId = useRef<number | null>(null);

  const maxFor = useCallback(
    (total: number) => Math.max(minLeft, total - minRight - DIVIDER_WIDTH),
    [minLeft, minRight]
  );

  // A callback ref (not useEffect) so this fires exactly when the split
  // container mounts — including a re-open after the detail panel was
  // closed and the container unmounted — rather than only once for the
  // component's whole lifetime. Re-clamps (not resets) a previously
  // chosen width, so a width picked once survives selecting a different
  // patient, but still gets corrected if the window changed size while
  // the detail panel was closed.
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      if (!el) return;
      const total = el.clientWidth;
      if (total <= 0) return;
      setContainerWidth(total);
      setLeftWidth((prev) => clamp(prev === null ? total * DEFAULT_RATIO : prev, minLeft, maxFor(total)));
    },
    [minLeft, maxFor]
  );

  // Re-clamp on window resize so shrinking the window can't leave a panel
  // narrower than its minimum or force the pair wider than the container.
  useEffect(() => {
    function handleResize() {
      const el = elRef.current;
      if (!el) return;
      const total = el.clientWidth;
      if (total <= 0) return;
      setContainerWidth(total);
      setLeftWidth((prev) => (prev === null ? prev : clamp(prev, minLeft, maxFor(total))));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [minLeft, maxFor]);

  const startDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      // Reject a second pointer starting a drag while one is already in
      // progress (e.g. a stray touch during an active mouse drag) — each
      // concurrent drag would otherwise install its own window-level
      // listeners, all driving the same state from different baselines.
      if (!elRef.current || e.button !== 0 || draggingPointerId.current !== null) return;
      // Re-bound to a fresh const so the non-null narrowing above survives
      // into the onMove/onEnd closures below (TS doesn't carry narrowing
      // of a ref's .current through nested function declarations).
      const el = elRef.current;
      e.preventDefault();
      const startX = e.clientX;
      const startLeft = leftWidth ?? el.clientWidth * DEFAULT_RATIO;
      draggingPointerId.current = e.pointerId;
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Redirects this pointer's events to the divider even if released
      // outside the window's bounds, so a drag that ends off-window still
      // reaches onUp instead of leaving the cursor/listeners stuck.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Unsupported in this environment — the pointerup/pointercancel
        // listeners below still cover the ordinary in-window case.
      }

      function onMove(ev: globalThis.PointerEvent) {
        if (draggingPointerId.current !== ev.pointerId) return;
        // Re-read the container's current width on every move rather than
        // trusting a value captured at drag-start, so a window resize that
        // happens mid-drag (window snap, DPI/monitor change) is reflected
        // immediately instead of racing against the independent resize
        // listener above using a stale bound.
        const liveTotal = el.clientWidth || startLeft + minRight + DIVIDER_WIDTH;
        const delta = ev.clientX - startX;
        setLeftWidth(clamp(startLeft + delta, minLeft, maxFor(liveTotal)));
      }
      function onEnd(ev: globalThis.PointerEvent) {
        if (draggingPointerId.current !== ev.pointerId) return;
        draggingPointerId.current = null;
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      // A drag can be interrupted (a system dialog stealing focus, screen
      // lock) without ever delivering pointerup — pointercancel is the
      // browser's signal for exactly that, and gets the same cleanup.
      window.addEventListener("pointercancel", onEnd);
    },
    [leftWidth, minLeft, minRight, maxFor]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const el = elRef.current;
      if (!el) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const total = el.clientWidth;
      const step = e.key === "ArrowLeft" ? -24 : 24;
      setLeftWidth((prev) => clamp((prev ?? total * DEFAULT_RATIO) + step, minLeft, maxFor(total)));
    },
    [minLeft, maxFor]
  );

  return {
    containerRef,
    leftWidth,
    startDrag,
    onKeyDown,
    minLeft,
    maxWidth: containerWidth === null ? null : maxFor(containerWidth),
  };
}
