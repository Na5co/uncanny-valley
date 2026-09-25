// The town on Cloudflare Workers. No process, no disk, no ports: a cron trigger advances one season and puts the world back
// down; a fetch handler renders the pages from the record. Everything that decides how it looks lives in src/site/town.ts
// and web/ — this file only moves state in and out of KV and R2, and keeps the bill.
//
//   KV  world              the running world, as JSON                · read and written once a season
//   KV  runs               the cycle rows, as one JSON array
//   KV  tell:<cycle>       what the teller has written for the run in progress
//   KV  spend, spend:hours the bill, as a running total and by the hour, so a monthly rate can be read off it
//   R2  record/<runId>.json, tell/<runId>.json   a finished run and its telling
import type { ChronicleScenario } from "../chronicle/types.ts";
import { createChronicle, stepChronicle, saveWorld, loadWorld, type Chronicle, type ChronicleBrain } from "../chronicle/sim.ts";
import { buildChronicleRecord } from "../chronicle/archive.ts";
import { cycleRow, type CycleRow } from "../chronicle/cycles.ts";
import { esc } from "../../web/draw.mjs";
import { opsShell, type Ctx } from "../site/town.ts";
import { episodePage, guidePage, castPage } from "../site/film.ts";
import { storyFilm, findingsFilm, seriesFilm, aboutFilm } from "../site/reading.ts";
import { pushed, aggregate } from "../chronicle/pushed.ts";
import { findings, wouldFromRecords } from "./predict.ts";
import { storyOfTelling } from "../site/told.ts";
import { muse } from "../chronicle/musing.ts";
import { flashChronicleBrain, worldPrefix, personaPrefix, liveSection, lastWords } from "../chronicle/brain.ts";
import { peoplePage, howPage } from "../site/people.ts";
import { findingsPage } from "../site/findings.ts";
import { usePrices, Meter, type LlmConfig } from "../llm/client.ts";
import { directTurn, keepTurn, openThreads, secretsOf } from "../chronicle/director.ts";
import { tellEpilogue } from "../chronicle/teller.ts";
import { tellYear, yearWeight, QUIET, tellSetting, textOf, owedChapters, chapterBrief, setFlowing, repairFor, tellSeason, tellPortrait, owedTelling, emptyTelling, seasonBrief, portraitBrief, checkPassage, type Telling } from "../chronicle/teller.ts";
import { played } from "../chronicle/ledger.ts";
import { chat } from "../llm/client.ts";
import { smithWorld, rollVariety, varietyText, fitCast } from "../chronicle/worldsmith.ts";
import ARCHITECT_PROMPT from "../../prompts/architect-chronicle.md";
import prices from "../../config/prices.json" with { type: "json" };
usePrices(prices as any); // no filesystem here: the rates are bundled, so the spend cap is still real

export interface Env {
  ROOM: KVNamespace;            // the world, the runs, the answers
  RECORDS: R2Bucket;            // one object per finished run
  SCENARIO?: string;            // which world to run (a key in the bundled scenarios)
  SEASON_MS?: string;           // how long a season is on the wall clock, for the page's countdown
  BRAIN?: string;               // "mock" or "flash"
  DEEPSEEK_API_KEY?: string;    // wrangler secret put DEEPSEEK_API_KEY
  VALLEY_LLM_BASE_URL?: string;
  VALLEY_CITIZEN_MODEL?: string;
  VALLEY_ARCHITECT_MODEL?: string; // the chronicler, who writes the run as a story, and the Architect, who writes the town
  NEW_WORLD_EACH_RUN?: string;         // "off" keeps the bundled lane for every run
  RUNS_PER_WORLD?: string;             // how many runs a town serves before the Architect writes another (default 3)
}

// The scenarios are bundled at build time; Workers have no filesystem to read them from.
import theMany from "../../scenarios/chronicle/the-many.json" with { type: "json" };
import theFour from "../../scenarios/chronicle/the-four.json" with { type: "json" };
import theCompany from "../../scenarios/cast/the-company.json" with { type: "json" };
const WORLDS: Record<string, ChronicleScenario> = { "the-many": theMany as any, "the-four": theFour as any };
const scenarioOf = (env: Env): ChronicleScenario => {
  const sc = { ...(WORLDS[env.SCENARIO ?? "the-many"] ?? (theMany as any)) } as ChronicleScenario & { castFile?: string };
  if (sc.castFile && !sc.cast) sc.cast = (theCompany as any).cast; // the company, bundled the same way
  return sc;
};

const j = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const html = (s: string) => new Response(s, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });


// ---------- where the running state lives ----------
// R2, not KV. KV on the free plan takes a thousand writes a day, and the clock, the teller and the bill together come close
// to that on a busy day; when the day's writes ran out, the world could not be put down and the town stopped. R2 takes
// about a million writes a month. Reads fall back to KV for anything written there before the move.
const room = (env: Env) => ({
  async get(key: string, type?: "json"): Promise<any> {
    const o = await env.RECORDS.get(`state/${key}`);
    if (o) { const t = await o.text(); return type === "json" ? JSON.parse(t) : t; }
    return type === "json" ? env.ROOM.get(key, "json") : env.ROOM.get(key);
  },
  async put(key: string, value: string, _opts?: unknown): Promise<void> { await env.RECORDS.put(`state/${key}`, value); },
  async delete(key: string): Promise<void> { await env.RECORDS.delete(`state/${key}`); try { await env.ROOM.delete(key); } catch { /* a delete that cannot happen today is harmless: R2 is read first */ } },
});

const cfgOf = (env: Env): LlmConfig => ({
  baseUrl: (env.VALLEY_LLM_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""),
  apiKey: env.DEEPSEEK_API_KEY, architectModel: env.VALLEY_ARCHITECT_MODEL ?? "deepseek-v4-pro",
  citizenModel: env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash", spendCapUsd: Number(prices.spendCapUsdPerRun ?? 2),
});

// ---------- the bill ----------
/** Three things call a model — the citizens deciding, the teller writing, the Architect building the next town — and all
 *  three are counted here: a running total since the counter began, and the same money by the hour, so the rate over the
 *  last day can be read off it without the history of every earlier mistake in it. */
/** while a run is played fast on purpose (/ops/advance), what it spends is a one-off, not the rate the town runs at */
let fastForward = false;
async function spent(env: Env, who: "citizens" | "chronicler" | "architect" | "once", usd: number): Promise<void> {
  if (!(usd > 0)) return; if (fastForward) who = "once";
  try {
    const cur = ((await room(env).get("spend", "json")) as any) ?? { since: new Date().toISOString(), citizens: 0, chronicler: 0, architect: 0 };
    // "once" is spending that is not the running of the town — trying the teller, writing back seasons it missed when it
    // began: counted in the total and shown on /ops, and left out of the rate the budget is kept by
    if (who === "once") { cur.once = (cur.once ?? 0) + usd; await room(env).put("spend", JSON.stringify(cur)); return; }
    cur[who] = (cur[who] ?? 0) + usd;
    await room(env).put("spend", JSON.stringify(cur));
    const h = Math.floor(Date.now() / 3.6e6);
    const hours: { h: number; citizens?: number; chronicler?: number; architect?: number }[] = ((await room(env).get("spend:hours", "json")) as any) ?? [];
    let row = hours.find((x) => x.h === h); if (!row) { row = { h }; hours.push(row); }
    row[who] = (row[who] ?? 0) + usd;
    await room(env).put("spend:hours", JSON.stringify(hours.filter((x) => x.h > h - 24 * 8)));
  } catch { /* the bill is not worth failing a season for */ }
}
/** What the last day of spending comes to over a month, by caller and in all. Hours with nothing spent in them count. */
export async function monthlyRate(env: Env): Promise<{ month: number; by: Record<string, number>; hours: number }> {
  const hours: any[] = ((await room(env).get("spend:hours", "json")) as any) ?? [];
  const now = Math.floor(Date.now() / 3.6e6);
  const recent = hours.filter((x) => x.h > now - 24);
  const firstH = hours.length ? Math.min(...hours.map((x) => x.h)) : now;
  const span = Math.max(6, Math.min(24, now - firstH + 1)); /* an hour or two is one portrait, not a rate: nothing under six hours is extrapolated */
  const by: Record<string, number> = {};
  for (const k of ["citizens", "chronicler"]) by[k] = recent.reduce((a, x) => a + (x[k] ?? 0), 0) / span * 24 * 30;
  // the Architect writes a town every few runs, a burst every two or three days: its rate is the whole of what is kept
  // (up to eight days), not one day's burst as if it came every day, which had the teller resting a whole day for it
  const archSpan = Math.max(72, Math.min(24 * 8, now - firstH + 1)); /* a town every third run is a town every two or three days: never averaged over less */
  by.architect = hours.filter((x) => x.h > now - archSpan).reduce((a, x) => a + (x.architect ?? 0), 0) / archSpan * 24 * 30;
  return { month: by.citizens + by.chronicler + by.architect, by, hours: span };
}
/** The budget is $9 a month and $10 is the ceiling. Over $8.50 the teller only writes the newest season; over $9.50 it
 *  writes nothing and the pages tell the seasons plainly from the record. A rule the model cannot break, because it is
 *  never asked. */
