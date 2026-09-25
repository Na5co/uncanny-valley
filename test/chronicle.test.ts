import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChronicle, createChronicle, flags, situationsFor, tickLabel } from "../src/chronicle/sim.ts";
import { buildChronicleRecord, verdicts, renderChronicleMarkdown, renderJourneys, STATUSES } from "../src/chronicle/archive.ts";
import { LIBRARY } from "../src/chronicle/dilemmas.ts";
import { makeRng } from "../src/rng.ts";

const load = () => JSON.parse(readFileSync("scenarios/chronicle/the-valley.json", "utf8"));

test("chronicle: deterministic per seed, sixty seasons, deaths from more than one cause", async () => {
  const sc = load();
  const a = await runChronicle(sc, 5), b = await runChronicle(sc, 5);
  assert.equal(a.ticks, sc.years * 4);
  assert.deepEqual(a.population, b.population, "same seed, same years");
  assert.deepEqual(a.deeds.map((d) => d.text), b.deeds.map((d) => d.text));
  const c = await runChronicle(sc, 6);
  assert.notDeepEqual(a.deeds.map((d) => d.text), c.deeds.map((d) => d.text), "different seed, different lives");
  // across a few towns' years, people die in more than one way (any one run may be all fever)
  const causes = [...new Set([a, c, await runChronicle(sc, 7)].flatMap((x) => Object.keys(x.stats.deaths)))];
  assert.ok(causes.length >= 2, `varied causes of death, got ${causes.join(",")}`);
  const last = a.population.at(-1)!;
  assert.ok(last.alive > 0 && last.dead > 0, "some live, some die");
  assert.equal(last.alive + last.dead + last.left, a.souls.length);
});

test("chronicle: every soul has a journey that explains its end; the dead stop moving", async () => {
  const w = await runChronicle(load(), 5);
  for (const s of w.souls) {
    assert.ok(s.journey.length >= (s.alive && !s.left ? 4 : 2), `${s.name} has a journey`);
    if (!s.alive && !s.left) {
      const death = s.journey.find((j) => j.death);
      assert.ok(death && death.tick === s.diedAt, `${s.name}'s journey records the death`);
      for (const f of w.frames.slice(s.diedAt!)) assert.equal(f.at[w.souls.indexOf(s)], null, "no position after death");
    }
    for (const j of s.journey) assert.ok(!/\{\{|\}\}/.test(`${j.situation} ${j.outcome} ${j.option}`), `no raw template in ${j.situation}`);
  }
  assert.ok(w.deeds.some((d) => d.harm >= 0.5) && w.deeds.some((d) => d.help >= 0.5), "both sleazy and kind deeds happen");
});

test("chronicle: dilemmas target the situation — starving people are offered the wallet, the fed are not", () => {
  const sc = load(); const w = createChronicle(sc, 1); const r = makeRng(3);
  const s = w.souls[0];
  s.food = 0; s.health = 0.4; s.money = 0;
  assert.ok(flags(w, s).has("starving"));
  const ids = new Set(situationsFor(w, s, r).map((x) => x.spec.id));
  assert.ok(ids.has("wallet") && ids.has("beg"), `hunger situations offered: ${[...ids].join(",")}`);
  s.food = 1; s.health = 1; s.money = 5;
  const fed = new Set(situationsFor(w, s, r).map((x) => x.spec.id));
  assert.ok(!fed.has("wallet") && !fed.has("beg") && fed.size > 0, "the fed are not tempted by the wallet");
  for (const d of LIBRARY) { assert.ok(d.options.length >= (d.id === "child" ? 1 : 2), `${d.id} is a real choice`); for (const o of d.options) assert.ok(Math.abs(o.outcomes.reduce((a, x) => a + x.chance, 0) - 1) < 1e-6, `${d.id}/${o.id} outcome chances sum to 1`); }
  assert.equal(tickLabel(sc, 1), "Year 1, spring"); assert.equal(tickLabel(sc, 60), "Year 15, winter");
});

