# Running your own copy on Cloudflare

Uncanny Valley runs as one Cloudflare Worker on the Workers **free plan**. It has no server to keep alive, no database and no build step. The worker is `src/live/worker.ts` and its configuration is `wrangler.toml`. What it serves, and why it is built this way, is in [LIVE.md](LIVE.md).

The only bill is the model: about $9 a month at the settings in the repository (see [The budget](#the-budget)).

The names below are the ones in `wrangler.toml`: the worker is called `afterparty` and the R2 bucket `afterparty-records`, identifiers left from the project's old name, and the KV binding is `ROOM`. You can keep them or change them, but if you change one, change it everywhere it appears in the commands below.

## What you need

- **Node 22.18 or later** and **pnpm** (the repository pins pnpm 11 in `package.json`). Node runs the TypeScript directly, and there are no dependencies to install.
- **A Cloudflare account** on the free plan, with **R2 enabled**. R2 is switched on once, in the dashboard, before the first bucket can be made. Cloudflare may ask for a payment method at that point even though this project stays inside the free allowance.
- **Wrangler**, Cloudflare's command line. It is not a dependency of the project. Every command here runs it through `npx wrangler`, which fetches the current version the first time.
- **A key for a model API.** The repository is set up for DeepSeek. Another OpenAI-compatible chat-completions endpoint works if it accepts, or ignores, `response_format`, `seed` and `reasoning_effort: "none"`. Change the base URL, the model ids and `config/prices.json` (see [The variables](#the-variables)).

Check the code before you start:

```bash
pnpm install     # nothing to download; it only wires up the scripts
pnpm test        # about 40 tests, 10 to 15 seconds
```

## 1. Log in

```bash
npx wrangler login
```

This opens a browser and gives wrangler access to your account.

## 2. Make the bucket and the namespace

```bash
npx wrangler r2 bucket create afterparty-records
npx wrangler kv namespace create ROOM
```

The second command prints an `id`. Open `wrangler.toml` and put **your** id in place of the one that is there. The id in the repository belongs to the project's own account, and a deploy with it fails.

```toml
[[kv_namespaces]]
binding = "ROOM"
id = "<the id wrangler printed>"
```

**R2 holds everything.** The running world, the bill, the story so far, every finished run and every drawn page live in the bucket. KV is only a fallback that is read when an object is missing from R2, for state written before the project moved to R2. The binding is still required, because the code reads it on every miss. Nothing new is written to KV.

While `wrangler.toml` is open, you may want to change:

- `name`: the worker's name. The site will be at `https://<name>.<your-subdomain>.workers.dev`.
- `bucket_name` under `[[r2_buckets]]`, if you made the bucket under another name.
- A custom domain, once the worker is up:

  ```toml
  [[routes]]
  pattern = "valley.example.com"
  custom_domain = true
  ```

## 3. Give it the key

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

Wrangler asks for the value and stores it encrypted with the worker. It never goes in `wrangler.toml` or in the repository. If the worker does not exist yet, wrangler offers to create it. The worker reads only `DEEPSEEK_API_KEY`, even when the endpoint is not DeepSeek. (`VALLEY_LLM_API_KEY` is a command-line alternative and the worker does not read it.)

## 4. Set the ops token

A handful of routes under `/ops/` spend money or change the run: play a season now, write a chapter now, write a new town, draw the pages. They answer only to a token, which you choose and keep as the R2 object `state/ops:token`:

```bash
TOKEN=$(openssl rand -hex 32)
printf %s "$TOKEN" | npx wrangler r2 object put afterparty-records/state/ops:token --pipe --remote
```

Keep `$TOKEN` in a password manager. Use `printf %s` exactly as written. `openssl rand -hex 32 | ...` would store the token with a newline on the end, and the worker compares the whole stored value, so no request would ever match it.

Send the token in a header when you call an ops route:

```bash
curl -H "Authorization: Bearer $TOKEN" https://<your-worker>/ops/draw
```

`?token=<token>` in the address also works, but a URL is written into the Workers logs (`[observability]` is on in `wrangler.toml`) and into browser history, so prefer the header. The comparison runs in constant time. With no token set, every `/ops/*` route answers `403`.

The routes, all behind the token:

| route | what it does | spends |
|---|---|---|
| `/ops/advance` | plays one season now instead of at the next clock firing. Refused in the minute either side of a firing. | a season |
| `/ops/draw` | draws every page into R2 now | nothing |
| `/ops/tellnow` | the teller's turn on the run in progress now, then draws the pages | yes |
| `/ops/tell` | tries the teller without keeping anything: `?year=N`, `?town=1` (the opening), `?muse=1` (the four's thoughts), `?who=<id>` (a portrait); add `&keep=1` to keep it | yes |
| `/ops/direct` | asks the director for this season's turn and shows it, without keeping it | yes |
| `/ops/newtown` | one attempt by the Architect at the next town; if it is accepted, it waits as `world:next` (a refused attempt is kept in `world:draft` with its report) | yes |
| `/ops/restart` | begins the run in progress again in the town waiting from `/ops/newtown`. **This throws away the current run and its story.** Refused near a firing and after a run has ended. | the first director turn and the opening |
| `/ops/retell?run=N&year=Y` | writes a finished run's chapter again (`year=0` is the opening, `end=1` the epilogue, `dry=1` shows it without keeping it) | yes |
| `/ops/redraw?run=N` | draws a finished run's pages again from what is kept | nothing |

Money spent through these routes is counted as a one-off and kept out of the monthly rate the budget is judged by.

An older copy kept the token as the KV key `ops:token` in `ROOM`. It is still read if the R2 object is missing. New copies should use R2 only.

## 5. Deploy

```bash
pnpm cf:deploy
```

This copies `web/` into `public/web/` (`pnpm build:assets`) and runs `npx wrangler deploy`. The worker, the bundled towns, the company of 25, `config/prices.json` and the Architect's prompt (`prompts/architect-chronicle.md`, bundled as text by the `[[rules]]` block) go up in one upload of about 560 KiB. The files in `public/web/` are served beside it as static assets.

Then open the site. The first visit finds no world, starts run 1 and answers with a page that says *This page is being drawn*. That page reloads itself every minute. The pages appear at the next drawing firing, at :07, :27 or :47 past the hour. After that, check:

- `/health` shows `"ok": true` and a `tick` that goes up every twenty minutes;
- `/ops` shows the model calls, how many fell back to the dice, and what it all costs as a monthly rate.

**If you change the code**, point the source link on `/about` at your own repository (it is in `aboutFilm` in `src/site/reading.ts`, under *What this is not*). The AGPL asks that a modified copy running as a public site offer its source to the people who use it.

## The variables

`[vars]` in `wrangler.toml`:

| variable | in the repository | what it does |
|---|---|---|
| `SCENARIO` | `the-many` | The town the first run starts in, and the fallback if no other town is available. `the-many` is The Lane with the four drawn from the company; `the-four` is a town with four fixed people. Any other value falls back to `the-many`. After the first run, towns come from the Architect. |
| `SEASON_MS` | `1200000` | How long a season is, in milliseconds (twenty minutes). The pages count down with it, the watchdog uses it, `/health` uses it, and so does the pause between runs. **It does not set the clock**: the cron does (see [The two crons](#the-two-crons)). |
| `BRAIN` | `flash` | Anything other than `mock` means the model decides for the four. `mock` puts them on the dice and also turns off the director, the teller, the four's thoughts and their last words. The Architect still writes new towns if a key is set. |
| `VALLEY_LLM_BASE_URL` | `https://api.deepseek.com` | The OpenAI-compatible endpoint every call goes to. |
| `VALLEY_CITIZEN_MODEL` | `deepseek-flash` | The model that plays the four. The director, the four's end-of-season thoughts and their last words use it too. |
| `VALLEY_ARCHITECT_MODEL` | `deepseek-v4-pro` | The model that writes each new town (the Architect) and writes the story (the teller). |
| `RUNS_PER_WORLD` | `1` | How many runs a town serves before the Architect writes another. `1` means a new town every run, `3` every third run, `0` never. The code's default when it is unset is `3`. |
| `NEW_WORLD_EACH_RUN` | not set | Optional. `off` stops the Architect: runs go on in the town already in use (or in `SCENARIO`). |

Both model ids must have non-zero rates in `config/prices.json`, which is bundled into the worker. The client refuses to call a model it cannot price, because the spend cap would then count nothing. To use another provider, change the base URL and the two ids, add the ids to `config/prices.json` with that provider's rates, and deploy again.

The command line has a few more variables, listed in `.env.example`. The worker ignores `VALLEY_SPEND_CAP_USD` (its caps come from `config/prices.json`) and `VALLEY_LLM_API_KEY` (it reads only the `DEEPSEEK_API_KEY` secret).

## The two crons

```toml
[triggers]
crons = ["*/20 * * * *", "7,27,47 * * * *"]
```

- **`*/20 * * * *`, the clock.** Each firing plays one season (`tick()` in `worker.ts`). Before the season, the director writes what happens in town. After it, the dead say their last words, the four's thoughts are written, the world is saved, and the teller writes whatever chapter is owed. When the fifteen years are over, or all four are dead, the run is kept in R2 and its pages are drawn once, for good.
- **`7,27,47 * * * *`, the drawing, and the watchdog.** Each firing first checks whether a season is overdue (more than 1.6 seasons since the last one, which is what a firing cut short leaves behind) and plays it if so. Then it draws every page into R2 (`renderAll()`).

Between runs, the last pages stay up for three clock firings, or four when `RUNS_PER_WORLD` is `1` and no new town is ready yet. The teller finishes the story in that time, and the Architect gets one attempt at the next town per firing, four attempts in all. If every attempt fails, the last town is played again and `health:architect` says so.

`worker.ts` tells the two crons apart by comparing the cron string exactly (`event.cron === "*/20 * * * *"`). **If you change the clock in `wrangler.toml`, change that line in `scheduled()` too.** Otherwise every firing is taken for a drawing firing, and seasons are played only by the watchdog, once one is more than 1.6 seasons overdue. The run then goes on at roughly half speed, and when it ends the next one never begins, because the watchdog leaves an ended run alone. Change `SEASON_MS` to match.

That makes 144 firings a day.

## The budget

The prices are in `config/prices.json`, in USD per million tokens. They are DeepSeek's **peak** rates, on purpose, so the meter never understates. Off-peak is about half, so the real bill is somewhat lower than the meter says.

| model | input | cached input | output | used for |
|---|---|---|---|---|
| `deepseek-flash` | 0.30 | 0.006 | 1.20 | the four, the director, their thoughts, last words |
| `deepseek-v4-pro` | 1.32 | 0.044 | 3.96 | the Architect, the teller |

Every call is metered and added to `state/spend` (a running total) and `state/spend:hours` (by the hour, eight days kept). `monthlyRate()` in `worker.ts` turns that into a rate a month. For the people deciding and the teller, it takes the last 24 hours and never projects from fewer than 6. For the Architect, it takes 72 to 192 hours, because it writes in bursts. The worker then throttles itself against that rate:

| monthly rate | what changes |
|---|---|
| up to $8.60 | the director writes a turn every season |
| above $8.60, up to $9.60 | the director writes every other season, and still after one of the four dies and in the last 12 seasons |
| above $9.00 | the teller writes the year just closed, and the opening and the epilogue when they are owed: no older chapters, no half-year, no portraits |
| above $9.50 | the teller and the four's end-of-season thoughts stop |
| above $9.60 | the director writes only when a set-up it opened falls due |

The four's decisions are never throttled. The thresholds are `BUDGET = { full: 9.0, lean: 9.5 }` near the top of `worker.ts`, and the director's `8.6` and `9.6` in `tick()`. Change them there for a different target.

There are also hard caps per call or per firing: $0.05 for a director turn, $0.05 for the thoughts, $0.02 for last words, $0.20 for an ops tell. The teller and the four's decisions get `spendCapUsdPerRun` from `config/prices.json` ($2), counted per firing. Once a cap is passed, the next call is refused.

What it has cost in practice: about $9 a month. Measured on the live copy while it wrote a new town every third run, the model playing the four (with the director, their thoughts and their last words) came to about $2.90 a month, the story to about $5.75 and the Architect to about $0.55. With a new town every run, as now, the Architect writes about 34 towns a month at about $0.05 each, which would bring the total to about $10.50; the teller's throttle holds it near $9 to $9.50 instead. Cloudflare costs nothing on the free plan.

## Local development

`wrangler dev` runs the same worker on your machine, with a local R2 and KV under `.wrangler/state` (git-ignored).

```bash
pnpm cf:dev     # copies web/ into public/web/, then npx wrangler dev, on http://localhost:8787
```

Secrets for local runs go in **`.dev.vars`** in the repository root, which is git-ignored:

```ini
DEEPSEEK_API_KEY=<your key>
```

Without a key, and with `BRAIN = "flash"` as committed, every season fails with `no API key` and the clock stays at season 0. To try it for free, put the four on the dice: add `BRAIN=mock` to `.dev.vars`, or pass `--var BRAIN:mock`.

If there is no `.dev.vars`, `wrangler dev` reads `.env` instead. A key you put in `.env` for the command line is then picked up, and the local worker plays on the model and spends. To stay on the dice, create `.dev.vars` with the line `BRAIN=mock`; once `.dev.vars` exists, `.env` is not read. Passing `--var BRAIN:mock` alone is not enough while `.env` holds a key: the Architect still uses the key to write a town when a run ends.

Crons do not fire on their own under `wrangler dev`. To play seasons and draw pages by hand:

```bash
pnpm build:assets
npx wrangler dev --test-scheduled --var BRAIN:mock      # pnpm cf:tick is the same without --var

curl http://localhost:8787/                                      # the first visit starts a world (503 until drawn)
curl "http://localhost:8787/__scheduled?cron=*/20+*+*+*+*"       # one season
curl "http://localhost:8787/__scheduled?cron=7,27,47+*+*+*+*"    # draw every page
```

After those three calls every page answers `200`. To try the ops routes locally, put a token in the local bucket with `--local` instead of `--remote` in step 4.

The command line can also play a whole run of the same simulation without the worker, which is a cheap way to try a prompt or a key:

```bash
pnpm chronicle the-many --seed 1                  # on the dice, in a few seconds, into archive/
pnpm chronicle the-many --seed 1 --brain flash    # on the model (needs DEEPSEEK_API_KEY in .env)
```

That run has more people in it than a live one, and no director, teller or Architect. `pnpm cost the-many` estimates what the people's decisions cost. (`pnpm live` is an older local server with older pages and no teller. It does not show what the worker serves.)

## Watching it

- **`/health`** is computed on every request: the town, the run, the season, `brain`, `secondsSinceSeason` and the number of finished runs. It answers `503` with `"ok": false` when the season is older than 2.5 seasons, which makes it easy to point an uptime monitor at.
- **`/ops`** is the cost and health page. It is **public and read-only**: the monthly rate by caller, the total since the meter began, the teller's and the Architect's last report, and the last 60 seasons of model calls with fallbacks, latency and cost. `/ops?format=json` has the whole history. Anyone can read both, including the model's recently refused replies.
- **Logs:** `pnpm cf:tail` follows the worker's log. Each clock firing ends with a line such as `season 17 of 60 · teller wrote year 4 · $0.0123 · rate $8.91/month`.
- **State:** everything is in R2 under `state/`. `health:season` has the last season's calls, fallbacks, retries and the last refused replies with the reason. For example:

  ```bash
  npx wrangler r2 object get afterparty-records/state/health:season --pipe --remote
  ```

  Each season's calls are kept in `calls/<runId>/<NN>.json`: the reply (up to 600 characters), the validator's verdict, latency, tokens and cost.

A **fallback** is a decision the dice made because the validator refused the model's reply on the first try and on the retry. If more than about 2 % of calls fall back, the prompt or the token budget is wrong, and the reason in `health:season` says which.

## Stopping and rolling back

- **Stop spending at once:** `npx wrangler secret delete DEEPSEEK_API_KEY`. The clock stops (every season fails with `no API key`) and the pages stay up as they are.
- **Keep it running on the dice:** set `BRAIN = "mock"` and deploy. The Architect still spends a few cents a town while a key is set. Add `NEW_WORLD_EACH_RUN = "off"` to stop that too. While `BRAIN` is `mock`, the findings count every earlier run as the dice too, so the AI-against-people table is empty until you switch back (see [LIVE.md](LIVE.md#limits)).
- **Roll back the code:** `npx wrangler rollback` puts the previous version back. State and pages in R2 are not touched, and the pages are drawn again at the next drawing firing.

## Free-plan limits, and why the pages are drawn ahead of time

At the time of writing, the free plan allows 100,000 requests a day, **10 ms of CPU per request**, 1,000 KV writes a day, and 10 GB of R2 with a million writes a month. Check Cloudflare's current limits before you rely on these numbers.

Two of those limits shaped the design:

- **10 ms of CPU.** Drawing a page from the record (the story, the findings across the last twenty runs) takes far more than that. So no request draws anything. The drawing cron draws every page and stores it in R2 under `pages/`, and a request only streams the stored file back. A page that has not been drawn yet gets the self-reloading *This page is being drawn* notice with a `503`, never a slow page. `/health` and `/ops` are the only pages built per request.
- **1,000 KV writes a day.** The clock, the teller and the bill came close to that on a busy day. When the day's writes ran out, the world could not be saved and the town stopped. So all running state moved to R2, which allows about a million writes a month. The live copy uses an estimated 65,000 of them.

The upload is about 560 KiB (166 KiB compressed), well under the free plan's size limit, and the project uses two cron triggers.