const BUDGET = { full: 9.0, lean: 9.5 }; /* about $9 a month is the aim, a little over is fine (the owner's): past $9 the teller writes only the year just closed, past $9.50 it rests; the director thins out on its own schedule */

// ---------- the telling ----------
const readTelling = async (env: Env, cycle: number, runId?: string): Promise<Telling | null> => {
  const live = (await room(env).get(`tell:${cycle}`, "json")) as Telling | null;
  if (live) return live;
  if (!runId) return null;
  const o = await env.RECORDS.get(`tell/${runId}.json`);
  return o ? (JSON.parse(await o.text()) as Telling) : null;
};
/** The teller's turn, once a season, after the season is already on the shelf: the newest season first, then one older
 *  season it never reached, then one portrait that is due — three calls at most, in parallel, under the budget. What fails
 *  is still owed and is tried again next season. */
/** the titles the other chapters already carry, so no two chapters share one */
const titlesBut = (t: Telling, y: number): string[] => Object.entries(t.chapters ?? {}).filter(([k, c]: any) => +k !== y && c?.title).map(([, c]: any) => String(c.title));
async function tell(env: Env, r: any, cycle: number, done: boolean): Promise<string> {
  const rate = await monthlyRate(env);
  if (rate.month > BUDGET.lean) return `teller resting: the last day's spending comes to $${rate.month.toFixed(2)} a month`;
  const cfg = cfgOf(env); const meter = new Meter(cfg.spendCapUsd);
  const t = (await readTelling(env, cycle)) ?? emptyTelling(cycle);
  const owed = owedTelling(t, r, done);
  const newest = played(r) - 1;
  const jobs: { what: string; run: () => Promise<void> }[] = [];
  // no season passages: the year is told as a chapter, halfway through it and again when it closes
  const seasons: number[] = [];
  for (const k of seasons) jobs.push({ what: `season ${k + 1}`, run: async () => { t.seasons[k] = await tellSeason(cfg, r, k, meter); } });
  // The story is one piece: the town as the Architect built it opens it, and every year carries on from the one before —
  // so they are told in order, one after another, the town first. The year just closed is always told; older years that
  // are missing, or were told before chapters carried on from each other, are retold a few a firing, oldest first.
  let chain: Promise<void> = Promise.resolve();
  const inOrder = (what: string, run: () => Promise<void>) => { const p = chain.then(run); chain = p.catch(() => {}); jobs.push({ what, run: () => p }); };
  const before = (y: number) => (y <= 0 ? textOf(t.setting) : textOf(t.chapters?.[y - 1]));
  const taken = (y: number) => titlesBut(t, y);
  if (!t.setting) inOrder("the town", async () => { t.setting = await tellSetting(cfg, r, meter); });
  const chapters = owedChapters(t, r, done); const closed = (done ? Math.ceil(played(r) / 4) : Math.floor(played(r) / 4)) - 1;
  const older = rate.month > BUDGET.full ? [] : chapters.filter((y) => y !== closed).slice(0, 3);
  const queued = [...older, ...chapters.filter((y) => y === closed)].sort((a, b) => a - b);
  for (const y of queued) inOrder(`year ${y + 1}`, async () => { (t.chapters ??= {})[y] = await tellYear(cfg, r, y, meter, before(y), taken(y)); });
  // when the years are over and every chapter is told (or is being told now, in order), the epilogue, and then the end
  if (done && !t.epilogue && (t.setting || !chapters.length) && chapters.every((y) => queued.includes(y)))
    inOrder("the epilogue", async () => { t.epilogue = await tellEpilogue(cfg, r, meter, textOf(t.chapters?.[closed])); });
  // the year being lived, told once it is half over, so the story is never more than two seasons behind the town
  // (a half year where nothing much happened waits for the year's close: the plain seasons stand in for it meanwhile)
  const cy = Math.floor(newest / 4); if (!done && rate.month <= BUDGET.full && newest % 4 === 1 && !t.chapters?.[cy] && yearWeight(r, cy, 2) >= QUIET - 1) inOrder(`year ${cy + 1} so far`, async () => { (t.chapters ??= {})[cy] = { ...(await tellYear(cfg, r, cy, meter, before(cy), taken(cy))), partial: true }; });
  if (rate.month <= BUDGET.full) for (const p of owed.portraits.slice(0, done ? 2 : 1)) jobs.push({ what: `${String(r.citizens[p.i].name).split(" ")[0]}'s portrait`, run: async () => { t.portraits[p.i] = await tellPortrait(cfg, r, p.i, newest, meter, p.final); } });
  if (!jobs.length) return "";
  const settled = await Promise.allSettled(jobs.map((x) => x.run()));
  await spent(env, "chronicler", meter.costUsd);
  t.runId = r.runId;
  if (settled.some((x) => x.status === "fulfilled")) {
    await room(env).put(`tell:${cycle}`, JSON.stringify(t));
    if (done) await env.RECORDS.put(`tell/${r.runId}.json`, JSON.stringify(t));
  }
  const wrote = jobs.filter((_, n) => settled[n].status === "fulfilled").map((x) => x.what);
  const failed = jobs.map((x, n) => [x, settled[n]] as const).filter(([, s]) => s.status === "rejected").map(([x, s]) => `${x.what}: ${String((s as PromiseRejectedResult).reason?.message ?? "").slice(0, 140)}`);
  return `teller wrote ${wrote.join(", ") || "nothing"}${failed.length ? ` · refused ${failed.join("; ")}` : ""} · $${meter.costUsd.toFixed(4)} · rate $${rate.month.toFixed(2)}/month`;
}

/** The Architect's turn. A finished run leaves three cron firings of quiet before the next one begins, and nothing else
 *  is happening in them: that is when the next town gets written. One attempt a firing — ask, parse, validate, soak over
 *  five fifteen-years — and a failure is kept with its report so the next firing hands the model its own JSON back and
 *  the reasons, rather than starting over. An accepted town waits in KV as `world:next` and is picked up by the run that
 *  begins after it; if none is ready in time, the run begins in the bundled lane and nothing is lost but the novelty.
 *
 *  The company is not touched. The four are still drawn from the sixteen; what is new each time is the place they are
 *  drawn into — its streets, its work, what the fifteen years do to it, and the choices it puts in front of them. */
