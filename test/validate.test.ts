import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateScenario } from "../src/validate.ts";
import { loadScenario } from "../src/scenario.ts";
import { runWorld } from "../src/engine/sim.ts";
import { mockBrain } from "../src/brains/mock.ts";
import { diversity, runMany } from "../src/experiment.ts";

const fixtures = readdirSync("scenarios").filter((f) => f.endsWith(".json") && !f.endsWith(".engine.json")).map((f) => f.replace(/\.json$/, ""));

test("all fixture scenarios validate", () => {
  for (const id of fixtures) {
    const v = validateScenario(JSON.parse(readFileSync(`scenarios/${id}.json`, "utf8")));
    assert.deepEqual(v.errors, [], `${id}: ${v.errors.join("; ")}`);
  }
});

test("validator rejects a scenario with no forcing event and a stakes drop", () => {
  const raw = JSON.parse(readFileSync("scenarios/last-ferry.json", "utf8"));
  raw.events = raw.events.map((e: any) => ({ ...e, removesOption: false }));
  raw.events[1].stakes = 3; // stakes then drop to 2 at the next event
  const v = validateScenario(raw);
  assert.ok(v.errors.some((e) => e.includes("removesOption")), "expected forcing error");
  assert.ok(v.errors.some((e) => e.includes("must not decrease")), "expected escalation error");
});

test("validator reports unknown references with paths", () => {
  const raw = JSON.parse(readFileSync("scenarios/last-ferry.json", "utf8"));
  raw.citizens[0].home = "nowhere";
  raw.ending.choices[0].pull["belief:nope"] = 1;
  const v = validateScenario(raw);
  assert.ok(v.errors.some((e) => e.startsWith("citizens[0].home")));
  assert.ok(v.errors.some((e) => e.startsWith("ending.choices[0].pull.belief:nope")));
});

test("a world is deterministic for a given seed", async () => {
  const s = loadScenario("last-ferry");
  const a = await runWorld(s, 7, { brain: mockBrain });
  const b = await runWorld(s, 7, { brain: mockBrain });
  assert.deepEqual(a.citizens.map((c) => c.finalChoice), b.citizens.map((c) => c.finalChoice));
  assert.deepEqual(a.beats.map((x) => x.headline), b.beats.map((x) => x.headline));
});

test("a world simulates in under 5 seconds", async () => {
  const s = loadScenario("adrift");
  const t0 = performance.now();
  await runWorld(s, 1, { brain: mockBrain });
  assert.ok(performance.now() - t0 < 5000);
});

