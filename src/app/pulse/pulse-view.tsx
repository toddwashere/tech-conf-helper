"use client";

import { useEffect, useState } from "react";
import type { PulseBucket, PulseResponse } from "@/lib/types";

const TZ = "America/Denver";

export function PulseView() {
  const [data, setData] = useState<PulseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const res = await fetch("/api/pulse");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Pulse failed");
        if (live) {
          setData(body as PulseResponse);
          setError(null);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Pulse failed");
      }
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (error) return <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">{error}</p>;
  if (!data) return <p className="text-muted">Running aggregations…</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title="Your conference fingerprint" wide subtitle={`significant_terms: ${data.mySessions} sessions you planned or captured vs all ${data.totalSessions} talks`}>
        {data.fingerprint.length === 0 ? (
          <Empty text="Capture a note or save a plan to see what makes your conference yours." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.fingerprint.map((f) => (
              <span
                key={`${f.kind}:${f.term}`}
                title={`${f.mine} of yours · ${f.everyone} overall · score ${f.score}`}
                className={`rounded-full px-3 py-1 ${f.kind === "track" ? "bg-accent-strong/25 text-foreground" : "bg-surface-2 text-muted"}`}
                style={{ fontSize: `${Math.min(1.4, 0.8 + f.score / 20)}rem` }}
              >
                {f.term}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="Talks per track" subtitle="terms on tracks">
        <Bars buckets={data.tracks} />
      </Card>

      <Card title="Busiest hours" subtitle="date_histogram, America/Denver, top 8">
        <Bars buckets={data.busiestHours} color="bg-[#16C5C0]" />
      </Card>

      <Card title="Room signals over time" wide subtitle="room-signals data stream, 15-minute buckets">
        {data.signals.length === 0 ? <Empty text="No room signals yet." /> : <SignalChart signals={data.signals} />}
      </Card>

      <p className="text-xs text-muted sm:col-span-2">
        {data.memoriesCount} memories captured · refreshes every 15 s
        {data.notes.length > 0 && ` · ${data.notes.join(" ")}`}
      </p>
    </div>
  );
}

function Card({ title, subtitle, wide, children }: { title: string; subtitle: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 font-mono text-xs text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function Bars({ buckets, color = "bg-accent-strong" }: { buckets: PulseBucket[]; color?: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  if (buckets.length === 0) return <Empty text="No data." />;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {buckets.map((b) => (
        <li key={b.key} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2">
          <span className="truncate text-muted" title={b.key}>
            {b.key}
          </span>
          <span className="h-2.5 rounded-full bg-surface-2">
            <span className={`block h-full rounded-full ${color}`} style={{ width: `${(b.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{b.count}</span>
        </li>
      ))}
    </ul>
  );
}

function SignalChart({ signals }: { signals: PulseResponse["signals"] }) {
  const max = Math.max(1, ...signals.map((s) => s.full + s.crowded + s.other));
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div>
      <div className="flex h-32 items-end gap-0.5">
        {signals.map((s) => {
          const total = s.full + s.crowded + s.other;
          return (
            <div
              key={s.key}
              className="flex flex-1 flex-col justify-end"
              style={{ height: `${(total / max) * 100}%` }}
              title={`${fmt(s.key)}: ${s.full} full, ${s.crowded} crowded, ${s.other} check-ins`}
            >
              <span className="bg-danger" style={{ flexGrow: s.full }} />
              <span className="bg-warn" style={{ flexGrow: s.crowded }} />
              <span className="bg-accent-strong/60" style={{ flexGrow: s.other }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{fmt(signals[0].key)}</span>
        <span className="flex gap-3">
          <span className="text-danger">■ full</span>
          <span className="text-warn">■ crowded</span>
          <span className="text-accent">■ check-ins</span>
        </span>
        <span>{fmt(signals[signals.length - 1].key)}</span>
      </div>
    </div>
  );
}