test("chronicle: record is viewer-compatible and the verdicts name real people", async () => {
  const w = await runChronicle(load(), 5);
  const r = buildChronicleRecord(w, "mock");
  assert.equal(r.mode, "chronicle"); assert.equal(r.hours, w.ticks); assert.equal(r.tickLabels.length, w.ticks);
  assert.deepEqual(r.ending.choices, STATUSES);
  assert.equal(r.acts.length, w.ticks); assert.ok(r.acts.flat().some((a: any) => a.kind === "death") && r.acts.flat().some((a: any) => a.kind === "theft" || a.kind === "gift"), "acts per season for the scene");
  for (const a of r.acts.flat()) assert.ok(a.c >= 0 && a.c < w.souls.length && (a.target === undefined || (a.target >= 0 && a.target < w.souls.length)), "acts index real people");
  assert.ok(r.events.every((e: any) => e.kind && e.seasons), "epochs carry kind and length for the scene");
  assert.ok(r.citizens.every((c: any) => c.home === null || w.scenario.locations.some((l) => l.id === c.home)), "starting homes are places");
  assert.equal(r.frames.length, w.ticks); assert.equal(r.leanHistory.length, w.ticks + 1); assert.equal(r.leanHistory[0].hour, 0);
  const total = Object.values(r.outcome).reduce((a: number, b: any) => a + b, 0); assert.equal(total, w.souls.length);
  const v = verdicts(w); assert.ok(v.length >= 5);
  for (const x of v) for (const who of x.who) assert.ok(w.byId.has(who), `${x.title} names ${who}`);
  const md = renderChronicleMarkdown(r); const jm = renderJourneys(r);
  for (const s of ["## The years", "## Verdicts", "## The ledger"]) assert.ok(md.includes(s), s);
  for (const s of w.souls) assert.ok(jm.includes(s.name), `journeys.md has ${s.name}`);
  const { renderWorldPage } = await import("../src/site.ts");
  const html = renderWorldPage(r as any);
  for (const s of ["verdicts", "Journeys", "<details id=\"j-", "s/season", "id=\"follow\"", "years · 60 seasons", "The ledger", "population over time"]) assert.ok(html.includes(s), s);
  assert.ok(html.indexOf('id="view3d"') < html.indexOf("<summary>After fifteen years") && html.indexOf("<summary>After fifteen years") < html.indexOf("<summary>Journeys"), "a chronicle page leads with the world, then folds");
  for (const s of ["function startVignette(", "function pickEvents(", "function route(", "function plan(", "makeSoldier(", "function grave(", "function narrate(", 'id="v3narr"', 'id="hudseason"', "titlecard"]) assert.ok(html.includes(s), `scene has ${s}`);
  assert.ok(r.frames.every((f: any) => Array.isArray(f.flags) && f.flags.length === w.souls.length), "frames carry per-person state flags");
});

test("chronicle brain: prompt sections follow prompts/chronicle-citizen.md, choices are validated, scripted fallbacks stay under 2 %, mock and scripted agree", async () => {
  const { flashChronicleBrain, worldPrefix, personaPrefix, liveSection, validateChoice } = await import("../src/chronicle/brain.ts");
  const sc = load();
  const doc = readFileSync("prompts/chronicle-citizen.md", "utf8");
  const w0 = createChronicle(sc, 5); w0.tick = 1;
  const sys = `${worldPrefix(w0)}\n\n${personaPrefix(w0.souls[0])}`;
  for (const line of ["Reply with one JSON object and nothing else:", "option must be one of the OPTIONS ids, exactly as written.", "### The town", "## Who you are"]) assert.ok(sys.includes(line) && doc.includes(line), line);
  const s = w0.souls[0]; s.food = 0; s.health = 0.4; s.money = 0;
  const sit = situationsFor(w0, s, makeRng(1)).find((x) => x.spec.id === "wallet")!;
  const live = liveSection(w0, s, sit);
  for (const x of ["### The situation", "### OPTIONS", "you are starving", "Year 1, spring"]) assert.ok(live.includes(x), x);
  assert.ok(validateChoice({ option: sit.options[0].id, thought: "x" }, sit).ok && !validateChoice({ option: sit.options[0].label }, sit).ok && !validateChoice("no", sit).ok, "ids, not labels");
  const b = flashChronicleBrain({ scripted: true, scriptedFaultRate: 0.02 });
  const w = await runChronicle(sc, 5, { brain: b });
  const m = await runChronicle(sc, 5);
  assert.deepEqual(w.population, m.population, "the scripted brain is the mock's choice through the model path: same fifteen years");
  assert.ok(b.stats.calls > 300 && b.stats.retries > 0 && b.stats.fallbacks / w.stats.situations < 0.02, `calls ${b.stats.calls} retries ${b.stats.retries} fallbacks ${b.stats.fallbacks}`);
  assert.ok(b.log.every((c) => c.cachedPrefixChars > c.liveChars), "the cacheable prefix outweighs the live section");
  assert.ok(w.souls.some((x) => x.journey.some((j) => j.thought)), "thoughts reach the journey");
  assert.ok(b.log.some((c) => c.dilemma === "quiet"), "the quiet season is a real choice the brain makes");
});

