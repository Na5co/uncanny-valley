# Running with models

> This page covers the model commands of the original 72-hour engine the project grew from. The live site runs on `src/chronicle` and `src/live/worker.ts`; its models and budget are in [LIVE.md](LIVE.md) and [DEPLOY.md](DEPLOY.md). The client, the meter and `config/prices.json` described here are shared by both.

Everything in this repo runs without a key on the **mock** brain. These commands need a model, or pretend to call one:

| command | model | what it does |
|---|---|---|
| `pnpm architect --question "…"` | Architect (slow, smart — `VALLEY_ARCHITECT_MODEL`) | generates a scenario, runs it through the validation gauntlet (static rules + 20-seed soak: reach, ending split), asks a novelty critic, compiles the decision engine, appends the ledger. Up to 3 attempts, each fed the previous failure report. |
| `pnpm world <scenario> --brain flash` | Citizen (cheap, fast — `VALLEY_CITIZEN_MODEL`) | every citizen decides through the model, fed the decision engine as a cached prefix (`prompts/citizen.md`). Output is validated against the candidates; one retry, then the mock decides and the tick is flagged. Editions at h24/48/72 are written by the same model. |
| `pnpm world <scenario> --brain scripted` | none | the **same prompt/parse/validate/replay/cost path** with canned answers (the mock's choice rendered as JSON, with a 1 % fault rate to exercise retries and fallback). For plumbing tests and for reading exactly what the model would be sent. |
| `pnpm chronicle <scenario> --brain flash` | Citizen (`VALLEY_CITIZEN_MODEL`) | one fifteen-year run of the chronicle engine the live site uses, every person deciding through the model; no director, teller or Architect (`docs/CHRONICLE.md`). |
| `pnpm architect --dry-run` | none | writes the assembled Architect prompts to `scenarios/generated/dryrun/` without calling anything. |
| `pnpm architect --llm scripted` | none | runs every pipeline stage with canned answers (a re-skinned fixture, a canned novelty verdict, the reference engine). |

## Setup

```bash
cp .env.example .env      # add DEEPSEEK_API_KEY; base URL and model ids are overridable
# config/prices.json carries DeepSeek's peak rates; put in your provider's rates if you use another model
pnpm cost last-ferry      # estimate for one world: calls, cached/fresh/output tokens, $ at your rates
pnpm architect --dry-run  # read the prompts before spending anything
```

Another OpenAI-compatible chat-completions endpoint works if it accepts, or ignores, `response_format`, `seed` and `reasoning_effort: "none"`. Change the base URL (`VALLEY_LLM_BASE_URL`), the model ids and `config/prices.json`. The key is `DEEPSEEK_API_KEY` whatever the provider (`VALLEY_LLM_API_KEY` is read only when `DEEPSEEK_API_KEY` is not set at all). The client refuses to call a model that has no non-zero price in `config/prices.json`, unless `VALLEY_ALLOW_UNPRICED=1`. JSON mode (`response_format: json_object`) is requested, and cached-prompt token counts are read from `usage.prompt_cache_hit_tokens` / `prompt_tokens_details.cached_tokens` when the provider reports them.

## Spend safety

- A **meter** counts every call's tokens and cost at `config/prices.json` rates; a run stops with an error when it crosses `VALLEY_SPEND_CAP_USD` (default $2).
- Every call is logged to the archive's `calls.jsonl`: one line per decision/reflection with the replay hash, hour, citizen, model, summed usage, raw response, fallback reason — and, when a reply was rejected and retried, an `attempts` list with each attempt's usage and raw text. `pnpm cost <run-id>` reads it back.
- If the model layer fails mid-world (cap crossed, endpoint down after retries), the rest of the world runs on the mock brain and the archive's `brain` field says from which hour; the archive is written before the edition calls, so a paid world is never lost.

## Where the model's words go

Every decision's `thought` is private and kept as the citizen's own last line, shown back to them in the next prompt ("h44, you thought: …") so the voice carries between ticks. On a `talk`, `confront` or `share` the model also returns `say` — the words the other person hears: the listener remembers it (`Dov: "Mara, are you on that ferry or not?"`) and sees it in their own prompt; it appears in both diaries, on the feed's tie beats and rumour beats. Reflection `answers` are remembered (level 2 → diaries) and quoted back the next night ("Last night you told yourself: …").
- Forks replay identical calls from the parent's log at zero cost (`docs/FORK.md`); `pnpm cost` shows replayed vs live.

## What the decision engine changes

With `<scenario>.engine.json` next to a scenario (hand-written like `scenarios/last-ferry.engine.json`, or compiled by the Architect):
- the rules engine uses its **pressure curve** instead of the default;
- each citizen's **archetype** `candidateBias` nudges the candidate ranking, and its one-liner + heuristics are the citizen's persona prefix;
- **tripwires** are evaluated every hour and appear as `Watch: …` beats (and on the feed's watch line);
- the citizen prompt's cached prefix is the engine's `worldFacts`, `actionVocabulary`, and `exemplars`.

Without one, the mock brain runs as before and the flash brain uses a default prefix derived from the scenario.

## Fallback rate

`record.md`'s header shows the fallback rate; `pnpm world … --brain flash` prints calls / retries / fallbacks. Above **2 %** the decision engine is considered broken (`docs/BRAINS.md §4`): send the scenario back to the Architect with the failing contexts (`calls.jsonl` lines with `fallback` set).
