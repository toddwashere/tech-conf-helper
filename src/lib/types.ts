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

// --- WS-B capture: memories written while sitting in a talk ---

export type MemoryType = "transcript" | "note" | "summary";

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
  | { status: "ok"; summary: SessionSummary; memoryId: string; transcriptChunks: number; notes: number }
  | { status: "missing_key"; message: string }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };
