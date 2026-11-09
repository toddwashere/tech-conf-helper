# AGENTS.md

## Project Overview

**Conference Memory** is a tech conference helper built at the Cloud Native Hackathon (WeMakeDevs, Salt Lake City, Nov 9, 2026). It imports any conference schedule into Elasticsearch, plans each time slot with ranked backups, captures talks with live captions and notes, and lets you ask questions of everything you learned.

Stack: Next.js (App Router) + TypeScript + Tailwind, with Elasticsearch as the only data store.

**Key files**
- `brief/brief.md`: rubric, scope, demo script. Read it before building any feature.
- `plans/00-general.md`: phases and status.
- `docs/decisions.md`: binding decisions and who owns which files. Read it before building anything.
- `docs/feature-backlog.md`: every idea, ranked.

Workflow adapted from [juanlizarazo/hackathon-starter-kit](https://github.com/juanlizarazo/hackathon-starter-kit) (MIT).

---

## Hackathon Mode

Ship the demo, not a test suite. `rules/hackathon.md` overrides any stricter rule elsewhere.

## Rule Files

Read only the files relevant to the task.

| File | Categories | Load when |
|------|-----------|-----------|
| `rules/hackathon.md` | HACK | Always |
| `rules/ai.md` | AI | Any feature that calls a model |
| `rules/stack.md` | STK, ES | Any code: Next.js, TypeScript, Elasticsearch |
| `rules/git.md` | GIT | Commits or PRs |

## Agent Workflow

- `[AGT-01]` Don't use `superpowers:subagent-driven-development`; implement plans directly.
- `[AGT-02]` Use subagents only for genuinely independent work, and only after the foundation phase is merged.
- `[AGT-03]` Use `superpowers:systematic-debugging` for bugs. Skip TDD (`[HACK-08]`), but write the focused tests in `[HACK-10]`.
- `[AGT-04]` One phase per session: read the brief, the general plan, and that phase's plan, then build, verify, and open a PR.
- `[AGT-05]` Never claim something works without running it. Report what you ran and what you saw.

## Universal Rules

- End files with a newline.
- No secrets in the repo. Keys live in `.env.local` (gitignored); `.env.example` lists the names.
- All Elasticsearch access goes through `src/lib/es/`. All AI-triggered writes go through the tool layer in `src/lib/tools/`.
