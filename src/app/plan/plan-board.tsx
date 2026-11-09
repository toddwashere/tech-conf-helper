"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";
import type { NowNextResponse, PlanChoice, PlanResponse, PlanSlotView, RerouteResult, RoomActivity } from "@/lib/types";

const TZ = "America/Denver";
const DAYS = [
  { value: "2026-11-09", label: "Mon" },
  { value: "2026-11-10", label: "Tue" },
  { value: "2026-11-11", label: "Wed" },
  { value: "2026-11-12", label: "Thu" },
];

type Status = "loading" | "ready" | "error";

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

function range(start: string, end: string) {
  return `${formatTimeInZone(start, TZ)}–${formatTimeInZone(end, TZ)}`;
}

export function PlanBoard({ day, at }: { day: string; at: string | null }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nowNextKey, setNowNextKey] = useState(0);
  const atQuery = at ? `&at=${encodeURIComponent(at)}` : "";

  const load = useCallback(
    () =>
      call<PlanResponse>(`/api/plan?day=${day}${atQuery}`, "GET").then(
        (p) => {
          setPlan(p);
          setStatus("ready");
        },
        (err) => {
          setError(err instanceof Error ? err.message : "Couldn't load the plan");
          setStatus("error");
        },
      ),
    [day, atQuery],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, url: string, method: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await call<{ plan?: PlanResponse }>(url, method, { ...body, day, at: at ?? undefined });
      if (res.plan) setPlan(res.plan);
      else await load();
      setNowNextKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  const reorder = (slot: PlanSlotView, ids: string[]) =>
    act(`reorder:${slot.slotStart}`, "/api/plan", "PATCH", { slotStart: slot.slotStart, sessionIds: ids });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <nav className="flex overflow-hidden rounded-lg border border-border" aria-label="Day">
          {DAYS.map((d) => (
            <Link
              key={d.value}
              href={`/plan?day=${d.value}${atQuery}`}
              className={`px-3 py-2 ${d.value === day ? "bg-accent-strong text-background" : "text-muted hover:text-foreground"}`}
            >
              {d.label}
            </Link>
          ))}
        </nav>
        {plan && (
          <span className="rounded-full border border-border px-3 py-1 text-muted" title="Demo clock">
            {plan.demoClock ? "Demo clock" : "Now"}: {formatDayInZone(plan.now, TZ)} · {formatTimeInZone(plan.now, TZ)}
          </span>
        )}
        <Link href="/" className="rounded-lg border border-border px-3 py-2 text-muted hover:border-accent hover:text-foreground">
          + Add talks
        </Link>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("reset:signals", "/api/plan/reset", "POST", { mode: "signals" })}
            className="rounded-lg px-3 py-2 text-muted hover:text-foreground disabled:opacity-50"
            title="Clear Room full reports, keep the plan"
          >
            Clear signals
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("reset:demo", "/api/plan/reset", "POST", { mode: "demo" })}
            className="rounded-lg border border-border px-3 py-2 text-muted hover:border-accent hover:text-foreground disabled:opacity-50"
            title="Restore the demo plan for Tue Nov 10 and clear Room full reports"
          >
            {busy === "reset:demo" ? "Resetting…" : "Reset demo"}
          </button>
        </div>
      </div>

      <NowNext at={at} refreshKey={nowNextKey} />
      <RoomActivityStrip day={day} at={at} refreshKey={nowNextKey} />

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">{error}</p>}
      {status === "loading" && <p className="text-muted">Loading your plan…</p>}
      {status === "ready" && plan && plan.slots.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-muted">
          <p>Nothing planned for {formatDayInZone(`${day}T12:00:00-07:00`, TZ)} yet.</p>
          <p className="mt-2">
            <Link href="/" className="text-accent hover:underline">
              Search for talks
            </Link>{" "}
            and tap “Add to plan”. Talks in the same time slot stack up as Plan A, B, C.
          </p>
        </div>
      )}

      {plan?.slots.map((slot) => (
        <section key={slot.slotStart} className="rounded-xl border border-border bg-surface p-4">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-lg font-semibold">{range(slot.slotStart, slot.slotEnd)}</h2>
            <span className="text-sm text-muted">
              {slot.choices.length} choice{slot.choices.length === 1 ? "" : "s"}
            </span>
            {slot.conflictsWith.length > 0 && (
              <span className="rounded bg-warn/15 px-2 py-0.5 text-sm text-warn">
                Plan A overlaps {slot.conflictsWith.map((s) => formatTimeInZone(s, TZ)).join(", ")} slot
              </span>
            )}
          </header>

          {slot.reroute && (
            <ReroutePanel
              reroute={slot.reroute}
              busy={busy}
              onAddBackup={(id) => act(`add:${id}`, "/api/plan", "POST", { sessionId: id, reason: slot.reroute?.reason })}
            />
          )}

          <ol className="flex flex-col gap-2">
            {slot.choices.map((c, i) => (
              <ChoiceRow
                key={c.session.id}
                choice={c}
                isTarget={slot.reroute?.session?.id === c.session.id}
                busy={busy}
                first={i === 0}
                last={i === slot.choices.length - 1}
                onMove={(dir) => {
                  const ids = slot.choices.map((x) => x.session.id);
                  const j = dir === "up" ? i - 1 : i + 1;
                  [ids[i], ids[j]] = [ids[j], ids[i]];
                  reorder(slot, ids);
                }}
                onRemove={() =>
                  act(`remove:${c.session.id}`, "/api/plan", "DELETE", { slotStart: slot.slotStart, sessionId: c.session.id })
                }
                onFull={() => act(`full:${c.session.id}`, "/api/plan/full", "POST", { sessionId: c.session.id })}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ReroutePanel({
  reroute,
  busy,
  onAddBackup,
}: {
  reroute: RerouteResult;
  busy: string | null;
  onAddBackup: (id: string) => void;
}) {
  const s = reroute.session;
  return (
    <div
      role="status"
      className={`mb-3 rounded-lg border p-4 ${reroute.kind === "none" ? "border-danger/40 bg-danger/10" : "border-accent/50 bg-accent/10"}`}
    >
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">
        {reroute.kind === "backup" ? "Rerouted to your backup" : reroute.kind === "similar" ? "Rerouted to a similar talk" : "No reroute available"}
      </p>
      {s && (
        <p className="mt-1 text-lg font-semibold leading-snug">
          {s.title}
          <span className="block text-sm font-normal text-muted">
            {range(s.starts_at, s.ends_at)} · {[s.room, s.building].filter(Boolean).join(" · ")}
          </span>
        </p>
      )}
      <p className="mt-2 text-sm text-foreground/85">{reroute.reason}</p>
      {reroute.kind === "similar" && s && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onAddBackup(s.id)}
          className="mt-3 rounded-lg bg-accent-strong px-3 py-2 text-sm font-medium text-background hover:bg-accent disabled:opacity-50"
        >
          {busy === `add:${s.id}` ? "Adding…" : "Add to this slot"}
        </button>
      )}
    </div>
  );
}

function ChoiceRow({
  choice,
  isTarget,
  busy,
  first,
  last,
  onMove,
  onRemove,
  onFull,
}: {
  choice: PlanChoice;
  isTarget: boolean;
  busy: string | null;
  first: boolean;
  last: boolean;
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
  onFull: () => void;
}) {
  const s = choice.session;
  const disabled = busy !== null;
  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start ${
        isTarget ? "border-accent bg-accent/5" : "border-border bg-surface-2/50"
      } ${choice.full ? "opacity-70" : ""}`}
    >
      <span
        className={`w-fit shrink-0 rounded-md px-2 py-1 text-sm font-semibold ${
          choice.rank === 0 ? "bg-accent-strong text-background" : "bg-surface-2 text-foreground"
        }`}
      >
        {choice.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug ${choice.full ? "line-through decoration-danger/70" : ""}`}>{s.title}</p>
        <p className="text-sm text-muted">
          {range(s.starts_at, s.ends_at)} · {[s.room, s.building].filter(Boolean).join(" · ")}
        </p>
        {s.speaker_names.length > 0 && <p className="text-sm text-muted">{s.speaker_names.join(", ")}</p>}
        {choice.full && (
          <span className="mt-1 inline-block rounded bg-danger/15 px-2 py-0.5 text-xs text-danger">
            {choice.fullReason === "sold_out"
              ? "Sold out"
              : `Room full · reported ${choice.fullSince ? formatTimeInZone(choice.fullSince, TZ) : ""}`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {!choice.full && (
          <button
            type="button"
            disabled={disabled}
            onClick={onFull}
            className="rounded-lg border border-danger/50 px-3 py-1.5 font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            {busy === `full:${s.id}` ? "Reporting…" : "Room full"}
          </button>
        )}
        <button type="button" aria-label="Move up" disabled={disabled || first} onClick={() => onMove("up")} className="rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-30">
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={disabled || last} onClick={() => onMove("down")} className="rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-30">
          ↓
        </button>
        <button type="button" aria-label="Remove" disabled={disabled} onClick={onRemove} className="rounded-lg border border-border px-2.5 py-1.5 text-muted hover:text-foreground disabled:opacity-30">
          ✕
        </button>
      </div>
    </li>
  );
}

function NowNext({ at, refreshKey }: { at: string | null; refreshKey: number }) {
  const [data, setData] = useState<NowNextResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call<NowNextResponse>(`/api/plan/now${at ? `?at=${encodeURIComponent(at)}` : ""}`, "GET")
      .then((d) => !cancelled && (setData(d), setFailed(false)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [at, refreshKey]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-semibold">Now and next 30 min</h2>
        {data && <span className="text-sm text-muted">nearest to {data.from ?? "Salt Palace"} first</span>}
      </header>
      {failed && <p className="mt-2 text-sm text-danger">Couldn’t load what’s on now.</p>}
      {!data && !failed && <p className="mt-2 text-sm text-muted">Checking the rooms…</p>}
      {data && data.items.length === 0 && <p className="mt-2 text-sm text-muted">Nothing on right now. Grab a coffee.</p>}
      {data && data.items.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {data.items.slice(0, 10).map((item) => (
            <li key={item.session.id} className="w-60 shrink-0 rounded-lg border border-border bg-surface-2/50 p-3 text-sm">
              <p className="flex justify-between text-xs text-muted">
                <span className={item.status === "now" ? "text-accent" : ""}>
                  {item.status === "now" ? "On now" : `In ${item.minutesUntil} min`}
                </span>
                <span>{item.distanceM === null ? "off-site" : item.distanceM < 40 ? "here" : `${item.distanceM} m`}</span>
              </p>
              <p className="mt-1 line-clamp-2 font-medium leading-snug">{item.session.title}</p>
              <p className="mt-1 text-xs text-muted">
                {item.session.room}
                {item.full && <span className="ml-2 text-danger">Full</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomActivityStrip({ day, at, refreshKey }: { day: string; at: string | null; refreshKey: number }) {
  const [data, setData] = useState<RoomActivity | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call<RoomActivity>(`/api/plan/activity?day=${day}${at ? `&at=${encodeURIComponent(at)}` : ""}`, "GET")
      .then((d) => !cancelled && (setData(d), setFailed(false)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [day, at, refreshKey]);

  if (failed) return null;
  if (!data) return <p className="text-sm text-muted">Loading room activity…</p>;
  if (data.total === 0) return null;
  const max = Math.max(1, ...data.buckets.map((b) => b.checkin + b.crowded + b.full));
  const live = data.total - data.simulated;
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Room activity today</h2>
        {data.simulated > 0 && (
          <span className="rounded bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
            Simulated history{live > 0 ? ` + ${live} live report${live === 1 ? "" : "s"}` : ""}
          </span>
        )}
        <span className="text-sm text-muted">room-signals, every 30 min, up to {formatTimeInZone(data.until, TZ)}</span>
      </header>
      <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label="Check-ins per half hour">
        {data.buckets.map((b) => {
          const total = b.checkin + b.crowded + b.full;
          return (
            <div
              key={b.start}
              className="flex min-w-0 flex-1 flex-col justify-end"
              title={`${formatTimeInZone(b.start, TZ)}: ${b.checkin} check-ins, ${b.crowded} crowded, ${b.full} full`}
            >
              {b.full > 0 && <div className="rounded-t bg-danger" style={{ height: `${Math.max(3, (b.full / max) * 96)}px` }} />}
              {b.crowded > 0 && <div className="bg-warn" style={{ height: `${Math.max(2, (b.crowded / max) * 96)}px` }} />}
              <div className="rounded-b bg-accent/70" style={{ height: `${(b.checkin / max) * 96}px` }} />
              {total === 0 && <div className="h-px bg-border" />}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{data.buckets[0] && formatTimeInZone(data.buckets[0].start, TZ)}</span>
        <span>
          <span className="text-accent">■</span> check-in <span className="text-warn">■</span> crowded{" "}
          <span className="text-danger">■</span> full
        </span>
        <span>{formatTimeInZone(data.until, TZ)}</span>
      </div>
      {data.busiestRooms.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Busiest: {data.busiestRooms.slice(0, 3).map((r) => `${r.room} (${r.checkins})`).join(", ")}
        </p>
      )}
    </section>
  );
}
