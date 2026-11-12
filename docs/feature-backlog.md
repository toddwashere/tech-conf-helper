# Feature Backlog

Planning notes for the Cloud Native Hackathon (Nov 9, 2026). No code yet.

**Story:** "You'll miss most of the conference and forget the rest."

**Target pains**

1. I can't figure out what to attend.
2. I can't absorb the talk while I'm sitting in it.
3. I forget what I learned and who I met. Most learnings fade within a week.

**Tracks:** Elasticsearch (core data layer) and Merge Forward (accessibility). Gitar if every feature lands through a PR. Dash0 only if OpenTelemetry goes in during the first hour.

## Tier 1: demo path (build in this order)

| # | Feature | Pain | Notes |
|---|---|---|---|
| 1 | Schedule import | 1 | Paste a URL or drop a file. Hardcode the Sessionize mapping first; AI field mapping and preview come later. 829 sessions from 3 public feeds. |
| 2 | Hybrid talk search | 1 | Keyword plus semantic search, merged with RRF. Show which matches came from meaning. |
| 3 | Plans A/B/C and "room full" reroute | 1 | Ranked backups for each time slot. If there's no Plan B, suggest the nearest similar talk. |
| 4 | Live captions, summary and notes | 2 | Speech to text, a large-text view, an end-of-session summary, and typed notes. Dark mode by default. Notes are saved locally first. |
| 5 | Talk to your data (voice) | 2, 3 | Voice or text goes to an LLM with tools, which read and write Elasticsearch. Examples: "add a note", "I want to attend this, 4/5, because…", "what did I learn about eBPF?" Ask before every write. |
| 6 | Trip report | 3 | Takeaways, action items, and people met, with citations. |

## Tier 2: stretch (once the demo path works end to end)

| # | Feature | Pain | Notes |
|---|---|---|---|
| 7 | Contact capture | 3 | A voice note or a pasted profile URL becomes a contact linked to a talk, plus a draft follow-up. Speaker LinkedIn and X links come from the feed. Use fictional or consenting people. |
| 8 | Past-conference memory | 3 | Import your notes from earlier conferences (e.g. AI Engineer World's Fair, SF) through the same importer, tagged by conference. A session page shows "Related from your past conferences." Keep personal notes out of the public repo. |
| 9 | Practice it | 3 | Generate a 20–30 minute hands-on exercise and 3 review questions from a talk's transcript. Label it as a draft. Optional: links to real workshops and tutorials. |
| 10 | Pre-talk brief | 1 | Links from the feed (GitHub, slides, website), GitHub activity for the session's CNCF project tags, news, and a prefilled X search link. The AI ranks links but never makes them up. Save results for demo sessions in advance. |
| 11 | MCP server | 3 | Expose feature 5's tools so Claude Code or Claude Desktop can query and update your conference data. About 20 minutes if the tools already exist. |
| 12 | Tap-to-define jargon in live captions | 2 | While captions run, known technical terms (e.g. "eBPF", "sidecar", "CRD", "DRA") are underlined automatically. Tap one, or any word, to get a 1–2 sentence definition and a "Learn more" link. See the design note below. |

## Skip

- Hallway matchmaker and live crowd map. Both need many real users, and the demo has one.
- A full offline app with a service worker. Local-first notes with a sync queue cover most of the benefit.
- The X API. Access and cost are unknown; use the prefilled search link instead.
- Separate handling for talks you missed. Link to the CNCF YouTube recordings instead.

## Design notes

- **One tool layer, three interfaces.** Define tools once, e.g. `search_sessions`, `add_note`, `rate_session`, `set_plan`, `ask`. The in-app voice/chat, the MCP server, and the UI buttons all call them.
- **One speech-to-text pipeline.** Captions (4) and voice commands (5) share it.
- **The AI sits at the edges.** It maps fields, extracts data, summarizes, and turns speech into tool calls. Ranking, conflict checks, and rerouting are plain code.
- **Everything is a document in Elasticsearch.** Sessions, speakers, notes, transcripts, contacts, links, and past-conference notes. Each one carries `conference`, `session_id`, and `source` fields, so a single query can search across all of them.
- **Battery.** Dark mode saves real power on OLED screens but little on most laptop LCDs. Bigger wins are no background network polling and no heavy animations. Note that conference Wi-Fi is the stronger reason to save notes locally.

### Feature 12: tap-to-define jargon (post-hackathon)

- **Glossary index in Elasticsearch:** a `glossary` index of terms, aliases, short definition, "Learn more" URL, source, and difficulty. Seed it from an openly licensed glossary such as the CNCF Cloud Native Glossary (check its license and attribute it), plus the CNCF project names already in the schedule's topics.
- **Auto-highlight:** as each final caption chunk arrives, match it against the glossary with a fast terms/phrase query, or with a percolator so the stored terms act as the "queries" run against live text. Matched words get a dotted underline. Show at most a few per minute so it doesn't get noisy.
- **Tap any word:** a known term opens its card. An unknown word falls back to semantic search over the glossary (Jina, so it works across languages). If there's still no match, the LLM gives a short definition grounded in the talk's abstract and nearby transcript. Label that "AI-generated", and only link to real sources, never invented URLs.
- **Personalize:** "I know this" hides a term from now on, and "Save" stores it as a `memories` doc (`type: "term"`, with `session_id` and timestamp). Saved terms show up in the trip report as "Terms I learned."
- **Accessibility tie-in (Merge Forward):** helps people new to the field and non-native speakers. Definitions follow the caption language when translation is on.
- **Elastic angle:** percolator or terms matching on a live stream, semantic fallback, and a per-user knowledge set, all in Elasticsearch.
