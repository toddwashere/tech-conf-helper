# Conference Memory

> You'll miss most of a conference and forget the rest. Conference Memory fixes both.

Drop in any conference schedule, plan every time slot with ranked backups, capture each talk with live captions and notes, and ask questions across everything you learned. Elasticsearch is the only data store.

Built at the [Cloud Native Hackathon](https://www.wemakedevs.org/hackathons/cnh) (WeMakeDevs, Salt Lake City, Nov 9, 2026).

## Status

| Feature | State |
|---|---|
| Schedule import (Sessionize feeds) | Done |
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
