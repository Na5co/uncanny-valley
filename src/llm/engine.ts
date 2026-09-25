// The decision engine: a per-scenario data file the Architect compiles once (docs/BRAINS.md §1b).
// The rules engine reads pressureCurve / archetypes / tripwires; the Citizen prompt reads the rest as its cached prefix.
import { existsSync, readFileSync } from "node:fs";
import type { Scenario, TraitName } from "../types.ts";
import { TRAITS } from "../types.ts";
import type { Phase } from "../engine/pressure.ts";
import { expandCast } from "../scenario.ts";
import { estTokens } from "./client.ts";

export interface DecisionEngine {
  worldFacts: string[];
  actionVocabulary: { id: string; label: string; primitive: string; params?: string; precondition: string; effect: string; tone: string }[];
  archetypes: { id: string; name: string; traitRange: Partial<Record<TraitName, [number, number]>>; oneLiner: string; heuristics: string[]; candidateBias?: Record<string, number> }[];
  pressureCurve: { fromHour: number; phase: string; weights: Phase["weights"]; note: string }[];
  reflectionQuestions: [string, string, string];
  exemplars: { archetype: string; hour: number; context: string; decision: { action: string; target: string | null; thought: string } }[];
  tripwires: { id: string; when: string; hint: string }[];
}

export const ACTION_PRIMITIVES = ["rest", "work", "move(to)", "talk(with)", "share(belief, with)", "confront(whom)", "commit(choice)", "wait"];
export const RUNTIME_ACTION_IDS = ["rest", "work", "move", "talk", "share", "confront", "commit", "wait"] as const;
/** Same clause grammar evalTripwire() in the rules engine accepts. */
export const TRIPWIRE_CLAUSE = /^\s*(pair:[a-z0-9_-]+,[a-z0-9_-]+ apart|(undecided|hoursLeft|count:[a-z0-9_-]+|belief:[a-zA-Z0-9_-]+ avg|resource:[a-zA-Z0-9_-]+)\s*(<=|>=|<|>|==)\s*\d*\.?\d+)\s*$/;
export const PRECONDITION_GRAMMAR = /^(\s*(at\([a-z0-9_-]+\)|with\([a-z0-9_-]+\)|hasMeans\(\d*\.?\d+\)|hoursLeft\s*[<>]=?\s*\d+|belief\([a-zA-Z0-9_-]+\)\s*[<>]=?\s*\d*\.?\d+|resource\([a-zA-Z0-9_-]+\)\s*[<>]=?\s*\d*\.?\d+|lean\s*==\s*[a-z0-9_-]+|true|none)\s*(&&|and)?\s*)+$/i;

export function enginePath(scenarioId: string): string | null {
  for (const dir of ["scenarios", "scenarios/generated", "scenarios/critic"]) { const p = `${dir}/${scenarioId}.engine.json`; if (existsSync(p)) return p; }
  return null;
}
export function loadEngine(scenarioId: string): DecisionEngine | null {
  const p = enginePath(scenarioId); return p ? JSON.parse(readFileSync(p, "utf8")) : null;
}

export function archetypeOf(e: DecisionEngine, traits: Record<TraitName, number>): DecisionEngine["archetypes"][number][] {
  return e.archetypes.filter((a) => (Object.entries(a.traitRange) as [TraitName, [number, number]][]).every(([t, [lo, hi]]) => traits[t] >= lo && traits[t] <= hi));
}