test("cycles: rows are kept as data, seeds advance, history aggregates extinction, survival and deeds-vs-death", async () => {
  const { cycleRow, appendCycle, readCycles, nextSeed, history, renderHistory, writeHistory } = await import("../src/chronicle/cycles.ts");
  const { rmSync } = await import("node:fs");
  const root = "archive/.test-cycles"; rmSync(root, { recursive: true, force: true });
  const sc = load();
  assert.equal(nextSeed(sc.id, root), 1);
  for (let i = 0; i < 3; i++) { const seed = nextSeed(sc.id, root); const w = await runChronicle(sc, seed); appendCycle(sc.id, cycleRow(w, buildChronicleRecord(w, "mock"), i + 1, "2026-09-18T12:00:00.000Z"), root); }
  const rows = readCycles(sc.id, root);
  assert.deepEqual(rows.map((r) => r.seed), [1, 2, 3]); assert.equal(nextSeed(sc.id, root), 4);
  for (const r of rows) { assert.equal(r.alive + r.dead + r.gone, r.people.length); assert.equal(r.extinct, r.alive === 0); assert.ok(r.people.every((p) => p.alive || p.left || p.cause)); }
  const h = history(rows);
  assert.equal(h.cycles, 3); assert.ok(h.extinctionRate >= 0 && h.extinctionRate <= 1); assert.ok(Math.abs(h.meanAlive + h.meanDead + h.meanGone - rows[0].people.length) < 1e-9);
  assert.ok(h.causes.length >= 2 && Math.abs(h.causes.reduce((a, c) => a + c.share, 0) - 1) < 1e-9, "causes share sums to 1");
  assert.equal(h.named.length, sc.citizens.length); assert.ok(h.named.every((p) => p.cycles === 3));
  assert.ok(h.deedsAndDeath.every((d) => d.did >= 5 && d.not >= 5) && h.deedsAndDeath.length > 0, "deed lifts over counted kinds");
  assert.equal(h.cut, 30); assert.ok(h.cohort > 0 && h.cohort <= rows.length * rows[0].people.length); assert.ok(h.baseRate > 0 && h.baseRate < 1);
  for (const d of h.deedsAndDeath) { assert.ok(d.did >= 5 && d.not >= 5); assert.ok(d.lo <= d.lift && d.lift <= d.hi, `${d.kind} interval holds the lift`); assert.equal(d.clear, d.lo > 1 || d.hi < 1); }
  assert.ok(h.deedsAndDeath.every((d, i, a) => !i || Math.abs(a[i - 1].z) >= Math.abs(d.z)), "sorted by |z|");
  assert.ok(rows.every((r) => r.people.every((p) => p.deeds.every((d) => typeof d.tick === "number") && (p.left ? p.leftAt !== null : true))), "deeds carry ticks; leavers carry a season");
  // the confound is out: a kind that only happens after the cut cannot appear in the table at all
  const late = new Set(rows.flatMap((r) => r.people.flatMap((p) => p.deeds.filter((d) => d.tick > 30).map((d) => d.kind)))), early = new Set(rows.flatMap((r) => r.people.flatMap((p) => p.deeds.filter((d) => d.tick <= 30).map((d) => d.kind))));
  for (const d of h.deedsAndDeath) assert.ok(early.has(d.kind), `${d.kind} was done before the cut`); void late;
  const md = renderHistory(sc.id, rows, h);
  for (const x of ["Extinction rate", "## What kills", "## Who survives", "## Deeds and death", "alive and still in town at season 30", "within noise", "rows clear noise", "Per sixty seasons alive", "## Cycles"]) assert.ok(md.includes(x), x);
  const { path } = writeHistory(sc.id, root); assert.ok(readFileSync(path, "utf8").includes("3 cycles"));
  assert.ok(renderHistory("x", [], history([])).includes("No cycles yet"));
  rmSync(root, { recursive: true, force: true });
});

