// A chronicle's archive: verdicts, journeys, the population over time, the deeds ledger — and a record.json the viewer's map/3D understand.
import { sexOf } from "../../web/pronoun.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Chronicle, Soul } from "./sim.ts";
import { reputation, tickLabel, shortName } from "./sim.ts";

export const STATUSES = [{ id: "thriving", label: "Thriving" }, { id: "getting by", label: "Getting by" }, { id: "struggling", label: "Struggling" }, { id: "dead", label: "Dead" }, { id: "gone", label: "Gone" }];

export interface Verdict { title: string; who: string[]; text: string }

export function verdicts(w: Chronicle): Verdict[] {
  const out: Verdict[] = [];
  const alive = w.souls.filter((s) => s.alive && !s.left), dead = w.souls.filter((s) => !s.alive);
  const harm = (s: Soul) => s.deeds.reduce((a, d) => a + d.harm, 0), help = (s: Soul) => s.deeds.reduce((a, d) => a + d.help, 0);
  const worst = [...w.souls].sort((a, b) => harm(b) - harm(a))[0];
  if (worst && harm(worst) > 0.5) out.push({ title: "The most harm", who: [worst.id], text: `${worst.name} (${worst.role}) — ${worst.deeds.filter((d) => d.harm >= 0.3).map((d) => `${tickLabel(w.scenario, d.tick)}: ${d.text}`).slice(0, 4).join("; ")}. ${worst.alive && !worst.left ? "Alive at the end." : worst.left ? "Left." : `Died of ${worst.cause}.`}` });
  const best = [...w.souls].sort((a, b) => help(b) - help(a))[0];
  if (best && help(best) > 0.5) out.push({ title: "The most help", who: [best.id], text: `${best.name} (${best.role}) — ${best.deeds.filter((d) => d.help >= 0.3).map((d) => `${tickLabel(w.scenario, d.tick)}: ${d.text}`).slice(0, 4).join("; ")}. ${best.alive && !best.left ? "Alive at the end." : best.left ? "Left." : `Died of ${best.cause}.`}` });
  const quiet = [...w.souls].filter((s) => s.deeds.length === 0 && s.journey.filter((j) => j.kind === "situation").length > 20).sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0))[0];
  if (quiet) out.push({ title: "The quietest life", who: [quiet.id], text: `${quiet.name} (${quiet.role}) went to work, came home, and never once did anything the town would remember. ${quiet.alive && !quiet.left ? "Alive at the end." : quiet.left ? "Left." : `Died of ${quiet.cause}, ${tickLabel(w.scenario, quiet.diedAt!)}.`}` });
  const first = dead.sort((a, b) => a.diedAt! - b.diedAt!)[0];
  if (first) out.push({ title: "The first death", who: [first.id], text: `${first.name} (${first.role}, ${Math.floor(first.age)}), ${tickLabel(w.scenario, first.diedAt!)}, of ${first.cause}.` });
  const byTick = new Map<number, Soul[]>(); for (const s of dead) (byTick.get(s.diedAt!) ?? byTick.set(s.diedAt!, []).get(s.diedAt!)!).push(s);
  const deadliest = [...byTick.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (deadliest && deadliest[1].length > 1) out.push({ title: "The deadliest season", who: deadliest[1].map((s) => s.id), text: `${tickLabel(w.scenario, deadliest[0])}: ${deadliest[1].map((s) => `${shortName(s.name)} (${s.cause})`).join(", ")}.` });
  const fatal = w.deeds.filter((d) => d.target && !w.byId.get(d.target)!.alive && w.byId.get(d.target)!.diedAt === d.tick && d.harm >= 0.6).sort((a, b) => b.harm - a.harm)[0];
  if (fatal) out.push({ title: "The betrayal that killed", who: [fatal.actor, fatal.target!], text: `${tickLabel(w.scenario, fatal.tick)}: ${w.byId.get(fatal.actor)!.name} ${fatal.text}.` });
  const sacrifice = w.deeds.filter((d) => d.kind === "sacrifice" || (d.kind === "rescue" && d.help >= 0.6)).map((d) => ({ d, s: w.byId.get(d.actor)! })).filter(({ s }) => !s.alive).sort((a, b) => b.d.help - a.d.help)[0];
  if (sacrifice) out.push({ title: "The sacrifice", who: [sacrifice.s.id], text: `${sacrifice.s.name} ${sacrifice.d.text} (${tickLabel(w.scenario, sacrifice.d.tick)}) and died of ${sacrifice.s.cause}, ${tickLabel(w.scenario, sacrifice.s.diedAt!)}.` });
  const mh = (xs: Soul[]) => xs.length ? xs.reduce((a, s) => a + harm(s), 0) / xs.length : 0, mhelp = (xs: Soul[]) => xs.length ? xs.reduce((a, s) => a + help(s), 0) / xs.length : 0;
  out.push({ title: "Survivors vs the dead", who: [], text: `${alive.length} alive, ${dead.length} dead, ${w.souls.filter((s) => s.left).length} gone. Mean harm done: survivors ${mh(alive).toFixed(2)}, dead ${mh(dead).toFixed(2)}. Mean help given: survivors ${mhelp(alive).toFixed(2)}, dead ${mhelp(dead).toFixed(2)}.` });
  return out;
}

