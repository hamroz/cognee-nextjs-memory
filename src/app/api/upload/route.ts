import { resolveMode } from "@/lib/config";
import { sidecar } from "@/lib/sidecar";

const ALLOWED = /\.(txt|md|markdown|csv|json|pdf)$/i;

export async function POST(req: Request) {
  const { mode } = resolveMode();
  if (mode === "demo") {
    return Response.json({ error: "Uploads need live mode (OPENAI_API_KEY + SIDECAR_URL)." }, { status: 409 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });
  if (!ALLOWED.test(file.name)) return Response.json({ error: "unsupported file type" }, { status: 415 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "file too large (5 MB max)" }, { status: 413 });
  try {
    const job = await sidecar.rememberFile(file);
    return Response.json(job, { status: 202 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
