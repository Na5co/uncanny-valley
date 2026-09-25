// The archive is the product: a finished world frozen into files a stranger can read, share, and fork.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { World, Citizen, Beat } from "./engine/state.ts";
import { topTies } from "./engine/state.ts";
import { phaseAt } from "./engine/pressure.ts";
import type { Scenario } from "./types.ts";
import { expandCast } from "./scenario.ts";

export interface ThreadRecord { a: string; b: string; aName: string; bName: string; start: number; end: number; startWord: string; endWord: string; why: string; delta: number }
export interface Edition { hour: number; headlines: string[]; body: string; quote: { who: string; text: string } | null }
export interface CitizenRecord {
  id: string; name: string; role: string; age: number; want: string; fear: string; traits: Record<string, number>;
  lean0: string | null; finalChoice: string; committedAt: number | null; leanChanges: number; leanedAt: number | null;
  topTie: { name: string; affinity: number; why: string } | null;
  means: number; mood: number; beliefs: Record<string, number>;
  diary: { hour: number; text: string; level: number; because?: string; said?: string }[];
  leanTimeline: { hour: number; lean: string | null; because?: string }[];
  named: boolean;
  routine?: { hour: number; text: string }[]; // named citizens only: ordinary hours, for the feed's quiet moments
}
export interface Record_ {
  runId: string; scenarioId: string; title: string; premise: string; seed: number; brain: string; hours: number;
  ending: { prompt: string; choices: { id: string; label: string }[] };
  outcome: Record<string, number>;
  events: { id: string; at: number; fired: boolean; skipped: boolean; reached: number; headline: string; stakes: number; where: string; fx?: string; fxHours?: number }[];
  beats: Beat[];
  leanHistory: World["leanHistory"];
  phases: { hour: number; name: string }[];
  threads: ThreadRecord[];
  citizens: CitizenRecord[];
  editions: Edition[];
  watchFor: { hour: number; hint: string }[];
  stats: World["stats"] & { fallbackRate: number };
  hourHashes: string[];
  frames: World["frames"];
  map: { locations: { id: string; name: string; tags: string[]; x?: number; y?: number }[]; paths: [string, string][] };
  scenario: Scenario; // the exact scenario this world ran (variants and swaps included), so it can be forked
  engine: import("./llm/engine.ts").DecisionEngine | null; // the decision engine it ran with, if any — forks must use the same one
  parent?: { runId: string; change: string; firstDivergence: number | null; lineage?: string[] };
}

function leanIdFromText(w: World, text: string): string | null {
  const m = /(?:now leaning|now) (.+)$/.exec(text); if (!m) return null;
  return w.scenario.ending.choices.find((c) => c.label === m[1])?.id ?? null;
}
const affinityWord = (a: number) => a > 0.6 ? "close" : a > 0.3 ? "friendly" : a > -0.3 ? "neutral" : a > -0.6 ? "strained" : "hostile";
const labelOf = (w: World, id: string | null) => id ? w.scenario.ending.choices.find((c) => c.id === id)?.label ?? id : "undecided";

export function runId(w: World, brain: string) { return `${w.scenario.id}-s${w.seed}-${brain}`; }

