# Hackathon Rules

These win over any stricter rule elsewhere. This is not production code.

## Scope

- `[HACK-01]` The rubric decides where time goes. Elasticsearch must be the core data layer; the project must make conferences easier.
- `[HACK-02]` If a feature doesn't move the rubric or the demo, skip it.
- `[HACK-03]` Build the demo path end to end first, then widen.
- `[HACK-04]` Prefer the simplest thing that demos well. No generic frameworks or config systems.
- `[HACK-05]` Seed or hardcode data when an integration would eat the clock. Make the seam obvious.
- `[HACK-06]` When a scoping call is ambiguous, ask. Don't silently build the bigger version.

## Testing

- `[HACK-08]` No tests for coverage.
- `[HACK-09]` Keep existing tests.
- `[HACK-10]` Write small focused tests for tricky pure logic: rerouting, slot conflicts, time zones, import mapping. CI runs them, and Gitar uses CI failures.
- `[HACK-11]` Verify by running the app and walking the demo path.

## Code Quality

- `[HACK-12]` Readable code still matters. Judges ask us to explain the architecture.
- `[HACK-13]` No secrets, private data, or real contacts in the repo or demo. Use fictional or consenting people.
- `[HACK-14]` Keep `main` runnable at all times.

## Demo Polish

- `[HACK-15]` Every demo screen has loading, empty, and friendly error states.
- `[HACK-16]` Must not look broken at phone width (375px).
- `[HACK-17]` Realistic seed data. No lorem ipsum on the demo path.
- `[HACK-18]` Keep `README.md` current: pitch, setup, demo steps, AI-use disclosure, data source credit.

## Last Mile

- `[HACK-19]` Feature freeze at 4:45 PM. Audit against `brief/brief.md` in a fresh session.
- `[HACK-20]` Cache AI results for demo questions. Keep a recorded audio clip and saved transcript as fallback.
- `[HACK-21]` Submit by 5:15 PM (deadline 5:30 PM).
