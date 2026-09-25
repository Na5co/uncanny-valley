# Brains — the two-tier LLM architecture

> This page documents the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; see [LIVE.md](LIVE.md).

> Implementation: `src/llm/client.ts` (endpoint, meter, prices), `src/architect.ts` (pipeline), `src/llm/engine.ts` (decision engine + compile checks; reference file `scenarios/last-ferry.engine.json`), `src/brains/flash.ts` (citizen prompt, validation, fallback, editions), `src/brains/replay.ts` (call cache for forks), `src/cost.ts`. Commands and setup: `docs/LLM.md`.

> **Principle:** think once, expensively. Act thousands of times, cheaply.
> The slow model *designs the world and how to think in it*. The fast model *only chooses*.

The original engine runs on two model tiers plus a deterministic rules engine between them.

```
                 every 72h                        every decision tick
┌──────────────┐ ───────────► ┌──────────────┐ ───────────► ┌──────────────┐
│  ARCHITECT   │  scenario +  │    RULES     │  candidate   │   CITIZEN    │
│ DeepSeek V4  │  decision    │    ENGINE    │  actions +   │ DeepSeek     │
│ Pro (slow,   │  engine      │ (TypeScript, │  compact     │ Flash (cheap,│
│ smart)       │              │  no LLM)     │  context     │ fast)        │
└──────────────┘              └──────┬───────┘ ◄─────────── └──────────────┘
                                     │           chosen action + thought
                                     ▼
                              validated, applied, logged
```

| Tier | Model class | Runs | Produces | Cost driver |
|------|-------------|------|----------|-------------|
| **Architect** | DeepSeek V4 Pro (or any frontier reasoning model) | once per world (every 72h) + once per repair | a **scenario** (data) and a **decision engine** (data) | a handful of long calls; negligible |
| **Rules engine** | none — TypeScript | every tick | world state, legal-action set, candidate shortlist, compact citizen context | CPU only |
| **Citizen** | DeepSeek Flash / any sub-cent model | every citizen, every decision tick, plus nightly reflection | one chosen action + one line of inner thought (structured JSON) | volume — this is the whole cost of the game |
| **Mock** | none — heuristic | dev, tests, scenario validation, fallback | same output shape as Citizen | free |

The interface is identical for Citizen and Mock: `decide(context) → Decision`. Everything downstream is brain-agnostic, the same idea as unwatched.world's "bring your own brain".

---

## 1. Architect

The Architect runs two jobs, back-to-back, from the prompts in `prompts/`:

### 1a. Scenario generation (`prompts/architect-scenario.md`)

Input:
- the scenario schema (`docs/SCENARIO.md`)
- the **scenario ledger**: one line per previous scenario — setting, pressure type, ending shape, the social question it tested. This is the uniqueness mechanism: the Architect is told what has been done and is required to differ on at least two axes.
- a **social question** to design for (chosen by us, or by the Architect from a bank, or by the community). A scenario without a question is a story; with one it is an experiment.
- hard constraints: 72 h clock, 20–40 citizens, 3–7 scheduled events (some seed-dependent), 2–4 ending choices with pull weights, every citizen has a name/want/fear/traits/lean.

Output: a scenario JSON that **must pass the validation gauntlet** below before it is ever run with paid citizens.

### 1b. Decision-engine compilation (`prompts/architect-decision-engine.md`)

This is the part that makes cheap citizens act well. The Architect reads the accepted scenario and writes a **decision engine**: a data file the rules engine and the Citizen prompt both consume. It contains:

