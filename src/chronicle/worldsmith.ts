// The Architect, with nothing under it: no filesystem, no ledger on disk, no process to keep alive. Given the prompt as
// text and one scenario as a shape to copy, it asks the architect-tier model for a town — its places, its livelihoods,
// its fifteen years of trouble, its people and the dilemmas peculiar to it — and then puts that town through the same
// gauntlet the command line uses: static validation, then five seeds of fifteen years to see whether anyone lives.
//
// This is what makes a run unique. The four are drawn from the company, but the lane they are drawn into, the places
// they stand in, what the years do to them and the choices the town itself puts in front of them are written fresh.
import type { ChronicleScenario } from "./types.ts";
import { LIBRARY } from "./dilemmas.ts";
import { validateChronicle, soakChronicle, WHEN_FLAGS, TARGETS, EPOCH_KINDS, DEED_KINDS, CAUSES } from "./validate.ts";
import { FX } from "../validate.ts";
import { chat, parseJson, type LlmConfig, type Meter } from "../llm/client.ts";

/** The shape to copy, cut down to something a prompt can hold: a real town, three citizens, three epochs, one dilemma. */
export function schemaText(sample: ChronicleScenario): string {
  const trimmed = { ...sample, citizens: sample.citizens.slice(0, 2), epochs: sample.epochs.slice(0, 3), dilemmas: (sample.dilemmas ?? []).slice(0, 1) };
  const exampleDilemma = LIBRARY.find((d) => d.id === "wallet")!;
  return [
    `JSON shape — a real town, cut to three citizens, three epochs, one dilemma (output plain JSON, all fields):`, "", JSON.stringify({ ...trimmed, dilemmas: [exampleDilemma] }, null, 1), "",
    `Rules the validator enforces:`,
    `- mode "chronicle"; id a slug; years 5–30; fingerprint {setting, pressure, endingShape, dynamic}; socialQuestion {text, hypothesis}.`,
    `- locations ≥ 3 with id, name, tags (one tagged "home"), x/y 0–1; paths are pairs of location ids.`,
    `- jobs ≥ 2: id, name, at (location id), pay 0.03–0.3 per season, risk 0–0.2.`,
    `- epochs ≥ 3: id, kind (${EPOCH_KINDS.join(" | ")}), at (tick 2–years×4), seasons 1–8, severity 1|2|3, headline, text, fx (${FX.join(" | ")}).`,
    `- citizens ≥ 4 named: id, name, age 14–90, role, want, fear, traits {sociable, bold, loyal, restless} 0–1, home (location id or null), job (job id or null), partner (citizen id), children, ties [{to, affinity −1..1, why}]. fill.count so that named + fill is 12–60.`,
    `- dilemmas (optional, the town's own): id; when = flags all of which must hold, and the ONLY flags that exist are: ${WHEN_FLAGS.join(", ")}, ${EPOCH_KINDS.map((k) => `epoch:${k}`).join(", ")}, season:0, season:1, season:2, season:3 — invent no others; target (${TARGETS.join(" | ")}); weight 0–5; casual true for the quiet ones; text with {{target}} {{partner}} {{place}} {{season}}; options ≥ 2 (≥ 1 if casual) each {id, label, pull {trait or hunger/poverty/danger/family: −1..1}, outcomes [{chance (sum 1), text, self?, target?, deed? {kind: ${DEED_KINDS.join("|")}, harm, help, text}, world? {supply}, leave?, die?/targetDie? (${CAUSES.join(" | ")})}]}. Deltas: health, food, money, mood, children, tie, sick, home (a location id, null, "{{home}}" or "{{targetHome}}" to move in with the other party), job, partner.`,
    `- The trap the validator catches most: "die", "targetDie" and "leave" belong to the OUTCOME, never inside "self" or "target". Inside "self"/"target" the only keys allowed are the deltas just listed. Correct: {"chance": 0.3, "text": "the props give", "self": {"health": -0.4}, "die": "violence"}. Wrong: {"self": {"health": -0.4, "die": "violence"}}.`,
    `- Every id in a citizen's "ties" must be the id of a citizen you also wrote. Do not name anyone who is not in the list.`,
    `- "id" and "title" are this town's own, never the sample's. The title is what the town is called; the id is a slug of it.`,
    `- Scales: health/food/mood 0–1 (0.16 health lost per hungry season; death at 0.05); money 0–3 (a season's pay is 0.06–0.12); supply 0–1.`,
  ].join("\n");
}