test("fixtures pass the diversity test over 10 seeds", async () => {
  for (const id of fixtures) {
    const s = loadScenario(id);
    const d = diversity(s, await runMany(s, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    assert.ok(d.ok, `${id}: ${JSON.stringify(d.shares)}`);
  }
});

test("deadline awareness: behaviour at the start differs from the end", async () => {
  const s = loadScenario("last-ferry");
  const w = await runWorld(s, 7, { brain: mockBrain });
  const ph = w.stats.actionsByPhase, first = ph["settling in"], late = { ...ph["the squeeze"], ...ph["last hours"] };
  const lateCommits = (ph["the squeeze"]?.commit ?? 0) + (ph["last hours"]?.commit ?? 0);
  assert.ok((first.commit ?? 0) === 0, "nobody commits in the first day");
  assert.ok(lateCommits > 5, "commits happen in the second half");
  assert.ok((first.work ?? 0) > (late.work ?? 0), "work fades as the clock runs down");
  assert.equal(w.stats.fallbacks, 0);
});

test("no seed ends one-sided over 20 seeds (all fixtures)", async () => {
  for (const id of fixtures) {
    const s = loadScenario(id);
    for (let seed = 1; seed <= 20; seed++) {
      const w = await runWorld(s, seed, { brain: mockBrain });
      const counts = new Map<string, number>();
      for (const c of w.citizens) counts.set(c.finalChoice!, (counts.get(c.finalChoice!) ?? 0) + 1);
      assert.ok(Math.max(...counts.values()) < w.citizens.length, `${id} seed ${seed} is one-sided`);
    }
  }
});

test("archive: record.md has every section and agrees with the outcome", async () => {
  const { writeArchive } = await import("../src/archive.ts");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const s = loadScenario("adrift");
  const w = await runWorld(s, 3, { brain: mockBrain });
  const { dir, record } = writeArchive(w, "mock", [], mkdtempSync(`${tmpdir()}/uncanny-`));
  const md = readFileSync(`${dir}/record.md`, "utf8");
  for (const h of ["## The record", "## How the room moved", "## Threads", "## Citizens", "## Editions", "## Events"]) assert.ok(md.includes(h), `missing ${h}`);
  assert.ok(readFileSync(`${dir}/diaries.md`, "utf8").includes("## Captain Hale"));
  // every change of mind carries a cause
  for (const c of record.citizens) for (const l of c.leanTimeline.slice(1)) assert.ok(l.because, `${c.name} h${l.hour} has no because`);
  const total = Object.values(record.outcome).reduce((a, b) => a + b, 0);
  assert.equal(total, w.citizens.length);
  const lastTally = record.leanHistory[record.leanHistory.length - 1].tally;
  for (const c of s.ending.choices) assert.ok(record.outcome[c.id] >= (lastTally[c.id] ?? 0), "final tally never exceeds outcome");
  assert.ok(record.beats.filter((b) => b.level >= 2).length > 30);
  assert.equal(record.stats.fallbackRate, 0);
});

test("experiment: variants are pure data edits and results are reproducible", async () => {
  const { makeVariants } = await import("../src/vary.ts");
  const { pooled, cramersV } = await import("../src/experiment.ts");
  const s = loadScenario("last-ferry");
  const vs = makeVariants(s, "loyal");
  assert.equal(vs.length, 3);
  assert.equal(vs[1].scenario.citizens[0].traits.loyal, s.citizens[0].traits.loyal);
  assert.ok(vs[2].scenario.citizens[0].traits.loyal > s.citizens[0].traits.loyal);
  const ev = makeVariants(s, "rumour-at");
  assert.equal(ev.map((v) => v.scenario.events.find((e) => e.id === "ferry-cancelled-rumour")!.at).join(","), "20,44,68");
  assert.equal(vs[1].label, "as written");
  const rm = makeVariants(s, "citizen:olav.remove=false,true");
  assert.ok(rm[1].scenario.citizens.find((c) => c.id === "olav")!.absent === true);
  // removing a citizen leaves every other citizen's traits and ties identical
  const { expandCast } = await import("../src/scenario.ts");
  const a = expandCast(s, 3).filter((c) => c.id !== "olav"), b = expandCast(rm[1].scenario, 3).filter((c) => c.id !== "olav");
  assert.deepEqual(a.map((c) => [c.id, c.traits, c.ties?.filter((t) => t.to !== "olav")]), b.map((c) => [c.id, c.traits, c.ties?.filter((t) => t.to !== "olav")]));
  const wa = await runWorld(rm[1].scenario, 3, { brain: mockBrain });
  assert.ok(!wa.citizens.some((c) => c.id === "olav") && wa.citizens.length === 25);
  const { pairedDelta } = await import("../src/experiment.ts");
  const ra = await runMany(s, [1, 2, 3, 4, 5]), rb = await runMany(s, [1, 2, 3, 4, 5]);
  assert.deepEqual(pooled(s, ra), pooled(s, rb));
  const d = pairedDelta("board", ra, rb); assert.equal(d.delta, 0); assert.equal(d.same, 5);
  assert.equal(cramersV([[10, 10], [10, 10]]), 0);
  assert.ok(cramersV([[20, 0], [0, 20]]) > 0.99);
  assert.throws(() => makeVariants(s, "nosuch-at"));
});

test("experiment: --with composes, event fields are checked, bucket pairing and warnings work", async () => {
  const { makeVariants, applyWith } = await import("../src/vary.ts");
  const { pairedDeltaInBucket } = await import("../src/experiment.ts");
  const s = loadScenario("last-ferry");
  const timid = applyWith(applyWith(s, "trait:bold=-0.3"), "citizen:aksel.traits.bold=1");
  assert.ok(timid.citizens.find((c) => c.id === "mara")!.traits.bold < s.citizens.find((c) => c.id === "mara")!.traits.bold);
  assert.equal(timid.citizens.find((c) => c.id === "aksel")!.traits.bold, 1);
  assert.throws(() => makeVariants(s, "event:rumour-buyer.att=1,2"), /event field must be/);
  const shifted = makeVariants(s, "event:rumour-buyer.at=20,32");
  assert.ok(shifted[1].warnings.some((w) => /workday/.test(w)), "hour-of-day warning fires for explicit shifts");
  const base = await runMany(s, [1, 2, 3, 4, 5, 6], { splitBy: "trait:loyal", buckets: [0.4, 0.7] });
  const d = pairedDeltaInBucket(s, "board", "≥ 0.7", base, base, [0.4, 0.7]);
  assert.equal(d.delta, 0); assert.ok(d.n > 0);
});

test("fork: divergence hour is found, swaps and seeds produce a diff, mock replays nothing", async () => {
  const { fork } = await import("../src/fork.ts");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { writeArchive } = await import("../src/archive.ts");
  const root = mkdtempSync(`${tmpdir()}/uncanny-fork-`);
  const s = loadScenario("last-ferry");
  const w = await runWorld(s, 7, { brain: mockBrain });
  const { dir } = writeArchive(w, "mock", [], root);
  const same = await runWorld(s, 7, { brain: mockBrain });
  assert.deepEqual(w.hourHashes, same.hourHashes, "fingerprints are deterministic");
  const ev = await fork(dir, { vary: "event:tickets-short.at=45" });
  assert.ok(ev.firstDivergence !== null && ev.firstDivergence >= 33 && ev.firstDivergence <= 45, `split at ${ev.firstDivergence}`);
  assert.equal(ev.hits + ev.misses, 0);
  assert.ok(ev.md.includes("## Who ended differently") && ev.md.includes("## Threads that diverged"));
  const sw = await fork(dir, { swap: "mara" });
  assert.equal(sw.firstDivergence, 1);
  assert.ok(!sw.child.citizens.some((c) => c.name === "Mara Lind") && sw.child.citizens.some((c) => c.id === "mara"));
  const sd = await fork(dir, { seed: 8 });
  assert.equal(sd.child.seed, 8);
});

test("fork: same cast under a new seed; what-split lines; replay cache hits for an identical prefix and misses after a change", async () => {
  const { fork } = await import("../src/fork.ts");
  const { withReplay } = await import("../src/brains/replay.ts");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { writeArchive } = await import("../src/archive.ts");
  const root = mkdtempSync(`${tmpdir()}/uncanny-fork2-`);
  const s = loadScenario("adrift");
  const w = await runWorld(s, 3, { brain: mockBrain });
  const { dir } = writeArchive(w, "mock", [], root);
  const sd = await fork(dir, { seed: 4 });
  assert.deepEqual(sd.child.citizens.map((c) => [c.id, c.name, c.role]), w.citizens.map((c) => [c.id, c.seed.name, c.seed.role]), "a seed fork keeps the same people");
  assert.ok(/What is different at hour/.test(sd.md));
  // a fake non-mock brain: identical world → all hits on the second run; a changed persona → misses
  const fake = { name: "fake", decide: (_w: any, _c: any, k: any[]) => ({ action: k[0].id, target: k[0].target, thought: "x" }), reflect: (_w: any, c: any) => ({ lean: c.lean, thought: "y" }) };
  const log1: any[] = []; const b1 = withReplay(fake as any, new Map(), log1);
  await runWorld(s, 3, { brain: b1 });
  assert.ok(b1.misses > 1000 && b1.hits === 0);
  const parentCalls = new Map(log1.map((r) => [r.hash, r]));
  const log2: any[] = []; const b2 = withReplay(fake as any, parentCalls, log2);
  await runWorld(s, 3, { brain: b2 });
  assert.equal(b2.misses, 0, "identical prefix replays entirely");
  const changed = JSON.parse(JSON.stringify(s)); changed.citizens.find((c: any) => c.id === "captain").traits.loyal = 0.2;
  const log3: any[] = []; const b3 = withReplay(fake as any, parentCalls, log3);
  await runWorld(changed, 3, { brain: b3 });
  assert.ok(b3.misses > 0 && log3.filter((r) => r.citizen === "captain" && r.replayed).length === 0, "the changed citizen is never replayed from the old persona");
});

test("replay: no stale hits in the divergence hour (key includes live state)", async () => {
  const { withReplay } = await import("../src/brains/replay.ts");
  const { stateHash } = await import("../src/engine/sim.ts");
  const s = loadScenario("adrift");
  // a fake brain whose answer encodes the world state it saw; a replayed answer with a different state is stale
  const fake = { name: "fake", decide: (w: any, _c: any, k: any[]) => ({ action: k[0].id, target: k[0].target, thought: stateHash(w) }), reflect: (w: any, c: any) => ({ lean: c.lean, thought: stateHash(w) }) };
  const log1: any[] = []; await runWorld(s, 3, { brain: withReplay(fake as any, new Map(), log1) });
  const parentCalls = new Map(log1.map((r) => [r.hash, r]));
  const { makeVariants } = await import("../src/vary.ts");
  const moved = makeVariants(s, "event:water-stolen.at=52")[0].scenario;
  let stale = 0; const log2: any[] = [];
  const checking = { name: "fake", decide: fake.decide, reflect: fake.reflect };
  const b = withReplay(checking as any, parentCalls, log2);
  const orig = b.decide.bind(b);
  b.decide = async (w: any, c: any, k: any[]) => { const d = await orig(w, c, k); if (log2[log2.length - 1]?.replayed && d.thought !== stateHash(w)) stale++; return d; };
  await runWorld(moved, 3, { brain: b });
  assert.equal(stale, 0);
  assert.ok(b.hits > 0 && b.misses > 0);
});

test("flash brain: prompt sections follow prompts/citizen.md, decisions are validated, scripted fallbacks stay under 2 %", async () => {
  const { flashBrain, validateDecision, worldPrefix, personaPrefix, liveSection, reflectionSection } = await import("../src/brains/flash.ts");
  const { loadEngine, checkEngine } = await import("../src/llm/engine.ts");
  const { createWorld } = await import("../src/engine/state.ts");
  const { candidates } = await import("../src/engine/sim.ts");
  const s = loadScenario("last-ferry");
  const e = loadEngine("last-ferry")!;
  assert.deepEqual(checkEngine(e, s), []);
  const w = createWorld(s, 1, e); w.hour = 30;
  const c = w.citizens[0];
  const prefix = worldPrefix(w, e), persona = personaPrefix(c, e), live = liveSection(w, c, candidates(w, c)), refl = reflectionSection(w, c, e);
  for (const h of ["### World", "### What people do here", "### Examples"]) assert.ok(prefix.includes(h), h);
  assert.ok(persona.startsWith("## Persona") && live.startsWith("## Now") && live.includes("CANDIDATES (ranked)") && refl.includes("Questions:"));
  assert.ok(prefix.length / 4 < 2600, "cached prefix within budget");
  const cands = candidates(w, c);
  assert.ok(validateDecision({ action: cands[0].id, target: cands[0].target, thought: "x" }, cands).ok);
  assert.equal((validateDecision({ action: "fly", target: null }, cands) as any).why, "illegal");
  assert.equal((validateDecision("nonsense", cands) as any).why, "parse");
  const b = flashBrain({ engine: e, scripted: true, scriptedFaultRate: 0.02 });
  const run = await runWorld(s, 7, { brain: b, engine: e });
  assert.ok(run.stats.decisions > 1000);
  assert.ok(run.stats.fallbacks / run.stats.decisions < 0.02, `fallback rate ${run.stats.fallbacks / run.stats.decisions}`);
  const { evalTripwire } = await import("../src/engine/sim.ts");
  assert.ok(evalTripwire(run, "undecided >= 0 && hoursLeft < 100"), "tripwire grammar");
  let fired = false; for (const seed of [1, 2, 3, 4, 5]) { const r = await runWorld(s, seed, { brain: mockBrain, engine: e }); if (r.beats.some((x) => x.headline.startsWith("Watch: "))) { fired = true; break; } }
  assert.ok(fired, "a tripwire fires in at least one of five seeds");
});

test("architect: scripted pipeline end to end, gauntlet reports, compile checks catch dead engines", async () => {
  const { runArchitect, gauntlet, buildScenarioPrompt, schemaText } = await import("../src/architect.ts");
  const { checkEngine, loadEngine } = await import("../src/llm/engine.ts");
  const { existsSync, unlinkSync, readFileSync: rf } = await import("node:fs");
  const r = await runArchitect({ llm: "scripted", question: "Does knowing the deadline exactly make people decide earlier? (test)", onLog: () => {} });
  assert.ok(r && r.scenario.id.startsWith("scripted-") && r.engine && r.files.length === 4);
  const calls = rf(`scenarios/generated/${r!.scenario.id}.calls.jsonl`, "utf8").split("\n").filter(Boolean);
  assert.ok(calls.length >= 3 && JSON.parse(calls[0]).prompt.system.length > 500, "scripted calls carry the prompts");
  for (const f of r!.files) if (existsSync(f)) unlinkSync(f);
  { const { writeFileSync: wf } = await import("node:fs"); wf("scenarios/ledger.jsonl", rf("scenarios/ledger.jsonl", "utf8").split("\n").filter((l) => l && !l.includes(`"id":"${r!.scenario.id}"`)).join("\n") + "\n"); }
  // the schema text the model sees: one JSON block, the field notes, no duplicated headings
  const st = schemaText();
  assert.equal((st.match(/"id": "last-ferry"/g) ?? []).length, 1);
  assert.ok(st.includes("Balance expected scores"));
  // a retry carries the previous JSON
  const p2 = buildScenarioPrompt("q", "Static validation failed:\n- x", { id: "prev" });
  assert.ok(p2.user.includes('"id":"prev"') && p2.user.includes("YOUR PREVIOUS SCENARIO"));
  // gauntlet report on a broken scenario is specific
  const s = loadScenario("last-ferry");
  const broken = JSON.parse(JSON.stringify(s)); for (const e of broken.events) e.removesOption = false;
  const g1 = await gauntlet(broken, { allowExistingId: true }); assert.ok(!g1.ok && /removesOption/.test(g1.report));
  const lopsided = JSON.parse(JSON.stringify(s)); lopsided.ending.choices[0].pull = { "trait:bold": 2, "trait:restless": 2, bonds: 2 }; lopsided.ending.choices[1].pull = { "trait:loyal": -2 };
  const g2 = await gauntlet(lopsided, { allowExistingId: true }); assert.ok(!g2.ok && /not contested/.test(g2.report) && /Ending split/.test(g2.report));
  const g3 = await gauntlet(s); assert.ok(!g3.ok && /already exists/.test(g3.report), "id collision guard");
  const { Meter, assertPriced } = await import("../src/llm/client.ts");
  const m = new Meter(1); m.add({ promptTokens: 1, cachedTokens: 0, completionTokens: 1, costUsd: 1.5 }); assert.ok(m.over() && m.calls === 1, "meter records before the cap is enforced");
  const P = { models: { zeroed: { input: 0, cachedInput: 0, output: 0 } }, spendCapUsdPerRun: 2 };
  assert.throws(() => assertPriced("zeroed", P), /no non-zero rates/, "a model priced at zero cannot be called: the cap would be inert");
  assert.throws(() => assertPriced("never-heard-of-it", P), /no non-zero rates/);
  assert.doesNotThrow(() => assertPriced("deepseek-flash"), "the shipped prices are real rates");
  // compile checks
  const e = loadEngine("last-ferry")!;
  const clone = () => JSON.parse(JSON.stringify(e));
  let x = clone(); x.actionVocabulary[1].id = "lastShift"; assert.ok(checkEngine(x, s).some((m) => /runtime actions/.test(m)), "renamed vocab id");
  x = clone(); x.archetypes[2].traitRange.sociable = [0.7, 1]; assert.ok(checkEngine(x, s).some((m) => /partition/.test(m)), "partition hole on the grid");
  x = clone(); x.tripwires[0].when = "affinity(mara,tomas) > 0.7"; assert.ok(checkEngine(x, s).some((m) => /would never fire/.test(m)), "tripwire grammar");
  x = clone(); x.exemplars[0].decision = { action: "commit", target: "stay", thought: "x" }; assert.ok(checkEngine(x, s).some((m) => /not among its own context/.test(m)), "exemplar legality");
  x = clone(); x.actionVocabulary[0].precondition = "at(mine) || mood > 0.2"; assert.ok(checkEngine(x, s).some((m) => /does not parse/.test(m)));
  x = clone(); x.tripwires[0].when = "count:leave > 18"; assert.ok(checkEngine(x, s).some((m) => /unknown choice/.test(m)), "tripwire identifiers");
  x = clone(); x.actionVocabulary[1].precondition = "at(quarry)"; assert.ok(checkEngine(x, s).some((m) => /unknown location/.test(m)), "precondition identifiers");
  x = clone(); x.archetypes.push({ id: "default", name: "d", traitRange: {}, oneLiner: "x", heuristics: ["a", "b", "c"] }); assert.ok(checkEngine(x, s).some((m) => /several archetypes/.test(m)), "catch-all archetype overlaps");
  assert.ok(checkEngine({ decisionEngine: e }, s).some((m) => /wrapped/.test(m)), "wrapped engine reported, not thrown");
  assert.ok(checkEngine({}, s).length > 0 && checkEngine(null, s).length > 0);
  x = clone(); delete x.pressureCurve[1].weights; assert.ok(checkEngine(x, s).some((m) => /weights/.test(m)));
  x = clone(); x.actionVocabulary[3].precondition = "with(nobody)"; assert.ok(checkEngine(x, s).some((m) => /unknown citizen/.test(m)));
});

test("flash plumbing: prefix byte-stable, live section small, retries logged with usage, wrong explicit target is a retry, words reach memory", async () => {
  const { flashBrain, validateDecision, worldPrefix, personaPrefix, liveSection } = await import("../src/brains/flash.ts");
  const { loadEngine } = await import("../src/llm/engine.ts");
  const { withReplay } = await import("../src/brains/replay.ts");
  const { candidates } = await import("../src/engine/sim.ts");
  const s = loadScenario("last-ferry"); const e = loadEngine("last-ferry")!;
  const prefixes = new Set<string>(); const personas = new Map<string, Set<string>>(); let maxLive = 0;
  const inner = flashBrain({ engine: e, scripted: true, scriptedFaultRate: 0.1 });
  const probe = { name: "scripted", log: inner.log, stats: inner.stats, meter: inner.meter,
    decide: async (w: any, c: any, k: any[]) => { prefixes.add(worldPrefix(w, e)); (personas.get(c.id) ?? personas.set(c.id, new Set()).get(c.id)!).add(personaPrefix(c, e)); maxLive = Math.max(maxLive, liveSection(w, c, k).length / 4); return inner.decide(w, c, k); },
    reflect: (w: any, c: any) => inner.reflect(w, c) };
  const calls: any[] = []; const b = withReplay(probe as any, new Map(), calls);
  const w = await runWorld(s, 7, { brain: b, engine: e });
  assert.equal(prefixes.size, 1, "one world prefix"); for (const set of personas.values()) assert.equal(set.size, 1, "one persona per citizen");
  assert.ok(maxLive < 420, `live section ≤ ~400 tokens (max ${Math.round(maxLive)})`);
  const withAttempts = calls.filter((c) => c.attempts); assert.ok(withAttempts.length > 20 && withAttempts.every((c) => c.attempts.length === 2 && c.usage.promptTokens > c.attempts[0].usage.promptTokens), "retried calls carry both attempts and summed usage");
  const cands = candidates(w, w.citizens[0]);
  const mv = cands.find((k) => k.id === "move"); if (mv && cands.filter((k) => k.id === "move").length === 1) assert.equal((validateDecision({ action: "move", target: "nowhere", thought: "x" }, cands) as any).why, "target");
  assert.ok(w.citizens.some((c) => c.memories.some((m) => m.said)), "spoken lines are remembered");
  const heard = w.citizens.flatMap((c) => c.memories.filter((m) => m.said && /talked with me/.test(m.text)));
  assert.ok(heard.length > 50 && heard.every((m) => !/^you said/.test(m.said!)), "listeners remember what was said to them, not the speaker's thought");
  assert.ok(w.beats.some((b) => / ↔ /.test(b.headline) && b.thought && /: "/.test(b.thought)), "spoken lines reach the feed's tie beats");
  assert.ok(w.citizens.some((c) => c.lastThought), "own last thought kept");
});

test("site: a world page and the gallery render from record.json", async () => {
  const { renderWorldPage, renderGallery } = await import("../src/site.ts");
  if (!existsSync("archive/adrift-s3-mock/record.json")) execFileSync(process.execPath, ["src/cli.ts", "world", "adrift", "--seed", "3"], { stdio: "ignore" }); // archive/ is not kept in git: make the run this reads
  const r = JSON.parse(readFileSync("archive/adrift-s3-mock/record.json", "utf8"));
  const html = renderWorldPage(r);
  for (const s of ["<h1>Adrift", "Replay", 'id="board"', "How the room moved", ">Arcs<", "Diaries (unsealed)", "<script>"]) assert.ok(html.includes(s), s);
  assert.ok(!/<script>[\s\S]*<\/script>[\s\S]*<\/script>/.test(html.split("const D=")[1]?.split("</script>")[0] ?? ""), "inlined data cannot close the script tag");
  assert.ok(Array.isArray(r.frames) && r.frames.length === r.hours && r.frames[10].at.length === r.citizens.length && r.map.locations.length > 1, "per-hour frames and map in the record");
  assert.ok(html.includes('id="map"') && html.includes("function drawMap") && html.includes('type="importmap"') && html.includes("applyFx"), "2D map and 3D scene present");
  const bad = JSON.parse(readFileSync("scenarios/last-ferry.json", "utf8")); bad.events[0].fx = "dragons";
  assert.ok(validateScenario(bad).errors.some((e) => /unknown effect/.test(e)), "fx names are checked");
  const g = renderGallery([{ dir: "adrift-s3-mock", r }]);
  assert.ok(g.includes("adrift-s3-mock/index.html"));
  // hostile content is escaped server-side and never reaches innerHTML raw client-side (the client escaper E() wraps every field)
  const evil = JSON.parse(JSON.stringify(r)); evil.citizens[0].name = 'Bad </script><b>Name</b><img src=x onerror=alert(1)>'; evil.beats[0].headline = '<img src=x onerror=alert(2)>'; evil.beats[0].thought = "<b>x</b>";
  const h2 = renderWorldPage(evil);
  const markup = h2.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""); // the inlined JSON legitimately carries raw strings inside a JS string literal
  assert.ok(!markup.includes("<b>Name</b>") && !markup.includes('<img src=x onerror=alert(2)>') && markup.includes("&lt;img src=x"), "server-side escaped");
  assert.ok((h2.match(/<\/script>/g) ?? []).length === 3, "exactly three real closing script tags (data, importmap, 3D module) — none from the poisoned data");
  assert.ok(/function beatLine\(b\)\{[^}]*E\(b\.headline\)/.test(h2) && /E\(D\.prompt\)/.test(h2), "client renderer escapes");
  assert.ok(h2.includes("The record") && h2.includes("Close, and chose differently") === (r.watchFor.length > 0));
});
