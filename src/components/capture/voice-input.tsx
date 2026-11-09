"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSpeechRecognition, type SpeechRecognitionLike } from "./speech";

const noopSubscribe = () => () => {};

export interface VoiceInputProps {
  /** Called once with the full dictated text when the user releases the button. */
  onText: (text: string) => void;
  label?: string;
  lang?: string;
  className?: string;
}

/**
 * Push-to-talk dictation with the Web Speech API: hold the button (or hold Space/Enter while it's focused), speak,
 * release. Only text leaves this component, never audio. Reusable anywhere text input helps (notes, ratings, /ask).
 * Note: Chrome runs one recognizer at a time, so this pauses while live captions are on.
 */
export function VoiceInput({ onText, label = "Hold to talk", lang = "en-US", className = "" }: VoiceInputProps) {
  // SSR-safe: false on the server, real support check on the client, so it can be used on server-rendered pages.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getSpeechRecognition() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finals = useRef<string[]>([]);
  const lastInterim = useRef("");
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => () => rec.current?.abort(), []);

  function start() {
    const Ctor = getSpeechRecognition();
    if (!Ctor || rec.current) return;
    setError(null);
    finals.current = [];
    lastInterim.current = "";
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals.current.push(res[0].transcript.trim());
        else text += res[0].transcript;
      }
      lastInterim.current = text.trim();
      setInterim([...finals.current, lastInterim.current].filter(Boolean).join(" "));
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone blocked. Allow it in the address bar."
          : "Couldn't hear that. Try again, or type instead.",
      );
    };
    // Fires after stop(): hand over everything heard, including a trailing interim result.
    r.onend = () => {
      const text = [...finals.current, lastInterim.current].filter(Boolean).join(" ").trim();
      rec.current = null;
      setListening(false);
      setInterim("");
      if (text) onTextRef.current(text);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      setError("The microphone is busy (are live captions on?). Stop them and try again.");
    }
  }

  function stop() {
    rec.current?.stop();
  }

  if (!supported) {
    return (
      <span className={`text-xs text-muted ${className}`} title="Voice input needs Chrome">
        Voice input needs Chrome
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        aria-pressed={listening}
        aria-label={listening ? "Listening, release to finish" : label}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") stop();
        }}
        className={`select-none touch-none rounded-lg border px-3 py-2 text-sm ${
          listening ? "border-danger bg-danger/15 text-danger" : "border-border hover:border-accent"
        }`}
      >
        {listening ? "● Listening… release" : `🎙 ${label}`}
      </button>
      {listening && interim && <span className="text-xs italic text-muted">{interim}</span>}
      {error && <span className="text-xs text-warn">{error}</span>}
    </span>
  );
}