/** Compilation checks from prompts/architect-decision-engine.md. Returns errors; empty = compiled. */
export function checkEngine(raw: unknown, s: Scenario): string[] {
  const errs: string[] = [];
  // shape first, so a wrapped or malformed reply is reported, not thrown
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["engine JSON is not an object"];
  let e = raw as DecisionEngine;
  const keys = Object.keys(e);
  if (!("archetypes" in e) && keys.length === 1 && typeof (e as any)[keys[0]] === "object") { e = (e as any)[keys[0]]; errs.push(`engine JSON was wrapped in a top-level "${keys[0]}" key — output the sections at the top level`); }
  for (const k of ["worldFacts", "actionVocabulary", "archetypes", "pressureCurve", "exemplars", "tripwires"] as const) if (!Array.isArray((e as any)[k])) errs.push(`${k}: must be an array`);
  if (!Array.isArray(e.reflectionQuestions)) errs.push("reflectionQuestions: must be an array of 3 strings");
  if (errs.length) return errs;
  e.archetypes = e.archetypes.filter((a) => a && typeof a === "object");
  for (const a of e.archetypes) { if (!a.traitRange || typeof a.traitRange !== "object") { errs.push(`archetypes.${a.id ?? "?"}: traitRange must be an object of [lo, hi] pairs`); a.traitRange = {}; } for (const [k, v] of Object.entries(a.traitRange)) if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== "number")) { errs.push(`archetypes.${a.id ?? "?"}.traitRange.${k}: must be [lo, hi]`); delete (a.traitRange as any)[k]; } if (!Array.isArray(a.heuristics)) a.heuristics = []; }
  e.pressureCurve = e.pressureCurve.filter((p) => p && typeof p === "object");
  for (const p of e.pressureCurve) { if (!p.weights || typeof p.weights !== "object") { errs.push(`pressureCurve h${p.fromHour ?? "?"}: weights { social, means, commit, rest, belief } required`); p.weights = { social: 1, means: 1, commit: 0, rest: 1, belief: 1 }; } for (const k of ["social", "means", "commit", "rest", "belief"] as const) if (typeof p.weights[k] !== "number") { errs.push(`pressureCurve h${p.fromHour ?? "?"}: weights.${k} must be a number`); p.weights[k] = 1; } }
  e.exemplars = e.exemplars.filter((x) => x && typeof x === "object").map((x) => ({ ...x, decision: x.decision && typeof x.decision === "object" ? x.decision : { action: "", target: null, thought: "" } }));
  e.actionVocabulary = e.actionVocabulary.filter((a) => a && typeof a === "object");
  e.tripwires = e.tripwires.filter((t) => t && typeof t === "object");
  const need = (k: keyof DecisionEngine, min: number, max: number) => { const v = e[k] as unknown[]; if (!Array.isArray(v) || v.length < min || v.length > max) errs.push(`${k}: need ${min}–${max} entries (got ${Array.isArray(v) ? v.length : "none"})`); };
  need("worldFacts", 8, 12); need("actionVocabulary", 8, 8); need("archetypes", 4, 8); need("pressureCurve", 4, 6); need("exemplars", 6, 10); need("tripwires", 4, 8);
  if (!Array.isArray(e.reflectionQuestions) || e.reflectionQuestions.length !== 3) errs.push("reflectionQuestions: exactly 3");
  const vocab = new Set((e.actionVocabulary ?? []).map((a) => a.id));
  const locIds = new Set(s.locations.map((l) => l.id)), choiceIds = new Set(s.ending.choices.map((c) => c.id)), beliefIds = new Set((s.beliefs ?? []).map((b) => b.id)), resIds = new Set((s.resources ?? []).map((r) => r.id)), citIds = new Set(s.citizens.map((c) => c.id));
  for (const a of e.actionVocabulary ?? []) {
    for (const m of String(a.precondition ?? "").matchAll(/at\(([^)]+)\)/g)) if (!locIds.has(m[1])) errs.push(`actionVocabulary.${a.id}: precondition names unknown location "${m[1]}"`);
    for (const m of String(a.precondition ?? "").matchAll(/belief\(([^)]+)\)/g)) if (m[1] !== "any" && !beliefIds.has(m[1])) errs.push(`actionVocabulary.${a.id}: precondition names unknown belief "${m[1]}"`);
    for (const m of String(a.precondition ?? "").matchAll(/resource\(([^)]+)\)/g)) if (!resIds.has(m[1])) errs.push(`actionVocabulary.${a.id}: precondition names unknown resource "${m[1]}"`);
    for (const m of String(a.precondition ?? "").matchAll(/lean\s*==\s*([a-z0-9_-]+)/g)) if (m[1] !== "any" && !choiceIds.has(m[1])) errs.push(`actionVocabulary.${a.id}: precondition names unknown choice "${m[1]}"`);
    for (const m of String(a.precondition ?? "").matchAll(/with\(([^)]+)\)/g)) if (m[1] !== "citizen" && m[1] !== "any" && !citIds.has(m[1])) errs.push(`actionVocabulary.${a.id}: precondition names unknown citizen "${m[1]}" (use with(citizen) for "anyone here")`);
    if (!(RUNTIME_ACTION_IDS as readonly string[]).includes(a.id)) errs.push(`actionVocabulary.${a.id}: id must be one of the runtime actions ${RUNTIME_ACTION_IDS.join(" | ")} — the rules engine only offers these as candidates, so any other id is dead; put the world-specific flavour in label/effect/tone`);
    if (!ACTION_PRIMITIVES.some((p) => p.split("(")[0] === String(a.primitive).split("(")[0])) errs.push(`actionVocabulary.${a.id}: primitive "${a.primitive}" is not one of ${ACTION_PRIMITIVES.join(", ")}`);
    if (!PRECONDITION_GRAMMAR.test(a.precondition ?? "")) errs.push(`actionVocabulary.${a.id}: precondition "${a.precondition}" does not parse (use at(loc) · with(citizen) · hasMeans(n) · hoursLeft < n · belief(id) > n · resource(id) > n · lean == choice · true, joined by &&)`);
  }
  for (const id of RUNTIME_ACTION_IDS) if (!vocab.has(id)) errs.push(`actionVocabulary: missing an entry for "${id}" (every runtime action needs its world-specific label and tone)`);
  // every citizen → exactly one archetype: the named cast, and the whole trait space on a grid (generated citizens can be anywhere in it)
  const named = new Set(s.citizens.map((c) => c.id));
  const castProblems = expandCast(s, 1).map((c) => ({ c, m: archetypeOf(e, c.traits) })).filter(({ m }) => m.length !== 1);
  if (castProblems.length) errs.push(`archetypes: ${castProblems.length} citizens match ${castProblems.some(({ m }) => m.length === 0) ? "no archetype" : "several archetypes"} (e.g. ${castProblems.slice(0, 3).map(({ c, m }) => `${c.name}${named.has(c.id) ? "" : " (generated)"}: ${m.map((a) => a.id).join("+") || "none"}`).join("; ")}) — traitRanges must partition the trait space with no gaps and no overlaps`);
  { const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.8, 0.9, 1]; let holes = 0, overlaps = 0, example = "";
    for (const so of steps) for (const bo of steps) for (const lo of steps) for (const re of steps) { const m = archetypeOf(e, { sociable: so, bold: bo, loyal: lo, restless: re }); if (m.length === 0) { holes++; example ||= `sociable ${so}, bold ${bo}, loyal ${lo}, restless ${re}`; } else if (m.length > 1) { overlaps++; example ||= `sociable ${so}, bold ${bo}, loyal ${lo}, restless ${re} → ${m.map((a) => a.id).join("+")}`; } }
    if (holes || overlaps) errs.push(`archetypes: traitRanges do not partition the trait space (${holes} grid points match none, ${overlaps} match several; e.g. ${example}) — ranges are inclusive, so use [0, 0.69] / [0.7, 1] and cover every combination`); }
  for (const a of e.archetypes ?? []) { if (!Array.isArray(a.heuristics) || a.heuristics.length < 3 || a.heuristics.length > 5) errs.push(`archetypes.${a.id}: 3–5 heuristics`); for (const k of Object.keys(a.candidateBias ?? {})) if (!vocab.has(k)) errs.push(`archetypes.${a.id}.candidateBias: unknown action "${k}"`); }
  const curve = [...(e.pressureCurve ?? [])].sort((x, y) => x.fromHour - y.fromHour);
  for (let i = 1; i < curve.length; i++) { if (curve[i].weights.commit < curve[i - 1].weights.commit) errs.push(`pressureCurve: commit weight must rise (h${curve[i].fromHour})`); if (curve[i].weights.rest > curve[i - 1].weights.rest) errs.push(`pressureCurve: rest weight must fall (h${curve[i].fromHour})`); }
  if (curve.length && curve[curve.length - 1].fromHour < 64 * (s.clock.hours / 72)) errs.push(`pressureCurve: last phase must start at ≥ hour ${Math.round(64 * (s.clock.hours / 72))}`);
  const arche = new Set((e.archetypes ?? []).map((a) => a.id));
  for (const x of e.exemplars ?? []) {
    if (!arche.has(x.archetype)) errs.push(`exemplars: unknown archetype "${x.archetype}"`);
    if (!vocab.has(x.decision?.action)) errs.push(`exemplars: action "${x.decision?.action}" is not in actionVocabulary`);
    if ((x.decision?.thought ?? "").split(/\s+/).length > 25) errs.push(`exemplars: thought over 25 words (${x.archetype} h${x.hour})`);
    // legal in its stated context: the action (and target) must appear in the context's CANDIDATES list
    const cands = (x.context ?? "").split("CANDIDATES")[1] ?? "";
    const offered = [...cands.matchAll(/\d+\.\s+([a-z]+)\s+→\s+(\S+)/g)].map((m) => ({ id: m[1], target: m[2] === "null" ? null : m[2] }));
    if (!offered.length) errs.push(`exemplars (${x.archetype} h${x.hour}): context has no "CANDIDATES (ranked):" list in the engine's format — lines must read "N. <id> → <target> — <label>" with the → arrow (see CONTEXT_FORMAT)`);
    else if (!offered.some((o) => o.id === x.decision?.action && (o.target ?? null) === (x.decision?.target ?? null))) errs.push(`exemplars (${x.archetype} h${x.hour}): decision ${x.decision?.action} → ${x.decision?.target ?? "null"} is not among its own context's CANDIDATES (${offered.map((o) => `${o.id} → ${o.target ?? "null"}`).join(", ")}) — an exemplar must pick an action it was offered`);
  }
  for (const tw of e.tripwires ?? []) {
    const when = String(tw.when ?? "");
    const bad = when.split(/&&|\band\b/).filter((cl) => !TRIPWIRE_CLAUSE.test(cl)); if (bad.length) { errs.push(`tripwires.${tw.id}: "${bad[0].trim()}" is not in the grammar (undecided|hoursLeft|count:<choice>|belief:<id> avg|resource:<id> <op> n · pair:a,b apart · joined by &&) — it would never fire`); continue; }
    for (const m of when.matchAll(/count:([a-z0-9_-]+)/g)) if (!choiceIds.has(m[1])) errs.push(`tripwires.${tw.id}: unknown choice "${m[1]}" (choices: ${[...choiceIds].join(", ")}) — it would never fire`);
    for (const m of when.matchAll(/belief:([a-zA-Z0-9_-]+) avg/g)) if (!beliefIds.has(m[1])) errs.push(`tripwires.${tw.id}: unknown belief "${m[1]}" — it would never fire`);
    for (const m of when.matchAll(/resource:([a-zA-Z0-9_-]+)/g)) if (!resIds.has(m[1])) errs.push(`tripwires.${tw.id}: unknown resource "${m[1]}" — it would never fire`);
    for (const m of when.matchAll(/pair:([a-z0-9_-]+),([a-z0-9_-]+)/g)) for (const id of [m[1], m[2]]) if (!citIds.has(id)) errs.push(`tripwires.${tw.id}: unknown named citizen "${id}" — it would never fire`);
  }
  if (e.exemplars?.length && !(e.exemplars ?? []).some((x) => x.decision?.action?.startsWith("commit"))) errs.push("exemplars: include at least one commit");
  if (e.exemplars?.length && (e.exemplars ?? []).filter((x) => x.hour >= 60).length < 2) errs.push("exemplars: at least two at hour ≥ 60");
  for (const a of arche) if (!(e.exemplars ?? []).some((x) => x.archetype === a)) errs.push(`exemplars: archetype "${a}" has no example`);
  const prefix = [...(e.worldFacts ?? []), ...(e.actionVocabulary ?? []).map((a) => `${a.id} — ${a.label}. ${a.tone}`), ...(e.exemplars ?? []).map((x) => `${x.context}\n${JSON.stringify(x.decision)}`)].join("\n");
  const tok = estTokens(prefix);
  if (tok > 2500) errs.push(`cached prefix ≈ ${tok} tokens > 2,500 budget — cut worldFacts/exemplars`);
  return errs;
}
