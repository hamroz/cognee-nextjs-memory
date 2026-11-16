"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, GraphResponse, Mode } from "@/lib/types";
import { MemoryChips } from "./MemoryChips";
import { MemoryGraph } from "./MemoryGraph";

export function ChatApp({
  mode,
  reasons,
  demoTurns,
  demoTitle,
}: {
  mode: Mode;
  reasons: string[];
  demoTurns: string[];
  demoTitle: string;
}) {
  // null = untouched: in demo mode the box then shows the next recorded message
  const [draft, setDraft] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const known = useRef<Set<string>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, setMessages, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const completedTurns = messages.filter((m) => m.role === "assistant").length;
  const busy = status === "submitted" || status === "streaming";
  const nextDemoMessage = mode === "demo" ? demoTurns[messages.filter((m) => m.role === "user").length] : undefined;
  const input = draft ?? nextDemoMessage ?? "";

  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    try {
      const res = await fetch(`/api/graph?turns=${completedTurns}`, { cache: "no-store" });
      const g = (await res.json()) as GraphResponse;
      const fresh = new Set(g.nodes.filter((n) => !known.current.has(n.id)).map((n) => n.id));
      if (known.current.size === 0 && mode === "live") fresh.clear(); // first load: nothing is "new"
      g.nodes.forEach((n) => known.current.add(n.id));
      setNewIds(fresh);
      setGraph(g);
    } catch (e) {
      setGraph({ nodes: [], edges: [], mode, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setGraphLoading(false);
    }
  }, [completedTurns, mode]);

  // Refresh the graph whenever a turn finishes. In live mode cognify runs in
  // the background, so poll a few times afterwards to pick up new nodes.
  useEffect(() => {
    if (busy) return;
    const delays = mode === "live" && completedTurns > 0 ? [0, 4000, 10000, 20000, 40000] : [0];
    const timers = delays.map((ms) => setTimeout(loadGraph, ms));
    return () => timers.forEach(clearTimeout);
  }, [busy, completedTurns, mode, loadGraph]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const reset = () => {
    setMessages([]);
    known.current = new Set();
    setNewIds(new Set());
    setFocusId(null);
    setDraft(null);
  };

  const upload = async (file: File) => {
    setUploadNote(`Uploading ${file.name}…`);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setUploadNote(res.ok ? `${file.name} queued for cognify. The graph refreshes shortly.` : `Upload failed: ${body.error ?? res.status}`);
    if (res.ok) [5000, 15000, 30000].forEach((ms) => setTimeout(loadGraph, ms));
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 px-4 py-4 lg:h-dvh">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Next.js chat with cognee memory</h1>
          <p className="text-xs text-zinc-500">
            Vercel AI SDK chat · recall before every answer · every turn written to a cognee knowledge graph
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {mode === "live" && (
            <label className="cursor-pointer rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Add document
              <input
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
            </label>
          )}
          <button
            onClick={reset}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {mode === "demo" ? "Reset replay" : "New chat"}
          </button>
        </div>
      </header>

      {mode === "demo" ? (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Demo mode: recorded conversation, not live.</strong> No LLM or cognee sidecar is connected ({reasons.join("; ")}).
          You are replaying <em>{demoTitle}</em>: press Send to step through it. Answers are scripted and the memories and graph come from a
          static snapshot. Run it locally with <code>OPENAI_API_KEY</code> and <code>SIDECAR_URL</code> for live memory.
        </div>
      ) : (
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <strong>Live mode.</strong> Answers come from the LLM; memories are recalled from and written to your cognee sidecar.
          {uploadNote && <span className="ml-2">{uploadNote}</span>}
        </div>
      )}

      <main className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-h-[420px] flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:min-h-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-500">
                {mode === "demo"
                  ? "The first recorded message is in the box below. Press Send to start the replay."
                  : "Tell the assistant something about yourself or your project, then ask about it later, even after a page reload."}
              </p>
            )}
            {messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const memories = m.parts.find((p) => p.type === "data-memories");
              const write = m.parts.find((p) => p.type === "data-memory-write");
              return (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 px-4 py-2 text-sm text-white"
                        : "max-w-[95%] text-sm"
                    }
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{renderBold(text)}</div>
                    {m.role === "assistant" && (
                      <MemoryChips
                        memories={memories?.type === "data-memories" ? memories.data : undefined}
                        write={write?.type === "data-memory-write" ? write.data : undefined}
                        onFocus={(id) => setFocusId((cur) => (cur === id ? null : id))}
                        focusId={focusId}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {status === "submitted" && <p className="text-xs text-zinc-500">Recalling memories…</p>}
            {error && <p className="text-sm text-red-600">Error: {error.message}</p>}
            <div ref={bottom} />
          </div>
          <form
            className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || busy) return;
              sendMessage({ text: input.trim() });
              setDraft(null);
            }}
          >
            <input
              value={input}
              onChange={(e) => setDraft(e.currentTarget.value)}
              placeholder={mode === "demo" && !nextDemoMessage ? "End of recording. Press Reset replay." : "Message…"}
              className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-zinc-700"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>

        <MemoryGraph
          graph={graph}
          newIds={newIds}
          focusId={focusId}
          onSelect={setFocusId}
          loading={graphLoading}
          onRefresh={loadGraph}
        />
      </main>

      <footer className="text-center text-xs text-zinc-500">
        Template by Hamroz Gavharov · built on{" "}
        <a className="underline" href="https://github.com/topoteretes/cognee">
          cognee
        </a>{" "}
        (Apache-2.0) and the{" "}
        <a className="underline" href="https://ai-sdk.dev">
          Vercel AI SDK
        </a>
      </footer>
    </div>
  );
}

/** Minimal **bold** rendering for answers; everything else stays plain text. */
function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : chunk,
  );
}
