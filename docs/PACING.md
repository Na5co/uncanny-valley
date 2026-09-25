# Pacing & legibility

*This page documents the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; see [LIVE.md](LIVE.md).*

> A viewer who opens the world at a random moment must, within 10 seconds, know:
> **what's at stake, how long is left, who's about to do something, and why it matters.**

The original engine meets this at the engine level, so every scenario inherits it: a clock and scheduled events force people to act, and the feed ranks what happened by weight instead of reporting everything at equal weight.

---

## 1. Tempo

Sim time and real time are decoupled. `tempo.realMinutesPerHour` is a scenario parameter.

| Preset | Real minutes / sim hour | World lasts | Use |
|--------|-------------------------|-------------|-----|
| `live` | 0.75 | **54 real minutes** | default — one sitting, watchable end to end |
| `day` | 20 | 24 real hours | check in morning / lunch / evening |
| `instant` | 0 | seconds | experiments, validation, forks |

Default is `live`. A world produces ~100–150 notable beats (§3), so at 45 s per sim hour that is **a beat every 20–30 s**, with a dim line of ordinary life in any hour that has none. That is a feed, not a diary. Many worlds run per day; the ledger — and the experiment dataset — grows fast.

The Architect scenario cadence (every 72 h) is *independent* of world length: one scenario is played many times (different seeds, different player citizens) during its 72 h window before the next one arrives. This is also what gives the population statistics.

## 2. Density rules (enforced on every scenario)

The scenario validator rejects a scenario unless:

- **No dead air.** At least one scheduled event every 12 sim hours; none in the first 2 (let citizens meet) and at least one in the last 6 (the ending must be *contested*).
- **Escalation.** Each event has `stakes` 1–3; the running maximum must be non-decreasing. The last event must be stakes 3.
- **Forcing.** At least one event *removes an option* (a route closes, a resource runs out, a truth comes out). Revelation and scarcity are what make people choose.
- **Contested ending.** Diversity test from `BRAINS.md §7`: no ending choice > 80 % or < 5 % across 20 mock seeds.
- **Pressure curve.** The decision engine's `pressureCurve` must change candidate weighting at ≥ 4 breakpoints. A citizen at hour 65 must not behave like a citizen at hour 5.

## 3. Beats, not logs

The engine classifies every applied action/event into a **beat level**. The feed shows level ≥ 2. Level 1 goes only to the archive.

| Level | Name | Examples |
|-------|------|----------|
| 1 | routine | rest, work, walk, small talk that changed nothing |
| 2 | notable | relationship crosses ±0.3 / ±0.6, a belief spreads to a new person, a citizen's lean changes, a resource crosses a threshold |
| 3 | turning point | scheduled event fires, tripwire hits, alliance/estrangement forms (affinity flips sign), a citizen commits to an ending, a citizen acts *against* their own lean |

Each beat is rendered as a **headline + one-line thought** (the Flash model's `thought` field), e.g.

> **Hour 51 · Tomas confronts Mara at the harbour.** *"If she's leaving, I want to hear it from her."* — Tomas ↔ Mara: allies → estranged.

No prose paragraphs in the feed. Prose lives in the newspaper editions and the archive.

## 4. The stakes board (always visible)

Fixed panel, updated every tick:

1. **Clock** — hours left, next known event (if public), current pressure phase name from the decision engine.
2. **The question** — the ending prompt and a **live tally of current leans**, per choice. It moves. Watching it move is the game.
3. **Threads** — the top 5 relationships by absolute change in the last 12 h, each with a 3-word status (`allies → strained`).
4. **Watch for** — the Architect's tripwires phrased as hints ("Two of the four loyalists are now leaning opposite ways").
5. **Your citizen** — if the viewer owns one: location, lean, last thought, top tie.

## 5. Editions

At hours 24, 48 and 72 the Flash model writes a **newspaper edition**: ≤ 150 words, 3 headlines, one quote. Built only from level ≥ 2 beats. The hour-72 edition is the archive's cover.

## 6. Legibility rules for the engine

- Every citizen has a **role** (baker, deckhand, heir) shown next to their name, always. Names alone are noise at 30 people.
- Every relationship has a **why** string (set at creation, updated on sign flip). "Tomas ↔ Mara (estranged: she chose the ferry)" not a number.
- Every belief is a **sentence** ("the ferry has been cancelled"), and the feed says who told whom.
- Every ending choice has a **label a stranger understands** ("Board the ferry" / "Stay in Halden").

## 7. What the viewer can do (unchanged, deliberately small)

- Add a citizen during the **boarding window** (first 2 sim hours) — name, want, fear, traits.
- Watch. Follow a thread. Follow a citizen.
- At the end: read the archive, fork it, compare it to the other runs of this scenario.

No mid-world intervention in the MVP. Dynamism comes from the world, not from the viewer poking it.
