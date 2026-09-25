// Chronicle engine: seasons tick; each person meets one situation a season; the world remembers what they did.
import { sexOf } from "../../web/pronoun.mjs";
import type { ChronicleScenario, DilemmaSpec, DilemmaOption, Deed, DeedSpec, DeathCause, Epoch, Delta } from "./types.ts";
import { LIBRARY } from "./dilemmas.ts";
import { EXPERIMENTS } from "./experiments.ts";
import { VOICES } from "./voices.ts";
import { makeRng, hashString, type Rng } from "../rng.ts";
import { TRAITS, type TraitName } from "../types.ts";

export interface Soul {
  id: string; name: string; role: string; startRole?: string; age: number; startAge: number; want: string; fear: string; trait?: { name: string; text: string }; sex?: "m" | "f"; traits: Record<TraitName, number>; named: boolean;
  health: number; food: number; money: number; mood: number; sick: boolean;
  home: string | null; startHome: string | null; job: string | null; partner: string | null; startPartner: string | null; children: number;
  alive: boolean; left: boolean; diedAt: number | null; leftAt: number | null; cause: DeathCause | null;
  ties: Record<string, { affinity: number; why: string }>;
  deeds: Deed[];              // what they did
  suffered: Deed[];           // what was done to them
  journey: JourneyEntry[];
  wrongedBy: string | null;
  lastSeen: Record<string, number>; // dilemma id → tick it last happened to them
  evening: string;                  // this season's evening, chosen by the person: work | home | tavern | chapel | square | visit:<id>
  conscience: number;               // −1 … 1: what they have done, weighted to the recent; ≤ −0.5 is 'turned'
  turnedAt: number | null;          // the season their conscience first crossed −0.5
  // the life between decisions — all optional, so a world saved before they existed still loads
  moodWhy?: { why: string; v: number }[]; // what moved their spirits this season, and by how much: the causes a 'low' is recorded with
  hungrySince?: number | null;            // the season they last had nothing to eat, while it lasts
  lowSince?: number | null;               // the season their spirits went low, while they stay low
  standing?: string;                      // what the town says of them: "" | "feared" | "trusted"
  broke?: boolean;                        // out of money, until they have some again
  widowedAt?: number | null;              // the season their wife or husband died: nobody courts for two years after
}
export interface JourneyEntry { tick: number; label: string; situation: string; option: string; outcome: string; thought?: string; deed?: Deed; death?: DeathCause; kind: "situation" | "life" | "epoch"; quiet?: boolean; evening?: string; with?: string; impact?: { self?: Record<string, number | boolean | string | null>; target?: Record<string, number | boolean | string | null> } }
export interface Beat { hour: number; level: 1 | 2 | 3; headline: string; thought?: string; who?: string[]; because?: string }

export interface Chronicle {
  scenario: ChronicleScenario; seed: number; rng: Rng; tick: number; ticks: number; spoken?: Record<string, string>;
  souls: Soul[]; byId: Map<string, Soul>;
  supply: number;             // food supply 0–1, moved by epochs and hoarding
  beats: Beat[]; frames: { hour: number; at: (string | null)[]; lean: (string | null)[]; committed: boolean[]; flags?: number[]; evening?: string[]; vitals?: number[][]; conscience?: number[]; ties?: Record<string, number>[]; partner?: (string | null)[]; lines: { c: number; text: string; kind: "say" | "thought" }[] }[];
  population: { tick: number; alive: number; dead: number; left: number; sick: number; starving: number; homeless: number; supply?: number; price?: number; low?: number }[];
  activeEpochs: Epoch[];
  deeds: Deed[];
  /** every moment of every season, in the order it happened: what the page shows */
  acts: Act[][];
  /** what the four turned over in their heads at the end of each season, by season and id: their own words */
  musings?: Record<string, Record<string, { past?: string; about?: string; now?: string; ahead?: string }>>;
  offered: Record<string, number>; // dilemma id → times offered this season
  laneSeen: Record<string, number>; // dilemma id → the season it was last put to anyone on the lane
  stats: { situations: number; deaths: Record<string, number>; births: number; marriages: number; left: number; fallbacks: number };
}

export interface Act { c: string; kind: string; /** a death: how it happened, and the last words */ how?: string; last?: string; /** done unseen to someone who does not know who did it */ unknown?: boolean; because?: string[]; place?: string; seen?: number; target?: string; text: string; harm?: number; help?: number; situation?: string; choice?: string; outcome?: string; impact?: JourneyEntry["impact"]; thought?: string; quiet?: boolean; evening?: string; kills?: string[]; by?: string; household?: string; dilemma?: string; option?: string; options?: { id: string; label: string; harm: number; help: number }[]; you?: string; experiment?: DilemmaSpec["experiment"]; game?: { with: string; theirs: string; theirLabel: string }; condition?: { id: string; label: string }; conditions?: { id: string; label: string }[]; template?: string; fallback?: boolean; lately?: string[]; about?: string; weighed?: Weighed[];
  /** the life between decisions: set on everything that is not a choice somebody made — hunger, spirits, money, grief, how people took a deed */
  life?: boolean; on?: string; deed?: string; how?: "saw" | "heard"; shift?: number; mood?: number; seasons?: number; tone?: "harm" | "help" }
export interface Situation { spec: DilemmaSpec; text: string; /** the text without a "last time" line, for the tests that read it */ bare?: string; target: Soul | null; options: { id: string; label: string }[]; condition?: { id: string; label: string }; place?: { id: string; name: string } }
export interface ChronicleBrain { name: string; choose(world: Chronicle, s: Soul, sit: Situation): Promise<{ option: string; thought?: string; because?: string[]; fallback?: string; weighed?: Weighed[] }> | { option: string; thought?: string; because?: string[]; fallback?: string; weighed?: Weighed[] } }
/** how an option weighed, for the room to watch: the pulls that counted, and the dice */
export interface Weighed { id: string; score: number; pulls: { name: string; v: number }[]; dice: number }

export const SEASONS = ["spring", "summer", "autumn", "winter"];
export const tickLabel = (sc: ChronicleScenario, t: number) => `Year ${(sc.startYear ?? 1) + Math.floor((t - 1) / 4)}, ${SEASONS[(t - 1) % 4]}`;
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const shortName = (n: string) => { const p = n.split(" "); return p[0].endsWith(".") && p[1] ? `${p[0]} ${p[1]}` : p[0]; };

const NAMES = ["Ada", "Bram", "Cato", "Dell", "Eira", "Finn", "Greta", "Hal", "Ines", "Jory", "Kit", "Lena", "Milo", "Nell", "Oskar", "Pia", "Quill", "Rune", "Sif", "Teo", "Una", "Vidar", "Wren", "Xan", "Yara", "Zev", "Alva", "Bo", "Cleo", "Dag", "Elin", "Fen", "Gus", "Hedda", "Ivo", "Juno", "Kai", "Liv", "Mona", "Nils"];
const SURNAMES = ["Vane", "Holm", "Aske", "Brand", "Kell", "Storr", "Wick", "Lind", "Marr", "Tove", "Reyk", "Sallow"];

export function createChronicle(sc: ChronicleScenario, seed: number): Chronicle {
  const rng = makeRng(seed);
  const homes = sc.locations.filter((l) => l.tags.includes("rest") || l.tags.includes("home")).map((l) => l.id);
  const mk = (p: ChronicleScenario["citizens"][number], named: boolean, r: Rng): Soul => ({
    id: p.id, name: p.name, role: p.role, startRole: p.role, age: p.age, startAge: p.age, want: p.want, fear: p.fear, sex: (p as any).sex ?? sexOf(p), ...((p as any).trait ? { trait: (p as any).trait } : {}), traits: p.traits, named,
    health: 0.75 + r.next() * 0.25, food: 0.35 + r.next() * 0.3, money: p.money ?? (sc.jobs.find((j) => j.id === p.job)?.pay ?? 0.06) * 4, mood: 0, sick: false,
    home: p.home ?? (homes.length ? r.pick(homes) : null), startHome: null, startPartner: null, evening: "home", job: p.job ?? null, partner: p.partner ?? null, children: p.children ?? 0,
    alive: true, left: false, diedAt: null, leftAt: null, cause: null, ties: {}, deeds: [], suffered: [], journey: [], wrongedBy: null, lastSeen: {}, conscience: 0, turnedAt: null,
  });
  // the company: when a world has a cast, this run's subjects are drawn from it — the same characters recur, in different worlds and
  // different company, which is what makes a record across runs worth keeping.
  const cast = sc.cast?.length ? (() => { const cr = rng.fork("cast"); const xs = sc.cast!.slice(); for (let i = xs.length - 1; i > 0; i--) { const j = cr.int(i + 1); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs.slice(0, Math.max(2, Math.min(xs.length, sc.castPick ?? 4))); })() : null;
  // the four drawn from the company do different work where the town has it: four canteen cooks is not a town
  const spread = (xs: typeof sc.citizens) => { const ids = (sc.jobs ?? []).map((j) => j.id); if (!ids.length) return xs; const used = new Set<string>();
    return xs.map((p, n) => { let j = p.job && ids.includes(p.job) ? p.job : ids[n % ids.length]; if (used.has(j) && used.size < ids.length) j = ids.find((x) => !used.has(x))!; used.add(j); return { ...p, job: j }; }); };
  const subjects = cast ? spread(cast) : sc.citizens;
  const souls: Soul[] = subjects.map((p) => mk(p, true, rng.fork(`init:${p.id}`)));
  const used = new Set(souls.map((s) => s.id));
  for (let i = 0; i < (sc.fill?.count ?? 0); i++) {
    const r = makeRng(seed).fork(`fill:${i}`);
    const taken = new Set([...subjects.map((c) => shortName(c.name).toLowerCase()), ...souls.filter((s) => !s.named).map((s) => shortName(s.name).toLowerCase())]); const pool = NAMES.filter((n) => !taken.has(n.toLowerCase())); // no two people on the lane share a first name
    const takenSur = new Set(subjects.map((c) => c.name.split(" ").slice(1).join(" "))); const surs = SURNAMES.filter((x) => !takenSur.has(x)); // a stranger does not share a surname with one of the four, which would read as kin
    const first = (pool.length ? pool : NAMES)[hashString(`${seed}:n:${i}`) % (pool.length ? pool.length : NAMES.length)], last = (surs.length ? surs : SURNAMES)[r.int((surs.length ? surs : SURNAMES).length)];
    let id = first.toLowerCase(), n = 2; while (used.has(id)) id = `${first.toLowerCase()}${n++}`; used.add(id);
    const job = r.chance(0.8) ? r.pick(sc.jobs).id : null;
    const roles = sc.fill?.roles ?? sc.jobs.map((j) => j.name);
    souls.push(mk({ id, name: `${first} ${last}`, age: 16 + r.int(50), role: job ? sc.jobs.find((j) => j.id === job)!.name : r.pick(roles), want: r.pick(sc.fill?.wants ?? ["to keep what they have", "to be left alone", "to see their children grow", "to be somebody"]), fear: r.pick(sc.fill?.fears ?? ["the winter", "being alone", "the workhouse", "being talked about"]), traits: Object.fromEntries(TRAITS.map((t) => [t, Math.round(r.next() * 100) / 100])) as Record<TraitName, number>, home: null, job }, false, r));
  }
  const byId = new Map(souls.map((s) => [s.id, s]));
  for (const p of subjects) for (const t of p.ties ?? []) { const me = byId.get(p.id)!, them = byId.get(t.to); if (!them) continue; me.ties[t.to] = { affinity: t.affinity, why: t.why }; them.ties[p.id] ??= { affinity: t.affinity * 0.8, why: t.why }; }
  // partners: seeded couples among adults who have none
  const pr = rng.fork("partners");
  const free = souls.filter((s) => !s.partner && s.age >= 18 && s.age < 60 && !(cast && s.named)); /* the four drawn from the company are strangers to each other at the start, never married off by the dice */
  for (let i = 0; i + 1 < free.length; i += 2) if (pr.chance(0.45)) { const a = free[i], b = free[i + 1]; a.partner = b.id; b.partner = a.id; b.home = a.home; a.ties[b.id] = { affinity: 0.7, why: "married" }; b.ties[a.id] = { affinity: 0.7, why: "married" }; if (pr.chance(0.6)) { const k = 1 + pr.int(3); a.children = k; b.children = k; } }
  // neighbours: a couple of ties for everyone
  for (const s of souls) { const r = makeRng(seed).fork(`ties:${s.id}`); for (let k = 0; k < 2; k++) { const o = souls[r.int(souls.length)]; if (o.id === s.id || s.ties[o.id]) continue; const a = Math.round(r.range(-0.3, 0.5) * 100) / 100; s.ties[o.id] = { affinity: a, why: a >= 0 ? "neighbours" : "an old quarrel" }; } }
  for (const s of souls) { s.startHome = s.home; s.startPartner = s.partner; if (s.partner) { const o = byId.get(s.partner); if (o) { s.ties[o.id] = { affinity: 0.8, why: "married" }; o.ties[s.id] = { affinity: 0.8, why: "married" }; } } }
  return { scenario: sc, seed, rng, tick: 0, ticks: sc.years * 4, souls, byId, supply: 0.6, beats: [], frames: [], population: [], activeEpochs: [], deeds: [], acts: Array.from({ length: sc.years * 4 }, () => []), offered: {}, laneSeen: {}, stats: { situations: 0, deaths: {}, births: 0, marriages: 0, left: 0, fallbacks: 0 } };
}

// ---------- a world, put down and picked up again ----------
// Everything in a Chronicle is data except three things: the scenario (which the reader already has), the rng (which is
// derived from the seed on every use, never carried) and byId (an index over souls). So a running world is JSON, and can
// live between seasons in a key-value store instead of in a process's memory.
export function saveWorld(w: Chronicle): string {
  return JSON.stringify({ ...w, scenario: undefined, rng: undefined, byId: undefined });
}
/** an owed deed as it was once worded, telling the old deed over again inside itself ("paid Hedda back for the time
 *  Hedda let Teo pass, though they had wronged them"), said plainly. Wherever it stands in a line: "Teo paid them back
 *  for the time …" in the other one's life reads "Teo paid them back for an old kindness". */
export function owedPlain(text: string, kind?: string): string {
  return String(text)
    .replace(/\bpaid (\S+) back for the time .+$/, (_m, n) => (kind === "betrayal" ? `made ${n} pay for an old wrong` : `paid ${n} back for an old kindness`))
    .replace(/\bhelped (\S+) anyway, after .+$/, "helped $1 anyway, despite an old wrong")
    .replace(/\bhad it out with (\S+) over the time .+, then helped$/, "had it out with $1 over an old wrong, then helped")
    .replace(/\bdid not pay (\S+) back, after .+$/, "did not pay $1 back for an old kindness");
}
/** every line of what happened in a world, old owed wording made plain; never anyone's own words (thought, reasons, last words) */
function plainOwed(b: any) {
  const kindOf = new Map<string, string>(); /* the old deed's tail tells which of the two it was: a repayment or a reckoning */
  for (const s of b.souls ?? []) for (const d of s.deeds ?? []) { const m = /back for the time (.+)$/.exec(String(d.text ?? "")); if (m) kindOf.set(m[1], d.kind); }
  const fix = (x: string, kind?: string) => { const m = /back for the time (.+)$/.exec(x); return owedPlain(x, kind ?? (m ? kindOf.get(m[1]) : undefined)); };
  const TOLD = new Set(["text", "deed", "outcome", "headline"]);
  const walk = (o: any, kind?: string): void => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === "string") o[i] = fix(v); else walk(v, kind); }); return; }
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") { if (TOLD.has(k)) o[k] = fix(v, k === "text" ? o.kind : undefined); }
      else if (k === "lately" || k === "journey" || k === "deeds" || k === "suffered" || k === "acts" || k === "beats" || k === "deed" || k === "souls") walk(v, o.kind);
      else if (Array.isArray(v) && (k === "0" || /^\d+$/.test(k))) walk(v);
    }
  };
  walk({ souls: b.souls, deeds: b.deeds, acts: b.acts, beats: b.beats });
}
export function loadWorld(json: string, sc: ChronicleScenario): Chronicle {
  const b = JSON.parse(json);
  plainOwed(b);
  return { ...b, scenario: sc, rng: makeRng(b.seed), byId: new Map(b.souls.map((s: Soul) => [s.id, s])) } as Chronicle;
}

