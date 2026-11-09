import { Suspense } from "react";
import { SessionCaptureClient } from "@/components/capture/capture-client";
import { decodeSessionId } from "@/lib/capture/session";

async function Capture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionCaptureClient sessionId={decodeSessionId(id)} />;
}

export default function SessionPage({ params }: PageProps<"/session/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading session…</p>}>
      <Capture params={params} />
    </Suspense>
  );
}
