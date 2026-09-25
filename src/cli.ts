#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateScenario } from "./validate.ts";
import { loadScenario, scenarioPath } from "./scenario.ts";
import { runWorld } from "./engine/sim.ts";
import { mockBrain } from "./brains/mock.ts";
import { cramersV, diversity, outcomeColumns, pairedDelta, pairedDeltaInBucket, pooled, runMany, tabulate, wilson } from "./experiment.ts";
import { applyWith, makeVariants } from "./vary.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { soak, phaseOfDay } from "./reach.ts";
import { writeArchive } from "./archive.ts";
import { watch } from "./watch.ts";
import { fork } from "./fork.ts";
import { runArchitect } from "./architect.ts";
import { makeBrain, callsFromLog, type BrainName } from "./brains/index.ts";
import { costEstimate } from "./cost.ts";
import { buildSite } from "./site.ts";
import { runChronicle } from "./chronicle/sim.ts";
import { writeChronicleArchive } from "./chronicle/archive.ts";
import { flashChronicleBrain } from "./chronicle/brain.ts";
import { appendCycle, cycleRow, nextSeed, readCycles, writeHistory } from "./chronicle/cycles.ts";
import { runChronicleArchitect, rollVariety, varietyText } from "./chronicle/architect.ts";
import { startLive, loadChronicleScenario } from "./live/server.ts";
import { validateChronicle, soakChronicle } from "./chronicle/validate.ts";
import { existsSync } from "node:fs";

