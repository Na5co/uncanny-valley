// The story engine's newer parts: a secret coming out, labels the narrator cites, what the four may know, and he or she.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createChronicle, stepChronicle, saveWorld, loadWorld, owedPlain } from "../src/chronicle/sim.ts";
import { secretsOf, keepTurn, directorSystem } from "../src/chronicle/director.ts";
import { parseCited, chapterBrief, checkLine } from "../src/chronicle/teller.ts";
import { buildChronicleRecord } from "../src/chronicle/archive.ts";
import { shapeYears } from "../src/chronicle/worldsmith.ts";
import { liveSection } from "../src/chronicle/brain.ts";
import { premiseInside } from "../src/chronicle/inside.ts";
import { thirdPerson } from "../web/tell.mjs";
import { regender, sexOf } from "../web/pronoun.mjs";

const four = JSON.parse(readFileSync("scenarios/chronicle/the-four.json", "utf8"));
const company = JSON.parse(readFileSync("scenarios/cast/the-company.json", "utf8")).cast;

test("a secret comes out: the season does not throw, the deed is known, the one it was done to learns who", async () => {
  let checked = 0;
  for (let seed = 1; seed < 40 && checked < 3; seed++) {
    let w: any = createChronicle({ ...four, cast: company, castPick: 4, fill: { ...(four.fill ?? {}), count: 0 } }, seed);
    for (let i = 0; i < 40; i++) {
      if (!(await stepChronicle(w))) break;
      w = loadWorld(saveWorld(w), w.scenario); // the save splits shared objects: the exposure must reach every copy
      const sec = secretsOf(w).find((x) => { const d = w.byId.get(x.who).deeds.find((y: any) => `${x.who}:${y.tick}:${y.kind}:${y.target ?? "-"}` === x.id); return d?.target && w.byId.get(d.target)?.alive; });
      if (!sec) continue;
      keepTurn(w, { headline: "It comes out", text: "Word gets round.", exposes: sec.id } as any);
      await stepChronicle(w);
      const [who, tk, kind, tgt] = sec.id.split(":");
      const d = w.byId.get(who).deeds.find((y: any) => y.tick === +tk && y.kind === kind && y.target === tgt);
      assert.equal(d.known, true); assert.equal(d.witnessed, true);
      assert.ok(w.byId.get(tgt).suffered.filter((y: any) => y.tick === +tk && y.kind === kind).every((y: any) => y.known === true));
      assert.ok(w.acts[w.tick - 1].some((a: any) => a.kind === "exposed" && a.c === who));
      checked++; break;
    }
  }
  assert.ok(checked > 0, "no secret found to expose in 40 seeds");
});

test("the narrator's labels: Q-labels with letters are read whole", () => {
  const p = parseCited(`“If they count the book again,” Mara told herself. [Z, QZ] Earlier she had feared it. [F1, QF1] She signed. [7, Q7]`).paras.flat();
  assert.deepEqual(p.map((x) => x.c), [["Z", "QZ"], ["F1", "QF1"], ["7", "Q7"]]);
});

test("the four are never told what the years will bring", () => {
  const dice = ["famine first, then a hard winter, then war late", "plague early, a boom in the middle years, fire near the end", "war in the second year, famine in its wake, the black frost last", "a flood that takes the homes, then plague in the crowding, then a boom nobody trusts", "two famines, a quake between them, a short brutal war", "winter after winter, then plague, then a fire in the driest summer"];
  for (const t of dice) assert.equal(premiseInside(`${t[0].toUpperCase()}${t.slice(1)}.`), "", t);
  assert.equal(premiseInside("A flood, a plague, and a boom are coming through the years, and nobody is told when."), "");
  assert.equal(premiseInside("Four of them are the ones the recorder watches."), "");
  assert.equal(premiseInside("After the blackout, a dozen people live in a flooded underground station."), "After the blackout, a dozen people live in a flooded underground station.");
});

test("he and she: outcomes, and 'they' made his or hers only where it is one person's", () => {
  assert.equal(sexOf({ name: "Hedda Lun" }), "f"); assert.equal(sexOf({ name: "Otto Venn" }), "m");
  assert.equal(thirdPerson("They laugh you out; your own side calls you soft.", "Hedda", "", "f"), "They laugh Hedda out; her own side calls Hedda soft.");
  assert.equal(thirdPerson("Nobody will see what you write.", "Nell", "", "f"), "Nobody will see what Nell writes.");
  const P = [{ name: "Ines Carrow" }, { name: "Nell Ward" }];
  assert.equal(regender("Ines told themselves, “The clerk is gone. I will look after their own.”", P), "Ines told herself, “The clerk is gone. I will look after their own.”");
  assert.equal(regender("A few began to ask Ines for loans against their own rations.", P), "A few began to ask Ines for loans against their own rations.");
  assert.equal(regender("Nell and Ines told themselves nothing.", P), "Nell and Ines told themselves nothing.");
});

