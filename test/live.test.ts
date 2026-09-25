import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLive, loadChronicleScenario } from "../src/live/server.ts";
import { Predictions, questionsFor, answersFor, openQuestions } from "../src/live/predict.ts";
import { createChronicle, runChronicle } from "../src/chronicle/sim.ts";
import { face, panel, lifeCard, moodOf, standing } from "../web/draw.mjs";

const sc = loadChronicleScenario("the-lane");
const get = (port: number, path: string, init?: RequestInit) => fetch(`http://localhost:${port}${path}`, init);

test("live: the town runs a season at a time and serves the town, the years, a person and the other towns; a run ends, is archived, and the next begins", async () => {
  const root = mkdtempSync(join(tmpdir(), "lane-"));
  const logs: string[] = [];
  const live = startLive({ scenario: sc, seasonMs: 120, port: 8897, epilogueMs: 400, root, onLog: (s) => logs.push(s) });
  try {
    await new Promise((r) => setTimeout(r, 700));
    const st = await get(8897, "/state").then((x) => x.json());
    assert.ok(st.tick >= 3 && st.cycle === 1, `state ${st.tick}`);
    const home = await get(8897, "/").then((x) => x.text());
    for (const s of ["class=\"street\"", "class=\"rep\"", "class=\"bio\"", "The four", "/web/town.css", "/web/town.js", 'class="px"']) assert.ok(home.includes(s), s);
    assert.ok(!/<script>(?![^<]*window\.PEOPLE)/.test(home), "the only inline script is the list of faces");
    const rec = await get(8897, "/record.json").then((x) => x.json());
    const four = rec.citizens.filter((c: any) => c.named);
    const person = await get(8897, `/p/${four[0].id}`).then((x) => x.text());
    assert.ok(person.includes(four[0].name) && person.includes("Everything the record holds"), "a person's page");
    assert.equal((await get(8897, "/p/nobody-here")).status, 404);
    for (const p of ["/years", "/about", "/towns"]) assert.equal((await get(8897, p)).status, 200, p);
    assert.equal((await get(8897, "/web/town.css")).status, 200); assert.equal((await get(8897, "/web/nope.js")).status, 404);
    const h = await get(8897, "/health").then((x) => x.json()); assert.ok(h.ok === true && h.cycle === 1 && h.brain === "mock");
    await new Promise((r) => setTimeout(r, 120 * 62 + 200));
    assert.equal((await get(8897, "/run/1")).status, 200, "the finished run is kept under /run/1");
    assert.ok((await get(8897, "/towns").then((x) => x.text())).includes("/run/1"));
    await new Promise((r) => setTimeout(r, 700));
    assert.equal((await get(8897, "/state").then((x) => x.json())).cycle, 2, "the next run started");
    assert.ok(logs.some((l) => /cycle 1 over/.test(l)));
  } finally { live.stop(); rmSync(root, { recursive: true, force: true }); }
});

test("predictions: questions open and close with the seasons; answers come from the record; scoring", async () => {
  const w = createChronicle(sc, 4); const qs = questionsFor(w);
  assert.ok(qs.length >= 6 && qs.slice(0, 4).every((q) => q.at === 1 && q.options.length >= 10) && qs.some((q) => q.id === "first-turn"));
  assert.equal(openQuestions(qs, 0).length, 4); assert.ok(openQuestions(qs, sc.epochs[0].at).some((q) => /store/.test(q.text)));
  const done = await runChronicle(sc, 4); const ans = answersFor(done);
  assert.ok(ans["first-death"].length >= 1 || done.souls.every((s) => s.alive));
  for (const k of Object.keys(ans)) for (const id of ans[k]) assert.ok(id === "nobody" || done.byId.has(id), `${k}: ${id}`);
  const root = mkdtempSync(join(tmpdir(), "pred-")); const P = new Predictions("x", root);
  P.add({ viewer: "a", name: "A", cycle: 1, q: "first-death", answer: ans["first-death"][0] ?? "nobody", at: "" }); P.add({ viewer: "b", cycle: 1, q: "first-death", answer: "zzz", at: "" });
  const sc1 = P.score(1, ans); assert.equal(sc1[0].name, "A"); assert.equal(sc1[0].right, 1); assert.equal(sc1[1].right, 0);
  assert.deepEqual(P.tally(1, "first-death"), { [ans["first-death"][0] ?? "nobody"]: 1, zzz: 1 });
  rmSync(root, { recursive: true, force: true });
});

test("draw: faces are stable per person and change with mood; a panel and a card render", () => {
  const c = { id: "mara", name: "Mara Lind", role: "shopkeeper", age: 24 };
  const noid = (s: string) => s.replace(/p[lsc]\d+-\d+/g, "pX"); // the defs ids are unique per rendered face; the drawing is what must be stable
  assert.equal(noid(face(c, "calm")), noid(face(c, "calm"))); assert.notEqual(noid(face(c, "calm")), noid(face(c, "sick"))); assert.notEqual(noid(face(c, "calm")), noid(face({ ...c, id: "runa" }, "calm")));
  assert.equal(moodOf(2, true, false), "sick"); assert.equal(standing(1 | 4, true, false), "starving, no roof"); assert.equal(standing(0, false, false, "hunger"), "died of hunger");
  const html = panel({ c: 0, kind: "theft", target: 1, text: "took Ilse's purse", harm: 0.3, impact: { self: { money: 0.1 }, target: { money: -0.1, tie: -0.4 } } }, [c, { id: "ilse", name: "Ilse Varn", role: "shopkeeper", age: 52 }], "Year 3, spring");
  assert.ok(html.includes('class="panel harm"') && html.includes("Mara took Ilse") && html.includes("colder") && html.includes("+10 money"));
  assert.ok(lifeCard(c, { town: "The Lane", alive: false, lines: ["Y3: took a purse"], end: "Died of hunger, Year 5" }).includes("Died of hunger"));
});