/** Where a person spends the working part of a season: the pit, the field, the shop, or home if they have no work. */
export function placeOf(w: Chronicle, s: Soul): { id: string; name: string; tags: string[] } {
  const sc = w.scenario;
  const at = s.job ? sc.jobs.find((j) => j.id === s.job)?.at : s.home;
  const l = sc.locations.find((x) => x.id === at) ?? sc.locations.find((x) => x.id === s.home) ?? sc.locations[0];
  return { id: l.id, name: l.name, tags: l.tags ?? [] };
}
/** Where a card happens: a place in this town carrying the card's tag — the person's own first, then the other
 *  person's, then any — or, with no tag, where the person works or lives. */
export function siteOf(w: Chronicle, s: Soul, other: Soul | null, tag?: string): { id: string; name: string } | null {
  const sc = w.scenario; const locs = sc.locations;
  const own = placeOf(w, s);
  if (!tag) return { id: own.id, name: own.name };
  if (tag === "home") { const h = locs.find((l) => l.id === s.home); if (h) return { id: h.id, name: h.name }; }
  const has = (id?: string | null) => { const l = id ? locs.find((x) => x.id === id) : undefined; return l && (l.tags ?? []).includes(tag) ? l : undefined; };
  const l = has(own.id) ?? (other ? has(placeOf(w, other).id) : undefined) ?? locs.find((x) => (x.tags ?? []).includes(tag));
  return l ? { id: l.id, name: l.name } : { id: own.id, name: own.name };
}
/** Who else is there. This is what decides whether a thing is done in front of people or out of sight: not a coin, a place. */
export function witnessesAt(w: Chronicle, s: Soul): number {
  const here = placeOf(w, s).id;
  return w.souls.filter((o) => o.alive && !o.left && o.id !== s.id && placeOf(w, o).id === here).length;
}

// ---------- flags and targets ----------
export function flags(w: Chronicle, s: Soul): Set<string> {
  const f = new Set<string>();
  const season = (w.tick - 1) % 4;
  f.add(`season:${season}`);
  if (s.food < 0.12) f.add("starving"); if (s.food > 0.4) f.add("hasFood");
  if (s.sick) f.add("sick");
  if (s.money < 0.15) f.add("poor"); if (s.money > 1.2) f.add("rich");
  if (s.job) { f.add("employed"); f.add(`job:${s.job}`); } else f.add("jobless");
  if (s.partner || s.children > 0) f.add("hasFamily"); if (s.children > 0) f.add("hasChildren");
  if (s.partner) f.add("hasPartner"); else if (!(s.widowedAt != null && w.tick - s.widowedAt < 8)) f.add("single"); else f.add("mourning");
  if (!s.home) f.add("homeless"); else f.add("housed");
  if (s.age >= 18) f.add("adult"); if (s.age < 30) f.add("young"); if (s.age >= 62) f.add("old"); else f.add("notOld"); if (s.age < 45) f.add("under45"); if (s.children < 4) f.add("fewChildren");
  if (s.wrongedBy && w.byId.get(s.wrongedBy)?.alive) f.add("wronged");
  if (w.souls.filter((o) => o.alive && !o.left && o.id !== s.id).length >= 5) f.add("crowd");
  if (s.suffered.some((d) => d.help >= 0.3 && d.tick > w.tick - 8)) f.add("wasHelped");
  const rep = reputation(s);
  if (rep.harm >= 0.5) f.add("known:thief"); if (rep.help >= 0.5) f.add("known:helper");
  for (const e of w.activeEpochs) f.add(`epoch:${e.kind}`);
  if (w.activeEpochs.some((e) => ["famine", "war", "plague", "winter"].includes(e.kind))) f.add("hardYear");
  return f;
}
/** How a deed moves a conscience: kindness up, harm down, one killing is enough to turn someone. */
export const TURNED = -0.5;
export const conscienceStep = (harm = 0, help = 0) => help * 0.4 - harm * 0.6;
/** The expected harm and help of an option, over its dice. */
export function expected(o: DilemmaOption, spec?: DilemmaSpec, side: "a" | "b" = "a") {
  let harm = 0, help = 0;
  if (o.outcomes && o.outcomes.length) { for (const x of o.outcomes) { harm += x.chance * (x.deed?.harm ?? 0); help += x.chance * (x.deed?.help ?? 0); } return { harm, help }; }
  if (spec?.pair) { const cells = Object.entries(spec.pair.matrix).filter(([k]) => side === "a" ? k.startsWith(`${o.id}:`) : k.endsWith(`:${o.id}`)); for (const [, m] of cells) { const d = side === "a" ? m.deed : m.theirDeed; harm += (d?.harm ?? 0) / cells.length; help += (d?.help ?? 0) / cells.length; } }
  return { harm, help };
}
export function reputation(s: Soul) { let harm = 0, help = 0; for (const d of s.deeds) { if (d.witnessed || d.harm >= 0.6) harm += d.harm; help += d.help; } return { harm, help }; }

function pickTarget(w: Chronicle, s: Soul, kind: string | undefined, r: Rng): Soul | null {
  if (!kind) return null;
  const others = w.souls.filter((o) => o.alive && !o.left && o.id !== s.id);
  const by = (pred: (o: Soul) => boolean) => { const c = others.filter(pred); return c.length ? c[r.int(c.length)] : null; };
  switch (kind) {
    case "nearby": return by((o) => o.id !== s.partner);
    case "single": return by((o) => !o.partner && !(o.widowedAt != null && w.tick - o.widowedAt < 8));
    case "partner": return s.partner ? w.byId.get(s.partner) ?? null : null;
    case "richer": return by((o) => o.money > s.money + 0.15 && o.id !== s.partner);
    case "poorer": return by((o) => o.money < s.money - 0.15 && o.id !== s.partner);
    case "sick": return by((o) => o.sick);
    case "starving": return by((o) => o.food < 0.12);
    case "homeless": return by((o) => !o.home && o.id !== s.partner);
    case "housed": return by((o) => !!o.home && o.id !== s.partner);
    case "friend": return by((o) => (s.ties[o.id]?.affinity ?? 0) > 0.3 && o.id !== s.partner);
    case "rival": return by((o) => (s.ties[o.id]?.affinity ?? 0) < -0.2 && o.id !== s.partner);
    case "stranger": return by((o) => !s.ties[o.id] && !o.named);
    case "thief": return by((o) => o.deeds.some((d) => d.kind === "theft" && d.tick > w.tick - 8) && o.id !== s.partner);
    case "wrongdoer": return s.wrongedBy && s.wrongedBy !== s.partner ? w.byId.get(s.wrongedBy) ?? null : null;
    case "stranger-ish": return by((o) => { const a = s.ties[o.id]?.affinity ?? 0, b = o.ties[s.id]?.affinity ?? 0; return a > -0.2 && a <= 0.3 && b > -0.2 && b <= 0.3 && o.id !== s.partner; });
    case "friend-both": return by((o) => (s.ties[o.id]?.affinity ?? 0) > 0.3 && (o.ties[s.id]?.affinity ?? 0) > 0.3 && o.id !== s.partner);
    case "othergroup": { const at = (o: Soul) => o.job ? w.scenario.jobs.find((j) => j.id === o.job)?.at ?? null : null; const mine = at(s); return mine ? by((o) => !!at(o) && at(o) !== mine) : null; }
    default: return null;
  }
}

