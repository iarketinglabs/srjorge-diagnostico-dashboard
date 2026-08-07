import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react";

const MIN_PCT = 25;
const MAX_PCT = 75;

type Props = {
  left: ReactNode;
  right: ReactNode;
};

export function ResizableSplit({ left, right }: Props) {
  const [leftPct, setLeftPct] = useState(38);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMove = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, []);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      onMove(e.clientX);
    },
    [onMove]
  );

  const handlePointerUp = useCallback((e: PointerEvent) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div className="resizable-split" ref={containerRef} style={{ gridTemplateColumns: `${leftPct}% 6px 1fr` }}>
      <div className="resizable-split-pane">{left}</div>
      <div
        className="resizable-split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painéis"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="resizable-split-grip" />
      </div>
      <div className="resizable-split-pane">{right}</div>
    </div>
  );
}
