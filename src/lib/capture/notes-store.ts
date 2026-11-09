// Local-first notes: localStorage is the source of truth on the device; Elasticsearch gets a copy when the network allows.

export interface LocalNote {
  id: string;
  sessionId: string;
  text: string;
  createdAt: string;
  synced: boolean;
}

const key = (sessionId: string) => `cm:notes:${sessionId}`;

export function loadNotes(sessionId: string): LocalNote[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    const parsed = raw ? (JSON.parse(raw) as LocalNote[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNotes(sessionId: string, notes: LocalNote[]): void {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(notes));
  } catch {
    // Storage full or blocked (private mode): the in-memory list still works for this visit.
  }
}

export function newNoteId(conference: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${conference}:note:${rand.replace(/[^\w-]/g, "")}`;
}
