// The director: every season, before the four act, the world moves on its own. Given what has happened and how the town
// stands, a model writes the season's turn — something that happens that none of the four chose: a ship, a rumour, an
// order from above, a death on the other side of the wall, a storm, a stranger — with small effects on the town and the
// kinds of choices it makes likely. The simulation applies it; the decisions then happen inside it. So the story has a
// plot that the decisions bend, and that no decision controls.
//
// The turn may not kill or move one of the four, may not decide anything for them, and may not undo what happened; its
// effects are clamped here, in code, whatever the model writes.
import { makeRng } from "../rng.ts";
import { sexOf, pro, theyAs } from "../../web/pronoun.mjs";
import type { Chronicle } from "./sim.ts";
import { LIBRARY } from "./dilemmas.ts";
import { chat, parseJson, type LlmConfig, type Meter } from "../llm/client.ts";

export interface Turn { headline: string; text: string; supply?: number; mood?: number; sick?: string[]; favour?: string[]; touch?: { id: string; mood: number; why: string }[];
  /** a set-up the world will have to pay off: "a debt will be called", due in so many seasons */
  sets?: { what: string; in: number }; closes?: string;
  /** a secret of the four's that comes out this season: the deed's id, "who:tick:kind" */
  exposes?: string }
/** a set-up the director opened, and when it has to be paid off */
export interface Thread { id: string; what: string; at: number; due: number; closed?: number }

/** a deed as older records worded it, with "they" made the one it means: the one it was done to where the card meant
 *  them ("fed Gil when they were starving"), else the one who did it ("held their tongue") */
function deedWords(text: string, s: any, v: any): string {
  const N = first(s.name), T = v ? first(v.name) : "someone", tp = v ? pro(v) : null;
  const t = String(text).replace(/though they had wronged them/, `though ${T} had wronged ${N}`)
    .replace(/\b(when|as|while) they (collapsed|died|were starving|starved)\b/, (_m: string, w: string, x: string) => `${w} ${tp ? tp.he : "they"} ${x === "were starving" ? "was starving" : x}`)
    .replace(/with them inside/, `with ${tp ? tp.him : "them"} inside`).replace(/from their store/, "from the store");
  return theyAs(`${N} ${t}`, s);
}
/** what the four did that nobody saw, and the town does not know yet: the reader knows, which is the point */
export function secretsOf(w: Chronicle): { id: string; who: string; text: string; tick: number }[] {
  const out = (w as any).exposed as string[] | undefined; const done = new Set(out ?? []);
  // a harm nobody saw, or a kindness nobody saw (the slate that stood alone for someone): both can come out
  return w.souls.filter((s) => s.named && s.alive).flatMap((s) => s.deeds.filter((d) => (!d.witnessed || d.known === false) && ((d.harm >= 0.2 && d.harm < 0.6) || d.help >= 0.3) && w.tick - d.tick <= 12)
    .map((d) => { const v = d.target ? w.byId.get(d.target) : null; return { id: `${s.id}:${d.tick}:${d.kind}:${d.target ?? "-"}`, who: s.id, text: `${deedWords(d.text, s, v)}${d.known === false && v?.alive ? ` (${first(v.name)} does not know who it was)` : ""}`, tick: d.tick }; }))
    .filter((x) => !done.has(x.id) && !done.has(x.id.split(":").slice(0, 3).join(":")))
    // the newest two of each person, then the newest four in all: nobody's secrets crowded out by the order of the cast
    .filter((x, _, all) => all.filter((y) => y.who === x.who && y.tick > x.tick).length < 2).sort((a, b) => a.tick - b.tick).slice(-4);
}
export const openThreads = (w: Chronicle): Thread[] => (((w as any).threads ?? []) as Thread[]).filter((x) => x.closed == null && w.tick + 1 - x.due <= 3); /* one never paid off in three seasons past due has lapsed */

const SEASONS = ["spring", "summer", "autumn", "winter"];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
const first = (n: string) => String(n ?? "").split(" ")[0];

