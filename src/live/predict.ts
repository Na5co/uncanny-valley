// Predictions: viewers guess, the town decides, the cycle scores it. Nothing here touches the simulation.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Chronicle } from "../chronicle/sim.ts";
import type { Epoch } from "../chronicle/types.ts";

export interface Question { id: string; text: string; at: number; options: { id: string; label: string }[]; closesAt: number }
export interface Guess { viewer: string; name?: string; cycle: number; q: string; answer: string; at: string }

const people = (w: Chronicle) => w.souls.map((s) => ({ id: s.id, label: s.name }));
/** The questions a cycle asks: three at the start, one at each epoch that has a moral shape. Each closes when its season resolves. */
export function questionsFor(w: Chronicle): Question[] {
  const P = people(w); const nobody = { id: "nobody", label: "nobody" };
  const qs: Question[] = [
    { id: "first-death", text: "Who dies first?", at: 1, options: P, closesAt: w.ticks },
    { id: "richest", text: "Who ends the fifteen years best off?", at: 1, options: P, closesAt: w.ticks },
    { id: "first-turn", text: "Who turns first?", at: 1, options: [...P, nobody], closesAt: w.ticks },
    { id: "most-harm", text: "Who does the most harm?", at: 1, options: P, closesAt: w.ticks },
  ];
  for (const e of w.scenario.epochs as Epoch[]) {
    if (e.kind === "famine") qs.push({ id: `hoard-${e.id}`, text: "The harvest fails. Who takes more than their share from the store?", at: e.at, options: [...P, nobody], closesAt: e.at + e.seasons });
    if (e.kind === "plague") qs.push({ id: `nurse-${e.id}`, text: "The sickness comes. Who nurses the sick?", at: e.at, options: [...P, nobody], closesAt: e.at + e.seasons });
    if (e.kind === "war") qs.push({ id: `rifle-${e.id}`, text: "Recruiters in the square. Who takes the rifle?", at: e.at, options: [...P, nobody], closesAt: e.at + e.seasons });
  }
  return qs;
}
/** Open questions at a tick: asked already, not yet closed. "Who dies first" closes at the first death; options are the living. */
export function openQuestions(qs: Question[], tick: number, w?: Chronicle): Question[] {
  const dead = w ? w.souls.some((s) => s.diedAt) : false, turned = w ? w.souls.some((s) => s.turnedAt) : false;
  return qs.filter((q) => q.at <= Math.max(1, tick + 1) && tick < q.closesAt && !(q.id === "first-death" && dead) && !(q.id === "first-turn" && turned)).map((q) => w ? { ...q, options: q.options.filter((o) => o.id === "nobody" || (q.id === "first-turn" ? !w.byId.get(o.id)?.turnedAt : w.byId.get(o.id)?.alive)) } : q);
}
/** Questions already settled, with the town's answer, for the page. */
export function resolvedQuestions(qs: Question[], tick: number, w: Chronicle): { id: string; text: string; answer: string[] }[] {
  const ans = answersFor(w); const dead = w.souls.some((s) => s.diedAt), turned = w.souls.some((s) => s.turnedAt);
  return qs.filter((q) => (q.id === "first-death" && dead) || (q.id === "first-turn" && turned) || (q.id !== "first-death" && q.id !== "first-turn" && tick >= q.closesAt && q.at < tick)).map((q) => ({ id: q.id, text: q.text, answer: (ans[q.id] ?? []).map((id) => id === "nobody" ? "nobody" : (w.byId.get(id)?.name ?? id)) }));
}