export const libraryText = () => LIBRARY.map((d) => `- ${d.id} · when ${d.when.join("+")}${d.target ? ` · target ${d.target}` : ""} · "${d.text}"`).join("\n");

/** Split the prompt file's text into the system half and the inputs half, without reading it: the caller has it already. */
export function splitPromptText(text: string, firstInput = "SCHEMA"): { system: string; inputs: string } {
  const i = text.indexOf(`## ${firstInput}`);
  if (i < 0) throw new Error(`the architect prompt has no "## ${firstInput}" section`);
  const sys = text.slice(0, i); const j = sys.indexOf("## System");
  return { system: (j >= 0 ? sys.slice(j) : sys).trim(), inputs: text.slice(i) };
}
export const fillPrompt = (template: string, vars: Record<string, string>) => template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => vars[k] ?? "(none)");

// ---------- the dice the Architect must honour: a different world every time, not the model's favourite one ----------
const ERAS = ["a pit town in the 1840s", "a fishing island, 1890s", "a river port in a drought year, 1700s", "a mountain pass with one inn, medieval", "a besieged city quarter, 1600s", "a plantation under a dying landlord, 1780s", "a whaling station at the edge of the ice, 1830s", "a railway camp in a desert, 1870s", "a mill town on a poisoned river, 1900s", "a walled monastery and its village, 1300s", "a refugee camp on a border, 1940s", "a research station in the polar night, 1950s", "a caravan crossing a salt flat, 1500s", "a lifeboat colony on a reef after a wreck, 1810s", "a tenement block in a plague summer, 1660s", "a lumber camp cut off by snow, 1880s", "a delta village under a rising sea, near future", "an orbital habitat with one failing air plant, far future", "a quarantine ship anchored off a port, 1850s", "a hill fort under a warlord's tax, 900s", "a drowned coastal town after the sea rose, 2090s", "a bunker commune under a hill after the bombs, 2060s", "a village that outlived the cities after the Black Death, 1350s", "a desert outpost after the water wars, 2110s", "a mill town in the year without a summer, 1816", "a settlement in the ruins of a motorway services, years after the collapse", "an island under quarantine in a new pandemic, 2030s", "a greenhouse colony in a dust-bowl future, 2080s", "a mountain village after a volcanic winter, 530s", "a flooded underground station where the survivors live, after the blackout", "a border town the day after the empire fell, 470s", "a whaling port as the oil runs out, 1860s", "a company town on Mars that Earth has stopped answering, 2140s", "a frozen city in a nuclear winter, 1980s that never ended", "a nomad camp on the steppe after the horses sickened, 1200s", "an orbital habitat running out of air, 2200s", "a cathedral town after a meteor strike, 1400s", "a fenland village as the sea wall fails, 1950s"];
const LIVELIHOODS = ["the mine and the company store", "the boats and a cannery", "a single well and the water carriers", "the toll road and the inn's kitchen", "the last granary and the guard on it", "the loom and the merchant who buys", "the herd and the winter pasture", "the salt pans and the mule train", "the kiln and the clay pit", "the printing press and the censor"];
const KNOTS = ["everyone owes the same creditor", "two families share one roof and one debt", "the foreman is one of them", "a stranger arrives with food and a price", "the store is rationed by a committee of three", "a child is missing and the town has decided who took it", "a will names one of them and not the others", "the priest keeps the only ledger", "a soldier has deserted and is hiding in the lane", "the doctor is the only one who can read"];
const TROUBLE = ["famine first, then a hard winter, then war late", "plague early, a boom in the middle years, fire near the end", "war in the second year, famine in its wake, the black frost last", "a flood that takes the homes, then plague in the crowding, then a boom nobody trusts", "two famines, a quake between them, a short brutal war", "winter after winter, then plague, then a fire in the driest summer"];
const TEMPERS = ["the loyal one (loyal .95, bold .45)", "the bold one (bold .95, loyal .3, restless .75)", "the careful one (bold .1, sociable .2)", "the one everyone likes (sociable .95, loyal .65)", "the restless one (restless .95, loyal .4)", "the proud one (bold .8, sociable .3, loyal .5)", "the frightened one (bold .05, loyal .8)", "the schemer (sociable .8, loyal .15, bold .6)", "the saint (loyal .9, sociable .9, bold .3)", "the loner (sociable .05, restless .6, bold .7)"];
/** every town stands at the end of something: its world about to end, or already over and being lived in the ruins of */
const FRAMES = ["before the end: the world this town belongs to is about to end, and the signs are there for anyone who looks", "after the end: the world this town belonged to has already ended, and these are the people living on in what is left"];
const TONES = ["bleak and dry", "tender under the hardness", "gallows humour", "biblical", "plain as a court record", "folk-tale plain"];
export interface Variety { seed: string; era: string; livelihood: string; knot: string; trouble: string; tempers: string[]; tone: string; frame?: string }
/** roll the dice for a new world; the same seed (a date, say) rolls the same world, so a daily run is reproducible */
/** The dice. The seed is hashed and then mixed properly (mulberry32 after a murmur finaliser): the old mixer let two
 *  seeds that differed only in the date land on the same first picks, and two towns in a row came out as the same
 *  quarantine ship. `avoid` is the settings of the towns just before, which are never drawn again while others remain. */
