// Plain-code action items: no model, just the phrasing people use when they jot down something to do.
const BULLET = /^\s*[-*•]\s*/;
const ACTION = /^(todo\b|try\b|ask\b|follow[\s-]?up\b|check\b|send\b|share\b|idea:)/i;
const PREFIX_TO_DROP = /^(?:todo\b[:\-\s]*|idea:\s*)/i;

/** Splits notes into lines and keeps those that read like a to-do, e.g. "TODO: …", "Try …", "Ask …", "Follow up …". */
export function extractActionItems(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    for (const line of note.split(/\n+/)) {
      const bare = line.replace(BULLET, "").trim();
      if (!ACTION.test(bare)) continue;
      let item = bare.replace(PREFIX_TO_DROP, "").trim();
      if (!item) continue;
      item = item[0].toUpperCase() + item.slice(1);
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}
