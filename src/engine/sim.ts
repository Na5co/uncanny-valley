import type { Brain, Candidate, Decision } from "../brains/brain.ts";
import { createWorld, tally, type Citizen, type World, type Memory } from "./state.ts";
import { preference, resolveEnding } from "./ending.ts";
import type { Scenario } from "../types.ts";
import { phaseAt } from "./pressure.ts";
import { archetypeOf } from "../llm/engine.ts";
import { hashString } from "../rng.ts";
import { snapshot, explainChange, explainCommit } from "./explain.ts";

export interface RunOptions { brain: Brain; onBeat?: (b: World["beats"][number]) => void; onHour?: (world: World) => void; engine?: import("../llm/engine.ts").DecisionEngine | null }

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const affinityWord = (a: number) => a > 0.6 ? "close" : a > 0.3 ? "friendly" : a > -0.3 ? "neutral" : a > -0.6 ? "strained" : "hostile";

function remember(c: Citizen, hour: number, text: string, level: 1 | 2 | 3 = 1, because?: string, said?: string) {
  const m: Memory = { hour, text, level }; if (because) m.because = because; if (said) m.said = said;
  c.memories.push(m);
}
function beat(world: World, level: 1 | 2 | 3, headline: string, who: string[] = [], thought?: string, opts?: RunOptions, because?: string) {
  const b: World["beats"][number] = { hour: world.hour, level, headline, who, thought };
  if (because) b.because = because;
  world.beats.push(b);
  opts?.onBeat?.(b);
}
function label(world: World, choiceId: string | null) {
  return choiceId ? world.scenario.ending.choices.find((c) => c.id === choiceId)?.label ?? choiceId : "undecided";
}

