# Fork

> This page documents the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; see [LIVE.md](LIVE.md).

A fork is the same world with one thing different, plus a diff that says where the two timelines parted and what that changed.

```bash
pnpm world last-ferry --seed 7                                   # the parent
pnpm fork last-ferry-s7-mock --seed 8                            # same people, different dice (the archive keeps the concrete cast, generated citizens included)
pnpm fork last-ferry-s7-mock --swap mara                         # a different person in Mara's seat (same role and home; her ties go with her)
pnpm fork last-ferry-s7-mock --vary event:tickets-short.at=45    # one event moved (any single-value --vary spec from docs/EXPERIMENTS.md)
pnpm fork last-ferry-s7-mock --vary citizen:tomas.traits.loyal=0.2
```

The child is written to `archive/<parent>--fork-<what>/` with its own `record.md`, and a **`fork.md`**:

1. **Where the timelines part** — the first hour whose world fingerprint (everyone's place, lean, beliefs, ties, commitment) differs, **what is different at that hour** (the concrete state differences, largest first: "Captain Hale ↔ Chief tie 0.65 → 0.62"), and the first notable moments that exist in only one of the two worlds from then on. A swap splits at hour 1; a changed trait splits at the first hour it changed a decision; an event moved from hour 40 to 52 splits at hour 40 (when it *would* have fired).
   The parent's hour-by-hour state is not stored — the parent is deterministic, so `fork` re-runs it (50 ms) and refuses if the engine no longer reproduces the recorded fingerprints.
2. **Brain calls** — how many were replayed from the parent's `calls.jsonl` and how many ran live. The replay key is the citizen's persona + the world's state *at the moment of the call* (down to the last applied action) + the choices on the table, so a call is served from the log only when the prompt would be byte-identical; the first live call is the divergence. (The mock brain makes no calls.)
3. **Ending** — parent vs child, per choice.
4. **Who ended differently** — each citizen whose final choice flipped, with the cause on each side.
5. **Threads that diverged** — relationships that ended at a different standing, with both reasons.
6. **Events that went differently** — fired/skipped, hour, reach.
7. **Tally hour by hour** — parent → child.

`record.json` carries the exact scenario the world ran (variants and swaps included) and its `parent` (run id, change, first divergence, and the full `lineage` back to the root), so forks of forks are fine.
