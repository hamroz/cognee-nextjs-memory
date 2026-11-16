import { resolveMode } from "@/lib/config";
import { demoGraph, demoSnapshotNote } from "@/lib/demo";
import { sidecar } from "@/lib/sidecar";
import type { GraphResponse } from "@/lib/types";

export async function GET(req: Request) {
  const { mode } = resolveMode();
  if (mode === "demo") {
    const turns = Number(new URL(req.url).searchParams.get("turns") ?? "0") || 0;
    const body: GraphResponse = { ...demoGraph(turns), mode, snapshotNote: demoSnapshotNote() };
    return Response.json(body);
  }
  try {
    const g = await sidecar.graph();
    return Response.json({ ...g, mode } satisfies GraphResponse);
  } catch (e) {
    const body: GraphResponse = {
      nodes: [],
      edges: [],
      mode,
      error: e instanceof Error ? e.message : String(e),
    };
    return Response.json(body, { status: 502 });
  }
}