/** Legal, engine-ranked candidate actions for a citizen this tick. The brain chooses among these only. */
export function candidates(world: World, c: Citizen): Candidate[] {
  const s = world.scenario, hoursLeft = s.clock.hours - world.hour, t = c.seed.traits;
  const here = world.citizens.filter((o) => o.id !== c.id && o.location === c.location);
  const loc = s.locations.find((l) => l.id === c.location)!;
  const pressure = 1 - hoursLeft / s.clock.hours; // 0 → 1
  const W = phaseAt(world.hour, s.clock.hours, world.curve).weights;
  const bias = world.engine ? (archetypeOf(world.engine, c.seed.traits)[0]?.candidateBias ?? {}) : {};
  const hod = world.hour % 24;                       // a day has a shape: work by day, gather by evening, rest at night
  const workHours = hod >= 6 && hod < 18, eveningHours = hod >= 17 && hod < 24, nightHours = hod >= 23 || hod < 6;
  const atHome = c.location === c.seed.home;
  const out: Candidate[] = [];

  // exhaustion overrides the phase: nobody talks through a third night on no sleep
  out.push({ id: "rest", target: null, label: "rest", score: Math.max(((1 - c.energy) * 1.2 + (nightHours ? 0.5 : 0) + (atHome ? 0.1 : -0.2)) * W.rest, (0.3 - c.energy) * 4) });
  if (loc.tags.includes("work") && workHours) out.push({ id: "work", target: null, label: `work at ${loc.name}`, score: ((0.7 - c.means) * 0.8 + (c.energy - 0.5) * 0.3) * W.means });
  const neighbours = s.paths.filter((p) => p.includes(c.location)).map((p) => (p[0] === c.location ? p[1] : p[0]));
  const wantWork = workHours && c.means < 0.5 && !loc.tags.includes("work") && W.means >= 0.5;
  const justMoved = c.memories.some((m) => m.hour === world.hour - 1 && m.text.startsWith("went to")); // inertia: no pacing between two rooms
  const topTie = Object.entries(c.ties).sort((a, b) => b[1].affinity - a[1].affinity)[0];
  const topTieLoc = topTie ? world.byId.get(topTie[0])?.location : undefined;
  for (const n of neighbours) {
    const nl = s.locations.find((l) => l.id === n)!;
    const tiesThere = world.citizens.filter((o) => o.location === n && c.ties[o.id]).map((o) => c.ties[o.id].affinity);
    const pull = tiesThere.length ? Math.max(...tiesThere) : 0;
    let score = t.restless * 0.3 + pull * 0.5 * W.social + (wantWork && nl.tags.includes("work") ? 0.45 : 0) - (justMoved ? 0.5 : 0);
    if (topTieLoc === n && topTie![1].affinity > 0.3) score += 0.3 * (W.social - 0.8); // late on, people go to the ones they trust
    if (nl.tags.includes("social")) score += t.sociable * 0.25 + (eveningHours ? 0.45 : 0.1) + (W.social - 1) * 0.2;
    if (nl.tags.includes("public") && here.length === 0) score += 0.25;
    if ((nl.tags.includes("rest") || nl.tags.includes("private")) && (nightHours || c.energy < 0.35)) score += n === c.seed.home ? 0.6 : 0.3;
    out.push({ id: "move", target: n, label: `go to ${nl.name}`, score });
  }
  const recent = (o: Citizen, verb: string, within: number) => c.memories.some((m) => m.hour > world.hour - within && m.text === `${verb} ${o.seed.name}`);
  for (const o of here) {
    const a = c.ties[o.id]?.affinity ?? 0;
    const stale = recent(o, "talked with", 4) ? 0.5 : 0;
    out.push({ id: "talk", target: o.id, label: `talk with ${o.seed.name}`, score: (t.sociable * 0.6 + a * 0.4 + (c.energy - 0.3) * 0.2 - stale - (nightHours ? 0.4 : 0)) * W.social });
    const strong = Object.entries(c.beliefs).filter(([bid, v]) => v >= 0.5 && (o.beliefs[bid] ?? 0) < v - 0.2 && beliefAbout(s, bid) !== c.id);
    for (const [bid, v] of strong)
      out.push({ id: "share", target: `${bid}|${o.id}`, label: `tell ${o.seed.name} that ${beliefText(s, bid)}`, score: (v * 0.5 + t.sociable * 0.3) * W.belief });
    if (a < -0.2 && t.bold > 0.5 && !recent(o, "confronted", 12)) out.push({ id: "confront", target: o.id, label: `confront ${o.seed.name}`, score: t.bold * 0.5 - a * 0.4 + pressure * 0.4 });
  }
  if (c.lean && !c.committed) {
    const { best, margin, scores } = preference(world, c);
    // You lock in a choice you prefer, or a close call you have already been leaning to — never one your reasons have left behind.
    const closeCall = scores[c.lean] >= scores[best] - 0.1;
    const readiness = (t.bold - 0.5) * 0.3 - (t.loyal - 0.5) * 0.15 + world.rng.fork(`readiness:${c.id}`).range(-0.2, 0.2); // the bold decide early, the loyal late, and nobody on the same hour
    if (best === c.lean || closeCall) out.push({ id: "commit", target: c.lean, label: `commit: ${label(world, c.lean)}`, score: (0.5 + (best === c.lean ? margin : 0) * 0.5) * W.commit - 0.45 + readiness });
  }
  out.push({ id: "wait", target: null, label: "wait and watch", score: 0.05 });
  for (const k of out) k.score += bias[k.id] ?? 0; // the Architect's archetype heuristics, as a nudge on the ranking
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
const beliefAbout = (s: Scenario, id: string) => s.beliefs?.find((b) => b.id === id)?.about;
const beliefText = (s: Scenario, id: string) => s.beliefs?.find((b) => b.id === id)?.text ?? id;

function apply(world: World, c: Citizen, d: Decision, opts: RunOptions) {
  const s = world.scenario, h = world.hour;
  switch (d.action) {
    case "rest": c.energy = clamp(c.energy + 0.35); remember(c, h, "rested"); break;
    case "wait": remember(c, h, "waited"); break;
    case "work": c.means = clamp(c.means + 0.12); c.energy = clamp(c.energy - 0.15); remember(c, h, "worked"); break;
    case "move": {
      const to = s.locations.find((l) => l.id === d.target);
      if (!to) return;
      c.location = to.id; remember(c, h, `went to ${to.name}`);
      if (to.tags.includes("exit") && c.lean && !c.memories.some((m) => m.text === `went to ${to.name}` && m.hour < h)) beat(world, 2, `${c.seed.name} (${c.seed.role}) heads to ${to.name}`, [c.id], d.thought, opts);
      break;
    }
    case "talk": case "confront": {
      const o = world.byId.get(d.target!); if (!o || o.location !== c.location) return;
      const compat = 1 - (Object.keys(c.seed.traits) as (keyof typeof c.seed.traits)[]).reduce((sum, k) => sum + Math.abs(c.seed.traits[k] - o.seed.traits[k]), 0) / 4;
      const before = c.ties[o.id]?.affinity ?? 0;
      // centred so that an average pair drifts nowhere; only compatible pairs grow close, and slowly once they are
      const base = d.action === "confront" ? -0.15 : (compat - 0.7) * 0.35;
      const delta = (base + world.rng.range(-0.08, 0.08) + (c.mood + o.mood) * 0.05) * (1 - Math.abs(before));
      const after = clamp(before + delta, -1, 1);
      const disagree = c.lean && o.lean && c.lean !== o.lean;
      const why = d.action === "confront" ? `${c.seed.name} confronted ${o.seed.name} at ${locName(s, c.location)}${disagree ? ` over ${label(world, c.lean)} vs ${label(world, o.lean)}` : ""}`
        : after > before ? `talked at ${locName(s, c.location)}${c.lean && c.lean === o.lean ? `; both want ${label(world, c.lean)}` : ""}`
        : disagree ? `they want different things — ${shortName(c.seed.name)} ${label(world, c.lean)}, ${shortName(o.seed.name)} ${label(world, o.lean)}` : `an awkward talk at ${locName(s, c.location)}`;
      const oBefore = o.ties[c.id]?.affinity ?? 0;
      c.ties[o.id] = { affinity: after, why: c.ties[o.id]?.why ?? why };
      o.ties[c.id] = { affinity: clamp(oBefore + delta * 0.8, -1, 1), why: o.ties[c.id]?.why ?? why };
      c.energy = clamp(c.energy - 0.05); c.mood = clamp(c.mood + delta * 0.5, -1, 1); o.mood = clamp(o.mood + delta * 0.4, -1, 1);
      // what was said: the actor's `say` line is what the listener hears and remembers; the thought stays private
      const line = d.say?.trim() || undefined;
      remember(c, h, `${d.action === "confront" ? "confronted" : "talked with"} ${o.seed.name}`, 1, undefined, line ? `you said: "${line}"` : undefined);
      remember(o, h, `${c.seed.name} ${d.action === "confront" ? "confronted me" : "talked with me"}`, 1, undefined, line ? `${shortName(c.seed.name)}: "${line}"` : undefined);
      // The pair's standing is the mean of both directions; the feed reports it once, and only when it truly moves to a new word.
      const pairBefore = (before + oBefore) / 2, pairAfter = (after + o.ties[c.id].affinity) / 2;
      const wb = affinityWord(pairBefore), wa = affinityWord(pairAfter);
      const flipped = (pairBefore > 0.3 && pairAfter < -0.3) || (pairBefore < -0.3 && pairAfter > 0.3);
      const pairKey = [c.id, o.id].sort().join("|");
      const lastWord = world.lastTieWord[pairKey] ?? affinityWord(pairBefore);
      if (before >= 0.3 && after < 0.3) c.lastFallingOut = shortName(o.seed.name);
      if (oBefore >= 0.3 && o.ties[c.id].affinity < 0.3) o.lastFallingOut = shortName(c.seed.name);
      // Notable = a crossing of the ±0.3 line, or any change involving a named citizen; drift between two extras is routine.
      const named = world.named.has(c.id) || world.named.has(o.id);
      // Notable for extras too: anything souring, anything reaching close or hostile. Warming from neutral to friendly is drift.
      const crossesLine = [-0.3, 0.6, -0.6].some((th) => (pairBefore > th) !== (pairAfter > th)) || (pairBefore > 0.3 && pairAfter <= 0.3);
      const flickerBack = wa === (world.prevTieWord[pairKey] ?? "") && (world.lastTieBeat[pairKey] ?? -99) > h - 12; // bounced straight back
      if (wa !== lastWord) {
        // Every change of standing is recorded (the record is the source of truth for Threads); only the notable ones are shown.
        world.prevTieWord[pairKey] = lastWord; world.lastTieWord[pairKey] = wa; world.lastTieBeat[pairKey] = h;
        if (flipped) world.stats.tieSignFlips++;
        const level = flipped ? 3 : (!flickerBack && (named || crossesLine)) ? 2 : 1;
        c.ties[o.id].why = why; o.ties[c.id].why = why; // the tie remembers the reason for its latest change of standing
        beat(world, level, `${c.seed.name} ↔ ${o.seed.name}: ${lastWord} → ${wa}${d.action === "confront" ? " (confrontation)" : ""}`, [c.id, o.id], d.say ? `${shortName(c.seed.name)}: "${d.say}"` : d.thought, opts, why);
      } else if (d.action === "confront") beat(world, 1, `${c.seed.name} confronts ${o.seed.name} at ${locName(s, c.location)} — still ${wa}`, [c.id, o.id], d.thought, opts, why);
      // talking also leaks the strongest belief the listener lacks (never a rumour about yourself)
      if (d.action === "talk") for (const [bid, v] of Object.entries(c.beliefs)) if (v >= 0.5 && (o.beliefs[bid] ?? 0) < v - 0.2 && beliefAbout(s, bid) !== c.id && world.rng.chance(0.4)) shareBelief(world, c, o, bid, opts);
      break;
    }
    case "share": {
      const [bid, oid] = (d.target ?? "").split("|"); const o = world.byId.get(oid);
      if (!o || o.location !== c.location) return;
      shareBelief(world, c, o, bid, opts, d.say?.trim() || undefined); break;
    }
    case "commit": {
      if (!c.lean) return;
      const because = explainCommit(world, c, c.lean);
      c.committed = true; world.stats.commits++; remember(c, h, `decided: ${label(world, c.lean)}`, 3, because);
      beat(world, 3, `${c.seed.name} (${c.seed.role}) commits — ${label(world, c.lean)}`, [c.id], d.thought, opts, because);
      // Choosing differently from someone close to you costs the tie. This is where allies become strangers.
      for (const o of world.citizens) {
        const a = o.ties[c.id]?.affinity ?? 0;
        if (o.id === c.id || a < 0.3 || !o.lean || o.lean === c.lean) continue;
        const hit = 0.35 * (0.5 + o.seed.traits.loyal * 0.5); // the loyal take it hardest
        const after = clamp(a - hit, -1, 1), wb = affinityWord(a), wa = affinityWord(after);
        const hitWhy = `${c.seed.name} chose ${label(world, c.lean)}; ${shortName(o.seed.name)} wanted ${label(world, o.lean)}`;
        o.ties[c.id] = { affinity: after, why: o.ties[c.id]?.why ?? hitWhy };
        o.mood = clamp(o.mood - 0.15, -1, 1);
        remember(o, h, `${c.seed.name} chose ${label(world, c.lean)} — not what I hoped`, 2);
        const pairKey = [c.id, o.id].sort().join("|"); const mine = c.ties[o.id]?.affinity ?? 0;
        const pb = (a + mine) / 2, pa = (after + mine) / 2; const lw = world.lastTieWord[pairKey] ?? affinityWord(pb), nw = affinityWord(pa);
        if (nw !== lw) { const flipped = pb > 0.3 && pa < -0.3; if (flipped) world.stats.tieSignFlips++; world.prevTieWord[pairKey] = lw; world.lastTieWord[pairKey] = nw; world.lastTieBeat[pairKey] = h; o.ties[c.id].why = hitWhy; if (c.ties[o.id]) c.ties[o.id].why = hitWhy; beat(world, flipped ? 3 : 2, `${o.seed.name} ↔ ${c.seed.name}: ${lw} → ${nw}`, [o.id, c.id], undefined, opts, hitWhy); }
      }
      break;
    }
  }
}
export const shortName = (n: string) => { const p = n.split(" "); return p[0].endsWith(".") && p[1] ? `${p[0]} ${p[1]}` : p[0]; };
const locName = (s: Scenario, id: string) => s.locations.find((l) => l.id === id)?.name ?? id;

function shareBelief(world: World, from: Citizen, to: Citizen, bid: string, opts: RunOptions, say?: string) {
  const v = from.beliefs[bid] ?? 0, before = to.beliefs[bid] ?? 0;
  const trust = clamp(((to.ties[from.id]?.affinity ?? 0) + 1) / 2);
  const after = clamp(before + (v - before) * (0.3 + trust * 0.5));
  to.beliefs[bid] = after;
  const text = beliefText(world.scenario, bid);
  remember(to, world.hour, `${from.seed.name} told me ${text}`, 2, undefined, say ? `${shortName(from.seed.name)}: "${say}"` : undefined); remember(from, world.hour, `told ${to.seed.name} ${text}`, 1, undefined, say ? `you said: "${say}"` : undefined);
  if (before < 0.4 || !to.beliefSources[bid]) to.beliefSources[bid] = `${from.seed.name} told them, h${world.hour}`;
  if (before < 0.4 && after >= 0.4) {
    const believers = world.citizens.filter((c) => (c.beliefs[bid] ?? 0) >= 0.4).length;
    const hop = (world.rumourHops[bid] = (world.rumourHops[bid] ?? 0) + 1);
    const notable = hop === 1 || world.named.has(to.id) || hop % 5 === 0;
    beat(world, notable ? 2 : 1, `${from.seed.name} tells ${to.seed.name}: "${say ?? text}"${hop > 1 ? ` — ${believers} now believe it` : ""}`, [from.id, to.id], undefined, opts);
  }
}

async function fireEvents(world: World, opts: RunOptions) {
  for (const se of world.schedule) {
    if (se.fired || se.skipped || se.at !== world.hour) continue;
    se.fired = true;
    const e = se.event;
    const present = e.where === "all" ? world.citizens : world.citizens.filter((c) => c.location === e.where);
    se.reached = present.length;
    const moved: Citizen[] = [];
    for (const c of present) {
      c.exposedTo.add(e.id);
      remember(c, world.hour, e.headline, e.stakes);
      for (const [bid, d] of Object.entries(e.effects?.belief ?? {})) {
        // A stakes-3 event is a fact everyone sees. Anything less is a rumour, and people differ in what they take on:
        // the bold doubt, the sociable absorb, the loyal wait to hear it from someone they trust (shareBelief does that).
        if (beliefAbout(world.scenario, bid) === c.id && e.stakes < 3) continue; // you know the truth about yourself
        const credulity = e.stakes === 3 ? 1 : clamp(0.25 + 0.4 * (1 - c.seed.traits.bold) + 0.35 * c.seed.traits.sociable - 0.2 * c.seed.traits.loyal, 0.1, 1);
        const before = c.beliefs[bid] ?? 0;
        c.beliefs[bid] = clamp(before + d * credulity);
        if (Math.abs(c.beliefs[bid] - before) >= 0.15 && (before < 0.4 || !c.beliefSources[bid])) c.beliefSources[bid] = `${e.stakes === 3 ? "saw it" : "heard it"} at h${world.hour}: ${e.headline.replace(/\.$/, "")}`;
        // The quick to believe reconsider on the spot; the rest sleep on it (next 6h reconsideration).
        if (Math.abs(c.beliefs[bid] - before) >= 0.2 && credulity > 0.6) moved.push(c);
      }
      if (e.effects?.mood) c.mood = clamp(c.mood + e.effects.mood, -1, 1);
      if (e.stakes >= 2) c.lastShock = e.headline.replace(/\.$/, "");
    }
    for (const [rid, d] of Object.entries(e.effects?.resource ?? {})) world.resources[rid] = (world.resources[rid] ?? 0) + d;
    beat(world, present.length ? 3 : 1, `${e.headline}${e.where === "all" ? "" : ` (${locName(world.scenario, e.where)}, ${present.length} present)`}`, present.map((c) => c.id), undefined, opts);
    if (e.stakes >= 2) await reflect(world, opts, [...new Set(moved)].filter((c) => !c.committed), "reconsidered");
    // News can shake a decision. A committed citizen whose preference now clearly points elsewhere wavers.
    for (const c of present) {
      if (!c.committed) continue;
      const { best, margin } = preference(world, c);
      if (best !== c.lean && margin > 0.15) {
        const was = c.lean; const because = explainChange(world, c, was, best, c.prefSnapshot); c.prefSnapshot = snapshot(world, c);
        c.committed = false; c.lean = best; world.stats.wavers++;
        remember(c, world.hour, `wavered: was set on ${label(world, was)}, now ${label(world, best)}`, 3, because);
        beat(world, 3, `${c.seed.name} (${c.seed.role}) wavers — was set on ${label(world, was)}, now leaning ${label(world, best)}`, [c.id], undefined, opts, because);
      }
    }
  }
}

async function reflect(world: World, opts: RunOptions, who: Citizen[] = world.citizens, kind: "reflected" | "reconsidered" = "reflected") {
  for (const c of who) {
    if (c.committed) continue;
    const before = c.lean;
    const r = await opts.brain.reflect(world, c);
    if (r.lean !== before && r.lean) {
      const because = explainChange(world, c, before, r.lean, c.prefSnapshot);
      c.lean = r.lean; if (before) world.stats.leanFlips++; else world.stats.firstLeans++;
      remember(c, world.hour, `${kind}: now leaning ${label(world, r.lean)}`, 2, because);
      beat(world, before || world.named.has(c.id) ? 2 : 1, `${c.seed.name} (${c.seed.role}) now leans ${label(world, r.lean)}${before ? ` (was ${label(world, before)})` : ""}`, [c.id], r.thought, opts, because);
    } else if (kind === "reflected") remember(c, world.hour, `reflected: ${r.thought}`, r.answers?.length ? 2 : 1, undefined, r.answers?.length ? r.answers.join(" / ") : undefined);
    else if (r.answers?.length) { c.lastThought = { hour: world.hour, text: r.thought }; remember(c, world.hour, `reconsidered: ${r.thought}`, 1, undefined, r.answers.join(" / ")); }
    if (r.answers?.length && r.lean !== before && r.lean) { const last = c.memories[c.memories.length - 1]; if (last && /now leaning/.test(last.text)) last.said = r.answers.join(" / "); }
    c.prefSnapshot = snapshot(world, c);
  }
}

/** Architect tripwires (docs/BRAINS.md §1b): small expressions over world state that become "watch for" beats when first hit. */
export function evalTripwire(world: World, when: string): boolean {
  const t = tally(world), left = world.scenario.clock.hours - world.hour;
  const num = (expr: string): number | null => {
    expr = expr.trim();
    if (expr === "undecided") return t.undecided ?? 0;
    if (expr === "hoursLeft") return left;
    let m = /^count:([a-z0-9_-]+)$/.exec(expr); if (m) return t[m[1]] ?? 0;
    m = /^belief:([a-zA-Z0-9_-]+) avg$/.exec(expr); if (m) return world.citizens.reduce((a, c) => a + (c.beliefs[m![1]] ?? 0), 0) / Math.max(1, world.citizens.length);
    m = /^resource:([a-zA-Z0-9_-]+)$/.exec(expr); if (m) return world.resources[m[1]] ?? 0;
    return isNaN(Number(expr)) ? null : Number(expr);
  };
  const clause = (cl: string): boolean => {
    cl = cl.trim();
    let m = /^pair:([a-z0-9_-]+),([a-z0-9_-]+) apart$/.exec(cl);
    if (m) { const a = world.byId.get(m[1]), b = world.byId.get(m[2]); return !!(a && b && (a.ties[b.id]?.affinity ?? 0) > 0.5 && a.lean && b.lean && a.lean !== b.lean); }
    m = /^(.+?)\s*(<=|>=|<|>|==)\s*(.+)$/.exec(cl); if (!m) return false;
    const l = num(m[1]), r = num(m[3]); if (l === null || r === null) return false;
    return m[2] === "<" ? l < r : m[2] === ">" ? l > r : m[2] === "<=" ? l <= r : m[2] === ">=" ? l >= r : l === r;
  };
  return when.split(/&&|\band\b/).every(clause);
}
function checkTripwires(world: World, opts: RunOptions) {
  for (const tw of world.engine?.tripwires ?? []) {
    if (world.tripped.has(tw.id)) continue;
    if (evalTripwire(world, tw.when)) { world.tripped.add(tw.id); beat(world, 2, `Watch: ${tw.hint}`, [], undefined, opts); }
  }
}

/** A compact fingerprint of the world this hour. Two runs with equal fingerprints up to hour h are the same world up to hour h. */
export function stateHash(world: World): string {
  const parts: string[] = [];
  for (const c of world.citizens) parts.push(`${c.id}:${c.location}:${c.lean ?? "-"}:${c.committed ? 1 : 0}:${c.means.toFixed(2)}:${c.mood.toFixed(2)}:${Object.entries(c.beliefs).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(",")}:${Object.entries(c.ties).map(([k, v]) => `${k}=${v.affinity.toFixed(2)}`).join(",")}`);
  return hashString(parts.join("|")).toString(16).padStart(8, "0");
}

export async function runWorld(scenario: Scenario, seed: number, opts: RunOptions): Promise<World> {
  const world = createWorld(scenario, seed, opts.engine);
  const { hours, decisionEveryHours, reflectionAt } = scenario.clock;
  for (const c of world.citizens) c.prefSnapshot = snapshot(world, c); // so the first change of mind can say what changed since hour 0
  world.leanHistory.push({ hour: 0, tally: tally(world) });
  for (world.hour = 1; world.hour <= hours; world.hour++) {
    for (const r of scenario.resources ?? []) if (r.perHour) world.resources[r.id] = (world.resources[r.id] ?? 0) + r.perHour;
    await fireEvents(world, opts);
    if (world.hour % decisionEveryHours === 0) {
      // stable order per hour, but shuffled so nobody always acts first
      const order = [...world.citizens]; const r = world.rng.fork(`order:${world.hour}`);
      for (let i = order.length - 1; i > 0; i--) { const j = r.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      for (const c of order) {
        c.energy = clamp(c.energy - 0.04 * decisionEveryHours);
        const cands = candidates(world, c);
        const d = await opts.brain.decide(world, c, cands);
        const legal = cands.find((x) => x.id === d.action && x.target === d.target);
        world.stats.decisions++; if (!legal || d.fallback) world.stats.fallbacks++;
        if (legal && d.thought && !d.fallback && !d.templated) c.lastThought = { hour: world.hour, text: d.thought };
        if (legal && !d.fallback) { const idx = world.citizens.indexOf(c); if (d.say) world.hourLines.push({ c: idx, text: d.say, kind: "say" }); else if (d.thought && !d.templated) world.hourLines.push({ c: idx, text: d.thought, kind: "thought" }); }
        const ph = phaseAt(world.hour, hours, world.curve).name; const row = (world.stats.actionsByPhase[ph] ??= {}); row[legal ? d.action : cands[0].id] = (row[legal ? d.action : cands[0].id] ?? 0) + 1;
        apply(world, c, legal ? d : { ...d, action: cands[0].id, target: cands[0].target, fallback: "illegal" }, opts);
        world.turnHash = hashString(`${world.turnHash}|${c.id}|${d.action}|${d.target}`).toString(16);
      }
    }
    if (reflectionAt.includes(world.hour)) await reflect(world, opts);
    // Minds keep moving between formal reflections: everyone uncommitted reconsiders every 6h,
    // and anyone present at a stakes ≥ 2 event reconsiders on the spot.
    else await reflect(world, opts, world.citizens.filter((c) => (world.hour + hashString(c.id)) % 6 === 0), "reconsidered"); // staggered: nobody's mind changes on the same clock
    world.leanHistory.push({ hour: world.hour, tally: tally(world) });
    world.frames.push({ hour: world.hour, at: world.citizens.map((c) => c.location), lean: world.citizens.map((c) => c.lean), committed: world.citizens.map((c) => c.committed), lines: world.hourLines.splice(0) });
    checkTripwires(world, opts);
    world.hourHashes.push(stateHash(world));
    opts.onHour?.(world);
  }
  resolveEnding(world);
  return world;
}
