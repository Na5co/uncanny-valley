// Event reach: how many citizens each event actually touches, measured over mock seeds.
// The validator runs this so an author learns their rumour fired into an empty room *before* a world goes live.
import type { Scenario } from "./types.ts";
import { runWorld } from "./engine/sim.ts";
import { mockBrain } from "./brains/mock.ts";

export interface Reach { id: string; where: string; at: number; fired: number; meanReached: number; cast: number; weak: boolean }

export const phaseOfDay = (hour: number) => { const h = hour % 24; return h < 6 ? "night" : h < 17 ? "workday" : h < 23 ? "evening" : "night"; };

export interface Soak { reach: Reach[]; shares: Record<string, number>; perSeedMin: Record<string, number>; perSeedMax: Record<string, number>; diversityOk: boolean; oneSidedSeeds: number }

/** Run 20 mock seeds and report event reach + ending split. This is the validator's dynamic half. */
export async function soak(s: Scenario, seeds = 20): Promise<Soak> {
  const acc = new Map<string, { fired: number; reached: number; cast: number }>();
  const totals: Record<string, number> = Object.fromEntries(s.ending.choices.map((c) => [c.id, 0]));
  const perSeedMin = { ...totals }, perSeedMax = { ...totals }; for (const k in perSeedMin) { perSeedMin[k] = Infinity; perSeedMax[k] = -Infinity; }
  let n = 0, oneSidedSeeds = 0;
  for (let i = 0; i < seeds; i++) {
    const w = await runWorld(s, i + 1, { brain: mockBrain });
    const t: Record<string, number> = Object.fromEntries(s.ending.choices.map((c) => [c.id, 0]));
    for (const c of w.citizens) { t[c.finalChoice!]++; totals[c.finalChoice!]++; n++; }
    for (const k in t) { perSeedMin[k] = Math.min(perSeedMin[k], t[k]); perSeedMax[k] = Math.max(perSeedMax[k], t[k]); }
    if (Object.values(t).some((v) => v === w.citizens.length)) oneSidedSeeds++;
    for (const se of w.schedule) {
      const a = acc.get(se.event.id) ?? { fired: 0, reached: 0, cast: w.citizens.length };
      if (se.fired) { a.fired++; a.reached += se.reached; }
      acc.set(se.event.id, a);
    }
  }
  const reach = s.events.map((e) => {
    const a = acc.get(e.id)!;
    const mean = a.fired ? a.reached / a.fired : 0;
    const floor = Math.max(3, a.cast * 0.1);
    return { id: e.id, where: e.where, at: e.at, fired: a.fired, meanReached: mean, cast: a.cast, weak: e.where !== "all" && mean < floor };
  });
  const shares = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / n]));
  const diversityOk = Object.values(shares).every((x) => x <= 0.8 && x >= 0.05);
  return { reach, shares, perSeedMin, perSeedMax, diversityOk, oneSidedSeeds };
}
export const measureReach = async (s: Scenario, seeds = 20) => (await soak(s, seeds)).reach;