test("chronicle architect: validator names paths, soak catches dead towns, scripted pipeline accepts a town with its own dilemma and puts it on the ledger", async () => {
  const { validateChronicle, soakChronicle } = await import("../src/chronicle/validate.ts");
  const { runChronicleArchitect, buildChroniclePrompt } = await import("../src/chronicle/architect.ts");
  const { readLedger } = await import("../src/architect.ts");
  const { rmSync, existsSync, writeFileSync } = await import("node:fs");
  const sc = load();
  assert.ok(validateChronicle(sc).ok);
  const bad = JSON.parse(JSON.stringify(sc));
  bad.jobs[0].at = "nowhere"; bad.epochs[0].kind = "dragons"; bad.epochs[1].fx = "lava"; bad.citizens[0].traits.bold = 2;
  bad.dilemmas = [{ id: "x", when: ["hungry"], target: "mother", weight: 1, text: "{{victim}} drops a purse", options: [{ id: "a", label: "A", pull: { greed: 1 }, outcomes: [{ chance: 0.5, text: "ok" }] }] }];
  const v = validateChronicle(bad);
  for (const p of ["jobs[0].at", "epochs[0].kind", "epochs[1].fx", "citizens[0].traits.bold", "dilemmas[0].when", "dilemmas[0].target", "dilemmas[0].text", "dilemmas[0].options", "dilemmas[0].options[0].pull", "dilemmas[0].options[0].outcomes"]) assert.ok(v.errors.some((e) => e.startsWith(p)), `names ${p}: ${v.errors.join(" | ")}`);
  const soft = JSON.parse(JSON.stringify(sc)); soft.epochs = soft.epochs.filter((e: any) => e.kind === "boom");
  const sk = await soakChronicle(soft, 4);
  assert.ok(sk.lines.length >= 3 && Array.isArray(sk.problems), "soak reports lines and problems");
  const dead = JSON.parse(JSON.stringify(sc)); dead.citizens.forEach((c: any) => { c.age = 82; }); dead.fill = { count: 0 };
  const sk2 = await soakChronicle(dead, 4); assert.ok(sk2.problems.length > 0, `a starved town is flagged: ${sk2.lines.join(" | ")}`);
  const p = buildChroniclePrompt("Do the bold die first?");
  for (const x of ["## System", "the dice do the plot".toLowerCase()]) assert.ok(p.system.toLowerCase().includes(x.toLowerCase()), x);
  for (const x of ["## SCHEMA", "## LIBRARY", "- wallet ·", "## LEDGER", "Do the bold die first?", "Rules the validator enforces"]) assert.ok(p.user.includes(x), x);
  // scripted pipeline: through validate + soak, written to disk, on the ledger; then cleaned up
  const ledgerBefore = readLedger().length; const ledgerFile = "scenarios/ledger.jsonl"; const ledgerText = readFileSync(ledgerFile, "utf8");
  const logs: string[] = [];
  const r = await runChronicleArchitect({ llm: "scripted", question: "Do the bold die first?", onLog: (s) => logs.push(s) });
  try {
    assert.ok(r && r.scenario.id.startsWith("scripted-town-") && r.attempts === 1, "accepted first time");
    assert.ok(r!.scenario.dilemmas!.some((d) => d.id === "pit-lamp") && r!.scenario.socialQuestion.text === "Do the bold die first?");
    assert.ok(existsSync(r!.files[0]) && existsSync(r!.files[1]));
    assert.equal(readLedger().length, ledgerBefore + 1);
    assert.ok(logs.some((l) => /accepted/.test(l) && /pit-lamp \d+/.test(l)), "the written dilemma was offered in the soak");
    const w = await runChronicle(r!.scenario, 3);
    assert.ok(w.souls.some((s) => s.journey.some((j) => /deep seam/.test(j.situation))), "the town's own dilemma appears in journeys");
  } finally { for (const f of r?.files ?? []) rmSync(f, { force: true }); writeFileSync(ledgerFile, ledgerText); }
});
