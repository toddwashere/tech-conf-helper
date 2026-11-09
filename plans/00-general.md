# General Plan

**Demo path:** paste the KubeCon URL → search → plan A/B/C → room full reroute → captions and summary → ask with citations → trip report.

**Strategy:** the foundation is one workstream. Parallel sessions start only after phase 01 is merged, and touch separate folders.

## Phases

| # | Phase | Blocking? | Parallel with | Target time | Status |
|---|-------|-----------|---------------|-------------|--------|
| 01 | Foundation: Next.js app, ES client and indices, inference endpoint, Sessionize import, search API and page, CI, README | Yes | — | 11:00–12:15 | In progress |
| 02 | Plans A/B/C and room-full reroute (`src/app/plan`, `src/lib/plan`) | No | 03 | 12:15–13:15 | |
| 03 | Live captions, notes, summary (`src/app/session`, `src/lib/capture`) | No | 02 | 12:15–14:00 | |
| 04 | Tool layer and talk to your data (`src/lib/tools`, `src/app/ask`) | No | — | 14:00–15:30 | |
| 05 | Trip report; AI import mapping and preview | No | — | 15:30–16:15 | |
| 06 | One stretch feature or buffer | No | — | 16:15–16:45 | |
| 07 | Freeze, polish, seed, README, fallback clip, submit | — | — | 16:45–17:15 | |

**Cut order if behind:** stretch → AI import mapping → translation → contact capture. Never cut search, reroute, captions, or Ask.

## Phase 01 checklist

- [ ] Next.js + TypeScript + Tailwind scaffold, dark by default
- [ ] `.env.example`; ES URL and key from `start-local`; OpenAI key
- [ ] `src/lib/es/client.ts`, `src/lib/es/indices.ts` with mappings for `sessions`, `speakers`, `memories`, `plans`
- [ ] Inference endpoint with explicit ID; `semantic_text` on session description and memory text
- [ ] Sessionize importer (pure mapping function + bulk index), runnable from a script and an API route
- [ ] Focused tests: Sessionize mapping and time zone handling
- [ ] `/api/search` with RRF hybrid retriever and filters (day, track, level)
- [ ] Search page with results, loading, empty, and error states
- [ ] GitHub Actions CI: typecheck, lint, tests
- [ ] README: pitch, setup, data source credit, AI disclosure

## Requirements from the brief

- Elasticsearch is the core data layer.
- Smart use of search (hybrid).
- Makes conferences easier and more accessible.
- Public repo, README with setup, AI disclosure.
- No private or personal data.

## Cut on purpose

Matchmaker and crowd map (need many users), full offline PWA (time), X API (access unknown), Radar (cluster setup time).