export function buildRecord(w: World, brain: string): Record_ {
  const s = w.scenario;
  const outcome: Record<string, number> = Object.fromEntries(s.ending.choices.map((c) => [c.id, 0]));
  for (const c of w.citizens) outcome[c.finalChoice!]++;

  // threads: derived from the recorded tie beats (all levels), so Threads/Breaks can never say something the record does not.
  const threads: ThreadRecord[] = [];
  const byPair = new Map<string, { a: Citizen; b: Citizen; beats: Beat[] }>();
  for (const b of w.beats) {
    const m = /^(.+?) ↔ (.+?): (\w+) → (\w+)/.exec(b.headline); if (!m || !b.who || b.who.length < 2) continue;
    const key = [...b.who].sort().join("|");
    const e = byPair.get(key) ?? { a: w.byId.get(b.who[0])!, b: w.byId.get(b.who[1])!, beats: [] };
    e.beats.push(b); byPair.set(key, e);
  }
  const WORD_VAL: Record<string, number> = { hostile: -0.75, strained: -0.45, neutral: 0, friendly: 0.45, close: 0.75 };
  for (const { a, b, beats } of byPair.values()) {
    const first = /: (\w+) → /.exec(beats[0].headline)![1], last = /→ (\w+)/.exec(beats[beats.length - 1].headline)![1];
    const ta = a.ties[b.id]?.affinity ?? 0, tb = b.ties[a.id]?.affinity ?? 0;
    const lastWithWhy = [...beats].reverse().find((x) => x.because);
    threads.push({ a: a.id, b: b.id, aName: a.seed.name, bName: b.seed.name, start: WORD_VAL[first], end: (ta + tb) / 2, startWord: first, endWord: last, why: lastWithWhy?.because ?? a.ties[b.id]?.why ?? b.ties[a.id]?.why ?? "", delta: WORD_VAL[last] - WORD_VAL[first] });
  }
  threads.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const citizens: CitizenRecord[] = w.citizens.map((c) => {
    const tt = topTies(c, 1)[0]; const ttId = Object.entries(c.ties).find(([, t]) => t === tt)?.[0];
    const commitMem = c.memories.find((m) => m.text.startsWith("decided:"));
    return {
      id: c.id, name: c.seed.name, role: c.seed.role, age: c.seed.age, want: c.seed.want, fear: c.seed.fear, traits: c.seed.traits,
      lean0: c.seed.lean, finalChoice: c.finalChoice!, committedAt: c.committed ? commitMem?.hour ?? null : null,
      leanChanges: c.memories.filter((m, i, arr) => /now leaning|wavered/.test(m.text) && (c.seed.lean !== null || arr.slice(0, i).some((p) => /now leaning/.test(p.text)))).length,
      leanedAt: c.seed.lean !== null ? 0 : c.memories.find((m) => /now leaning/.test(m.text))?.hour ?? null,
      topTie: tt && ttId ? { name: w.byId.get(ttId)!.seed.name, affinity: tt.affinity, why: tt.why } : null,
      means: c.means, mood: c.mood, beliefs: c.beliefs,
      diary: c.memories.filter((m) => m.level >= 2 || m.because || m.said).map((m) => ({ hour: m.hour, text: m.text, level: m.level, ...(m.because ? { because: m.because } : {}), ...(m.said ? { said: m.said } : {}) })),
      leanTimeline: [{ hour: 0, lean: c.seed.lean }, ...c.memories.filter((m) => /now leaning|wavered/.test(m.text)).map((m) => ({ hour: m.hour, lean: leanIdFromText(w, m.text), ...(m.because ? { because: m.because } : {}) }))],
      named: w.named.has(c.id),
      ...(w.named.has(c.id) ? { routine: c.memories.filter((m) => m.level === 1 && /^(worked|went to|talked with)/.test(m.text)).map((m) => ({ hour: m.hour, text: m.text.replace(/^worked$/, "works").replace(/^rested$/, "rests").replace(/^waited$/, "waits and watches").replace(/^went to/, "goes to").replace(/^talked with/, "talks with") })) } : {}),
    };
  });

  const phases = [] as { hour: number; name: string }[];
  for (let h = 0; h <= s.clock.hours; h++) { const n = phaseAt(h, s.clock.hours, w.curve).name; if (!phases.length || phases[phases.length - 1].name !== n) phases.push({ hour: h, name: n }); }

  const editions = [24, 48, 72].filter((h) => h <= s.clock.hours).map((h) => mockEdition(w, h));
  const watchFor = tripwires(w);

  return {
    runId: runId(w, brain), scenarioId: s.id, title: s.title, premise: s.premise, seed: w.seed, brain, hours: s.clock.hours,
    ending: { prompt: s.ending.prompt, choices: s.ending.choices.map((c) => ({ id: c.id, label: c.label })) },
    outcome,
    events: w.schedule.map((e) => ({ id: e.event.id, at: e.at, fired: e.fired, skipped: e.skipped, reached: e.reached, headline: e.event.headline, stakes: e.event.stakes, where: e.event.where, ...(e.event.fx ? { fx: e.event.fx, fxHours: e.event.fxHours ?? 3 } : {}) })),
    beats: w.beats, leanHistory: w.leanHistory, phases, threads, citizens, editions, watchFor,
    stats: { ...w.stats, fallbackRate: w.stats.decisions ? w.stats.fallbacks / w.stats.decisions : 0 },
    hourHashes: w.hourHashes,
    frames: w.frames,
    map: { locations: s.locations.map((l) => ({ id: l.id, name: l.name, tags: l.tags, ...((l as any).x !== undefined ? { x: (l as any).x, y: (l as any).y } : {}) })), paths: s.paths },
    // the concrete cast this world actually had (generated citizens included, absentees dropped), so a fork keeps the same people
    scenario: { ...s, citizens: expandCast(s, w.seed).filter((c) => !c.absent).map((c) => ({ ...c, absent: undefined })), fill: undefined },
    engine: w.engine ?? null,
  };
}

