import type { Client } from "@elastic/elasticsearch";
import { ASK_CACHE_INDEX, ASK_CACHE_MAPPING } from "../es/indices";
import type { AskResponse } from "../types";

type OkAnswer = Extract<AskResponse, { status: "ok" }>;

// Cached answers are a demo safety net (no 10 s wait, no LLM quota 429), so they expire after a day.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function cacheKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:]+/gu, " ")
    .trim();
}

async function ensureIndex(es: Client) {
  if (!(await es.indices.exists({ index: ASK_CACHE_INDEX }))) {
    await es.indices.create({ index: ASK_CACHE_INDEX, mappings: ASK_CACHE_MAPPING }).catch(() => undefined);
  }
}

export async function getCachedAnswer(es: Client, question: string): Promise<OkAnswer | null> {
  const res = await es
    .get<{ response: OkAnswer; created_at: string }>({ index: ASK_CACHE_INDEX, id: cacheKey(question) })
    .catch(() => null);
  if (!res?.found || !res._source) return null;
  if (Date.now() - Date.parse(res._source.created_at) > MAX_AGE_MS) return null;
  return { ...res._source.response, conversationId: null, cachedAt: res._source.created_at };
}

export async function cacheAnswer(es: Client, question: string, answer: OkAnswer): Promise<void> {
  if (!answer.answer.trim()) return;
  await ensureIndex(es);
  const { cachedAt: _ignored, ...response } = answer;
  void _ignored;
  await es.index({
    index: ASK_CACHE_INDEX,
    id: cacheKey(question),
    document: {
      key: cacheKey(question),
      question,
      response,
      model: answer.usage?.model ?? null,
      created_at: new Date().toISOString(),
    },
  });
}
