import Link from "next/link";
import type { MemoryHit } from "@/lib/capture/memory-search";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";

const TZ = "America/Denver";

export const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  transcript: "Heard",
  summary: "Summary",
  rating: "Rating",
  contact: "Person",
};

const TYPE_TONE: Record<string, string> = {
  note: "bg-accent/15 text-accent",
  transcript: "bg-surface-2 text-muted",
  summary: "bg-emerald-500/15 text-emerald-400",
  rating: "bg-warn/15 text-warn",
  contact: "bg-fuchsia-500/15 text-fuchsia-300",
};

export function MemoryHitCard({ hit }: { hit: MemoryHit }) {
  const { memory, session } = hit;
  const body = hit.highlight ?? memory.text;
  return (
    <li className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-medium ${TYPE_TONE[memory.type] ?? "bg-surface-2 text-muted"}`}>
          {TYPE_LABEL[memory.type] ?? memory.type}
        </span>
        {session ? (
          <Link href={`/session/${encodeURIComponent(session.id)}`} className="min-w-0 truncate text-accent hover:underline">
            {formatDayInZone(session.starts_at, TZ)} {formatTimeInZone(session.starts_at, TZ)} · {session.title}
          </Link>
        ) : (
          <span className="text-muted">{formatDayInZone(memory.created_at, TZ)} · not tied to a session</span>
        )}
      </div>
      <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm leading-relaxed">{body}</p>
    </li>
  );
}