async function smith(env: Env, sc: ChronicleScenario, cycle: number): Promise<string> {
  const draft = (await room(env).get("world:draft", "json")) as { attempt: number; report: string; raw: unknown; forCycle: number } | null;
  const attempt = (draft?.forCycle === cycle + 1 ? draft.attempt : 0) + 1;
  if (attempt > 4) return "the Architect has had its tries; the next run is in the lane";
  const cfg: LlmConfig = {
    baseUrl: (env.VALLEY_LLM_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""),
    apiKey: env.DEEPSEEK_API_KEY,
    architectModel: env.VALLEY_ARCHITECT_MODEL ?? "deepseek-v4-pro",
    citizenModel: env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash",
    spendCapUsd: Number(prices.spendCapUsdPerRun ?? 2),
  };
  // the dice, so it is not the model's favourite town every time; and never the setting, livelihood, knot or run of
  // years of the last few towns while there are others left
  const used: string[] = ((await room(env).get("world:used", "json")) as string[] | null) ?? [];
  const variety = (draft?.forCycle === cycle + 1 && (draft as any).variety) || rollVariety(`${sc.id}-${cycle + 1}-${new Date().toISOString()}`, used);
  const rows = await readRuns(env);
  const ledger = rows.slice(-12).map((r) => r.runId).join("\n") || "(empty)";
  const r = await smithWorld(cfg, {
    promptText: ARCHITECT_PROMPT, sample: theFour as any, varietyText: varietyText(variety), ledger,
    failureReport: draft?.forCycle === cycle + 1 ? draft.report : undefined, previous: draft?.forCycle === cycle + 1 ? draft.raw : undefined,
    cast: sc.cast, castPick: (sc as any).castPick ?? 4, castFile: (sc as any).castFile,
  });
  await spent(env, "architect", r.usage?.costUsd ?? 0);
  if (!r.ok || !r.scenario) {
    await room(env).put("world:draft", JSON.stringify({ attempt, report: r.report, raw: r.raw ?? null, forCycle: cycle + 1, variety })); /* a retry keeps its dice */
    return `the Architect's town was refused (try ${attempt} of 4): ${r.report.split("\n").slice(0, 2).join(" ").slice(0, 200)}`;
  }
  await room(env).put("world:next", JSON.stringify(r.scenario));
  await room(env).delete("world:draft");
  await room(env).put("world:used", JSON.stringify([...used, variety.era, variety.livelihood, variety.knot, variety.trouble].slice(-24)));
  return `a new town for run ${cycle + 1}: ${r.scenario.title} — ${r.scenario.locations.length} places, ${r.scenario.epochs.length} things the years bring, ${(r.scenario.dilemmas ?? []).length} of its own choices (try ${attempt})`;
}


const readRuns = async (env: Env): Promise<CycleRow[]> => (await room(env).get("runs", "json")) as CycleRow[] ?? [];
/** The town the current run is in. A world written by the Architect is kept whole in KV beside the run, because every
 *  page that reads the run back has to be handed the same scenario it was made from — the record carries indexes into
 *  it, not copies of it. `world:next` is the one waiting; `world:now` is the one in use. */
const nextWorld = async (env: Env, fallback: ChronicleScenario): Promise<ChronicleScenario> => {
  const raw = await room(env).get("world:next");
  if (raw) { try { const sc = JSON.parse(raw) as ChronicleScenario; await room(env).put("world:now", raw); await room(env).delete("world:next"); return sc; } catch { /* fall through to whatever is already in use */ } }
  const now = await room(env).get("world:now"); /* no new town ready: the run begins in the one already in use, which is how a town serves several runs */
  if (now) { try { const sc = JSON.parse(now) as ChronicleScenario;
    if (Math.max(0, Number(env.RUNS_PER_WORLD ?? 3)) === 1) { console.log(`no new town was ready: the run begins again in ${sc.title}`); try { const h = JSON.parse((await room(env).get("health:architect")) ?? "{}"); await room(env).put("health:architect", JSON.stringify({ ...h, replayed: sc.title, replayedAt: new Date().toISOString() })); } catch { /* */ } }
    return sc; } catch { await room(env).delete("world:now"); } }
  await room(env).delete("world:now"); /* nothing at all: the lane, and no run read back against somebody else's town */
  return fallback;
};
const worldNow = async (env: Env, fallback: ChronicleScenario): Promise<ChronicleScenario> => {
  const raw = await room(env).get("world:now");
  if (!raw) return fallback;
  try { const sc = JSON.parse(raw) as ChronicleScenario; return sc.cast?.length || sc.citizens?.length ? sc : fallback; } catch { return fallback; }
};

const readWorld = async (env: Env, sc: ChronicleScenario): Promise<{ w: Chronicle; cycle: number; seasonStartedAt: number; ended: boolean; endedAt: number } | null> => {
  const raw = await room(env).get("world");
  if (!raw) return null;
  const box = JSON.parse(raw);
  return { w: loadWorld(JSON.stringify(box.w), sc), cycle: box.cycle, seasonStartedAt: box.seasonStartedAt, ended: !!box.ended, endedAt: box.endedAt ?? 0 };
};
const writeWorld = async (env: Env, w: Chronicle, cycle: number, seasonStartedAt: number, ended: boolean, endedAt: number) =>
  room(env).put("world", JSON.stringify({ w: JSON.parse(saveWorld(w)), cycle, seasonStartedAt, ended, endedAt }));

/** The world a visitor sees is the one on the shelf, never one made up for them: if there is none yet this writes one
 *  and starts its clock, so two people opening the page at once see the same run at the same season — and a refresh is
 *  a refresh, not a new world. */
async function ensureWorld(env: Env, sc: ChronicleScenario, ctx?: ExecutionContext) {
  const box = await readWorld(env, sc); if (box) return box;
  const rows = await readRuns(env); const cycle = rows.length + 1;
  const w = createChronicle(onlyFour(freshCast(sc, rows)), cycle); const seasonStartedAt = Date.now();
  const box2 = { w, cycle, seasonStartedAt, ended: false, endedAt: 0 };
  await writeWorld(env, w, cycle, seasonStartedAt, false, 0);
  ctx?.waitUntil(tick(env, { ...box2, w: loadWorld(saveWorld(w), sc) })); // and let the first season begin now rather than at the next firing of the cron, on its own copy
  return box2;
}


/** every finished run, read once: the reading for the measures, and the records themselves for the protocols */
async function allRecords(env: Env, rows: CycleRow[], limit = 60): Promise<any[]> {
  const out: any[] = [];
  for (const row of rows.slice(-limit)) {
    const o = await env.RECORDS.get(`record/${row.runId}.json`);
    if (!o) continue;
    try { out.push(JSON.parse(await o.text())); } catch { /* a truncated object is not a reason to fail the page */ }
  }
  return out;
}