/** The mock editor: three headlines from the day's turning points, a paragraph from the numbers, one quote. The Flash editor replaces this. */
function mockEdition(w: World, hour: number): Edition {
  const day = w.beats.filter((b) => b.hour > hour - 24 && b.hour <= hour && b.level >= 2);
  const turning = day.filter((b) => b.level === 3);
  const pick = [...turning.filter((b) => !b.who?.length || b.who.length > 3), ...turning, ...day].filter((b, i, a) => a.indexOf(b) === i);
  const headlines = pick.slice(0, 3).map((b) => b.headline.replace(/ \(.*present\)$/, ""));
  const t0 = w.leanHistory.find((l) => l.hour === Math.max(0, hour - 24))?.tally ?? {}, t1 = w.leanHistory.find((l) => l.hour === hour)?.tally ?? {};
  const moves = w.scenario.ending.choices.map((c) => `${c.label}: ${t0[c.id] ?? 0} → ${t1[c.id] ?? 0}`).join("; ");
  const inDay = (m: { hour: number }) => m.hour > hour - 24 && m.hour <= hour;
  const madeUp = w.citizens.filter((c) => c.memories.some((m) => inDay(m) && /now leaning/.test(m.text) && !/wavered/.test(m.text) && !c.memories.some((p) => p.hour < m.hour && /now leaning|wavered/.test(p.text)) && c.seed.lean === null)).length;
  const changed = w.citizens.reduce((n, c) => n + c.memories.filter((m) => inDay(m) && /wavered|now leaning/.test(m.text) && (c.seed.lean !== null || c.memories.some((p) => p.hour < m.hour && /now leaning/.test(p.text)))).length, 0);
  const commits = day.filter((b) => b.headline.includes("commits")).length;
  const worst = day.filter((b) => / → (strained|hostile)/.test(b.headline))[0];
  const committedSoFar = w.citizens.filter((c) => c.memories.some((m) => m.text.startsWith("decided:") && m.hour <= hour)).length;
  const lead = pick[0];
  const leadLine = lead ? `${lead.headline.replace(/ \(.*present\)$/, "").replace(/\.$/, "")}${lead.because ? ` — ${lead.because}` : ""}.` : "A quiet day.";
  const worstLine = worst && worst !== lead ? ` ${worst.headline.replace(/ \(.*\)$/, "")}${worst.because ? ` — ${worst.because}` : ""}.` : "";
  const body = `${hour === w.scenario.clock.hours ? "Final edition." : `Day ${hour / 24}.`} ${leadLine} The room now stands ${moves}. ${madeUp} made up their minds today and ${changed} changed them; ${commits} committed, ${committedSoFar} in all.${worstLine}`;
  const q = day.find((b) => b.thought && b.who?.length);
  const quote = q ? { who: w.byId.get(q.who![0])!.seed.name, text: q.thought! } : null;
  return { hour, headlines, body, quote };
}

