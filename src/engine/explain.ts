// Causes. Every change of mind and every decision gets a "because" the engine can defend from its own numbers.
import type { Citizen, World } from "./state.ts";
import { topTies } from "./state.ts";
import { factors } from "./ending.ts";
import { shortName } from "./sim.ts";

export type Contribs = Record<string, Record<string, number>>; // choiceId → factor → weight·value
export interface Snapshot { hour: number; contrib: Contribs; factors: Record<string, number>; topTie: string | null }

export function contributions(world: World, c: Citizen): Contribs {
  const f = factors(c);
  const out: Contribs = {};
  for (const ch of world.scenario.ending.choices) {
    out[ch.id] = {};
    for (const [k, w] of Object.entries(ch.pull)) out[ch.id][k] = w * (f[k] ?? 0);
  }
  return out;
}
export function snapshot(world: World, c: Citizen): Snapshot {
  return { hour: world.hour, contrib: contributions(world, c), factors: factors(c), topTie: topTieName(world, c) };
}

const TRAIT_WORD: Record<string, string> = { sociable: "sociable", bold: "bold", loyal: "loyal", restless: "restless" };

function topTieName(world: World, c: Citizen): string | null {
  const tt = topTies(c, 1)[0]; if (!tt || tt.affinity < 0.3) return null;
  const id = Object.entries(c.ties).find(([, t]) => t === tt)?.[0];
  return id ? shortName(world.byId.get(id)!.seed.name) : null;
}

/** Phrase a standing reason for holding a choice: the strongest positive contributions. */
function phraseFactor(world: World, c: Citizen, k: string, value: number, weight: number): string | null {
  const [kind, rest] = k.split(":", 2);
  if (kind === "trait") return weight > 0 ? (value >= 0.6 ? `is ${TRAIT_WORD[rest]}` : value >= 0.45 ? `is somewhat ${TRAIT_WORD[rest]}` : null) : value <= 0.4 ? `isn't ${TRAIT_WORD[rest]}` : null;
  if (kind === "belief") { const b = world.scenario.beliefs?.find((b) => b.id === rest); const src = c.beliefSources[rest]; if (!b) return null; return weight > 0 ? (value >= 0.4 ? `believes ${b.text}${src ? ` (${src})` : ""}` : value >= 0.25 ? `half believes ${b.text}` : null) : value <= 0.2 ? `doesn't believe ${b.text}` : null; }
  if (kind === "fear") return `fears ${c.seed.fear}`;
  if (kind === "want") return `wants ${c.seed.want}`;
  if (k === "bonds") { const n = topTieName(world, c); return n && value >= 0.35 ? `is close to ${n}` : weight < 0 && value < 0.2 ? `has no one holding them here` : null; }
  if (k === "means") return value >= 0.5 ? `has money put by` : weight < 0 && value <= 0.25 ? `has nothing put by` : null;
  if (k === "mood") return value <= -0.3 ? `is low` : value >= 0.3 ? `is in good spirits` : null;
  return null;
}

export function explainChoice(world: World, c: Citizen, choiceId: string, n = 2): string {
  const contrib = contributions(world, c)[choiceId] ?? {};
  const f = factors(c);
  const choice = world.scenario.ending.choices.find((x) => x.id === choiceId)!;
  const ranked = Object.entries(contrib).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);
  const phrases: string[] = [];
  for (const [k] of ranked) { const p = phraseFactor(world, c, k, f[k] ?? 0, choice.pull[k]); if (p && !phrases.includes(p)) phrases.push(p); if (phrases.length >= n) break; }
  if (!phrases.length && ranked[0]) { const [k] = ranked[0]; const [kind, rest] = k.split(":", 2); phrases.push(kind === "trait" ? `temperament (${TRAIT_WORD[rest]})` : kind === "belief" ? `a hunch that ${world.scenario.beliefs?.find((b) => b.id === rest)?.text ?? rest}` : k === "bonds" ? "the people here" : k === "means" ? "money" : "mood"); }
  return phrases.length ? phrases.join(", ") : "nothing in particular";
}

