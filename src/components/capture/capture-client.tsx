"use client";

import dynamic from "next/dynamic";

// Capture depends on localStorage, the microphone, and fullscreen, so skip server rendering entirely.
export const SessionCaptureClient = dynamic(() => import("./session-capture").then((m) => m.SessionCapture), {
  ssr: false,
  loading: () => <p className="mx-auto max-w-6xl px-4 py-10 text-muted">Loading session…</p>,
});
