// Fork: the same world with one thing different, and a diff that says where and how the two timelines parted.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Record_ } from "./archive.ts";
import { writeArchive } from "./archive.ts";
import { runWorld } from "./engine/sim.ts";
import type { World } from "./engine/state.ts";
import { mockBrain } from "./brains/mock.ts";
import { loadCalls, type CallRecord } from "./brains/replay.ts";
import { makeBrain, callsFromLog } from "./brains/index.ts";
import { makeVariants } from "./vary.ts";
import { makeRng } from "./rng.ts";
import { TRAITS, type CitizenSeed, type Scenario, type TraitName } from "./types.ts";

export interface ForkOptions { seed?: number; vary?: string; swap?: string; brain?: "mock" | "flash" | "scripted" }

export function loadRecord(dirOrId: string): { dir: string; record: Record_ } {
  const dir = existsSync(dirOrId) ? dirOrId : `archive/${dirOrId}`;
  if (!existsSync(`${dir}/record.json`)) throw new Error(`no archive at ${dir}`);
  return { dir, record: JSON.parse(readFileSync(`${dir}/record.json`, "utf8")) };
}

/** Replace a named citizen with a freshly generated person in the same seat (same home; no seeded ties). */
function swapCitizen(s: Scenario, id: string, seed: number): { scenario: Scenario; change: string } {
  const sc: Scenario = JSON.parse(JSON.stringify(s));
  const i = sc.citizens.findIndex((c) => c.id === id); if (i < 0) throw new Error(`no named citizen "${id}" to swap (named: ${sc.citizens.map((c) => c.id).join(", ")})`);
  const old = sc.citizens[i];
  const rng = makeRng(seed).fork(`swap:${id}`);
  const names = ["Ansel", "Berit", "Corvin", "Dalia", "Eskil", "Freya", "Gunnar", "Halla", "Ivar", "Jutta", "Kolbein", "Linnea", "Magnus", "Nora", "Orm", "Petra", "Ragna", "Sigrun", "Torvald", "Ulla"];
  const first = names[rng.int(names.length)];
  const traits = Object.fromEntries(TRAITS.map((t) => [t, Math.round(rng.next() * 100) / 100])) as Record<TraitName, number>;
  const wants = ["to be left alone", "to be needed", "to see what happens next", "to keep what they have", "to be proven right", "to leave a mark"];
  const fears = ["being forgotten", "being wrong in public", "having nothing", "being the last one left", "being blamed"];
  const surnames = ["Vane", "Holm", "Aske", "Brand", "Kell", "Storr", "Wick", "Lind", "Marr", "Tove"];
  const fresh: CitizenSeed = { id, name: `${first} ${surnames[rng.int(surnames.length)]}`, age: 18 + rng.int(50), role: old.role, want: wants[rng.int(wants.length)], fear: fears[rng.int(fears.length)], traits, home: old.home, lean: null, ties: [] };
  sc.citizens[i] = fresh;
  for (const c of sc.citizens) c.ties = c.ties?.filter((t) => t.to !== id); // the old person's relationships go with them
  return { scenario: sc, change: `${old.name} (${old.role}) replaced by ${fresh.name}, a stranger who arrives with no ties — ${TRAITS.map((t) => `${t} ${fresh.traits[t]}`).join(", ")}; wants ${fresh.want}, fears ${fresh.fear}` };
}