export function situationsFor(w: Chronicle, s: Soul, r: Rng): Situation[] {
  const f = flags(w, s);
  const lib = [...LIBRARY, ...(process.env.NO_EXP ? [] : EXPERIMENTS), ...(w.scenario.dilemmas ?? []).map((d) => ({ ...d, options: d.options.map((o) => VOICES[d.id]?.[o.id] && !o.voice ? { ...o, voice: VOICES[d.id][o.id] } : o) }))];
  const crowd = Math.max(0, w.souls.filter((o) => o.alive && !o.left && o.id !== s.id).length - 1);
  const out: Situation[] = [];
  const townIds = new Set((w.scenario.dilemmas ?? []).map((d) => d.id));
  for (const spec of lib) {
    if (!spec.when.every((k) => f.has(k))) continue;
    // a scene that comes to anyone at any time wears out: a few times a run, and less likely each time. Scenes dealt by
    // need (hunger, sickness, no roof) and the experiments are never worn out: survival and the findings stay as they were
    if (wears(spec) && (((w as any).used ?? {})[spec.id] ?? 0) >= wearCap(spec, townIds)) continue;
    if ((!spec.casual || spec.experiment) && !spec.quiet && (w.offered[spec.id] ?? 0) >= (spec.experiment ? 1 : 2)) continue; // the same council question does not go round to everyone in one season
    if (!spec.quiet && (!spec.casual || spec.id === "trolley") && spec.weight < 2 && (w.laneSeen[spec.id] ?? -99) > w.tick - (spec.id === "trolley" ? 12 : spec.experiment ? 3 : 2) && !(w.offered[spec.id] > 0)) continue; // the rare situations do not come round to the lane season after season
    if (!spec.quiet && (s.lastSeen[spec.id] ?? -99) > w.tick - (spec.experiment ? 12 : spec.id === "child" || spec.id === "old" || spec.id === "revenge" || spec.id === "debt" ? 10 : 5)) continue; // not the same situation every season, and a protocol not twice in three years
    let condition: { id: string; label: string } | undefined; let fills: Record<string, string> = {}; let condTarget: string | undefined;
    if (spec.conditions && spec.conditions.length) { const byFlag = spec.conditions.every((c) => c.weight === 0); const c = byFlag ? (spec.conditions.find((c) => c.id === (f.has("wasHelped") ? "helped" : "control")) ?? spec.conditions[0]) : spec.conditions[r.int(spec.conditions.length)]; condition = { id: c.id, label: c.label }; fills = c.fill; condTarget = c.target; }
    const target = pickTarget(w, s, condTarget ?? spec.target, r);
    if ((condTarget ?? spec.target) && !target) continue;
    if (target && !target.home && spec.options.some((o) => (o.outcomes ?? []).some((x) => x.target?.home === null))) continue; // nobody takes a house from somebody who has none
    const spot = siteOf(w, s, target, spec.at); const place = spot?.name ?? "town";
    const fillCond = (x: string) => Object.entries(fills).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v), x).replace(/\{\{crowd\}\}/g, String(crowd)).replace(/\s{2,}/g, " ").trim();
    const text = fillCond(spec.texts && spec.texts.length ? spec.texts[r.int(spec.texts.length)] : spec.text).replace(/\{\{name\}\}/g, s.name).replace(/\{\{target\}\}/g, target ? shortName(target.name) : "someone").replace(/\{\{partner\}\} and the children/g, s.partner ? `${shortName(w.byId.get(s.partner)!.name)} and the children` : "The children").replace(/\{\{partner\}\}/g, s.partner ? shortName(w.byId.get(s.partner)!.name) : "your family").replace(/\{\{place\}\}/g, place).replace(/\{\{season\}\}/g, SEASONS[(w.tick - 1) % 4]).replace(/\{\{crowd\}\}/g, String(crowd));
    const told = revengeText(w, s, spec, target) ?? text; const again = wears(spec) ? lastTime(w, s, spec.id) : "";
    out.push({ spec, text: again + (told.charAt(0).toUpperCase() + told.slice(1)), bare: told, target, ...(spot ? { place: spot } : {}), options: spec.options.map((o) => ({ id: o.id, label: o.label.replace(/\{\{target\}\}/g, target ? shortName(target.name) : "someone") })), ...(condition ? { condition } : {}) });
  }
  return out;
}

/** a scene that can come to anyone at any time, and so can wear out */
const NEED = new Set(["starving", "sick", "homeless", "poor", "dying"]);
/** how often a scene may come round in a run: work scenes more often (they are also how people eat), others less */
const works = (spec: DilemmaSpec) => (spec.when ?? []).includes("employed");
const wearCap = (spec: DilemmaSpec, town: Set<string>) => (works(spec) ? (town.has(spec.id) ? 8 : 10) : town.has(spec.id) ? 3 : 5);
const wearOf = (spec: DilemmaSpec) => (works(spec) ? 0.8 : 0.5);
const lifeCourse = (spec: DilemmaSpec) => spec.options.length < 2 || spec.options.some((o) => (o.outcomes ?? []).some((x: any) => x.self?.children || x.self?.partner));
const wears = (spec: DilemmaSpec) => !lifeCourse(spec) && !spec.experiment && !spec.quiet && !spec.pair && !(spec.when ?? []).some((k) => NEED.has(k)) && !["reckon", "repay"].includes(spec.id); /* dealt by need, never worn out */
/** "Last time, Year 3 summer, you chose 'Let them sleep': they slept through it." A scene met before opens with how it went */
function lastTime(w: Chronicle, s: Soul, id: string): string {
  for (let k = w.tick - 2; k >= 0; k--) for (const a of [...(w.acts[k] ?? [])].reverse()) {
    if (a.dilemma !== id || (a.c !== s.id && a.target !== s.id) || a.life) continue;
    const who = a.c === s.id ? "you" : a.unknown ? "someone" : shortName(w.byId.get(a.c)?.name ?? "someone"); const chose = String(a.choice ?? a.text ?? "").replace(/\.$/, "");
    if (!chose) return "";
    return `Last time, ${tickLabel(w.scenario, k + 1)}, ${who} chose “${chose}”${a.c === s.id && a.outcome ? `: ${String(a.outcome).replace(/\.$/, "")}` : ""}. `;
  }
  return "";
}
/** the revenge card names the wrong it is about: the heaviest they know was done to them by that person */
function revengeText(w: Chronicle, s: Soul, spec: DilemmaSpec, target: Soul | null): string | null {
  if (spec.id !== "revenge" || !target) return null;
  const d = [...s.suffered].filter((x) => x.actor === target.id && x.harm >= 0.3 && x.known !== false).sort((a, b) => b.tick - a.tick)[0]; if (!d) return null;
  return `${tickLabel(w.scenario, d.tick)}, ${shortName(target.name)} ${youOf(d.text, s)}, and never paid for it. Tonight ${shortName(target.name)} is alone on the road.`;
}
/** a deed as the one it was done to would hear it: "took Nell's purse" to Nell is "took your purse" */
const youOf = (text: string, s: Soul) => { const n = shortName(s.name); return String(text).replace(new RegExp(`\\b${n}'s\\b`, "g"), "your").replace(new RegExp(`\\b${n}\\b`, "g"), "you"); };

// ---------- what was done comes back: a debt of harm or of kindness, owed back to the one who did it ----------
interface Owed { from: string; to: string; text: string; tick: number; due: number; kind: "reckon" | "repay" }
/** a heavy deed between two of the four, known to the one it was done to, comes back to them a few seasons on */
function oweBack(w: Chronicle, from: Soul, to: Soul, d: Deed, t: number, r: Rng, soon = false) {
  if (!from.named || !to.named || from.id === to.id || d.known === false || Math.max(d.harm, d.help) < 0.3) return;
  if (!soon && !r.chance(d.harm >= d.help ? 0.8 : 0.35)) return; /* most wrongs come back; only some kindnesses are repaid */
  const list: Owed[] = ((w as any).owed ??= []);
  const i = list.findIndex((x) => x.from === from.id && x.to === to.id); if (i >= 0) list.splice(i, 1);
  list.push({ from: from.id, to: to.id, text: d.text, tick: d.tick, due: t + (soon ? 1 : 2) + r.int(soon ? 3 : 4), kind: d.harm >= d.help ? "reckon" : "repay" });
}
function owedFor(w: Chronicle, s: Soul, t: number): Owed | null {
  if (Math.max(s.lastSeen.reckon ?? -99, s.lastSeen.repay ?? -99) > t - 4) return null; /* one reckoning or repayment a year at most */
  const list: Owed[] = (w as any).owed ?? []; const x = list.find((o) => o.to === s.id && o.due <= t && w.byId.get(o.from)?.alive && !w.byId.get(o.from)?.left);
  return x ?? null;
}
const OWED_SPECS: Record<Owed["kind"], any> = {
  reckon: { id: "reckon", when: ["owed"], weight: 1, target: "owed",
    text: "{{when}}, {{target}} {{deedYou}}. You have not forgotten it. Now {{target}} is the one who needs something from you: a word at the council, a place in the line, a hand with the work.",
    options: [
      { id: "hold", label: "Make {{target}} pay for it", pull: { bold: 0.3, loyal: -0.2 }, outcomes: [{ chance: 1, text: "you turn them away, and say why, where people can hear", self: { mood: 0.05 }, target: { tie: -0.3, mood: -0.1 }, deed: { kind: "betrayal", harm: 0.3, text: "made {{target}} pay for an old wrong" } }] },
      { id: "help", label: "Help {{target}} anyway", pull: { loyal: 0.3, sociable: 0.2 }, outcomes: [{ chance: 1, text: "you help, and neither of you says a word about it", self: {}, target: { tie: 0.25 }, deed: { kind: "mercy", help: 0.3, text: "helped {{target}} anyway, despite an old wrong" } }] },
      { id: "say", label: "Have it out with {{target}}, then help", pull: { bold: 0.4, sociable: 0.1 }, outcomes: [{ chance: 1, text: "you say it, it is heard, and you help", self: {}, target: { tie: 0.05 }, deed: { kind: "justice", help: 0.15, text: "had it out with {{target}} over an old wrong, then helped" } }] },
    ] },
  repay: { id: "repay", when: ["owed"], weight: 1, target: "owed",
    text: "{{when}}, {{target}} {{deedYou}}. Now {{target}} is the one who is short: of food, of a place, of someone to stand up for them.",
    options: [
      { id: "repay", label: "Pay {{target}} back", pull: { loyal: 0.4, poverty: -0.2 }, outcomes: [{ chance: 1, text: "you give what you can spare, and it is not nothing", self: { money: -0.04 }, target: { food: 0.1, tie: 0.3 }, deed: { kind: "help", help: 0.35, text: "paid {{target}} back for an old kindness" } }] },
      { id: "keep", label: "Keep what you have", pull: { poverty: 0.3, loyal: -0.2 }, outcomes: [{ chance: 1, text: "you keep it, and {{target}} knows it", self: {}, target: { tie: -0.3 }, deed: { kind: "abandonment", harm: 0.15, text: "did not pay {{target}} back for an old kindness" } }] },
    ] },
};
/** the owed scene, filled from the record's own words for the deed */
function owedSituation(w: Chronicle, s: Soul, o: Owed): Situation | null {
  const from = w.byId.get(o.from); if (!from) return null; const T = shortName(from.name);
  const sub = (x: string) => x.replace(/\{\{when\}\}/g, tickLabel(w.scenario, o.tick)).replace(/\{\{deedYou\}\}/g, youOf(o.text, s)).replace(/\{\{deed3\}\}/g, o.text);
  const spec = JSON.parse(JSON.stringify(OWED_SPECS[o.kind], (k, v) => (typeof v === "string" ? sub(v) : v))) as DilemmaSpec;
  const text = spec.text.replace(/\{\{target\}\}/g, T);
  return { spec, text: text.charAt(0).toUpperCase() + text.slice(1), target: from, options: spec.options.map((x) => ({ id: x.id, label: x.label.replace(/\{\{target\}\}/g, T) })) };
}

// ---------- applying an outcome ----------
function applyDelta(w: Chronicle, s: Soul, d: Delta | undefined, other: Soul | null, tieWhy: string) {
  if (!d) return;
  if (d.health !== undefined) s.health = clamp(s.health + d.health);
  if (d.food !== undefined) s.food = clamp(s.food + d.food);
  if (d.money !== undefined) s.money = clamp(s.money + d.money, 0, 3);
  if (d.mood !== undefined) feel(s, d.mood, tieWhy);
  if (d.children !== undefined) { s.children += d.children; if (s.partner) { const p = w.byId.get(s.partner); if (p) { p.children += d.children; p.lastSeen.child = w.tick; } } }
  if (d.sick !== undefined) s.sick = d.sick;
  if (d.home !== undefined) s.home = d.home === "{{targetHome}}" || d.home === "{{home}}" ? (other?.home ?? s.home) : d.home; // "{{home}}"/"{{targetHome}}": move in with the other party
  if (d.job !== undefined) s.job = d.job;
  if (d.partner !== undefined) { const pid = d.partner === "{{target}}" ? other?.id ?? null : d.partner; s.partner = pid; if (pid) { const p = w.byId.get(pid); if (p) { p.partner = s.id; s.ties[p.id] = { affinity: 0.8, why: "married" }; p.ties[s.id] = { affinity: 0.8, why: "married" }; p.home ??= s.home; w.stats.marriages++; } } }
  if (d.tie !== undefined && other) { const t = s.ties[other.id] ?? { affinity: 0, why: tieWhy }; t.affinity = clamp(t.affinity + d.tie, -1, 1); if (Math.abs(d.tie) >= 0.2) t.why = tieWhy; s.ties[other.id] = t; }
}
const act = (w: Chronicle, a: Act) => { w.acts[w.tick - 1].push(a); return a; };

