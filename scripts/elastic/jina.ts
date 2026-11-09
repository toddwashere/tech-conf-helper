import type { Client } from "@elastic/elasticsearch";
import { MAPPINGS } from "../../src/lib/es/indices";
import { PROFILE_INDEX } from "../../src/lib/search";

interface Endpoint {
  inference_id: string;
  task_type: string;
  service: string;
}

/** Finds the EIS Jina embeddings + reranker endpoints (present only once Cloud Connect / EIS is enabled). */
export async function findJinaEndpoints(es: Client): Promise<{ embed: string | null; rerank: string | null }> {
  const res = (await es.inference.get({ inference_id: "_all" })) as unknown as { endpoints: Endpoint[] };
  const jina = res.endpoints.filter((e) => /jina/i.test(e.inference_id));
  const pick = (task: string) =>
    jina.filter((e) => e.task_type === task).sort((a, b) => b.inference_id.localeCompare(a.inference_id))[0]?.inference_id ??
    null;
  return {
    embed: process.env.JINA_INFERENCE_ID ?? pick("text_embedding") ?? pick("sparse_embedding"),
    rerank: process.env.JINA_RERANK_INFERENCE_ID ?? pick("rerank"),
  };
}

/** Creates `sessions-jina` (same mapping, `content` on the Jina endpoint) and fills it with _reindex from `sessions`. */
export async function ensureJina(es: Client): Promise<string[]> {
  const { embed, rerank } = await findJinaEndpoints(es);
  if (!embed) {
    return [
      "BLOCKED: no Jina inference endpoint on this cluster.",
      "User action: Kibana → Stack Management → Cloud Connect, paste an Elastic Cloud API key (cloud.elastic.co → API keys) to enable the Elastic Inference Service, then rerun `npm run elastic:setup jina`.",
      "Until then search stays on ELSER (EMBEDDINGS=elser).",
    ];
  }
  const index = PROFILE_INDEX.jina;
  const out = [`jina embeddings endpoint: ${embed}`, `jina rerank endpoint: ${rerank ?? "none (set JINA_RERANK_INFERENCE_ID)"}`];
  if (!(await es.indices.exists({ index }))) {
    const mapping = structuredClone(MAPPINGS.sessions);
    mapping.properties!.content = { type: "semantic_text", inference_id: embed };
    await es.indices.create({ index, mappings: mapping });
    out.push(`created ${index}`);
  }
  const [src, dst] = await Promise.all([es.count({ index: "sessions" }), es.count({ index })]);
  if (dst.count >= src.count) {
    out.push(`${index} already has ${dst.count}/${src.count} docs`);
    return out;
  }
  // Reads `sessions`, writes only `sessions-jina`. semantic_text re-embeds `content` with the Jina endpoint.
  const task = await es.reindex({
    source: { index: "sessions", size: 50 },
    dest: { index },
    wait_for_completion: false,
  });
  out.push(`reindex started (task ${task.task}); check with GET _tasks/${task.task}`);
  if (rerank) out.push(`set JINA_RERANK_INFERENCE_ID=${rerank} in .env.local if it differs from the default`);
  return out;
}
