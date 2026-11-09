# Demo script (3 minutes)

A click path through the real app on the seeded data. Times are cumulative. Rehearsed at `http://localhost:3001` (use `:3000` if that's where you run it).

## Before you go on (5 minutes ahead)

1. Reset to the clean starting state (demo plan, no "Room full" reports, seeded memories, simulated room history):
   ```bash
   npm run demo:reset
   ```
2. Pin the demo clock. `.env.local` should have `DEMO_NOW=2026-11-10T14:45:00-07:00`. The `/plan` links below also carry `?at=` so they work without it.
3. Warm every page once (the dev server compiles each route on first visit, which can take a few seconds): open `/`, `/plan`, `/session/kubecon-na-2026:1289674`, `/report`, `/pulse`, `/ask`.
4. Open these tabs in order, so each step is one click:
   1. `/`
   2. `/plan?day=2026-11-10&at=2026-11-10T14:45:00-07:00`
   3. `/session/kubecon-na-2026:1289674`
   4. `/report`
   5. `/ask`
   6. Kibana "Conference Pulse" dashboard, time range Nov 10 (optional, only if asked)

## 0:00 – 0:25 · Search (tab 1, `/`)

- **Say:** "It's Tuesday, 2:50 PM at KubeCon. Twenty talks start at once. All 829 sessions are in Elasticsearch, nowhere else."
- **Do:** pick **Tue Nov 10** in the day menu, then tap the example **"something on eBPF and security"**.
- **Say:** "That's hybrid search: keyword and semantic, merged with RRF. It understands what I mean, not just the words."
- **Do:** on **"Gone in 60 Minutes: Effectively Close the Exploitable Window…"** (2:50 PM, Hyatt), tap **+ Add to plan**. It answers **"Added as Plan B · view plan"**, because it's already the backup in the seeded plan.
- **Fallback:** if search is slow, skip it: "I already planned my day," and go to tab 2.

## 0:25 – 1:20 · Plan and reroute (tab 2, `/plan?day=2026-11-10&at=2026-11-10T14:45:00-07:00`)

- **Say:** "Every slot has Plan A and ranked backups. The demo clock says it's 2:45 PM, so the 2:50 slot starts in 5 minutes." Point at the **Starts in 5 min** badge and the **Now and next 30 min** strip: my Plan A is highlighted, and the rest are sorted by walking distance (geo).
- **Do:** in the **2:50 PM** slot, tap **Room full** on Plan A, "From Bytes to Traces" (255 EF).
- **Result:** "Rerouted to your backup": Plan B, **Gone in 60 Minutes**, Salt Lake Ballroom DE, Hyatt Regency, 365 m, about a 5 minute walk. The reason names each Elastic feature: room-signals (time-series), geo, ranked backup.
- **Do:** tap **Show the Elasticsearch queries** under the reroute.
- **Say:** "'Room full' is a document appended to a data stream, not an update to the session. The app reads the latest `full` signal from the last hour with a time range and aggregations. These are the real requests it just sent."
- **Optional, if time allows (+20 s):** tap **Room full** on Plan B and Plan C. The reroute switches to **"Rerouted to a similar talk"**: "Tracing at Scale … Nubank", same building, 194 m. Open the inspector and show the `semantic` query on `semantic_text`, the `geo_distance` query on `rooms`, and the slot's time range.
- **Do:** scroll to **Room activity today**. "Check-ins, crowded, and full signals every 30 minutes with a `date_histogram`. It's labelled simulated, because the conference hasn't started yet."
- **Fallback:** if the reroute looks wrong (for example, a talk is already full), tap **Reset demo** at the top of the page (restores the plan in under a second) and tap Room full again.

## 1:20 – 1:55 · Captions (tab 3, `/session/kubecon-na-2026:1289674`)

- **Say:** "I made it to a talk. The room is loud and the speaker is fast."
- **Do:** tap **▶ Replay transcript**. Captions stream in. Tap **A+** twice and turn on **High contrast**.
- **Say:** "Live captions use the browser's speech recognition. Here I'm replaying a saved transcript, so the demo doesn't depend on the room mic." Tap **■ Stop**.
- Scroll to **Session summary** and **Related from your notes**: "A summary with takeaways, and notes from other talks matched by meaning."
- **Fallback:** if the replay doesn't start, scroll straight to the saved summary.

## 1:55 – 2:20 · Trip report (tab 4, `/report`)

- **Say:** "Most of what you learn fades within a week. This is everything I captured, by day: summaries, notes, ratings, people."
- **Do:** tap the example search **"what should we try on our cluster"**. Results are memories matched by meaning.

## 2:20 – 3:00 · Ask (tab 5, `/ask`)

- **Do:** tap **"My 2:50 talk on Tuesday is full. Where should I go instead?"** It takes about 13 seconds.
- **Say, while it runs:** "This is an Elastic Agent Builder agent. Its tools are ES|QL and search over the same indices: my plan, room signals, and memories. It's also exposed over MCP, so Claude Desktop can ask the same questions."
- **Result:** it recommends Plan B at the Hyatt, citing the session, and shows the tools it called (`cc.my_plan`, `cc.sessions_in_window`, `cc.room_full`).
- **Close:** "Plan every slot, never lose a room, and remember all of it. Elasticsearch is the only data store."
- **Fallback:** if the agent is slow or errors, tap **Run the agent's tools directly (no LLM)**, or switch to `/pulse` and talk over the aggregations.

## After the demo

Run `npm run demo:reset` again before the next run. Known gaps are listed in the WS-A report; for example, live captures made during a rehearsal (replayed transcript chunks, notes) are not removed by the reset.