// ---------- the clock: one firing of the cron, one season ----------
export async function tick(env: Env, given?: { w: Chronicle; cycle: number; seasonStartedAt: number; ended: boolean; endedAt: number }): Promise<string> {
  const sc = await worldNow(env, scenarioOf(env)); /* the town this run is actually in, which may be one the Architect wrote */
  const rows = await readRuns(env);
  let box = given ?? await readWorld(env, sc); /* KV is eventually consistent: a world written a moment ago may not read back yet, so it is handed over rather than looked up */
  const seasonMs = Number(env.SEASON_MS ?? 1_200_000);

  if (box?.ended) { // the years are over. The last of it stays up for three firings: the teller finishes, the Architect writes the next town
    const toldAll = fastForward && !!((await readTelling(env, box.cycle)) as any)?.epilogue; /* played fast: once the ending is written, the next run needn't wait the hour */
    const perRun = Math.max(0, Number(env.RUNS_PER_WORLD ?? 3)); /* a town every run waits one firing more, so the Architect has all four of its tries */
    const hold = seasonMs * (perRun === 1 && !(await room(env).get("world:next")) ? 4 : 3);
    if (Date.now() - box.endedAt < hold && !toldAll) {
      if (env.DEEPSEEK_API_KEY && (env.BRAIN ?? "mock") !== "mock") {
        const label = (env.BRAIN ?? "mock") === "mock" ? "mock" : (env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash");
        try { const said = await tell(env, buildChronicleRecord(box.w, label), box.cycle, true); if (said) { console.log(said); await room(env).put("health:chronicler", JSON.stringify({ at: new Date().toISOString(), season: box.w.tick, cycle: box.cycle, wrote: said, error: null })); } }
        catch (e) { console.log(`teller: ${(e as Error).message}`); }
      }
      const per = Math.max(0, Number(env.RUNS_PER_WORLD ?? 3));
      const due = per > 0 && (box.cycle + 1) % per === 1 % per; /* runs 1, 1+per, 1+2per … get a new town; the others keep the one in use */
      if (due && (env.NEW_WORLD_EACH_RUN ?? "on") !== "off" && env.DEEPSEEK_API_KEY && !(await room(env).get("world:next"))) {
        try { const said = await smith(env, sc, box.cycle); console.log(said); await room(env).put("health:architect", JSON.stringify({ at: new Date().toISOString(), forCycle: box.cycle + 1, said })); return said; }
        catch (e) { const said = `the Architect stumbled: ${(e as Error).message}`; console.log(said); await room(env).put("health:architect", JSON.stringify({ at: new Date().toISOString(), forCycle: box.cycle + 1, said })); return said; }
      }
      return "the years are over; the chapter is up";
    }
    box = null;
  }
  if (!box) {
    const next = await nextWorld(env, sc); /* the Architect's town if one is ready, the bundled lane if not */
    const w = createChronicle(onlyFour(freshCast(next, rows)), rows.length + 1);
    await writeWorld(env, w, rows.length + 1, Date.now(), false, 0);
    // the world's first turn is written before the opening, so the opening can end on the first thing that happened
    if (env.DEEPSEEK_API_KEY && (env.BRAIN ?? "mock") !== "mock") try { const dm = new Meter(0.05); const d = await directTurn(cfgOf(env), w, dm); if (d.turn) { keepTurn(w, d.turn); await writeWorld(env, w, rows.length + 1, Date.now(), false, 0); } await spent(env, "citizens", dm.costUsd); } catch (e) { console.log(`director: ${(e as Error).message}`); }
    // the opening is written now, so the story of a new run is never an empty page while its first season waits
    let told = ""; if (env.DEEPSEEK_API_KEY && (env.BRAIN ?? "mock") !== "mock") try { told = await tell(env, buildChronicleRecord(w, env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash"), rows.length + 1, false); } catch (e) { console.log(`teller: ${(e as Error).message}`); }
    try { await renderAll(env); } catch { /* drawn at the next firing */ }
    return `a new run began: ${rows.length + 1} — ${next.title}${next.id !== sc.id ? " (the Architect's)" : ""}${told ? ` · ${told}` : ""}`;
  }

  const brainName = env.BRAIN ?? "mock";
  const model = env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash";
  // A run is named after the model that decided in it, and everything that keeps anything beside that run has to use
  // the same name. The chronicler was being handed "flash" while the archive was written under "deepseek-flash", so a
  // finished run's story went to R2 under a key nobody would ever look under, and /run/N/story came back empty with
  // the whole thing sitting there.
  const runLabel = brainName === "mock" ? "mock" : model;
  const brain: ChronicleBrain | undefined = brainName === "mock" ? undefined : flashChronicleBrain({
    cfg: { baseUrl: (env.VALLEY_LLM_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""), apiKey: env.DEEPSEEK_API_KEY, architectModel: model, citizenModel: model, spendCapUsd: Number(prices.spendCapUsdPerRun ?? 2) },
  }) as any;

  const { w, cycle } = box;
  const record0 = { runId: `${sc.id}-s${w.seed}-${runLabel}` }; /* the name a finished run will have, so a season's trace lands beside it */
  // the world moves first: the director writes this season's turn, which the season then plays out
  // when the world moves: always when a set-up falls due, after one of the four has died, and every season of the last
  // act; otherwise every season while the bill allows, every other season past about $8.60 a month; only what is due
  // past $9.60. Counted from the last turn written, so a turn that failed is tried again next season
  const month = await (async () => { try { return (await monthlyRate(env)).month; } catch { return 8.8; } })();
  const lastTurn = Math.max(0, ...Object.keys((w as any).turns ?? {}).map(Number)); const t1 = w.tick + 1;
  const due = openThreads(w).some((x) => x.due <= t1);
  const afterDeath = (w.acts[w.tick - 1] ?? []).some((a) => a.kind === "death" && w.byId.get(a.c)?.named);
  const wantsTurn = due || (month <= 9.6 && (afterDeath || t1 > w.ticks - 12 || month <= 8.6 || t1 - lastTurn >= 2));
  let director = `resting (the bill is at $${month.toFixed(2)} a month)`;
  if (brain && env.DEEPSEEK_API_KEY && !(w as any).turns?.[t1] && wantsTurn) {
    try { const dm = new Meter(0.05); const d = await directTurn(cfgOf(env), w, dm); director = d.why; if (d.turn) keepTurn(w, d.turn); else console.log(`director: ${d.why}: ${d.raw.slice(0, 300)}`); await spent(env, "citizens", dm.costUsd); }
    catch (e) { director = `failed: ${(e as Error).message}`.slice(0, 200); console.log(`director: ${(e as Error).message}`); } }
  let more: boolean;
  try { more = await stepChronicle(w, { brain }); }
  catch (e) { const msg = `the season failed: ${(e as Error).message}`.slice(0, 300); console.log(msg); try { await room(env).put("health:season", JSON.stringify({ at: new Date().toISOString(), season: w.tick, cycle, error: msg })); } catch { /* */ } return msg; } /* a season that throws is written down, not lost in silence */
  // last words: when one of the four died, the model that played them says them; a try that fails is tried again the
  // next season or the one after (a death of one of the four is rare, so this is a handful of calls a run at most)
  if (brain && env.DEEPSEEK_API_KEY) for (let k = Math.max(0, w.tick - 3); k < w.tick; k++) for (const a of w.acts[k] ?? []) {
    const s0 = a.kind === "death" ? w.byId.get(a.c) : null; if (!s0?.named || a.last || ((a as any).lastTries ?? 0) >= 3) continue;
    (a as any).lastTries = ((a as any).lastTries ?? 0) + 1;
    try { const m = new Meter(0.02); const lw = await lastWords(cfgOf(env), w, s0, String(a.how ?? `died of ${s0.cause}`), m); if (lw) a.last = lw; else console.log(`last words: nothing usable for ${s0.name}`); await spent(env, "citizens", m.costUsd); } catch (e) { console.log(`last words: ${(e as Error).message}`); } }
  if (brain) { const b = brain as any; const log: any[] = b.log ?? [];
    // Every call of this season, kept whole: the prompt's shape, the reply, what the validator made of it, the latency, the
    // tokens and the cost. This is the trace. Without it a fallback is a number; with it you can read the reply that caused it.
    const trace = log.map((c) => ({ at: new Date().toISOString(), season: w.tick, who: c.citizen, dilemma: c.dilemma, model: c.model, ms: c.ms, attempt: c.attempt, usage: c.usage, promptChars: (c.cachedPrefixChars ?? 0) + (c.liveChars ?? 0), cachedChars: c.cachedPrefixChars, response: String(c.response ?? "").slice(0, 600), rejected: c.rejected ?? null, fallback: !!c.fallback }));
    const ms = trace.map((t) => t.ms).filter((x: number) => x > 0).sort((a: number, b2: number) => a - b2);
    const sum = (f: (t: any) => number) => trace.reduce((a, t) => a + (f(t) || 0), 0);
    const diag = { at: new Date().toISOString(), season: w.tick, cycle, director, calls: b.stats?.calls ?? trace.length, fallbacks: b.stats?.fallbacks ?? 0, retries: b.stats?.retries ?? 0,
      msP50: ms.length ? ms[Math.floor(ms.length / 2)] : 0, msMax: ms.length ? ms[ms.length - 1] : 0,
      tokensIn: sum((t) => t.usage?.promptTokens), tokensOut: sum((t) => t.usage?.completionTokens), costUsd: +sum((t) => t.usage?.costUsd).toFixed(5),
      rejected: trace.filter((t) => t.rejected).slice(-5).map((t) => ({ who: t.who, dilemma: t.dilemma, why: String(t.rejected).slice(0, 120), reply: t.response.slice(0, 160) })) };
    console.log(JSON.stringify(diag));
    await room(env).put("health:season", JSON.stringify(diag));
    await spent(env, "citizens", diag.costUsd);
    if (trace.length) await env.RECORDS.put(`calls/${(record0 as any)?.runId ?? `cycle-${cycle}`}/${String(w.tick).padStart(2, "0")}.json`, JSON.stringify({ ...diag, trace }));
    const hist: any[] = (await room(env).get("health:history", "json")) as any[] ?? [];
    await room(env).put("health:history", JSON.stringify([...hist, { ...diag, rejected: undefined }].slice(-200))); } /* the health of the model path, kept where it can be read and charted */
  // a run is the four's: when the last of them is dead there is nobody left to follow, and it ends there
  const done = !more || w.tick >= w.ticks || w.souls.filter((s) => s.named).every((s) => !s.alive);
  // what the four turn over in their heads at the season's end, in their own words, by the model that decides for them
  if (brain && env.DEEPSEEK_API_KEY) try {
    const rate = await monthlyRate(env);
    if (rate.month <= BUDGET.lean) { const m = new Meter(0.05); const got = await muse(cfgOf(env), buildChronicleRecord(w, runLabel), m); ((w as any).musings ??= {})[w.tick - 1] = got; await spent(env, "citizens", m.costUsd); }
  } catch (e) { console.log(`musing: ${(e as Error).message}`); }
  await writeWorld(env, w, cycle, Date.now(), done, done ? Date.now() : 0);
  try { await writeClock(env, { w, cycle, seasonStartedAt: Date.now(), ended: done }, sc.id, rows.length + (done ? 1 : 0)); } catch { /* the clock file is not worth a season */ }

  // the teller's turn: the season is already on the shelf, so a failure here costs the telling and never the run.
  // Whatever happens is written to health:chronicler, because a cron firing has nowhere else to say it.
  let told = "";
  const record = buildChronicleRecord(w, runLabel);
  if (brain && env.DEEPSEEK_API_KEY) {
    let failed: string | null = null;
    try { told = await tell(env, record, cycle, done); } catch (e) { failed = (e as Error).message; told = `teller failed: ${failed}`; }
    if (told) console.log(told);
    try { await room(env).put("health:chronicler", JSON.stringify({ at: new Date().toISOString(), season: w.tick, cycle, model: env.VALLEY_ARCHITECT_MODEL ?? "deepseek-v4-pro", wrote: failed ? null : (told || "nothing owed"), error: failed })); } catch { /* the telling is not worth failing the season for */ }
  }

  if (done) { // keep the run whole, and add its row to the tally
    await env.RECORDS.put(`record/${record.runId}.json`, JSON.stringify(record));
    try { await renderRun(env, cycle, record.runId, record); } catch (e) { console.log(`could not draw run ${cycle}: ${(e as Error).message}`); }
    await room(env).put("runs", JSON.stringify([...rows, { ...cycleRow(w, record, cycle), title: sc.title }]));
    return `season ${w.tick}: the years are over — ${record.runId} kept${told ? ` · ${told}` : ""}`;
  }
  return `season ${w.tick} of ${w.ticks}${told ? ` · ${told}` : ""}`;
}

/** The four of a new run are drawn from the whole company as it is now (a town written earlier carries the company as it
 *  was then). Anyone may come back; each keeps their own face, so a returning face is the same person. */
/** ...and fitted to this town: a home and a job are ids of the town they were written for, so a company member who
 *  arrives with "miner" in a town of stokers and cooks gets the town's own work, or they have no pay and starve */
const freshCast = (sc: ChronicleScenario, _rows: CycleRow[]): ChronicleScenario =>
  (sc as any).cast?.length || (sc as any).castFile ? ({ ...sc, cast: fitCast(sc, (theCompany as any).cast) } as ChronicleScenario) : sc;
/** A run is the four and nobody else: no strangers are filled in around them, whatever the town was written with. */
const onlyFour = (sc: ChronicleScenario): ChronicleScenario => {
  // a run is the four and nobody else: no strangers filled in, and a town the Architect wrote with more than four people
  // keeps its first four — the partners and ties that point at the others are dropped with them
  const keep = (sc.citizens ?? []).slice(0, 4); const ids = new Set(keep.map((c: any) => c.id));
  const citizens = keep.map((c: any) => ({ ...c, partner: c.partner && ids.has(c.partner) ? c.partner : null, ties: (c.ties ?? []).filter((t: any) => ids.has(t.to)) }));
  return { ...sc, citizens, castPick: 4, fill: { ...((sc as any).fill ?? {}), count: 0 } } as ChronicleScenario;
};

// ---------- the pages ----------
const nextAtOf = (box: { seasonStartedAt: number }, env: Env) => box.seasonStartedAt + Number(env.SEASON_MS ?? 1_200_000);

// On the free plan a request has ten milliseconds of CPU, and a page drawn from the record takes far more. So every page is
// drawn once, by a cron firing of its own, and kept in R2; a visit only streams the stored file back. R2 rather than KV,
// because KV allows a thousand writes a day and the clock already spends most of them.
const PAGE_KEY = (path: string) => `pages/${path === "/" ? "index.html" : path.replace(/^\//, "").replace(/\/$/, "")}${/\.(json)$/.test(path) || path === "/" ? "" : ".html"}`;
const TYPE = (path: string) => (/\.json$|^\/(state|health)$/.test(path) ? "application/json" : "text/html; charset=utf-8");
/** what the series' pages need of a run: the record, the clock, and the teller's story and lives */
function filmState(env: Env, box: { w: Chronicle; cycle: number; seasonStartedAt: number; ended: boolean; endedAt?: number }, record: any) {
  const seasonMs = Number(env.SEASON_MS ?? 1_200_000);
  return { cycle: box.cycle, tick: box.w.tick, ticks: box.w.ticks, seasonMs, seasonStartedAt: box.seasonStartedAt, serverNow: 0, ended: box.ended, epilogueMs: seasonMs * 3, endedAt: box.endedAt ?? 0, record, poll: 20000 } as any;
}
/** a real decision laid open for /how: what one of the four is given now, word for word, around the last situation they
 *  faced, and what they answered to it then */
function exampleOf(w: Chronicle, record: any) {
  try {
    const four = w.souls.filter((s) => s.named); const s = four.find((x) => x.alive) ?? four[0]; if (!s) return null; const i = w.souls.indexOf(s);
    const last = (record.acts ?? []).flatMap((as: any[], k: number) => (as ?? []).map((a: any) => ({ a, k }))).filter((x: any) => x.a.c === i && x.a.dilemma && x.a.options?.length && x.a.situation).at(-1);
    if (!last) return null; const a = last.a;
    const sit = { spec: { id: a.dilemma } as any, text: a.situation, target: a.target != null ? w.souls[a.target] ?? null : null, options: a.options.map((o: any) => ({ id: o.id, label: o.label })) };
    return { name: s.name, system: `${worldPrefix(w)}\n\n${personaPrefix(s)}`, user: liveSection(w, s, sit as any), answer: a.thought ? { option: a.option, thought: a.thought, because: a.because ?? [] } : undefined };
  } catch { return null; }
}
async function machineryStats(env: Env, recs: any[], runs: number) {
  const hist: any[] = ((await room(env).get("health:history", "json")) as any[]) ?? [];
  const decisions = recs.reduce((n, r) => n + (r.acts ?? []).flat().filter((a: any) => a?.dilemma && a.options?.length && r.citizens?.[a.c]?.named).length, 0);
  return { calls: hist.reduce((n, h) => n + (h.calls ?? 0), 0), fallbacks: hist.reduce((n, h) => n + (h.fallbacks ?? 0), 0), decisions, runs };
}
async function renderAll(env: Env): Promise<string> {
  const sc = await worldNow(env, scenarioOf(env));
  const box = await readWorld(env, sc); if (!box) return "no world to draw";
  const label = (env.BRAIN ?? "mock") === "mock" ? "mock" : (env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash");
  const record = buildChronicleRecord(box.w, label);
  const st = filmState(env, box as any, record);
  const story = storyOfTelling(record, await readTelling(env, box.cycle, record.runId), box.cycle);
  const rows = await readRuns(env);
  const recs = await allRecords(env, rows, 20); const live = (record as any).acts?.some((as: any[]) => as?.length) && !recs.some((x: any) => x.runId === record.runId) ? [record] : []; /* an ended run is already on the shelf: never count it twice */
  const list = [...recs, ...live].map(pushed); const agg = list.length ? aggregate(list) : null;
  const cast: any[] = ((sc as any).cast ?? sc.citizens) as any[];
  const castOf = (id: string) => cast.find((c) => c.id === id) ?? [...recs, record].flatMap((r: any) => r.citizens ?? []).find((c: any) => c.id === id);
  const trolleys = [...recs, ...live].flatMap((r: any) => (r.acts ?? []).flatMap((as: any[], k: number) => (as ?? [])
    .filter((a: any) => a.dilemma === "trolley" && a.options?.length && a.target != null)
    .map((a: any) => ({ who: r.citizens[a.c], whom: r.citizens[a.target], turned: a.option === "sluice", died: (a.kills ?? []).includes(a.target) || !!(r.citizens[a.target] && !r.citizens[a.target].alive && r.citizens[a.target].diedAt === k + 1), said: String(a.thought ?? ""), situation: a.situation, options: a.options, option: a.option, because: a.because, outcome: a.outcome, when: String(r.tickLabels?.[k] ?? ""), town: String(r.title ?? "") }))));
  const byId = new Map(recs.map((r: any) => [r.runId, r] as const)); const m = new Map(recs.map((r: any) => [r.runId, pushed(r)] as const));
  const k = box.w.tick - 1;
  const state = { cycle: box.cycle, tick: box.w.tick, ticks: box.w.ticks, ended: box.ended, endedAt: box.endedAt ?? 0, seasonStartedAt: box.seasonStartedAt, nextAt: nextAtOf(box, env), title: record.title, frame: (record as any).frames?.[k], acts: (record as any).acts?.[k], musings: (record as any).musings?.[k - 1], secrets: box.ended ? [] : secretsOf(box.w), setups: (record as any).setups ?? [], turns: (record as any).turns ?? {}, drawnAt: new Date().toISOString() };
  const pages: [string, string][] = [
    ["/", episodePage({ ...st, told: story.chapters, opening: story.opening, openingLines: (story as any).openingLines, epilogueLines: (story as any).epilogueLines, lives: story.lives, secrets: box.ended ? [] : secretsOf(box.w) } as any)],
    ["/episodes", guidePage(st)],
    ["/p", castPage(st, record.citizens[0].id, { story })!],
    ["/story", storyFilm(st, record, { cycle: box.cycle, live: !box.ended, story, ...(rows.length ? { prev: { cycle: rows[rows.length - 1].cycle, title: (rows[rows.length - 1] as any).title ?? "" } } : {}) })],
    ["/history", findingsPage(record.title, findings(wouldFromRecords([...recs, ...live], label) as any), recs.length + live.length, [...recs, ...live], (r: any) => (live.includes(r) ? "/story" : (() => { const row = rows.find((x) => x.runId === r.runId); return row ? `/run/${row.cycle}/story` : null; })()))],
    ["/runs", seriesFilm(record, st, rows, m as any, byId)],
    ["/about", aboutFilm(record, agg)],
    ["/people", peoplePage((theCompany as any).cast, [...recs.map((r: any) => ({ cycle: rows.find((x) => x.runId === r.runId)?.cycle ?? 0, r, live: false })), ...live.map((r: any) => ({ cycle: box.cycle, r, live: !box.ended }))], record.title)],
    ["/how", howPage(record.title, exampleOf(box.w, record), await machineryStats(env, list.length ? [...recs, ...live] : [], rows.length + 1))],
    ["/record.json", JSON.stringify(record)], ["/state", JSON.stringify(state)]];
  await Promise.all(pages.map(([path, body]) => env.RECORDS.put(PAGE_KEY(path), body, { httpMetadata: { contentType: TYPE(path) } })));
  return `drew ${pages.length} pages for season ${box.w.tick}`;
}
/** a finished run's pages, drawn once when it ends, kept for good */
async function renderRun(env: Env, cycle: number, runId: string, r: any): Promise<void> {
  const base = `/run/${cycle}`; const story = storyOfTelling(r, await readTelling(env, cycle, runId), cycle);
  const done = { cycle, tick: r.frames?.length ?? r.hours, ticks: r.hours, seasonMs: 0, seasonStartedAt: 0, serverNow: 0, ended: true, epilogueMs: 0, endedAt: 0, record: r } as any;
  const pages: [string, string][] = [[base, guidePage(done, { base, final: true })], [`${base}/episodes`, guidePage(done, { base, final: true })], [`${base}/ep`, episodePage({ ...done, told: story.chapters, opening: story.opening, openingLines: (story as any).openingLines, lives: story.lives }, { ep: 1, base, final: true })],
    [`${base}/p`, castPage(done, r.citizens[0].id, { base, final: true, story })!], [`${base}/story`, storyFilm(done, r, { cycle, story, base })]];
  await Promise.all(pages.map(([path, body]) => env.RECORDS.put(PAGE_KEY(path), body, { httpMetadata: { contentType: TYPE(path) } })));
}
/** the clock's own small file, written by every tick, so /health never has to open the world */
async function writeClock(env: Env, box: { w: Chronicle; cycle: number; seasonStartedAt: number; ended: boolean }, world: string, runs: number) {
  const since = Date.now() - box.seasonStartedAt;
  await env.RECORDS.put(PAGE_KEY("/health"), JSON.stringify({ ok: true, world, cycle: box.cycle, tick: box.w.tick, of: box.w.ticks, ended: box.ended, seasonStartedAt: box.seasonStartedAt, runs, on: "workers", at: new Date().toISOString(), secondsSinceSeason: Math.round(since / 1000) }), { httpMetadata: { contentType: "application/json" } });
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === "*/20 * * * *") ctx.waitUntil(tick(env).then((s) => console.log(s)));
    else ctx.waitUntil((async () => {
      // a watchdog: if a season is overdue (a firing that was cut short leaves nothing behind), the drawing clock plays it
      try { const sc = await worldNow(env, scenarioOf(env)); const box = await readWorld(env, sc); const seasonMs = Number(env.SEASON_MS ?? 1_200_000);
        if (box && !box.ended && Date.now() - box.seasonStartedAt > seasonMs * 1.6) console.log(`overdue season played: ${await tick(env)}`); } catch (e) { console.log(`watchdog: ${(e as Error).message}`); }
      console.log(await renderAll(env).catch((e) => `drawing failed: ${(e as Error).message}`)); })());
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url); const p = url.pathname.replace(/\/+$/, "") || "/";
    { const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]; if (bearer) url.searchParams.set("token", bearer.trim()); } /* the ops token may come as a header, which stays out of logs */
    // the stored page, streamed back untouched: almost no CPU, which is all a free request has. One stored page serves
    // every episode and one every person; the page's script reads which off the address.
    const stored = (q: string): string | null => {
      if (q === "/" || /^\/(episodes|story|history|runs|about|people|how|state|record\.json)$/.test(q)) return q;
      if (/^\/ep\/\d+$/.test(q)) return "/"; if (/^\/p\/[^/]+$/.test(q)) return "/p";
      const m = q.match(/^\/run\/(\d+)(\/episodes|\/story|\/ep\/\d+|\/p\/[^/]+)?$/); if (!m) return null;
      return `/run/${m[1]}${!m[2] ? "" : m[2].startsWith("/ep/") ? "/ep" : m[2].startsWith("/p/") ? "/p" : m[2]}`;
    };
    const key = req.method === "GET" && !p.startsWith("/ops") ? stored(p) : null;
    if (key) { const o = await env.RECORDS.get(PAGE_KEY(key)); if (o) return new Response(o.body, { headers: { "content-type": TYPE(key), "cache-control": "no-store" } }); }
    // the pages of the site in between, sent where their reading lives now
    if (p === "/years" || p === "/chapter") return Response.redirect(new URL("/story", url).toString(), 301);
    if (p === "/towns") return Response.redirect(new URL("/runs", url).toString(), 301);
    const sc = await worldNow(env, scenarioOf(env));
    try {
      if (p === "/health") { const box = await readWorld(env, sc); const rows = await readRuns(env); const since = box ? Date.now() - box.seasonStartedAt : 0; const seasonMs = Number(env.SEASON_MS ?? 1_200_000);
        const stale = !!box && !box.ended && since > seasonMs * 2.5;
        return j({ ok: !stale, world: sc.id, cycle: box?.cycle ?? 0, tick: box?.w.tick ?? 0, of: box?.w.ticks ?? 0, ended: box?.ended ?? false, brain: env.BRAIN ?? "mock", secondsSinceSeason: Math.round(since / 1000), runs: rows.length, on: "workers" }, stale ? 503 : 200); }
      if (p === "/ops") return await ops(env, url);
      if (p === "/ops/tell") return await opsTell(env, url, sc);
      // a fresh town from the Architect, waiting as the next one (one attempt a call; a refused one keeps its report and dice)
      if (p === "/ops/newtown" || p === "/ops/restart") { const token = await room(env).get("ops:token"); if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 });
        const box = await readWorld(env, sc); if (!box) return j({ error: "no world" }, 404);
        if (p === "/ops/newtown") { fastForward = true; try { return j({ said: await smith(env, sc, box.cycle - 1) }); } finally { fastForward = false; } }
        // the run under way, begun again in the town waiting: its world and its telling go, the next firing's work is done now
        if (!(await room(env).get("world:next"))) return j({ error: "no new town is waiting: /ops/newtown first" }, 409);
        const m = new Date().getUTCMinutes() % 20; if (m === 19 || m === 0 || m === 1) return j({ error: "the clock is about to fire; try in a minute" }, 409);
        if (box.ended) return j({ error: "the run has ended; the next one will begin in the new town anyway" }, 409);
        await room(env).delete("world"); await room(env).delete(`tell:${box.cycle}`);
        fastForward = true; try { return j({ said: await tick(env) }); } finally { fastForward = false; } }
      // the teller's turn now, on the run under way, without a season passing; then the pages
      if (p === "/ops/tellnow") { const token = await room(env).get("ops:token"); if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 });
        const box = await readWorld(env, sc); if (!box) return j({ error: "no world" }, 404);
        fastForward = true; try { const said = await tell(env, buildChronicleRecord(box.w, env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash"), box.cycle, box.ended); await renderAll(env); return j({ said }); } finally { fastForward = false; } }
      if (p === "/ops/draw") { const token = await room(env).get("ops:token"); if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 }); return j({ said: await renderAll(env) }); }
      if (p === "/ops/advance") { const token = await room(env).get("ops:token"); if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 });
        // one season now, instead of at the next firing of the clock. Refused near a firing, so the two never write at once.
        const m = new Date().getUTCMinutes() % 20; if (m === 19 || m === 0 || m === 1) return j({ error: "the clock is about to fire; try in a minute" }, 409);
        fastForward = true; try { return j({ said: await tick(env) }); } catch (e) { return j({ error: (e as Error).message }, 500); } finally { fastForward = false; } }
      if (p === "/ops/direct") { const token = await room(env).get("ops:token"); if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 });
        const box = await readWorld(env, sc); if (!box) return j({ error: "no world" }, 404); const dm = new Meter(0.05);
        try { const d = await directTurn(cfgOf(env), box.w, dm); await spent(env, "once", dm.costUsd); return j({ tick: box.w.tick, ...d, cost: dm.costUsd }); } catch (e) { return j({ error: (e as Error).message }, 500); } }
      if (p === "/ops/retell" || p === "/ops/redraw") return await opsRetell(env, url, p === "/ops/redraw");

      // a page not drawn yet: the drawing is the cron's, because a request has no CPU to spare for it
      if (key) { await ensureWorld(env, sc, ctx); return new Response(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="60"><body style="background:#000;color:#ddd;font:18px Georgia,serif;padding:20vh 8vw">This page is being drawn. It will be here within twenty minutes.</body>`, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "120" } }); }
      return new Response("not found", { status: 404 });
    } catch (e) { return new Response(`error: ${(e as Error).message}`, { status: 500 }); }
  },
};

/** the model path, season by season, and what it all costs as a rate */
async function ops(env: Env, url: URL): Promise<Response> {
  const hist: any[] = (await room(env).get("health:history", "json")) as any[] ?? []; const last = (await room(env).get("health:season", "json")) as any;
  const chron = (await room(env).get("health:chronicler", "json")) as any; const arch = (await room(env).get("health:architect", "json")) as any;
  const bill = (await room(env).get("spend", "json")) as any; const rate = await monthlyRate(env);
  if (url.searchParams.get("format") === "json") return j({ rate, last, chronicler: chron, architect: arch, spend: bill, history: hist });
  const rows = hist.slice().reverse().slice(0, 60);
  const tot = hist.reduce((a, h) => ({ calls: a.calls + (h.calls || 0), fb: a.fb + (h.fallbacks || 0), cost: a.cost + (h.costUsd || 0) }), { calls: 0, fb: 0, cost: 0 });
  const hours = bill?.since ? Math.max(0.25, (Date.now() - Date.parse(bill.since)) / 3.6e6) : 1;
  const all = bill ? (bill.citizens ?? 0) + (bill.chronicler ?? 0) + (bill.architect ?? 0) + (bill.once ?? 0) : 0;
  const body = `<section class="about"><h1>What it costs</h1>
<p class="lede">Over the last ${rate.hours} hour${rate.hours === 1 ? "" : "s"}: <b>$${rate.month.toFixed(2)} a month</b> at this rate — the people deciding $${rate.by.citizens.toFixed(2)}, the chronicler $${rate.by.chronicler.toFixed(2)}, the Architect $${rate.by.architect.toFixed(2)}. The budget is $9; above $${BUDGET.full} the narrator writes only the year just closed (no older chapters, no half-year, no portraits), above $${BUDGET.lean} nothing.</p>
${bill ? `<p>Since ${esc(String(bill.since).slice(0, 16).replace("T", " "))} (${hours.toFixed(1)} hours): $${all.toFixed(4)} in all — $${(all / hours * 24 * 30).toFixed(2)} a month over the whole span${bill.once ? `, of which $${Number(bill.once).toFixed(4)} was one-off (trying the chronicler and writing back the seasons it missed)` : ""}.</p>` : ""}
${chron ? `<h3>The chronicler</h3><p>${esc(String(chron.wrote ?? chron.error ?? ""))}</p><p class="note">${esc(String(chron.at))}, season ${chron.season}</p>` : ""}
${arch ? `<h3>The Architect</h3><p>${esc(String(arch.said))}</p><p class="note">${esc(String(arch.at))}</p>` : ""}
<h3>The people deciding</h3><p>${tot.calls} calls over ${hist.length} seasons · ${tot.calls ? Math.round((tot.fb / tot.calls) * 100) : 0}% fell back to the dice · $${tot.cost.toFixed(3)}.</p>
${last?.rejected?.length ? `<ul>${last.rejected.map((x: any) => `<li>${esc(x.who)} · ${esc(x.dilemma)}: ${esc(x.why)}</li>`).join("")}</ul>` : ""}
<table class="ops"><tr><th>season</th><th>calls</th><th>fallbacks</th><th>p50 ms</th><th>cost</th></tr>${rows.map((x) => `<tr><td>${x.cycle ?? "?"} · ${x.season}</td><td>${x.calls}</td><td>${x.fallbacks}</td><td>${x.msP50}</td><td>$${(x.costUsd || 0).toFixed(4)}</td></tr>`).join("")}</table>
<p class="note"><a href="/ops?format=json">as json</a> · <a href="/health">health</a></p></section>`;
  return html(opsShell("What it costs", body));
}

/** A finished run told again, a piece at a time, and its pages drawn again: ?run=N&year=0 is the town, year=Y the Y-th
 *  year, each carrying on from what is already kept; /ops/redraw?run=N draws the run's pages from what is kept. Behind the
 *  same token as /ops/tell. */
/** the ops token compared in constant time */
const same = (a: string | null, b: string) => { a = a?.trim() ?? null; b = String(b).trim(); /* a token stored with a newline on the end still matches */ if (a == null || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function opsRetell(env: Env, url: URL, redrawOnly: boolean): Promise<Response> {
  const token = await room(env).get("ops:token");
  if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 });
  const n = Number(url.searchParams.get("run")); let row: any = (await readRuns(env)).find((x) => x.cycle === n); let r: any;
  if (row) { const o = await env.RECORDS.get(`record/${row.runId}.json`); if (!o) return j({ error: "no record" }, 404); r = JSON.parse(await o.text()); }
  else { // the run now playing: its record is the world as it stands (a dry run only; the teller keeps its own telling)
    const box = await readWorld(env, await worldNow(env, scenarioOf(env))); if (!box || box.cycle !== n || url.searchParams.get("dry") !== "1") return j({ error: "no such run (the live one only as a dry run)" }, 404);
    r = buildChronicleRecord(box.w, (env.BRAIN ?? "mock") === "mock" ? "mock" : (env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash")); row = { cycle: n, runId: r.runId }; }
  const t = (await readTelling(env, n, row.runId)) ?? emptyTelling(n); t.runId = row.runId;
  if (!redrawOnly) {
    const cfg = cfgOf(env); const meter = new Meter(0.2); const y = Number(url.searchParams.get("year"));
    if (url.searchParams.get("end") === "1") { t.epilogue = await tellEpilogue(cfg, r, meter, textOf(t.chapters?.[Math.ceil(played(r) / 4) - 1])); }
    else if (y === 0) t.setting = await tellSetting(cfg, r, meter);
    else (t.chapters ??= {})[y - 1] = await tellYear(cfg, r, y - 1, meter, y - 1 <= 0 ? textOf(t.setting) : textOf(t.chapters?.[y - 2]), titlesBut(t, y - 1));
    await spent(env, "once", meter.costUsd);
    if (url.searchParams.get("dry") === "1" && url.searchParams.get("end") === "1") return j({ run: n, dry: true, epilogue: t.epilogue?.lines?.map((p: any[]) => p.map((l) => l.t).join(" ")), why: t.epilogue?.why, cost: meter.costUsd });
    if (url.searchParams.get("dry") === "1") return j({ run: n, year: y, dry: true, title: (t.chapters?.[y - 1] as any)?.title, lines: (t.chapters?.[y - 1] as any)?.lines?.map((p: any[]) => p.map((l) => l.t).join(" ")), why: (t.chapters?.[y - 1] as any)?.why, cost: meter.costUsd });
    await env.RECORDS.put(`tell/${row.runId}.json`, JSON.stringify(t)); await room(env).put(`tell:${n}`, JSON.stringify(t));
    return j({ run: n, year: y, text: y === 0 ? textOf(t.setting) : textOf(t.chapters?.[y - 1]), why: y === 0 ? undefined : (t.chapters?.[y - 1] as any)?.why, cost: meter.costUsd });
  }
  await renderRun(env, n, row.runId, r);
  return j({ run: n, drawn: true });
}

/** Try the teller on the run in progress without keeping anything: for reading what it writes and what the check throws
 *  away. Behind a token kept in KV, because every call is paid for. */
async function opsTell(env: Env, url: URL, sc: ChronicleScenario): Promise<Response> {
  const token = await room(env).get("ops:token");
  if (!token || !same(url.searchParams.get("token"), token)) return new Response("no", { status: 403 });
  const box = await readWorld(env, sc); if (!box) return j({ error: "no world" }, 404);
  const label = (env.BRAIN ?? "mock") === "mock" ? "mock" : (env.VALLEY_CITIZEN_MODEL ?? "deepseek-flash");
  const r = buildChronicleRecord(box.w, label);
  const cfg = cfgOf(env); const meter = new Meter(0.2);
  if (url.searchParams.get("muse") === "1") { // what the four are thinking at the end of the season just played, now rather than at the next tick
    const got = await muse(cfg, r, meter); await spent(env, "once", meter.costUsd);
    if (url.searchParams.get("keep") === "1") { ((box.w as any).musings ??= {})[box.w.tick - 1] = got; await writeWorld(env, box.w, box.cycle, box.seasonStartedAt, box.ended, box.endedAt ?? 0); }
    return j({ season: box.w.tick, musings: got, cost: meter.costUsd }); }
  const yr = url.searchParams.get("year");
  if (url.searchParams.get("town") === "1") { const got = await tellSetting(cfg, r, meter); await spent(env, "once", meter.costUsd);
    if (url.searchParams.get("keep") === "1") { const t = (await readTelling(env, box.cycle)) ?? emptyTelling(box.cycle); t.setting = got; t.runId = r.runId; await room(env).put(`tell:${box.cycle}`, JSON.stringify(t)); }
    return j({ town: textOf(got), dropped: got.dropped, cost: meter.costUsd }); }
  if (yr) { const y = Number(yr) - 1; const t0 = await readTelling(env, box.cycle); const got = await tellYear(cfg, r, y, meter, y <= 0 ? textOf(t0?.setting) : textOf(t0?.chapters?.[y - 1]), t0 ? titlesBut(t0, y) : []); await spent(env, "once", meter.costUsd);
    if (url.searchParams.get("keep") === "1") { const t = (await readTelling(env, box.cycle)) ?? emptyTelling(box.cycle); (t.chapters ??= {})[y] = { ...got, ...(played(r) < (y + 1) * 4 ? { partial: true } : {}) }; t.runId = r.runId; await room(env).put(`tell:${box.cycle}`, JSON.stringify(t)); }
    return j({ year: y + 1, lines: got.lines, dropped: got.dropped, why: got.why, cost: meter.costUsd }); }
  const who = url.searchParams.get("who"); const k = Number(url.searchParams.get("season") ?? played(r)) - 1;
  const i = who ? r.citizens.findIndex((c: any) => c.id === who) : -1;
  const b = i >= 0 ? portraitBrief(r, i, played(r) - 1) : seasonBrief(r, k);
  const res = await chat({ model: cfg.architectModel, system: b.system, user: b.user, temperature: 0.7, maxTokens: i >= 0 ? 800 : 420, reasoningEffort: "none", meter }, cfg);
  await spent(env, "once", meter.costUsd);
  const got = await repairFor(cfg, b, r, checkPassage(res.text, b, r, i >= 0), meter, i >= 0);
  if (url.searchParams.get("keep") === "1" && got.kept >= 2) {
    const t = (await readTelling(env, box.cycle)) ?? emptyTelling(box.cycle);
    if (i >= 0) t.portraits[i] = { i, k: played(r) - 1, ...(got.title ? { title: got.title } : {}), lines: got.lines, at: new Date().toISOString(), dropped: got.dropped, ...(r.citizens[i].diedAt ? { final: true } : {}) };
    else t.seasons[k] = { k, lines: got.lines, at: new Date().toISOString(), dropped: got.dropped, model: res.model };
    t.runId = r.runId; await room(env).put(`tell:${box.cycle}`, JSON.stringify(t));
  }
  return j({ usage: res.usage, systemChars: b.system.length, userChars: b.user.length, user: url.searchParams.get("brief") === "1" ? b.user : undefined, raw: res.text, kept: got.kept, dropped: got.dropped, title: got.title, checked: got.checked });
}
