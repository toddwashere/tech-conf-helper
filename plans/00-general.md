# General Plan

**Demo path:** paste the KubeCon URL → hybrid search (Jina, multilingual) → plan A/B/C → tap room full → geo-aware reroute, signal shows on the live Kibana dashboard → captions and summary (Workflow) → ask the Conference Copilot (Agent Builder), also from Claude Desktop via MCP → trip report.

Decisions live in `docs/decisions.md`. The main planning chat owns that file and this one.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 01 | Foundation: app, indices, Sessionize import, hybrid search, CI | Done (`8d45e86`) |
| WS-A | Plans A/B/C, room-full reroute, `room-signals` time-series, building geo, "now / next" | Parallel |
| WS-B | Capture: live captions, local-first notes, transcripts into `memories`, session page | Parallel |
| WS-C | Elastic platform: Jina via EIS + toggle, reranker, Agent Builder agent and tools, MCP, Workflows, dashboards and Pulse page | Parallel; Jina waits on Cloud Connect |
| 05 | Integration: Ask page on Agent Builder, trip report, AI import mapping and preview | After A/B/C merge |
| 06 | Freeze 4:45, polish, seed, README, fallback clip, submit 5:15 | — |

**Cut order if behind:** AI import mapping → trip report Workflow (do it in-app) → Pulse page (keep the Kibana dashboard) → caption translation. Never cut: hybrid search, reroute, captions, Agent Builder ask.

## Requirements (from the brief)

- Elasticsearch is the core data layer.
- Smart use of search: keyword, semantic, vector, hybrid, time-series, geo, aggregations.
- Makes conferences easier and more accessible.
- Public repo, README with setup, AI disclosure, no private data.