test("a death a scene brought about is told from that scene, never from the victim's work", async () => {
  let seen = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const w: any = createChronicle({ ...four, cast: company, castPick: 4, fill: { ...(four.fill ?? {}), count: 0 } }, seed);
    while (await stepChronicle(w)) {}
    for (const acts of w.acts) (acts ?? []).forEach((a: any, i: number) => {
      if (a.kind !== "death" || !a.how) return; const prev = acts[i - 1]; if (!prev?.dilemma || (prev.c !== a.c && prev.target !== a.c)) return;
      seen++; const o = String(prev.outcome);
      if (/\bhang/.test(o)) assert.equal(a.how, "was hanged");
      if (/taken away/.test(o)) assert.match(a.how, /taken away/);
      if (/stays dry/.test(o)) assert.match(a.how, /^drowned at /);
      if (/do not come back|first action/.test(o)) assert.match(a.how, /did not come back/);
      assert.doesNotMatch(a.how, /in the dark/);
    });
  }
  assert.ok(seen > 0, "no death by a scene in twelve runs");
});

test("last words are said aloud: quoted as said they pass the checker, as a thought they do not", async () => {
  let w: any, dk = -1;
  for (let seed = 1; seed < 30 && dk < 0; seed++) { w = createChronicle({ ...four, cast: company, castPick: 4, fill: { ...(four.fill ?? {}), count: 0 } }, seed);
    while (dk < 0 && await stepChronicle(w)) for (const a of w.acts[w.tick - 1] ?? []) if (a.kind === "death" && w.byId.get(a.c)?.named && dk < 0) { a.last = "Tell them the boat is theirs now."; dk = w.tick - 1; } }
  assert.ok(dk >= 0);
  const r = buildChronicleRecord(w, "mock"); const b = chapterBrief(r, Math.floor(dk / 4));
  const [V] = Object.entries(b.labels).find(([, v]: any) => v.kind === "last")!; const D = V.slice(1); const nm = String((b.labels as any)[D].text).split(" ")[0];
  assert.ok(checkLine({ t: `${nm}'s last words were “Tell them the boat is theirs now.”`, c: [D, V] }, b.labels, r).ok);
  assert.ok(!checkLine({ t: `“Tell them the boat is theirs now,” ${nm} thought.`, c: [D, V] }, b.labels, r).ok);
});

test("a new town's last hardship falls in the final act, in order; a malformed town is left for the validator", () => {
  const sc: any = { years: 15, epochs: [{ id: "a", kind: "flood", at: 8, seasons: 3, severity: 2 }, { id: "b", kind: "plague", at: 17, seasons: 4, severity: 3 }, { id: "c", kind: "winter", at: 30, seasons: 5, severity: 3 }] };
  shapeYears(sc); const at = sc.epochs.map((e: any) => e.at);
  assert.deepEqual([...at].sort((x, y) => x - y), at); assert.ok(at[2] >= 44 && at[2] <= 50, `last at ${at[2]}`); assert.ok(sc.epochs[2].seasons <= 3 && sc.epochs[2].severity <= 2);
  const bad: any = { years: 15, epochs: [{ id: "a", at: 8 }, { id: "b", at: "late" }] }; shapeYears(bad); assert.equal(bad.epochs[1].at, "late");
});

test("the director never steers an experiment, and its turn stays out of an experiment's scene", async () => {
  const w: any = createChronicle({ ...four, cast: company, castPick: 4, fill: { ...(four.fill ?? {}), count: 0 } }, 3);
  assert.doesNotMatch(directorSystem(w), /\n- (trolley|bystander|obedience|conformity|ultimatum):/);
  await stepChronicle(w); w.turns = { [w.tick]: { headline: "The watch wants a name", text: "They ask at every door." } };
  const s = w.souls.find((x: any) => x.named);
  assert.doesNotMatch(liveSection(w, s, { spec: { id: "x", experiment: { id: "e" } }, text: "", options: [] } as any), /The watch wants a name/);
  assert.match(liveSection(w, s, { spec: { id: "x" }, text: "", options: [] } as any), /The watch wants a name/);
});

test("a paying-back deed says it plainly, and one worded the old way is put right when the world loads", async () => {
  const old = "paid Hedda back for the time Hedda let Teo pass, though they had wronged them";
  assert.equal(owedPlain(old, "help"), "paid Hedda back for an old kindness");
  assert.equal(owedPlain(old, "betrayal"), "made Hedda pay for an old wrong");
  assert.equal(owedPlain("split the sack fairly with Hedda", "help"), "split the sack fairly with Hedda");
  const w: any = createChronicle({ ...four, cast: company, castPick: 4, fill: { ...(four.fill ?? {}), count: 0 } }, 2);
  await stepChronicle(w); const s = w.souls[0];
  const d = { tick: 1, kind: "help", actor: s.id, target: null, harm: 0, help: 0.35, text: old, witnessed: true };
  s.deeds.push(d); w.acts[0].push({ c: s.id, kind: "help", text: old });
  const back: any = loadWorld(saveWorld(w), w.scenario);
  assert.equal(back.souls[0].deeds.at(-1).text, "paid Hedda back for an old kindness");
  assert.equal(back.acts[0].at(-1).text, "paid Hedda back for an old kindness");
});