export function buildChronicleRecord(w: Chronicle, brain: string) {
  const sc = w.scenario;
  const status = (s: Soul) => !s.alive ? "dead" : s.left ? "gone" : s.food < 0.12 || s.sick || !s.home ? "struggling" : s.money > 0.5 ? "thriving" : "getting by";
  const outcome: Record<string, number> = Object.fromEntries(STATUSES.map((x) => [x.id, 0])); for (const s of w.souls) outcome[status(s)]++;
  const leanHistory = w.frames.map((f) => { const t: Record<string, number> = Object.fromEntries(STATUSES.map((x) => [x.id, 0])); for (const l of f.lean) t[l ?? "dead"]++; t.undecided = 0; return { hour: f.hour, tally: t }; });
  leanHistory.unshift({ hour: 0, tally: leanHistory[0] ? { ...leanHistory[0].tally } : Object.fromEntries([...STATUSES.map((x) => [x.id, 0]), ["undecided", 0]]) }); // "the beginning" on the board: the town as it stood before the first season
  const phases: { hour: number; name: string }[] = [{ hour: 0, name: "peace" }];
  for (let t = 1; t <= w.ticks; t++) { const e = sc.epochs.find((e) => t >= e.at && t < e.at + e.seasons); const n = e ? e.kind : "peace"; if (phases[phases.length - 1].name !== n) phases.push({ hour: t, name: n }); }
  const citizens = w.souls.map((s) => ({ id: s.id, name: s.name, role: s.role, startRole: s.startRole ?? s.role, age: Math.floor(s.startAge), home: s.startHome, job: s.job, ties: Object.fromEntries(Object.entries(s.ties).map(([k, v]) => [k, Math.round(v.affinity * 100) / 100])), startPartner: s.startPartner, want: s.want, fear: s.fear, trait: s.trait, how: (s as any).how, sex: s.sex ?? sexOf(s), traits: s.traits, named: s.named, status: status(s), alive: s.alive, left: s.left, diedAt: s.diedAt, cause: s.cause, children: s.children, partner: s.partner, conscience: Math.round(s.conscience * 100) / 100, turnedAt: s.turnedAt, harm: reputation(s).harm + s.deeds.filter((d) => !d.witnessed && d.harm < 0.6).reduce((a, d) => a + d.harm, 0), help: reputation(s).help, deeds: s.deeds, suffered: s.suffered, journey: s.journey, committedAt: null, leanTimeline: [{ hour: 0, lean: status(s) }], leanedAt: 0, leanChanges: 0, topTie: null, diary: [], routine: [] as { hour: number; text: string }[] }));
  // the season's moments in the order they happened, with people as indexes
  const idx = new Map(w.souls.map((s, i) => [s.id, i]));
  const acts = w.acts.map((as) => as.map((a) => ({ ...a, c: idx.get(a.c)!, ...(a.target ? { target: idx.get(a.target) } : {}), ...(a.household ? { household: true } : {}), ...(a.kills ? { kills: a.kills.map((id) => idx.get(id)) } : {}), ...(a.by ? { by: idx.get(a.by) } : {}), ...(a.on ? { on: idx.get(a.on) } : {}), ...(a.game ? { game: { ...a.game, with: idx.get(a.game.with) } } : {}) })));
  return {
    acts,
    runId: `${sc.id}-s${w.seed}-${brain}`, scenarioId: sc.id, mode: "chronicle", title: sc.title, premise: sc.premise, seed: w.seed, brain, hours: w.ticks, tickLabels: Array.from({ length: w.ticks }, (_, i) => tickLabel(sc, i + 1)),
    ending: { prompt: `After ${sc.years} years`, choices: STATUSES }, outcome,
    events: sc.epochs.map((e) => ({ id: e.id, at: e.at, fired: true, skipped: false, reached: w.population[e.at - 1]?.alive ?? 0, headline: e.headline, stakes: e.severity, kind: e.kind, seasons: e.seasons, where: e.kind === "fire" || e.kind === "flood" ? (sc.locations.find((l) => l.tags.includes("home"))?.id ?? "all") : "all", ...(e.fx ? { fx: e.fx, fxHours: e.seasons } : {}) })),
    beats: w.beats, leanHistory, phases, threads: [] as unknown[], setups: (w as any).threads ?? [], citizens, editions: [] as unknown[], watchFor: [] as unknown[],
    stats: { ...w.stats, decisions: w.stats.situations, fallbackRate: w.stats.situations ? w.stats.fallbacks / w.stats.situations : 0, firstLeans: 0, leanFlips: 0, wavers: 0, commits: 0, tieSignFlips: 0 },
    frames: w.frames, musings: (w as any).musings ?? {}, turns: (w as any).turns ?? {}, map: { locations: sc.locations, paths: sc.paths }, population: w.population, deeds: w.deeds, verdicts: verdicts(w), scenario: sc, engine: null, hourHashes: [] as string[],
  };
}
export type ChronicleRecord = ReturnType<typeof buildChronicleRecord>;

