# The archive

> This page documents the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; see [LIVE.md](LIVE.md).

When a world ends it freezes into `archive/<scenario>-s<seed>-<brain>/`:

| file | what | who reads it |
|---|---|---|
| `record.md` | the readable record: outcome, three arcs, breaks, final edition, the beats grouped by pressure phase, how the tally moved, threads, a citizen table, editions, the event log | people |
| `diaries.md` | every citizen's unsealed diary: what they remembered as mattering, and the *because* attached to every change of mind | people, slowly |
| `record.json` | everything, including every beat, hourly tallies, per-citizen state, stats | `watch`, `fork`, `experiment`, viewers |
| `index.html` | the same record as a page: outcome bars, the tally chart with phases and events, arcs, breaks, a **replay** with the stakes board (play / scrub / tempo) and a **top-down map** (places and paths laid out from the scenario, every citizen as a dot coloured by lean — ring when committed — moving between places hour by hour, speech bubbles for what was said, a glow where an event fires, dashed lines for ties that moved), threads, citizens, editions, diaries. Self-contained — open it from disk or host it anywhere. `pnpm site` rebuilds every page plus `archive/index.html`, the gallery | people, in a browser |
| `calls.jsonl` | one line per LLM call `{hash, prompt, response}`; empty on the mock brain | replay and fork (`docs/BRAINS.md §5`) |

```bash
pnpm world last-ferry --seed 7          # writes the archive
pnpm watch last-ferry-s7-mock           # replay the feed at live tempo (45 s per sim hour, ~54 min)
pnpm watch last-ferry-s7-mock --tempo 2s --from 40   # 2 s per hour, start at hour 40
pnpm watch last-ferry-s7-mock --tempo instant        # dump the whole feed
```

`record.json` carries `frames` — one entry per hour with every citizen's place, lean, commitment and the lines spoken that hour — and `map` (locations, tags, paths, optional `x`/`y` placement from the scenario). That is all a 3D or game-engine scene needs: the same data drives the canvas map, and would drive a Godot/Unity/three.js view unchanged.

## Reading `record.md` in three minutes

1. **Outcome + final edition** — what happened, in numbers and three headlines.
2. **What to look at** — the pairs who were close and chose differently.
3. **The record** — only level ≥ 2 beats (`docs/PACING.md §3`), grouped by phase. `•••` are turning points.
4. **How the room moved** — the tally every 6 hours.
5. **Threads** — the ten relationships that moved most, with the reason attached to the tie.
6. **Citizens** — one row each: hour-0 lean → final choice, when they committed, how often they changed their mind, who they ended closest to.
7. **Diaries** (`diaries.md`) — per citizen, what they remembered as mattering, with a cause on every change of mind.

The feed (`watch`) shows the same beats with a **stakes board** on top: clock, phase, the live tally as bars, the threads that moved in the last 12 hours, and what to watch.