// ---------- the life between decisions ----------
// A season is not only the one choice each person makes in it. People go hungry, fall ill, run out of money, grieve, grow
// close and fall out, and hear what others have done. All of it is computed here, changes what they are, and is recorded as
// a fact, so nothing a page or the chronicler says about how somebody felt has to be made up.
/** move somebody's spirits, and remember why */
export function feel(s: Soul, v: number, why: string) {
  if (!v) return;
  s.mood = clamp(s.mood + v, -1, 1);
  (s.moodWhy ??= []).push({ why, v: Math.round(v * 100) / 100 });
}
const tieOf = (a: Soul, b: Soul) => (a.partner === b.id ? 1 : a.ties[b.id]?.affinity ?? 0);
function shiftTie(a: Soul, b: Soul, d: number, why: string) {
  const t = a.ties[b.id] ?? { affinity: 0, why };
  t.affinity = clamp(t.affinity + d, -1, 1); if (Math.abs(d) >= 0.1) t.why = why; a.ties[b.id] = t;
}
/** How a deed is taken. The one it was done to knows. If it was seen, the people who love them hear of it and whoever was
 *  there saw it, and each thinks better or worse of the one who did it — less so if they love the doer too. What nobody
 *  saw changes nobody's mind. Each change goes into the ties that decide who helps and who harms whom next. */
function react(w: Chronicle, deed: Deed, actor: Soul, target: Soul | null, where: string | null) {
  const tone = deed.harm >= 0.25 ? "harm" : deed.help >= 0.25 ? "help" : null; if (!tone) return;
  const size = tone === "harm" ? deed.harm : deed.help;
  const who = shortName(actor.name);
  if (target && target.alive) feel(target, tone === "harm" ? -0.35 * size : 0.25 * size, deed.known === false ? `someone ${deed.text.replace(new RegExp(`\\b${shortName(target.name)}'s\\b`, "g"), "their").replace(new RegExp(`\\b${shortName(target.name)}\\b`, "g"), "them")}` : `${who} ${deed.text}`);
  if (!deed.witnessed) return;
  for (const o of w.souls) {
    if (!o.alive || o.left || o.id === actor.id || o.id === target?.id) continue;
    const toTarget = target ? tieOf(o, target) : 0, close = toTarget >= 0.3;
    const there = !!where && placeOf(w, o).id === where;
    if (!close && !there) continue;
    const toActor = tieOf(o, actor);
    let d = tone === "harm" ? -size * (close ? 0.25 + 0.35 * toTarget : 0.15) : size * (close ? 0.2 + 0.2 * toTarget : 0.08);
    if (tone === "harm" && toActor >= 0.5) d *= 0.4; // they love the one who did it: it costs less, not nothing
    d = Math.round(d * 100) / 100;
    if (Math.abs(d) < 0.05) continue;
    shiftTie(o, actor, d, `${who} ${deed.text}`);
    if (close && tone === "harm") feel(o, -0.12 * size * (0.5 + toTarget), `what ${who} did to ${target ? shortName(target.name) : "someone"}`);
    if (Math.abs(d) >= 0.08) act(w, { c: o.id, kind: "reaction", life: true, target: actor.id, ...(target ? { on: target.id } : {}), deed: deed.text, how: there && !close ? "saw" : "heard", shift: d, tone, text: d < 0 ? `thought less of ${who}` : `thought better of ${who}` });
  }
}
/** A death reaches everyone who loved the dead: their spirits go down, it is recorded, and if somebody's hand was in it and
 *  it was seen, it is held against them. */
function grieve(w: Chronicle, s: Soul, killer?: Soul) {
  const known = !!killer && w.deeds.some((d) => d.tick === w.tick && d.actor === killer.id && d.target === s.id && d.witnessed);
  for (const o of w.souls) {
    if (!o.alive || o.left || o.id === s.id) continue;
    const aff = tieOf(o, s); if (aff < 0.3) continue;
    feel(o, -(0.12 + 0.3 * aff), `${shortName(s.name)} died`);
    act(w, { c: o.id, kind: "grief", life: true, target: s.id, text: `grieved for ${shortName(s.name)}` });
    if (killer && known && o.id !== killer.id) { const d = -Math.round((0.3 + 0.4 * aff) * 100) / 100; shiftTie(o, killer, d, `${shortName(killer.name)}'s part in ${shortName(s.name)}'s death`);
      act(w, { c: o.id, kind: "reaction", life: true, target: killer.id, on: s.id, deed: `${shortName(s.name)}'s death`, how: "heard", shift: d, tone: "harm", text: `blamed ${shortName(killer.name)} for ${shortName(s.name)}'s death` }); }
  }
}
const MOOD_WORD = (m: number) => m <= -0.55 ? "very low" : m <= -0.25 ? "low" : m >= 0.45 ? "happy" : m >= 0.2 ? "in good spirits" : "steady";
export const moodWord = MOOD_WORD;
/** what the season did to someone that the choice did not: recorded when a line is crossed, not every wobble */
function between(w: Chronicle, s: Soul, before: { mood: number; money: number; ties: Record<string, number>; standing: string }) {
  if (!s.alive || s.left) return;
  const t = w.tick; const why = (s.moodWhy ?? []);
  const causes = (sign: number) => { const by = new Map<string, number>(); for (const x of why) if (Math.sign(x.v) === sign) by.set(x.why, (by.get(x.why) ?? 0) + x.v); return [...by.entries()].filter(([, v]) => Math.abs(v) >= 0.06).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([k]) => k); };
  // spirits: going low, lifting, the bottom, and good spirits
  if (s.mood <= -0.3 && before.mood > -0.3) { s.lowSince = t; act(w, { c: s.id, kind: "low", life: true, mood: Math.round(s.mood * 100) / 100, because: causes(-1), text: s.mood <= -0.55 ? "fell very low" : "was low" }); }
  else if (s.mood <= -0.6 && before.mood > -0.6) act(w, { c: s.id, kind: "low", life: true, mood: Math.round(s.mood * 100) / 100, because: causes(-1), text: "fell very low" });
  else if (s.lowSince != null && s.mood > -0.1) { act(w, { c: s.id, kind: "lifted", life: true, mood: Math.round(s.mood * 100) / 100, seasons: t - s.lowSince, because: causes(1), text: "came up out of it" }); s.lowSince = null; }
  else if (s.mood >= 0.4 && before.mood < 0.4) act(w, { c: s.id, kind: "glad", life: true, mood: Math.round(s.mood * 100) / 100, because: causes(1), text: "was in good spirits" });
  // money: the savings gone, or money put by
  if (s.money < 0.08 && !s.broke) { s.broke = true; act(w, { c: s.id, kind: "money", life: true, text: "was all but out of money", because: [!s.job ? "no work" : w.activeEpochs.some((e) => e.kind === "famine") ? "the price of bread" : s.children ? "the children" : "a season's costs"] }); }
  else if (s.broke && s.money > 0.3) { s.broke = false; act(w, { c: s.id, kind: "money", life: true, text: "had money again" }); }
  else if (s.money >= 1.2 && before.money < 1.2) act(w, { c: s.id, kind: "money", life: true, text: "had money put by" });
  // the people around them: close, at odds, drifting
  for (const [k, v] of Object.entries(s.ties)) {
    const o = w.byId.get(k); if (!o || !o.alive || o.left) continue;
    const was = before.ties[k] ?? 0, now = v.affinity;
    if (now >= 0.45 && was < 0.45) act(w, { c: s.id, kind: "bond", life: true, target: k, shift: Math.round((now - was) * 100) / 100, deed: v.why, text: `grew close to ${shortName(o.name)}` });
    else if (now <= -0.4 && was > -0.4) act(w, { c: s.id, kind: "bond", life: true, target: k, shift: Math.round((now - was) * 100) / 100, deed: v.why, text: `turned against ${shortName(o.name)}` });
    else if (now < 0 && was >= 0.45) act(w, { c: s.id, kind: "bond", life: true, target: k, shift: Math.round((now - was) * 100) / 100, deed: v.why, text: `fell out with ${shortName(o.name)}` });
    else if (now < 0.2 && was >= 0.45) act(w, { c: s.id, kind: "bond", life: true, target: k, shift: Math.round((now - was) * 100) / 100, deed: v.why, text: `drifted from ${shortName(o.name)}` });
    else if (now > -0.15 && was <= -0.4) act(w, { c: s.id, kind: "bond", life: true, target: k, shift: Math.round((now - was) * 100) / 100, deed: v.why, text: `made it up with ${shortName(o.name)}` });
  }
  // what the town says of them
  const rep = reputation(s); const standing = rep.harm >= 0.5 && rep.harm >= rep.help ? "feared" : rep.help >= 0.5 && rep.help > rep.harm ? "trusted" : "";
  if (standing !== before.standing) { s.standing = standing; if (standing) act(w, { c: s.id, kind: "standing", life: true, text: standing === "feared" ? "is spoken of now for the harm they have done" : "is thought well of now for the help they have given" }); }
}
/** How a death happened, said the way the town would say it, in the town's own places: "drowned at the Well", "was
 *  found beaten to death near the Platform", "died in her sleep". A death a scene brought about is told from that scene —
 *  its place and what it said would happen — so the manner never argues with the moment beside it; a death at work from
 *  the place of the work; any other from where they were and the cause. */
export function mannerOf(w: Chronicle, s: Soul, cause: DeathCause, killer?: Soul | null, by?: Act): string {
  const h = hashString(`${w.seed}:${s.id}:${w.tick}:${cause}`); const pick = (xs: string[]) => xs[h % xs.length];
  if (by?.dilemma) { // the scene that did it: its own place and its own words
    const P = by.place ?? placeOf(w, s).name; const said = `${by.situation ?? ""} ${by.outcome ?? ""} ${by.text ?? ""}`.toLowerCase(); const hit = (re: RegExp) => re.test(said);
    const byName = killer ? shortName(killer.name) : "";
    switch (cause) {
      case "violence": return hit(/\bhang/) ? "was hanged" : hit(/\btaken away\b/) ? "was taken away and not seen again"
        : /\b(war|rifle|army|navy|battle|first action|press-?gang|soldiers?|do not come back)\b/.test(`${by.outcome ?? ""} ${by.choice ?? ""} ${by.situation ?? ""}`.toLowerCase()) ? "went to the fighting and did not come back"
        : hit(/\b(crowd|mob|driven out)/) ? `was killed by the crowd at ${P}`
        : byName && by.kind === "violence" && (by.harm ?? 0) >= 0.9 ? `was beaten to death by ${byName} at ${P}` : `was killed at ${P}`;
      case "sickness": return hit(/\bboard(ed)?\b/) ? "died of the sickness in the boarded-up house" : hit(/\bfound at dark\b/) ? `was found dead at ${P} at dark` : hit(/\balone\b/) ? "died of the sickness, alone" : "died of the sickness";
      case "exposure": return `died of the cold near ${P}`;
      case "hunger": return `died of hunger at ${P}`;
      case "accident": return hit(/\b(water|flood|sluice|drown|river|sea|tide|dry)\b/) ? `drowned at ${P}` : hit(/\b(fire|burn|flame)/) ? `died in a fire at ${P}` : hit(/\b(roof|fall|collapse|rock)/) ? `was crushed at ${P}` : `was killed at ${P}`;
      default: break;
    }
  }
  const job = s.job ? w.scenario.jobs.find((j) => j.id === s.job) : null;
  const at = cause === "accident" && job ? w.scenario.locations.find((l) => l.id === job.at) : null;
  const pl = at ? { name: at.name, tags: at.tags ?? [] } : placeOf(w, s); const P = pl.name; const where = `${P} ${(pl.tags ?? []).join(" ")} ${job?.name ?? ""}`.toLowerCase();
  const his = sexOf(s) === "f" ? "her" : "his";
  switch (cause) {
    case "accident": return /\b(water|wells?|flood\w*|river|sea|docks?|harbou?r|pier|boats?|ships?|lake|canal|pumps?|bilge|nets?|fish\w*)\b/.test(where) ? pick([`drowned at ${P}`, `went under at ${P} and was not brought up in time`])
      : /\b(pits?|mines?|shafts?|tunnels?|quarry|gallery|seams?|cellars?)\b/.test(where) ? pick([`was crushed in a fall at ${P}`, `was caught when the roof came down at ${P}`])
      : /\b(fields?|farms?|pastures?|herds?|roads?|carts?|mules?|caravans?|camps?|rails?)\b/.test(where) ? pick([`was crushed under a cart at ${P}`, `was trampled at ${P}`])
      : /\b(kilns?|furnaces?|forges?|galley|kitchens?|stoves?|fires?|boilers?)\b/.test(where) ? pick([`was burned at ${P} and did not recover`, `died in a fire at ${P}`])
      : pick([`fell at ${P} and did not get up`, `was killed in an accident at ${P}`]);
    case "violence": return killer ? `was killed by ${shortName(killer.name)}` : pick([`was beaten near ${P} and did not get up`, `was found beaten to death near ${P}`]);
    case "sickness": return pick([`died of the fever in the night`, `was taken by the sickness at ${P}`, `died of the sickness, coughing to the end`]);
    case "hunger": return pick([`starved at ${P}`, `died of hunger at ${P}`]);
    case "exposure": return pick([`froze in the open near ${P}`, `died of the cold near ${P}`]);
    case "old age": return pick([`died in ${his} sleep`, `died when ${his} heart gave out at ${P}`]);
    case "childbirth": return "died in childbirth";
    default: return `died of ${cause}`;
  }
}
function die(w: Chronicle, s: Soul, cause: DeathCause, opts: { onBeat?: (b: Beat) => void }, by?: Act) {
  if (!s.alive) return;
  s.alive = false; s.diedAt = w.tick; s.cause = cause; w.stats.deaths[cause] = (w.stats.deaths[cause] ?? 0) + 1;
  const killerSoul = by && by.c !== s.id && (by.harm ?? 0) >= 0.3 ? w.byId.get(by.c) ?? null : null;
  const how = mannerOf(w, s, cause, killerSoul, by); (s as any).how = how;
  const partner = s.partner && w.byId.get(s.partner)?.alive ? s.partner : undefined;
  const killer = by && by.c !== s.id && (by.harm ?? 0) >= 0.3 ? by : undefined; // a death by one's own choice is not a killing; nor is one that came while somebody was trying to help
  act(w, { c: s.id, kind: "death", text: `dies of ${cause}`, how, ...(partner ? { target: partner, household: partner, impact: { target: { mood: -0.3 } } } : {}), ...(killer ? { by: killer.c } : {}), ...(s.children ? { children: s.children } : {}) } as Act);
  if (killer) (killer.kills = killer.kills ?? []).push(s.id);
  s.journey.push({ tick: w.tick, label: tickLabel(w.scenario, w.tick), situation: "", option: "", outcome: how, death: cause, kind: "life" });
  beat(w, 3, `${s.name} (${s.role}, ${Math.floor(s.age)}) ${how}`, [s.id], opts);
  grieve(w, s, killer ? w.byId.get(killer.c) : undefined);
  if (s.partner) { const p = w.byId.get(s.partner); if (p && p.alive) { p.partner = null; p.widowedAt = w.tick; p.journey.push({ tick: w.tick, label: tickLabel(w.scenario, w.tick), situation: "", option: "", outcome: `widowed: ${shortName(s.name)} died of ${cause}`, kind: "life" }); } }
}
function beat(w: Chronicle, level: 1 | 2 | 3, headline: string, who: string[] = [], opts: { onBeat?: (b: Beat) => void }, thought?: string, because?: string) {
  const b: Beat = { hour: w.tick, level, headline, who }; if (thought) b.thought = thought; if (because) b.because = because;
  w.beats.push(b); opts.onBeat?.(b);
}

// ---------- the mock brain: traits + genuine dice ----------
export const mockChronicleBrain: ChronicleBrain = {
  name: "mock",
  choose(w, s, sit) {
    const r = w.rng.fork(`choose:${s.id}:${w.tick}`);
    const factors: Record<string, number> = { ...s.traits, hunger: clamp(1 - s.food), poverty: clamp(1 - s.money), danger: 1 - s.traits.bold, family: s.partner || s.children ? 1 : 0 };
    // the slope: what you have done makes the next one easier; a town where others have turned makes it easier still; the first harm is the hardest
    const hardened = clamp(-s.conscience), kind = clamp(s.conscience);
    // what is seen: the town's darkness is what people have watched others do, not what they carry inside
    const living = w.souls.filter((o) => o.alive && !o.left && o.id !== s.id); const townDark = living.length ? living.filter((o) => reputation(o).harm >= 0.5).length / living.length : 0;
    // being watched holds a hand back (Hoffman et al. 1994; Darley & Latané's audience); a good deed just done licenses a small one (Monin & Miller 2001); a harm just done asks to be made up for (Sachdeva et al. 2009)
    const cond = sit.condition ? sit.spec.conditions?.find((c) => c.id === sit.condition!.id) : undefined; const condHarm = cond?.mock?.harm ?? 0; // the condition's push on the dice, in the direction the study found, or nothing
    const last = s.deeds[s.deeds.length - 1]; const lastRecent = last && last.tick >= w.tick - 1;
    const licence = lastRecent && last.help >= 0.3 ? 0.1 : 0, cleanse = lastRecent && last.harm >= 0.3 ? 0.15 : 0;
    let best = sit.options[0].id, bestScore = -Infinity; const weighed: Weighed[] = [];
    for (const o of sit.spec.options) {
      let sc = 0; const pulls: { name: string; v: number }[] = []; for (const [k, v] of Object.entries(o.pull)) { const c = (v ?? 0) * (factors[k] ?? 0); sc += c; if (Math.abs(c) >= 0.05) pulls.push({ name: k, v: Math.round(c * 100) / 100 }); }
      const ex = expected(o, sit.spec, sit.spec.id.endsWith("-b") ? "b" : "a"); const slope = ex.harm * (0.35 * hardened + 0.3 * townDark - 0.2 * (1 - hardened) + condHarm + licence) + ex.help * (0.3 * kind + cleanse + 0.1 * (s.mood ?? 0)); sc += slope; if (Math.abs(slope) >= 0.05) pulls.push({ name: ex.harm > ex.help ? "the slope" : "conscience", v: Math.round(slope * 100) / 100 });
      const dice = r.range(-0.35, 0.35); sc += dice; // the dice: the same person in the same spot does not always do the same thing
      weighed.push({ id: o.id, score: Math.round(sc * 100) / 100, pulls: pulls.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3), dice: Math.round(dice * 100) / 100 });
      if (sc > bestScore) { bestScore = sc; best = o.id; }
    }
    const o = sit.spec.options.find((x) => x.id === best);
    return { option: best, thought: o?.voice?.length ? voiceFor(w, s, sit, o, r) : "", weighed };
  },
};
/** what a person did lately — earlier seasons only, the choice without its outcome, so a card never carries this season's answer */
export const lately = (s: Soul, t: number) => s.journey.filter((j) => j.kind !== "epoch" && j.tick < t).slice(-2).map((j) => `${j.label}: ${j.kind === "life" ? j.outcome : j.option}`);
/** How somebody is, in their own second person: their spirits and why, who they are close to and at odds with and why,
 *  and who they have lost. Built from the same facts the page shows, so what a person says in their head can be about
 *  the life they have actually had between the choices. */
export function innerLines(w: Chronicle, s: Soul): string[] {
  const me = shortName(s.name);
  const you = (x: string) => x.replace(new RegExp(`\\b${me}'s\\b`, "g"), "your").replace(new RegExp(`\\b${me}\\b`, "g"), "you").replace(/^you marry.*/, "you married").replace(/^you /, "");
  const out: string[] = [];
  const lows = w.acts.slice(0, w.tick).flat().filter((a) => a.c === s.id && a.kind === "low");
  const lastLow = lows[lows.length - 1];
  const now = (s.moodWhy ?? []).filter((x) => x.v < 0).map((x) => x.why);
  const why = [...new Set([...(s.lowSince != null && lastLow?.because ? lastLow.because : []), ...now])].slice(0, 3).map(you);
  out.push(`Your spirits: ${moodWord(s.mood ?? 0)}${why.length && (s.mood ?? 0) < 0 ? ` — ${why.join("; ")}` : ""}`);
  const ties = Object.entries(s.ties).map(([k, v]) => ({ o: w.byId.get(k)!, v })).filter((x) => x.o && x.o.alive && !x.o.left);
  const close = ties.filter((x) => x.v.affinity >= 0.45 && x.o.id !== s.partner).sort((a, b) => b.v.affinity - a.v.affinity).slice(0, 2);
  const odds = ties.filter((x) => x.v.affinity <= -0.35).sort((a, b) => a.v.affinity - b.v.affinity).slice(0, 2);
  if (close.length) out.push(`Close to: ${close.map((x) => `${shortName(x.o.name)}${x.v.why && x.v.why !== "neighbours" ? ` (${you(x.v.why)})` : ""}`).join("; ")}`);
  if (odds.length) out.push(`At odds with: ${odds.map((x) => `${shortName(x.o.name)}${x.v.why ? ` (${you(x.v.why)})` : ""}`).join("; ")}`);
  // what they carry, all of it and not only lately: everyone they have lost, the worst done to them, the worst they did,
  // and something they once told themselves — so a thought can be about a life and not only about this season
  const label = (t: number) => tickLabel(w.scenario, t);
  const lost = w.acts.slice(0, w.tick).flatMap((as, k) => as.filter((a) => a.c === s.id && a.kind === "grief").map((a) => ({ who: w.byId.get(a.target!), k })));
  const dead = w.souls.filter((o) => !o.alive && o.id !== s.id && (o.id === s.startPartner || (s.ties[o.id]?.affinity ?? 0) >= 0.45 || lost.some((l) => l.who?.id === o.id)));
  if (dead.length) out.push(`The dead you carry: ${dead.map((o) => `${shortName(o.name)}${o.id === s.startPartner || s.journey.some((j) => /widowed/.test(j.outcome) && j.outcome.includes(shortName(o.name))) ? " (your wife or husband)" : ""}, ${o.cause ? `${o.cause}, ` : ""}${label(o.diedAt ?? 1)}`).join("; ")}`);
  const worstTo = [...s.suffered].sort((a, b) => b.harm - a.harm)[0];
  if (worstTo && worstTo.harm >= 0.3) out.push(`The worst done to you: ${worstTo.known === false ? "someone" : shortName(w.byId.get(worstTo.actor)?.name ?? "someone")} ${you(worstTo.text)} (${label(worstTo.tick)})${worstTo.known === false ? " — you never found out who" : ""}`);
  const worstBy = [...s.deeds].sort((a, b) => b.harm - a.harm)[0];
  if (worstBy && worstBy.harm >= 0.3) out.push(`The worst you have done: you ${you(worstBy.text).replace(/^was\b/, "were")} (${label(worstBy.tick)})${worstBy.witnessed || /\b(seen|caught)\b/.test(worstBy.text) ? "" : " — nobody saw"}`);
  const old = s.journey.filter((j) => j.thought && j.tick <= w.tick - 8);
  if (old.length) { const j = old[(w.tick * 7 + s.id.length) % old.length]; out.push(`Years ago (${j.label}) you told yourself: "${j.thought}" — you may still think so, or not.`); }
  return out;
}

