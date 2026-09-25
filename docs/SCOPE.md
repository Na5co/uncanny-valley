# Uncanny Valley — the original MVP scope

> This page documents the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; see [LIVE.md](LIVE.md).

**One line:** a finite social simulation. A world is an *event with a clock*. Citizens know it. When the clock hits zero the world freezes into an archive you can read, share, fork, and — the actual product — run across many seeds to ask questions about a population.

The project was inspired by **[unwatched.world](https://unwatched.world)** (Apache-2.0) and shares its lineage: perceive → decide → remember, nightly reflection, a digest or newspaper. The original engine made three different choices:

1. **Finite worlds, many runs, comparable outcomes** — a social experiment, not a story generator.
2. **Two-tier brains** (`docs/BRAINS.md`) — a slow model designs each world *once*; every citizen runs on a sub-cent model fed by that design. No pay-to-think tiers, no "habit-only" citizens, flat cost per world.
3. **Pace and legibility** (`docs/PACING.md`) — a 3-hour live feed of beats with a stakes board, so something is always at stake on screen.

## What "social experiment" means concretely

A single run is an anecdote. The unit of value is a **question over a population**:

- "Under scarcity, do citizens who start with high `loyal` defect less than low `loyal`?"
- "Does one rumour at hour 45 change how many people board the ferry?"
- "Does adding one bold citizen to a timid town change its ending?"

So the engine must be:
1. **Scenario-agnostic** — scenarios are data files; the sim never knows what a "ferry" is.
2. **Deterministic** — `(scenario, seed, brain, player inputs) → identical archive`. Without this, forking and N-run stats are meaningless.
3. **Measurable** — every run emits the same outcome metrics so runs can be compared.

## In scope (MVP)

| # | Piece | Definition of done |
|---|-------|--------------------|
| 1 | **Scenario format** (`docs/SCENARIO.md`) + 3 hand-written fixtures (`last-ferry`, `festival`, `adrift`) | A stranger can write a 4th scenario in 15 min without touching engine code. Fixtures exist to prove the schema and validator before the Architect is trusted with it; they are not "the game". |
| 2 | **Rules engine + mock brain** | 72-hour world, 20–40 citizens, `instant` tempo simulates in < 5 s. Deterministic. Diversity test passes across 20 seeds. Legality + candidate shortlist + beat classification (`PACING.md §3`) implemented. Density validator rejects scenarios that break `PACING.md §2`. |
| 3 | **Archive + feed** | `archive/<run-id>/record.json` + `record.md` + `calls.jsonl`. A reader with no context understands what happened, to whom, and why, in 3 minutes. Includes: beat timeline (level ≥ 2), stakes-board snapshots, per-citizen arc, threads, unsealed diaries, editions, fallback rate. A terminal feed (`pnpm run watch <run>`) renders beats + stakes board at the scenario tempo. |
| 4 | **Experiment runner** | `uncanny-valley experiment <scenario> --seeds 50 --vary <param>` → outcome table + `experiment.json`. Answers at least one social question from the list above with numbers. |
| 5 | **Fork** | `uncanny-valley fork <run-id> --seed N` / `--swap citizen`. Replays from `calls.jsonl` until divergence, then live. Emits a diff vs the parent run incl. hour of first divergence. |
| 6 | **Architect pipeline** | `uncanny-valley architect --question "..."` runs `prompts/architect-scenario.md` → validation gauntlet (`BRAINS.md §7`) → `prompts/architect-decision-engine.md` → compilation checks. Ledger updated. Max 3 regeneration attempts. Output: an accepted scenario + decision engine that a human rates "would watch". |
| 7 | **Citizen brain (Flash)** | `--brain flash` runs a world on the cheap model using `prompts/citizen.md` with prefix-cached sections. Fallback rate < 2 %. `pnpm run cost <scenario>` prints tokens and cost from a price table. A `live`-tempo world with Flash citizens is watchably more interesting than the same seed on Mock (blind critic). |

## Explicitly out of scope (MVP)

- Web UI (the feed is a terminal renderer; archives are static files a viewer can be built on later)
- Maps, avatars, voice
- Player accounts, multiplayer scheduling, letters/advice, any mid-world intervention
- Persistence beyond flat files
- Any model other than one Architect-class and one Flash-class adapter (both behind the same `Brain` interface, OpenAI-compatible endpoint so DeepSeek/OpenRouter/local all work)

## Non-negotiable constraints

- Node 22+, pnpm, TypeScript, **zero runtime deps** for the engine; the LLM adapters use `fetch` against an OpenAI-compatible endpoint.
- Pieces 1–5 run with **zero API spend**. Pieces 6–7 have a spend cap per run (`VALLEY_SPEND_CAP_USD`, see `docs/LLM.md`).
- The mock brain must be fun *before* the Flash brain is wired in. If a mock world is boring, a cheap model will not save it — fix the scenario/engine.
- Every piece is judged against something a reader can open and run.
