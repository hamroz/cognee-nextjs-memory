import { connection } from "next/server";
import { Suspense } from "react";
import { ChatApp } from "@/components/ChatApp";
import { resolveMode } from "@/lib/config";
import { demo } from "@/lib/demo";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading…</p>}>
      <ModeAwareChat />
    </Suspense>
  );
}

async function ModeAwareChat() {
  await connection(); // the mode depends on runtime env vars, so resolve it per request
  const { mode, reasons } = resolveMode();
  return <ChatApp mode={mode} reasons={reasons} demoTurns={demo.turns.map((t) => t.user)} demoTitle={demo.title} />;
}
