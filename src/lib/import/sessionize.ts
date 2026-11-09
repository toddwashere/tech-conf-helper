import { z } from "zod";
import { localToZonedIso } from "../time";
import type { SessionDoc, SessionKind, SessionLink, SpeakerDoc } from "../types";

const categoryItem = z.object({ id: z.number(), name: z.string() });

export const sessionizeAllSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      title: z.string(),
      description: z.string().nullable(),
      startsAt: z.string().nullable(),
      endsAt: z.string().nullable(),
      speakers: z.array(z.string()),
      categoryItems: z.array(z.number()),
      questionAnswers: z.array(z.object({ questionId: z.number(), answerValue: z.string().nullable() })).default([]),
      roomId: z.number().nullable(),
    }),
  ),
  speakers: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      bio: z.string().nullable(),
      tagLine: z.string().nullable(),
      profilePicture: z.string().nullable(),
      links: z.array(z.object({ title: z.string().nullable().optional(), url: z.string(), linkType: z.string() })).default([]),
      sessions: z.array(z.number()).default([]),
    }),
  ),
  questions: z.array(z.object({ id: z.number(), question: z.string(), questionType: z.string() })).default([]),
  categories: z.array(z.object({ id: z.number(), title: z.string(), items: z.array(categoryItem) })),
  rooms: z.array(z.object({ id: z.number(), name: z.string() })),
});

export type SessionizeAll = z.infer<typeof sessionizeAllSchema>;

export interface MapOptions {
  conference: string;
  source: string;
  timeZone?: string;
}

const LOGISTICS_TRACKS = new Set(["registration", "breaks"]);
const LINK_QUESTION_TYPES = new Set(["Web_address", "File_upload"]);
const SKIPPED_LINK_QUESTIONS = new Set(["Event Logo", "Company URL"]);

export function cleanLabel(name: string): string {
  return name.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

export function parseRoom(name: string): { room: string; building: string | null; level: string | null } {
  const parts = name.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { building: parts[0], level: parts[1], room: parts.slice(2).join(" | ") };
  if (parts.length === 2) return { building: parts[0], level: null, room: parts[1] };
  return { building: null, level: null, room: name.trim() };
}

function slideLabel(url: string): string {
  const file = url.split("~").pop() ?? "";
  return file.toLowerCase().endsWith(".pptx") ? "Slides (PPTX)" : "Slides";
}

export function mapSessionize(raw: unknown, options: MapOptions): { sessions: SessionDoc[]; speakers: SpeakerDoc[] } {
  const data = sessionizeAllSchema.parse(raw);
  const { conference, source, timeZone } = options;
  const docId = (sourceId: string) => `${conference}:${sourceId}`;

  const categoryById = new Map<number, { group: string; name: string }>();
  for (const category of data.categories) {
    for (const item of category.items) {
      categoryById.set(item.id, { group: category.title.trim(), name: cleanLabel(item.name) });
    }
  }
  const roomById = new Map(data.rooms.map((r) => [r.id, r.name]));
  const questionById = new Map(data.questions.map((q) => [q.id, q]));
  const speakerById = new Map(data.speakers.map((s) => [s.id, s]));

  const sessions: SessionDoc[] = [];
  for (const s of data.sessions) {
    if (!s.startsAt || !s.endsAt) continue;

    const tracks: string[] = [];
    const topics: string[] = [];
    let level: string | null = null;
    for (const itemId of s.categoryItems) {
      const item = categoryById.get(itemId);
      if (!item) continue;
      if (item.group === "All Sessions") tracks.push(item.name);
      else if (item.group === "Audience Level") level = item.name;
      else topics.push(item.name);
    }

    const links: SessionLink[] = [];
    for (const answer of s.questionAnswers) {
      const question = questionById.get(answer.questionId);
      const url = answer.answerValue?.trim();
      if (!question || !url || !/^https?:\/\//.test(url)) continue;
      if (!LINK_QUESTION_TYPES.has(question.questionType) || SKIPPED_LINK_QUESTIONS.has(question.question)) continue;
      links.push({ label: question.questionType === "File_upload" ? slideLabel(url) : question.question, url });
    }

    const speakers = s.speakers
      .map((id) => speakerById.get(id))
      .filter((sp) => sp !== undefined)
      .map((sp) => ({ id: docId(sp.id), name: sp.fullName.trim(), tagline: sp.tagLine?.trim() || null }));

    const roomName = s.roomId != null ? (roomById.get(s.roomId) ?? "Room TBD") : "Room TBD";
    const { room, building, level: roomLevel } = parseRoom(roomName);
    const kind: SessionKind = tracks.some((t) => LOGISTICS_TRACKS.has(t.toLowerCase())) ? "logistics" : "talk";
    const description = s.description?.trim() ?? "";
    const startsAt = localToZonedIso(s.startsAt, timeZone);
    const uniqueTopics = [...new Set(topics)].filter((t) => !tracks.includes(t));

    sessions.push({
      id: docId(s.id),
      conference,
      source,
      source_id: s.id,
      title: s.title.trim(),
      description,
      content: [s.title.trim(), description, uniqueTopics.join(", ")].filter(Boolean).join("\n\n"),
      starts_at: startsAt,
      ends_at: localToZonedIso(s.endsAt, timeZone),
      day: startsAt.slice(0, 10),
      room,
      building,
      room_level: roomLevel,
      tracks,
      topics: uniqueTopics,
      level,
      kind,
      full: /sold out/i.test(s.title),
      speakers,
      speaker_names: speakers.map((sp) => sp.name),
      links,
    });
  }

  const speakers: SpeakerDoc[] = data.speakers.map((sp) => ({
    id: docId(sp.id),
    conference,
    source,
    source_id: sp.id,
    name: sp.fullName.trim(),
    tagline: sp.tagLine?.trim() || null,
    bio: sp.bio?.trim() ?? "",
    photo_url: sp.profilePicture,
    links: sp.links.map((l) => ({ type: l.linkType, url: l.url })),
    session_ids: sp.sessions.map((id) => docId(String(id))),
  }));

  return { sessions, speakers };
}
