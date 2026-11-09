# Review instructions for Conference Memory

Flag any change that breaks these conventions.

## Time zones
- Conference times must be stored as ISO strings with an explicit offset. Sessionize times have no offset and must go through `localToZonedIso` with the conference time zone.
- Times shown to users must be formatted in the conference time zone (`formatTimeInZone`), never with `toLocaleTimeString()` or the browser's zone.

## Elasticsearch
- All Elasticsearch access goes through `src/lib/es/`. Index names come from `INDEX`, never string literals elsewhere.
- Every `semantic_text` field must set an explicit `inference_id`.
- Document IDs are `<conference>:<sourceId>` so re-imports update instead of duplicating.
- Imports must use bulk requests, never one request per document.
- Mappings are `dynamic: "strict"`: a new document field needs a mapping change in `src/lib/es/indices.ts`.

## AI
- Model output must be validated with zod before use.
- The model never generates URLs or IDs; it may only reference ones we already have.
- Writes triggered by AI must go through `src/lib/tools/` and be confirmed in the UI.
- API keys are only read in server code.

## Safety
- No secrets, `.env.local`, real contact details, or personal data in the diff.
