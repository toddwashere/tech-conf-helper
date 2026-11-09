export interface ReplayEvent {
  /** Milliseconds from replay start. */
  atMs: number;
  /** The sentence so far (interim caption) or the whole sentence (final caption). */
  text: string;
  final: boolean;
}

export function splitSentences(transcript: string): string[] {
  return (
    transcript
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Turns a saved transcript into the same interim/final event stream the Web Speech API produces, at speaking pace.
 * Commas add a short pause and sentence ends a longer one, so captions feel like a person talking.
 */
export function buildReplay(transcript: string, wordsPerMinute = 160): ReplayEvent[] {
  const msPerWord = 60_000 / Math.max(40, wordsPerMinute);
  const events: ReplayEvent[] = [];
  let t = 0;
  for (const sentence of splitSentences(transcript)) {
    const words = sentence.split(" ");
    for (let i = 0; i < words.length; i++) {
      t += msPerWord;
      if (/,$/.test(words[i - 1] ?? "")) t += msPerWord * 0.5;
      const text = words.slice(0, i + 1).join(" ");
      events.push({ atMs: Math.round(t), text, final: i === words.length - 1 });
    }
    t += msPerWord * 1.2;
  }
  return events;
}

export interface FinalCaption {
  text: string;
  offsetMs: number;
}

/** Groups final captions into one transcript chunk per flush, so ES embeds a paragraph instead of every sentence. */
export class TranscriptBuffer {
  private pending: FinalCaption[] = [];

  add(caption: FinalCaption): void {
    if (caption.text.trim()) this.pending.push({ ...caption, text: caption.text.trim() });
  }

  get size(): number {
    return this.pending.length;
  }

  drain(): { text: string; startsAtMs: number; endsAtMs: number; sentences: number } | null {
    if (!this.pending.length) return null;
    const items = this.pending;
    this.pending = [];
    return {
      text: items.map((c) => c.text).join(" "),
      startsAtMs: items[0].offsetMs,
      endsAtMs: items[items.length - 1].offsetMs,
      sentences: items.length,
    };
  }
}
