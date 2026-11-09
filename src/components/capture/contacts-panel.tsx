"use client";

import { useState } from "react";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { newNoteId } from "@/lib/capture/notes-store";
import { useSyncedMemories } from "./use-synced-memories";

const EMPTY = { name: "", role: "", profile_url: "", topic: "", follow_up: "" };

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ContactsPanel({ sessionId }: { sessionId: string }) {
  const { items, save, pending } = useSyncedMemories(`cm:contacts:${sessionId}`);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const f = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof EMPTY;
    if (!f.name) return setError("Add a name.");
    if (f.profile_url && !isHttpUrl(f.profile_url)) return setError("Profile URL must start with https://");
    setError(null);
    const metadata = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    const lines = [
      f.role ? `${f.name}, ${f.role}` : f.name,
      f.topic && `Talked about: ${f.topic}`,
      f.follow_up && `Follow up: ${f.follow_up}`,
    ].filter(Boolean);
    save({
      id: newNoteId(DEFAULT_CONFERENCE.id).replace(":note:", ":contact:"),
      type: "contact",
      session_id: sessionId,
      source: "contacts-panel",
      title: f.name,
      text: lines.join("\n"),
      metadata,
      created_at: new Date().toISOString(),
    });
    setForm(EMPTY);
    setOpen(false);
  }

  const field = (key: keyof typeof EMPTY, label: string, placeholder: string, type = "text") => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
    </label>
  );

  return (
    <section aria-labelledby="contacts-heading" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="contacts-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
          People I met
        </h2>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span role="status" className={`text-xs ${pending ? "text-warn" : "text-emerald-400"}`}>
              {pending ? `${pending} pending` : "All synced"}
            </span>
          )}
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent"
            >
              + Add person
            </button>
          )}
        </div>
      </div>

      {open && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {field("name", "Name *", "Jordan Rivera")}
          {field("role", "Role / company", "SRE at Example Corp")}
          {field("profile_url", "Profile URL", "https://…", "url")}
          {field("topic", "What we talked about", "eBPF rollout")}
          <div className="sm:col-span-2">{field("follow_up", "Follow-up", "Send our policy repo")}</div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-background hover:bg-accent">
              Save person
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {items.length === 0 && !open && <li className="text-sm text-muted">Nobody yet. Add people you meet here.</li>}
        {items.map(({ memory, synced }) => {
          const m = memory.metadata ?? {};
          return (
            <li key={memory.id} className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
              <p className="font-medium">
                {m.name}
                {m.role && <span className="font-normal text-muted"> · {m.role}</span>}
                <span className={`ml-2 text-xs ${synced ? "text-emerald-400" : "text-warn"}`}>{synced ? "✓" : "●"}</span>
              </p>
              {m.topic && <p className="text-muted">Talked about: {m.topic}</p>}
              {m.follow_up && <p>Follow up: {m.follow_up}</p>}
              {m.profile_url && (
                <a href={m.profile_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                  Profile ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
