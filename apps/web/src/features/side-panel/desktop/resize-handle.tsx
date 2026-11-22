"use client";

import { useRef } from "react";

/**
 * 侧栏左缘的宽度拖拽条：指针拖动、方向键调整与双击复位。
 *
 * @author 称霸幼儿园
 */

export type ResizeHandleProps = {
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
  onReset: () => void;
  onResizingChange?: (resizing: boolean) => void;
};

export function ResizeHandle({
  width,
  minWidth,
  maxWidth,
  onResize,
  onCommit,
  onReset,
  onResizingChange,
}: ResizeHandleProps) {
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const clamp = (value: number) => Math.min(Math.max(value, minWidth), maxWidth);

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    startRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onResizingChange?.(false);
    onCommit(width);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 可聚焦的垂直分隔条，hr 不能承载键盘调整
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={Math.round(minWidth)}
      aria-valuemax={Math.round(maxWidth)}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        startRef.current = { x: event.clientX, width };
        onResizingChange?.(true);
      }}
      onPointerMove={(event) => {
        const start = startRef.current;
        if (!start) return;
        onResize(clamp(start.width + (start.x - event.clientX)));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onCommit(clamp(width + (event.key === "ArrowLeft" ? 16 : -16)));
        } else if (event.key === "Home") {
          event.preventDefault();
          onCommit(minWidth);
        } else if (event.key === "End") {
          event.preventDefault();
          onCommit(maxWidth);
        }
      }}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors hover:bg-separator" />
    </div>
  );
}
