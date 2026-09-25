# Chronicle — fifteen years in sixty seasons

> This is the simulation the live site runs (`src/chronicle`), played from the command line. The site itself (a season every twenty minutes on Cloudflare, with the director, the teller and the Architect) is described in [LIVE.md](LIVE.md).

**One line:** the same town, the same people, fifteen years of dilemmas compressed into sixty seasons. Nobody votes at the end. What you get instead is a **journey for every person**: what they were facing, what they chose, what it cost, and what killed them.

This is the social-experiment mode. The 72-hour "choice" worlds (`docs/SCOPE.md`) ask *what does the town decide?* A chronicle asks *what does a person become?* — and it lets the dice answer. Some people turn sleazy, some turn good, some go to work for fifteen years and never do anything the town remembers. All three are meant to happen in the same run.

```bash
pnpm chronicle the-valley --seed 5     # runs it (mock brain, < 3 s), prints the verdicts, writes archive/the-valley-s5-mock/
pnpm site                              # rebuilds archive/index.html; open the-valley-s5-mock/index.html for the replay + journeys
```

## The clock

- A chronicle scenario has `years` (10–15). Each year is four **seasons** (spring, summer, autumn, winter) — the tick. Fifteen years = 60 ticks.
- The archive viewer (`pnpm site`) plays a season every **30 seconds** by default (20 when the town has more than 14 people), so fifteen years take 20 to 30 minutes. At the 60 s setting they take an hour; 0.5, 2 and 10 s are for skimming. The live site plays a season every twenty minutes.
- Everything that happens in a season is decided in that season; nothing carries over except the state it left behind (health, food, money, a roof, a grudge).

## Each season, for each living person

1. **Life happens** (`src/chronicle/sim.ts` `season()`): the job pays, food costs what the supply says it costs, the household eats, health regenerates a little, winter hurts the roofless, the plague finds the weak, the dangerous jobs sometimes kill, the jobless sometimes find work, the old grow older. The **epochs** of the scenario (famine, plague, war, a hard winter, a boom, fire, flood…) move the supply and the odds for a few seasons each and are the world's weather — they arrive when the scenario says, with a little jitter.
2. **A situation is chosen** (`situationsFor`): there is no "nothing happens" — a quiet season is itself a four-way choice (every shift going / finish early and see someone / mend the roof / evenings at the tavern; the jobless: look for work / lean on someone / keep to the house), each with a small cost, a small gain, someone it touches, and an **evening** the world shows. Otherwise from the dilemma library, only those whose `when` flags all hold right now — `starving`, `hasFood`, `sick`, `poor`, `rich`, `employed`, `jobless`, `hasFamily`, `hasChildren`, `hasPartner`, `single`, `homeless`, `housed`, `adult`, `young`, `old`, `notOld`, `under45`, `fewChildren`, `wronged`, `known:thief`, `known:helper`, `epoch:<kind>`, `season:<n>`, `job:<id>`, `hardYear`. Weighted by `weight`; the same dilemma is not offered to the same person twice in five seasons (ten for some life events, twelve for an experiment). If a dilemma needs a **target** (`richer`, `poorer`, `nearby`, `single`, `partner`, `starving`, `sick`, `homeless`, `housed`, `rival`, `wrongdoer`, `thief`, `stranger`, `friend`) and nobody fits, it is not offered.
3. **The person chooses** (`ChronicleBrain.choose`). The mock brain sees only the situation and the option labels, and scores each option by `pull × traits/hunger/poverty/danger/family` **plus dice of ±0.35** — the same person in the same spot does not always do the same thing, on purpose. `--brain flash` puts the situation in front of the cheap model (`prompts/chronicle-citizen.md`, `src/chronicle/brain.ts`) with who the person is, how he or she stands this season, what stays with him or her from earlier years, the last three things that happened and the last four thoughts, and the options, and gets `{option, thought, because}` back; the thought lands on the journey line and `because` is shown as what decided it. `--brain scripted` runs that exact path with the mock's answer and no key, and prints the token counts. Seasons with one option never call the model. Same client, meter, spend cap and `calls.jsonl` as the choice worlds (`docs/LLM.md`).
4. **The outcome rolls** (`outcomes[]`, chances sum to 1): the same choice can go well or badly. Stealing the wallet can feed the children for a season or get you caught and marked `known:thief`. Nursing the sick can save them or infect you.
5. **Deltas apply, deeds are recorded**: `self`, `target`, `world` deltas to health/food/money/mood/home/job/partner/children/supply; `move`, `leave`, `die`, `targetDie`. A `deed` carries `harm` and `help` weights and whether it was **witnessed** — unwitnessed harm does not reach reputation, but it is still in the journey.
6. **The journey gets a line**: `Year 6, autumn · <situation> → <option> — <outcome>` plus the deed chip and the thought, if any. Epochs and life events (a birth, a marriage, losing the job, a death) are lines too.

