import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentTreeNode } from "../lib/decrypt";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3;

type Props = {
  tree: ContentTreeNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
};

type LaidOutNode = {
  node: ContentTreeNode;
  x: number;
  y: number;
  depth: number;
  parentX: number;
  parentY: number;
};

const DISPLAY_NAMES: Record<string, string> = {
  AIOS: "AIOS",
  Operacoes: "Operações",
  SrJorge: "Sr Jorge",
};

function displayName(node: ContentTreeNode): string {
  if (DISPLAY_NAMES[node.name]) return DISPLAY_NAMES[node.name];
  if (node.type === "file") return node.name.replace(/\.md$/, "");
  // strip numeric prefixes like "1.Comercial" -> "Comercial"
  return node.name.replace(/^\d+\./, "");
}

// Layout is computed relative to the origin (0,0); the SVG <g> is translated
// to the center of the viewBox at render time — a single offset, not baked
// into the coordinates themselves.
const CENTER = { x: 0, y: 0 };
const RADIUS_STEP = 150;

function weightOf(node: ContentTreeNode, expanded: Set<string>): number {
  if (node.type === "file") return 1;
  if (!expanded.has(node.path) || !node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + weightOf(c, expanded), 0);
}

function layout(
  node: ContentTreeNode,
  expanded: Set<string>,
  depth: number,
  angleStart: number,
  angleEnd: number,
  parentX: number,
  parentY: number,
  out: LaidOutNode[]
) {
  const angle = (angleStart + angleEnd) / 2;
  const radius = depth * RADIUS_STEP;
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
    layout(child, expanded, depth + 1, cursor, cursor + childSpan, x, y, out);
    cursor += childSpan;
  });
}

export function KnowledgeGraph({ tree, selectedPath, onSelectFile }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const scrollRef = useRef<HTMLDivElement>(null);

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
    // Level 1 (tree.children) is always visible; layout each as its own sector.
    const out: LaidOutNode[] = [];
    const level1 = tree.children ?? [];
    const weights = level1.map((c) => weightOf(c, expanded));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let cursor = -Math.PI / 2; // start at top, go clockwise
    const fullCircle = Math.PI * 2;
    level1.forEach((child, i) => {
      const span = (weights[i] / total) * fullCircle;
      layout(child, expanded, 1, cursor, cursor + span, CENTER.x, CENTER.y, out);
      cursor += span;
    });
    return out;
  }, [tree, expanded]);

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

  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 1);
  const halfSize = (maxDepth + 0.75) * RADIUS_STEP;
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
              {nodes.map((n) => (
                <line
                  key={`edge-${n.node.path}`}
                  x1={n.parentX}
                  y1={n.parentY}
                  x2={n.x}
                  y2={n.y}
                  className="graph-edge"
                />
              ))}
              <circle cx={CENTER.x} cy={CENTER.y} r={26} className="graph-root" />
              <text x={CENTER.x} y={CENTER.y + 4} textAnchor="middle" className="graph-root-label">
                Diagnóstico
              </text>
              {nodes.map((n) => {
                const isFolder = n.node.type === "folder";
                const isOpen = isFolder && expanded.has(n.node.path);
                const isSelected = n.node.type === "file" && n.node.path === selectedPath;
                const r = isFolder ? 14 - n.depth : 6;
                const textOffset = r + 8;
                const anchorLeft = n.x < CENTER.x;
                return (
                  <g
                    key={n.node.path}
                    className={`graph-node graph-node--${n.node.type} ${isOpen ? "is-open" : ""} ${isSelected ? "is-selected" : ""}`}
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
    </div>
  );
}