const [cmd, ...rest] = process.argv.slice(2);
const flags: Record<string, string | boolean> = {};
const args: string[] = [];
const multi: Record<string, string[]> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); const v = rest[i + 1]; if (v && !v.startsWith("--")) { flags[k] = v; (multi[k] ??= []).push(v); i++; } else flags[k] = true; }
  else args.push(rest[i]);
}
const num = (k: string, d: number) => (flags[k] !== undefined ? Number(flags[k]) : d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

import { bucketLabel } from "./experiment.ts";
const usage = `uncanny-valley — AI people put through the experiments of social psychology

  uncanny-valley validate <scenario|path>
  uncanny-valley world <scenario|path> [--seed N] [--brain mock|flash|scripted] [--beats]
  uncanny-valley chronicle <scenario> [--seed N] [--brain mock|scripted|flash]  fifteen years in sixty seasons: scenarios/chronicle/*.json → archive with journeys
  uncanny-valley cycle <scenario> [--count N] [--every MIN] [--brain …]  run the next cycle(s) of a chronicle (fresh seed each), keep them in cycles/<scenario>/, refresh history.md
  uncanny-valley history <scenario>                              what the cycles add up to: extinction rate, who survives, deeds that predict death
  uncanny-valley preflight [<scenario>] [--brain mock|flash] [--root DIR]  everything that must be true before the site goes in front of anyone: node, the key, the prices, the world over ten seeds, the directories, the disk
  uncanny-valley live <scenario> [--season SECONDS] [--port N] [--brain …] [--rotate [dir]]  run the world live, forever: a season every N seconds (1200 = 20 min); --rotate picks the Architect's newest accepted world at each new run
  uncanny-valley architect --chronicle [--question "…"] [--dice <seed>] [--no-dice] [--dry-run] [--llm scripted]  the Architect writes a world, its four, its hard years and its own dilemmas — the dice (era, livelihood, the knot, the trouble, four temperaments, tone; today's date unless --dice) make each one unlike the last → validated + soaked → scenarios/chronicle/generated/
  uncanny-valley cost <scenario|run-id> [--brain flash]      estimate (scenario) or actual (archive) tokens and cost
  uncanny-valley site [run-id]                                write index.html for one archive, or for all + the gallery (archive/index.html)
  uncanny-valley experiment <scenario|path> [--seeds N] [--from N] [--vary <spec>] [--with <spec>] [--outcome ending|changedMind]
                        [--split-by <spec>] [--buckets a,b] [--split-at start|end] [--exclude id,id] [--out file] [--format md|csv]
      --vary loyal | trait:bold=-0.3,0,0.3 | rumour-at | event:<id>.chance=0.05,1 | belief:<id>.initial=0,0.6
             | pull:<choice>.<factor>=0.2,0.8 | citizen:<id>.traits.bold=0.2,0.9 | citizen:<id>.remove=false,true
      --split-by trait:loyal | topTieAffinity | belief:<id> | exposedTo:<eventId> | lean0   (default: the scenario's own question; measured at hour 0)
  uncanny-valley watch <run-id|archive dir> [--tempo live|day|instant|<n>s] [--from H] [--to H]
  uncanny-valley fork <run-id|archive dir> [--seed N] [--swap <citizen id>] [--vary <spec>=<one value>]
  uncanny-valley architect [--question "..."] [--dry-run] [--llm live|scripted] [--attempts N]

Scenarios live in ./scenarios/<id>.json — see docs/SCENARIO.md.`;

async function main() {
  switch (cmd) {
    case "validate": {
      if (!args[0]) throw new Error(usage);
      const cp = existsSync(args[0]) ? args[0] : existsSync(`scenarios/chronicle/${args[0]}.json`) ? `scenarios/chronicle/${args[0]}.json` : null;
      const raw = JSON.parse(readFileSync(cp ?? scenarioPath(args[0]), "utf8"));
      if (raw?.mode === "chronicle") {
        const cv = validateChronicle(raw);
        for (const w of cv.warnings) console.log(`  warn  ${w}`); for (const e of cv.errors) console.log(`  error ${e}`);
        if (!cv.ok) { console.log(`✗ ${args[0]}: ${cv.errors.length} error(s)`); process.exitCode = 1; return; }
        const sk = await soakChronicle(raw, 10); console.log(sk.lines.map((l) => `  ${l}`).join("\n")); for (const p of sk.problems) console.log(`  error ${p}`);
        console.log(sk.problems.length ? `✗ ${args[0]}: ${sk.problems.length} soak problem(s)` : `✓ ${args[0]}: valid, ten seeds live and die`); if (sk.problems.length) process.exitCode = 1;
        return;
      }
      const v = validateScenario(raw);
      for (const w of v.warnings) console.log(`  warn  ${w}`);
      for (const e of v.errors) console.log(`  error ${e}`);
      if (!v.ok) { console.log(`✗ ${args[0]}: ${v.errors.length} error(s)`); process.exitCode = 1; return; }
      // Dynamic check: does each event actually reach anyone? (20 mock seeds, ~1 s)
      const sk = await soak(raw, 20);
      const weak = sk.reach.filter((r) => r.weak);
      console.log(`  Event reach (mean citizens present, 20 seeds):`);
      for (const r of sk.reach) console.log(`  ${r.weak ? "warn " : "     "} ${r.id.padEnd(24)} h${String(r.at).padStart(2, "0")} ${phaseOfDay(r.at).padEnd(8)} ${r.where.padEnd(10)} ${r.meanReached.toFixed(1).padStart(5)} / ${r.cast}${r.weak ? "   ← fires into an empty room; move it, change the hour-of-day, or use \"all\"" : ""}`);
      console.log(`  Ending split (20 seeds):`);
      for (const ch of (raw as any).ending.choices) console.log(`        ${ch.id.padEnd(24)} ${pct(sk.shares[ch.id]).padStart(5)} pooled   per seed ${sk.perSeedMin[ch.id]}–${sk.perSeedMax[ch.id]}`);
      if (sk.oneSidedSeeds) console.log(`  warn  ${sk.oneSidedSeeds} of 20 seeds ended with every citizen choosing the same thing`);
      if (!sk.diversityOk) { console.log(`  error ending: not contested — a choice is > 80 % or < 5 % of citizens over 20 seeds. Rebalance pull weights (docs/SCENARIO.md, Field notes).`); console.log(`✗ ${args[0]}: 1 error(s)`); process.exitCode = 1; return; }
      const warnCount = v.warnings.length + weak.length + (sk.oneSidedSeeds ? 1 : 0);
      console.log(`✓ ${args[0]} is valid${warnCount ? ` (${warnCount} warning${warnCount > 1 ? "s" : ""})` : ""}`);
      return;
    }
    case "world": {
      if (!args[0]) throw new Error(usage);
      const s = loadScenario(args[0]); const seed = num("seed", 1);
      const brainName = (flags.brain as BrainName | undefined) ?? "mock";
      const { brain, inner, engine, calls, meter } = makeBrain(brainName, s.id, { faultRate: flags.fault !== undefined ? Number(flags.fault) : undefined });
      const t0 = performance.now();
      // if the model layer dies mid-world (cap, transport), the rest of the world runs on the mock and the archive says so
      let degradedAt: number | null = null; let degradedWhy = "";
      const safeBrain = brainName === "mock" ? brain : {
        name: brain.name, hits: (brain as any).hits, misses: (brain as any).misses,
        async decide(wd: any, c: any, k: any) { if (degradedAt !== null) return mockBrain.decide(wd, c, k); try { return await brain.decide(wd, c, k); } catch (e) { degradedAt = wd.hour; degradedWhy = (e as Error).message; console.error(`model layer failed at h${wd.hour}: ${degradedWhy} — continuing on the mock brain`); return mockBrain.decide(wd, c, k); } },
        async reflect(wd: any, c: any) { if (degradedAt !== null) return mockBrain.reflect(wd, c); try { return await brain.reflect(wd, c); } catch (e) { degradedAt = wd.hour; degradedWhy = (e as Error).message; console.error(`model layer failed at h${wd.hour}: ${degradedWhy} — continuing on the mock brain`); return mockBrain.reflect(wd, c); } },
      };
      const w = await runWorld(s, seed, { brain: safeBrain, engine });
      const ms = Math.round(performance.now() - t0);
      console.error(`(${ms}ms)`);
      console.log(`${s.title} — seed ${seed} — ${w.citizens.length} citizens — ${s.clock.hours}h — brain: ${brain.name}${engine ? " + decision engine" : ""}${meter ? ` — ${meter.summary()}` : ""}\n`);
      console.log(s.premise + "\n");
      if (flags.beats) {
        console.log(`Beats (level ≥ 2):`);
        for (const b of w.beats.filter((b) => b.level >= 2)) console.log(`  h${String(b.hour).padStart(2, "0")} ${"•".repeat(b.level)} ${b.headline}`);
        console.log();
      }
      console.log(`Events: ${w.schedule.map((e) => `${e.event.id}@${e.at}${e.skipped ? " (skipped)" : ""}`).join(", ")}`);
      const st = w.stats;
      console.log(`Stats: ${st.decisions} decisions, ${st.fallbacks} fallbacks, ${st.leanFlips} lean flips at reflection, ${st.wavers} wavers after news, ${st.tieSignFlips} ally↔enemy flips, ${st.commits} commits, ${w.beats.filter((b) => b.level >= 2).length} beats`);
      console.log(`Actions by phase:`);
      for (const [ph, row] of Object.entries(st.actionsByPhase)) console.log(`  ${ph.padEnd(13)} ${Object.entries(row).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  ")}`);
      console.log(`Lean over time:`);
      for (const l of w.leanHistory.filter((l) => l.hour % 12 === 0)) console.log(`  h${String(l.hour).padStart(2, "0")}  ${Object.entries(l.tally).map(([k, v]) => `${k}=${v}`).join("  ")}`);
      const ending: Record<string, number> = {};
      for (const c of w.citizens) ending[c.finalChoice!] = (ending[c.finalChoice!] ?? 0) + 1;
      console.log(`\n${s.ending.prompt}`);
      for (const ch of s.ending.choices) console.log(`  ${ch.label.padEnd(28)} ${String(ending[ch.id] ?? 0).padStart(3)}  ${pct((ending[ch.id] ?? 0) / w.citizens.length)}`);
      console.log(`\nBy citizen:`);
      for (const c of w.citizens) console.log(`  ${c.seed.name.padEnd(14)} ${c.seed.role.padEnd(16)} ${(s.ending.choices.find((x) => x.id === c.finalChoice)?.label ?? "").padEnd(22)} ${c.committed ? "committed" : ""}`);
      if (brainName !== "mock") { const fb = (inner as any).stats; console.log(`\nBrain: ${fb.calls} model calls (${fb.retries} rejected replies), ${fb.fallbacks} fallbacks to mock → ${((w.stats.fallbacks / Math.max(1, w.stats.decisions)) * 100).toFixed(2)} % of decisions${degradedAt !== null ? ` — DEGRADED to mock from h${degradedAt}: ${degradedWhy}` : ""}`); }
      const runId = brainName === "scripted" && flags.fault !== undefined ? `${s.id}-s${seed}-scripted-f${String(flags.fault).replace(".", "_")}` : undefined;
      const brainLabel = degradedAt !== null ? `${inner.name} (mock from h${degradedAt}: ${degradedWhy})` : inner.name;
      if (degradedAt !== null) (w.stats as any).degradedFrom = degradedAt;
      if (!flags["no-archive"]) {
        // the world is on disk before any further model call can fail
        let { dir } = writeArchive(w, inner.name, callsFromLog(calls), "archive", { runId, brainLabel });
        if (brainName === "flash" && degradedAt === null && !flags["no-editions"]) {
          try { const { flashEditions } = await import("./brains/flash.ts"); const { llmConfig: lc } = await import("./llm/client.ts"); const editions = await flashEditions(w, lc(), meter!, (inner as any).log); ({ dir } = writeArchive(w, inner.name, callsFromLog(calls), "archive", { runId, editions, brainLabel })); }
          catch (e) { console.error(`editions skipped: ${(e as Error).message}`); }
        }
        buildSite(dir); console.log(`\nArchive: ${dir}/record.md · view: ${dir}/index.html`);
      }
      return;
    }
    case "experiment": {
      if (!args[0]) throw new Error(usage);
      if (rest.filter((x) => x === "--vary").length > 1) throw new Error("one --vary per run (variants are compared pairwise against the as-written scenario); run twice for two questions");
      const s0 = loadScenario(args[0]); const n = num("seeds", 10), from = num("from", 1);
      const withSpecs = multi.with ?? [];
      const s = withSpecs.reduce((acc, spec) => applyWith(acc, spec), s0); // several --with compose, in order
      if (flags.outcome) { if (!["ending", "changedMind"].includes(String(flags.outcome))) throw new Error("--outcome ending | changedMind"); s.socialQuestion = { ...s.socialQuestion, measure: { ...s.socialQuestion.measure, outcome: flags.outcome as "ending" | "changedMind" } }; }
      const seeds = Array.from({ length: n }, (_, i) => from + i);
      const variants = flags.vary ? makeVariants(s, String(flags.vary)) : [{ label: "as written", scenario: s, change: "as written", isBase: true, warnings: [] as string[] }];
      const splitBy = flags["split-by"] ? String(flags["split-by"]) : s.socialQuestion.measure.splitBy;
      { const [kind, rest] = splitBy.split(":", 2); const ok = ["topTieAffinity", "lean0"].includes(kind) || (kind === "trait" && ["sociable", "bold", "loyal", "restless"].includes(rest)) || (kind === "belief" && s.beliefs?.some((b) => b.id === rest)) || (kind === "exposedTo" && s.events.some((e) => e.id === rest)); if (!ok) throw new Error(`--split-by ${splitBy}: unknown; use trait:<sociable|bold|loyal|restless> | topTieAffinity | belief:<id> | exposedTo:<eventId> | lean0`); }
      const buckets = flags.buckets ? String(flags.buckets).split(",").map(Number) : (flags["split-by"] ? (splitBy.startsWith("trait:") ? [0.4, 0.7] : splitBy === "topTieAffinity" ? [0.3, 0.6] : splitBy.startsWith("belief:") ? [0.2, 0.5] : undefined) : s.socialQuestion.measure.buckets);
      const splitAt = (flags["split-at"] as "start" | "end" | undefined) ?? "start";
      const excludeIds = new Set(flags.exclude ? String(flags.exclude).split(",") : []);
      const variedCitizen = variants.find((v) => v.citizenId)?.citizenId;
      const t0 = performance.now();
      type Res = { label: string; change: string; isBase: boolean; runs: Awaited<ReturnType<typeof runMany>>; runsExcl?: Awaited<ReturnType<typeof runMany>> };
      const results: Res[] = [];
      for (const v of variants) {
        const runs = await runMany(v.scenario, seeds, { splitBy, buckets, splitAt, exclude: excludeIds });
        const runsExcl = variedCitizen && !excludeIds.has(variedCitizen) ? await runMany(v.scenario, seeds, { splitBy, buckets, splitAt, exclude: new Set([...excludeIds, variedCitizen]) }) : undefined;
        results.push({ label: v.label, change: v.change, isBase: v.isBase, runs, runsExcl });
      }
      console.error(`(${Math.round(performance.now() - t0)}ms)`);
      const cols = outcomeColumns(s);
      const baseRes = results.find((r) => r.isBase) ?? results[0];
      const baseLabel = baseRes.isBase ? "as written" : baseRes.label;
      const variedEvent = variants.find((v) => v.eventId)?.eventId;
      const variedField = variants.find((v) => v.eventField)?.eventField;
      // Timing/placement variants: compare only seeds where the varied event fired in every variant. Chance variants: firing IS the treatment, pair over all seeds.
      const restrict = variedEvent && variedField !== "chance";
      const firedIn = restrict ? results.map((r) => new Set(r.runs.filter((x) => x.eventsFired.includes(variedEvent!)).map((x) => x.seed))) : null;
      const commonSeeds = firedIn ? new Set(seeds.filter((sd) => firedIn.every((f) => f.has(sd)))) : undefined;
      console.log(`${s.title} — ${n} seeds (${from}…${from + n - 1})${withSpecs.length ? ` — with ${withSpecs.join(" + ")}` : ""}${flags.vary ? ` — varying ${flags.vary}` : ""}${excludeIds.size ? ` — excluding ${[...excludeIds].join(", ")}` : ""}`);
      for (const w of new Set(variants.flatMap((v) => v.warnings))) console.log(`  warn  ${w}`);
      if (s.socialQuestion.measure.outcome === "changedMind") console.log(`  (outcome = changedMind: citizens undecided at hour 0 are excluded — "changed" means changed)`);
      console.log();

      const pctPt = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
      const outcomeBlock = (rs: Res[], key: "runs" | "runsExcl", title: string) => {
        console.log(title);
        console.log(`  ${"variant".padEnd(14)}${cols.map((c) => c.padStart(30)).join("")}${variedEvent ? "   fired  reach" : ""}      n`);
        for (const r of rs) {
          const runs = r[key]!; const p = pooled(s, runs);
          const cells = cols.map((c) => {
            const share = (p.counts[c] ?? 0) / p.n;
            if (r.isBase || r === baseRes) return `${pct(share).padStart(5)}`.padStart(30);
            const d = pairedDelta(c, baseRes[key]!, runs, commonSeeds);
            return `${pct(share).padStart(5)}  ${pctPt(d.delta)} [${pctPt(d.lo)}, ${pctPt(d.hi)}] ${d.down}↓${d.up}↑`.padStart(30);
          });
          const fired = variedEvent ? `${String(runs.filter((x) => x.eventsFired.includes(variedEvent)).length).padStart(5)}/${n}  ${(runs.filter((x) => x.eventsFired.includes(variedEvent)).reduce((a, x) => a + x.eventReach[variedEvent], 0) / Math.max(1, runs.filter((x) => x.eventsFired.includes(variedEvent)).length)).toFixed(1).padStart(5)}` : "";
          console.log(`  ${r.label.padEnd(14)}${cells.join("")}${fired}  ${String(p.n).padStart(5)}`);
        }
      };
      outcomeBlock(results, "runs", variants.length > 1 ? `Outcome by variant — share of citizens; then the seed-paired change vs "${baseLabel}" in points, 95 % CI, seeds down↓/up↑${commonSeeds ? ` (paired over the ${commonSeeds.size} seeds where ${variedEvent} fired in every variant)` : variedEvent ? ` (paired over all seeds — whether ${variedEvent} fires is the treatment)` : ""}:` : `Outcome — share of citizens:`);
      if (variedCitizen && results[0].runsExcl) { console.log(); outcomeBlock(results, "runsExcl", `Same, excluding ${variedCitizen} (the varied citizen's own vote removed — this is the spillover):`); }
      if (variants.length > 1) {
        const table = results.map((r) => cols.map((c) => pooled(s, r.runs).counts[c] ?? 0));
        const largest = Math.max(...results.filter((r) => r !== baseRes).flatMap((r) => cols.map((c) => Math.abs(pairedDelta(c, baseRes.runs, r.runs, commonSeeds).delta))));
        console.log(`\n  Headline: largest paired change ${(largest * 100).toFixed(1)} points (${largest < 0.02 ? "no meaningful difference" : largest < 0.05 ? "small" : largest < 0.15 ? "moderate" : "large"}). Cramér's V over the pooled table = ${cramersV(table).toFixed(2)} (secondary; ignores pairing).`);
        console.log(`  Variants: ${results.map((r) => r.change).join(" | ")}`);
      }
      console.log(`\nDiversity: ${results.map((r) => { const d = diversity(s, r.runs); return `${r.label}: ${Object.entries(d.shares).map(([k, v]) => `${k} ${pct(v)}`).join(" ")} ${d.ok ? "✓" : "✗ one-sided"}`; }).join("  ·  ")}`);

      console.log(`\nSocial question: ${s.socialQuestion.text}\n  Hypothesis: ${s.socialQuestion.hypothesis}`);
      if (flags["split-by"]) console.log(`  (split overridden by --split-by; the hypothesis above is the scenario's own, not this table's)`);
      for (const r of results) {
        console.log(`  ${variants.length > 1 ? `[${r.label}] ` : ""}Split by ${splitBy}${splitBy.startsWith("exposedTo:") ? " (a fact of each run)" : splitAt === "start" ? " at hour 0" : " at the end"}:`);
        const tab = tabulate(s, r.runs, buckets);
        console.log(`    ${"bucket".padEnd(14)}${cols.map((c) => c.padStart(10)).join("")}     n  people`);
        for (const [b, row] of tab) { const tot = Object.values(row).reduce((a, x) => a + x, 0); const people = new Set(r.runs.flatMap((x) => x.citizens.filter((c) => c.choice !== null && bucketLabel(s, c.splitValue, buckets) === b).map((c) => c.id))).size; console.log(`    ${b.padEnd(14)}${cols.map((c) => pct((row[c] ?? 0) / tot).padStart(10)).join("")}  ${String(tot).padStart(4)}  ${String(people).padStart(6)}${tot < 30 ? "  ← too few to read" : ""}`); }
        const v = cramersV(tab.map(([, row]) => cols.map((c) => row[c] ?? 0)));
        console.log(`    strength of the split: Cramér's V = ${v.toFixed(2)}${splitAt === "end" ? "  (measured at the end: this is association, not cause)" : ""}  (n = citizen-outcomes, people = distinct citizens; read V against people)`);
      }
      // the interaction: does the variant move each kind of citizen differently? seed-paired Δ per bucket
      if (variants.length > 1) {
        console.log(`\n  Paired change by bucket vs "${baseLabel}" (points, 95 % CI, seeds down↓/up↑ — the interaction figure):`);
        const bucketsSeen = [...new Set(results.flatMap((r) => tabulate(s, r.runs, buckets).map(([b]) => b)))];
        console.log(`    ${"bucket".padEnd(14)}${"variant".padEnd(12)}${cols.map((c) => c.padStart(30)).join("")}  seeds`);
        for (const b of bucketsSeen) for (const r of results) {
          if (r === baseRes) continue;
          const ds = cols.map((c) => pairedDeltaInBucket(s, c, b, baseRes.runs, r.runs, buckets, commonSeeds));
          const cells = ds.map((d) => d.n ? `${pctPt(d.delta)} [${pctPt(d.lo)}, ${pctPt(d.hi)}] ${d.down}↓${d.up}↑`.padStart(30) : "—".padStart(30));
          console.log(`    ${b.padEnd(14)}${r.label.padEnd(12)}${cells.join("")}  ${String(ds[0]?.n ?? 0).padStart(5)}`);
        }
      }
      const pairedByBucket = variants.length > 1 ? Object.fromEntries(results.filter((r) => r !== baseRes).map((r) => [r.label, Object.fromEntries([...new Set(results.flatMap((x) => tabulate(s, x.runs, buckets).map(([b]) => b)))].map((b) => [b, Object.fromEntries(cols.map((c) => [c, pairedDeltaInBucket(s, c, b, baseRes.runs, r.runs, buckets, commonSeeds)]))]))])) : null;

      const slug = (x: unknown) => String(x).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
      const outFile = String(flags.out ?? `experiments/${s.id}${withSpecs.length ? `-with_${slug(withSpecs.join("+"))}` : ""}${flags.vary ? `-vary_${slug(flags.vary)}` : ""}${flags.outcome ? `-${slug(flags.outcome)}` : ""}${flags["split-by"] ? `-by_${slug(flags["split-by"])}` : ""}${flags.buckets ? `-b_${slug(flags.buckets)}` : ""}${flags["split-at"] ? `-at_${slug(flags["split-at"])}` : ""}${excludeIds.size ? `-excl_${slug([...excludeIds].join("_"))}` : ""}-seeds${from}-${from + n - 1}.json`);
      mkdirSync(outFile.replace(/\/[^/]*$/, ""), { recursive: true });
      writeFileSync(outFile, JSON.stringify({ command: process.argv.slice(2).join(" "), scenario: s.id, seeds, with: withSpecs, vary: flags.vary ?? null, outcome: s.socialQuestion.measure.outcome, splitBy, splitAt, buckets: buckets ?? null, exclude: [...excludeIds], pairedOverSeeds: commonSeeds ? [...commonSeeds] : null, outcomeColumns: cols, socialQuestion: s.socialQuestion, variants: results.map((r) => ({ label: r.label, change: r.change, isBase: r.isBase, pooled: pooled(s, r.runs).counts, paired: r === baseRes ? null : Object.fromEntries(cols.map((c) => [c, pairedDelta(c, baseRes.runs, r.runs, commonSeeds)])), table: Object.fromEntries(tabulate(s, r.runs, buckets)), runs: r.runs, runsExcludingVaried: r.runsExcl ?? null })), pairedByBucket, generatedBy: "uncanny-valley experiment (mock brain)" }, null, 1));
      console.log(`\nWritten: ${outFile}  (command, seeds, per-seed per-citizen outcomes with hour-0 traits and lean; same seeds → identical file)`);
      if (flags.format === "md" || flags.format === "csv") {
        const md = flags.format === "md";
        const lines: string[] = [];
        const head = ["variant", ...cols.flatMap((c) => [`${c} share`, `${c} Δ`, `${c} CI`, `${c} seeds ↓/↑`])];
        lines.push(md ? `| ${head.join(" | ")} |` : head.join(","));
        if (md) lines.push(`|${head.map(() => "---").join("|")}|`);
        for (const r of results) { const p = pooled(s, r.runs); const row = [r.label, ...cols.flatMap((c) => { const share = pct((p.counts[c] ?? 0) / p.n); if (r === baseRes) return [share, "", "", ""]; const d = pairedDelta(c, baseRes.runs, r.runs, commonSeeds); return [share, pctPt(d.delta), `${pctPt(d.lo)} to ${pctPt(d.hi)}`, `${d.down}/${d.up}`]; })]; lines.push(md ? `| ${row.join(" | ")} |` : row.join(",")); }
        // split table(s) and the interaction block, long format: one row per bucket × variant × outcome
        lines.push("", md ? `| variant | bucket | outcome | share | n | people | paired Δ vs ${baseLabel} | 95 % CI | seeds ↓/↑ | paired seeds |` : `variant,bucket,outcome,share,n,people,paired_delta,ci_lo,ci_hi,seeds_down,seeds_up,paired_seeds`);
        if (md) lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
        for (const r of results) for (const [b, row] of tabulate(s, r.runs, buckets)) { const tot = Object.values(row).reduce((a, x) => a + x, 0); const people = new Set(r.runs.flatMap((x) => x.citizens.filter((c) => c.choice !== null && bucketLabel(s, c.splitValue, buckets) === b).map((c) => c.id))).size; for (const c of cols) { const d = r === baseRes ? null : pairedDeltaInBucket(s, c, b, baseRes.runs, r.runs, buckets, commonSeeds); const cells = [r.label, b, c, pct((row[c] ?? 0) / tot), String(tot), String(people), d ? pctPt(d.delta) : "", d ? (md ? `${pctPt(d.lo)} to ${pctPt(d.hi)}` : `${pctPt(d.lo)},${pctPt(d.hi)}`) : (md ? "" : ","), d ? (md ? `${d.down}/${d.up}` : `${d.down},${d.up}`) : (md ? "" : ","), d ? String(d.n) : ""]; lines.push(md ? `| ${cells.join(" | ")} |` : cells.join(",")); } }
        const tf = outFile.replace(/\.json$/, md ? ".md" : ".csv"); writeFileSync(tf, lines.join("\n") + "\n"); console.log(`Table:   ${tf}`);
      }
      return;
    }
    case "chronicle":
    case "cycle": {
      if (!args[0]) throw new Error(usage);
      const sc = loadChronicleScenario(args[0]); // resolves castFile and include the same way the live server does
      const brainName = ((flags.brain as string | undefined) ?? "mock") as "mock" | "scripted" | "flash";
      if (!["mock", "scripted", "flash"].includes(brainName)) throw new Error(`--brain must be mock, scripted or flash`);
      const runOne = async (seed: number) => {
        const t0 = performance.now();
        const fb = brainName === "mock" ? null : flashChronicleBrain(brainName === "scripted" ? { scripted: true, scriptedFaultRate: flags["fault-rate"] ? num("fault-rate", 0.01) : undefined } : {});
        const w = await runChronicle(sc, seed, fb ? { brain: fb } : {});
        console.error(`(${Math.round(performance.now() - t0)}ms)${fb ? ` · ${fb.meter.summary()} · fallbacks ${fb.stats.fallbacks}/${fb.stats.calls} · retries ${fb.stats.retries}` : ""}`);
        const { dir, record } = writeChronicleArchive(w, brainName, "archive", fb?.log ?? []);
        console.log(`${sc.title} — seed ${seed} — ${w.souls.length} people — ${sc.years} years\n`);
        for (const s of record.ending.choices) console.log(`  ${s.label.padEnd(12)} ${String(record.outcome[s.id]).padStart(3)}`);
        console.log(`\nDeaths: ${Object.entries(w.stats.deaths).map(([k, v]) => `${k} ${v}`).join(", ")} · ${w.stats.situations} situations · ${w.deeds.length} deeds · ${w.beats.filter((b) => b.level >= 2).length} beats`);
        console.log(`\nVerdicts:`); for (const v of record.verdicts) console.log(`  ${v.title}: ${v.text.slice(0, 160)}${v.text.length > 160 ? "…" : ""}`);
        buildSite(dir); console.log(`\nArchive: ${dir}/record.md · journeys.md · view: ${dir}/index.html`);
        return { w, record };
      };
      if (cmd === "chronicle") { await runOne(num("seed", 1)); return; }
      // cycle: fresh seed each time, kept as data; --count runs several back to back, --every keeps going at that interval (minutes)
      const count = num("count", 1), every = flags.every ? num("every", 60) : 0;
      for (let i = 0; ; i++) {
        const seed = flags.seed && i === 0 ? num("seed", 1) : nextSeed(sc.id);
        const cycle = readCycles(sc.id).length + 1;
        console.log(`\n=== cycle ${cycle} · seed ${seed} · ${new Date().toISOString().slice(0, 16)} ===`);
        const { w, record } = await runOne(seed);
        appendCycle(sc.id, cycleRow(w, record, cycle));
        const { path, h } = writeHistory(sc.id);
        console.log(`\nCycle ${cycle} kept → cycles/${sc.id}/cycles.jsonl · ${path}: extinction ${Math.round(h.extinctionRate * 100)} % over ${h.cycles} cycle${h.cycles === 1 ? "" : "s"}, mean ${h.meanAlive.toFixed(1)} alive`);
        if (!every) { if (i + 1 >= count) return; continue; }
        console.log(`next cycle in ${every} min (Ctrl-C to stop)`); await new Promise((r) => setTimeout(r, every * 60_000));
      }
    }
    case "live": {
      if (!args[0]) throw new Error(usage);
      const sc = loadChronicleScenario(args[0]);
      const brainName = ((flags.brain as string | undefined) ?? "mock") as "mock" | "scripted" | "flash";
      const fb = brainName === "mock" ? undefined : flashChronicleBrain(brainName === "scripted" ? { scripted: true } : {});
      startLive({ scenario: sc, seasonMs: (flags.season ? num("season", 1200) : 1200) * 1000, port: flags.port ? num("port", 8791) : 8791, brain: fb as any, brainName, epilogueMs: flags.epilogue ? num("epilogue", 120) * 1000 : undefined, rotate: flags.rotate === true ? "scenarios/chronicle/generated" : typeof flags.rotate === "string" ? flags.rotate : undefined });
      await new Promise(() => {}); // runs until stopped
    }
    case "history": {
      if (!args[0]) throw new Error(usage);
      const id = args[0].replace(/^scenarios\/chronicle\//, "").replace(/\.json$/, "");
      const { path, md } = writeHistory(id);
      console.log(md); console.log(`→ ${path}`);
      return;
    }
    case "site": {
      const files = buildSite(args[0]);
      console.log(files.map((f) => `  ${f}`).join("\n") + `\nOpen ${args[0] ? files[0] : "archive/index.html"} in a browser (static — no server needed).`);
      return;
    }
    case "cost": {
      if (!args[0]) throw new Error(usage);
      console.log(costEstimate(args[0], (flags.brain as string | undefined) ?? "flash"));
      return;
    }
    case "preflight": {
      const { preflight, report } = await import("./preflight.ts");
      const cs = await preflight({ scenario: args[0], root: typeof flags.root === "string" ? flags.root : undefined, brain: (flags.brain as string | undefined) ?? "flash" });
      console.log(`preflight · ${args[0] ?? "the-many"} · brain ${(flags.brain as string | undefined) ?? "flash"}\n`);
      console.log(report(cs));
      if (cs.some((c) => !c.ok && c.hard)) process.exitCode = 1;
      return;
    }
    case "architect": {
      if (flags.chronicle) {
        const variety = flags["no-dice"] ? null : rollVariety(typeof flags.dice === "string" ? flags.dice : undefined); if (variety) console.log(`the dice:\n${varietyText(variety)}\n`);
        const r = await runChronicleArchitect({ question: flags.question as string | undefined, dryRun: !!flags["dry-run"], llm: (flags.llm as "live" | "scripted" | undefined) ?? "live", maxAttempts: flags.attempts ? num("attempts", 3) : undefined, onLog: (s) => console.log(s), variety });
        if (!r && !flags["dry-run"]) { console.log(`\nNo town accepted. See scenarios/chronicle/generated/last-failure.md`); process.exitCode = 1; }
        if (r) console.log(`\nAccepted: ${r.scenario.id} — ${r.scenario.title} (${r.attempts} attempt${r.attempts > 1 ? "s" : ""}) · ${r.meter.summary()}\n${r.files.map((f) => `  ${f}`).join("\n")}\nRun it: pnpm chronicle ${r.files[0]} --seed 1 · pnpm cycle ${r.files[0]} --count 10`);
        return;
      }
      const r = await runArchitect({ question: flags.question as string | undefined, dryRun: !!flags["dry-run"], llm: (flags.llm as "live" | "scripted" | undefined) ?? "live", maxAttempts: flags.attempts ? num("attempts", 3) : undefined, onLog: (s) => console.log(s) });
      if (!r && !flags["dry-run"]) { console.log(`\nNo scenario accepted. See scenarios/generated/last-failure.md`); process.exitCode = 1; }
      if (r) console.log(`\nAccepted: ${r.scenario.id} — ${r.scenario.title} (${r.attempts} attempt${r.attempts > 1 ? "s" : ""}) · ${r.meter.summary()}\n${r.files.map((f) => `  ${f}`).join("\n")}\nRun it: pnpm world ${r.scenario.id} --seed 1`);
      return;
    }
    case "fork": {
      if (!args[0]) throw new Error(usage);
      const r = await fork(args[0], { seed: flags.seed !== undefined ? num("seed", 1) : undefined, swap: flags.swap as string | undefined, vary: flags.vary as string | undefined, brain: flags.brain as "mock" | "flash" | "scripted" | undefined });
      console.log(r.md);
      buildSite(r.dir); console.log(`Written: ${r.dir}/fork.md · view: ${r.dir}/index.html`);
      return;
    }
    case "watch": {
      if (!args[0]) throw new Error(usage);
      const dir = existsSync(args[0]) ? args[0] : `archive/${args[0]}`;
      if (!existsSync(`${dir}/record.json`)) throw new Error(`no archive at ${dir} — run \`uncanny-valley world <scenario> --seed N\` first`);
      await watch(dir, { tempo: flags.tempo as string | undefined, from: flags.from !== undefined ? num("from", 0) : undefined, to: flags.to !== undefined ? num("to", 72) : undefined });
      return;
    }
    default: console.log(usage);
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