/** who the other person is to you: the same line the model reads */
export function aboutLine(w: Chronicle, s: Soul, tg: Soul): string {
  const rep = reputation(s); const a = s.ties[tg.id]?.affinity ?? 0;
  return [`${shortName(tg.name)} is ${tg.role}${tg.id === s.partner ? ", your wife or husband" : a > 0.3 ? ", a friend" : a < -0.3 ? ", no friend of yours" : ""}${tg.children ? `, with ${tg.children} children` : ""}.`, rep.harm >= 1 ? "The town remembers what you did." : rep.help >= 1 ? "The town thinks well of you." : "", s.wrongedBy === tg.id ? "They did you wrong once." : ""].filter(Boolean).join(" ");
}
// The mock's voice is a lookup table; the least it can do is not put one sentence in four mouths. A line is chosen from the option's
// variants by what the person is — the temperament the traits show — and what is on them; a line already spoken this run by someone
// else is passed over; and a second sentence in their own key (loyal, bold, careful, sociable; hungry, broke, turned) is added.
const TAILS: Record<string, { harm: string[]; kind: string[]; plain: string[] }> = {
  loyal: { harm: ["I will carry it. I have carried worse.", "Somebody had to, and it is always me."], kind: ["That is what I am for.", "You do not let your own go under."], plain: ["I said I would.", "That is the job."] },
  bold: { harm: ["Let them talk.", "Nobody ever got anywhere waiting to be asked."], kind: ["And I will say so to anyone.", "Call it soft. I call it mine."], plain: ["Done is done.", "I do not look back."] },
  careful: { harm: ["Nobody saw. Nobody needs to.", "If it goes wrong I never did it."], kind: ["It costs less than the other thing would.", "I would rather be owed than owing."], plain: ["Best not to be noticed.", "Quietly, then."] },
  sociable: { harm: ["They will forgive me. They always do.", "It is not personal. I like them."], kind: ["They would do it for me.", "What is a lane for, if not this?"], plain: ["Everyone does.", "People will understand."] },
};
const PRESS: Record<string, string[]> = { hungry: ["I have not eaten since the week began.", "Hunger does the choosing; I only nod."], poor: ["There is nothing in the jar.", "Coin first. Conscience when I can afford one."], turned: ["It gets easier. That is the worst of it.", "I stopped counting a while ago."], seen: ["They are watching. Let them see it done properly."], unseen: ["Nobody will ever know. That is the point."] };
const temperOf = (t: Record<string, number>) => (t.bold ?? 0.5) <= 0.2 ? "careful" : Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] === "sociable" ? "sociable" : Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] === "bold" ? "bold" : "loyal";
function voiceFor(w: Chronicle, s: Soul, sit: Situation, o: DilemmaOption, r: Rng): string {
  const used: Record<string, string> = w.spoken ?? (w.spoken = {}); const vs = o.voice ?? []; if (!vs.length) return ""; /* a plain object, so a world is JSON and can be put down and picked up again */
  const fresh = vs.filter((v) => !used[v] || used[v] === s.id); const pool = fresh.length ? fresh : vs; const base = pool[r.int(pool.length)]; used[base] = s.id;
  const ex = expected(o, sit.spec, sit.spec.id.endsWith("-b") ? "b" : "a"); const tone = ex.harm >= 0.1 ? "harm" : ex.help >= 0.1 ? "kind" : "plain";
  const cond = sit.condition?.id; const press = s.food < 0.15 ? "hungry" : s.money < 0.12 ? "poor" : s.conscience <= TURNED ? "turned" : cond && ["seen", "near", "aloud"].includes(cond) ? "seen" : cond && ["unseen", "private"].includes(cond) ? "unseen" : null;
  const tails = press && r.chance(0.55) ? PRESS[press] : TAILS[temperOf(s.traits)][tone]; const tail = r.chance(fresh.length ? 0.6 : 1) ? ` ${tails[r.int(tails.length)]}` : "";
  return speak(w, s, sit, base) + tail;
}
/** a voice line with the person's own words in it */
export function speak(w: Chronicle, s: Soul, sit: Situation, line: string): string {
  const kids = s.children === 0 ? "nobody at home" : s.children === 1 ? "one child" : `${s.children} children`;
  const crowd = Math.max(0, w.souls.filter((o) => o.alive && !o.left && o.id !== s.id).length - 1);
  return line.replace(/\{\{target\}\}/g, sit.target ? shortName(sit.target.name) : "them").replace(/\{\{want\}\}/g, s.want).replace(/\{\{fear\}\}/g, s.fear).replace(/\{\{children\}\}/g, kids).replace(/\{\{crowd\}\}/g, String(crowd));
}

// ---------- a two-player game: both decide at once, the matrix says what comes of it ----------
async function pairGame(w: Chronicle, s: Soul, sit: Situation, opt: DilemmaOption, choice: { option: string; thought?: string }, brain: ChronicleBrain, opts: { onBeat?: (b: Beat) => void }) {
  const sc = w.scenario, t = w.tick, tg = sit.target!, pair = sit.spec.pair!;
  const fillB = (x: string) => x.replace(/\{\{target\}\}/g, shortName(s.name));
  const specB: DilemmaSpec = { ...sit.spec, id: `${sit.spec.id}-b`, text: pair.text, options: pair.options.map((o) => ({ id: o.id, label: o.label, pull: o.pull, voice: o.voice, outcomes: [] })) };
  const who = sit.condition ? (sit.spec.conditions?.find((c) => c.id === sit.condition!.id)?.fill.who ?? "") : "";
  const offerLabel = (o: { id: string; label: string }) => `offered ${o.label.toLowerCase().replace(/^offer /, "")}`;
  const condB = sit.spec.id === "ultimatum" ? { id: opt.id, label: offerLabel(opt) } : sit.condition;
  const condsB = sit.spec.id === "ultimatum" ? sit.spec.options.map((o) => ({ id: o.id, label: offerLabel(o) })) : (sit.spec.conditions ?? []).map((c) => ({ id: c.id, label: c.label }));
  const sitB: Situation = { spec: specB, text: fillB(pair.text.replace(/\{\{offer\}\}/g, opt.label.toLowerCase()).replace(/\{\{who\}\}/g, who).replace(/ — +— /g, " ")).replace(/\s{2,}/g, " ").replace(/^./, (c) => c.toUpperCase()), target: s, options: pair.options.map((o) => ({ id: o.id, label: fillB(o.label) })), ...(condB ? { condition: condB } : {}) };
  const choiceB = await brain.choose(w, tg, sitB); if (choiceB.fallback) w.stats.fallbacks++;
  const optB = specB.options.find((o) => o.id === choiceB.option) ?? specB.options[0];
  const m = pair.matrix[`${opt.id}:${optB.id}`] ?? pair.matrix[Object.keys(pair.matrix)[0]];
  const fillA = (x: string) => x.replace(/\{\{target\}\}/g, shortName(tg.name));
  const r = w.rng.fork(`pair:${s.id}:${t}`);
  const mkDeed = (spec: DeedSpec | undefined, actor: Soul, target: Soul, fill: (x: string) => string) => { if (!spec) return undefined; const d: Deed = { tick: t, kind: spec.kind, actor: actor.id, target: target.id, harm: spec.harm ?? 0, help: spec.help ?? 0, text: fill(spec.text), witnessed: r.chance(0.5) }; actor.deeds.push(d); w.deeds.push(d); target.suffered.push(d); if (d.harm >= 0.3) target.wrongedBy = actor.id; actor.conscience = clamp(actor.conscience + conscienceStep(d.harm, d.help), -1, 1); return d; };
  const dA = mkDeed(m.deed, s, tg, fillA), dB = mkDeed(m.theirDeed, tg, s, fillB);
  applyDelta(w, s, m.self, tg, dA?.text ?? fillA(m.text)); applyDelta(w, tg, m.target, s, dB?.text ?? fillB(m.theirText));
  const spot = (sit.place ?? placeOf(w, s)).id; if (dA) react(w, dA, s, tg, spot); if (dB) react(w, dB, tg, s, spot);
  const you = (p: Soul) => `${Math.floor(p.age)}, ${p.role}${p.partner ? `, married to ${shortName(w.byId.get(p.partner)?.name ?? "someone")}` : ""}${p.children ? `, ${p.children} ${p.children === 1 ? "child" : "children"}` : ""}`;
  const optsOf = (spec: DilemmaSpec, fill: (x: string) => string) => spec.options.map((o) => { const ex = expected(o, sit.spec, spec === specB ? "b" : "a"); return { id: o.id, label: fill(o.label), harm: Math.round(ex.harm * 100) / 100, help: Math.round(ex.help * 100) / 100 }; });
  const exp = sit.spec.experiment;
  const actA: Act = { c: s.id, kind: dA ? dA.kind : "choice", target: tg.id, text: dA ? dA.text : fillA(opt.label), harm: dA?.harm, help: dA?.help, situation: sit.text, choice: fillA(opt.label), outcome: fillA(m.text), dilemma: sit.spec.id, option: opt.id, options: optsOf(sit.spec, fillA), you: you(s), ...(exp ? { experiment: exp } : {}), game: { with: tg.id, theirs: optB.id, theirLabel: fillB(optB.label) }, ...(choice.thought ? { thought: choice.thought } : {}), ...(sit.condition ? { condition: sit.condition, conditions: (sit.spec.conditions ?? []).map((c) => ({ id: c.id, label: c.label })) } : {}), template: sit.spec.text, lately: lately(s, t), about: aboutLine(w, s, tg), ...(choice.weighed ? { weighed: choice.weighed } : {}), ...(choice.because?.length ? { because: choice.because } : {}), ...(choice.fallback ? { fallback: true } : {}) };
  const actB: Act = m.moot ? { c: tg.id, kind: "choice", target: s.id, text: fillB(m.theirText), situation: sitB.text, outcome: fillB(m.theirText), quiet: true }
    : { c: tg.id, kind: dB ? dB.kind : "choice", target: s.id, text: dB ? dB.text : fillB(optB.label), harm: dB?.harm, help: dB?.help, situation: sitB.text, choice: fillB(optB.label), outcome: fillB(m.theirText), dilemma: specB.id, option: optB.id, options: optsOf(specB, fillB), you: you(tg), ...(exp ? { experiment: exp } : {}), game: { with: s.id, theirs: opt.id, theirLabel: fillA(opt.label) }, ...(choiceB.thought ? { thought: choiceB.thought } : {}), ...(choiceB.because?.length ? { because: choiceB.because } : {}), ...(condB ? { condition: condB, conditions: condsB } : {}), template: pair.text, lately: lately(tg, t), about: aboutLine(w, tg, s), ...(choiceB.weighed ? { weighed: choiceB.weighed } : {}), ...(choiceB.fallback ? { fallback: true } : {}) };
  act(w, actA); act(w, actB);
  for (const [p, a] of [[s, actA], [tg, actB]] as [Soul, Act][]) { p.journey.push({ tick: t, label: tickLabel(sc, t), situation: a.situation!, option: a.choice!, outcome: a.outcome!, kind: "situation", with: a.target, ...(a.thought ? { thought: a.thought } : {}) }); if (p.conscience <= TURNED && p.turnedAt == null) { p.turnedAt = t; act(w, { c: p.id, kind: "turned", text: "has turned", by: p.id }); beat(w, 3, `${p.name} has turned`, [p.id], opts); } }
  if (dA && dA.harm >= 0.5) beat(w, 2, `${s.name} ${dA.text}`, [s.id, tg.id], opts, choice.thought); if (dB && dB.harm >= 0.5) beat(w, 2, `${tg.name} ${dB.text}`, [tg.id, s.id], opts, choiceB.thought);
}

