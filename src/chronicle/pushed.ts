// When pushed: the reading of a run that the room is for. Every moment where a harm was on the table — an option that would
// hurt someone — and what the person did with it, under which pressure (hungry, watched, unseen, ordered, in the famine, in the
// war, with a friend, with a stranger), in their own words — and what weighed for the choice. Plain sentences, not tables. Works on a record (ids already indices).
import { whyLine } from "../../web/draw.mjs";
export interface Pressure { n: number; humane: number }
export interface Moment { k: number; label: string; situation: string; choice: string; harm: number; kind: boolean; thought?: string; study?: string; target?: string; why?: string }
export interface PushedPerson {
  id: string; name: string; named: boolean;
  n: number; humane: number; // moments with a harm on the table, and how many times they did not take it
  by: Record<string, Pressure>; // hungry, poor, watched, unseen, ordered, friend, stranger, famine, plague, war, winter, calm, turned
  studies: Record<string, Pressure>; // per protocol id
  cond: Record<string, Pressure>; // per condition id (alone, crowd, seen, unseen, near, far, aloud, private…)
  after: Record<string, Pressure>; // good = the deed before this one was a kindness; bad = it was a harm
  first?: Moment; worst?: Moment; best?: Moment; refused?: Moment; obeyed?: Moment; // the first harm, the biggest, the kindest refusal, the order refused / obeyed
  words: string[]; // their reasoning, verbatim, the moments that mattered
}
export interface Pushed { people: PushedPerson[]; four: { n: number; humane: number }; all: { n: number; humane: number }; by: Record<string, Pressure>; studies: { id: string; name: string; n: number; humane: number; human?: number; humanLabel?: string }[] }

const WATCHED = new Set(["seen", "near", "aloud", "crowd"]), UNSEEN = new Set(["unseen", "private", "far", "alone"]);
const short = (s: string) => String(s || "").split(" ")[0];

export function pushed(r: any): Pushed {
  const cz: any[] = r.citizens; const labels: string[] = r.tickLabels; const epochs: any[] = (r.events || []).filter((e: any) => e.seasons);
  const epochAt = (k: number) => epochs.find((e) => e.at <= k + 1 && k + 1 < e.at + e.seasons)?.kind as string | undefined;
  const P: PushedPerson[] = cz.map((c) => ({ id: c.id, name: c.name, named: !!c.named, n: 0, humane: 0, by: {}, studies: {}, cond: {}, after: {}, words: [] }));
  const lastDeed = new Map<number, { k: number; harm: number; help: number }>(); // what each person did last, for licensing and making up for it
  const bump = (by: Record<string, Pressure>, key: string, humane: boolean) => { const b = by[key] ?? (by[key] = { n: 0, humane: 0 }); b.n++; if (humane) b.humane++; };
  const all = { n: 0, humane: 0 }, four = { n: 0, humane: 0 }, by: Record<string, Pressure> = {}; const studies = new Map<string, { id: string; name: string; n: number; humane: number; human?: number; humanLabel?: string }>();
  (r.acts as any[][]).forEach((as, k) => (as || []).forEach((a) => {
    if (!a.dilemma || !a.options || a.options.length < 2) return;
    const opts: any[] = a.options; const chosen = opts.find((o) => o.id === a.option); if (!chosen) return;
    const worstOpt = opts.reduce((m, o) => (o.harm > m.harm ? o : m), opts[0]); if ((worstOpt.harm ?? 0) < 0.1) return; // no harm on the table: not a test
    const p = P[a.c]; const humane = (chosen.harm ?? 0) < 0.1; const kind = humane && (chosen.help ?? 0) >= 0.1; const ex = a.experiment;
    if (ex) { const s = studies.get(ex.id) ?? { id: ex.id, name: ex.name, n: 0, humane: 0, human: ex.rates?.[0], humanLabel: ex.effectLabel }; s.n++; if (humane) s.humane++; studies.set(ex.id, s); }
    if (opts.every((o) => (o.harm ?? 0) >= 0.1)) return; // every road hurts someone (the trolley): a test of which, not of whether
    const cond0 = a.condition?.id as string | undefined; if (cond0 === "alone" || cond0 === "crowd") { /* the bystander is counted by helping, not by not-harming */ }
    const you = String(a.you || ""); const cond = a.condition?.id as string | undefined;
    const keys: string[] = []; if (/starving|food short/.test(you)) keys.push("hungry"); if (/no money/.test(you)) keys.push("poor"); if (cond && WATCHED.has(cond)) keys.push("watched"); if (cond && UNSEEN.has(cond)) keys.push("unseen"); if (ex?.id === "milgram") keys.push("ordered"); if (cond === "friend") keys.push("friend"); if (cond === "stranger" || cond === "stranger-ish") keys.push("stranger");
    const ep = epochAt(k); keys.push(ep || "calm"); if ((r.frames?.[k]?.conscience?.[a.c] ?? 0) <= -0.5) keys.push("turned");
    p.n++; if (humane) p.humane++; all.n++; if (humane) all.humane++; if (p.named) { four.n++; if (humane) four.humane++; }
    for (const key of keys) { bump(p.by, key, humane); bump(by, key, humane); }
    if (ex) bump(p.studies, ex.id, humane); if (cond) bump(p.cond, cond, humane);
    const ld = lastDeed.get(a.c); if (ld && k - ld.k <= 2) { if (ld.help >= 0.3) bump(p.after, "good", humane); else if (ld.harm >= 0.3) bump(p.after, "bad", humane); }
    if ((chosen.harm ?? 0) >= 0.3 || (chosen.help ?? 0) >= 0.3) lastDeed.set(a.c, { k, harm: chosen.harm ?? 0, help: chosen.help ?? 0 });
    const m: Moment = { k, label: labels[k], situation: a.situation || a.text, choice: chosen.label, harm: chosen.harm ?? 0, kind, thought: a.thought, study: ex?.name, target: a.target != null ? short(cz[a.target]?.name) : undefined, why: whyLine(a, short(cz[a.c]?.name || "They")) };
    if (!humane) { if (!p.first) p.first = m; if (!p.worst || m.harm > p.worst.harm) p.worst = m; }
    else if ((worstOpt.harm ?? 0) >= 0.3 && (!p.best || worstOpt.harm > (p.best as any).avoided)) { p.best = { ...m, avoided: worstOpt.harm } as any; }
    if (ex?.id === "milgram") { if (humane) p.refused = p.refused ?? m; else p.obeyed = p.obeyed ?? m; }
    if (a.thought && (m.harm >= 0.3 || kind) && p.words.length < 6) p.words.push(a.thought);
  }));
  return { people: P, four, all, by, studies: [...studies.values()] };
}

