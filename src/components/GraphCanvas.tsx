"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphData } from "@/lib/types";

type Node = { id: string; label: string; type: string; isNew: boolean; x?: number; y?: number };
type Link = { source: string | Node; target: string | Node; label: string };

const STRUCTURAL = new Set(["TextDocument", "DocumentChunk", "TextSummary", "NodeSet"]);

const TYPE_COLORS: Record<string, string> = {
  Entity: "#6d5dfc",
  EntityType: "#f59e0b",
  DocumentChunk: "#94a3b8",
  TextDocument: "#64748b",
  TextSummary: "#a3a3a3",
};

export default function GraphCanvas({
  data,
  newIds,
  focusId,
  showStructural,
  onSelect,
}: {
  data: GraphData;
  newIds: Set<string>;
  focusId: string | null;
  showStructural: boolean;
  onSelect: (id: string | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<Node, Link> | undefined>(undefined);
  const [size, setSize] = useState({ w: 400, h: 400 });
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (ev: MediaQueryListEvent) => setDark(ev.matches);
    mq.addEventListener("change", onChange);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const graph = useMemo(() => {
    const nodes: Node[] = data.nodes
      .filter((n) => showStructural || !STRUCTURAL.has(n.type))
      .map((n) => ({ ...n, isNew: newIds.has(n.id) }));
    const ids = new Set(nodes.map((n) => n.id));
    const links: Link[] = data.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ ...e }));
    return { nodes, links };
  }, [data, newIds, showStructural]);

  const neighbours = useMemo(() => {
    const m = new Set<string>();
    if (!focusId) return m;
    for (const e of data.edges) {
      if (e.source === focusId) m.add(e.target);
      if (e.target === focusId) m.add(e.source);
    }
    return m;
  }, [data, focusId]);

  useEffect(() => {
    if (!focusId || !fg.current) return;
    const node = graph.nodes.find((n) => n.id === focusId);
    if (node?.x !== undefined && node.y !== undefined) {
      fg.current.centerAt(node.x, node.y, 600);
      fg.current.zoom(3, 600);
    }
  }, [focusId, graph.nodes]);

  const text = dark ? "#e5e7eb" : "#1f2937";
  const muted = dark ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.25)";

  return (
    <div ref={wrap} className="absolute inset-0">
      <ForceGraph2D<Node, Link>
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={120}
        nodeRelSize={4}
        linkColor={() => muted}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkLabel={(l) => l.label}
        nodeLabel={(n) => `${n.label} (${n.type})`}
        onNodeClick={(n) => onSelect(n.id === focusId ? null : n.id)}
        onBackgroundClick={() => onSelect(null)}
        nodeCanvasObject={(node, ctx, scale) => {
          const focused = node.id === focusId;
          const dimmed = focusId !== null && !focused && !neighbours.has(node.id);
          const r = STRUCTURAL.has(node.type) ? 3 : focused ? 7 : 5;
          ctx.globalAlpha = dimmed ? 0.25 : 1;
          if (node.isNew) {
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, r + 4, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(16,185,129,0.25)";
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = TYPE_COLORS[node.type] ?? "#0ea5e9";
          ctx.fill();
          if (focused) {
            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = text;
            ctx.stroke();
          }
          if (!STRUCTURAL.has(node.type) && (scale > 1.2 || focused || neighbours.has(node.id))) {
            const label = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
            ctx.font = `${Math.max(10 / scale, 2.5)}px ui-sans-serif, system-ui`;
            ctx.fillStyle = text;
            ctx.textAlign = "center";
            ctx.fillText(label, node.x!, node.y! + r + 9 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, 8, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