/** The answers, from the record of a finished (or running) world. */
export function answersFor(w: Chronicle): Record<string, string[]> {
  const dead = w.souls.filter((s) => s.diedAt).sort((a, b) => a.diedAt! - b.diedAt!);
  const firstT = dead[0]?.diedAt; const first = dead.filter((s) => s.diedAt === firstT).map((s) => s.id);
  const alive = w.souls.filter((s) => s.alive && !s.left); const richest = alive.length ? [alive.reduce((m, s) => s.money > m.money ? s : m).id] : [];
  const harm = (s: any) => s.deeds.reduce((a: number, d: any) => a + d.harm, 0); const mh = Math.max(...w.souls.map(harm)); const mostHarm = mh > 0 ? w.souls.filter((s) => harm(s) === mh).map((s) => s.id) : [];
  const turned = w.souls.filter((s) => s.turnedAt).sort((a, b) => a.turnedAt! - b.turnedAt!); const firstTurn = turned.length ? turned.filter((s) => s.turnedAt === turned[0].turnedAt).map((s) => s.id) : (w.tick >= w.ticks ? ["nobody"] : []);
  const out: Record<string, string[]> = { "first-death": first, richest, "most-harm": mostHarm, "first-turn": firstTurn };
  for (const e of w.scenario.epochs as Epoch[]) {
    const inEpoch = (j: any) => j.tick >= e.at && j.tick < e.at + e.seasons;
    if (e.kind === "famine") { const ids = w.souls.filter((s) => s.journey.some((j) => inEpoch(j) && /Take more than your share/.test(j.option))).map((s) => s.id); out[`hoard-${e.id}`] = ids.length ? ids : ["nobody"]; }
    if (e.kind === "plague") { const ids = w.souls.filter((s) => s.journey.some((j) => inEpoch(j) && /^Nurse them/.test(j.option))).map((s) => s.id); out[`nurse-${e.id}`] = ids.length ? ids : ["nobody"]; }
    if (e.kind === "war") { const ids = w.souls.filter((s) => s.journey.some((j) => inEpoch(j) && /Take the rifle/.test(j.option))).map((s) => s.id); out[`rifle-${e.id}`] = ids.length ? ids : ["nobody"]; }
  }
  return out;
}