export async function fork(parentDirOrId: string, opts: ForkOptions) {
  const { dir: parentDir, record: parent } = loadRecord(parentDirOrId);
  let scenario: Scenario = parent.scenario;
  const changes: string[] = [];
  if (opts.vary) { const vs = makeVariants(scenario, opts.vary); if (vs.length !== 1) throw new Error(`fork --vary takes one value (got ${vs.length}); run \`experiment\` for many`); scenario = vs[0].scenario; changes.push(vs[0].change); }
  if (opts.swap) { const r = swapCitizen(scenario, opts.swap, opts.seed ?? parent.seed); scenario = r.scenario; changes.push(r.change); }
  const seed = opts.seed ?? parent.seed;
  if (seed !== parent.seed) changes.push(`seed ${parent.seed} → ${seed}`);
  if (!changes.length) throw new Error("nothing to fork: give --seed N, --swap <citizen id>, or --vary <spec>=<value>");

  const made = makeBrain(opts.brain ?? (parent.brain as "mock" | "flash" | "scripted") ?? "mock", scenario.id, { parentCalls: loadCalls(parentDir), engine: parent.engine ?? null });
  const brain = made.brain; const log: CallRecord[] = made.calls;
  type Snap = Record<string, { location: string; lean: string | null; committed: boolean; means: number; mood: number; beliefs: Record<string, number>; ties: Record<string, number> }>;
  const snap = (world: World): Snap => Object.fromEntries(world.citizens.map((c) => [c.id, { location: c.location, lean: c.lean, committed: c.committed, means: c.means, mood: c.mood, beliefs: { ...c.beliefs }, ties: Object.fromEntries(Object.entries(c.ties).map(([k, v]) => [k, v.affinity])) }]));
  const childSnaps: Snap[] = [], parentSnaps: Snap[] = [];
  const w = await runWorld(scenario, seed, { brain, engine: made.engine, onHour: (world) => childSnaps.push(snap(world)) });
  // The parent is deterministic given its brain log, so re-running it (replaying every call, zero spend) gives its hour-by-hour state without storing it.
  const pmade = makeBrain((parent.brain as "mock" | "flash" | "scripted") ?? "mock", parent.scenario.id, { parentCalls: loadCalls(parentDir), engine: parent.engine ?? null });
  const pw = await runWorld(parent.scenario, parent.seed, { brain: pmade.brain, engine: pmade.engine, onHour: (world) => parentSnaps.push(snap(world)) });
  if (pw.hourHashes.join() !== parent.hourHashes.join()) throw new Error("parent could not be reproduced from its record (engine changed since it was written?) — re-run the parent first");
  // where did the timelines part? first hour whose fingerprint differs (hour 1 = index 0)
  let firstDivergence: number | null = null;
  for (let i = 0; i < Math.min(parent.hourHashes.length, w.hourHashes.length); i++) if (parent.hourHashes[i] !== w.hourHashes[i]) { firstDivergence = i + 1; break; }
  const whatSplit = firstDivergence === null ? [] : diffSnaps(parentSnaps[firstDivergence - 1], childSnaps[firstDivergence - 1], parent, w, parentSnaps[firstDivergence - 2], childSnaps[firstDivergence - 2], firstDivergence);
  const suffix = [opts.seed !== undefined && opts.seed !== parent.seed ? `s${opts.seed}` : "", opts.swap ? `swap-${opts.swap}` : "", opts.vary ? opts.vary.replace(/[^a-z0-9]+/gi, "_") : ""].filter(Boolean).join("-");
  const runId = `${parent.runId}--fork-${suffix}`;
  const { dir, record: child } = writeArchive(w, made.inner.name, callsFromLog(log), "archive", { runId, parent: { runId: parent.runId, change: changes.join("; "), firstDivergence, lineage: [...(parent.parent?.lineage ?? []), parent.runId] } });
  const md = renderForkDiff(parent, child, changes, firstDivergence, brain.hits ?? 0, brain.misses ?? 0, whatSplit);
  writeFileSync(join(dir, "fork.md"), md);
  return { dir, child, md, firstDivergence, hits: brain.hits ?? 0, misses: brain.misses ?? 0 };
}

