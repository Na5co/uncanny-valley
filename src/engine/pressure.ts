// Default pressure curve — how deadline awareness reshapes priorities. A scenario's decision engine
// (docs/BRAINS.md §1b) will override this per world; until then every world uses this shape.
export interface Phase { fromHour: number; name: string; weights: { social: number; means: number; commit: number; rest: number; belief: number }; note: string }

export const DEFAULT_CURVE: Phase[] = [
  { fromHour: 0,  name: "settling in",  weights: { social: 1.0, means: 1.0, commit: 0.0, rest: 1.0, belief: 0.8 }, note: "There is time. People find out who else is here." },
  { fromHour: 24, name: "taking sides", weights: { social: 1.2, means: 0.8, commit: 0.3, rest: 0.9, belief: 1.0 }, note: "Opinions harden. Who you talk to starts to matter." },
  { fromHour: 48, name: "the squeeze",  weights: { social: 1.4, means: 0.4, commit: 0.8, rest: 0.6, belief: 1.3 }, note: "Work stops mattering. People seek the ones they trust." },
  { fromHour: 64, name: "last hours",   weights: { social: 1.2, means: 0.1, commit: 1.6, rest: 0.3, belief: 1.5 }, note: "Decide, or have it decided for you." },
];

export function phaseAt(hour: number, totalHours: number, curve: Phase[] = DEFAULT_CURVE): Phase {
  const scale = totalHours / 72; // curves are authored against a 72h clock
  let i = 0;
  for (let k = 0; k < curve.length; k++) if (hour >= curve[k].fromHour * scale) i = k;
  const p = curve[i], next = curve[i + 1];
  if (!next) return p;
  // Weights glide between breakpoints so pressure is a slope, not a staircase (no 18-commits-in-one-hour herds).
  const f = Math.min(1, Math.max(0, (hour - p.fromHour * scale) / ((next.fromHour - p.fromHour) * scale)));
  const weights = Object.fromEntries(Object.entries(p.weights).map(([k, v]) => [k, v + (next.weights[k as keyof Phase["weights"]] - v) * f])) as Phase["weights"];
  return { ...p, weights };
}
