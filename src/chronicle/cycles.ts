// Cycles: a chronicle run every hour (or on demand), each one kept as data, and a history that reads across them —
// how often the town dies out, who tends to survive, and which deeds go with an early grave.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Chronicle } from "./sim.ts";
import type { ChronicleRecord } from "./archive.ts";
import type { Deed } from "./types.ts";

export interface CycleRow {
  cycle: number; seed: number; runId: string; brain: string; at: string; years: number;
  alive: number; dead: number; gone: number; extinct: boolean;
  deaths: Record<string, number>; deeds: number; harm: number; help: number; fallbackRate: number;
  verdicts: { title: string; who: string[] }[];
  people: { id: string; name: string; named: boolean; role: string; alive: boolean; left: boolean; cause: string | null; diedAt: number | null; leftAt: number | null; turnedAt?: number | null; harm: number; help: number; children: number; deeds: { kind: string; tick: number; harm: number; help: number }[] }[];
}

export const cyclesDir = (scenarioId: string, root = "cycles") => join(root, scenarioId);

export function readCycles(scenarioId: string, root = "cycles"): CycleRow[] {
  const f = join(cyclesDir(scenarioId, root), "cycles.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as CycleRow);
}

export function nextSeed(scenarioId: string, root = "cycles"): number {
  const rows = readCycles(scenarioId, root);
  return rows.length ? Math.max(...rows.map((r) => r.seed)) + 1 : 1;
}

export function cycleRow(w: Chronicle, r: ChronicleRecord, cycle: number, at = new Date().toISOString()): CycleRow {
  const last = w.population.at(-1)!;
  return {
    cycle, seed: w.seed, runId: r.runId, brain: r.brain, at, years: w.scenario.years,
    alive: last.alive, dead: last.dead, gone: last.left, extinct: last.alive === 0,
    deaths: { ...w.stats.deaths }, deeds: w.deeds.length,
    harm: +w.deeds.reduce((a, d) => a + d.harm, 0).toFixed(2), help: +w.deeds.reduce((a, d) => a + d.help, 0).toFixed(2), fallbackRate: r.stats.fallbackRate,
    verdicts: r.verdicts.map((v) => ({ title: v.title, who: v.who })),
    people: w.souls.map((s) => ({ id: s.id, name: s.name, named: s.named, role: s.role, alive: s.alive && !s.left, left: s.left, cause: s.cause, diedAt: s.diedAt, leftAt: s.leftAt, turnedAt: s.turnedAt, harm: +s.deeds.reduce((a, d: Deed) => a + d.harm, 0).toFixed(2), help: +s.deeds.reduce((a, d: Deed) => a + d.help, 0).toFixed(2), children: s.children, deeds: s.deeds.map((d: Deed) => ({ kind: d.kind, tick: d.tick, harm: d.harm, help: d.help })) })),
  };
}

export function appendCycle(scenarioId: string, row: CycleRow, root = "cycles") {
  const dir = cyclesDir(scenarioId, root); mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "cycles.jsonl"), JSON.stringify(row) + "\n");
}

export interface History {
  cycles: number; extinctionRate: number; meanAlive: number; meanDead: number; meanGone: number;
  causes: { cause: string; share: number; perCycle: number }[];
  named: { id: string; name: string; role: string; survival: number; turned: number; killed: number; meanHarm: number; meanHelp: number; usualEnd: string; cycles: number }[];
  /** exposure-controlled: among people alive and present at season `cut`, did they do the kind before it, and did they die after it */
  cut: number; cohort: number; baseRate: number;
  /** lift = risk ratio; lo/hi = 95 % interval on it (log risk ratio ± 1.96·SE); z = two-proportion z; clear = the interval excludes 1 */
  deedsAndDeath: { kind: string; did: number; not: number; deathRateDid: number; deathRateNot: number; lift: number; lo: number; hi: number; z: number; clear: boolean }[];
  /** harm and help per 60 seasons alive, so a short life is not counted as a quiet one */
  harmAndDeath: { survivorsHarm: number; deadHarm: number; survivorsHelp: number; deadHelp: number };
  verdictRegulars: { title: string; name: string; times: number }[];
  worst: { runId: string; alive: number } | null; best: { runId: string; alive: number } | null;
}

