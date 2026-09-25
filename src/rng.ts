// Deterministic PRNG (mulberry32). Every run derives everything from (scenario, seed).
export interface Rng {
  next(): number;              // [0,1)
  int(maxExclusive: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  range(min: number, max: number): number;
  fork(label: string): Rng;    // independent stream, stable per label
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
    range: (min, max) => min + next() * (max - min),
    fork: (label) => makeRng(hashString(`${seed}:${label}`)),
  };
  return rng;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
