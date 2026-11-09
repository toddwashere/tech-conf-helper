import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { INDEX } from "@/lib/es/indices";
import { localToZonedIso } from "@/lib/time";
import { bulkSaveMemories, saveSummaryMemory } from "./memories";
import type { MemoryInput } from "./memory-schema";
import { splitSentences } from "./replay";
import { SAMPLE_TRANSCRIPT } from "./sample-transcript";
import { summaryMemoryId, summaryToText } from "./summarize";

// Demo memories for the 3-minute story: an attendee who sat in four real KubeCon NA 2026 sessions (Tue/Wed).
// Everything written here is fictional: the notes, the transcript (a sample talk we wrote), and the people.
export const DEMO_SOURCE = "demo-seed";
const C = DEFAULT_CONFERENCE.id;

interface DemoSession {
  id: string;
  /** Local Mountain wall-clock start, used to timestamp the memories during the talk. */
  start: string;
  notes: string[];
  rating: { score: number; reason: string };
}

const SESSIONS: DemoSession[] = [
  {
    id: `${C}:1249819`, // Tue 12:20, platform engineering and intent-driven IDPs
    start: "2026-11-10T12:20:00",
    notes: [
      "Our IDP is a ticket form with extra steps. Start from the intent (\"I need a queue\") and generate the rest.",
      "Golden paths only work if they are the fastest path. Measure time-to-first-deploy for a new service.",
    ],
    rating: { score: 4, reason: "Made me rethink our self-service portal." },
  },
  {
    id: `${C}:1205589`, // Tue 14:50, Apple Silicon as GPU nodes for LLM inference
    start: "2026-11-10T14:50:00",
    notes: [
      "Small models on cheap local hardware are fine for internal tools. Check what our GPU spend actually serves.",
      "Idea: a dev-only inference pool so experiments stop competing with production GPUs.",
    ],
    rating: { score: 3, reason: "Interesting, but niche for our setup." },
  },
  {
    id: `${C}:1289674`, // Wed 11:50, Cilium and eBPF across the stack
    start: "2026-11-11T11:50:00",
    notes: [
      "Try observe-only mode on our staging cluster before enforcing any eBPF policy.",
      "Alert only on new behavior that crosses a trust boundary. Our current alerts are pure noise.",
      "Pin kernel versions per node pool; eBPF program support differs between kernels.",
    ],
    rating: { score: 5, reason: "Best talk so far. Concrete rollout plan we can copy." },
  },
  {
    id: `${C}:1250275`, // Wed 16:10, observability for LLM inference
    start: "2026-11-11T16:10:00",
    notes: [
      "Track time-to-first-token and queue depth, not just GPU utilization.",
      "Tie inference traces to cost per request so teams see what their prompts cost.",
    ],
    rating: { score: 4, reason: "Good metrics list to steal for our dashboards." },
  },
];

const CONTACTS = [
  {
    session: `${C}:1289674`,
    at: "2026-11-11T12:35:00",
    name: "Jordan Rivera",
    role: "Platform engineer, Example Corp",
    profile_url: "https://example.com/jordan-rivera",
    topic: "Rolling out eBPF policies in observe-only mode first",
    follow_up: "Send our baseline policy repo and compare alert rules",
  },
  {
    session: `${C}:1250275`,
    at: "2026-11-11T16:55:00",
    name: "Sam Okafor",
    role: "SRE lead, Sample Systems",
    profile_url: "https://example.org/sam-okafor",
    topic: "Time-to-first-token SLOs for internal LLM services",
    follow_up: "Share our GPU cost dashboard once it exists",
  },
];

const EBPF_SUMMARY = {
  one_line: "How to adopt eBPF runtime security safely: observe first, baseline per workload, then enforce gradually.",
  takeaways: [
    "The eBPF verifier checks programs before they run, so a policy bug can't take down the node like a kernel module could.",
    "Record process and network behavior in observe-only mode for about two weeks before blocking anything.",
    "Per-workload baselines are small because most services talk to only a few destinations.",
    "Alert on new behavior that crosses a trust boundary, not on everything, or people stop reading alerts.",
  ],
  action_items: [
    "Turn on observe-only mode on the staging cluster",
    "Pin kernel versions across node pools",
    "Keep policies in Git and review them like code",
  ],
};