/** What changed since the last snapshot, as a person would say it. Returns null when nothing material moved. */
export function whatChanged(world: World, c: Citizen, from: string, to: string, snap: Snapshot): string | null {
  const now = contributions(world, c), f = factors(c);
  const delta: Record<string, number> = {};
  const keys = new Set([...Object.keys(now[to] ?? {}), ...Object.keys(now[from] ?? {})]);
  for (const k of keys) delta[k] = ((now[to]?.[k] ?? 0) - (snap.contrib[to]?.[k] ?? 0)) - ((now[from]?.[k] ?? 0) - (snap.contrib[from]?.[k] ?? 0));
  const [k, d] = Object.entries(delta).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!k || d < 0.03) return null;
  const [kind, rest] = k.split(":", 2);
  const valueNow = f[k] ?? 0, valueThen = snap.factors[k] ?? 0, rose = valueNow > valueThen;
  if (kind === "belief") {
    const b = world.scenario.beliefs?.find((b) => b.id === rest); const src = c.beliefSources[rest];
    return rose ? `came to believe ${b?.text ?? rest}${src ? ` (${src})` : ""}` : `stopped believing ${b?.text ?? rest}${src ? ` (${src})` : ""}`;
  }
  if (k === "bonds") { const n = topTieName(world, c); return rose ? (n ? `grew close to ${n}` : `found people here`) : (c.lastFallingOut ? `fell out with ${c.lastFallingOut}` : `ties loosened`); }
  if (k === "means") return rose ? `has money put by now` : `money ran short`;
  if (k === "mood") return c.lastShock ? `shaken by: ${c.lastShock}` : rose ? `spirits lifted` : `spirits fell`;
  return null;
}

/** Why a citizen moved from one choice to another. Prefers what happened over who they are; says so when only the clock moved. */
export function explainChange(world: World, c: Citizen, from: string | null, to: string, snap: Snapshot | undefined): string {
  const left = world.scenario.clock.hours - world.hour;
  if (!from || !snap) {
    // making up an undecided mind: disposition, plus whatever happened to them recently
    const recent = snap ? whatChanged(world, c, world.scenario.ending.choices.find((x) => x.id !== to)!.id, to, snap) : null;
    return dedupe(`${explainChoice(world, c, to)}${recent ? `; and ${recent}` : ""}`);
  }
  const changed = whatChanged(world, c, from, to, snap);
  if (changed) return changed.includes(" at h") || changed.includes(", h") ? changed : `${changed}${snap.hour < world.hour - 1 ? ` (since h${snap.hour})` : ""}`;
  const over = explainChoice(world, c, from, 1);
  return `nothing new happened — with ${left}h left, ${explainChoice(world, c, to, 1)} won out over ${over === "nothing in particular" ? "where they started" : over}`;
}

/** Why a citizen locks in: their standing reasons, plus the last thing that moved them if it was recent. */
export function explainCommit(world: World, c: Citizen, choice: string): string {
  const last = [...c.memories].reverse().find((m) => m.because && /now leaning|wavered/.test(m.text));
  const standing = explainChoice(world, c, choice);
  const b = last?.because ?? "";
  const informative = b && !b.startsWith("nothing new happened") && !standing.includes(b);
  return dedupe(last && last.hour > world.hour - 24 && informative ? `${standing}; ${b}` : standing);
}

/** Remove repeated fragments ("is bold, is restless; is bold, is restless"). */
export function dedupe(s: string): string {
  // split on ", " / "; " only outside parentheses; drop repeats and any second phrase about the same belief
  const parts: string[] = []; let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (s.startsWith(", ", i) || s.startsWith("; ", i))) { parts.push(cur); cur = ""; i++; continue; }
    cur += ch;
  }
  parts.push(cur);
  const seen = new Set<string>(), beliefs = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const x = raw.trim().replace(/^and /, ""); if (!x || seen.has(x)) continue;
    const bm = /(?:believes|believe|believing) (.+?)(?: \(|$)/.exec(x); if (bm) { if (beliefs.has(bm[1])) continue; beliefs.add(bm[1]); }
    seen.add(x); out.push(x);
  }
  return out.join(", ");
}
