import type { CitizenSeed, Scenario, ScenarioEvent } from "../types.ts";
import { makeRng, type Rng } from "../rng.ts";
import { expandCast } from "../scenario.ts";
import type { Phase } from "./pressure.ts";
import type { DecisionEngine } from "../llm/engine.ts";

export interface Memory { hour: number; text: string; level: 1 | 2 | 3; because?: string; said?: string /* a line spoken or thought — content, not just a verb */ }
export interface TieState { affinity: number; why: string }

export interface Citizen {
  seed: CitizenSeed;
  id: string;
  location: string;
  energy: number;   // 0..1
  means: number;    // 0..1
  mood: number;     // -1..1
  lean: string | null;
  committed: boolean;
  beliefs: Record<string, number>; // confidence 0..1
  ties: Record<string, TieState>;
  memories: Memory[];
  exposedTo: Set<string>;
  beliefSources: Record<string, string>;   // who or what convinced them, e.g. "Bosun Kerr, h50" / "seen at h40"
  prefSnapshot?: import("./explain.ts").Snapshot; // state at the last reconsideration, for explaining change
  lastShock?: string;                      // last stakes ≥ 2 event headline they witnessed
  lastFallingOut?: string;                 // last person a tie dropped below 0.3 with
  lastThought?: { hour: number; text: string }; // the citizen's own most recent inner line — continuity of voice between ticks
  finalChoice?: string;
}

export interface ScheduledEvent { event: ScenarioEvent; at: number; fired: boolean; skipped: boolean; reached: number }

export interface Beat { hour: number; level: 1 | 2 | 3; headline: string; thought?: string; who?: string[]; because?: string }

export interface World {
  scenario: Scenario;
  seed: number;
  rng: Rng;
  hour: number;
  citizens: Citizen[];
  byId: Map<string, Citizen>;
  resources: Record<string, number>;
  schedule: ScheduledEvent[];
  beats: Beat[];
  leanHistory: { hour: number; tally: Record<string, number> }[];
  turnHash: string;      // rolling hash of every applied action so far — changes the moment one decision differs
  hourLines: { c: number; text: string; kind: "say" | "thought" }[]; // lines spoken/thought this hour, drained into the frame
  frames: { hour: number; at: string[]; lean: (string | null)[]; committed: boolean[]; lines: { c: number; text: string; kind: "say" | "thought" }[] }[]; // one per hour, citizen index order — the map replays these
  hourHashes: string[]; // one per hour: where everyone is, what they lean, believe and have committed — for finding where two runs split
  lastTieBeat: Record<string, number>;
  lastTieWord: Record<string, string>;
  prevTieWord: Record<string, string>;
  rumourHops: Record<string, number>;
  named: Set<string>; // hand-written citizens — the ones a viewer can follow
  curve?: Phase[];      // the decision engine's pressure curve, if one is compiled
  engine?: DecisionEngine | null;
  tripped: Set<string>;
  stats: { decisions: number; fallbacks: number; leanFlips: number; firstLeans: number; tieSignFlips: number; commits: number; wavers: number; actionsByPhase: Record<string, Record<string, number>> };
}

export function createWorld(scenario: Scenario, seed: number, engine?: DecisionEngine | null): World {
  const rng = makeRng(seed);
  const absent = new Set(scenario.citizens.filter((c) => c.absent).map((c) => c.id));
  const cast = expandCast(scenario, seed).filter((c) => !absent.has(c.id));
  for (const c of cast) c.ties = c.ties?.filter((t) => !absent.has(t.to));
  const citizens: Citizen[] = cast.map((c) => ({
    seed: c, id: c.id, location: c.home,
    energy: 1, means: 0.2, mood: 0,
    lean: c.lean, committed: false,
    beliefs: Object.fromEntries((scenario.beliefs ?? []).map((b) => [b.id, b.initial])),
    ties: {}, memories: [], exposedTo: new Set(), beliefSources: {},
  }));
  const byId = new Map(citizens.map((c) => [c.id, c]));
  for (const c of cast) for (const t of c.ties ?? []) {
    const me = byId.get(c.id)!;
    me.ties[t.to] = { affinity: t.affinity, why: t.why };
    const them = byId.get(t.to);
    if (them && !them.ties[c.id]) them.ties[c.id] = { affinity: t.affinity * 0.8, why: t.why };
  }
  const erng = rng.fork("events");
  const schedule: ScheduledEvent[] = scenario.events.map((e) => {
    const jitter = e.jitterHours ? Math.round(erng.range(-e.jitterHours, e.jitterHours)) : 0;
    const at = Math.min(scenario.clock.hours - 1, Math.max(1, e.at + jitter));
    return { event: e, at, fired: false, skipped: !erng.chance(e.chance), reached: 0 };
  });
  return {
    scenario, seed, rng, hour: 0, citizens, byId,
    resources: Object.fromEntries((scenario.resources ?? []).map((r) => [r.id, r.initial])),
    schedule, beats: [], leanHistory: [], hourHashes: [], frames: [], hourLines: [], turnHash: "0", lastTieBeat: {}, lastTieWord: {}, prevTieWord: {}, rumourHops: {}, named: new Set(scenario.citizens.map((c) => c.id)),
    engine: engine ?? null, tripped: new Set(),
    curve: engine?.pressureCurve?.length ? engine.pressureCurve.map((p) => ({ fromHour: p.fromHour, name: p.phase, weights: p.weights, note: p.note })) : undefined,
    stats: { decisions: 0, fallbacks: 0, leanFlips: 0, firstLeans: 0, tieSignFlips: 0, commits: 0, wavers: 0, actionsByPhase: {} },
  };
}

export function tally(world: World): Record<string, number> {
  const t: Record<string, number> = Object.fromEntries(world.scenario.ending.choices.map((c) => [c.id, 0]));
  t.undecided = 0;
  for (const c of world.citizens) t[c.lean ?? "undecided"]++;
  return t;
}

export function topTies(c: Citizen, n = 3): TieState[] {
  return Object.values(c.ties).sort((a, b) => b.affinity - a.affinity).slice(0, n);
}
