// Scenario validator: schema + referential integrity + density rules (docs/PACING.md §2).
// No dependencies; errors are path-annotated so a scenario author can fix them without reading engine code.
import { TRAITS, type Scenario } from "./types.ts";

export interface Validation { ok: boolean; errors: string[]; warnings: string[] }

export const PULL_FACTORS = ["bonds", "means", "mood"] as const;
export const FX = ["rain", "storm", "quake", "fog", "fire", "snow", "flood", "eclipse", "aurora", "swarm", "silence"];
export const SPLIT_BY = ["topTieAffinity", "lean0"] as const;

const MIN_CAST = 20, MAX_CAST = 40;

export function validateScenario(s: unknown): Validation {
  const errors: string[] = [], warnings: string[] = [];
  const err = (p: string, m: string) => errors.push(`${p}: ${m}`);
  const warn = (p: string, m: string) => warnings.push(`${p}: ${m}`);
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  const str = (p: string, v: unknown, min = 1) => { if (typeof v !== "string" || v.trim().length < min) err(p, `must be a non-empty string`); };
  const num = (p: string, v: unknown, lo = -Infinity, hi = Infinity) => { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) err(p, `must be a number in [${lo}, ${hi}]`); };
  const arr = (p: string, v: unknown, min = 0): v is unknown[] => { if (!Array.isArray(v) || v.length < min) { err(p, `must be an array with at least ${min} item(s)`); return false; } return true; };
  const slug = (t: string) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((w, i) => i ? w[0].toUpperCase() + w.slice(1) : w).join("");

  if (!isObj(s)) return { ok: false, errors: ["scenario: must be a JSON object"], warnings };
  const sc = s as unknown as Scenario;

  str("id", sc.id); if (typeof sc.id === "string" && !/^[a-z0-9-]+$/.test(sc.id)) err("id", "must be a lowercase slug (a-z, 0-9, -)");
  str("title", sc.title); str("premise", sc.premise, 20);
  num("boardingHours", sc.boardingHours, 0); num("playerSlots", sc.playerSlots, 0);

  // fingerprint
  if (!isObj(sc.fingerprint)) err("fingerprint", "required { setting, pressure, endingShape, dynamic }");
  else for (const k of ["setting", "pressure", "endingShape", "dynamic"]) str(`fingerprint.${k}`, (sc.fingerprint as any)[k]);

  // clock + tempo
  if (!isObj(sc.clock)) err("clock", "required { hours, decisionEveryHours, reflectionAt }");
  else {
    num("clock.hours", sc.clock.hours, 6, 240);
    num("clock.decisionEveryHours", sc.clock.decisionEveryHours, 1, 12);
    if (arr("clock.reflectionAt", sc.clock.reflectionAt)) sc.clock.reflectionAt.forEach((h, i) => num(`clock.reflectionAt[${i}]`, h, 1, (sc.clock?.hours ?? 72) - 1));
  }
  if (!isObj(sc.tempo)) err("tempo", `required { preset: "live"|"day"|"instant" } or { realMinutesPerHour }`);
  else if ("preset" in sc.tempo) { if (!["live", "day", "instant"].includes(sc.tempo.preset)) err("tempo.preset", `must be live | day | instant`); }
  else num("tempo.realMinutesPerHour", (sc.tempo as any).realMinutesPerHour, 0);
  const hours = sc.clock?.hours ?? 72;

  // locations + paths
  const locIds = new Set<string>();
  if (arr("locations", sc.locations, 2)) sc.locations.forEach((l, i) => {
    str(`locations[${i}].id`, l?.id); str(`locations[${i}].name`, l?.name);
    if (!Array.isArray(l?.tags)) err(`locations[${i}].tags`, "must be an array of strings");
    if (l?.id) { if (locIds.has(l.id)) err(`locations[${i}].id`, `duplicate "${l.id}"`); locIds.add(l.id); }
  });
  const adj = new Map<string, Set<string>>();
  if (arr("paths", sc.paths, 1)) sc.paths.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) return err(`paths[${i}]`, "must be [fromId, toId]");
    for (const id of p) if (!locIds.has(id)) err(`paths[${i}]`, `unknown location "${id}"`);
    if (p[0] === p[1]) err(`paths[${i}]`, "a path must join two different locations");
    (adj.get(p[0]) ?? adj.set(p[0], new Set()).get(p[0])!).add(p[1]);
    (adj.get(p[1]) ?? adj.set(p[1], new Set()).get(p[1])!).add(p[0]);
  });
  if (locIds.size && errors.length === 0) { // connectivity
    const seen = new Set<string>(); const stack = [[...locIds][0]];
    while (stack.length) { const x = stack.pop()!; if (seen.has(x)) continue; seen.add(x); for (const y of adj.get(x) ?? []) stack.push(y); }
    for (const id of locIds) if (!seen.has(id)) err("paths", `location "${id}" is unreachable — add a path to it`);
  }

  // resources + beliefs
  const resIds = new Set<string>(), beliefIds = new Set<string>();
  (sc.resources ?? []).forEach((r, i) => { str(`resources[${i}].id`, r?.id); num(`resources[${i}].initial`, r?.initial); num(`resources[${i}].perHour`, r?.perHour); if (r?.id) resIds.add(r.id); });
  (sc.beliefs ?? []).forEach((b, i) => { str(`beliefs[${i}].id`, b?.id); str(`beliefs[${i}].text`, b?.text); num(`beliefs[${i}].initial`, b?.initial, 0, 1); if (b?.id) { if (beliefIds.has(b.id)) err(`beliefs[${i}].id`, `duplicate "${b.id}"`); beliefIds.add(b.id); } });

  // ending
  const choiceIds = new Set<string>();
  if (!isObj(sc.ending) || !arr("ending.choices", sc.ending?.choices, 2)) err("ending", "required { prompt, choices[2..4] }");
  else {
    str("ending.prompt", sc.ending.prompt);
    if (sc.ending.choices.length > 4) err("ending.choices", "at most 4 choices");
    sc.ending.choices.forEach((c, i) => {
      const p = `ending.choices[${i}]`;
      str(`${p}.id`, c?.id); str(`${p}.label`, c?.label);
      if (c?.id) { if (choiceIds.has(c.id)) err(`${p}.id`, `duplicate "${c.id}"`); choiceIds.add(c.id); }
      if (!isObj(c?.pull) || Object.keys(c.pull).length === 0) return err(`${p}.pull`, "required: at least one factor weight");
      let hasTrait = false, hasBelief = false, hasBonds = false;
      for (const [k, v] of Object.entries(c.pull)) {
        num(`${p}.pull.${k}`, v, -2, 2);
        if ((PULL_FACTORS as readonly string[]).includes(k)) { if (k === "bonds") hasBonds = true; continue; }
        const [kind, rest] = k.split(":", 2);
        if (kind === "trait") { if (!(TRAITS as readonly string[]).includes(rest)) err(`${p}.pull.${k}`, `unknown trait; use ${TRAITS.join("|")}`); hasTrait = true; }
        else if (kind === "belief") { if (!beliefIds.has(rest)) err(`${p}.pull.${k}`, `unknown belief "${rest}"`); hasBelief = true; }
        else if (kind === "fear" || kind === "want") { if (!rest) err(`${p}.pull.${k}`, "needs a slug, e.g. fear:beingForgotten"); }
        else err(`${p}.pull.${k}`, `unknown factor; use bonds | means | mood | trait:<name> | belief:<id> | fear:<slug> | want:<slug>`);
      }
      if (!hasTrait || !hasBelief || !hasBonds) warn(`${p}.pull`, "Architect rule: each choice should reference at least one trait, one belief, and bonds");
    });
  }

  // events (density rules)
  const eventIds = new Set<string>();
  if (arr("events", sc.events, 3)) {
    const sorted = [...sc.events].map((e, i) => ({ e, i })).sort((a, b) => (a.e?.at ?? 0) - (b.e?.at ?? 0));
    sc.events.forEach((e, i) => {
      const p = `events[${i}]`;
      str(`${p}.id`, e?.id); str(`${p}.headline`, e?.headline); str(`${p}.text`, e?.text);
      if (e?.id) { if (eventIds.has(e.id)) err(`${p}.id`, `duplicate "${e.id}"`); eventIds.add(e.id); }
      num(`${p}.at`, e?.at, 0, hours); num(`${p}.jitterHours`, e?.jitterHours, 0, 12); num(`${p}.chance`, e?.chance, 0.05, 1);
      if (![1, 2, 3].includes(e?.stakes)) err(`${p}.stakes`, "must be 1, 2 or 3");
      if (e?.where !== "all" && !locIds.has(e?.where)) err(`${p}.where`, `unknown location "${e?.where}" (or "all")`);
      for (const id of Object.keys(e?.effects?.belief ?? {})) if (!beliefIds.has(id)) err(`${p}.effects.belief.${id}`, "unknown belief");
      for (const id of Object.keys(e?.effects?.resource ?? {})) if (!resIds.has(id)) err(`${p}.effects.resource.${id}`, "unknown resource");
      if (e?.effects?.mood !== undefined) num(`${p}.effects.mood`, e.effects.mood, -1, 1);
      if (e?.fx !== undefined && !FX.includes(String(e.fx))) err(`${p}.fx`, `unknown effect "${e.fx}" — use ${FX.join(" | ")}`);
      if (e?.fxHours !== undefined) num(`${p}.fxHours`, e.fxHours, 1, 24);
    });
    if (eventIds.size === sc.events.length && sorted.every(({ e }) => typeof e?.at === "number" && [1, 2, 3].includes(e?.stakes))) {
      const first = sorted[0].e, last = sorted[sorted.length - 1].e;
      if (first.at < 2) err(`events[${sorted[0].i}].at`, "density: no events before hour 2 (let citizens meet)");
      if (first.at > 12) err(`events[${sorted[0].i}].at`, "density: first event must be by hour 12");
      for (let k = 1; k < sorted.length; k++) {
        const a = sorted[k - 1], b = sorted[k];
        if (b.e.at - a.e.at > 12) err(`events[${b.i}].at`, `density: gap of ${b.e.at - a.e.at}h after "${a.e.id}" — max 12h between events`);
        if (b.e.stakes < a.e.stakes) err(`events[${b.i}].stakes`, `escalation: stakes ${b.e.stakes} after "${a.e.id}" (stakes ${a.e.stakes}) — stakes must not decrease over time`);
      }
      if (last.at < hours - 6 || last.at > hours - 2) err(`events[${sorted[sorted.length - 1].i}].at`, `density: last event must fall in hours ${hours - 6}–${hours - 2} so the ending is contested`);
      if (last.stakes !== 3) err(`events[${sorted[sorted.length - 1].i}].stakes`, "escalation: the last event must be stakes 3");
      if (!sc.events.some((e) => e.removesOption)) err("events", "forcing: at least one event must have removesOption: true");
      if (sc.events.filter((e) => e.chance < 1 || e.jitterHours > 0).length < 2) warn("events", "seeds will barely diverge: give at least two events chance < 1 or jitterHours > 0");
    }
  }

  // citizens + fill
  const citIds = new Set<string>();
  const named = Array.isArray(sc.citizens) ? sc.citizens : [];
  if (!Array.isArray(sc.citizens)) err("citizens", "must be an array");
  named.forEach((c, i) => {
    const p = `citizens[${i}]`;
    str(`${p}.id`, c?.id); str(`${p}.name`, c?.name); str(`${p}.role`, c?.role); str(`${p}.want`, c?.want); str(`${p}.fear`, c?.fear);
    num(`${p}.age`, c?.age, 1, 120);
    if (c?.id) { if (citIds.has(c.id)) err(`${p}.id`, `duplicate "${c.id}"`); citIds.add(c.id); }
    if (!isObj(c?.traits)) err(`${p}.traits`, `required { ${TRAITS.join(", ")} } each 0–1`);
    else for (const t of TRAITS) num(`${p}.traits.${t}`, (c.traits as any)[t], 0, 1);
    if (!locIds.has(c?.home)) err(`${p}.home`, `unknown location "${c?.home}"`);
    if (c?.lean !== null && c?.lean !== undefined && !choiceIds.has(c.lean)) err(`${p}.lean`, `must be null or one of ${[...choiceIds].join("|")}`);
    if (c?.lean === undefined) err(`${p}.lean`, "required: a choice id or null");
  });
  (sc.beliefs ?? []).forEach((b, i) => { if (b?.about !== undefined && !citIds.has(b.about)) err(`beliefs[${i}].about`, `unknown citizen "${b.about}"`); });
  named.forEach((c, i) => (c?.ties ?? []).forEach((t, j) => {
    const p = `citizens[${i}].ties[${j}]`;
    if (!citIds.has(t?.to)) err(`${p}.to`, `unknown citizen "${t?.to}"`);
    if (t?.to === c.id) err(`${p}.to`, "a citizen cannot have a tie to themself");
    num(`${p}.affinity`, t?.affinity, -1, 1); str(`${p}.why`, t?.why);
  }));
  let fillCount = 0;
  if (sc.fill !== undefined) {
    if (!isObj(sc.fill)) err("fill", "must be { count, roles[] , homes?, wants?, fears?, names? }");
    else {
      num("fill.count", sc.fill.count, 0, MAX_CAST); fillCount = sc.fill.count || 0;
      if (fillCount > 0 && !arr("fill.roles", sc.fill.roles, 1)) {}
      (sc.fill.homes ?? []).forEach((h, i) => { if (!locIds.has(h)) err(`fill.homes[${i}]`, `unknown location "${h}"`); });
    }
  }
  const total = named.length + fillCount;
  if (total < MIN_CAST || total > MAX_CAST) err("citizens", `cast is ${total} (named ${named.length} + fill ${fillCount}); must be ${MIN_CAST}–${MAX_CAST}. Tip: add a "fill" block.`);
  const undecided = named.filter((c) => c?.lean === null).length + fillCount * 0.5; // fill citizens are undecided half the time
  if (total && undecided / total < 0.4) warn("citizens", `only ~${Math.round(undecided)}/${total} citizens are undecided at hour 0 (lean: null); Architect rule is ≥ 40 %`);

  // social question
  if (!isObj(sc.socialQuestion) || !isObj(sc.socialQuestion.measure)) err("socialQuestion", "required { text, hypothesis, measure: { outcome, splitBy, buckets? } }");
  else {
    str("socialQuestion.text", sc.socialQuestion.text); str("socialQuestion.hypothesis", sc.socialQuestion.hypothesis);
    const m = sc.socialQuestion.measure;
    if (m.outcome !== "ending" && (m as any).outcome !== "changedMind") err("socialQuestion.measure.outcome", `must be "ending" (final choice) or "changedMind" (final choice differs from hour-0 lean)`);
    const [kind, rest] = String(m.splitBy ?? "").split(":", 2);
    const okSplit = (SPLIT_BY as readonly string[]).includes(kind)
      || (kind === "trait" && (TRAITS as readonly string[]).includes(rest))
      || (kind === "belief" && beliefIds.has(rest))
      || (kind === "exposedTo" && eventIds.has(rest));
    if (!okSplit) err("socialQuestion.measure.splitBy", `must be trait:<name> | topTieAffinity | belief:<id> | exposedTo:<eventId> | lean0`);
    if (m.buckets !== undefined) { if (!Array.isArray(m.buckets) || m.buckets.some((b) => typeof b !== "number")) err("socialQuestion.measure.buckets", "must be an ascending array of numbers"); }
  }

  void slug;
  return { ok: errors.length === 0, errors, warnings };
}
