# Decision Log

The main planning chat owns this file. Workstream sessions read it and don't edit it. Propose changes in your PR description instead.

## D1. Prize focus: Elasticsearch track first

Optimize for the Elasticsearch judging criteria: ES is the core data layer, plus smart use of search. Merge Forward stays because live captions are already planned. Dash0 and Radar are dropped. Gitar is optional: CI stays, but nothing waits on reviews.

## D2. Use the Elastic platform directly, not just as a database

| Elastic capability | How we use it | Owner |
|---|---|---|
| Store data | `sessions`, `speakers`, `memories`, `plans`, plus `room-signals` (data stream) | all |
| Jina embeddings (EIS) | `semantic_text` with Jina v5 via Cloud Connect (EIS from the local cluster). Multilingual, so a Spanish query finds English talks. Jina reranker on top of RRF. | WS-C |
| Local embeddings toggle | ELSER (`.elser-2-elasticsearch`) stays as the local/offline option. The app switches with `EMBEDDINGS=jina\|elser`. Each profile has its own semantic field (`content_jina`, `content` for ELSER). | WS-C |
| Keyword + vector (hybrid) | RRF retriever: lexical plus semantic. Done in the foundation. | done |
| Time-series | `room-signals` data stream (`@timestamp`, room, building, signal: full / check-in / crowded). "What's on now / next 30 min" range queries. Transcript chunks carry timestamps. | WS-A |
| Geo | `geo_point` per building (Salt Palace, Hyatt Regency, off-site). Reroute and "nearby next" sort by `geo_distance` from your current room. | WS-A |
| Aggregations + dashboards | In-app "Conference pulse" (tracks, busiest hours, room-full signals over time, `significant_terms` on your notes vs. the whole conference = "your conference fingerprint"). Kibana dashboard with a map and a signals timeline. | WS-C |
| Agent Builder | Custom "Conference Copilot" agent with custom tools (ES\|QL: sessions in a slot, my plan, room status; index search over `memories`; workflow tools). The app's talk-to-your-data chat calls Agent Builder's converse API instead of a hand-rolled tool loop. | WS-C |
| MCP | Agent Builder's MCP endpoint (`{KIBANA}/api/agent_builder/mcp`). Demo: ask Claude Desktop about your conference. | WS-C |
| Workflows | (1) `session-ended`: summarize the transcript and write a `summary` memory. (2) `room-full`: record the signal and write the reroute suggestion. (3) `trip-report`. Registered as Agent Builder tools. | WS-C |

## D3. Kibana config as code

Agents, tools, workflows, and dashboards are created by scripts in `scripts/elastic/` that call the Kibana APIs, so any machine can reproduce them with `npm run elastic:setup`. No click-only setup.

## D4. LLM

Preferred: Elastic Managed LLM via EIS (Cloud Connect), if the trial exposes it. Fallback: an OpenAI connector in Kibana using `OPENAI_API_KEY`. App-side AI calls (caption translation) use OpenAI directly until Agent Builder covers them.

## D5. Embedding cost

ELSER on this laptop embeds about 0.6 s per session, so a full import takes about 8 minutes. Re-imports skip unchanged sessions by hash. Don't run a full ELSER import live in the demo.

## D7. Merging to main often

`main` on GitHub is always runnable. Workstreams commit on their own branch at every working slice and report it. They don't push or merge themselves. The main planning chat merges each reported slice into `main` once `npm run ci` passes on the merged result, pushes, and tells the other workstreams to `git merge origin/main`. Aim for a merge every 45–60 minutes per workstream, not one big merge at the end.

## D6. Ownership boundaries for parallel work

| Workstream | Owns | Must not touch |
|---|---|---|
| WS-A Plan + reroute + time/geo | `src/lib/plan/`, `src/app/plan/`, `src/app/api/plan/`, `src/lib/geo.ts`, `room-signals` | `src/lib/search.ts`, `src/app/session/` |
| WS-B Capture | `src/app/session/`, `src/lib/capture/`, `src/app/api/memories/`, `src/components/capture/` | `src/lib/plan/`, `scripts/elastic/` |
| WS-C Elastic platform | `scripts/elastic/`, `src/lib/search.ts`, `src/lib/agent/`, `src/app/ask/`, `src/app/pulse/` | `src/lib/plan/`, `src/app/session/` |

Shared files (`src/lib/es/indices.ts`, `src/lib/types.ts`): additive changes only, append your section, and expect a trivial merge.

The Elasticsearch instance is shared and the schedule is already imported. Don't delete or recreate `sessions` or `speakers`. Add fields with a put-mapping call, not by recreating the index.