export function history(rows: CycleRow[]): History {
  const n = rows.length;
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const causeTotals: Record<string, number> = {}; let deaths = 0;
  for (const r of rows) for (const [k, v] of Object.entries(r.deaths)) { causeTotals[k] = (causeTotals[k] ?? 0) + v; deaths += v; }
  const causes = Object.entries(causeTotals).sort((a, b) => b[1] - a[1]).map(([cause, v]) => ({ cause, share: deaths ? v / deaths : 0, perCycle: n ? v / n : 0 }));
  const people = rows.flatMap((r) => r.people);
  const byNamed = new Map<string, CycleRow["people"]>();
  for (const p of people) if (p.named) (byNamed.get(p.id) ?? byNamed.set(p.id, []).get(p.id)!).push(p);
  const named = [...byNamed.entries()].map(([id, ps]) => {
    const ends: Record<string, number> = {}; for (const p of ps) { const e = p.alive ? "alive" : p.left ? "gone" : p.cause ?? "dead"; ends[e] = (ends[e] ?? 0) + 1; }
    return { id, name: ps[0].name, role: ps[0].role, survival: mean(ps.map((p) => p.alive ? 1 : 0)), turned: mean(ps.map((p) => p.turnedAt ? 1 : 0)), killed: mean(ps.map((p) => p.deeds.some((d) => d.harm >= 0.9) ? 1 : 0)), meanHarm: mean(ps.map((p) => p.harm)), meanHelp: mean(ps.map((p) => p.help)), usualEnd: Object.entries(ends).sort((a, b) => b[1] - a[1])[0][0], cycles: ps.length };
  }).sort((a, b) => b.survival - a.survival);
  // Deeds vs death, with the survivorship confound taken out: every deed kind has its season (the war's loyalty, the famine's
  // sacrifice), so "did it" mostly means "was alive then". Cohort = alive and present at the cut; exposure = deeds before the cut;
  // outcome = died after it. Ticks are per person, so each seed's calendar is used as it was.
  const cut = rows.length ? Math.floor(rows[0].years * 4 / 2) : 30;
  const present = (p: CycleRow["people"][number]) => (p.diedAt === null || p.diedAt > cut) && (p.leftAt === null || p.leftAt > cut);
  const cohort = people.filter(present);
  const diedAfter = (p: CycleRow["people"][number]) => p.diedAt !== null && p.diedAt > cut ? 1 : 0;
  const kinds = [...new Set(people.flatMap((p) => p.deeds.map((d) => d.kind)))];
  const baseRate = mean(cohort.map(diedAfter));
  const deedsAndDeath = kinds.map((kind) => {
    const did = cohort.filter((p) => p.deeds.some((d) => d.kind === kind && d.tick <= cut)), not = cohort.filter((p) => !p.deeds.some((d) => d.kind === kind && d.tick <= cut));
    const a = did.filter(diedAfter).length, b = not.filter(diedAfter).length, n1 = did.length, n2 = not.length;
    const p1 = n1 ? a / n1 : 0, p2 = n2 ? b / n2 : 0;
    // risk ratio with a 95 % interval on the log scale; a 0.5 continuity term keeps empty cells finite
    const rr = (p2 || 0.5 / Math.max(1, n2)) ? (p1 || 0.5 / Math.max(1, n1)) / (p2 || 0.5 / Math.max(1, n2)) : 0;
    const se = Math.sqrt(1 / Math.max(0.5, a) - 1 / Math.max(1, n1) + 1 / Math.max(0.5, b) - 1 / Math.max(1, n2));
    const lo = Math.exp(Math.log(rr) - 1.96 * se), hi = Math.exp(Math.log(rr) + 1.96 * se);
    const pp = (a + b) / Math.max(1, n1 + n2), z = n1 && n2 && pp > 0 && pp < 1 ? (p1 - p2) / Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)) : 0;
    return { kind, did: n1, not: n2, deathRateDid: p1, deathRateNot: p2, lift: rr, lo, hi, z, clear: lo > 1 || hi < 1 };
  }).filter((x) => x.did >= 5 && x.not >= 5).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const yearsOf = new Map<CycleRow["people"][number], number>(); for (const r of rows) for (const p of r.people) yearsOf.set(p, r.years);
  const seasons = (p: CycleRow["people"][number]) => Math.max(1, p.diedAt ?? p.leftAt ?? (yearsOf.get(p) ?? 15) * 4);
  const per60 = (ps: CycleRow["people"][number][], key: "harm" | "help") => mean(ps.map((p) => p[key] / seasons(p) * 60));
  const survivors = people.filter((p) => p.alive), gone = people.filter((p) => !p.alive && !p.left);
  const harmAndDeath = { survivorsHarm: per60(survivors, "harm"), deadHarm: per60(gone, "harm"), survivorsHelp: per60(survivors, "help"), deadHelp: per60(gone, "help") };
  const vr = new Map<string, number>(); const nameOf = new Map(people.map((p) => [p.id, p.name]));
  for (const r of rows) for (const v of r.verdicts) for (const who of v.who) if (people.find((p) => p.id === who)?.named) vr.set(`${v.title}|${who}`, (vr.get(`${v.title}|${who}`) ?? 0) + 1);
  const verdictRegulars = [...vr.entries()].map(([k, times]) => ({ title: k.split("|")[0], name: nameOf.get(k.split("|")[1]) ?? k.split("|")[1], times })).filter((x) => x.times >= 2).sort((a, b) => b.times - a.times).slice(0, 12);
  const sorted = [...rows].sort((a, b) => a.alive - b.alive);
  return {
    cycles: n, extinctionRate: mean(rows.map((r) => r.extinct ? 1 : 0)), meanAlive: mean(rows.map((r) => r.alive)), meanDead: mean(rows.map((r) => r.dead)), meanGone: mean(rows.map((r) => r.gone)),
    causes, named, cut, cohort: cohort.length, baseRate, deedsAndDeath, harmAndDeath, verdictRegulars,
    worst: sorted[0] ? { runId: sorted[0].runId, alive: sorted[0].alive } : null, best: sorted.at(-1) ? { runId: sorted.at(-1)!.runId, alive: sorted.at(-1)!.alive } : null,
  };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function renderHistory(scenarioId: string, rows: CycleRow[], h: History): string {
  const L: string[] = [`# ${scenarioId} — ${h.cycles} cycle${h.cycles === 1 ? "" : "s"}`, ""];
  if (!h.cycles) return L.concat("No cycles yet. `pnpm cycle <scenario>` runs one.").join("\n");
  L.push(`${rows[0].years} years each · ${rows[0].people.length} people · brains: ${[...new Set(rows.map((r) => r.brain))].join(", ")} · first ${rows[0].at.slice(0, 16)} · last ${rows.at(-1)!.at.slice(0, 16)}`, "");
  L.push(`## The odds`, "", `- **Extinction rate: ${pct(h.extinctionRate)}** (${rows.filter((r) => r.extinct).length} of ${h.cycles} cycles ended with nobody alive)`, `- On average ${h.meanAlive.toFixed(1)} alive, ${h.meanDead.toFixed(1)} dead, ${h.meanGone.toFixed(1)} gone`, `- Best cycle: ${h.best!.runId} (${h.best!.alive} alive) · worst: ${h.worst!.runId} (${h.worst!.alive} alive)`, "");
  L.push(`## What kills`, "", `| cause | share of deaths | per cycle |`, `|---|---|---|`, ...h.causes.map((c) => `| ${c.cause} | ${pct(c.share)} | ${c.perCycle.toFixed(1)} |`), "");
  L.push(`## Who survives`, "", `Named people across cycles. Survival is the share of cycles they were alive at the end.`, "", `| person | role | survival | usual end | mean harm | mean help |`, `|---|---|---|---|---|---|`, ...h.named.map((p) => `| ${p.name} | ${p.role} | ${pct(p.survival)} | ${p.usualEnd} | ${p.meanHarm.toFixed(1)} | ${p.meanHelp.toFixed(1)} |`), "");
  const clear = h.deedsAndDeath.filter((d) => d.clear);
  L.push(`## Deeds and death`, "", `Among the ${h.cohort} people alive and still in town at season ${h.cut} (year ${Math.ceil(h.cut / 4)}), **${pct(h.baseRate)} died afterwards**. Per kind of deed: the death rate afterwards of those who had done it by then, against those who had not, as a risk ratio with a 95 % interval. Lift > 1: the deed goes with an early grave; < 1: with survival. This controls for how long people lived — a deed kind that only happens in the war is not credited with the survival of everyone who reached the war. Sorted by how far the row is from noise; a row whose interval spans ×1.00 is **within noise** and says nothing yet. Groups under 5 are left out.`, "", `| deed by season ${h.cut} | did it | didn't | died after (did) | died after (didn't) | lift | 95 % | z | |`, `|---|---|---|---|---|---|---|---|---|`, ...h.deedsAndDeath.map((d) => `| ${d.kind} | ${d.did} | ${d.not} | ${pct(d.deathRateDid)} | ${pct(d.deathRateNot)} | ×${d.lift.toFixed(2)} | ×${d.lo.toFixed(2)}–×${d.hi.toFixed(2)} | ${d.z >= 0 ? "+" : ""}${d.z.toFixed(1)} | ${d.clear ? "**clears noise**" : "within noise"} |`), "");
  L.push(`${h.cycles} cycle${h.cycles === 1 ? "" : "s"}: ${clear.length} of ${h.deedsAndDeath.length} rows clear noise${clear.length ? ` (${clear.map((d) => `${d.kind} ×${d.lift.toFixed(2)}`).join(", ")})` : ""}. ${clear.length < h.deedsAndDeath.length ? "Intervals narrow with the square root of the cohort: run more with \`pnpm cycle <scenario> --count N\` before reading anything into the rest." : "Every row clears noise."}`, "");
  L.push(`Per sixty seasons alive, survivors did ${h.harmAndDeath.survivorsHarm.toFixed(2)} harm and ${h.harmAndDeath.survivorsHelp.toFixed(2)} help; the dead ${h.harmAndDeath.deadHarm.toFixed(2)} and ${h.harmAndDeath.deadHelp.toFixed(2)}.`, "");
  if (h.verdictRegulars.length) L.push(`## Verdict regulars`, "", ...h.verdictRegulars.map((v) => `- **${v.title}**: ${v.name}, ${v.times} times`), "");
  L.push(`## Cycles`, "", `| # | seed | run | alive | dead | gone | deaths |`, `|---|---|---|---|---|---|---|`, ...rows.map((r) => `| ${r.cycle} | ${r.seed} | ${r.runId} | ${r.alive} | ${r.dead} | ${r.gone} | ${Object.entries(r.deaths).map(([k, v]) => `${k} ${v}`).join(", ")} |`), "");
  return L.join("\n");
}

export function writeHistory(scenarioId: string, root = "cycles"): { path: string; md: string; h: History } {
  const rows = readCycles(scenarioId, root);
  const h = history(rows); const md = renderHistory(scenarioId, rows, h);
  const dir = cyclesDir(scenarioId, root); mkdirSync(dir, { recursive: true });
  const path = join(dir, "history.md"); writeFileSync(path, md);
  return { path, md, h };
}