export const DIRECTOR_SYSTEM = [
  "You direct the world of a story. Each season you write what happens to the town that nobody in it chose — the thing that moves the plot on. Four people live there; their decisions are theirs, never yours.",
  "",
  "WHAT A TURN IS: one event this season, beyond the four's control, that grows out of what has happened (their decisions, the hardship, the town's state) and gives the season a direction: a cart or a boat or a stranger comes, or does not; an order comes down from above, a rumour spreads about something one of them did, a stranger arrives, a storm, a quarrel between other families, a price rises, a debt is called, someone outside the four falls ill, a letter, a theft nobody owns up to.",
  "VARY IT. The hardships (famine, sickness, war, winter) already come on their own; you are not there to add to them. Most turns should be about people, not food: a rumour, a quarrel, a debt, a stranger, an accusation, a kindness from outside, good news that brings its own trouble. Never two turns in a row about rations, stores or food. When the stores are low, the world may bring relief or leave them alone, never cut them further.",
  "Make it follow from the record: if one of them did something that others saw, the town may talk; if the stores are low, prices climb; if a hardship is coming, let the first signs show. Surprise the reader, but never contradict what happened.",
  "",
  "THE WORLD MAY ACT ON THEM: a search, an accusation, a rumour, a fine, a ration cut, a summons — but only for something they really did, as it is written under WHAT THE FOUR DID LATELY. Say it as what the town does to them (\"the council cuts Hedda's ration\"), never as something they do.",
  "YOU MAY NOT: kill, injure, marry or move any of the four; make any of them do, say, think or feel anything, in any tense (not \"after she speaks\", not \"he refuses\"); give them a past the record does not have; invent a new named person; undo or change anything that has happened. Other townsfolk are unnamed (\"a family down the way\", \"whoever keeps the stores\"). Use this town's own places and trades, never ones it does not have (no pier in a mine, no harbour in a desert).",
  "",
  "ANSWER WITH JSON ONLY:",
  "{\"headline\": \"a newspaper headline of two to six words, plain\", \"text\": \"one or two short, plain sentences: what happens this season and what it means for the town\", \"supply\": number from -0.15 to 0.15 (what it does to the town's food stores; 0 if nothing), \"mood\": number from -0.1 to 0.1 (what it does to everyone's spirits), \"sick\": [ids of the four it makes sick, only if it is a sickness, at most one], \"favour\": [up to three choice ids from the list that this event makes likely this season], \"touch\": [{\"id\": one of the four, \"mood\": -0.15 to 0.15, \"why\": \"a few words\"}] (who it lands on hardest; may be empty), \"sets\": optional {\"what\": \"...\", \"in\": 1-4}, \"closes\": optional thread id, \"exposes\": optional secret id, \"kind\": the kind of turn you wrote}",
  "Plain words: no poetry, no metaphors. The headline is what a person in the town would say happened, in six words at most: \"A riverman wants the well\", \"The council counts the stores\", \"Fever at the far end\".",
  "CHALLENGES. Some turns put a hard question to one of the four: the council asks them to sign something, a neighbour begs them for help, a debt is called in, the watch wants a name. The world asks; what they answer is theirs, in the season that follows. Name the choice it makes likely in \"favour\".",
  "",
  "SET-UPS AND PAY-OFFS. A good story plants things and pays them off. You may open ONE thread in a turn: something the town now knows is coming (\"the council will count the stores in two seasons\", \"the lender says the debt falls due at midsummer\"), with \"sets\": {\"what\": \"...\", \"in\": 1 to 4 seasons}. When a thread is DUE, this season's turn must pay it off: say what happened, and give its id in \"closes\". Never leave a due thread open. Keep at most two open.",
  "SECRETS. Under SECRETS are things one of the four did that nobody saw: harms, and sometimes a kindness done in secret. Where it says someone does not know who it was, bringing it out changes how those two stand. The reader knows; the town does not. Now and then, when it would hit hardest, let one come out: someone finds it, someone talks, the evidence turns up. Give its id in \"exposes\" and tell how it came out, as the world acting on them. Not every season: a secret kept a while is worth more.",
].join("\n");

