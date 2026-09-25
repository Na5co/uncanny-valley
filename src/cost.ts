// Cost: an estimate from a scenario's shape, or the actual figure from an archive's calls.jsonl.
import { existsSync, readFileSync } from "node:fs";
import { loadScenario } from "./scenario.ts";
import { loadPrices, llmConfig, costOf } from "./llm/client.ts";
import { loadEngine } from "./llm/engine.ts";
import { expandCast } from "./scenario.ts";

/** a chronicle run: the town shrinks as people die, so the calls are counted over the seasons, not multiplied flat */
function chronicleEstimate(sc: any, path: string, brain: string, prices: ReturnType<typeof loadPrices>, cfg: ReturnType<typeof llmConfig>): string {
  const subjects = sc.cast?.length ? Math.min(sc.cast.length, sc.castPick ?? 4) : sc.citizens.length;
  const start = subjects + (sc.fill?.count ?? 0); const seasons = sc.years * 4;
  let calls = 0; for (let k = 0; k < seasons; k++) { const alive = start * (1 - 0.45 * (k / seasons)); calls += alive * 0.8; } // ~45% gone by the end, a choice four seasons in five
  calls = Math.round(calls);
  const model = brain === "flash" ? cfg.citizenModel : brain;
  const sysTok = 420, personaTok = 180, liveTok = 300, outTok = 70; // the world prefix is the same every call and caches; the situation is what changes
  const cachedIn = calls * sysTok, freshIn = calls * (personaTok + liveTok), out = calls * outTok;
  const cost = costOf(model, { promptTokens: cachedIn + freshIn, cachedTokens: cachedIn, completionTokens: out }, prices);
  const priced = (prices.models[model]?.input ?? 0) > 0 || (prices.models[model]?.output ?? 0) > 0;
  return [
    `${sc.title ?? sc.id} — estimate for one run on --brain ${brain} (${model}):`,
    `  ${start} people, ${sc.years} years (${seasons} seasons) → about ${calls} calls as the town shrinks`,
    `  ${(cachedIn + freshIn).toLocaleString()} prompt tokens (${cachedIn.toLocaleString()} of them the cached world prefix) · ${out.toLocaleString()} completion`,
    priced ? `  ≈ $${cost.toFixed(3)} a run · $${(cost * 24 * 3600 / (sc.years * 4 * 1200)).toFixed(2)} a day at a season every 20 minutes` : `  no price on file for ${model}: fill config/prices.json before spending`,
    `  cap: $${prices.spendCapUsdPerRun}/run (VALLEY_SPEND_CAP_USD overrides)`,
  ].join("\n");
}
export function costEstimate(scenarioOrRun: string, brain = "flash"): string {
  const prices = loadPrices(); const cfg = llmConfig();
  const dir = existsSync(scenarioOrRun) ? scenarioOrRun : `archive/${scenarioOrRun}`;
  if (existsSync(`${dir}/calls.jsonl`)) {
    const lines = readFileSync(`${dir}/calls.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (!lines.length) return `${dir}: calls.jsonl is empty (mock brain — no model calls, $0).`;
    const byModel = new Map<string, { calls: number; inTok: number; cached: number; out: number; cost: number; fallbacks: number }>();
    let replayed = 0, attemptsTotal = 0;
    for (const l of lines) { if (l.replayed) { replayed++; continue; } const model = l.model ?? "unknown"; const m = byModel.get(model) ?? { calls: 0, inTok: 0, cached: 0, out: 0, cost: 0, fallbacks: 0 }; m.calls += l.attempts?.length ?? 1; attemptsTotal += (l.attempts?.length ?? 1) - 1; m.inTok += l.usage?.promptTokens ?? 0; m.cached += l.usage?.cachedTokens ?? 0; m.out += l.usage?.completionTokens ?? 0; m.cost += l.usage?.costUsd ?? 0; if (l.fallback) m.fallbacks++; byModel.set(model, m); }
    return [`${dir} — actual, from calls.jsonl:`, ...[...byModel.entries()].map(([model, m]) => `  ${model.padEnd(18)} ${m.calls} live calls (${attemptsTotal} of them retries) · ${m.inTok} in (${m.cached} cached, ${m.inTok ? Math.round((m.cached / m.inTok) * 100) : 0} %) · ${m.out} out · $${m.cost.toFixed(4)} · ${m.fallbacks} fell back to mock`), ...(replayed ? [`  ${replayed} calls replayed from the parent (free)`] : []), `  rates: config/prices.json (${Object.keys(prices.models).join(", ")})`].join("\n");
  }
  // a chronicle world: one call per person per season they are alive and have a choice
  const cp = existsSync(scenarioOrRun) ? scenarioOrRun : `scenarios/chronicle/${scenarioOrRun}.json`;
  if (existsSync(cp)) { const raw = JSON.parse(readFileSync(cp, "utf8")); if (raw?.mode === "chronicle") return chronicleEstimate(raw, cp, brain, prices, cfg); }
  const s = loadScenario(scenarioOrRun);
  const engine = loadEngine(s.id);
  const n = expandCast(s, 1).length;
  const decisions = n * Math.floor(s.clock.hours / s.clock.decisionEveryHours);
  const reflections = n * (s.clock.reflectionAt.length + Math.floor(s.clock.hours / 6)); // formal reflections + 6-hourly reconsiderations
  const prefixTok = engine ? Math.ceil(JSON.stringify([engine.worldFacts, engine.actionVocabulary.map((a) => `${a.id} ${a.label} ${a.tone}`), engine.exemplars]).length / 4) + 250 : 700;
  const personaTok = 120, liveTok = 380, outTok = 60, reflectLive = 420, reflectOut = 120;
  const model = brain === "flash" ? cfg.citizenModel : brain;
  const p = prices.models[model] ?? { input: 0, cachedInput: 0, output: 0 };
  const calls = decisions + reflections;
  const cachedIn = calls * (prefixTok + personaTok), freshIn = decisions * liveTok + reflections * reflectLive, out = decisions * outTok + reflections * reflectOut;
  const cost = costOf(model, { promptTokens: cachedIn + freshIn, cachedTokens: cachedIn, completionTokens: out }, prices);
  return [
    `${s.title} — estimate for --brain ${brain} (${model}):`,
    `  ${n} citizens · ${decisions} decisions (every ${s.clock.decisionEveryHours}h) + ${reflections} reflections = ${calls} calls`,
    `  cached prefix ≈ ${prefixTok + personaTok} tokens/call (${engine ? "compiled decision engine" : "no decision engine — default prefix"}), live ≈ ${liveTok}, output ≈ ${outTok}`,
    `  ≈ ${(cachedIn / 1e6).toFixed(2)} M cached input · ${(freshIn / 1e6).toFixed(2)} M fresh input · ${(out / 1e3).toFixed(0)} k output`,
    `  ≈ $${cost.toFixed(4)} at config/prices.json rates (${p.input}/${p.cachedInput}/${p.output} per M in/cached/out)${p.input === 0 && p.output === 0 ? " — rates are 0: fill in config/prices.json" : ""}`,
    `  cap: $${cfg.spendCapUsd} per run (VALLEY_SPEND_CAP_USD)`,
  ].join("\n");
}
