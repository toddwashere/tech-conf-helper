# Conference Memory

> You'll miss most of a conference and forget the rest. Conference Memory fixes both.

Drop in any conference schedule, plan every time slot with ranked backups, capture each talk with live captions and notes, and ask questions across everything you learned. Elasticsearch is the only data store.

Built at the [Cloud Native Hackathon](https://www.wemakedevs.org/hackathons/cnh) (WeMakeDevs, Salt Lake City, Nov 9, 2026).

## Status

| Feature | State |
|---|---|
| Schedule import (Sessionize feeds) with preview and live progress at `/import` | Done |
| Hybrid talk search (keyword + semantic, RRF) | Done |
| Plans A/B/C and room-full reroute | Planned |
| Live captions, notes, summary | Planned |
| Talk to your data (voice/text) | Planned |
| Trip report | Planned |

## Setup

Requirements: Node 24, Docker.

1. Start Elasticsearch and Kibana locally:
   ```bash
   curl -fsSL https://elastic.co/start-local | sh
   ```
2. Copy the env template and fill it in from `~/elastic-start-local/.env` (`ES_LOCAL_API_KEY`, `ES_LOCAL_PASSWORD`):
   ```bash
   cp .env.example .env.local
   ```
3. Install and import the KubeCon NA 2026 schedule (about 8 minutes the first time, while ELSER embeds 829 abstracts on your laptop; re-imports only re-embed changed sessions):
   ```bash
   npm install
   npm run import
   ```
4. Run the app at http://localhost:3000:
   ```bash
   npm run dev
   ```

Checks: `npm run ci` (typecheck, lint, tests).

## How it works

- **Import:** `src/lib/import/sessionize.ts` maps a Sessionize "All" feed into session and speaker documents (time zone applied, categories split into tracks/level/topics, rooms parsed into building/level/room). `src/lib/import/run.ts` de-duplicates across feeds, skips unchanged sessions by hash, and bulk-indexes.
- **Search:** `src/lib/search.ts` runs an `rrf` retriever combining a lexical `multi_match` (title, speakers, topics, description) with a `semantic` query on a `semantic_text` field backed by the local ELSER endpoint.
- **Indices:** `sessions`, `speakers`, `memories` (notes, transcripts, summaries, contacts), `plans`. See `src/lib/es/indices.ts`.

## Data source

Schedule data comes from the public Sessionize feeds behind the [KubeCon + CloudNativeCon NA 2026 schedule](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/). Sessions link back to the original slides and pages; no slide files are stored in this repo.

## AI use disclosure

This project was built with AI coding assistance (Claude Code). Planning, architecture decisions, and review were done by the team; AI-generated code was run and verified before merging. AI features in the app itself (summaries, voice commands, Ask) are documented as they land.

## Elastic platform setup (agents, workflows, dashboard)

`npm run elastic:setup` configures everything in Kibana and Elasticsearch through their APIs. It's idempotent, so rerun it any time. Pass step names to run only some of them, for example `npm run elastic:setup workflows agent`.

| Step | What it creates |
|---|---|
| `enrich` | Enrich policy `conference-sessions-by-id`, so ES\|QL can join `plans` to session titles |
| `signals` | The `room-signals` data stream, if the plan page hasn't created it yet |
| `connector` | A Kibana OpenAI connector from `OPENAI_API_KEY`, set as the default AI connector |
| `workflows` | `session-ended`, `trip-report`, and `room-full` from `scripts/elastic/workflows/*.yaml`, each checked with the workflow validator first |
| `agent` | The Agent Builder agent `conference-copilot` with its `cc.*` tools: ES\|QL, index search, and workflow tools |
| `dashboard` | The Kibana dashboard "Conference Pulse" (Vega panels: track mix, busiest hours, signals timeline, rooms map) |
| `jina` | `sessions-jina`, re-embedded with Jina on EIS via `_reindex`, if a Jina endpoint exists |

The in-app pages are `/ask` (chat through the Agent Builder converse API) and `/pulse` (live aggregations).

### Ask your conference from Claude (MCP)

Agent Builder serves the copilot's tools over MCP at `{KIBANA_URL}/api/agent_builder/mcp`. Add `?namespace=cc` to expose only the Conference Memory tools:

```bash
claude mcp add --transport http conference-memory "http://localhost:5601/api/agent_builder/mcp?namespace=cc" --header 'Authorization: ApiKey ${ES_API_KEY}'
```

The single quotes keep `${ES_API_KEY}` as a reference that Claude Code expands when it connects, so the key isn't written into your config. Export `ES_API_KEY` in the shell that starts Claude. This was verified with `claude -p` in a scratch directory: `tools/list` returned the 9 `cc_*` tools, and `cc_track_mix` for Tuesday answered "Maintainer Track: 30 talks".

Then ask Claude "what's on at 3 PM Tuesday at KubeCon?" or "what did I learn about eBPF?". Claude calls `cc_sessions_in_window`, `cc_search_memories`, and the others. This works even without a Kibana LLM connector, because Claude is the LLM.

### Embeddings: ELSER or Jina

`EMBEDDINGS=elser` (default) searches `sessions` with ELSER, which runs locally and offline. `EMBEDDINGS=jina` searches `sessions-jina`, embedded by Jina on the Elastic Inference Service, which is multilingual: a Spanish query like "seguridad de contenedores en tiempo de ejecución" finds English talks. The search box can switch per query. Jina needs Cloud Connect: in Kibana, open Stack Management → Cloud Connect, paste an Elastic Cloud API key, then run `npm run elastic:setup jina`.

Reranking (`text_similarity_reranker` over the RRF results) is a checkbox under the search box. With Jina it uses `.jina-reranker-v3.5` on EIS over the top 50 and is on by default (search takes 0.3–1 s end to end). With ELSER it uses `.rerank-v1-elasticsearch` on the laptop's CPU, which takes about 3.5 s for the top 10, so it's off by default.

Measured on the demo laptop: `_reindex` of 830 sessions into `sessions-jina` took 70 s with Jina on EIS, against about 8 minutes for ELSER locally.

### LLM for the agent and workflows

`npm run elastic:setup connector` picks the LLM in this order: `KIBANA_LLM_CONNECTOR_ID`, then the first Elastic Managed LLM on EIS that answers a probe (Claude Sonnet 5, then gp-llm-v2, and so on), then an OpenAI connector from `OPENAI_API_KEY`. It sets the winner as Kibana's default AI connector and pins the workflows' AI steps to it. EIS trial quotas are per model, and each agent turn sends about 8k input tokens, so `/ask` falls back to the next managed LLM when one returns 429.
