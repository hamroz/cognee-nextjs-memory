import "server-only";
import { DATASET } from "./config";
import type { GraphData, Memory } from "./types";

const base = () => (process.env.SIDECAR_URL ?? "").replace(/\/$/, "");

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 15_000, headers, ...rest } = init;
  const token = process.env.SIDECAR_TOKEN;
  const res = await fetch(`${base()}${path}`, {
    ...rest,
    headers: {
      ...(rest.body && !(rest.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`sidecar ${path} -> ${res.status} ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const sidecar = {
  health: () =>
    call<{ ok: boolean; cognee_version: string; recall_search_type: string }>("/health", { timeoutMs: 4_000 }),

  recall: (query: string, topK = 5) =>
    call<{ memories: Memory[]; search_type: string }>("/recall", {
      method: "POST",
      body: JSON.stringify({ query, dataset: DATASET, top_k: topK }),
      timeoutMs: 20_000,
    }),

  remember: (text: string) =>
    call<{ job_id: string; status: string }>("/remember", {
      method: "POST",
      body: JSON.stringify({ text, dataset: DATASET }),
    }),

  rememberFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("dataset", DATASET);
    return call<{ job_id: string; status: string; filename: string }>("/remember/file", {
      method: "POST",
      body: form,
      timeoutMs: 30_000,
    });
  },

  graph: () => call<GraphData>(`/graph?dataset=${encodeURIComponent(DATASET)}`),
};
