// Static checks for a chronicle scenario, and a ten-seed soak on the mock brain: does the town live, die, and vary?
import type { ChronicleScenario, DilemmaSpec } from "./types.ts";
import { FX } from "../validate.ts";
import { runChronicle } from "./sim.ts";

export const WHEN_FLAGS = ["starving", "hasFood", "sick", "poor", "rich", "employed", "jobless", "hasFamily", "hasChildren", "hasPartner", "single", "homeless", "housed", "adult", "young", "old", "notOld", "under45", "fewChildren", "wronged", "known:thief", "known:helper", "hardYear"];
export const TARGETS = ["nearby", "single", "partner", "richer", "poorer", "sick", "starving", "homeless", "housed", "friend", "rival", "stranger", "thief", "wrongdoer"];
export const EPOCH_KINDS = ["famine", "plague", "war", "winter", "festival", "reform", "boom", "flood", "fire", "omen"];
export const DEED_KINDS = ["theft", "violence", "betrayal", "abandonment", "lie", "help", "gift", "rescue", "sacrifice", "mercy", "justice", "loyalty"];
export const CAUSES = ["hunger", "sickness", "exposure", "violence", "old age", "childbirth"];
const TRAITS = ["sociable", "bold", "loyal", "restless"];
const PULLS = [...TRAITS, "hunger", "poverty", "danger", "family"];
const TEMPLATES = ["name", "target", "partner", "place", "season", "home", "targetHome"];

