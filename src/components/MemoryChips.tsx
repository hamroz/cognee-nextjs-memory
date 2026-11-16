"use client";

import { useState } from "react";
import type { ChatDataParts, Mode } from "@/lib/types";

export function MemoryChips({
  memories,
  write,
  onFocus,
  focusId,
}: {
  memories?: ChatDataParts["memories"];
  write?: ChatDataParts["memory-write"];
  onFocus: (id: string) => void;
  focusId: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!memories) return null;
  const nodes = dedupe(memories.items.flatMap((m) => m.nodes));

  return (
    <div className="mt-2 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-zinc-500">Memories used:</span>
        {memories.error ? (
          <span className="text-amber-700 dark:text-amber-400">recall failed ({memories.error})</span>
        ) : memories.items.length === 0 ? (
          <span className="text-zinc-400">none</span>
        ) : nodes.length === 0 ? (
          <span className="text-zinc-500">{memories.items.length} passage(s), no linked graph nodes</span>
        ) : (
          nodes.map((n) => (
            <button
              key={n.id}
              onClick={() => onFocus(n.id)}
              title="Show in graph"
              className={`rounded-full border px-2 py-0.5 transition ${
                focusId === n.id
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
              }`}
            >
              {n.label}
            </button>
          ))
        )}
        {memories.items.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="text-zinc-500 underline-offset-2 hover:underline">
            {open ? "hide passages" : `show ${memories.items.length} passage(s)`}
          </button>
        )}
        <ModeTag mode={memories.mode} />
      </div>
      {open && (
        <ul className="space-y-1 border-l-2 border-violet-200 pl-3 text-zinc-600 dark:border-violet-800 dark:text-zinc-400">
          {memories.items.map((m) => (
            <li key={m.id} className="whitespace-pre-wrap">
              {m.text.length > 300 ? `${m.text.slice(0, 300)}…` : m.text}
            </li>
          ))}
        </ul>
      )}
      {write && (
        <p className="text-zinc-400">
          {write.status === "queued" &&
            (write.mode === "demo" ? "Turn was written to memory in the recording." : "Turn queued for cognee (add + cognify).")}
          {write.status === "skipped" && `Not written to memory (${write.detail}).`}
          {write.status === "failed" && `Memory write failed: ${write.detail}`}
        </p>
      )}
    </div>
  );
}

function ModeTag({ mode }: { mode: Mode }) {
  return mode === "demo" ? (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">recorded</span>
  ) : (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">live</span>
  );
}

function dedupe<T extends { id: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
