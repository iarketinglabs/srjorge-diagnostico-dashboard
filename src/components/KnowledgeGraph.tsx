import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentTreeNode } from "../lib/decrypt";
import { displayName } from "../lib/displayName";
import { ancestorFolders } from "../lib/docLinks";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3;

export type FocusRequest = { path: string };

type Props = {
  tree: ContentTreeNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  focusRequest: FocusRequest | null;
};

type LaidOutNode = {
  node: ContentTreeNode;
  x: number;
  y: number;
  depth: number;
  parentX: number;
  parentY: number;
};

// Layout is computed relative to the origin (0,0); the SVG <g> is translated
// to the center of the viewBox at render time — a single offset, not baked
// into the coordinates themselves.
const CENTER = { x: 0, y: 0 };

function weightOf(node: ContentTreeNode, expanded: Set<string>): number {
  if (node.type === "file") return 1;
  if (!expanded.has(node.path) || !node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + weightOf(c, expanded), 0);
}

/** How many nodes are visible at each depth — used to give crowded rings more radius. */
function countByDepth(node: ContentTreeNode, expanded: Set<string>, depth: number, counts: number[]) {
  counts[depth] = (counts[depth] ?? 0) + 1;
  const show = node.type === "folder" && expanded.has(node.path) && node.children && node.children.length > 0;
  if (!show) return;
  node.children!.forEach((c) => countByDepth(c, expanded, depth + 1, counts));
}

function layout(
  node: ContentTreeNode,
  expanded: Set<string>,
  depth: number,
  angleStart: number,
  angleEnd: number,
  parentX: number,
  parentY: number,
  depthRadius: number[],
  out: LaidOutNode[]
) {
  const angle = (angleStart + angleEnd) / 2;
  const radius = depthRadius[depth] ?? depth * 160;
  const x = CENTER.x + Math.cos(angle) * radius;
  const y = CENTER.y + Math.sin(angle) * radius;
  out.push({ node, x, y, depth, parentX, parentY });

  const showChildren = node.type === "folder" && expanded.has(node.path) && node.children && node.children.length > 0;
  if (!showChildren) return;

  const children = node.children!;
  const weights = children.map((c) => weightOf(c, expanded));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = angleStart;
  const span = angleEnd - angleStart;
  children.forEach((child, i) => {
    const childSpan = (weights[i] / total) * span;
    layout(child, expanded, depth + 1, cursor, cursor + childSpan, x, y, depthRadius, out);
    cursor += childSpan;
  });
}

