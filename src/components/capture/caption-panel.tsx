"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildReplay } from "@/lib/capture/replay";
import { SAMPLE_TRANSCRIPT } from "@/lib/capture/sample-transcript";
import { getSpeechRecognition, type SpeechRecognitionLike } from "./speech";
import type { useTranscriptSync } from "./use-transcript-sync";

type Mode = "idle" | "live" | "replay";
type Sync = ReturnType<typeof useTranscriptSync>;

interface Line {
  id: number;
  text: string;
}

interface DisplayPrefs {
  fontPx: number;
  contrast: boolean;
}

const PREFS_KEY = "cm:caption-prefs";
const FONT_STEPS = [20, 28, 36, 48, 64, 80];
const MAX_LINES = 60;

function loadPrefs(): DisplayPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as DisplayPrefs | null;
    if (p && typeof p.fontPx === "number") return { fontPx: p.fontPx, contrast: Boolean(p.contrast) };
  } catch {}
  return { fontPx: 36, contrast: false };
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function CaptionPanel({ sync }: { sync: Sync }) {
  // Destructure the stable callbacks: `sync` itself is a new object every render.
  const { push, flush, beginCapture, status } = sync;
  const [mode, setMode] = useState<Mode>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // This tree renders client-only (see capture-client.tsx), so browser APIs are safe in initializers.
  const [prefs, setPrefs] = useState<DisplayPrefs>(loadPrefs);
  const [speed, setSpeed] = useState(1);
  const [supported] = useState(() => getSpeechRecognition() !== null);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const modeRef = useRef<Mode>("idle");
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lineId = useRef(0);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const updatePrefs = (next: DisplayPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (mode === "idle") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, interim]);

  const addFinal = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      push(clean, Date.now() - startedAt.current);
      setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), { id: lineId.current++, text: clean }]);
      setInterim("");
    },
    [push],
  );

  const stop = useCallback(() => {
    modeRef.current = "idle";
    setMode("idle");
    timers.current.forEach(clearTimeout);
    timers.current = [];
    recognition.current?.stop();
    recognition.current = null;
    setInterim("");
    void flush();
  }, [flush]);

  useEffect(() => () => stop(), [stop]);

  function begin(next: Mode, source: "web-speech" | "replay") {
    setError(null);
    setLines([]);
    setInterim("");
    setElapsed(0);
    startedAt.current = Date.now();
    beginCapture(source);
    modeRef.current = next;
    setMode(next);
  }

  function startLive() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Live captions need Chrome (Web Speech API). Use “Replay transcript” instead.");
      return;
    }
    begin("live", "web-speech");
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) addFinal(result[0].transcript);
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow it in the address bar, or use “Replay transcript”.");
      } else {
        setError(`Speech recognition error: ${e.error}. Try again or use “Replay transcript”.`);
      }
      stop();
    };
    // Chrome ends recognition after silence; keep it going while the user wants captions.
    rec.onend = () => {
      if (modeRef.current === "live" && recognition.current === rec) {
        try {
          rec.start();
        } catch {}
      }
    };
    recognition.current = rec;
    try {
      rec.start();
    } catch {
      setError("Couldn't start the microphone. Try again.");
      stop();
    }
  }

  function startReplay() {
    begin("replay", "replay");
    const events = buildReplay(SAMPLE_TRANSCRIPT.text, 160 * speed);
    timers.current = events.map((ev, i) =>
      setTimeout(() => {
        if (modeRef.current !== "replay") return;
        if (ev.final) addFinal(ev.text);
        else setInterim(ev.text);
        if (i === events.length - 1) stop();
      }, ev.atMs),
    );
  }

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      setError("Full screen isn't available here.");
    }
  }

  const fontIndex = Math.max(0, FONT_STEPS.indexOf(prefs.fontPx));
  const theme = prefs.contrast ? "bg-black text-yellow-300 border-yellow-300" : "bg-surface text-foreground border-border";
  const recording = mode !== "idle";

  return (
    <section aria-labelledby="captions-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="captions-heading" className="mr-auto text-sm font-semibold uppercase tracking-wider text-muted">
          Live captions
        </h2>
        {!recording ? (
          <>
            <button
              type="button"
              onClick={startLive}
              disabled={!supported}
              title={supported ? "Caption the room with your microphone" : "Needs Chrome"}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
            >
              ● Start captions
            </button>
            <button
              type="button"
              onClick={startReplay}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent"
            >
              ▶ Replay transcript
            </button>
            <label className="flex items-center gap-1 text-xs text-muted">
              Pace
              <select
                aria-label="Replay pace"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="rounded border border-border bg-surface px-1 py-1"
              >
                <option value={1}>1×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2×</option>
              </select>
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            ■ Stop
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Caption display">
        <span className="text-muted">Text size</span>
        <button
          type="button"
          aria-label="Smaller text"
          onClick={() => updatePrefs({ ...prefs, fontPx: FONT_STEPS[Math.max(0, fontIndex - 1)] })}
          className="h-9 w-9 rounded-lg border border-border hover:border-accent"
        >
          A−
        </button>
        <button
          type="button"
          aria-label="Larger text"
          onClick={() => updatePrefs({ ...prefs, fontPx: FONT_STEPS[Math.min(FONT_STEPS.length - 1, fontIndex + 1)] })}
          className="h-9 w-9 rounded-lg border border-border text-lg hover:border-accent"
        >
          A+
        </button>
        <button
          type="button"
          aria-pressed={prefs.contrast}
          onClick={() => updatePrefs({ ...prefs, contrast: !prefs.contrast })}
          className={`rounded-lg border px-3 py-1.5 ${prefs.contrast ? "border-yellow-300 text-yellow-300" : "border-border"}`}
        >
          High contrast
        </button>
        <button type="button" onClick={toggleFullscreen} className="rounded-lg border border-border px-3 py-1.5 hover:border-accent">
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <div ref={containerRef} className={`relative flex min-h-[320px] flex-col rounded-xl border-2 ${theme} ${fullscreen ? "p-10" : "p-5"}`}>
        <div className="flex items-center gap-3 text-sm font-medium" aria-live="polite">
          {recording ? (
            <span className="flex items-center gap-2 rounded-full bg-danger/15 px-3 py-1 text-danger">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
              {mode === "live" ? "Listening" : "Replaying"} · {formatClock(elapsed)}
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">Not capturing</span>
          )}
          <span className="ml-auto text-xs opacity-70">
            {status.savedChunks} chunks saved
            {status.queuedChunks > 0 && ` · ${status.queuedChunks} queued`}
          </span>
        </div>

        <div
          ref={scrollRef}
          className={`mt-4 flex-1 overflow-y-auto ${fullscreen ? "max-h-[85vh]" : "max-h-[55vh]"}`}
          style={{ fontSize: `${prefs.fontPx}px`, lineHeight: 1.35 }}
          aria-live="off"
        >
          {lines.length === 0 && !interim && (
            <p className="text-muted" style={{ fontSize: "1rem" }}>
              {recording
                ? "Waiting for speech…"
                : "Captions appear here. Start captions to use your microphone, or replay a saved transcript if the room is noisy. Only text is kept, never audio."}
            </p>
          )}
          {lines.map((l, i) => (
            <p key={l.id} className={`mb-2 font-medium ${i < lines.length - 3 ? "opacity-60" : ""}`}>
              {l.text}
            </p>
          ))}
          {interim && <p className="mb-2 font-medium opacity-70">{interim}</p>}
        </div>
        {status.error && <p className="mt-2 text-xs text-warn">{status.error}</p>}
      </div>
    </section>
  );
}
