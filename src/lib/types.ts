import type { UIMessage } from "ai";

export type Mode = "live" | "demo";

export type MemoryNodeRef = { id: string; label: string };

export type Memory = {
  id: string;
  text: string;
  score?: number | null;
  nodes: MemoryNodeRef[];
};

export type GraphNode = { id: string; label: string; type: string };
export type GraphEdge = { source: string; target: string; label: string };
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };

export type GraphResponse = GraphData & {
  mode: Mode;
  /** Demo mode: when/how the static snapshot was produced. */
  snapshotNote?: string;
  error?: string;
};

export type StatusResponse = {
  mode: Mode;
  reasons: string[];
  sidecar?: { ok: boolean; cognee_version?: string; recall_search_type?: string; error?: string };
};

export type ChatDataParts = {
  memories: { mode: Mode; items: Memory[]; error?: string };
  "memory-write": { mode: Mode; status: "queued" | "skipped" | "failed"; jobId?: string; detail?: string };
};

export type ChatMessage = UIMessage<never, ChatDataParts>;