export function rollVariety(seed = new Date().toISOString().slice(0, 10), avoid: string[] = []): Variety {
  let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  let a = h >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const fresh = <T,>(xs: T[]) => { const left = xs.filter((x) => !avoid.includes(String(x))); return pick(left.length ? left : xs); };
  const tempers: string[] = []; while (tempers.length < 4) { const t = pick(TEMPERS); if (!tempers.includes(t)) tempers.push(t); }
  return { seed, era: fresh(ERAS), livelihood: fresh(LIVELIHOODS), knot: fresh(KNOTS), trouble: fresh(TROUBLE), tempers, tone: pick(TONES), frame: pick(FRAMES) };
}
export const varietyText = (v: Variety) => [`seed ${v.seed}`, `setting: ${v.era}`, ...(v.frame ? [`frame: ${v.frame}. Make it felt in the premise, the places and the years.`] : []), `livelihood: ${v.livelihood}`, `the knot: ${v.knot}`, `the years' trouble: ${v.trouble}`, `the four temperaments: ${v.tempers.join("; ")}`, `tone: ${v.tone}`].join("\n");

/** One "when" flag, made legal or dropped. Everything here is a slip with one obvious reading: an epoch named by its id
 *  rather than its kind, a job id written with underscores, "food" for "hasFood". A flag with no reading is dropped,
 *  which loosens the dilemma — which is what the soak would have told it to do anyway. */
function whenFlag(raw: string, kindOf: Map<string, string>, jobIds: Set<string>): string | null {
  const f = String(raw ?? "").trim();
  if (WHEN_FLAGS.includes(f) || /^season:[0-3]$/.test(f)) return f;
  const ep = /^epoch:(.+)$/.exec(f);
  if (ep) { const k = kindOf.get(ep[1]) ?? ep[1]; return EPOCH_KINDS.includes(k) ? `epoch:${k}` : null; }
  const jb = /^job:(.+)$/.exec(f);
  if (jb) { const id = jb[1].replace(/_/g, "-"); return jobIds.has(id) ? `job:${id}` : null; }
  const bare = f.toLowerCase().replace(/[^a-z]/g, "");
  const near = WHEN_FLAGS.find((w) => w.toLowerCase() === bare || w.toLowerCase() === `has${bare}` || w.toLowerCase().replace(/^has/, "") === bare);
  return near ?? null;
}

