import { test } from "node:test";
import assert from "node:assert/strict";
import { loadChronicleScenario } from "../src/live/server.ts";
import { runChronicle } from "../src/chronicle/sim.ts";
import { buildChronicleRecord } from "../src/chronicle/archive.ts";
import { ledger, factsAt, played, personNow, contradictionsOf, retell, townNow } from "../src/chronicle/ledger.ts";
import { seasonBrief, checkPassage, owedTelling, emptyTelling } from "../src/chronicle/teller.ts";
import { townPage, personPage, yearsPage } from "../src/site/town.ts";

const sc = loadChronicleScenario("the-many");
const run = async (seed: number) => buildChronicleRecord(await runChronicle(sc, seed), "mock");

test("the life between decisions is recorded: hunger, spirits, grief, and how people took what was done", async () => {
  const r = await run(7);
  const kinds = new Set(r.acts.flat().filter((a: any) => a.life).map((a: any) => a.kind));
  for (const k of ["reaction", "bond", "low", "grief", "standing"]) assert.ok(kinds.has(k), k);
  assert.ok(r.frames.every((f: any) => f.vitals.every((v: number[]) => v.length === 4)), "spirits are kept every season");
  const L = ledger(r); assert.equal(L.length, 60);
  assert.ok(L.flat().every((f) => /[.!?”")]$/.test(f.text) && !/\\byou\\b|\\byour\\b/i.test(f.text)), "every fact is a sentence about somebody, never to them");
  assert.ok(L.flat().some((f) => f.kind === "condition"), "what lasts is said, not only what begins");
  const t = townNow(r, 30); assert.ok(t.alive <= 10 && t.alive >= 0);
});

test("contradictions put what somebody said before what they did", async () => {
  const r = await run(7);
  for (let i = 0; i < r.citizens.length; i++) for (const c of contradictionsOf(r, i)) if (c.how !== "unseen" && c.how !== "denied") assert.ok(c.said.k < c.did.k || (c.said.k === c.did.k && c.said.id < c.did.id));
  const dead = r.citizens.findIndex((c: any) => c.diedAt); if (dead >= 0) assert.equal(personNow(r, dead).alive, false);
});

test("outcomes written to the person are retold of them, or not at all", () => {
  assert.equal(retell("they pull through", "Bea", "Finn"), "Finn pulled through");
  assert.equal(retell("you come back wounded", "Bea"), "Bea came back wounded");
  assert.equal(retell("you save; they notice you didn't come", "Bea", "Finn"), "Bea saved; Finn noticed Bea didn't come"); // the clause that cannot be said of them is left out, not the whole
});

test("the teller's check keeps what the facts say and drops what they do not", async () => {
  const r = await run(3);
  const k = 20; const b = seasonBrief(r, k);
  const f1 = factsAt(r, k).find((f) => b.labels["1"]?.id === f.id)!;
  const reply = `${f1.text} [1] Snow fell that night. [1] ${r.citizens.find((c: any, i: number) => !f1.names.includes(i))?.name.split(" ")[0]} watched it all. [1] Nobody wept. [2]`;
  const got = checkPassage(reply, b, r);
  assert.equal(got.kept, 1, JSON.stringify(got.checked));
  assert.ok(got.checked.flat().filter((l) => !l.ok).length === 3);
  assert.ok(owedTelling(emptyTelling(1), r, true).portraits.every((p) => p.final));
});

test("the pages render from any record, escape what they print, and never move", async () => {
  const r = await run(5);
  r.citizens[0].name = `Evil <img src=x onerror=alert(1)> Name`;
  const ctx = { r, telling: null, base: "", live: true, nextAt: Date.now(), cycle: 1 };
  for (const html of [townPage(ctx), yearsPage(ctx), personPage(ctx, r.citizens[0].id)!]) {
    assert.ok(!html.includes("<img src=x"), "escaped");
    assert.ok(!/setInterval|setTimeout|autoplay|<video|@keyframes/.test(html), "nothing moves");
  }
  assert.ok(played(r) === 60);
});
