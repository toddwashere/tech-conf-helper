# Architecture

Conference Memory is one Next.js app on top of one Elasticsearch cluster. Elasticsearch is the only data store: the schedule, your plan, your notes and transcripts, room signals, and the AI agent all live in it.

```text
 Browser (Next.js pages)
   │  search · plan · session capture · ask · pulse · import
   ▼
 Next.js route handlers (src/app/api/**)          ← thin: validate with zod, call src/lib
   │
   ├── src/lib/import    Sessionize feed → typed documents → bulk index (skip unchanged by hash)
   ├── src/lib/search    RRF hybrid retriever (lexical multi_match + semantic) [+ reranker]
   ├── src/lib/plan      ranked backups, reroute (pure, tested), room-signals, geo
   ├── src/lib/capture   captions → transcript chunks, local-first notes, summaries
   └── src/lib/agent     Agent Builder converse API
   ▼
 Elasticsearch 9.5 + Kibana
   ├── sessions, speakers          schedule (semantic_text on title+abstract+topics)
   ├── plans                       Plan A/B/C per slot
   ├── memories                    notes, transcripts, summaries, contacts (semantic_text)
   ├── room-signals (data stream)  time-series: full / crowded / check-in
   ├── rooms                       geo_point per building
   ├── Inference                   ELSER (local) or Jina v5 via Elastic Inference Service
   ├── Agent Builder               "conference-copilot" agent + ES|QL / search / workflow tools, MCP endpoint
   ├── Workflows                   session-ended summary, room-full, trip report
   └── Dashboards                  Kibana dashboard + in-app Pulse (aggregations)
```

## Key decisions and why

| Decision | Why |
|---|---|
| Elasticsearch is the only store | The prize asks for ES as the core data layer, and one store means one query can span the schedule and everything you captured. |
| `semantic_text` with an explicit `inference_id` | ES handles chunking and embeddings at ingest and query time, so the app has no vector code. Pinning the ID avoids silent model changes. |
| Hybrid search with RRF | Keyword search nails exact names ("Cilium"); semantic search finds "something on eBPF and security" when those words aren't in the title. RRF merges both without score tuning. |
| ELSER locally, Jina via EIS as the toggle | ELSER runs offline on a laptop (about 0.6 s per abstract). Jina runs on Elastic's GPUs and is multilingual, so a Spanish query finds English talks. |
| Document IDs are `<conference>:<sourceId>`, plus a content hash | Re-imports update in place, and unchanged sessions skip re-embedding: a full re-sync takes about 2 s instead of 7 minutes. |
| Time zones applied at import | Sessionize times have no offset. We attach the conference zone (`America/Denver`) once, store ISO with offset, and always display in the conference zone. |
| "Room full" is a time-series signal, not an edit | Signals keep history (when did it fill?), drive the dashboard, and never force re-embedding the session document. |
| AI only at the edges | Models turn speech into tool calls, summarize, and explain. Ranking, conflicts, and rerouting are plain tested code. Model output is validated with zod and never invents IDs or URLs. |
| Agent Builder instead of a hand-rolled tool loop | Tools are ES|QL and index searches defined in Elastic, reusable from the app, Kibana, and any MCP client. |
| Kibana config as code (`scripts/elastic/`) | Agents, tools, workflows, and dashboards are reproducible on any machine with one command. |

## Data flow: import

1. Fetch each Sessionize "All" feed (public JSON).
2. `mapSessionize` validates the shape with zod and maps it: categories become tracks, level, and topics; room names become building, level, and room; times get the conference offset; registration and breaks are tagged as logistics; "SOLD OUT" titles are flagged full.
3. Sessions are de-duplicated across feeds; each gets a content hash.
4. Only new or changed sessions are bulk-indexed (25 per request); ELSER embeds them at ingest.
5. The import API streams progress as NDJSON so the UI can show a live progress bar.

## Data flow: search

`POST /api/search` → `buildSearchRequest`:
- With a query: `rrf` over (a) `multi_match` on title^3, speakers^2, topics^2, description and (b) `semantic` on `content`, both with the same filters (day, track, level, talks only).
- Without a query: filtered list sorted by start time.

## AI disclosure

Built with Claude Code as a coding assistant. Architecture, scope, and data decisions are recorded in `docs/decisions.md`.