export function validateChronicle(raw: unknown): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const err = (p: string, m: string) => errors.push(`${p}: ${m}`);
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["scenario: not an object"], warnings };
  const s = raw as Partial<ChronicleScenario> & Record<string, any>;
  if (s.mode !== "chronicle") err("mode", `must be "chronicle"`);
  if (typeof s.id !== "string" || !/^[a-z0-9-]{3,40}$/.test(s.id)) err("id", "a slug of 3–40 lowercase letters, digits and dashes");
  for (const k of ["title", "premise"]) if (typeof s[k] !== "string" || !s[k].trim()) err(k, "required");
  if (typeof s.years !== "number" || s.years < 5 || s.years > 30) err("years", "5–30");
  if (!s.fingerprint || ["setting", "pressure", "endingShape", "dynamic"].some((k) => typeof s.fingerprint?.[k] !== "string")) err("fingerprint", "setting/pressure/endingShape/dynamic strings");
  if (!s.socialQuestion || typeof s.socialQuestion.text !== "string" || typeof s.socialQuestion.hypothesis !== "string") err("socialQuestion", "text + hypothesis");
  const locs = Array.isArray(s.locations) ? s.locations : []; const locIds = new Set<string>();
  if (locs.length < 3) err("locations", "at least 3");
  locs.forEach((l: any, i: number) => { const p = `locations[${i}]`; if (typeof l?.id !== "string") err(p, "id"); else if (locIds.has(l.id)) err(p, `duplicate id ${l.id}`); else locIds.add(l.id); if (typeof l?.name !== "string") err(`${p}.name`, "required"); if (!Array.isArray(l?.tags)) err(`${p}.tags`, "array"); for (const k of ["x", "y"]) if (l?.[k] !== undefined && (typeof l[k] !== "number" || l[k] < 0 || l[k] > 1)) err(`${p}.${k}`, "0–1"); });
  if (!locs.some((l: any) => Array.isArray(l?.tags) && l.tags.includes("home"))) err("locations", `at least one location tagged "home" (people need somewhere to live)`);
  (Array.isArray(s.paths) ? s.paths : []).forEach((p: any, i: number) => { if (!Array.isArray(p) || p.length !== 2 || !locIds.has(p[0]) || !locIds.has(p[1])) err(`paths[${i}]`, "two known location ids"); });
  const jobs = Array.isArray(s.jobs) ? s.jobs : []; const jobIds = new Set<string>();
  if (jobs.length < 2) err("jobs", "at least 2");
  jobs.forEach((j: any, i: number) => { const p = `jobs[${i}]`; if (typeof j?.id !== "string") err(p, "id"); else if (jobIds.has(j.id)) err(p, `duplicate id ${j.id}`); else jobIds.add(j.id); if (typeof j?.name !== "string") err(`${p}.name`, "required"); if (!locIds.has(j?.at)) err(`${p}.at`, `unknown location "${j?.at}"`); if (typeof j?.pay !== "number" || j.pay < 0.03 || j.pay > 0.3) err(`${p}.pay`, "0.03–0.3 per season (0.06 farmhand, 0.12 publican)"); if (j?.risk !== undefined && (typeof j.risk !== "number" || j.risk < 0 || j.risk > 0.2)) err(`${p}.risk`, "0–0.2 chance per season of injury"); });
  const ticks = (s.years ?? 0) * 4;
  const epochs = Array.isArray(s.epochs) ? s.epochs : []; const epochIds = new Set<string>();
  if (epochs.length < 3) err("epochs", "at least 3 (a famine, a sickness or a war among them)");
  epochs.forEach((e: any, i: number) => { const p = `epochs[${i}]`; if (typeof e?.id !== "string") err(p, "id"); else if (epochIds.has(e.id)) err(p, `duplicate id ${e.id}`); else epochIds.add(e.id); if (!EPOCH_KINDS.includes(e?.kind)) err(`${p}.kind`, `one of ${EPOCH_KINDS.join(" | ")}`); if (!Number.isFinite(e?.at) || e.at < 2 || e.at > ticks) err(`${p}.at`, `tick 2–${ticks}`); if (typeof e?.seasons !== "number" || e.seasons < 1 || e.seasons > 8) err(`${p}.seasons`, "1–8"); if (![1, 2, 3].includes(e?.severity)) err(`${p}.severity`, "1 | 2 | 3"); if (typeof e?.headline !== "string" || !e.headline) err(`${p}.headline`, "required"); if (e?.fx !== undefined && !FX.includes(String(e.fx))) err(`${p}.fx`, `unknown effect "${e.fx}" — use ${FX.join(" | ")}`); });
  if (!epochs.some((e: any) => ["famine", "plague", "war"].includes(e?.kind))) warnings.push("epochs: no famine, plague or war — nothing will kill anyone but age");
  const cits = Array.isArray(s.citizens) ? s.citizens : []; const citIds = new Set<string>();
  if (cits.length < 4) err("citizens", "at least 4 named people");
  cits.forEach((c: any, i: number) => { const p = `citizens[${i}]`; if (typeof c?.id !== "string") err(p, "id"); else if (citIds.has(c.id)) err(p, `duplicate id ${c.id}`); else citIds.add(c.id); for (const k of ["name", "role", "want", "fear"]) if (typeof c?.[k] !== "string" || !c[k]) err(`${p}.${k}`, "required"); if (typeof c?.age !== "number" || c.age < 14 || c.age > 90) err(`${p}.age`, "14–90"); for (const t of TRAITS) if (typeof c?.traits?.[t] !== "number" || c.traits[t] < 0 || c.traits[t] > 1) err(`${p}.traits.${t}`, "0–1"); if (c?.home !== null && !locIds.has(c?.home)) err(`${p}.home`, `unknown location "${c?.home}" (or null)`); if (c?.job !== null && c?.job !== undefined && !jobIds.has(c.job)) err(`${p}.job`, `unknown job "${c.job}" (or null)`); });
  cits.forEach((c: any, i: number) => { if (c?.partner && !citIds.has(c.partner)) err(`citizens[${i}].partner`, `unknown citizen "${c.partner}"`); for (const t of c?.ties ?? []) if (!citIds.has(t?.to)) err(`citizens[${i}].ties`, `unknown citizen "${t?.to}"`); });
  const total = cits.length + (s.fill?.count ?? 0);
  if (s.fill !== undefined && (typeof s.fill?.count !== "number" || s.fill.count < 0 || s.fill.count > 60)) err("fill.count", "0–60");
  if (total < 6 || total > 60) err("citizens+fill", `${total} people — a town is 6–60`);
  const dil = Array.isArray(s.dilemmas) ? s.dilemmas : []; const dilIds = new Set<string>();
  dil.forEach((d: DilemmaSpec, i: number) => {
    const p = `dilemmas[${i}]`;
    if (typeof d?.id !== "string") err(p, "id"); else if (dilIds.has(d.id)) err(p, `duplicate id ${d.id}`); else dilIds.add(d.id);
    if (!Array.isArray(d?.when) || !d.when.length) err(`${p}.when`, "at least one flag");
    else for (const w of d.when) if (!WHEN_FLAGS.includes(w) && !/^epoch:(famine|plague|war|winter|festival|reform|boom|flood|fire|omen)$/.test(w) && !/^season:[0-3]$/.test(w) && !/^job:[a-z0-9-]+$/.test(w)) err(`${p}.when`, `unknown flag "${w}" — the whole list is: ${WHEN_FLAGS.join(", ")}, epoch:famine, epoch:plague, epoch:war, epoch:winter, epoch:festival, epoch:reform, epoch:boom, epoch:flood, epoch:fire, epoch:omen, season:0, season:1, season:2, season:3, job:<a job id>`);
    if (d?.target !== undefined && !TARGETS.includes(d.target)) err(`${p}.target`, `unknown target "${d.target}" — use ${TARGETS.join(" | ")}`);
    if (typeof d?.weight !== "number" || d.weight <= 0 || d.weight > 5) err(`${p}.weight`, "0–5");
    if (typeof d?.text !== "string" || !d.text) err(`${p}.text`, "required");
    else { for (const m of d.text.matchAll(/\{\{(\w+)\}\}/g)) if (!TEMPLATES.includes(m[1])) err(`${p}.text`, `unknown template {{${m[1]}}}`); if (/\{\{target\}\}/.test(d.text) && !d.target) err(`${p}.text`, "uses {{target}} but the dilemma has no target"); }
    if (!Array.isArray(d?.options) || d.options.length < (d?.casual ? 1 : 2)) err(`${p}.options`, d?.casual ? "at least 1" : "at least 2 — a dilemma is a choice");
    (d?.options ?? []).forEach((o, k) => {
      const q = `${p}.options[${k}]`;
      if (typeof o?.id !== "string" || typeof o?.label !== "string") err(q, "id + label");
      for (const key of Object.keys(o?.pull ?? {})) if (!PULLS.includes(key)) err(`${q}.pull`, `unknown factor "${key}" — use ${PULLS.join(", ")}`);
      const sum = (o?.outcomes ?? []).reduce((a, x) => a + (x?.chance ?? 0), 0);
      if (!Array.isArray(o?.outcomes) || !o.outcomes.length) err(`${q}.outcomes`, "at least one");
      else if (Math.abs(sum - 1) > 1e-6) err(`${q}.outcomes`, `chances sum to ${sum.toFixed(2)}, not 1`);
      for (const x of o?.outcomes ?? []) { if (typeof x?.text !== "string") err(`${q}.outcomes`, "each outcome needs text"); if (x?.deed && !DEED_KINDS.includes(x.deed.kind)) err(`${q}.outcomes.deed`, `unknown kind "${x.deed.kind}"`); if (x?.die && !CAUSES.includes(x.die)) err(`${q}.outcomes.die`, `unknown cause "${x.die}"`); if (x?.targetDie && !CAUSES.includes(x.targetDie)) err(`${q}.outcomes.targetDie`, `unknown cause "${x.targetDie}"`); if ((x?.target || x?.targetDie) && !d.target) err(`${q}.outcomes`, "has a target effect but the dilemma has no target"); for (const dd of [x?.self, x?.target]) for (const key of Object.keys(dd ?? {})) if (!["health", "food", "money", "mood", "children", "tie", "sick", "home", "job", "partner"].includes(key)) err(`${q}.outcomes`, `unknown delta "${key}"`); }
    });
  });
  return { ok: errors.length === 0, errors, warnings };
}