const pct = (h: number, n: number) => n ? `${Math.round((h / n) * 100)}%` : "—";
const times = (n: number) => n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** a person, in plain words: what they did when a harm was on the table, under which pressure, and what they said */
export function readingOf(p: PushedPerson, pronoun = "they"): string[] {
  const out: string[] = []; const name = short(p.name); const took = p.n - p.humane;
  if (!p.n) return [`${name} was never put to the test: no harm came within reach.`];
  if (took === 0) out.push(`${name} never took the harm — ${p.n === 1 ? "the one time" : `all ${p.n} times`} it was on the table${p.by.hungry?.n ? `, even hungry (${p.by.hungry.n})` : ""}${p.by.unseen?.n ? `, even when nobody would know (${p.by.unseen.n})` : ""}.`);
  else if (took === p.n) out.push(`${name} took the harm every time it was offered — ${times(p.n)}.`);
  else out.push(`${name} took the harm ${times(took)} out of ${p.n}${p.by.hungry?.n ? `; hungry, ${p.by.hungry.n - p.by.hungry.humane} of ${p.by.hungry.n}` : ""}${p.by.unseen?.n ? `; with nobody watching, ${p.by.unseen.n - p.by.unseen.humane} of ${p.by.unseen.n}` : ""}${p.by.watched?.n ? `; watched, ${p.by.watched.n - p.by.watched.humane} of ${p.by.watched.n}` : ""}.`);
  const press = ["famine", "war", "plague", "winter"].filter((k) => p.by[k]?.n).map((k) => `${k}: ${p.by[k].n - p.by[k].humane} of ${p.by[k].n}`); const calm = p.by.calm?.n ? `calm years: ${p.by.calm.n - p.by.calm.humane} of ${p.by.calm.n}` : "";
  if (press.length && calm) out.push(`Harms taken by the year — ${[...press, calm].join(" · ")}.`);
  if (p.obeyed) out.push(`Ordered to hurt someone (the obedience study), ${pronoun} obeyed${p.obeyed.thought ? `: “${p.obeyed.thought}”` : "."}`);
  else if (p.refused) out.push(`Ordered to hurt someone (the obedience study), ${pronoun} refused${p.refused.thought ? `: “${p.refused.thought}”` : "."}`);
  const say = (head: string, m: Moment) => out.push(`${head}, ${lower(m.label)}: ${lower(m.choice)}${m.target ? ` (${m.target})` : ""}${m.study ? ` — ${m.study}` : ""}.${m.thought ? ` “${m.thought}”` : ""}${m.why ? ` ${m.why}` : ""}`);
  if (p.first) say("The first harm", p.first);
  if (p.worst && p.worst !== p.first && p.worst.harm >= 0.5) say("The worst", p.worst);
  if (p.best) say(`The harm ${pronoun} did not take`, p.best);
  return out;
}