export function renderChronicleMarkdown(r: ChronicleRecord): string {
  const L: string[] = [];
  const total = r.citizens.length;
  L.push(`# ${r.title} — seed ${r.seed}`, "", `*${r.premise}*`, "", `Run \`${r.runId}\` · ${total} people · ${r.scenario.years} years · brain: ${r.brain}`, "");
  L.push(`## ${r.ending.prompt}`, "", ...STATUSES.map((s) => `- **${s.label}** — ${r.outcome[s.id]} (${Math.round((r.outcome[s.id] / total) * 100)} %)`), "");
  L.push(`## Verdicts`, "", ...r.verdicts.map((v) => `- **${v.title}.** ${v.text}`), "");
  L.push(`## The years`, "", `| year | alive | dead | gone | sick | starving | homeless |`, `|---|---|---|---|---|---|---|`);
  for (const p of r.population.filter((p) => p.tick % 4 === 0)) L.push(`| ${r.tickLabels[p.tick - 1].replace(", winter", "")} | ${p.alive} | ${p.dead} | ${p.left} | ${p.sick} | ${p.starving} | ${p.homeless} |`);
  L.push("", `## What happened`, "");
  for (const e of r.events) L.push(`- ${r.tickLabels[e.at - 1]} — **${e.headline}** (${e.reached} alive)`);
  L.push("", `## The ledger`, "", `The deeds the town remembers, worst first.`, "");
  for (const d of [...r.deeds].sort((a, b) => b.harm - a.harm).slice(0, 10)) L.push(`- ${r.tickLabels[d.tick - 1]}: ${r.citizens.find((c) => c.id === d.actor)!.name} ${d.text}${d.witnessed ? "" : " (nobody saw)"}`);
  L.push("", `…and the kindest.`, "");
  for (const d of [...r.deeds].sort((a, b) => b.help - a.help).slice(0, 10)) L.push(`- ${r.tickLabels[d.tick - 1]}: ${r.citizens.find((c) => c.id === d.actor)!.name} ${d.text}`);
  L.push("", `## People`, "", `| name | role | age | end | harm | help | children |`, `|---|---|---|---|---|---|---|`);
  for (const c of [...r.citizens].sort((a, b) => b.harm - a.harm)) L.push(`| ${c.name} | ${c.role} | ${c.age} | ${c.alive && !c.left ? c.status : c.left ? "gone" : `died of ${c.cause}, ${r.tickLabels[c.diedAt! - 1]}`} | ${c.harm.toFixed(1)} | ${c.help.toFixed(1)} | ${c.children} |`);
  L.push("", `Journeys: \`journeys.md\``, "");
  return L.join("\n");
}

export function renderJourneys(r: ChronicleRecord): string {
  const L: string[] = [`# ${r.title} — journeys (seed ${r.seed})`, "", `Every person, every season that mattered. *Italics* are the situation they were in; **bold** is what they chose; the rest is what came of it. ⚠ marks a deed the town remembers.`, ""];
  for (const c of [...r.citizens].sort((a, b) => Number(b.named) - Number(a.named) || b.harm + b.help - a.harm - a.help)) {
    L.push(`## ${c.name}, ${c.role} — ${c.alive && !c.left ? `alive, ${c.status}` : c.left ? "left" : `died of ${c.cause}, ${r.tickLabels[c.diedAt! - 1]}`}`, "", `Wanted ${c.want}. Feared ${c.fear}. Harm ${c.harm.toFixed(1)} · help ${c.help.toFixed(1)}${c.children ? ` · ${c.children} ${c.children === 1 ? "child" : "children"}` : ""}`, "");
    let year = "";
    for (const j of c.journey as any[]) {
      const [y, season] = j.label.split(", ");
      if (y !== year) { year = y; L.push(`**${y}**`); }
      const line = j.kind === "epoch" ? `*${j.outcome}*` : j.kind === "life" ? j.outcome : j.quiet ? `${j.outcome}` : `*${j.situation}* → **${j.option}** — ${j.outcome}`;
      L.push(`- ${season}: ${line}${j.deed ? ` ⚠ ${j.deed.kind}` : ""}${j.thought ? ` — “${j.thought}”` : ""}`);
    }
    L.push("");
  }
  return L.join("\n");
}

export function writeChronicleArchive(w: Chronicle, brain: string, root = "archive", calls: object[] = []) {
  const record = buildChronicleRecord(w, brain);
  const dir = join(root, record.runId); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "record.json"), JSON.stringify(record, null, 1));
  writeFileSync(join(dir, "record.md"), renderChronicleMarkdown(record));
  writeFileSync(join(dir, "journeys.md"), renderJourneys(record));
  writeFileSync(join(dir, "calls.jsonl"), calls.map((c) => JSON.stringify(c)).join("\n") + (calls.length ? "\n" : ""));
  return { dir, record };
}