/** Generic tripwires until the Architect supplies scenario-specific ones (docs/BRAINS.md §1b). */
function tripwires(w: World): { hour: number; hint: string }[] {
  const out: { hour: number; hint: string }[] = [];
  const opp = new Set<string>();
  for (const c of w.citizens) for (const [oid, t] of Object.entries(c.ties)) {
    const o = w.byId.get(oid)!; const key = [c.id, oid].sort().join("|");
    if (t.affinity > 0.5 && c.finalChoice && o.finalChoice && c.finalChoice !== o.finalChoice && !opp.has(key)) { opp.add(key); out.push({ hour: w.scenario.clock.hours, hint: `${c.seed.name} (${labelOf(w, c.finalChoice)}) and ${o.seed.name} (${labelOf(w, o.finalChoice)}) are close and chose differently` }); }
  }
  return out.slice(0, 6);
}

/** The same selections record.md makes, for any renderer. */
export function selectArcs(r: Record_) {
  const flips = (c: CitizenRecord) => c.leanTimeline.filter((l, i) => i > 0 && c.leanTimeline[i - 1].lean && l.lean !== c.leanTimeline[i - 1].lean).length;
  return [...r.citizens].filter((c) => c.leanTimeline.length > 1).sort((a, b) => (flips(b) - flips(a)) || (Number(b.named) - Number(a.named)) || (b.leanTimeline.length - a.leanTimeline.length)).slice(0, 3);
}
export function selectBreaks(r: Record_) {
  const named = (id: string) => r.citizens.find((c) => c.id === id)?.named ?? false;
  return r.threads.filter((t) => t.endWord === "hostile" || t.delta <= -0.6).sort((a, b) => (Number(named(b.a) || named(b.b)) - Number(named(a.a) || named(a.b))) || a.delta - b.delta).slice(0, 3);
}
export function selectThreads(r: Record_) {
  return [...r.threads].filter((t) => t.startWord !== t.endWord).sort((a, b) => (a.delta < 0 && b.delta >= 0 ? -1 : a.delta >= 0 && b.delta < 0 ? 1 : Math.abs(b.delta) - Math.abs(a.delta))).slice(0, 10);
}
/** Why each citizen ended where they did: the cause on their commit, else on their last change of mind. */
export function finalReason(c: CitizenRecord): string | undefined {
  return c.diary.find((d) => d.text.startsWith("decided:"))?.because ?? [...c.leanTimeline].reverse().find((l) => l.because)?.because;
}

