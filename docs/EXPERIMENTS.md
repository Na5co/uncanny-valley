# Experiments

> This page documents the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; see [LIVE.md](LIVE.md).

A single run is an anecdote. `pnpm experiment` runs the same scenario across many seeds — and, with `--vary`, across variants of the scenario — and answers its social question with numbers you can reproduce.

```bash
pnpm experiment last-ferry --seeds 50                       # the scenario's own question, 50 seeds
pnpm experiment last-ferry --seeds 50 --vary loyal          # same, with everyone -0.2 / 0 / +0.2 loyal
pnpm experiment last-ferry --seeds 50 --vary rumour-at      # the rumour 12 h earlier / as written / 12 h later
pnpm experiment adrift --seeds 30 --vary event:land-or-not.chance=0.05,1
pnpm experiment adrift --seeds 30 --vary citizen:bosun.traits.bold=0.2,0.9
pnpm experiment festival --seeds 30 --vary belief:landSale.initial=0,0.5
pnpm experiment adrift --seeds 30 --vary pull:mutiny.belief:captainHiding=0.4,0.8
```

## What you get

1. **Outcome by variant** — share of citizens per ending, and for every variant the **seed-paired change against the as-written scenario**: mean difference in points, 95 % CI, and how many seeds moved down↓/up↑. Same seeds under every variant is the design; the pairing is what makes a 3-point difference readable.
2. **Event variants** show how many seeds the varied event actually fired in and its mean reach. For timing/placement variants (`at`, `where`, `stakes`) the paired comparison is restricted to seeds where it fired in *every* variant (a rumour that never happened cannot have moved anyone). For `chance` variants firing *is* the treatment, so all seeds are paired. The tool prints which rule it used, and warns when a shift changes the hour of day or lands after the finale.
3. **Citizen variants** print a second block with the varied citizen excluded — the spillover on everyone else, separate from their own vote.
4. **Headline** — the largest paired change, in words. Cramér's V over the pooled table is printed as a secondary number; it ignores the pairing and understates paired effects.
5. **Diversity** per variant.
6. **The social question** — the split table, measured **at hour 0** by default (`--split-at end` to see association with final state instead; the tool labels it as association, not cause). Override the question with `--split-by trait:loyal` (or `topTieAffinity`, `belief:<id>`, `exposedTo:<eventId>`, `lean0`) and `--buckets 0.4,0.7`. Buckets under 30 citizens are flagged.
7. **Paired change by bucket** — when `--vary` and a split coexist: the seed-paired Δ per bucket per variant. This is the interaction figure ("did the shock move the disloyal more than the loyal?") with its own CI and seed counts.
8. **`n` vs `people`** — `n` is citizen-outcomes (citizens × seeds); `people` is distinct citizens. Named citizens are the same person in every seed, so a bucket with n = 350 and people = 8 is a fact about eight individuals; read Cramér's V against `people`.
9. **`experiments/<scenario>-<options>-seeds<a>-<b>.json`** (the name encodes `--with`, `--vary`, `--outcome`, `--split-by`, `--exclude`, and the seed range; `--out` to choose) — with `--format md|csv` also a paste-ready table next to it. Contains — the command, seeds, paired statistics, and every run's per-citizen outcome with hour-0 traits and lean, so any analysis can be redone. Same seeds → identical file.

## `--vary` specs

| spec | meaning |
|---|---|
| `loyal` (or any trait) | `trait:loyal=-0.2,0,0.2` — shift the whole cast, named and generated |
| `trait:bold=-0.3,0,0.3` | explicit deltas |
| `<token>-at` | the event whose id contains `<token>` (highest stakes if several): 24 h earlier / as written / 24 h later — a day keeps the hour of day, so the room is the same size (falls back to ±12 h on short clocks) |
| `<token>-chance` | the same event never (0.05) / always (1) |
| `event:<id>.at=32,44,56` · `event:<id>.chance=…` · `event:<id>.stakes=…` | any event field |
| `belief:<id>.initial=0,0.5` | what people believe at hour 0 |
| `pull:<choice>.<factor>=0.2,0.8` | how much a factor pulls toward a choice |
| `citizen:<id>.traits.bold=0.2,0.9` | one named citizen's field (any dotted path) |
| `citizen:<id>.remove=false,true` | the world without that person — everyone else's traits and ties are identical (generated citizens are seeded per seat), so the difference is attributable to them |
| `--with <spec>` | a background edit applied to every variant, e.g. `--with trait:bold=-0.3 --vary citizen:aksel.traits.bold=0.6,1` = "one bold citizen in a timid town"; several `--with` compose in order |
| `--outcome ending\|changedMind` | override what is counted |
| `--exclude id,id` | leave citizens out of every tally (e.g. the ones you changed) |
| `clock.reflectionAt=24;48,24,48;60` | any top-level field; `;` separates list items |

Variants are pure data edits of the scenario; the engine and the seeds are identical, so any difference in outcome is caused by the change.

One `--vary` per run: variants are compared pairwise against the as-written scenario. Two questions are two runs.

## Reading the numbers honestly

- The paired CI is over seeds (each seed is one world), so citizens talking to each other inside a world does not inflate it; it uses Student's t, so a run restricted to 8 fired seeds gets an honestly wider interval. 30 seeds sees a 5-point change; 50+ sees 3.
- `experiment.json` stores `pairedByBucket` (variant × bucket × outcome), and `--format md|csv` exports both the outcome table and a long-format table of every bucket × variant × outcome with its paired Δ, so the interaction figure never has to be retyped.
- A split measured at the end (`--split-at end`) is association: ties and beliefs are themselves moved by the world. Hour-0 splits are the pre-treatment ones.
- `changedMind` excludes citizens who were undecided at hour 0 — "changed" means changed.
- A null result can be the scenario's: on the mock brain, a rumour that reaches 5 of 26 people, or one whose belief has a small pull weight, moves nobody whenever it lands. Check the `reach` column and the scenario's `pull` before blaming the runner — and `pnpm validate` shows reach per event before you run anything.
- The mock brain is deterministic and simple. Effects that survive on the mock are structural (they come from the scenario and the rules); the Flash brain (`docs/BRAINS.md`) adds texture, not a different physics.