/** Smooth "noodle" bezier between two points — a consistent perpendicular bow
 *  so the whole graph reads as one flowing organic mesh instead of straight
 *  spokes. */
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bow = Math.min(26, dist * 0.2);
  const c1x = x1 + dx * 0.33 + nx * bow;
  const c1y = y1 + dy * 0.33 + ny * bow;
  const c2x = x1 + dx * 0.66 + nx * bow;
  const c2y = y1 + dy * 0.66 + ny * bow;
  return `M ${x1},${y1} C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
}

export function KnowledgeGraph({ tree, selectedPath, onSelectFile, focusRequest }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // When navigation (a clickable path, breadcrumb, or back/forward) asks to
  // reveal a document, expand every ancestor folder on its way and reset the
  // canvas view so the newly-revealed branch is actually visible.
  useEffect(() => {
    if (!focusRequest) return;
    const ancestors = ancestorFolders(focusRequest.path);
    if (ancestors.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        ancestors.forEach((a) => next.add(a));
        return next;
      });
    }
    setView({ x: 0, y: 0, zoom: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // React's synthetic onWheel is attached as a passive listener, so
  // preventDefault() inside it silently fails (and warns). A native
  // listener with { passive: false } is required to stop the browser's
  // own scroll/zoom from fighting the custom pan/zoom below.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey) {
        setView((prev) => {
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom * factor));
          return { ...prev, zoom: nextZoom };
        });
      } else if (e.shiftKey) {
        setView((prev) => ({ ...prev, x: prev.x - e.deltaY }));
      } else {
        setView((prev) => ({ ...prev, y: prev.y - e.deltaY }));
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function resetView() {
    setView({ x: 0, y: 0, zoom: 1 });
  }

  const nodes = useMemo(() => {
    const level1 = tree.children ?? [];

    // Depth rings with many visible siblings get pushed further out, so
    // dense expansions (e.g. a 17-file subfolder) get more circumferential
    // room instead of crowding labels together.
    const counts: number[] = [];
    level1.forEach((c) => countByDepth(c, expanded, 1, counts));
    const depthRadius: number[] = [0];
    for (let d = 1; d < counts.length; d++) {
      const n = counts[d] ?? 1;
      const step = Math.max(130, Math.min(280, 90 + n * 8));
      depthRadius[d] = depthRadius[d - 1] + step;
    }

    const out: LaidOutNode[] = [];
    const weights = level1.map((c) => weightOf(c, expanded));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let cursor = -Math.PI / 2; // start at top, go clockwise
    const fullCircle = Math.PI * 2;
    level1.forEach((child, i) => {
      const span = (weights[i] / total) * fullCircle;
      layout(child, expanded, 1, cursor, cursor + span, CENTER.x, CENTER.y, depthRadius, out);
      cursor += span;
    });
    return out;
  }, [tree, expanded]);

  // Every node/edge on the way from the root to the selected document —
  // these get the pulsing Cherenkov-style glow.
  const glowPathSet = useMemo(() => {
    if (!selectedPath) return new Set<string>();
    const set = new Set<string>(ancestorFolders(selectedPath));
    set.add(selectedPath);
    return set;
  }, [selectedPath]);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleClick(n: LaidOutNode) {
    if (n.node.type === "folder") toggle(n.node.path);
    else onSelectFile(n.node.path);
  }

  const outerRadius = nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.y)), 150);
  const halfSize = outerRadius + 140;
  const canvasSize = halfSize * 2;

  return (
    <div className="graph-panel">
      <div className="graph-panel-header">
        <p className="eyebrow graph-panel-title">Base de conhecimento</p>
        <div className="graph-panel-controls">
          <span className="graph-hint">shift+scroll move · ctrl+scroll zoom</span>
          <button type="button" className="graph-reset-btn" onClick={resetView}>
            Centralizar
          </button>
        </div>
      </div>
      <div className="graph-scroll" ref={scrollRef}>
        <div
          className="graph-canvas"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <svg
            viewBox={`0 0 ${canvasSize} ${canvasSize}`}
            width={canvasSize}
            height={canvasSize}
            role="img"
            aria-label="Mapa da base de conhecimento do diagnóstico"
          >
            <g transform={`translate(${halfSize}, ${halfSize})`}>
              {nodes.map((n) => {
                const onGlowPath = glowPathSet.has(n.node.path);
                const isSelectedFile = n.node.type === "file" && n.node.path === selectedPath;
                const glowClass = onGlowPath ? (isSelectedFile ? "graph-edge--glow-red" : "graph-edge--glow-cyan") : "";
                return (
                  <path
                    key={`edge-${n.node.path}`}
                    d={bezierPath(n.parentX, n.parentY, n.x, n.y)}
                    className={`graph-edge ${glowClass}`}
                  />
                );
              })}
              <circle
                cx={CENTER.x}
                cy={CENTER.y}
                r={26}
                className={`graph-root ${selectedPath ? "graph-root--glow" : ""}`}
              />
              <text x={CENTER.x} y={CENTER.y + 4} textAnchor="middle" className="graph-root-label">
                Diagnóstico
              </text>
              {nodes.map((n) => {
                const isFolder = n.node.type === "folder";
                const isOpen = isFolder && expanded.has(n.node.path);
                const isSelected = n.node.type === "file" && n.node.path === selectedPath;
                const onGlowPath = glowPathSet.has(n.node.path);
                const glowClass = onGlowPath ? (isSelected ? "graph-node--glow-red" : "graph-node--glow-cyan") : "";
                const r = isFolder ? 14 - n.depth : 6;
                const textOffset = r + 8;
                const anchorLeft = n.x < CENTER.x;
                return (
                  <g
                    key={n.node.path}
                    className={`graph-node graph-node--${n.node.type} ${isOpen ? "is-open" : ""} ${isSelected ? "is-selected" : ""} ${glowClass}`}
                    onClick={() => handleClick(n)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleClick(n);
                    }}
                  >
                    <circle cx={n.x} cy={n.y} r={r} />
                    <text
                      x={n.x + (anchorLeft ? -textOffset : textOffset)}
                      y={n.y + 4}
                      textAnchor={anchorLeft ? "end" : "start"}
                    >
                      {displayName(n.node)}
                      {isFolder ? (isOpen ? " –" : " +") : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
      <div className="graph-legend">
        <p className="graph-legend-title">Legenda</p>
        <div className="graph-legend-item">
          <span className="graph-legend-dot graph-legend-dot--root" />
          Diagnóstico (raiz)
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-dot graph-legend-dot--folder" />
          Pasta (expansível)
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-dot graph-legend-dot--file" />
          Documento
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-dot graph-legend-dot--selected" />
          Selecionado
        </div>
      </div>
    </div>
  );
}