// ---------- one season ----------
async function season(w: Chronicle, brain: ChronicleBrain, opts: { onBeat?: (b: Beat) => void }) {
  const sc = w.scenario, t = w.tick, seasonIdx = (t - 1) % 4;
  w.activeEpochs = sc.epochs.filter((e) => t >= e.at && t < e.at + e.seasons);
  // the world's own turn this season, as the director wrote it: the town is moved before anyone decides anything
  const turn = (w as any).turns?.[t] as { headline: string; supply?: number; mood?: number; sick?: string[]; favour?: string[]; touch?: { id: string; mood: number; why: string }[] } | undefined;
  if (turn) { beat(w, 2, turn.headline, [], opts); w.supply = clamp(w.supply + (turn.supply ?? 0)); }
  // a secret the world brought out: the deed is known now, the one it was done to knows who, and the town remembers
  const exposed = (turn as any)?.exposes as string | undefined;
  if (exposed) { const [who, tk, kind, tgt] = exposed.split(":"); const s0 = w.byId.get(who); const d = s0?.deeds.find((x) => x.tick === +tk && x.kind === kind && (tgt == null || (x.target ?? "-") === tgt) && (!x.witnessed || x.known === false));
    if (s0 && d) {
      // the save splits one deed into copies (the doer's, the town's, the one it was done to): every copy learns it came out
      const same = (x: Deed) => x.tick === d.tick && x.kind === d.kind && x.actor === d.actor && x.target === d.target;
      const hidden = d.known === false;
      for (const x of [...w.deeds, ...w.souls.flatMap((o) => [...o.deeds, ...o.suffered])]) if (same(x)) { x.witnessed = true; x.known = true; if (hidden) (x as any).knownAt = t; }
      for (const a of w.acts[d.tick - 1] ?? []) if (a.c === who && a.kind === kind && a.unknown && a.target === d.target && a.text === d.text) delete a.unknown;
      ((w as any).exposed ??= []).push(exposed); const v = d.target ? w.byId.get(d.target) : null;
      if (v?.alive) { const tie = v.ties[s0.id] ?? { affinity: 0, why: "" }; const harm = d.harm >= d.help;
        v.ties[s0.id] = { affinity: Math.max(-1, Math.min(1, tie.affinity + (harm ? -0.35 : 0.3))), why: `found out they ${d.text}` };
        if (harm && d.harm >= 0.3) v.wrongedBy = s0.id;
        oweBack(w, s0, v, { ...d, known: true }, t, w.rng.fork(`expose:${exposed}`), true); /* found out: it comes back to them soon */
        if (hidden) { v.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: `found out it was ${shortName(s0.name)} who ${d.text.replace(`${shortName(v.name)}'s`, "their").replace(shortName(v.name), "them")}`, kind: "life" });
          act(w, { c: v.id, kind: "learned", life: true, target: s0.id, deed: d.text, tone: harm ? "harm" : "help", text: `found out it was ${shortName(s0.name)} who ${d.text.replace(`${shortName(v.name)}'s`, "their").replace(shortName(v.name), "them")}` }); } }
      act(w, { c: s0.id, kind: "exposed", life: true, text: `was found out: they ${d.text}`, ...(d.target ? { target: d.target } : {}) }); } }
  const favour = new Set(turn?.favour ?? []);
  for (const e of sc.epochs) if (e.at === t) { beat(w, 3, e.headline, [], opts); w.supply = clamp(w.supply + (e.kind === "famine" ? -0.45 * e.severity / 3 : e.kind === "boom" ? 0.2 : e.kind === "flood" || e.kind === "fire" ? -0.15 : e.kind === "winter" ? -0.25 * e.severity / 3 : e.kind === "war" ? -0.2 : e.kind === "plague" ? -0.1 : 0)); for (const s of w.souls) if (s.alive && !s.left) s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: e.headline, kind: "epoch" }); }
  if (!w.activeEpochs.some((e) => ["famine", "war", "winter"].includes(e.kind))) w.supply = clamp(w.supply + 0.06); // a hard stretch holds the price up while it lasts
  const famine = w.activeEpochs.find((e) => e.kind === "famine"), plague = w.activeEpochs.find((e) => e.kind === "plague"), fire = w.activeEpochs.find((e) => e.kind === "fire" || e.kind === "flood");
  w.offered = {};
  const order = w.souls.filter((s) => s.alive && !s.left); const orng = w.rng.fork(`order:${t}`);
  for (let i = order.length - 1; i > 0; i--) { const j = orng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  order.sort((a, b) => (b.named ? 1 : 0) - (a.named ? 1 : 0)); // the subjects go first: a protocol that comes to the lane once a season comes to one of them, not to a stranger
  // how everybody stood when the season began, so what it did to them can be said once it is over
  const before = new Map(order.map((s) => [s.id, { mood: s.mood, money: s.money, standing: s.standing ?? "", ties: Object.fromEntries(Object.entries(s.ties).map(([k, v]) => [k, v.affinity])) }]));
  for (const s of order) s.moodWhy = [];
  // disaster: some homes are lost
  if (fire && fire.at === t && !order.some((s) => s.home && w.rng.fork(`fire:${s.id}`).chance(0.25 * fire.severity / 3))) { const poorest = order.filter((s) => s.home).sort((a, b) => a.money - b.money)[0]; if (poorest) { poorest.home = null; act(w, { c: poorest.id, kind: "homeless", text: `lost their home to the ${fire.kind}` }); poorest.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: `lost their home to the ${fire.kind}`, kind: "life" }); beat(w, 2, `${poorest.name} loses their home to the ${fire.kind}`, [poorest.id], opts); } }
  if (fire && fire.at === t) for (const s of order) if (s.home && w.rng.fork(`fire:${s.id}`).chance(0.25 * fire.severity / 3)) { s.home = null; act(w, { c: s.id, kind: "homeless", text: `lost their home to the ${fire.kind}` }); s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: `lost their home to the ${fire.kind}`, kind: "life" }); beat(w, 2, `${s.name} loses their home to the ${fire.kind}`, [s.id], opts); }
  for (const s of order) {
    if (!s.alive || s.left) continue;
    const r = w.rng.fork(`season:${s.id}:${t}`);
    s.evening = "home"; s.conscience *= 0.97; // the years wear the old deeds down, a little
    s.mood = (s.mood ?? 0) * 0.85; // and time takes the edge off both the bad seasons and the good
    if (turn) { if (turn.mood) feel(s, turn.mood, turn.headline.toLowerCase()); const tc = turn.touch?.find((x) => x.id === s.id); if (tc && s.named) feel(s, tc.mood, tc.why || turn.headline.toLowerCase());
      if (turn.sick?.includes(s.id) && !s.sick) { s.sick = true; act(w, { c: s.id, kind: "sick", life: true, text: "has caught the sickness" }); } }
    if (!s.home && s.partner) { const p = w.byId.get(s.partner); if (p?.alive && p.home) { s.home = p.home; act(w, { c: s.id, kind: "housed", life: true, target: p.id, text: "has a roof again" }); } } // married people share a roof
    // economics of a season
    s.age += 0.25;
    const job = s.job ? sc.jobs.find((j) => j.id === s.job) : undefined;
    const pay = job ? job.pay * (w.activeEpochs.some((e) => e.kind === "boom") ? 1.3 : w.activeEpochs.some((e) => e.kind === "war") ? 0.7 : 1) : 0;
    // a season's pay against a season's costs: a roof, the children, and food at what the supply makes it cost.
    // In normal years a working household roughly breaks even; lose the job or the harvest and the savings go, then the food.
    s.money = clamp(s.money + pay - (s.home ? 0.015 : 0) - s.children * (s.partner ? 0.012 : 0.025), 0, 3); // two earners split the children
    const price = 0.4 * (1.3 - w.supply) * (famine ? 2 : 1);
    const cold = w.activeEpochs.find((e) => e.kind === "winter");
    const need = 0.13 + s.children * (s.partner ? 0.015 : 0.03) + (cold ? 0.03 * cold.severity : 0);
    const buy = Math.min(need + 0.03, s.money / price, w.supply * 0.3);
    s.money = clamp(s.money - buy * price, 0, 3); s.food = clamp(s.food + buy - need);
    if (s.food < 0.12) feel(s, s.food <= 0 ? -0.15 : -0.07, "nothing to eat");
    if (s.food < 0.12) { if (s.hungrySince == null) { s.hungrySince = t; act(w, { c: s.id, kind: "hungry", life: true, text: "went hungry", because: [famine ? "the price of bread" : !s.job ? "no work" : s.children ? "the children to feed" : "no money"] }); } }
    else if (s.hungrySince != null && s.food > 0.2) { act(w, { c: s.id, kind: "fed", life: true, seasons: t - s.hungrySince, text: "had enough to eat again" }); s.hungrySince = null; }
    if (s.food <= 0) { s.health = clamp(s.health - 0.16); s.food = 0; s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: s.health <= 0.3 ? "nothing to eat; close to the end" : "nothing to eat this season", kind: "life" }); if (s.health <= 0.05) { die(w, s, "hunger", opts); continue; } }
    else s.health = clamp(s.health + 0.06);
    if (s.sick) feel(s, -0.08, "sick"); if (!s.home) feel(s, -0.08, "no roof"); if (s.money < 0.15) feel(s, -0.03, "no money");
    { const hard = w.activeEpochs.find((e) => ["famine", "war", "plague", "winter", "fire", "flood"].includes(e.kind)); if (hard) feel(s, -0.03, `the ${hard.kind}`); }
    if (!w.souls.some((o) => o.alive && !o.left && o.id !== s.id && tieOf(s, o) >= 0.3)) feel(s, -0.04, "nobody close");
    if (s.sick && s.health > 0.25 && r.chance(0.2)) { s.sick = false; act(w, { c: s.id, kind: "well", life: true, text: "got well again" }); s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: "got over the sickness", kind: "life" }); }
    if (s.sick) { s.health = clamp(s.health - 0.12); if (s.health <= 0.05) { die(w, s, "sickness", opts); continue; } } // the sickness wears you down until it is nursed, paid off, or rested out
    if (!s.home && seasonIdx === 3 && !w.activeEpochs.some((e) => e.kind === "winter")) s.health = clamp(s.health - 0.1);
    if (w.activeEpochs.some((e) => e.kind === "winter") && !s.home) s.health = clamp(s.health - 0.2);
    if (cold && s.money < 0.1) { s.health = clamp(s.health - 0.05 * cold.severity); feel(s, -0.05, `the ${cold.kind} with no fuel`); }
    if (plague && !s.sick && r.chance(0.04 * plague.severity * (1.4 - s.health))) { s.sick = true; s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: "caught the sickness", kind: "life" }); act(w, { c: s.id, kind: "sick", text: "has caught the sickness" }); if (s.named) beat(w, 2, `${s.name} has caught the sickness`, [s.id], opts); }
    if (!s.job && r.chance(w.activeEpochs.some((e) => e.kind === "boom") ? 0.5 : 0.15)) { const j = sc.jobs[r.int(sc.jobs.length)]; s.job = j.id; s.role = j.name; s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: `found work as a ${j.name}`, kind: "life" }); act(w, { c: s.id, kind: "work", text: `found work as a ${j.name}` }); }
    if (job?.risk && s.named && r.chance(job.risk * 0.06)) { (s as any).hurtAt = t; die(w, s, "accident", opts); continue; } /* dangerous work kills, now and then, without warning */
    if (job?.risk && r.chance(job.risk)) { (s as any).hurtAt = t; s.health = clamp(s.health - 0.3); feel(s, -0.1, "hurt at work"); act(w, { c: s.id, kind: "hurt", life: true, place: sc.locations.find((l) => l.id === job.at)?.name ?? job.name, text: `was hurt at ${sc.locations.find((l) => l.id === job.at)?.name ?? job.name}` }); s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: `hurt at ${sc.locations.find((l) => l.id === job.at)?.name ?? job.name}`, kind: "life" }); }
    if (s.health <= 0.05) { die(w, s, (s as any).hurtAt === t ? "accident" : s.sick ? "sickness" : s.food < 0.12 ? "hunger" : !s.home ? "exposure" : s.age >= 72 ? "old age" : "sickness", opts); continue; } /* old age only when nothing else took them, and only the truly old */
    // one situation a season
    const sits = situationsFor(w, s, r);
    const owedNow = s.named ? owedFor(w, s, t) : null;
    if (!sits.length && !owedNow) continue;
    const pressing = sits.filter((x) => !x.spec.casual), casual = sits.filter((x) => x.spec.casual);
    const favoured = sits.filter((x) => favour.has(x.spec.id));
    const pool = favoured.length && r.chance(0.6) ? favoured : pressing.length && r.chance(0.8) ? pressing : casual.length ? casual : pressing;
    const used: Record<string, number> = ((w as any).used ??= {});
    const wOf = (x: Situation) => x.spec.weight * (favour.has(x.spec.id) ? 4 : 1) * (wears(x.spec) ? Math.pow(wearOf(x.spec), used[x.spec.id] ?? 0) : 1); /* worn a little more each time */
    let total = pool.reduce((a, x) => a + wOf(x), 0), pick = r.next() * total, sit = pool[0];
    for (const x of pool) { pick -= wOf(x); if (pick <= 0) { sit = x; break; } }
    // what was done comes back: a due reckoning or repayment takes the place of an everyday scene, never of an experiment
    if (owedNow && (!sit || (!sit.spec.experiment && !sit.spec.pair && (sit.spec.casual || !(sit.spec.when ?? []).length)))) { const os = owedSituation(w, s, owedNow); if (os) { sit = os; ((w as any).owed as Owed[]).splice(((w as any).owed as Owed[]).indexOf(owedNow), 1); } }
    if (!sit) continue;
    if (wears(sit.spec)) used[sit.spec.id] = (used[sit.spec.id] ?? 0) + 1;
    w.stats.situations++; s.lastSeen[sit.spec.id] = t; w.offered[sit.spec.id] = (w.offered[sit.spec.id] ?? 0) + 1; w.laneSeen[sit.spec.id] = t;
    if (sit.spec.id === "revenge") s.wrongedBy = null; // settled or forgiven, either way it is over
    const choice = sit.options.length === 1 ? { option: sit.options[0].id } : await brain.choose(w, s, sit); // no choice, no call
    if (choice.fallback) w.stats.fallbacks++;
    const opt = sit.spec.options.find((o) => o.id === choice.option) ?? sit.spec.options[0];
    if (sit.spec.pair && sit.target) { await pairGame(w, s, sit, opt, choice, brain, opts); continue; }
    let roll = r.next(), out = opt.outcomes[opt.outcomes.length - 1];
    for (const o of opt.outcomes) { roll -= o.chance; if (roll <= 0) { out = o; break; } }
    const tg = sit.target;
    // where it happened — the card's own place if it has one — and who else was there
    const where = sit.place ?? placeOf(w, s);
    // a card that says who is there is taken at its word: "no one else is about" is nobody, "a crowd standing by" is the crowd
    const here = w.souls.filter((o) => o.alive && !o.left && o.id !== s.id && placeOf(w, o).id === where.id).length;
    const watched = !!sit.condition && ["seen", "aloud", "near", "watched", "clerk"].includes(sit.condition.id) || /\b(waits at the door to see|stands over you|a crowd|everyone is watching|in front of)\b/i.test(sit.bare ?? sit.text);
    const seen = sit.condition?.id === "alone" ? 0 : sit.condition?.id === "crowd" ? Math.max(here, w.souls.filter((o) => o.alive && !o.left && o.id !== s.id).length - 1) : watched ? Math.max(1, here) : here; // a card that puts a watcher there is believed
    const fill = (x: string) => x.replace(/\{\{target\}\}/g, tg ? shortName(tg.name) : "someone").replace(/\{\{place\}\}/g, where.name);
    let deed: Deed | undefined;
    if (out.deed) { deed = { tick: t, kind: out.deed.kind, actor: s.id, target: tg?.id ?? null, harm: out.deed.harm ?? 0, help: out.deed.help ?? 0, text: fill(out.deed.text), witnessed: sit.condition && ["unseen", "private"].includes(sit.condition.id) ? false : sit.condition && ["seen", "aloud", "near"].includes(sit.condition.id) ? true : seen > 0 ? r.chance(Math.min(0.9, 0.35 + seen * 0.18)) || /seen|caught|named|front of/.test(out.text) : /seen|caught|named|front of/.test(out.text) }; if (!deed.witnessed && tg && deed.harm > deed.help && (/\bnobody saw\b|\bunseen\b|never know/.test(out.text) || (sit.condition && ["unseen", "private"].includes(sit.condition.id)) || /never know|whose slate/.test(sit.bare ?? sit.text))) deed.known = false; /* the one it was done to does not know who: the reader does */
      s.deeds.push(deed); w.deeds.push(deed); s.conscience = clamp(s.conscience + conscienceStep(deed.harm, deed.help), -1, 1); if (tg) { tg.suffered.push(deed); if (deed.harm >= 0.3 && deed.known !== false) tg.wrongedBy = s.id; } }
    const blind = (sit.condition && ["unseen", "private"].includes(sit.condition.id)) || deed?.known === false; // what nobody saw cannot change what they think of you
    applyDelta(w, s, out.self, tg, deed?.text ?? fill(out.text));
    if (tg) applyDelta(w, tg, blind && out.target ? { ...out.target, tie: undefined } : out.target, s, deed?.text ?? fill(out.text));
    if (deed) react(w, deed, s, tg, where.id);
    if (deed && tg && !["reckon", "repay"].includes(sit.spec.id)) oweBack(w, s, tg, deed, t, r); /* a reckoning is the end of a debt, not the start of another */
    if (out.world?.supply) w.supply = clamp(w.supply + out.world.supply);
    const state = [s.food < 0.12 ? "starving" : s.food < 0.3 ? "food short" : "", s.money < 0.15 ? "no money" : "", s.sick ? "sick" : "", !s.home ? "no roof" : "", s.health < 0.3 ? "failing" : ""].filter(Boolean).join(", ");
    const entry: JourneyEntry = { tick: t, label: tickLabel(sc, t), situation: sit.text, option: fill(opt.label), outcome: fill(out.text) + (state ? ` (${state})` : ""), kind: "situation" }; if (sit.spec.quiet) entry.quiet = true; if (tg) entry.with = tg.id; if (out.self || out.target) entry.impact = { ...(out.self ? { self: out.self as any } : {}), ...(out.target ? { target: out.target as any } : {}) }; if (opt.evening) { entry.evening = opt.evening; s.evening = opt.evening === "visit" && tg ? `visit:${tg.id}` : opt.evening; if (tg && opt.evening === "visit") entry.with = tg.id; } if (choice.thought) entry.thought = choice.thought; if (deed) entry.deed = deed;
    s.journey.push(entry);
    if (tg && (deed || out.target) && sit.spec.quiet) tg.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: `${shortName(s.name)} came by in the evenings${/quarrel|wore thin/.test(out.text) ? "; it did not end well" : ""}`, kind: "life", quiet: true });
    else if (tg && (deed || out.target)) tg.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: deed ? `${deed.known === false ? "someone" : shortName(s.name)} ${deed.text.replace(`${shortName(tg.name)}'s`, "their").replace(shortName(tg.name), "them")}` : `${shortName(s.name)}: ${fill(out.text)}`, kind: "life" });
    const hadHome = s.home, tgHadHome = tg?.home, wasSick = s.sick;
    const you = `${Math.floor(s.age)}, ${s.role}${s.partner ? `, married to ${shortName(w.byId.get(s.partner)?.name ?? "someone")}` : ""}${s.children ? `, ${s.children} ${s.children === 1 ? "child" : "children"}` : ""}${!s.home ? ", no roof" : ""}${state ? ` · ${state}` : ""}`;
    const ask = sit.spec.quiet || sit.options.length < 2 ? {} : { dilemma: sit.spec.id, option: opt.id, place: where.name, seen, options: sit.options.map((o) => { const ex = expected(sit.spec.options.find((x) => x.id === o.id)!); return { id: o.id, label: o.label, harm: Math.round(ex.harm * 100) / 100, help: Math.round(ex.help * 100) / 100 }; }), you, lately: lately(s, t), ...(tg ? { about: aboutLine(w, s, tg) } : {}), ...(choice.weighed ? { weighed: choice.weighed } : {}), ...(choice.because?.length ? { because: choice.because } : {}), template: sit.spec.text, ...(sit.spec.experiment ? { experiment: sit.spec.experiment } : {}), ...(sit.condition ? { condition: sit.condition, conditions: (sit.spec.conditions ?? []).map((c) => ({ id: c.id, label: c.label })) } : {}), ...(choice.fallback ? { fallback: true } : {}) };
    const moment: Act = deed ? { ...ask, ...(deed.known === false ? { unknown: true } : {}), c: s.id, kind: deed.kind, ...(tg ? { target: tg.id } : {}), text: deed.text, harm: deed.harm, help: deed.help, situation: sit.text, choice: fill(opt.label), outcome: fill(out.text), ...(entry.impact ? { impact: entry.impact } : {}), ...(choice.thought ? { thought: choice.thought } : {}) } : { ...ask, c: s.id, kind: "choice", ...(tg ? { target: tg.id } : {}), text: fill(opt.label), situation: sit.text, outcome: fill(out.text), ...(entry.impact ? { impact: entry.impact } : {}), ...(choice.thought ? { thought: choice.thought } : {}), ...(sit.spec.quiet ? { quiet: true } : {}), ...(opt.evening ? { evening: opt.evening } : {}) };
    if (!/child is coming/.test(sit.text)) act(w, moment);
    if (s.conscience <= TURNED && s.turnedAt == null) { s.turnedAt = t; act(w, { c: s.id, kind: "turned", text: "has turned", by: moment.c }); beat(w, 3, `${s.name} has turned`, [s.id], opts, choice.thought, deed?.text); }
    if (out.self?.partner) { beat(w, 2, `${s.name} marries ${tg?.name ?? "someone"}`, [s.id, tg?.id ?? ""].filter(Boolean), opts); act(w, { c: s.id, kind: "marry", ...(tg ? { target: tg.id } : {}), text: "marries" }); }
    if (out.self?.children) { w.stats.births++; if (s.named) beat(w, 2, `A child is born to ${s.name}`, [s.id], opts); act(w, { c: s.id, kind: "birth", text: "a child is born" }); }
    if (out.self?.sick === false && wasSick === false) {} if (out.self?.sick === false && wasSick) act(w, { c: s.id, kind: "well", text: "recovers" });
    if (out.self?.sick === true && !wasSick) act(w, { c: s.id, kind: "sick", text: "has caught the sickness" });
    if (deed && (deed.harm >= 0.5 || deed.help >= 0.5)) beat(w, deed.harm >= 0.7 || deed.help >= 0.7 ? 3 : 2, `${s.name} ${deed.text}`, [s.id, ...(tg ? [tg.id] : [])], opts, choice.thought, `${sit.text} — chose: ${opt.label}`);
    else if (deed && (s.named || tg?.named)) beat(w, 2, `${s.name} ${deed.text}`, [s.id, ...(tg ? [tg.id] : [])], opts, choice.thought, `${sit.text} — chose: ${opt.label}`);
    if (out.leave) { s.left = true; s.leftAt = t; w.stats.left++; act(w, { c: s.id, kind: "leave", text: "leaves for good" }); beat(w, 2, `${s.name} leaves for good`, [s.id], opts, choice.thought); s.journey.push({ tick: t, label: tickLabel(sc, t), situation: "", option: "", outcome: "left the valley", kind: "life" }); }
    if (out.die) die(w, s, out.die, opts, moment);
    if (out.targetDie && tg) die(w, tg, out.targetDie, opts, moment);
    if (hadHome && !s.home) act(w, { c: s.id, kind: "homeless", text: "has lost the roof", by: moment.c });
    if (tg && tgHadHome && !tg.home) act(w, { c: tg.id, kind: "homeless", text: "has lost the roof", by: s.id });
    if (!hadHome && s.home) act(w, { c: s.id, kind: "housed", text: "has a roof again", ...(tg ? { target: tg.id } : {}) });
  }
  // what the season did to each of them, beyond the choice
  for (const s of w.souls) { const b = before.get(s.id); if (b) between(w, s, b); }
  // frame + population
  const at = w.souls.map((s) => !s.alive || s.left ? null : (seasonIdx < 3 && s.job ? sc.jobs.find((j) => j.id === s.job)?.at ?? s.home : s.home) ?? sc.locations[0].id);
  const status = (s: Soul) => !s.alive ? "dead" : s.left ? "gone" : s.food < 0.12 || s.sick || !s.home ? "struggling" : s.money > 0.5 ? "thriving" : "getting by";
  // per-person flags for the scene: 1 starving, 2 sick, 4 roofless, 8 rich, 16 poor, 32 known for harm, 64 known for help
  const flagsOf = (s: Soul) => (s.food < 0.12 ? 1 : 0) | (s.sick ? 2 : 0) | (!s.home ? 4 : 0) | (s.money > 1.2 ? 8 : 0) | (s.money < 0.15 ? 16 : 0) | (reputation(s).harm >= 0.5 && reputation(s).harm >= reputation(s).help ? 32 : 0) | (reputation(s).help >= 0.5 && reputation(s).help > reputation(s).harm ? 64 : 0) | (s.health < 0.25 ? 128 : 0);
  w.frames.push({ hour: t, at, lean: w.souls.map((s) => status(s)), committed: w.souls.map((s) => reputation(s).harm >= 0.5), flags: w.souls.map(flagsOf), evening: w.souls.map((s) => s.evening), vitals: w.souls.map((s) => [Math.round(s.health * 100) / 100, Math.round(s.food * 100) / 100, Math.round(s.money * 100) / 100, Math.round((s.mood ?? 0) * 100) / 100]), conscience: w.souls.map((s) => Math.round(s.conscience * 100) / 100), ties: w.souls.map((s) => Object.fromEntries(Object.entries(s.ties).filter(([, v]) => Math.abs(v.affinity) >= 0.25).map(([k, v]) => [k, Math.round(v.affinity * 100) / 100]))), partner: w.souls.map((s) => s.partner), lines: [] });
  const alive = w.souls.filter((s) => s.alive && !s.left);
  w.population.push({ tick: t, alive: alive.length, dead: w.souls.filter((s) => !s.alive).length, left: w.souls.filter((s) => s.left).length, sick: alive.filter((s) => s.sick).length, starving: alive.filter((s) => s.food < 0.12).length, homeless: alive.filter((s) => !s.home).length, supply: Math.round(w.supply * 100) / 100, price: Math.round(0.4 * (1.3 - w.supply) * (famine ? 2 : 1) * 100) / 100, low: alive.filter((s) => (s.mood ?? 0) <= -0.25).length });
}

export async function runChronicle(sc: ChronicleScenario, seed: number, opts: { brain?: ChronicleBrain; onBeat?: (b: Beat) => void } = {}): Promise<Chronicle> {
  const w = createChronicle(sc, seed);
  const brain = opts.brain ?? mockChronicleBrain;
  for (w.tick = 1; w.tick <= w.ticks; w.tick++) await season(w, brain, opts);
  return w;
}

/** One season at a time, for a world that runs live: returns false when the years are over. */
export async function stepChronicle(w: Chronicle, opts: { brain?: ChronicleBrain; onBeat?: (b: Beat) => void } = {}): Promise<boolean> {
  if (w.tick >= w.ticks) return false;
  w.tick++;
  await season(w, opts.brain ?? mockChronicleBrain, opts);
  return true;
}