/** The concrete differences between two hour-snapshots, most important first. */
function diffSnaps(a: Record<string, any>, b: Record<string, any>, p: Record_, w: World, prevA?: Record<string, any>, prevB?: Record<string, any>, hour?: number): string[] {
  const out: { w: number; text: string }[] = []; const seenPair = new Set<string>();
  const pname = (id: string) => p.citizens.find((c) => c.id === id)?.name ?? id, cname = (id: string) => w.byId.get(id)?.seed.name ?? id;
  const name = (id: string) => { const x = pname(id), y = cname(id); return x === y ? x : `${x} (${y} in the child)`; };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  // roll-ups: the same belief moving for many people is one line, not twenty
  const beliefMoves = new Map<string, { up: number; down: number }>();
  for (const id of Object.keys(a)) if (b[id]) for (const k of new Set([...Object.keys(a[id].beliefs), ...Object.keys(b[id].beliefs)])) { const d = r2(b[id].beliefs[k] ?? 0) - r2(a[id].beliefs[k] ?? 0); if (d) { const m = beliefMoves.get(k) ?? { up: 0, down: 0 }; if (d > 0) m.up++; else m.down++; beliefMoves.set(k, m); } }
  const rolled = new Set<string>();
  for (const [k, m] of beliefMoves) if (m.up + m.down >= 4) { rolled.add(k); out.push({ w: 9.5, text: `${m.up + m.down} people ${m.down > m.up ? "believe less" : "believe more"} that ${p.scenario.beliefs?.find((x) => x.id === k)?.text ?? k}${m.up && m.down ? ` (${m.up} more, ${m.down} less)` : ""}` }); }
  const lbl = (id: string | null) => id ? p.ending.choices.find((x) => x.id === id)?.label ?? id : "undecided";
  const bText = (id: string) => p.scenario.beliefs?.find((x) => x.id === id)?.text ?? id;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id], y = b[id];
    if (!x || !y) { out.push({ w: 10, text: `${name(id)} is ${!x ? "only in the child" : "only in the parent"}` }); continue; }
    if (x.lean !== y.lean) out.push({ w: 9, text: `${name(id)} leans ${lbl(x.lean)} → ${lbl(y.lean)}` });
    if (x.committed !== y.committed) out.push({ w: 8, text: `${name(id)} ${y.committed ? "has committed" : "has not committed"} (parent: ${x.committed ? "had" : "had not"})` });
    for (const k of new Set([...Object.keys(x.beliefs), ...Object.keys(y.beliefs)])) { if (rolled.has(k)) continue; const d = r2(y.beliefs[k] ?? 0) - r2(x.beliefs[k] ?? 0); if (d) out.push({ w: 7 + Math.abs(d), text: `${name(id)} ${d > 0 ? "believes more" : "believes less"} that ${bText(k)} (${r2(x.beliefs[k] ?? 0)} → ${r2(y.beliefs[k] ?? 0)})` }); }
    if (x.location !== y.location) out.push({ w: 3, text: `${name(id)} is at ${y.location} (parent: ${x.location})` });
    for (const k of new Set([...Object.keys(x.ties), ...Object.keys(y.ties)])) {
      if (seenPair.has([id, k].sort().join("|"))) continue; seenPair.add([id, k].sort().join("|"));
      const d = r2(y.ties[k] ?? 0) - r2(x.ties[k] ?? 0), back = r2(b[k]?.ties[id] ?? 0) - r2(a[k]?.ties[id] ?? 0);
      if (d || back) {
        // the mechanism: if both worlds had the same exchange this hour, say how differently it landed
        let mech = "";
        if (prevA && prevB && hour !== undefined) {
          const dP = r2(x.ties[k] ?? 0) - r2(prevA[id]?.ties[k] ?? 0), dC = r2(y.ties[k] ?? 0) - r2(prevB[id]?.ties[k] ?? 0);
          const talkedP = p.citizens.find((c) => c.id === id)?.diary.some((m) => m.hour === hour && new RegExp(`(talked with|confronted) ${pname(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(m.text));
          if (dP !== dC && (talkedP || Math.abs(dP) > 0 || Math.abs(dC) > 0)) mech = ` — this hour it moved ${dP >= 0 ? "+" : ""}${dP.toFixed(2)} in the parent and ${dC >= 0 ? "+" : ""}${dC.toFixed(2)} in the child`;
        }
        out.push({ w: 4 + Math.max(Math.abs(d), Math.abs(back)), text: `${name(id)} ↔ ${name(k)} tie ${r2(x.ties[k] ?? 0)} → ${r2(y.ties[k] ?? 0)} (and back ${r2(a[k]?.ties[id] ?? 0)} → ${r2(b[k]?.ties[id] ?? 0)})${mech}` });
      }
    }
    if (r2(x.mood) !== r2(y.mood)) out.push({ w: 2 + Math.abs(x.mood - y.mood), text: `${name(id)} mood ${r2(x.mood)} → ${r2(y.mood)}` });
    if (r2(x.means) !== r2(y.means)) out.push({ w: 1 + Math.abs(x.means - y.means), text: `${name(id)} means ${r2(x.means)} → ${r2(y.means)}` });
  }
  return out.sort((u, v) => v.w - u.w).map((o) => o.text);
}

export function renderForkDiff(p: Record_, c: Record_, changes: string[], firstDivergence: number | null, hits: number, misses: number, whatSplit: string[] = []): string {
  const L: string[] = [];
  const lbl = (r: Record_, id: string | null) => id ? r.ending.choices.find((x) => x.id === id)?.label ?? id : "undecided";
  const total = (r: Record_) => Object.values(r.outcome).reduce((a, b) => a + b, 0);
  L.push(`# Fork: ${p.title}`, "", `**Parent** \`${p.runId}\` → **child** \`${c.runId}\``, "", `Changed: ${changes.join("; ")}`, "");
  L.push(`## Where the timelines part`, "");
  if (firstDivergence === null) L.push(`They never do: the child is the same world hour for hour.`);
  else {
    L.push(firstDivergence === 1 ? `**From the first hour.**` : `**Hour ${firstDivergence}.** Up to hour ${firstDivergence - 1} the two worlds are identical.`, "");
    if (whatSplit.length) L.push(`What is different at hour ${firstDivergence} (${whatSplit.length} difference${whatSplit.length > 1 ? "s" : ""}; largest first):`, ...whatSplit.slice(0, 8).map((x) => `- ${x}`), ...(whatSplit.length > 8 ? [`- … and ${whatSplit.length - 8} more`] : []), "");
    // the first notable beats that exist in one world and not the other, from the split onward
    const key = (b: Record_["beats"][number]) => `${b.hour}|${b.headline}`;
    const pk = new Set(p.beats.map(key)), ck = new Set(c.beats.map(key));
    const onlyP = p.beats.filter((b) => b.level >= 2 && b.hour >= firstDivergence && !ck.has(key(b))).slice(0, 6);
    const onlyC = c.beats.filter((b) => b.level >= 2 && b.hour >= firstDivergence && !pk.has(key(b))).slice(0, 6);
    const fmt = (b: Record_["beats"][number]) => `- h${String(b.hour).padStart(2, "0")} ${"•".repeat(b.level)} ${b.headline}${b.because ? ` — because ${b.because}` : ""}`;
    L.push(`First notable moments only the parent has:`, ...(onlyP.length ? onlyP.map(fmt) : ["- (none)"]), "", `First notable moments only the child has:`, ...(onlyC.length ? onlyC.map(fmt) : ["- (none)"]), "");
  }
  L.push(`Brain calls: ${hits + misses === 0 ? "none — the mock brain is deterministic and free, so there is nothing to replay" : `${hits} replayed from the parent's log, ${misses} live`}.`, "");
  L.push(`## Ending`, "", `| choice | parent | child | Δ |`, `|---|---|---|---|`);
  for (const ch of p.ending.choices) { const a = p.outcome[ch.id] ?? 0, b = c.outcome[ch.id] ?? 0; L.push(`| ${ch.label} | ${a} (${Math.round((a / total(p)) * 100)} %) | ${b} (${Math.round((b / total(c)) * 100)} %) | ${b - a >= 0 ? "+" : ""}${b - a} |`); }
  L.push("");
  const byId = new Map(c.citizens.map((x) => [x.id, x]));
  const flipped = p.citizens.filter((x) => byId.has(x.id) && byId.get(x.id)!.finalChoice !== x.finalChoice);
  const gone = p.citizens.filter((x) => !byId.has(x.id)), added = c.citizens.filter((x) => !p.citizens.some((y) => y.id === x.id));
  L.push(`## Who ended differently (${flipped.length} of ${p.citizens.length})`, "");
  if (!flipped.length) L.push(`Nobody.`);
  const when = (z: Record_["citizens"][number]) => z.committedAt !== null ? `committed h${z.committedAt}` : z.leanedAt !== null ? `leaned h${z.leanedAt}, never committed` : "never leaned";
  for (const x of flipped) { const y = byId.get(x.id)!; const yc = y.diary.find((d) => d.text.startsWith("decided:")); const xc = x.diary.find((d) => d.text.startsWith("decided:")); L.push(`- **${x.name === y.name ? x.name : `${x.name} → ${y.name}`}** (${x.role}): ${lbl(p, x.finalChoice)} (${when(x)}${xc?.because ? `: ${xc.because}` : ""}) → **${lbl(c, y.finalChoice)}** (${when(y)}${yc?.because ? `: ${yc.because}` : ""})`); }
  if (gone.length || added.length) L.push("", ...gone.map((x) => `- ${x.name} is not in the child`), ...added.map((x) => `- ${x.name} (${x.role}) is new: ended ${lbl(c, x.finalChoice)}`));
  L.push("");
  const key = (t: Record_["threads"][number]) => [t.a, t.b].sort().join("|");
  const cThreads = new Map(c.threads.map((t) => [key(t), t]));
  const diverged = p.threads.filter((t) => cThreads.has(key(t)) && cThreads.get(key(t))!.endWord !== t.endWord).map((t) => ({ t, u: cThreads.get(key(t))! }));
  L.push(`## Threads that diverged (${diverged.length})`, "");
  if (!diverged.length) L.push(`None: every relationship ended at the same standing.`);
  for (const { t, u } of diverged.slice(0, 12)) { const pn = [t.aName, t.bName].sort(), cn = [u.aName, u.bName].sort(); L.push(`- **${pn.join(" ↔ ")}**${cn.join() !== pn.join() ? ` (child: ${cn.join(" ↔ ")})` : ""}: parent ${t.startWord} → ${t.endWord} (${t.why}); child ${u.startWord} → ${u.endWord} (${u.why})`); }
  L.push("");
  const ev = p.events.map((e) => { const f = c.events.find((x) => x.id === e.id); return { e, f }; }).filter(({ e, f }) => f && (e.fired !== f.fired || (e.fired && f.fired && e.at !== f.at)));
  L.push(`## Events that went differently (${ev.length})`, "");
  if (!ev.length) L.push(`None.`);
  for (const { e, f } of ev) { const planned = c.scenario.events.find((x) => x.id === e.id)?.at; L.push(`- ${e.headline.replace(/\.$/, "")}: parent ${e.skipped ? "skipped" : `h${e.at} (reached ${e.reached})`}; child ${f!.skipped ? "skipped" : `h${f!.at}${planned !== undefined && planned !== f!.at ? ` (planned h${planned}, jitter ${f!.at - planned >= 0 ? "+" : ""}${f!.at - planned})` : ""} (reached ${f!.reached})`}`); }
  L.push("", `## Tally, hour by hour`, "", `| hour | ${p.ending.choices.map((x) => `${x.label} (parent → child)`).join(" | ")} |`, `|---|${p.ending.choices.map(() => "---").join("|")}|`);
  for (const h of Array.from({ length: Math.floor(p.hours / 12) + 1 }, (_, i) => i * 12).filter((h) => h <= p.hours)) { const a = p.leanHistory.find((l) => l.hour === h)?.tally ?? {}, b = c.leanHistory.find((l) => l.hour === h)?.tally ?? {}; L.push(`| ${h} | ${p.ending.choices.map((x) => `${a[x.id] ?? 0} → ${b[x.id] ?? 0}`).join(" | ")} |`); }
  L.push("", `Child archive: \`${c.runId}/record.md\``, "");
  return L.join("\n");
}