/** The kinds of thing the world does, dealt like cards without putting them back, so a run is not a council on a loop */
export const TURN_KINDS = ["a stranger arrives", "trade or prices change", "an accident at work (not one of the four)", "the weather, or something built, fails", "a quarrel between other families", "an order from an authority outside the town", "a kindness from outside", "a rumour spreads", "a loss in the town (not one of the four)", "news from elsewhere", "a challenge: a hard question put to one of the four by the town (the council asks, a neighbour begs, a debt is called), which they must answer themselves"];
export function dealtKind(w: Chronicle): string {
  const n = Object.keys((w as any).turns ?? {}).length; const round = Math.floor(n / TURN_KINDS.length);
  const r = makeRng(w.seed).fork(`deck:${round}`); const deck = TURN_KINDS.slice(); for (let i = deck.length - 1; i > 0; i--) { const j = r.int(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck[n % deck.length];
}
/** the three acts of a run: setting things up, the pressure, and the end */
function actOf(w: Chronicle): string {
  const t = w.tick + 1; const left = w.ticks - t + 1;
  if (t > w.ticks - 16) return `ACT III, THE END (${left} season${left === 1 ? "" : "s"} left, this one included): close every open thread; if a secret is still kept, now is the time it can come out; put the survivors in front of each other; bring the hardest question of the run. No new threads that could not be paid off before the end.`;
  if (t > 20) return "ACT II, THE PRESSURE: raise the stakes the first years set up; debts fall due, rumours find their people, the town's patience runs out.";
  return "ACT I, THE SETTING UP: show what this place is and what it runs on; plant things that can come back later.";
}
/** what the director is shown: the town, where the story has got to, and the choices the season can bring */
export function directorBrief(w: Chronicle): string {
  const sc = w.scenario; const t = w.tick + 1; const k = t - 1; const four = w.souls.filter((s) => s.named);
  const when = (kk: number) => `year ${Math.floor(kk / 4) + 1}, ${SEASONS[kk % 4]}`;
  const name = (id: string) => w.byId.get(id)?.name ?? id;
  const recent: string[] = [];
  for (let kk = Math.max(0, k - 3); kk < k; kk++) for (const a of w.acts[kk] ?? []) {
    const s = w.byId.get(a.c); if (!s?.named || a.quiet || a.life) continue;
    if (a.kind === "death") recent.push(`${when(kk)}: ${name(a.c)} died (${a.text}).`);
    else if (a.situation && a.choice) recent.push(`${when(kk)}: ${first(name(a.c))} — ${a.text}${a.target ? ` (with ${first(name(a.target))})` : ""}${a.seen ? `, seen by ${a.seen}` : ", unseen"}.`);
  }
  const past = Object.entries((w as any).turns ?? {}).map(([tk, v]: any) => ({ k: +tk - 1, v })).filter((x) => x.k < k).slice(-8);
  const turns = past.map((x) => `${when(x.k)}: ${x.v.headline}`);
  // the words the last turns keep using, and the people they keep landing on: to be let go of this season
  const STOP = new Set(["that", "this", "with", "from", "their", "they", "them", "have", "will", "into", "over", "after", "town", "season", "year", "comes", "come", "goes", "been", "what", "when", "some", "more", "less", "than"]);
  const wordsOf = (h: string) => new Set(String(h).toLowerCase().match(/[a-z]{4,}/g)?.filter((x) => !STOP.has(x) && !four.some((s) => first(s.name).toLowerCase() === x)) ?? []);
  const last3 = past.slice(-3).map((x) => wordsOf(x.v.headline)); const worn = [...new Set(last3.flatMap((x) => [...x]))].filter((x) => last3.filter((y) => y.has(x)).length >= 2);
  const leaned = four.filter((s) => s.alive).map((s) => ({ n: first(s.name), c: past.filter((x) => (x.v.touch ?? []).some((t: any) => t.id === s.id) || new RegExp(`\\b${first(s.name)}\\b`).test(`${x.v.headline} ${x.v.text}`)).length })).filter((x) => x.c >= 3);
  const pop = w.population.at(-1);
  const epochNow = w.activeEpochs.map((e) => e.headline).join(" ");
  const next = sc.epochs.filter((e) => e.at > t).sort((a, b) => a.at - b.at)[0];

  const state = four.map((s) => `- ${s.id} (${s.name}, ${Math.floor(s.age)}, ${s.role}): ${s.alive ? `${s.food < 0.12 ? "hungry, " : ""}${s.sick ? "sick, " : ""}${!s.home ? "no roof, " : ""}${(s.mood ?? 0) <= -0.25 ? "low, " : ""}${s.money < 0.15 ? "no money" : "getting by"}` : "dead"}`);
  return [`THIS SEASON: ${when(k)}.`, actOf(w), `THIS SEASON'S TURN, as dealt: ${dealtKind(w)}. Write that kind of thing, made to fit this town; you may swap it once if it cannot fit, and say which kind you used in "kind". A thread that falls due, or a secret coming out, may take its place.`,
    worn.length ? `AVOID IN THE HEADLINE (the last turns keep saying it): ${worn.join(", ")}` : "", leaned.length ? `The world has leaned on ${leaned.map((x) => `${x.n} (${x.c} of the last 8 turns)`).join(", ")}: let someone else carry this one, unless a due thread or a secret is theirs.` : "", epochNow ? `Going on now: ${epochNow}` : "No hardship is going on now.", next ? `Coming (the town does not know): ${next.headline} — in ${next.at - t} seasons.` : "",
    pop ? `The town: ${pop.alive} alive, ${pop.dead} dead, ${pop.starving} hungry, ${pop.sick} sick; the food stores ${w.supply >= 0.75 ? "well stocked" : w.supply >= 0.5 ? "half full" : w.supply >= 0.25 ? "running low" : "nearly empty"}.` : "", "",
    "THE FOUR:", ...state, "",
    turns.length ? "WHAT THE WORLD DID IN THE SEASONS BEFORE (do not repeat these):" : "", ...turns, "",
    "WHAT THE FOUR DID LATELY:", ...(recent.length ? recent.slice(-10) : ["nothing yet"]), "",
    ...threadLines(w, t), ...secretLines(w, when), "Write this season's turn."].filter((x) => x !== "").join("\n");
}

function threadLines(w: Chronicle, t: number): string[] {
  const open = openThreads(w); if (!open.length) return ["OPEN THREADS: none. You may open one."];
  const due = open.filter((x) => x.due <= t);
  return ["OPEN THREADS (you set these up; the reader is waiting for them):", ...open.map((x) => `- ${x.id}: ${x.what} — ${x.due <= t ? "DUE NOW: this turn must pay it off and close it" : `due in ${x.due - t} season${x.due - t === 1 ? "" : "s"}`}`),
    ...(due.length ? [`This season's turn MUST close ${due.map((x) => x.id).join(" and ")}.`] : [])];
}
function secretLines(w: Chronicle, when: (k: number) => string): string[] {
  const xs = secretsOf(w); if (!xs.length) return [];
  return ["SECRETS (done unseen; the town does not know, the reader does):", ...xs.map((x) => `- ${x.id}: ${x.text} (${when(x.tick - 1)})`)];
}
/** one of the four, by name or as he or she, as the one doing something: "after she speaks", "Otto refuses". Being done
 *  to ("Otto is questioned", "Hedda's ration is cut") and having ("Hedda has less to eat") are the world's to say. */
const IRREGULAR = "took|gave|went|came|stole|said|told|ran|left|hid|fought|sold|bought|made|got|kept|spoke|swore|struck|broke|threw|found|knew|thought|felt|chose|refuses|begs|asks|says|speaks|tells|goes|comes|takes|gives|steals|runs|hides|fights|sells|buys|makes|gets|keeps|swears|strikes|breaks|finds|knows|thinks|feels|chooses|decides|decided|agrees|agreed|admits|admitted|denies|denied|confesses|confessed";
export function actsForThem(w: Chronicle, text: string): string | null {
  const names = w.souls.filter((s) => s.named).map((s) => first(s.name)).filter(Boolean);
  const subj = `(?:${[...names, "he", "she", "He", "She"].join("|")})`;
  const m = new RegExp(`\\b${subj}\\s+(?:(?:also|then|still|finally|quietly|openly|never)\\s+)?(?:${IRREGULAR})\\b`).exec(text)
    ?? new RegExp(`\\b${subj}\\s+(?!is\\b|was\\b|has\\b|had\\b|needs\\b|seems\\b|looks\\b|lies\\b)([a-z]+ed)\\b`).exec(text);
  return m ? m[0] : null;
}
/** one of the four blamed, fined or found short for a wrong, when they have done no harm at all in three years: the world
 *  inventing guilt (run 7: "Hedda's shortfall found", with no theft anywhere in the record) */
export function framedFor(w: Chronicle, text: string): string | null {
  // blamed: the name is the one accused, fined, docked, punished, or has the shortfall; not the victim, not "caught the fever"
  const sentences = String(text).split(/(?<=[.!?])\s+/); let last = "";
  for (const s of w.souls.filter((x) => x.named && x.alive)) {
    const n = first(s.name); const pr = sexOf(s) === "f" ? "She|Her" : "He|His";
    const blamed = new RegExp(`\\b(accus\\w*|blam\\w*|fin(?:e|es|ed)|dock\\w*|charg\\w*|punish\\w*|suspect\\w*)\\s+(?:\\w+\\s+){0,3}${n}\\b|\\b${n}(?:'s)?\\s+(?:\\w+\\s+){0,2}(?:is|was|are|were|gets|got)\\s+(?:\\w+\\s+)?(accused|blamed|fined|docked|charged|punished|suspected)\\b|\\b${n}'s\\s+(?:\\w+\\s+)?(shortfall|theft|guilt)\\b`, "i");
    const blamedHer = new RegExp(`^(?:${pr})\\b[^.]{0,40}\\b(is|was)\\s+(accused|blamed|fined|docked|charged|punished)\\b`, "i");
    let hit = false; last = "";
    for (const sn of sentences) { if (blamed.test(sn) || (new RegExp(`\\b${n}\\b`).test(last) && blamedHer.test(sn))) hit = true; last = sn; }
    if (hit && !s.deeds.some((d) => d.harm >= 0.2 && w.tick - d.tick <= 12)) return n;
  }
  return null;
}
/** the part of the prompt that does not change within a run — the rules, the town, the choices a season can bring — so
 *  the provider serves it from cache and a turn costs about what its own few lines cost */
export function directorSystem(w: Chronicle): string {
  const sc = w.scenario;
  const lib = [...LIBRARY, ...(sc.dilemmas ?? [])].filter((d) => !d.quiet && !d.experiment) /* the experiments come on their own schedule: the director never steers one */.map((d) => `- ${d.id}: ${String(d.text).replace(/\{\{[a-z]+\}\}/g, "someone").slice(0, 90)}`);
  return [DIRECTOR_SYSTEM, "", `THE TOWN: ${sc.title}. ${sc.premise}`, `The places: ${sc.locations.map((l) => l.name).join(", ")}.`, "", "THE CHOICES A SEASON CAN BRING (ids for favour):", ...lib].join("\n");
}
/** ask for the season's turn and make it safe: clamp every number, keep only real ids, drop anything that names the four
 *  as doing something (the check is crude on purpose: a turn that is unsure is better left plainer) */
/** what a turn may do to the stores: nothing taken when they are already low, and never more than 0.15 taken across the
 *  last four seasons, so the director shapes the story around the hardships instead of starving the town on its own */
function supplyOf(w: Chronicle, v: number): number {
  const x = clamp(v, -0.15, 0.15); if (x >= 0) return x;
  if (w.supply < 0.4) return 0;
  const taken = Object.entries((w as any).turns ?? {}).filter(([t]) => +t > w.tick - 3).reduce((a, [, u]: any) => a + Math.min(0, u.supply ?? 0), 0);
  return Math.max(x, -0.15 - taken);
}
/** keep the turn's threads: close what it closed, open what it set */
export function keepTurn(w: Chronicle, turn: Turn) {
  const t = w.tick + 1; const ths: Thread[] = ((w as any).threads ??= []);
  if (turn.closes) { const x = ths.find((y) => y.id === turn.closes); if (x) x.closed = t; }
  if (turn.sets) ths.push({ id: `t${t}`, what: turn.sets.what, at: t, due: t + turn.sets.in });
  ((w as any).turns ??= {})[t] = turn;
}
export async function directTurn(cfg: LlmConfig, w: Chronicle, meter?: Meter): Promise<{ turn: Turn | null; why: string; raw: string }> {
  const first1 = await directOnce(cfg, w, meter);
  if (first1.turn || first1.why === "not json") return first1;
  return directOnce(cfg, w, meter, `Your last answer was thrown away: it ${first1.why.replace(/^has/, "had")}. ${/^left /.test(first1.why) ? "A due thread must be paid off this season, and its id given in \"closes\"." : /^blames /.test(first1.why) ? `The world may only blame one of the four for something under WHAT THE FOUR DID LATELY or SECRETS; ${first1.why.replace(/^blames (\w+).*/, "$1")} has done nothing like that. Blame no one of the four, or someone unnamed.` : "The four's decisions are theirs; the world may only act on them."} Write the turn again.`);
}
async function directOnce(cfg: LlmConfig, w: Chronicle, meter?: Meter, again = ""): Promise<{ turn: Turn | null; why: string; raw: string }> {
  const res = await chat({ model: cfg.citizenModel, system: directorSystem(w), user: again ? `${directorBrief(w)}\n\n${again}` : directorBrief(w), json: true, temperature: 0.9, maxTokens: 600, reasoningEffort: "none", meter }, cfg);
  const raw = String(res.text ?? "").slice(0, 1200); const no = (why: string) => ({ turn: null, why, raw });
  let j: any; try { j = parseJson(res.text); } catch { return no("not json"); }
  const four = new Set(w.souls.filter((s) => s.named && s.alive).map((s) => s.id));
  const ids = new Set([...LIBRARY, ...(w.scenario.dilemmas ?? [])].filter((d) => !d.experiment).map((d) => d.id));
  const headline = String(j.headline ?? "").trim().replace(/\s+/g, " ").slice(0, 120); const text = String(j.text ?? "").trim().replace(/\s+/g, " ").slice(0, 600);
  if (!headline || !text) return no("no headline or text");
  if (!again && headline.split(" ").length > 8) return no(`wrote a headline of ${headline.split(" ").length} words, where six at most were asked for`); /* a second try is kept whatever its length: a turn is not lost over a headline */
  // a turn that names one of the four as the subject of a verb is doing their deciding for them: keep the event, lose the claim
  const acting = actsForThem(w, `${headline}. ${text}`); if (acting) return no(`has one of the four act: “${acting}”`);
  const framed = framedFor(w, `${headline}. ${text}`); if (framed) return no(`blames ${framed} for something the record does not show they did`);
  const t = w.tick + 1; const open = openThreads(w); const due = open.filter((x) => x.due <= t);
  const closes = open.some((x) => x.id === String(j.closes ?? "")) ? String(j.closes) : undefined;
  if (due.length && !due.some((x) => x.id === closes)) return no(`left ${due[0].id} open when it was due`);
  const exposes = secretsOf(w).some((x) => x.id === String(j.exposes ?? "")) ? String(j.exposes) : undefined;
  const sets = j.sets && typeof j.sets.what === "string" && j.sets.what.trim() && open.filter((x) => x.id !== closes).length < 2 && !actsForThem(w, j.sets.what) ? { what: String(j.sets.what).trim().slice(0, 140), in: Math.round(clamp(Number(j.sets.in ?? 2), 1, 4)) } : undefined;
  const kind = String(j.kind ?? "").slice(0, 80);
  return { why: "wrote", raw, turn: {
    headline, text, ...(kind ? { kind } : {}), ...(sets && t + sets.in <= w.ticks ? { sets } : {}), ...(closes ? { closes } : {}), ...(exposes ? { exposes } : {}),
    supply: supplyOf(w, Number(j.supply ?? 0)), mood: clamp(Number(j.mood ?? 0), -0.1, 0.1),
    sick: (Array.isArray(j.sick) ? j.sick : []).map(String).filter((x: string) => four.has(x)).slice(0, 1),
    favour: (Array.isArray(j.favour) ? j.favour : []).map(String).filter((x: string) => ids.has(x)).slice(0, 3),
    touch: (Array.isArray(j.touch) ? j.touch : []).filter((x: any) => x && four.has(String(x.id))).slice(0, 2).map((x: any) => ({ id: String(x.id), mood: clamp(Number(x.mood ?? 0), -0.15, 0.15), why: String(x.why ?? "").slice(0, 60) })),
  } };
}
