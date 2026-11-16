import "server-only";
import type { Mode } from "./types";

/**
 * Live mode needs both an LLM key (for the chat answer) and a cognee sidecar
 * (for memory). Anything missing -> demo mode, which only ever serves the
 * pre-recorded conversation and is labelled as such in the UI.
 */
export function resolveMode(): { mode: Mode; reasons: string[] } {
  const reasons: string[] = [];
  if (process.env.DEMO_MODE === "1") reasons.push("DEMO_MODE=1 is set");
  if (!process.env.OPENAI_API_KEY) reasons.push("OPENAI_API_KEY is not set");
  if (!process.env.SIDECAR_URL) reasons.push("SIDECAR_URL is not set");
  return { mode: reasons.length ? "demo" : "live", reasons };
}

export const CHAT_MODEL = process.env.CHAT_MODEL ?? "gpt-4o-mini";
export const DATASET = process.env.COGNEE_DATASET ?? "nextjs_chat_memory";
