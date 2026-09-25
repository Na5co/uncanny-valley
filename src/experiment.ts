// Run a scenario over many seeds and answer its social question with numbers.
import type { Scenario } from "./types.ts";
import { runWorld } from "./engine/sim.ts";
import { topTies, type Citizen, type World } from "./engine/state.ts";
import { mockBrain } from "./brains/mock.ts";

/** Column ids for the outcome the scenario measures. */
export function outcomeColumns(s: Scenario): string[] {
  return s.socialQuestion.measure.outcome === "changedMind" ? ["changed", "same"] : s.ending.choices.map((c) => c.id);
}
/** For changedMind, citizens with no hour-0 lean are excluded (returns null) — "changed" must mean changed. */
export function outcomeOf(s: Scenario, c: Citizen): string | null {
  if (s.socialQuestion.measure.outcome === "changedMind") return c.seed.lean === null ? null : c.finalChoice === c.seed.lean ? "same" : "changed";
  return c.finalChoice!;
}

export interface RunSummary {
  seed: number;
  ending: Record<string, number>;
  citizens: { id: string; name: string; role: string; named: boolean; choice: string | null; splitValue: number | string; splitValueEnd: number | string; traits0: Record<string, number>; lean0: string | null }[];
  beats: number;
  eventsFired: string[];
  eventReach: Record<string, number>;
}

export interface RunOpts { splitBy?: string; buckets?: number[]; splitAt?: "start" | "end"; exclude?: Set<string> }

/** The split variable at hour 0 (the default — pre-treatment) or at the end. */
export function splitValue(s: Scenario, world: World, c: Citizen, splitBy = s.socialQuestion.measure.splitBy, at: "start" | "end" = "start"): number | string {
  const [kind, rest] = splitBy.split(":", 2);
  switch (kind) {
    case "trait": return c.seed.traits[rest as keyof typeof c.seed.traits];
    case "topTieAffinity": return at === "start" ? Math.max(0, ...(c.seed.ties ?? []).map((t) => t.affinity)) : topTies(c, 1)[0]?.affinity ?? 0;
    case "belief": return at === "start" ? (s.beliefs?.find((b) => b.id === rest)?.initial ?? 0) : c.beliefs[rest] ?? 0;
    case "exposedTo": return c.exposedTo.has(rest) ? "exposed" : "not exposed"; // exposure is a fact of the run, not a state
    case "lean0": return c.seed.lean ?? "undecided";
    default: return 0;
  }
}

export async function runMany(s: Scenario, seeds: number[], opts: RunOpts = {}): Promise<RunSummary[]> {
  const out: RunSummary[] = [];
  const splitBy = opts.splitBy ?? s.socialQuestion.measure.splitBy;
  for (const seed of seeds) {
    const w = await runWorld(s, seed, { brain: mockBrain });
    const ending: Record<string, number> = Object.fromEntries(s.ending.choices.map((c) => [c.id, 0]));
    for (const c of w.citizens) ending[c.finalChoice!]++;
    out.push({
      seed, ending,
      citizens: w.citizens.filter((c) => !opts.exclude?.has(c.id)).map((c) => ({ id: c.id, name: c.seed.name, role: c.seed.role, named: w.named.has(c.id), choice: outcomeOf(s, c), splitValue: splitValue(s, w, c, splitBy, opts.splitAt ?? "start"), splitValueEnd: splitValue(s, w, c, splitBy, "end"), traits0: c.seed.traits, lean0: c.seed.lean })),
      beats: w.beats.filter((b) => b.level >= 2).length,
      eventsFired: w.schedule.filter((e) => e.fired).map((e) => e.event.id),
      eventReach: Object.fromEntries(w.schedule.filter((e) => e.fired).map((e) => [e.event.id, e.reached])),
    });
  }
  return out;
}

export function bucketLabel(s: Scenario, v: number | string, buckets: number[] | undefined = s.socialQuestion.measure.buckets): string {
  if (typeof v === "string") return v;
  if (!buckets?.length) return v >= 0.5 ? "high" : "low";
  let i = 0; while (i < buckets.length && v >= buckets[i]) i++;
  return i === 0 ? `< ${buckets[0]}` : i === buckets.length ? `≥ ${buckets[buckets.length - 1]}` : `${buckets[i - 1]}–${buckets[i]}`;
}

/** Bucket the split variable and tabulate ending choice per bucket, pooled across runs. String buckets sort alphabetically, numeric by bound. */
export function tabulate(s: Scenario, runs: RunSummary[], buckets: number[] | undefined = s.socialQuestion.measure.buckets) {
  const bucketOf = (v: number | string) => bucketLabel(s, v, buckets);
  const table = new Map<string, Record<string, number>>(); const order = new Map<string, number>();
  for (const r of runs) for (const c of r.citizens) {
    if (c.choice === null) continue;
    const b = bucketOf(c.splitValue);
    const row = table.get(b) ?? Object.fromEntries(outcomeColumns(s).map((ch) => [ch, 0]));
    row[c.choice]++; table.set(b, row);
    if (!order.has(b)) order.set(b, typeof c.splitValue === "number" ? (b.startsWith("<") ? -Infinity : b.startsWith("≥") ? Infinity : parseFloat(b)) : NaN);
  }
  return [...table.entries()].sort((a, b) => { const x = order.get(a[0])!, y = order.get(b[0])!; return isNaN(x) || isNaN(y) ? a[0].localeCompare(b[0]) : x - y; });
}

