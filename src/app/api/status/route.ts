import { connection } from "next/server";
import { resolveMode } from "@/lib/config";
import { sidecar } from "@/lib/sidecar";
import type { StatusResponse } from "@/lib/types";

export async function GET() {
  await connection(); // runtime env, never prerender
  const { mode, reasons } = resolveMode();
  const body: StatusResponse = { mode, reasons };
  if (process.env.SIDECAR_URL) {
    try {
      body.sidecar = await sidecar.health();
    } catch (e) {
      body.sidecar = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json(body);
}
