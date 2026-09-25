# Scenario format (v0)

> This page documents the scenario format of the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`, whose towns use the chronicle format in [CHRONICLE.md](CHRONICLE.md); see [LIVE.md](LIVE.md).

A scenario is a single JSON file in `scenarios/<id>.json`. The engine never knows what a "ferry" is; everything world-specific is data here. The Architect writes this file; humans can too. Validation rules are in `BRAINS.md §7` and `PACING.md §2`, and the validator tells you exactly which field broke which rule.

## Write one in 15 minutes

```bash
cp scenarios/last-ferry.json scenarios/my-town.json   # start from a fixture
pnpm validate my-town                                 # path-annotated errors, fix until ✓
pnpm world my-town --seed 1 --beats                   # watch one run
pnpm experiment my-town --seeds 10                    # does the ending split? does the question get an answer?
```

Order of work that goes fastest: **question → ending choices + pulls → events → a handful of named citizens → `fill` for the rest.** You do not need to write 20 citizens by hand; `fill` generates the rest deterministically from the seed.

### Location tags the engine understands

| tag | effect |
|-----|--------|
| `public` | citizens with nobody around drift here |
| `social` | sociable citizens are drawn here; talking happens anywhere people are co-located |
| `work` | `work` action is available here (raises `means`) |
| `rest` / `private` | default homes for `fill` citizens |
| `exit` | informational for now (the archive labels it); it does not move anyone |

### Where people are, and when — put events where the people are

Citizens move on a daily rhythm. Whether your event reaches anyone depends on **its hour-of-day and its location's tags**:

| sim hours (each day) | where citizens are |
|---|---|
| 06–17 `workday` | at `work` locations if their `means` is low, otherwise drifting to `public`/`social` places |
| 17–23 `evening` | at `social` locations (the sociable get there first), or with their top tie |
| 23–06 `night` | at `rest`/`private` locations — their own home if it is one |

`pnpm validate` runs 20 mock seeds and prints **event reach** — the mean number of citizens present when each event fires — and warns when an event fires into an empty room. Fix by moving the hour (`at`), the place (`where`), or using `"where": "all"` for news that everyone hears regardless. A load-bearing rumour (one your `pull` weights depend on) should reach at least a third of the cast, or be spread through `talk` from a well-attended room.

### Validator rules in one place

- Cast (named + `fill.count`) is 20–40.
- Every `home`, `where`, `paths` entry, `ties.to`, `belief:<id>`, `resource` id must exist. All locations must be reachable.
- 2–4 ending choices; `pull` keys are `bonds | means | mood | trait:<sociable|bold|loyal|restless> | belief:<id> | fear:<slug> | want:<slug>`.
- Events: none before hour 2, first by hour 12, **never more than 12 h between events**, last event at `hours-6 … hours-2` with `stakes: 3`, `stakes` never decrease over time, at least one `removesOption: true`.
- `socialQuestion.measure.splitBy` is `trait:<name> | topTieAffinity | belief:<id> | exposedTo:<eventId> | lean0` (`lean0` = the citizen's lean at hour 0, i.e. did the undecided end up differently from the decided).
- Warnings (not errors): fewer than 40 % of named citizens undecided; fewer than two events with `chance < 1` or `jitterHours > 0`; a choice whose pull ignores traits, beliefs or bonds; **an event whose mean reach over 20 seeds is under 3 citizens or 10 % of the cast**.

```jsonc
{
  "id": "last-ferry",                       // slug, unique across the ledger
  "title": "The Last Ferry",
  "premise": "Halden's mine closed a month ago. The last ferry to the mainland leaves in three days. Everyone must decide whether to be on it.",   // 2–3 sentences, shown to viewers

  "socialQuestion": {
    "text": "Do strong social bonds keep people in a place that is dying?",
    "hypothesis": "Citizens whose top tie has affinity > 0.6 will choose 'stay' at least 2× the rate of citizens with no tie > 0.3.",
    "measure": { "outcome": "ending", "splitBy": "topTieAffinity", "buckets": [0.3, 0.6] }   // outcome: "ending" | "changedMind"
  },

  "fingerprint": {                          // one line per axis; written to the ledger; novelty is judged on these
    "setting": "dying industrial town, coastal, present day",
    "pressure": "departure deadline + economic collapse",
    "endingShape": "binary leave/stay",
    "dynamic": "loyalty vs. self-preservation"
  },

  "clock": { "hours": 72, "decisionEveryHours": 1, "reflectionAt": [24, 48] },
  "tempo": { "preset": "live" },            // live | day | instant, or { "realMinutesPerHour": n }
  "boardingHours": 2,                       // viewers may add citizens until this hour

  "locations": [
    { "id": "harbor",  "name": "Harbour",       "tags": ["public", "exit"] },
    { "id": "tavern",  "name": "The Lamp",      "tags": ["public", "social"] },
    { "id": "mine",    "name": "Old Mine Gate", "tags": ["work"] },
    { "id": "homes",   "name": "Row Houses",    "tags": ["private", "rest"] }
  ],
  "paths": [["harbor", "tavern"], ["tavern", "homes"], ["homes", "mine"], ["tavern", "mine"]],

  "resources": [                            // optional; scarcity is a first-class pressure
    { "id": "ferryTickets", "name": "ferry tickets", "initial": 18, "perHour": 0, "visible": true }
  ],

  "beliefs": [                              // sentences citizens can hold with confidence 0–1; spread by talking
    { "id": "ferryCancelled", "text": "the ferry has been cancelled", "initial": 0 },
    { "id": "buyerComing",    "text": "someone is coming to buy the mine", "initial": 0 }
    // optional "about": "<citizen id>" — a rumour about a person; they know the truth and never spread or adopt it
  ],

  "events": [
    { "id": "rumour-buyer", "at": 18, "jitterHours": 4, "chance": 0.7, "stakes": 1,
      "where": "tavern", "headline": "A stranger asks about the mine deeds.",
      "text": "A man nobody recognises buys a round and asks who holds the deeds to the mine.",
      "effects": { "belief": { "buyerComing": 0.5 } } },

    { "id": "tickets-short", "at": 40, "jitterHours": 2, "chance": 1, "stakes": 2,
      "where": "harbor", "headline": "The ferry has eighteen berths. Not everyone will fit.",
      "text": "The harbourmaster posts the manifest. Eighteen berths.",
      "effects": { "resource": { "ferryTickets": 0 }, "mood": -0.2 },
      "removesOption": false },

    { "id": "ferry-cancelled-rumour", "at": 50, "jitterHours": 3, "chance": 0.6, "stakes": 2,
      "where": "tavern", "headline": "Word goes round: the ferry isn't coming.",
      "text": "Someone's cousin on the mainland says the ferry company has folded.",
      "effects": { "belief": { "ferryCancelled": 0.8 } } },

    { "id": "ferry-confirmed", "at": 66, "jitterHours": 0, "chance": 1, "stakes": 3,
      "where": "all", "headline": "The ferry is in the bay. It sails at dawn.",
      "text": "Lights on the water. The harbourmaster rings the bell.",
      "effects": { "belief": { "ferryCancelled": -1 } },
      "removesOption": true,
      "fx": "storm", "fxHours": 4 }               // optional: what the 3D view does when this fires — rain | storm | quake | fog | fire | snow | flood | eclipse | aurora | swarm | silence
  ],

  "ending": {
    "prompt": "The ferry sails at hour 72.",
    "choices": [
      { "id": "board", "label": "Board the ferry",
        "pull": { "trait:restless": 0.5, "means": 0.3, "belief:ferryCancelled": -1.0, "bonds": -0.4, "fear:beingForgotten": 0.3 } },
      { "id": "stay",  "label": "Stay in Halden",
        "pull": { "bonds": 0.7, "trait:loyal": 0.4, "belief:buyerComing": 0.5, "belief:ferryCancelled": 0.6, "means": -0.2 } }
    ]
  },

  "citizens": [
    { "id": "mara", "name": "Mara Lind", "age": 31, "role": "baker",
      "want": "open her own shop somewhere people will remember her",
      "fear": "being forgotten",
      "traits": { "sociable": 0.7, "bold": 0.5, "loyal": 0.6, "restless": 0.7 },
      "home": "homes", "lean": null,
      "ties": [ { "to": "tomas", "affinity": 0.5, "why": "he fixed her oven and stayed for tea" } ] },
    { "id": "tomas", "name": "Tomas Reyk", "age": 44, "role": "mine mechanic",
      "want": "to be needed",
      "fear": "leaving and finding out nobody noticed",
      "traits": { "sociable": 0.4, "bold": 0.3, "loyal": 0.9, "restless": 0.1 },
      "home": "homes", "lean": "stay",
      "ties": [ { "to": "mara", "affinity": 0.6, "why": "she is the only one who asks how he is" } ] }
    // 20–40 total; the Architect writes them all; viewers add more during boarding
  ],

  "fill": {                                 // optional: generate the rest of the cast from the seed
    "count": 14,
    "roles": ["miner", "fisher", "clerk"],
    "homes": ["homes"],                     // default: locations tagged rest/private
    "wants": ["to be left alone"],          // default: a built-in list
    "fears": ["having nothing"]
  },

  "playerSlots": 10
}
```

## Field notes

- **`pull`** keys are the only engine-known factors: `bonds` (mean affinity of top-3 ties, clamped 0–1), `means` (0–1 accumulated by working), `mood` (-1–1), `trait:<name>`, `belief:<id>` (confidence 0–1), `fear:<slug>` / `want:<slug>` (1 if the citizen's fear/want text camel-cases to that slug — "being forgotten" → `beingForgotten` — else 0). Final choice = argmax over choices of Σ pull·factor + 0.2 if it matches the citizen's lean + seeded noise of ±0.15. **Balance expected scores, not |pull| totals**: `bonds`, `means`, `mood` and traits are usually 0.2–0.7, so a choice loaded with positive weights on them wins by default; a choice with mostly negative weights only "wins" when those factors are near zero. `pnpm validate` prints the pooled ending split over 20 seeds — if one choice is > 80 % the scenario is rejected. New factors are an engine change, not a scenario change — on purpose.
- **`means`** starts at 0.2 and rises by 0.12 per hour of `work` (capped at 1), so a citizen who works a full first day is near 0.7 and one who never works stays at 0.2. `mood` starts at 0 and moves with events and conversations.
- **Events** apply to citizens *present* at `where` (or everyone for `"all"`). A rumour at the tavern only reaches whoever is in the tavern that hour — which is the point. `effects.belief` and `effects.mood` are deltas to those present; `effects.resource` is a delta to the world.
- **`jitterHours` / `chance`** are resolved from the run seed. This is what makes "same scenario, different seed" a real experiment and not a replay.
- **`removesOption`** is what the density validator looks for (`PACING.md §2`).
- **Traits** are fixed at four for v0: `sociable`, `bold`, `loyal`, `restless`. Archetypes in the decision engine are defined over ranges of these.
- **Beliefs** spread through `talk` actions with a probability set by the decision engine's archetype heuristics; the feed always records who told whom.
- The `socialQuestion.measure` block is what the experiment runner (`SCOPE.md` piece 4) reads to produce its table. If it isn't answerable from archive metrics, the scenario is invalid.
