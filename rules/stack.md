# Stack Rules

## Next.js and TypeScript (STK)

- `[STK-01]` Next.js App Router. Server code lives in route handlers (`src/app/api/**/route.ts`) or server-only modules.
- `[STK-02]` TypeScript strict. No `any` on data crossing the API boundary; shared types live in `src/lib/types.ts`.
- `[STK-03]` Validate request bodies with zod.
- `[STK-04]` Tailwind for styling. Dark mode is the default theme.
- `[STK-05]` Small files named for what they do. No barrel files.
- `[STK-06]` Comments only where the why isn't obvious.

## Elasticsearch (ES)

- `[ES-01]` One client in `src/lib/es/client.ts`. Index names and mappings live in `src/lib/es/indices.ts`.
- `[ES-02]` Indices: `sessions`, `speakers`, `memories`, `plans`. `memories` holds notes, transcripts, summaries, contacts, links, and past-conference notes, distinguished by `type`.
- `[ES-03]` Every `sessions` and `memories` document carries `conference`. `memories` also carries `session_id` (when tied to a session), `source`, and `created_at`.
- `[ES-04]` `semantic_text` fields always set an explicit `inference_id`. Never rely on the default endpoint.
- `[ES-05]` Use source IDs as document IDs (`<conference>:<sourceId>`) so re-imports update instead of duplicating.
- `[ES-06]` Bulk-index imports. Never index in a loop of single requests.
- `[ES-07]` Search uses the `rrf` retriever: a lexical `multi_match` plus a `semantic` query.

## Time

- `[TIME-01]` Store times as ISO strings with offset. Sessionize times have no offset; apply the conference time zone (`America/Denver`) on import.
- `[TIME-02]` Display times in the conference time zone, never the browser's.