## How people die

- **Hunger** — food below zero for a season costs health; at zero health you are dead.
- **Exposure** — no roof in winter costs health, twice as much in a `winter` epoch.
- **Sickness** — `plague` epochs infect with probability `0.04 × severity × (1.4 − health)`; the sick lose health each season until they recover or don't.
- **Violence** — recruiters, looting, revenge, denunciation, the hanging of a thief someone chose to give up. All of these are choices somebody made.
- **Accidents** — every job has a `risk`; the pit and the quarry take people.
- **Old age** — only for the very old (72 and over), and only when nothing else explains the death.
- **Childbirth** costs the mother a season of health. It kills only where a town's own dilemma names it as the cause.

Deaths are attributed: `cause` is one of `hunger | exposure | sickness | violence | accident | old age | childbirth`. The verdicts, the population chart and the people table all use it.

## What the archive adds

`archive/<id>-s<seed>-<brain>/` has the usual `record.json` / `record.md`, and:

- **`journeys.md`** — every person's timeline, the thing you open when you want to know *how did they end up here*.
- **Verdicts** (`src/chronicle/archive.ts` `verdicts()`): the most harm, the most help, the quietest life, the first death, the deadliest season, the betrayal that killed, the sacrifice, and survivors vs the dead (mean harm and help of those who lived against those who didn't).
- **The ledger**: worst ten deeds and kindest ten, with "(nobody saw)" where nobody did.
- **Population by season**: alive / dead / gone / sick / starving / homeless, with epochs shaded.

The viewer (`pnpm site`) leads with the living town (`docs/WORLD3D.md`: people at work, deeds acted out, **▶ watch** on any journey to replay one life with captions), then the verdicts and the chart, the replay board with the season label and the 3D town underneath (the dead disappear from the map; figures are coloured by status — thriving, getting by, struggling), and **Journeys** as an expandable timeline per person, worst-and-best first. The people table at the bottom is sortable by eye: harm, help, children, end.

## Writing a chronicle scenario

`scenarios/chronicle/<id>.json`, `"mode": "chronicle"`. See `the-valley.json`. Needed:

- `years`, `title`, `premise`, `locations` with `x/y` (the map), `paths`, `jobs` (`id, name, at, pay, risk`), `epochs` (`id, kind, at, jitter, severity, seasons, headline, fx`), `citizens` (named people with `role, age, home, job, traits, want, fear`), `fill` (how many generated people to add; the generator gives them names, ages, jobs and neighbours from the seed).
- Optional `dilemmas[]` — this town's own situations in the same format as the library (`src/chronicle/dilemmas.ts`, 23 everyday dilemmas shared by every town, plus the 13 experiments in `src/chronicle/experiments.ts`).

`pnpm validate <chronicle>` runs the static checks (`src/chronicle/validate.ts`: every id, flag, target, template, deed kind and cause is checked, outcome chances must sum to 1) and then a ten-seed soak on the mock: the town must neither die out in most seeds nor coast (10–85 % alive at the end), have at least three causes of death with none over 60 %, and every written dilemma must actually be offered.

### The Architect writes towns

```bash
pnpm architect --chronicle --question "Do the bold die first?"   # the smart model: a town, its hard years, its own dilemmas → validated + soaked → scenarios/chronicle/generated/<id>.json, on the ledger
pnpm architect --chronicle --dry-run                    # writes the assembled prompt (≈ 5k tokens), calls nothing
pnpm architect --chronicle --llm scripted               # the fixture re-skinned with one new dilemma, through the real validate/soak/retry path; no key
```

`prompts/architect-chronicle.md` gives the model the schema (a cut-down real town), the shared dilemma library (so it adds, not repeats), the ledger of towns already made, the dice when they are rolled (era, livelihood, knot, trouble, temperaments, tone; `--no-dice` leaves them out, and the live site always rolls them), and the design order: the four → the question → the town and its jobs → the years (a famine, a plague or war, a hard winter, a boom; spaced, severity 3 never stacked) → 4–6 dilemmas of this town with a harm on the table → a self-check against the soak. A failed validation or soak goes back with the report and the previous JSON; three attempts. Same client, meter and spend cap as the choice-world Architect (`docs/LLM.md`).

Templates in dilemma text and option labels: `{{target}}`, `{{partner}}`, `{{place}}`, `{{season}}`, `{{home}}`, `{{targetHome}}`. An option may carry `evening: work | home | tavern | chapel | square | visit` — where the person's evening goes that season; the scene plays exactly that, nothing is decided by the renderer. `quiet: true` on a dilemma renders its journey line as a sentence rather than situation → choice.

## Cycles — the experiment across many fifteen-years

```bash
pnpm cycle the-valley                # the next cycle: a fresh seed, archived like any run, and kept as a row in cycles/the-valley/cycles.jsonl
pnpm cycle the-valley --count 10     # ten back to back
pnpm cycle the-valley --every 60     # one an hour, for as long as it runs (Ctrl-C to stop); --brain flash for the model
pnpm history the-valley              # what the cycles add up to → cycles/the-valley/history.md
```

Each cycle row keeps: seed, run id, alive/dead/gone, deaths by cause, the verdicts (title + who), and every person's end, harm, help, children and the kinds of deed they did. `history` reads across them:

- **The odds** — extinction rate (cycles where nobody was left), mean alive/dead/gone, best and worst cycle.
- **What kills** — share of deaths by cause.
- **Who survives** — the named people's survival rate across cycles, their usual end, mean harm and help. (Ilse the publican lives through 84 % of fifteen-years; Olav, the old miner, through 68 %.)
- **Deeds and death** — the survivorship confound taken out: among people alive and still in town at the halfway season, the death rate afterwards of those who had done a kind of deed by then against those who had not, as a risk ratio with a 95 % interval and a z. (Every deed kind has its season — the war's loyalty, the famine's sacrifice — so a naive "did it ever" table only measures who lived long enough.) Rows whose interval spans ×1 are marked **within noise**; the section ends with how many rows clear it, so the table tells you when to stop running. Harm and help are reported per sixty seasons alive.

  **On the current code (mock brain, 100 cycles, cohort 2,530):** 10 of the 11 deed kinds clear noise. Violence (×2.52), theft (×2.58), betrayal (×1.74) and abandonment (×1.42) go with dying after year 8. So do rescue (×1.71), justice (×1.71), loyalty (×1.56), help (×1.45) and mercy (×1.42). Only gifts go with living (×0.72); sacrifice (×1.55) is within noise. Per sixty seasons alive, the dead did more harm than the survivors (1.21 vs 0.82) and about the same help (2.14 vs 2.07). This is the dice, so it describes the rules of this town, not what a model would choose.
- **Verdict regulars** — who keeps winning "the most harm" or "the first death".

That is the social experiment. Change one thing (a dilemma's pull, an epoch's severity, the brain) and run ten more.

## Economics, in one paragraph

A season's pay (`job.pay`, 0.06–0.12) against a season's costs: a roof (0.015), children (0.025 each, split between partners), and food — `need = 0.13 + 0.03/child` units at `price = 0.4 × (1.3 − supply)`, doubled in a famine. Supply sits around 0.6 and recovers 0.06 a season; a famine knocks it down by 0.45 × severity/3 and holds it there; the store is rationed at `supply × 0.3` a person, so in a famine nobody can buy enough whatever they have. A working household breaks even; lose the job or the harvest and the savings go first (`rich` is > 1.2 saved, `poor` is < 0.15), then the food (`starving` is < 0.12), then, at −0.16 health a season, the person. With these numbers, ten mock cycles of The Valley end with about 23 of 30 alive, 5 dead and 2 gone. Sickness is the largest cause of death at about 45 %, then accidents at about 35 %.

## Determinism

Same scenario, same seed, same brain → the same fifteen years, byte for byte. The RNG is forked per person and per season (`rng.fork("choose:<id>:<tick>")`), so adding a person does not reshuffle everyone else's dice.
