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
}

export interface NowNextItem {
  session: SessionDoc;
  status: "now" | "next";
  minutesUntil: number;
  distanceM: number | null;
  full: boolean;
}

export interface NowNextResponse {
  now: string;
  from: string | null;
  items: NowNextItem[];
}