function at(local: string, plusMinutes: number): string {
  return new Date(new Date(localToZonedIso(local)).getTime() + plusMinutes * 60_000).toISOString();
}

export function buildDemoMemories(): MemoryInput[] {
  const docs: MemoryInput[] = [];
  for (const s of SESSIONS) {
    const sid = s.id.split(":").pop();
    s.notes.forEach((text, i) =>
      docs.push({ id: `${C}:demo:note:${sid}:${i}`, type: "note", session_id: s.id, source: DEMO_SOURCE, text, created_at: at(s.start, 8 + i * 9) }),
    );
    docs.push({
      id: `${C}:demo:rating:${sid}`,
      type: "rating",
      session_id: s.id,
      source: DEMO_SOURCE,
      title: "Rating",
      text: `Rated ${s.rating.score}/5: ${s.rating.reason}`,
      metadata: { score: String(s.rating.score), reason: s.rating.reason },
      created_at: at(s.start, 31),
    });
  }

  // A transcript "replay" saved on the eBPF talk: ~3 sentences per chunk, offsets at speaking pace.
  const eBpf = SESSIONS[2];
  const sentences = splitSentences(SAMPLE_TRANSCRIPT.text);
  let offset = 2_000;
  for (let i = 0; i < sentences.length; i += 3) {
    const text = sentences.slice(i, i + 3).join(" ");
    const seq = String(i / 3).padStart(4, "0");
    docs.push({
      id: `${C}:demo:transcript:1289674:${seq}`,
      type: "transcript",
      session_id: eBpf.id,
      source: DEMO_SOURCE,
      text,
      lang: "en",
      starts_at_ms: offset,
      metadata: { capture_id: "demo", seq, mode: "replay" },
      created_at: new Date(new Date(localToZonedIso(eBpf.start)).getTime() + offset).toISOString(),
    });
    offset += Math.round((text.split(" ").length / 150) * 60_000);
  }

  for (const p of CONTACTS) {
    const { session, at: when, ...m } = p;
    docs.push({
      id: `${C}:demo:contact:${m.name.toLowerCase().replace(/\W+/g, "-")}`,
      type: "contact",
      session_id: session,
      source: DEMO_SOURCE,
      title: m.name,
      text: `${m.name}, ${m.role}\nTalked about: ${m.topic}\nFollow up: ${m.follow_up}`,
      metadata: m,
      created_at: at(when, 0),
    });
  }
  return docs;
}

/** Idempotent: fixed ids, so re-running overwrites instead of duplicating. */
export async function seedDemoMemories(es: Client): Promise<{ saved: number; failed: number }> {
  const { saved, failed } = await bulkSaveMemories(es, buildDemoMemories());
  const eBpf = SESSIONS[2];
  await saveSummaryMemory(es, {
    id: summaryMemoryId(eBpf.id),
    type: "summary",
    conference: C,
    session_id: eBpf.id,
    source: DEMO_SOURCE,
    title: "Summary: Cilium and eBPF across the stack",
    text: summaryToText(EBPF_SUMMARY),
    lang: "en",
    starts_at_ms: null,
    metadata: {
      one_line: EBPF_SUMMARY.one_line,
      takeaways: JSON.stringify(EBPF_SUMMARY.takeaways),
      action_items: JSON.stringify(EBPF_SUMMARY.action_items),
    },
    created_at: at(eBpf.start, 40),
  });
  return { saved: saved.length + 1, failed: failed.length };
}

/** Removes only demo-seeded memories; anything captured live in the app stays. */
export async function resetDemoMemories(es: Client): Promise<number> {
  const res = await es.deleteByQuery({ index: INDEX.memories, query: { term: { source: DEMO_SOURCE } }, refresh: true });
  return res.deleted ?? 0;
}
