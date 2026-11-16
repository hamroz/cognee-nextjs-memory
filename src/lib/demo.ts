import recording from "./demo-recording.json";
import type { GraphData, Memory } from "./types";

type RecordedTurn = {
  user: string;
  assistant: string;
  memories: Memory[];
  graph: GraphData;
};

type Recording = {
  title: string;
  source: "cognee-run" | "hand-authored";
  recorded_at: string;
  cognee_version?: string;
  llm_configured?: boolean;
  recall_search_type?: string;
  turns: RecordedTurn[];
};

export const demo = recording as Recording;

export function demoSnapshotNote(): string {
  if (demo.source === "cognee-run") {
    return `Static snapshot recorded ${demo.recorded_at.slice(0, 10)} from a real cognee ${demo.cognee_version} run (${
      demo.llm_configured ? "LLM extraction" : "local GLiNER extraction, no LLM"
    }, recall: ${demo.recall_search_type}). Assistant answers are scripted.`;
  }
  return "Hand-authored illustrative snapshot, not cognee output. Assistant answers are scripted.";
}

/** Graph after `completedTurns` turns have been written to memory. */
export function demoGraph(completedTurns: number): GraphData {
  if (completedTurns <= 0) return { nodes: [], edges: [] };
  const idx = Math.min(completedTurns, demo.turns.length) - 1;
  return demo.turns[idx].graph;
}