export function renderMarkdown(r: Record_): string {
  const L: string[] = [];
  const lbl = (id: string | null) => id ? r.ending.choices.find((c) => c.id === id)?.label ?? id : "undecided";
  const first = (n: string) => { const p = n.split(" "); return p[0].endsWith(".") && p[1] ? `${p[0]} ${p[1]}` : p[0]; };
  const total = Object.values(r.outcome).reduce((a, b) => a + b, 0);
  const fin = r.editions[r.editions.length - 1];
  const beats = r.beats.filter((b) => b.level >= 2);
  L.push(`# ${r.title} — seed ${r.seed}`, "", `*${r.premise}*`, "", `Run \`${r.runId}\` · ${total} citizens · ${r.hours} hours · brain: ${r.brain} · fallback rate ${(r.stats.fallbackRate * 100).toFixed(1)} %`, "");
  L.push(`## ${r.ending.prompt}`, "");
  for (const c of r.ending.choices) L.push(`- **${c.label}** — ${r.outcome[c.id]} (${Math.round((r.outcome[c.id] / total) * 100)} %)`);
  L.push("");

  // Arcs: the people whose minds moved most, with the chain of reasons. Named citizens first.
  const arcs = selectArcs(r);
  if (arcs.length) {
    L.push(`## Three arcs`, "");
    for (const c of arcs) {
      const chain = c.leanTimeline.map((l, i) => i === 0 ? `started ${lbl(l.lean)}` : `h${l.hour} → ${lbl(l.lean)}${l.because ? ` (${l.because})` : ""}`).join("; ");
      const commit = c.diary.find((d) => d.text.startsWith("decided:"));
      L.push(`- **${c.name}**, ${c.role}: ${chain}${commit ? `; committed h${commit.hour}${commit.because ? ` — ${commit.because}` : ""}` : "; never committed"}. Ended **${lbl(c.finalChoice)}**.`);
    }
    L.push("");
  }
  // Breaks: the relationships that fell furthest, and why.
  const breaks = selectBreaks(r);
  if (breaks.length) { L.push(`## Breaks`, "", ...breaks.map((t) => `- **${t.aName} ↔ ${t.bName}**: ${t.startWord} → ${t.endWord} — ${t.why}`), ""); }
  if (fin) { L.push(`## Final edition`, "", ...fin.headlines.map((h) => `**${h}**`), "", fin.body, ""); if (fin.quote) L.push(`> "${fin.quote.text}" — ${fin.quote.who}`, ""); }
  if (r.watchFor.length) L.push(`## Close, and chose differently`, "", ...r.watchFor.map((t) => `- ${t.hint}`), "");

  L.push(`## The record`, "", `Turning points (•••), notable moments (••), and the hours people quietly made up their minds (·). Routine drift between minor characters is in \`record.json\` (level 1).`, "");
  let lastPhase = "";
  const minorLeans = r.beats.filter((b) => b.level === 1 && / now leans /.test(b.headline));
  const rollup = new Map<number, string[]>();
  for (const b of minorLeans) { const m = /^(.+?) \((.+?)\) now leans (.+)$/.exec(b.headline); if (m) (rollup.get(b.hour) ?? rollup.set(b.hour, []).get(b.hour)!).push(`${m[1]} (${m[3]})`); }
  const lines = [...beats.map((b) => ({ hour: b.hour, sort: 1, text: `- h${String(b.hour).padStart(2, "0")} ${"•".repeat(b.level)} ${b.headline}${b.because ? ` — because ${b.because}` : ""}${b.thought ? ` — *"${b.thought}"*` : ""}` })),
    ...[...rollup.entries()].map(([hour, who]) => ({ hour, sort: 0, text: `- h${String(hour).padStart(2, "0")} ·  ${who.length} make up their minds: ${who.join(", ")}` }))].sort((x, y) => x.hour - y.hour || x.sort - y.sort);
  for (const l of lines) {
    const ph = [...r.phases].reverse().find((p) => p.hour <= l.hour)!.name;
    if (ph !== lastPhase) { L.push("", `### ${ph} (from hour ${r.phases.find((p) => p.name === ph)!.hour})`, ""); lastPhase = ph; }
    L.push(l.text);
  }
  L.push("");
  L.push(`## How the room moved`, "", `| hour | ${r.ending.choices.map((c) => c.label).join(" | ")} | undecided |`, `|---|${r.ending.choices.map(() => "---").join("|")}|---|`);
  for (const l of r.leanHistory.filter((l) => l.hour % 6 === 0)) L.push(`| ${l.hour} | ${r.ending.choices.map((c) => l.tally[c.id] ?? 0).join(" | ")} | ${l.tally.undecided ?? 0} |`);
  L.push("");
  L.push(`## Threads`, "", `Relationships that moved most, falling first.`, "");
  const th = selectThreads(r);
  for (const t of th) L.push(`- **${t.aName} ↔ ${t.bName}**: ${t.startWord} → ${t.endWord} (${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(2)}) — ${t.why}`);
  L.push("");
  L.push(`## Citizens`, "", `| name | role | hour 0 | leaned at | changed mind | committed | final | closest to |`, `|---|---|---|---|---|---|---|---|`);
  for (const c of r.citizens) L.push(`| ${c.name} | ${c.role} | ${lbl(c.lean0)} | ${c.leanedAt === null ? "never" : c.leanedAt === 0 ? "start" : `h${c.leanedAt}`} | ${c.leanChanges || "—"} | ${c.committedAt !== null ? `h${c.committedAt}` : "never"} | **${lbl(c.finalChoice)}** | ${c.topTie ? `${c.topTie.name} (${affinityWord(c.topTie.affinity)})` : "—"} |`);
  L.push("");
  L.push(`## Editions`, "");
  for (const e of r.editions.filter((e) => e !== fin)) { L.push(`### Hour ${e.hour}`, "", ...e.headlines.map((h) => `- ${h}`), "", e.body, ""); if (e.quote) L.push(`> "${e.quote.text}" — ${e.quote.who}`, ""); }
  L.push(`(The final edition is on the cover.)`, "");
  L.push(`## Events`, "", `| event | planned | fired | reached |`, `|---|---|---|---|`);
  for (const e of r.events) L.push(`| ${e.headline} | h${e.at} | ${e.skipped ? "skipped (seed)" : "yes"} | ${e.fired ? e.reached : "—"} |`);
  L.push("", `Diaries: \`diaries.md\` in this folder.`, "", `---`, `Stats: ${r.stats.decisions} decisions · ${r.stats.firstLeans} made up their minds · ${r.stats.leanFlips} changed them · ${r.stats.wavers} wavers · ${r.stats.commits} commits · ${r.stats.tieSignFlips} ally↔enemy flips · ${beats.length} beats`, "");
  return L.join("\n");
}