| Section | What it is | Who uses it |
|---------|------------|-------------|
| `worldFacts` | ≤ 12 bullet facts every citizen knows (what the clock means, where things are, what's scarce) | Citizen prompt (cached prefix) |
| `actionVocabulary` | the closed set of actions in this world, each with preconditions and effects in engine terms | Rules engine (legality), Citizen prompt (menu) |
| `archetypes` | 4–8 named behavioural profiles keyed on trait ranges, each with 3–5 *heuristics* ("a Loyalist under pressure seeks the person they trust most before deciding") | Rules engine (candidate ranking), Citizen prompt (persona line) |
| `pressureCurve` | how deadline awareness should shift priorities at hour 0 / 24 / 48 / 66 / 71 | Rules engine (candidate weights) |
| `reflectionQuestions` | 3 questions a citizen answers at each nightly reflection, designed to surface the social question | Citizen (reflection call) |
| `exemplars` | 6–10 few-shot examples of `context → decision` in this world's voice, covering each archetype | Citizen prompt (cached prefix) |
| `tripwires` | states the Architect predicts will be interesting (e.g. "if any two citizens with affinity > 0.7 choose different endings") — logged when hit | Archive |

**Why this works:** the Flash model never reasons from a blank page. Every hard question — what matters in this world, what a person like this would weigh, how urgency should feel at hour 60 — was answered once by the Architect and is now a *cached prompt prefix*. The Flash model's whole job collapses to: *given this persona, these memories, and these 3–5 pre-ranked candidate actions, pick one in character and say why in one line.*

---

## 2. Rules engine — the thing between the tiers

Deterministic TypeScript. No LLM. Responsibilities:

1. **World state** — locations, clock, resources, citizens (needs, traits, relationships, beliefs, memories, current lean on the ending).
2. **Legality** — from `actionVocabulary` preconditions, compute the legal action set for each citizen this tick. The citizen model *cannot* propose an illegal action; if it does, the output is rejected (see §4).
3. **Candidate shortlist** — rank legal actions using `archetypes` heuristics + `pressureCurve` + needs, and pass the **top 3–5** to the citizen. This is what keeps the cheap model on rails without making it a puppet: it always has a real choice, but never a stupid one.
4. **Context compression** — build the per-tick context in ≤ ~400 tokens beyond the cached prefix: who is here, last 5 memories, top-3 relationships, current lean, hours remaining, candidates.
5. **Apply + log** — apply the chosen action's effects, write the event to the timeline, store memory, check tripwires.
6. **Events** — fire scheduled/seeded scenario events; update beliefs of citizens present.
7. **Ending** — at hour 72, resolve each citizen's final choice from lean + pull weights; freeze the archive.

Decision cadence is a scenario parameter (`decisionEveryHours`, default 3 → 24 decisions per citizen per world). Between decisions, the engine continues the chosen action.

---

## 3. Citizen (Flash tier)

Prompt structure (`prompts/citizen.md`) — ordered for **prefix caching**, stable parts first:

```
[cached, per world]   worldFacts · actionVocabulary (names + one line each) · exemplars · output schema
[cached, per citizen] persona: name, want, fear, traits, archetype line + its heuristics
[fresh, per tick]     hour / hours left · location + who is here · last 5 memories · top-3 relationships
                      · current lean · CANDIDATES (3–5, pre-ranked) · "choose one"
```

Output — strict JSON, nothing else:

```json
{ "action": "<candidate id>", "target": "<citizen id | location id | null>", "thought": "<≤ 25 words, first person>" }
```

Nightly reflection (hours 24, 48) is a second, slightly larger call: the citizen answers the three `reflectionQuestions` and may update `lean` and one belief. Same JSON discipline.

**Temperature 0, fixed seed where the API supports it.** Not for determinism (see §5) but to reduce variance so that population differences come from the world, not the sampler.

---

## 4. Validation and fallback

Every Citizen output passes through:

1. JSON parse → on failure, one retry with the error appended; then **Mock** decides and the tick is flagged `fallback: parse`.
2. `action` ∈ candidates → else fallback flagged `fallback: illegal`.
3. `target` satisfies the action's preconditions → else fallback flagged `fallback: target`.

Fallback rate is a first-class metric in every archive. If it exceeds **2 %** for a world, the decision engine is considered broken and is sent back to the Architect with the failing contexts attached (a repair call — the Architect's third job).

---

## 5. Determinism, replay, and forking with a non-deterministic brain

The engine is deterministic. The Citizen tier is not. We resolve this by logging, not by pretending:

- Every LLM call is written to `archive/<run>/calls.jsonl` as `{ hash(prompt), response }`.
- **Replay** of a run reads responses from the log. Byte-identical archive, zero spend.
- **Fork** replays from the log until the first tick whose prompt hash is not in the log (because state has diverged), then goes live. The hour of first divergence is recorded — that is the "where did the timelines split" number the archive shows.
- **Experiments** (N seeds) always go live; the seed drives the engine's RNG (events, initial placement, NPC generation), not the model.

Consequence: a finished world costs nothing to re-read, re-render, or re-analyse, forever.

---

## 6. Cost model

Per world: `citizens × (72 / decisionEveryHours) + citizens × 2 reflections` Citizen calls.
At 30 citizens, cadence 3h: **720 decisions + 60 reflections ≈ 780 calls**.

Per call, with prefix caching: ~1.5–2.5 k cached prefix + ~400 fresh input + ~60 output tokens. Order of magnitude: **~1 M input tokens (mostly cached) and ~50 k output tokens per world** — cents on a Flash-class model. Plug the current price sheet into `pnpm run cost <scenario>` (piece 7) rather than trusting this paragraph.

Levers if it ever matters: raise `decisionEveryHours`; let Mock handle low-stakes ticks (nothing nearby, no pressure) and Flash the rest; shrink the shortlist to 3.

---

## 7. Scenario validation gauntlet (before any paid citizen sees it)

A generated scenario is accepted only if:

1. **Schema** — validates against `docs/SCENARIO.md`.
2. **Runs** — completes 72 h with the Mock brain, 20 seeds, no engine errors.
3. **Diversity** — no ending choice takes > 80 % or < 5 % of citizens across the 20 seeds. (A world where everyone obviously boards is not an experiment.)
4. **Novelty** — differs from every ledger entry on ≥ 2 of: setting, pressure type, ending shape, social question. Checked by a second Architect call in critic mode, blind to the generating prompt.
5. **Legibility** — the Mock-brain archive's `record.md` reads coherently to a human (the human checkpoint).

Fail → the Architect gets the failure report and regenerates (max 3 attempts, then a human picks from the ledger's runner-ups).

Only then is the decision engine compiled, and only then does a world go live with Flash citizens.

---

## 8. What this means for "unique and well thought out"

Uniqueness is not a property of the prompt; it is a property of the **pipeline**: ledger in, novelty critic out, diversity test in the middle. The prompt's job is to make the Architect *design an experiment*, not write a setting. See `prompts/architect-scenario.md` — the social question comes first, the setting is derived from it.
