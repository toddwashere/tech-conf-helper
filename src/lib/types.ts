import type { QueryTrace } from "@/components/query-inspector";


export type SessionKind = "talk" | "logistics";

export interface SessionLink {
  label: string;
  url: string;
}

export interface SessionSpeaker {
  id: string;
  name: string;
  tagline: string | null;
}

export interface SessionDoc {
  id: string;
  conference: string;
  source: string;
  source_id: string;
  title: string;
  description: string;
  content: string;
  starts_at: string;
  ends_at: string;
  day: string;
  room: string;
  building: string | null;
  room_level: string | null;
  tracks: string[];
  topics: string[];
  level: string | null;
  kind: SessionKind;
  full: boolean;
  speakers: SessionSpeaker[];
  speaker_names: string[];
  links: SessionLink[];
}

export interface SpeakerLink {
  type: string;
  url: string;
}

export interface SpeakerDoc {
  id: string;
  conference: string;
  source: string;
  source_id: string;
  name: string;
  tagline: string | null;
  bio: string;
  photo_url: string | null;
  links: SpeakerLink[];
  session_ids: string[];
}

export interface ImportResult {
  conference: string;
  sources: string[];
  sessions: number;
  changedSessions: number;
  speakers: number;
  days: string[];
  skippedDuplicates: number;
  errors: number;
  tookMs: number;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface ImportPreview {
  conference: string;
  sources: string[];
  sessions: number;
  talks: number;
  logistics: number;
  speakers: number;
  changedSessions: number;
  skippedDuplicates: number;
  days: NameCount[];
  tracks: NameCount[];
  buildings: NameCount[];
  rooms: number;
  full: number;
  missingDescription: number;
  timeZoneExample: { local: string; title: string } | null;
  sample: { title: string; starts_at: string; room: string; speakers: string[] }[];
}

export interface ImportProgress {
  phase: "fetching" | "embedding" | "speakers";
  done: number;
  total: number;
}

export type ImportStreamEvent =
  | ({ type: "progress" } & ImportProgress)
  | { type: "done"; result: ImportResult }
  | { type: "error"; error: string };

export interface SearchFilters {
  day?: string;
  track?: string;
  level?: string;
  includeLogistics?: boolean;
}

export interface SessionHit {
  session: SessionDoc;
  score: number | null;
}

export interface SearchResponse {
  total: number;
  hits: SessionHit[];
}

// --- WS-A: plans, room signals, geo, reroute ---

export type RoomSignalKind = "full" | "crowded" | "checkin";

export interface RoomSignalDoc {
  "@timestamp": string;
  conference: string;
  session_id: string;
  room: string;
  building: string | null;
  signal: RoomSignalKind;
  source: string;
  location?: GeoPoint;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface RoomDoc {
  id: string;
  conference: string;
  name: string;
  building: string;
  level: string | null;
  location: GeoPoint;
}

export interface PlanDoc {
  id: string;
  conference: string;
  slot_start: string;
  slot_end: string;
  session_id: string;
  rank: number;
  interest?: number;
  reason?: string;
  updated_at: string;
}

/** Why a session counts as full: the schedule feed says sold out, or someone sent a recent `full` signal. */
export type FullReason = "sold_out" | "signal" | null;

export interface PlanChoice {
  rank: number;
  label: string;
  session: SessionDoc;
  full: boolean;
  fullReason: FullReason;
  fullSince: string | null;
  /** Why you picked it, from the plan row. */
  note?: string | null;
}

export interface RerouteCandidate {
  session: SessionDoc;
  score: number;
  distanceM: number | null;
  sameBuilding: boolean;
}

export interface RerouteResult {
  kind: "backup" | "similar" | "none";
  session: SessionDoc | null;
  rank: number | null;
  distanceM: number | null;
  reason: string;
  trace?: QueryTrace[];
}

export interface PlanSlotView {
  slotStart: string;
  slotEnd: string;
  choices: PlanChoice[];
  conflictsWith: string[];
  reroute: RerouteResult | null;
}

export interface PlanResponse {
  now: string;
  demoClock: boolean;
  day: string | null;
  slots: PlanSlotView[];
  trace?: QueryTrace[];
}

export interface NowNextItem {
  session: SessionDoc;
  status: "now" | "next";
  minutesUntil: number;
  distanceM: number | null;
  full: boolean;
  /** "Plan A" etc. when this talk is in your plan. */
  planLabel?: string | null;
}

export interface NowNextResponse {
  now: string;
  from: string | null;
  items: NowNextItem[];
  trace?: QueryTrace[];
}

// --- WS-B capture: memories written while sitting in a talk ---

export type MemoryType = "transcript" | "note" | "summary" | "rating" | "contact";

export interface MemoryDoc {
  id: string;
  type: MemoryType | (string & {});
  conference: string;
  session_id: string | null;
  source: string;
  title: string | null;
  text: string;
  lang: string | null;
  starts_at_ms: number | null;
  metadata: Record<string, string> | null;
  created_at: string;
}

export interface SessionSummary {
  one_line: string;
  takeaways: string[];
  action_items: string[];
}

export type SummarizeResult =
  | {
      status: "ok";
      summary: SessionSummary;
      memoryId: string;
      transcriptChunks: number;
      notes: number;
      /** "extractive" = picked from your transcript and notes by Elasticsearch, no model involved. */
      mode: "workflow" | "ai" | "extractive";
      notice: string | null;
    }
  | { status: "missing_key"; message: string }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

export interface ActivityBucket {
  start: string;
  checkin: number;
  crowded: number;
  full: number;
}

export interface RoomActivity {
  day: string;
  until: string;
  total: number;
  simulated: number;
  buckets: ActivityBucket[];
  busiestRooms: { room: string; checkins: number; full: number }[];
  trace?: QueryTrace[];
}

export interface TripReportSession {
  id: string;
  /** Action items from notes (TODO/try/ask/follow up) and from the session summary. */
  actions: string[];
  title: string;
  starts_at: string | null;
  room: string | null;
  summary: string | null;
  notes: string[];
  rating: { score: number; reason: string | null } | null;
  contacts: { name: string; role: string | null; profile_url: string | null; topic: string | null; follow_up: string | null }[];
}

export interface TripReportDay {
  day: string;
  sessions: TripReportSession[];
}

export interface TripReportAi {
  headline: string;
  highlights: string[];
  top_talks: { session_id: string; title: string; why: string }[];
  follow_ups: string[];
  next_steps: string[];
}

export interface TripReportGlance {
  topTalks: { id: string; title: string; score: number; reason: string | null; starts_at: string | null }[];
  actions: { text: string; session_id: string; title: string }[];
  followUps: { name: string; role: string | null; follow_up: string | null; profile_url: string | null; session_title: string }[];
}

export interface TripReportNarrative {
  markdown: string;
  /** e.g. "workflow:trip-report" */
  source: string;
  created_at: string;
}

export interface TripReport {
  glance: TripReportGlance;
  /** Last written report from the `trip-report` Elastic Workflow, cached in `memories` (saves LLM quota). */
  narrative: TripReportNarrative | null;
  days: TripReportDay[];
  counts: { sessions: number; notes: number; ratings: number; contacts: number; summaries: number };
  ai: TripReportAi | null;
  aiStatus: "ok" | "missing_key" | "error" | "skipped";
  aiMessage: string | null;
}

// --- WS-C: Elastic platform (embeddings profiles, reranking, Agent Builder, pulse) ---

export type EmbeddingsProfile = "elser" | "jina";

export interface SearchMeta {
  profile: EmbeddingsProfile;
  reranked: boolean;
  tookMs: number;
  trace: QueryTrace[];
}

export interface SearchOptions {
  profile?: EmbeddingsProfile;
  rerank?: boolean;
}

export interface AskToolCall {
  toolId: string;
  params: Record<string, unknown>;
  resultTypes: string[];
  /** The ES|QL the tool ran, when it was an ES|QL tool. */
  esql: string | null;
}

export interface AskCitation {
  id: string;
  title: string;
}

export interface AskUsage {
  connectorId: string | null;
  model: string | null;
  llmCalls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type AskResponse =
  | {
      status: "ok";
      conversationId: string | null;
      answer: string;
      steps: AskToolCall[];
      citations: AskCitation[];
      tookMs: number;
      usage: AskUsage | null;
      /** Set when the answer came from the ask-cache index instead of a live agent run. */
      cachedAt?: string;
    }
  | { status: "no_llm"; message: string }
  | { status: "error"; message: string };

export interface PulseBucket {
  key: string;
  count: number;
}

export interface PulseResponse {
  totalSessions: number;
  tracks: PulseBucket[];
  busiestHours: PulseBucket[];
  signals: { key: string; full: number; crowded: number; other: number }[];
  fingerprint: { term: string; kind: "track" | "word"; score: number; mine: number; everyone: number }[];
  memoriesCount: number;
  mySessions: number;
  notes: string[];
  trace: QueryTrace[];
}
