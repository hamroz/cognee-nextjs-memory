"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { GraphResponse } from "@/lib/types";

const GraphCanvas = dynamic(() => import("./GraphCanvas"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-zinc-500">Loading graph…</p>,
});

const LEGEND: [string, string][] = [
  ["Entity", "#6d5dfc"],
  ["Entity type", "#f59e0b"],
  ["Chunk / document", "#94a3b8"],
  ["New this turn", "#10b981"],
];

export function MemoryGraph({
  graph,
  newIds,
  focusId,
  onSelect,
  loading,
  onRefresh,
}: {
  graph: GraphResponse | null;
  newIds: Set<string>;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [showStructural, setShowStructural] = useState(false);
  const focused = graph?.nodes.find((n) => n.id === focusId);
  const entityCount = graph?.nodes.filter((n) => !["TextDocument", "DocumentChunk", "TextSummary", "NodeSet"].includes(n.type)).length ?? 0;

  return (
    <section className="flex h-full min-h-[360px] flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">What the agent remembers</h2>
        <span className="text-xs text-zinc-500">
          {graph ? `${entityCount} entities · ${graph.nodes.length} nodes · ${graph.edges.length} edges` : "…"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={showStructural} onChange={(e) => setShowStructural(e.target.checked)} />
            chunks &amp; docs
          </label>
          <button
            onClick={onRefresh}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="relative flex-1">
        {graph && graph.nodes.length > 0 ? (
          <GraphCanvas data={graph} newIds={newIds} focusId={focusId} showStructural={showStructural} onSelect={onSelect} />
        ) : (
          <p className="p-6 text-sm text-zinc-500">
            {graph?.error
              ? `Could not load the graph: ${graph.error}`
              : "Memory is empty. Each finished chat turn is written to cognee and appears here."}
          </p>
        )}
      </div>

      <footer className="space-y-2 border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
        {focused && (
          <p className="text-zinc-800 dark:text-zinc-200">
            Selected: <strong>{focused.label}</strong> <span className="text-zinc-500">({focused.type})</span>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {LEGEND.map(([label, color]) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
        {graph?.snapshotNote && <p className="italic">{graph.snapshotNote}</p>}
      </footer>
    </section>
  );
}
