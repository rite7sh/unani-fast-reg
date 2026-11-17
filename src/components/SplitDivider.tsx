import type { KeyboardEvent, PointerEvent } from "react";

// Shared drag handle for useResizableSplit — a vertical-separator ARIA
// role (matching the standard window-splitter pattern) rather than a
// button, since it represents a boundary between two panels, not an
// action. aria-valuenow/min/max mirror the hook's own leftWidth/minLeft/
// maxWidth so a screen reader announces the current split position and
// its range, not just "separator" — omitted only if the container hasn't
// measured yet (first paint, before the callback ref runs). Hidden
// entirely below the app's dedicated 960px stacking breakpoint (see
// .split-divider in styles.css), where dragging no longer applies.
export default function SplitDivider({
  value,
  min,
  max,
  onPointerDown,
  onKeyDown,
}: {
  value: number | null;
  min: number;
  max: number | null;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="split-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      aria-valuenow={value === null ? undefined : Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max === null ? undefined : Math.round(max)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
