# Cloud Native Hackathon: Working Context

**Event:** Cloud Native Hackathon by WeMakeDevs, The Shop Workspace, Salt Lake City, Mon Nov 9, 2026 (day before KubeCon NA main conference)
**Build time:** 11:00 AM to 5:30 PM submission. Lunch 2:00 PM. Presentations 5:30 to 6:30 PM.
**Prizes:** Best overall (NVIDIA DGX Spark), Elasticsearch track ($4,000), Merge Forward track (iPad). Also eligible: Gitar, Dash0 if genuinely used.

## 1. Problem

At a conference you'll miss most of it and forget the rest. KubeCon NA 2026 has 829 sessions, up to 20 at once, rooms that fill up, and talks that are hard to follow. Afterward, notes and contacts are scattered, and most learnings fade within a week.

## 2. Pitch

Conference Memory: drop in any schedule, plan every slot with backups, capture each talk with live captions, and ask everything you learned.

## 3. Judging criteria

| Criterion | How we win it |
|-----------|---------------|
| Elasticsearch is the core data layer, not a side feature | Sessions, speakers, plans, notes, transcripts, contacts all live in ES. Nothing else stores data. |
| Smart use of search (keyword, semantic, vector, hybrid) | Hybrid RRF talk search; semantic "nearest backup" for rerouting; cross-type retrieval with citations for Ask |
| Makes conferences easier | Rerouting when a room is full; captions; trip report |
| Merge Forward: more inclusive and accessible | Live captions, translation, large-text mode, dark mode |
| Gitar: features land through reviewed PRs; project-aware rules; CI diagnosis | `.gitar/review/` instructions, one PR per feature, CI with focused tests |
| Explain architecture and decisions | `ARCHITECTURE.md`; rehearse it |

## 4. Hard requirements (from the rules)

- Public source repo with README and setup instructions.
- AI coding assistant use disclosed.
- We understand and can explain the code.
- Only data we own or may use; no private or personal data in repo or demo.
- One project, started today.

## 5. Data

- KubeCon NA 2026 main schedule: `https://sessionize.com/api/v2/svi82w6c/view/All` (600 sessions, 712 speakers, 37 rooms)
- CNCF co-located events: `https://sessionize.com/api/v2/ayajbd6b/view/All` (229 sessions)
- Sponsor co-located: `https://sessionize.com/api/v2/etvmcsmr/view/All` (14, duplicates of main)
- Format: `{ sessions, speakers, questions, categories, rooms }`. Times have no offset (Mountain). `isServiceSession` is always false; use categories to separate talks from logistics. Some titles contain `[SOLD OUT]`.
- Credit the source in the README.

## 6. Scope

### Must have (demo path)

1. Schedule import (hardcoded Sessionize mapping first; AI mapping and preview later)
2. Hybrid talk search
3. Plans A/B/C per slot and "room full" reroute
4. Live captions, end-of-session summary, notes (dark mode, saved locally first)
5. Talk to your data by voice or text (tool calls into ES, confirmed before writes, cited answers)
6. Trip report

### Nice to have (pick at most one)

- Past-conference memory (if real notes are available)
- Practice it (generated exercise from a talk)
- Pre-talk brief links; contact capture; MCP server over the tool layer

### Out of scope

Matchmaker, crowd map, full offline PWA, X API, scraping, Radar.

## 7. Demo script (about 3 minutes)

1. "Tuesday, 2:50 PM. Twenty talks at once." Paste the KubeCon URL; 829 sessions import.
2. Search "something on eBPF and security."
3. Say "Make the Cilium talk my backup."
4. Tap "room full"; rerouted to Plan B.
5. Captions in large text; toggle to Spanish.
6. Talk ends; summary appears. Say "Note: try this on our cluster."
7. Ask "What did I learn about eBPF, and who did I meet?" Cited answer.
8. Trip report. "Most learnings fade within a week. These don't."

## 8. AI approach

- Speech → text (browser Web Speech API) → model → tool calls (`search_sessions`, `set_plan`, `mark_full`, `add_note`, `rate_session`, `ask`) → ES.
- Unknown schedule file → model proposes a field mapping from a sample → code converts and validates everything.
- Summaries, translations, cited answers, and trip report are model output over ES retrieval.
- Embeddings: ES inference endpoint (OpenAI) behind `semantic_text`, explicit `inference_id`. Local ELSER only if it runs comfortably.

## 9. Glossary

- **Slot:** a time window; a plan holds ranked sessions per slot.
- **Reroute:** pick the next ranked backup, else the most similar non-full talk overlapping the slot, preferring the same building.
- **Memory:** any user-captured item in the `memories` index.

## 10. Open questions

- Dash0: worth adding OpenTelemetry in the foundation, or skip?
- Do we have AI World's Fair notes for past-conference memory?
- Does local Elasticsearch handle embedding 829 abstracts quickly enough?