export interface SmithInput {
  promptText: string;            // prompts/architect-chronicle.md, whole
  sample: ChronicleScenario;     // the shape to copy
  varietyText: string;           // the dice: era, livelihood, knot, trouble, temperaments, tone
  question?: string;             // the social question, if one is being asked
  ledger?: string;               // the worlds already written, so this one differs from them
  failureReport?: string;        // what the gauntlet said last time
  previous?: unknown;            // and the JSON that said it, to be fixed rather than started over
  cast?: ChronicleScenario["cast"]; castPick?: number; castFile?: string; /* the company is kept; only the town is new */
}

/** The company travels; the town does not. A cast member carries a home and a job by id, and those ids belong to the
 *  lane they were written for — drop them into a polar station and they are homeless and out of work. This settles each
 *  of them into the new town: a roof (spread across the places people live in, so the lane is not one room), and a trade
 *  the town actually has. It is deterministic on their id, so the same person lands in the same doorway every run. */
export function fitCast(sc: ChronicleScenario, cast: NonNullable<ChronicleScenario["cast"]>): NonNullable<ChronicleScenario["cast"]> {
  const homes = sc.locations.filter((l) => l.tags?.includes("home"));
  // A town may tag only one place "home" — a station, a ship, a block. Put sixteen people in it and everyone is always
  // in the same room, and who was watching stops meaning anything, which is the thing this whole place is for. So the
  // lane spreads over every place it has as soon as there is more than one.
  const roofs = (homes.length > 1 ? homes : sc.locations).map((l) => l.id);
  const trades = (sc.jobs ?? []).map((j) => j.id);
  const h = (x: string) => { let n = 2166136261; for (const ch of x) { n ^= ch.charCodeAt(0); n = Math.imul(n, 16777619) >>> 0; } return n >>> 0; };
  return cast.map((c) => ({
    ...c,
    home: roofs.length ? roofs[h(c.id + "home") % roofs.length] : null,
    job: c.job && trades.length ? trades[h(c.id + "job") % trades.length] : null,
  }));
}

export interface SmithResult { ok: boolean; report: string; scenario?: ChronicleScenario; raw?: unknown; usage?: { in: number; out: number; costUsd: number } }

/** The years have a shape: the last hardship comes in the final act (from season 46), not years before the end, so a run
 *  does not fizzle out; every hardship's place is stretched in proportion, keeping their order, and the last is kept
 *  short enough to be survived. Only for a town not yet played. */
