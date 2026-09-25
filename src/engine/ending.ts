import type { Citizen, World } from "./state.ts";
import { topTies } from "./state.ts";
import { slugify } from "../scenario.ts";
import type { EndingChoice } from "../types.ts";

/** Engine-known factors a scenario's `pull` weights can reference. New factors are an engine change on purpose. */
export function factors(c: Citizen): Record<string, number> {
  const tt = topTies(c);
  const bonds = tt.length ? Math.max(0, tt.reduce((s, t) => s + t.affinity, 0) / tt.length) : 0;
  const f: Record<string, number> = { bonds, means: c.means, mood: c.mood };
  for (const [k, v] of Object.entries(c.seed.traits)) f[`trait:${k}`] = v;
  for (const [k, v] of Object.entries(c.beliefs)) f[`belief:${k}`] = v;
  f[`fear:${slugify(c.seed.fear)}`] = 1;
  f[`want:${slugify(c.seed.want)}`] = 1;
  return f;
}

export function scoreChoice(c: Citizen, choice: EndingChoice, f = factors(c)): number {
  let s = 0;
  for (const [k, w] of Object.entries(choice.pull)) s += w * (f[k] ?? 0);
  if (c.lean === choice.id) s += 0.2;
  return s;
}

/** Which way this citizen currently leans, and by how much (margin between best and second). */
export function preference(world: World, c: Citizen): { best: string; margin: number; scores: Record<string, number> } {
  const f = factors(c);
  const scores = Object.fromEntries(world.scenario.ending.choices.map((ch) => [ch.id, scoreChoice(c, ch, f)]));
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { best: sorted[0][0], margin: sorted[0][1] - (sorted[1]?.[1] ?? -Infinity), scores };
}

export function resolveEnding(world: World): void {
  const rng = world.rng.fork("ending");
  for (const c of world.citizens) {
    // A lean at the final hour is the choice; only the still-undecided are resolved by their reasons plus a coin's worth of noise.
    if (c.lean) { c.finalChoice = c.lean; continue; }
    const f = factors(c);
    let best = "", bestScore = -Infinity;
    for (const ch of world.scenario.ending.choices) {
      const s = scoreChoice(c, ch, f) + rng.range(-0.1, 0.1);
      if (s > bestScore) { bestScore = s; best = ch.id; }
    }
    c.finalChoice = best;
  }
}