export interface ChronicleSoak { seeds: number; meanAlive: number; extinct: number; causes: Record<string, number>; shares: Record<string, number>; dilemmaUse: Record<string, number>; epochReach: Record<string, number>; problems: string[]; lines: string[] }

/** Ten fifteen-years on the mock: the town must neither die out nor coast, deaths must come from more than one place, and every written dilemma must actually be offered. */
export async function soakChronicle(sc: ChronicleScenario, seeds = 10, o: { dominance?: number } = {}): Promise<ChronicleSoak> {
  const causes: Record<string, number> = {}; const dilemmaUse: Record<string, number> = {}; const epochReach: Record<string, number> = {};
  let alive = 0, extinct = 0, deaths = 0; const n = Math.min(sc.cast?.length ?? sc.citizens.length, sc.cast ? (sc.castPick ?? 4) : sc.citizens.length) + (sc.fill?.count ?? 0);
  for (const d of sc.dilemmas ?? []) dilemmaUse[d.id] = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const w = await runChronicle(sc, seed);
    const last = w.population.at(-1)!; alive += last.alive; if (last.alive === 0) extinct++;
    for (const [k, v] of Object.entries(w.stats.deaths)) { causes[k] = (causes[k] ?? 0) + v; deaths += v; }
    for (const s of w.souls) for (const k of Object.keys(s.lastSeen)) if (k in dilemmaUse) dilemmaUse[k]++;
    for (const e of sc.epochs) epochReach[e.id] = (epochReach[e.id] ?? 0) + (w.population.find((p) => p.tick === e.at)?.alive ?? 0) / seeds;
  }
  const meanAlive = alive / seeds; const shares = Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, deaths ? v / deaths : 0]));
  const problems: string[] = [];
  if (extinct > seeds / 2) problems.push(`the town dies out in ${extinct}/${seeds} seeds — soften the epochs (severity, seasons) or raise pay`);
  if (meanAlive / n > 0.85) problems.push(`${Math.round(meanAlive / n * 100)} % alive at the end on average — nothing is at stake; harden an epoch or lower pay`);
  if (meanAlive / n < 0.1 && extinct <= seeds / 2) problems.push(`${Math.round(meanAlive / n * 100)} % alive at the end on average — too lethal to read as a town`);
  if (Object.keys(causes).length < 3) problems.push(`only ${Object.keys(causes).length} cause(s) of death (${Object.keys(causes).join(", ")}) — a chronicle needs hunger, sickness, exposure or violence in play`);
  const dominance = o.dominance ?? 0.6; /* a town whose whole premise is a plague may honestly kill mostly by sickness; the command line holds the tighter bar, the live Architect a looser one */
  for (const [k, v] of Object.entries(shares)) if (v > dominance) problems.push(`${Math.round(v * 100)} % of deaths are ${k} — one cause dominates`);
  for (const [id, uses] of Object.entries(dilemmaUse)) if (uses < seeds) problems.push(`dilemma "${id}" was offered ${uses} times in ${seeds} fifteen-years — its "when"/target never holds; loosen it or cut it`);
  const lines = [
    `Ten seeds: mean ${meanAlive.toFixed(1)} / ${n} alive at the end, ${extinct} extinct.`,
    `Deaths: ${Object.entries(shares).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v * 100)} %`).join(", ") || "none"}.`,
    `Epoch reach (mean alive when it strikes): ${sc.epochs.map((e) => `${e.id} ${epochReach[e.id]?.toFixed(1)}`).join(", ")}.`,
    ...(Object.keys(dilemmaUse).length ? [`Written dilemmas offered (total over ${seeds} seeds): ${Object.entries(dilemmaUse).map(([k, v]) => `${k} ${v}`).join(", ")}.`] : []),
  ];
  return { seeds, meanAlive, extinct, causes, shares, dilemmaUse, epochReach, problems, lines };
}