export function shapeYears(sc: ChronicleScenario) {
  if (!Array.isArray(sc.epochs) || !sc.epochs.every((e) => e && typeof e === "object" && Number.isFinite(e.at))) return; /* a malformed town goes to the validator as it came */
  const ep = [...sc.epochs].sort((a, b) => a.at - b.at); const ticks = (Number(sc.years) || 15) * 4; if (ep.length < 2) return;
  const last = ep[ep.length - 1]; const target = Math.min(ticks - 10, 46 + ((last.at * 7) % 5));
  if (last.at >= target - 2) return;
  const first = ep[0].at; const scale = (target - first) / Math.max(1, last.at - first);
  for (const e of ep) e.at = Math.round(first + (e.at - first) * scale);
  last.seasons = Math.min(last.seasons ?? 3, 3); if ((last as any).severity > 2) (last as any).severity = 2;
}
/** One attempt: ask, parse, validate, soak. A failure comes back with the report the next attempt should be given. */
export async function smithWorld(cfg: LlmConfig, o: SmithInput, meter?: Meter): Promise<SmithResult> {
  const { system, inputs } = splitPromptText(o.promptText);
  const user = fillPrompt(inputs, {
    SCHEMA: schemaText(o.sample), LIBRARY: libraryText(), LEDGER: o.ledger || "(empty)",
    QUESTION: o.question ?? "(none — choose one a chronicle can test)",
    VARIETY: o.varietyText,
    FAILURE_REPORT: o.failureReport ? `${o.failureReport}${o.previous ? `\n\nYOUR PREVIOUS JSON (fix it, do not start over):\n${JSON.stringify(o.previous)}` : ""}` : "(none — first attempt)",
  });
  // No thinking, and room for a whole town. The architect tier spends its budget reasoning before it writes and will
  // spend all of it: at "low" it filled twelve thousand tokens with thought and emitted no JSON at all. The prompt is
  // prescriptive enough to be followed straight, and what it is asked for is long.
  const r = await chat({ model: cfg.architectModel, system, user, json: true, temperature: 1, maxTokens: 24000, reasoningEffort: "none", meter }, cfg);
  const usage = { in: r.usage.promptTokens, out: r.usage.completionTokens, costUsd: r.usage.costUsd };
  let raw: unknown;
  try { raw = parseJson(r.text); } catch (e) { return { ok: false, report: `The reply was not JSON (${(e as Error).message}; finish: ${r.finishReason}, ${r.usage.completionTokens} tokens out). Answer with one JSON object and nothing else.`, usage }; }

  const town = raw as any;
  if (!town || typeof town !== "object") return { ok: false, raw, usage, report: "The reply was not an object. Answer with one JSON object describing the town." };
  if (town.id === o.sample.id || town.title === o.sample.title) return { ok: false, raw, usage, report: `You returned the sample's own id and title ("${o.sample.id}" / "${o.sample.title}"). This is a different town: give it its own title and an id that is a slug of it.` };
  // Two repairs before the validator sees it. Both are things the model does again and again, and both mean exactly one
  // thing, so refusing a whole town over them only spends another try to be told the same again.
  //
  //   a "when" of epoch:<the id of one of its own epochs>  →  epoch:<that epoch's kind>
  //   "die"/"targetDie"/"leave" written inside "self"/"target"  →  lifted to the outcome, where they belong
  const kindOf = new Map<string, string>((town.epochs ?? []).map((e: any) => [String(e.id), String(e.kind)]));
  const jobIds = new Set<string>((town.jobs ?? []).map((j: any) => String(j?.id)));
  for (const d of town.dilemmas ?? []) {
    if (Array.isArray(d?.when)) {
      d.when = d.when.map((f: string) => whenFlag(f, kindOf, jobIds)).filter(Boolean) as string[];
      if (!d.when.length) d.when = ["adult"]; /* a dilemma with no condition left is one anybody may meet */
    }
    for (const opt of d?.options ?? []) for (const out of (opt as any)?.outcomes ?? []) {
      for (const side of ["self", "target"] as const) {
        const delta = (out as any)[side]; if (!delta || typeof delta !== "object") continue;
        for (const key of ["die", "targetDie", "leave"]) if (key in delta) {
          if ((out as any)[key] === undefined) (out as any)[key] = key === "die" && side === "target" ? undefined : delta[key];
          if (key === "die" && side === "target" && (out as any).targetDie === undefined) (out as any).targetDie = delta[key];
          delete delta[key];
        }
      }
    }
  }

  // and a third kind: a value the model invented because it was plausible — a pull called "selfish", a death by "fire",
  // a deed kind of "cruelty". Each time it is a different one, and each time it costs a whole try to be told. The legal
  // sets are small and known, so unknown values are coerced to the nearest one that exists, or dropped where there is no
  // nearest. This is the line the gauntlet holds: mechanical slips are repaired, judgements about the town are refused.
  const PULLS_OK = new Set(["sociable", "bold", "loyal", "restless", "hunger", "poverty", "danger", "family"]);
  const CAUSE_NEAR: Record<string, string> = { fire: "violence", burn: "violence", burns: "violence", drowning: "exposure", drowned: "exposure", cold: "exposure", frost: "exposure", accident: "violence", injury: "violence", wound: "violence", wounds: "violence", murder: "violence", infection: "sickness", fever: "sickness", plague: "sickness", disease: "sickness", starvation: "hunger", famine: "hunger", thirst: "hunger", age: "old age", "childbirth complications": "childbirth" };
  const nearCause = (x: unknown) => { const k = String(x ?? "").toLowerCase(); return CAUSES.includes(k) ? k : (CAUSE_NEAR[k] ?? "violence"); };
  const nearDeed = (x: unknown, harm: number) => { const k = String(x ?? "").toLowerCase(); return DEED_KINDS.includes(k) ? k : harm >= 0.1 ? "violence" : "help"; };
  for (const d of town.dilemmas ?? []) {
    if (d?.target !== undefined && !TARGETS.includes(d.target)) delete (d as any).target;
    for (const opt of d?.options ?? []) {
      if ((opt as any)?.pull && typeof (opt as any).pull === "object") for (const k of Object.keys((opt as any).pull)) if (!PULLS_OK.has(k)) delete (opt as any).pull[k];
      for (const out of (opt as any)?.outcomes ?? []) {
        for (const k of ["die", "targetDie"]) if ((out as any)[k] !== undefined && (out as any)[k] !== false) (out as any)[k] = nearCause((out as any)[k]);
        if ((out as any)?.deed) (out as any).deed.kind = nearDeed((out as any).deed.kind, Number((out as any).deed.harm ?? 0));
      }
    }
  }
  for (const e of town.epochs ?? []) if ((e as any)?.fx !== undefined && !FX.includes(String((e as any).fx))) delete (e as any).fx;

  // and a fourth: a tie or a marriage pointing at somebody who was never written. The relationship is not recoverable,
  // but it is also not a broken town — the person simply does not know the name. Drop it.
  const people = new Set<string>((town.citizens ?? []).map((c: any) => String(c?.id)));
  for (const c of town.citizens ?? []) {
    if (Array.isArray(c?.ties)) c.ties = c.ties.filter((t: any) => people.has(String(t?.to)) && t?.to !== c.id);
    if (c?.partner && !people.has(String(c.partner))) c.partner = null;
  }

  shapeYears(town as ChronicleScenario);
  const withCast = { ...town, ...(o.cast ? { cast: fitCast(town as ChronicleScenario, o.cast), castPick: o.castPick ?? 4, castFile: o.castFile } : {}) } as ChronicleScenario;
  const v = validateChronicle(withCast);
  if (!v.ok) return { ok: false, raw, usage, report: `Static validation failed:\n${v.errors.map((e) => `- ${e}`).join("\n")}${v.warnings.length ? `\nWarnings:\n${v.warnings.map((w) => `- ${w}`).join("\n")}` : ""}` };

  let town2 = withCast;
  let sk = await soakChronicle(town2, 5, { dominance: 0.78 });

  // A dilemma whose "when" hardly ever holds is dead weight, not a broken town, and asking the model to loosen it gets
  // the same dilemma back twice. Cut them and soak again; if the town stands without them, it stands.
  const dead = sk.problems.map((p) => /^dilemma "([^"]+)" was offered \d+ times/.exec(p)?.[1]).filter(Boolean) as string[];
  let cut = "";
  if (dead.length && dead.length === sk.problems.length) {
    town2 = { ...town2, dilemmas: (town2.dilemmas ?? []).filter((d) => !dead.includes(d.id)) };
    cut = ` (${dead.length} of its own choices never came up and were cut: ${dead.join(", ")})`;
    sk = await soakChronicle(town2, 5, { dominance: 0.78 });
  }
  if (sk.problems.length) return { ok: false, raw, usage, report: [
    `The world is valid but does not hold up over five fifteen-years:`,
    ...sk.problems.map((p) => `- ${p}`), "", ...sk.lines, "",
    `Change the numbers, not the story. The levers are: an epoch's "severity" (1–3) and "seasons" (how long it lasts) and how far apart the epochs sit in "at"; "jobs[].pay" (0.03–0.3 a season, which is what stands between people and hunger); "jobs[].risk"; and the "chance" on a lethal outcome. If one cause of death dominates, shorten or soften the epoch that causes it and lengthen another; if too many live, harden one; if too few, raise pay.`,
  ].join("\n") };

  return { ok: true, scenario: town2, raw, usage, report: `${sk.lines.join("\n")}${cut}` };
}