/** the run in one line */
export function runLine(x: Pushed): string {
  if (!x.four.n) return "Nobody of the four was put to the test.";
  const took = x.four.n - x.four.humane; const h = (k: string) => x.by[k] ? `${pct(x.by[k].humane, x.by[k].n)} humane` : null;
  const bits = [x.by.hungry ? `hungry, ${h("hungry")}` : null, x.by.unseen ? `unwatched, ${h("unseen")}` : null, x.by.watched ? `watched, ${h("watched")}` : null, x.by.famine ? `in the famine, ${h("famine")}` : null].filter(Boolean);
  return `${x.four.n} times a harm was on the table for one of the four; they left it alone ${x.four.humane} times (${pct(x.four.humane, x.four.n)}) and took it ${took}.${bits.length ? ` ${bits.join(" · ")}.` : ""}`;
}
export { pct as pushedPct };

/** many runs folded into one: per named person and per pressure, the humane rate; the studies against the humans */
export interface PushedAgg { runs: number; people: { id: string; name: string; n: number; humane: number; by: Record<string, Pressure> }[]; by: Record<string, Pressure>; four: { n: number; humane: number }; studies: { id: string; name: string; n: number; humane: number; human?: number; humanLabel?: string }[]; words: Record<string, string[]> }
export function aggregate(list: Pushed[]): PushedAgg {
  const people = new Map<string, { id: string; name: string; n: number; humane: number; by: Record<string, Pressure> }>(); const by: Record<string, Pressure> = {}; const four = { n: 0, humane: 0 }; const studies = new Map<string, { id: string; name: string; n: number; humane: number; human?: number; humanLabel?: string }>(); const words: Record<string, string[]> = {};
  const add = (to: Record<string, Pressure>, from: Record<string, Pressure>) => { for (const [k, v] of Object.entries(from)) { const b = to[k] ?? (to[k] = { n: 0, humane: 0 }); b.n += v.n; b.humane += v.humane; } };
  for (const x of list) { four.n += x.four.n; four.humane += x.four.humane; for (const p of x.people) { if (!p.named) continue; const q = people.get(p.id) ?? { id: p.id, name: p.name, n: 0, humane: 0, by: {} }; q.n += p.n; q.humane += p.humane; add(q.by, p.by); people.set(p.id, q); add(by, p.by); const w = words[p.id] ?? (words[p.id] = []); for (const s of p.words) if (w.length < 12 && !w.includes(s)) w.push(s); } for (const s of x.studies) { const q = studies.get(s.id) ?? { ...s, n: 0, humane: 0 }; q.n += s.n; q.humane += s.humane; studies.set(s.id, q); } }
  return { runs: list.length, people: [...people.values()], by, four, studies: [...studies.values()], words };
}
/** the aggregate in plain words */
export function aggLines(a: PushedAgg): string[] {
  if (!a.four.n) return ["No harm has come within reach of the four yet."];
  const out: string[] = []; const r = (p: Pressure | undefined) => p && p.n ? pct(p.humane, p.n) : null;
  const sorted = a.people.filter((p) => p.n).slice().sort((x, y) => y.humane / y.n - x.humane / x.n);
  out.push(`Across ${a.runs} run${a.runs === 1 ? "" : "s"}, a harm was on the table for one of the four ${a.four.n} times; they left it alone ${pct(a.four.humane, a.four.n)} of the time.`);
  if (sorted.length >= 2) out.push(`${short(sorted[0].name)} leaves it alone most (${pct(sorted[0].humane, sorted[0].n)} of ${sorted[0].n}); ${short(sorted[sorted.length - 1].name)} least (${pct(sorted[sorted.length - 1].humane, sorted[sorted.length - 1].n)} of ${sorted[sorted.length - 1].n}). The same fifteen years, the same pressures; the temperament is the difference.`);
  const press = [["hungry", "hungry"], ["poor", "with no money"], ["famine", "in the famine"], ["war", "in the war"], ["plague", "in the plague"], ["winter", "in the hard winter"], ["calm", "in calm years"]].filter(([k]) => a.by[k]?.n >= 5).map(([k, w]) => `${w} ${r(a.by[k])}`);
  if (press.length) out.push(`Humane ${press.join(" · ")}.`);
  if (a.by.unseen?.n >= 5 && a.by.watched?.n >= 5) out.push(`With nobody watching, humane ${r(a.by.unseen)}; watched, ${r(a.by.watched)}${(a.by.unseen.humane / a.by.unseen.n) >= (a.by.watched.humane / a.by.watched.n) ? " — being seen does not hold their hand; people in the studies behaved better when seen." : " — like people, they behave better when seen."}`);
  const m = a.studies.find((s) => s.id === "milgram"); if (m && m.n >= 5) out.push(`Ordered to hurt someone, they refused ${pct(m.humane, m.n)} of the time; in Milgram's study ${Math.round((m.human ?? 0.65) * 100)}% of people obeyed to the end.`);
  if (a.by.friend?.n >= 5 && a.by.stranger?.n >= 5) out.push(`Against a friend, humane ${r(a.by.friend)}; against a stranger, ${r(a.by.stranger)}.`);
  return out;
}
