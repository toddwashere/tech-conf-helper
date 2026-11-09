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