/** Two-sided 97.5 % Student t critical value (interpolated table); ≈ 1.96 for large n. */
function tCrit(df: number): number {
  const T: [number, number][] = [[1, 12.71], [2, 4.30], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [12, 2.18], [15, 2.13], [20, 2.09], [25, 2.06], [30, 2.04], [40, 2.02], [60, 2.00], [120, 1.98], [1e9, 1.96]];
  if (df < 1) return 12.71;
  for (let i = 1; i < T.length; i++) if (df <= T[i][0]) { const [d0, t0] = T[i - 1], [d1, t1] = T[i]; return t0 + ((df - d0) / (d1 - d0)) * (t1 - t0); }
  return 1.96;
}

/** Wilson 95 % interval for a share. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}

/** Cramér's V over a variants × outcomes count table: 0 = the change made no difference, 1 = it decided everything. */
export function cramersV(table: number[][]): number {
  const rows = table.length, cols = table[0]?.length ?? 0; if (rows < 2 || cols < 2) return 0;
  const rowSum = table.map((r) => r.reduce((a, b) => a + b, 0)), colSum = table[0].map((_, j) => table.reduce((a, r) => a + r[j], 0));
  const n = rowSum.reduce((a, b) => a + b, 0); if (!n) return 0;
  let chi = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const e = (rowSum[i] * colSum[j]) / n; if (e > 0) chi += ((table[i][j] - e) ** 2) / e; }
  return Math.sqrt(chi / (n * Math.min(rows - 1, cols - 1)));
}

export function pooled(s: Scenario, runs: RunSummary[]): { counts: Record<string, number>; n: number } {
  const counts: Record<string, number> = Object.fromEntries(outcomeColumns(s).map((c) => [c, 0]));
  let n = 0;
  for (const r of runs) for (const c of r.citizens) { if (c.choice === null) continue; counts[c.choice] = (counts[c.choice] ?? 0) + 1; n++; }
  return { counts, n };
}

/** Per-seed share of an outcome, then paired differences against a baseline set of runs (same seeds). */
export function pairedDelta(col: string, base: RunSummary[], other: RunSummary[], seeds?: Set<number>): { delta: number; lo: number; hi: number; up: number; down: number; same: number; n: number } {
  const share = (r: RunSummary) => { const cs = r.citizens.filter((c) => c.choice !== null); return cs.length ? cs.filter((c) => c.choice === col).length / cs.length : 0; };
  const byBase = new Map(base.map((r) => [r.seed, share(r)]));
  const ds: number[] = [];
  let up = 0, down = 0, same = 0;
  for (const r of other) { if (!byBase.has(r.seed) || (seeds && !seeds.has(r.seed))) continue; const d = share(r) - byBase.get(r.seed)!; ds.push(d); if (d > 1e-9) up++; else if (d < -1e-9) down++; else same++; }
  const n = ds.length; if (!n) return { delta: 0, lo: 0, hi: 0, up, down, same, n };
  const mean = ds.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const se = sd / Math.sqrt(n), z = tCrit(n - 1);
  return { delta: mean, lo: mean - z * se, hi: mean + z * se, up, down, same, n };
}

/** Paired delta restricted to citizens in one split bucket (per seed: share of `col` among that bucket's citizens). */
export function pairedDeltaInBucket(s: Scenario, col: string, bucket: string, base: RunSummary[], other: RunSummary[], buckets: number[] | undefined, seeds?: Set<number>) {
  const inB = (r: RunSummary) => r.citizens.filter((c) => c.choice !== null && bucketLabel(s, c.splitValue, buckets) === bucket);
  const restrict = (rs: RunSummary[]) => rs.map((r) => ({ ...r, citizens: inB(r) })).filter((r) => r.citizens.length > 0);
  const b = restrict(base), o = restrict(other);
  const common = new Set(b.map((r) => r.seed).filter((sd) => o.some((r) => r.seed === sd) && (!seeds || seeds.has(sd))));
  return pairedDelta(col, b, o, common);
}

export function diversity(s: Scenario, runs: RunSummary[]) {
  const totals: Record<string, number> = Object.fromEntries(s.ending.choices.map((c) => [c.id, 0]));
  let n = 0;
  for (const r of runs) for (const [k, v] of Object.entries(r.ending)) { totals[k] += v; n += v; }
  const shares = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / n]));
  const ok = Object.values(shares).every((x) => x <= 0.8 && x >= 0.05);
  return { shares, ok };
}