export function renderDiaries(r: Record_): string {
  const L: string[] = [];
  const lbl = (id: string | null) => id ? r.ending.choices.find((c) => c.id === id)?.label ?? id : "undecided";
  const first = (n: string) => { const p = n.split(" "); return p[0].endsWith(".") && p[1] ? `${p[0]} ${p[1]}` : p[0]; };
  L.push(`# ${r.title} — seed ${r.seed} — diaries (unsealed)`, "", `What each citizen remembered as mattering, and why they moved when they moved.`, "");
  for (const c of r.citizens) {
    L.push(`## ${c.name}, ${c.age}, ${c.role}`, "", `Wants ${c.want}. Fears ${c.fear}. Started ${lbl(c.lean0)}, ended **${lbl(c.finalChoice)}**${c.topTie ? `; closest to ${first(c.topTie.name)} — ${c.topTie.why}` : ""}.`, "");
    for (const d of c.diary) L.push(`- h${String(d.hour).padStart(2, "0")} ${d.text}${d.because ? ` — because ${d.because}` : ""}${d.said ? ` — ${/^(you said|[A-Z][^:]*): "/.test(d.said) ? d.said : `"${d.said}"`}` : ""}`);
    L.push("");
  }
  return L.join("\n");
}

export function writeArchive(w: World, brain: string, calls: object[] = [], root = "archive", opts: { runId?: string; parent?: Record_["parent"]; editions?: Edition[]; brainLabel?: string } = {}): { dir: string; record: Record_ } {
  const record = buildRecord(w, brain);
  if (opts.brainLabel) record.brain = opts.brainLabel; // e.g. "flash (mock from h30: cap)" — the run id stays typeable
  if (opts.editions?.length) record.editions = opts.editions;
  if (opts.runId) record.runId = opts.runId;
  if (opts.parent) record.parent = opts.parent;
  const dir = join(root, record.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "record.json"), JSON.stringify(record, null, 1));
  writeFileSync(join(dir, "record.md"), renderMarkdown(record));
  writeFileSync(join(dir, "diaries.md"), renderDiaries(record));
  writeFileSync(join(dir, "calls.jsonl"), calls.map((c) => JSON.stringify(c)).join("\n") + (calls.length ? "\n" : ""));
  return { dir, record };
}