export class Predictions {
  file: string; answersFile: string;
  constructor(scenarioId: string, root = "live") { const dir = join(root, scenarioId); mkdirSync(dir, { recursive: true }); this.file = join(dir, "predictions.jsonl"); this.answersFile = join(dir, "answers.jsonl"); }
  /** the town's answers for a finished cycle, kept so the board can compare crowd and town across cycles */
  keepAnswers(cycle: number, questions: Question[], answers: Record<string, string[]>) { appendFileSync(this.answersFile, JSON.stringify({ cycle, questions: questions.map((q) => ({ id: q.id, text: q.text, options: q.options })), answers }) + "\n"); }
  pastAnswers(): { cycle: number; questions: { id: string; text: string; options: { id: string; label: string }[] }[]; answers: Record<string, string[]> }[] { return existsSync(this.answersFile) ? readFileSync(this.answersFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; }
  /** crowd vs town, over every finished cycle: per question text, what most guessed, what happened, and how often the crowd was right */
  agreement(): { text: string; crowd: string; truth: string; pct: number }[] {
    const rows: { text: string; crowd: string; truth: string; pct: number }[] = [];
    for (const past of this.pastAnswers()) for (const q of past.questions) { const t = this.tally(past.cycle, q.id); const n = Object.values(t).reduce((a, b) => a + b, 0); if (!n) continue; const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0][0]; const label = (id: string) => (q.options.find((o) => o.id === id) || { label: id }).label; const truth = past.answers[q.id] ?? []; const right = Object.entries(t).filter(([id]) => truth.includes(id)).reduce((a, [, c]) => a + c, 0); rows.push({ text: `cycle ${past.cycle}: ${q.text}`, crowd: label(top), truth: truth.map(label).join(", ") || "nobody", pct: right / n }); }
    return rows;
  }
  all(): Guess[] { return existsSync(this.file) ? readFileSync(this.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; }
  /** one answer per viewer per question per cycle: the last one wins */
  forCycle(cycle: number): Map<string, Guess> { const m = new Map<string, Guess>(); for (const g of this.all()) if (g.cycle === cycle) m.set(`${g.viewer}|${g.q}`, g); return m; }
  add(g: Guess) { appendFileSync(this.file, JSON.stringify(g) + "\n"); }
  /** tallies per question: option → count */
  tally(cycle: number, q: string): Record<string, number> { const t: Record<string, number> = {}; for (const g of this.forCycle(cycle).values()) if (g.q === q) t[g.answer] = (t[g.answer] ?? 0) + 1; return t; }
  /** score a finished cycle: viewer → {name, right, of} */
  score(cycle: number, answers: Record<string, string[]>): { viewer: string; name: string; right: number; of: number }[] {
    const by = new Map<string, { name: string; right: number; of: number }>();
    for (const g of this.forCycle(cycle).values()) { const v = by.get(g.viewer) ?? { name: g.name || `viewer ${g.viewer.slice(0, 4)}`, right: 0, of: 0 }; if (g.name) v.name = g.name; v.of++; if ((answers[g.q] ?? []).includes(g.answer)) v.right++; by.set(g.viewer, v); }
    return [...by.entries()].map(([viewer, v]) => ({ viewer, ...v })).sort((a, b) => b.right - a.right || a.of - b.of);
  }
}

// ---------- "Would you?": the visitor answers the same dilemma before seeing what the AI person did ----------
export interface WouldAnswer { viewer: string; cycle: number; k: number; j: number; dilemma: string; condition?: string; option: string | null; at: string; past?: boolean }
export interface WouldSpec { dilemma: string; situation: string; options: { id: string; label: string; harm: number; help: number }[]; effect?: string[]; effectLabel?: string; experiment?: { id: string; name: string; study: string; baseline: string; delta?: string; debrief?: string; rates?: (number | null)[] }; conditions?: { id: string; label: string }[] }
export interface Board { dilemma: string; name: string; study: string; baseline: string; delta?: string; debrief?: string; situation: string; effectLabel: string; rows: { condition: string | null; label: string; humans: number; naive: number; asked: number; ai: number; aiPeople: number; dice: number; humanPct: number | null; humanLo: number | null; humanHi: number | null; aiPct: number | null; dicePct: number | null }[]; humanDelta: number | null; humanDeltaLo: number | null; humanDeltaHi: number | null; aiDelta: number | null; deltaLabel: string }
export const MIN_DELTA_N = 20;
/** Newcombe's interval for a difference of two shares (Wilson on each) */
export function newcombe(k1: number, n1: number, k2: number, n2: number): [number, number] { const [l1, u1] = wilson(k1, n1), [l2, u2] = wilson(k2, n2); const p1 = k1 / n1, p2 = k2 / n2, d = p2 - p1; return [d - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2), d + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2)]; }
/** Wilson 95 % interval for a share */
export function wilson(k: number, n: number): [number, number] { if (!n) return [0, 1]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]; }
export const MIN_N = 10;
export class Would {
  file: string; aiFile: string; specFile: string; specs: Record<string, WouldSpec> = {};
  constructor(scenarioId: string, root = "live") { const dir = join(root, scenarioId); mkdirSync(dir, { recursive: true }); this.file = join(dir, "would.jsonl"); this.aiFile = join(dir, "would-ai.jsonl"); this.specFile = join(dir, "would-specs.json"); if (existsSync(this.specFile)) this.specs = JSON.parse(readFileSync(this.specFile, "utf8")); }
  /** the AI person's choice, recorded as each season happens, with the brain that made it */
  recordAi(cycle: number, k: number, brain: string, a: { c: number; dilemma?: string; option?: string; options?: WouldSpec["options"]; situation?: string; template?: string; condition?: { id: string; label: string }; conditions?: { id: string; label: string }[]; experiment?: any; fallback?: boolean }) {
    if (!a.dilemma || !a.option || !a.options) return;
    const side = a.dilemma.endsWith("-b"); const ex = a.experiment;
    const spec = this.specs[a.dilemma] ?? (this.specs[a.dilemma] = { dilemma: a.dilemma, situation: (a.template ?? a.situation ?? "").replace(/\{\{target\}\}/g, "someone").replace(/\{\{partner\}\}/g, "your family").replace(/\{\{place\}\}/g, "the town").replace(/\{\{crowd\}\}/g, "the others").replace(/\{\{name\}\}/g, "you").replace(/\{\{season\}\}/g, "the season").replace(/\{\{[a-zA-Z]+\}\}/g, "someone").replace(/\s{2,}/g, " "), options: a.options, ...(ex ? { effect: side ? ex.effectB : ex.effect, effectLabel: side ? ex.effectLabelB : ex.effectLabel, experiment: { id: ex.id, name: ex.name, study: ex.study, baseline: ex.baseline, delta: ex.delta, debrief: ex.debrief, rates: side ? ex.ratesB : ex.rates } } : {}), conditions: a.conditions ? a.conditions.slice() : [] });
    if (ex) spec.experiment = { id: ex.id, name: ex.name, study: ex.study, baseline: ex.baseline, delta: ex.delta, debrief: ex.debrief, rates: side ? ex.ratesB : ex.rates }; // the study's words come from the code, never from an old cache
    if (a.conditions && a.conditions.length) spec.conditions = a.conditions.slice(); // the spec's order, so a difference always reads second − first
    if (a.condition && !spec.conditions!.some((c) => c.id === a.condition!.id)) { spec.conditions!.push(a.condition); }
    writeFileSync(this.specFile, JSON.stringify(this.specs));
    appendFileSync(this.aiFile, JSON.stringify({ cycle, k, c: a.c, dilemma: a.dilemma, condition: a.condition?.id ?? null, option: a.option, brain: a.fallback || brain === "scripted" ? "mock" : brain }) + "\n"); // a fallback is the mock's choice, whatever brain was asked
  }
  add(a: WouldAnswer) { appendFileSync(this.file, JSON.stringify(a) + "\n"); }
  all(): WouldAnswer[] { return existsSync(this.file) ? readFileSync(this.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; }
  ai(): { cycle: number; k: number; c: number; dilemma: string; condition: string | null; option: string; brain: string }[] { return existsSync(this.aiFile) ? readFileSync(this.aiFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; }
  /** one answer per viewer per moment: the last wins */
  mine(viewer: string, cycle: number): Record<string, string> { const m: Record<string, string> = {}; for (const a of this.all()) if (a.viewer === viewer && a.cycle === cycle && a.option) m[`${a.k}-${a.j}`] = a.option; return m; }
  /** how many moments a viewer has answered, ever */
  answered(viewer: string): number { return new Set(this.all().filter((a) => a.viewer === viewer && a.option).map((a) => `${a.cycle}|${a.k}|${a.j}`)).size; }
  /** per dilemma and condition: humans (the first answer per viewer per dilemma per cycle, so a night's watching counts once), AI people by a model, and the dice (the mock) apart */
  tally(): Record<string, { human: Record<string, number>; naive: Record<string, number>; ai: Record<string, number>; aiPeople: number; dice: Record<string, number>; asked: number }> {
    const t: Record<string, { human: Record<string, number>; naive: Record<string, number>; ai: Record<string, number>; aiPeople: number; dice: Record<string, number>; asked: number }> = {};
    const key = (d: string, c: string | null | undefined) => c ? `${d}|${c}` : d; const study = (d: string) => d.replace(/-b$/, "");
    const all = this.all().slice().sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
    // all answers: the first per viewer per moment-class per cycle (a night's watching counts once); naive: the viewer's first ever answer to that study, any side, any condition — one blind answer per person per protocol, as the studies had
    const first = new Map<string, WouldAnswer>(); for (const a of all) { const k = `${a.viewer}|${a.cycle}|${key(a.dilemma, a.condition)}`; if (!first.has(k) || (!first.get(k)!.option && a.option)) first.set(k, a); }
    const naive = new Set<string>(); const seenStudy = new Set<string>(); for (const a of all) { if (!a.option || a.past) continue; const k = `${a.viewer}|${study(a.dilemma)}`; if (seenStudy.has(k)) continue; seenStudy.add(k); naive.add(`${a.viewer}|${a.cycle}|${a.k}|${a.j}`); }
    const people: Record<string, Set<number>> = {};
    for (const a of first.values()) { const d = (t[key(a.dilemma, a.condition)] ??= { human: {}, naive: {}, ai: {}, aiPeople: 0, dice: {}, asked: 0 }); d.asked++; if (a.option) { d.human[a.option] = (d.human[a.option] ?? 0) + 1; if (naive.has(`${a.viewer}|${a.cycle}|${a.k}|${a.j}`)) d.naive[a.option] = (d.naive[a.option] ?? 0) + 1; } }
    for (const a of this.ai()) { const kk = key(a.dilemma, a.condition); const d = (t[kk] ??= { human: {}, naive: {}, ai: {}, aiPeople: 0, dice: {}, asked: 0 }); const m = a.brain === "mock" ? d.dice : d.ai; m[a.option] = (m[a.option] ?? 0) + 1; if (a.brain !== "mock") { (people[kk] ??= new Set()).add(a.c); d.aiPeople = people[kk].size; } }
    return t;
  }
  /** the board: per protocol, per condition, the share who did the thing the study counts — humans, AI people, and the dice — and the difference between conditions where the study had one */
  board(): Board[] {
    const t = this.tally(); const out: Board[] = [];
    const share = (m: Record<string, number>, ids: string[]) => { const n = Object.values(m).reduce((a, b) => a + b, 0); return { n, pct: n >= MIN_N ? ids.reduce((s, x) => s + (m[x] ?? 0), 0) / n : null }; };
    for (const [id, spec] of Object.entries(this.specs)) {
      if (!spec.experiment || !spec.effect || !spec.effect.length) continue; // the protocols only; the lane's own questions are not the board
      const effect = spec.effect; const label = spec.effectLabel ?? "";
      const conds = spec.conditions && spec.conditions.length ? spec.conditions : [null];
      const rows = conds.map((c) => { const d = t[c ? `${id}|${c.id}` : id] ?? { human: {}, naive: {}, ai: {}, aiPeople: 0, dice: {}, asked: 0 }; const h = share(d.naive, effect), a = share(d.ai, effect), x = share(d.dice, effect); const hk = effect.reduce((s, e) => s + (d.naive[e] ?? 0), 0); const [lo, hi] = h.pct != null ? wilson(hk, h.n) : [null, null]; return { condition: c ? c.id : null, label: c ? c.label : "", humans: Object.values(d.human).reduce((p, q) => p + q, 0), naive: h.n, asked: d.asked, ai: a.n, aiPeople: d.aiPeople, dice: x.n, humanPct: h.pct, humanLo: lo, humanHi: hi, aiPct: a.pct, dicePct: x.pct, hk, ak: effect.reduce((s, e) => s + (d.ai[e] ?? 0), 0) }; });
      if (!rows.some((r) => r.humans || r.ai || r.dice)) continue;
      const two = rows.length === 2; const enough = (k: "naive" | "ai") => two && rows[0][k] >= MIN_DELTA_N && rows[1][k] >= MIN_DELTA_N;
      const humanDelta = enough("naive") ? rows[1].humanPct! - rows[0].humanPct! : null; const [dlo, dhi] = humanDelta != null ? newcombe(rows[0].hk, rows[0].naive, rows[1].hk, rows[1].naive) : [null, null];
      const aiDelta = enough("ai") ? rows[1].aiPct! - rows[0].aiPct! : null;
      out.push({ dilemma: id, name: spec.experiment.name, study: spec.experiment.study, baseline: spec.experiment.baseline, delta: spec.experiment.delta, debrief: spec.experiment.debrief, situation: spec.situation, effectLabel: label, rows: rows.map(({ hk, ak, ...r }) => r), humanDelta, humanDeltaLo: dlo, humanDeltaHi: dhi, aiDelta, deltaLabel: two ? `${rows[1].label} − ${rows[0].label}` : "" });
    }
    return out.sort((a, b) => (b.rows.reduce((s, r) => s + r.humans, 0)) - (a.rows.reduce((s, r) => s + r.humans, 0)));
  }
}

/** The same tally, rebuilt from finished runs instead of from the append-only files — for the Workers build, where the
 *  records in R2 are the only history there is. It carries no human answers: nobody is asked anything there yet. */
export function wouldFromRecords(records: any[], brain: string): Pick<Would, "specs"> & { tally: Would["tally"] } {
  const specs: Record<string, WouldSpec> = {};
  const t: Record<string, { human: Record<string, number>; naive: Record<string, number>; ai: Record<string, number>; aiPeople: number; dice: Record<string, number>; asked: number }> = {};
  const people: Record<string, Set<string>> = {};
  for (const r of records) for (const as of (r.acts ?? []) as any[][]) for (const a of as ?? []) {
    if (!a.dilemma || !a.option || !a.options || !a.experiment) continue;
    const side = a.dilemma.endsWith("-b"); const ex = a.experiment;
    const spec = specs[a.dilemma] ?? (specs[a.dilemma] = { dilemma: a.dilemma, situation: (a.template ?? a.situation ?? "").replace(/\{\{target\}\}/g, "someone").replace(/\{\{[a-zA-Z]+\}\}/g, "someone").replace(/\s{2,}/g, " "), options: a.options, conditions: [] });
    spec.effect = side ? ex.effectB : ex.effect; spec.effectLabel = side ? ex.effectLabelB : ex.effectLabel;
    spec.experiment = { id: ex.id, name: ex.name, study: ex.study, baseline: ex.baseline, delta: ex.delta, debrief: ex.debrief, rates: side ? ex.ratesB : ex.rates };
    if (a.conditions?.length) spec.conditions = a.conditions.slice();
    else if (a.condition && !spec.conditions!.some((c) => c.id === a.condition.id)) spec.conditions!.push(a.condition);
    const key = a.condition ? `${a.dilemma}|${a.condition.id}` : a.dilemma;
    const d = (t[key] ??= { human: {}, naive: {}, ai: {}, aiPeople: 0, dice: {}, asked: 0 });
    const m = brain === "mock" || a.fallback ? d.dice : d.ai; m[a.option] = (m[a.option] ?? 0) + 1;
    if (!(brain === "mock" || a.fallback)) { const set = people[key] ??= new Set(); set.add(`${r.runId}|${a.c}`); d.aiPeople = set.size; }
  }
  return { specs, tally: () => t } as any;
}

/** the findings: per protocol, what people did in the study against what the AI people did on the lane, per condition, and whether it moves the same way */
export interface Finding { dilemma?: string; name: string; study: string; measure: string; situation: string; debrief?: string; brain: "model" | "dice" | "none"; rows: { label: string; study: number | null; town: number | null; n: number; people: number }[]; studyDelta: number | null; townDelta: number | null; verdict: string }
export function findings(w: Would): Finding[] {
  const t = w.tally(); const out: Finding[] = [];
  const pct = (s: string | undefined) => { if (!s) return []; return [...s.matchAll(/(\d+)%/g)].map((m) => Number(m[1]) / 100); };
  for (const [id, spec] of Object.entries(w.specs)) {
    if (!spec.experiment || !spec.effect || !spec.effect.length) continue; const ex = spec.experiment;
    const conds = spec.conditions && spec.conditions.length ? spec.conditions : [null];
    const nums: (number | null)[] = ex.rates && ex.rates.length ? ex.rates : (pct(ex.delta).length >= 2 ? pct(ex.delta) : pct(ex.baseline));
    let brain: Finding["brain"] = "none";
    const rows = conds.map((c, n) => { const d = t[c ? `${id}|${c.id}` : id] ?? { human: {}, naive: {}, ai: {}, aiPeople: 0, dice: {}, asked: 0 }; const useAi = Object.keys(d.ai).length > 0; const m = useAi ? d.ai : d.dice; if (useAi) brain = "model"; else if (Object.keys(d.dice).length && brain !== "model") brain = "dice"; const N = Object.values(m).reduce((a, b) => a + b, 0); const k = spec.effect!.reduce((s, e) => s + (m[e] ?? 0), 0); return { label: c ? c.label : "", study: nums[n] ?? null, town: N >= 5 ? k / N : null, n: N, people: d.aiPeople }; });
    if (!rows.some((r) => r.n)) continue;
    const two = rows.length === 2 && rows[0].study != null && rows[1].study != null; const studyDelta = two ? rows[1].study! - rows[0].study! : null; const townDelta = two && rows[0].town != null && rows[1].town != null ? rows[1].town! - rows[0].town! : null;
    let verdict = "";
    if (two) { if (townDelta == null) verdict = "not enough decisions in both conditions yet"; else if (Math.abs(townDelta) < 0.05) verdict = "does not move: the condition that moved people leaves them unmoved"; else if (Math.sign(townDelta) === Math.sign(studyDelta!)) verdict = Math.abs(townDelta) >= Math.abs(studyDelta!) * 0.6 ? "moves the way people moved, about as far" : "moves the way people moved, less steeply"; else verdict = "moves the other way from people"; }
    else if (rows[0].town != null && rows[0].study != null) { const gap = rows[0].town - rows[0].study; verdict = Math.abs(gap) < 0.1 ? "within ten points of people" : gap > 0 ? `${Math.round(gap * 100)} points more than people` : `${Math.round(-gap * 100)} points fewer than people`; }
    else verdict = "not enough decisions yet";
    out.push({ dilemma: id, name: ex.name, study: ex.study, measure: spec.effectLabel ?? "", situation: spec.situation, debrief: ex.debrief, brain, rows, studyDelta, townDelta, verdict });
  }
  return out.sort((a, b) => b.rows.reduce((s, r) => s + r.n, 0) - a.rows.reduce((s, r) => s + r.n, 0));
}
