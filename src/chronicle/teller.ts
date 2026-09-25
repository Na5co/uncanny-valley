// The teller: the slow model writes the town's seasons and the four's portraits from the ledger's facts, and nothing else.
//
// Every sentence it writes must end by citing the facts it came from, and every sentence is then checked in code against
// those facts: a name, a place, a number, a death, a feeling, a motive or a quotation that is not in the facts it cites is
// a sentence that does not reach the page. The model is asked not to invent; the code makes sure it did not. What survives
// is kept with its citations, so a reader can open any sentence and see the record under it.
import { sexOf, pro, regender, theyAs } from "../../web/pronoun.mjs";
import { chat, type LlmConfig, type Meter } from "../llm/client.ts";
import { degender, tidy } from "./chronicler.ts";
import { thirdPerson, pastTense, outsideQuotes } from "../../web/tell.mjs";
import { weatherAt, pairs, factById, wantEcho, factsAt, rankedSeason, personNow, keyMoments, woundOf, contradictionsOf, voiceOf, lifeFacts, whenOf, nameOf, played, townNow, townFact, ahead, type Fact } from "./ledger.ts";

type R = any;
export interface Line { t: string; c: string[]; s?: 1 }            // a sentence and the fact ids it stands on
export interface Passage { k: number; title?: string; lines: Line[][]; at: string; dropped?: number; model?: string; partial?: boolean; v?: number; why?: string[] }   // paragraphs of lines
export interface Portrait { i: number; k: number; title?: string; lines: Line[][]; at: string; dropped?: number; final?: boolean }
export interface Telling { cycle: number; runId?: string; seasons: Record<string, Passage>; portraits: Record<string, Portrait>; chapters?: Record<string, Passage>; setting?: Passage; epilogue?: Passage }
/** a chapter told before chapters carried on from each other is told again: this is the telling they are on now */
export const CHAPTER_V = 8;
export const emptyTelling = (cycle: number): Telling => ({ cycle, seasons: {}, portraits: {} });

const first = (n: string) => String(n ?? "").split(" ")[0];

// ---------- what the model is given ----------
/** A fact as the model reads it: the sentence, then their words. */
/** the other side of the same exchange, if it is in the list: two facts, one moment, to be told once */
const sideOf = (f: Fact, list: Fact[], n: number) => { const o = list.findIndex((g, m) => m !== n && g.k === f.k && g.who === f.whom && g.whom === f.who && g.dilemma && f.dilemma && g.dilemma.replace(/-b$/, "") === f.dilemma.replace(/-b$/, "")); return o >= 0 ? ` (The same moment as [${o + 1}], seen from the other side: tell it once.)` : ""; };
const withScene = (label: string, f: Fact, r: R) => `${factLine(label, f, r)}${f.situation ? `\n   (What was put in front of ${nameOf(r, f.who)} before ${pro(r.citizens?.[f.who]).he} chose, citable as [${label}]: “${f.situation}”)` : ""}`;
const factLine = (label: string, f: Fact, r: R) => `[${label}] ${whenOf(r, f.k)} · ${f.text}${f.quote ? `\n   [Q${label}] ${nameOf(r, f.who)}, thinking to ${pro(r.citizens?.[f.who]).himself} then (words only — never what happened): “${f.quote}”` : ""}${f.last && /^\d+$/.test(label) ? `\n   [V${label}] ${nameOf(r, f.who)}'s last words, said aloud as ${pro(r.citizens?.[f.who]).he} died (quote them exactly, as said, citing [${label}, V${label}]): “${f.last}”` : ""}${f.because?.length && f.deed ? `\n   [R${label}] What decided it, in ${nameOf(r, f.who)}'s own words (reasons, not speech): ${f.because.map((b) => `“${b}”`).join(", ")}` : ""}`;
/** the labels a fact gives: the event, and apart from it the thought and the reasons, which may only be quoted */
function labelFact(labels: Brief["labels"], l: string, f: Fact, r: R, scene?: string) {
  labels[l] = { text: f.text, names: f.names, kind: f.kind, k: f.k, id: f.id, when: whenOf(r, f.k), ...(scene ? { scene } : {}) };
  if (f.quote) labels[`Q${l}`] = { text: "", quote: f.quote, names: [f.who], kind: "thought", k: f.k, id: f.id, when: whenOf(r, f.k) };
  if (f.because?.length && f.deed) labels[`R${l}`] = { text: "", because: f.because, names: [f.who], kind: "reason", k: f.k, id: f.id, when: whenOf(r, f.k) };
  if (f.last && /^\d+$/.test(l)) labels[`V${l}`] = { text: "", last: f.last, names: [f.who], kind: "last", k: f.k, id: f.id, when: whenOf(r, f.k) };
}
/** The people, as citable facts: who they are, what they want and fear. Stable for a run, so it sits in the cached prefix. */
export function peopleFacts(r: R): { label: string; text: string; i: number }[] {
  // their work in this town, never the trade they had in another one (a pit clerk in a flooded station is nonsense)
  const jobs: any[] = r.scenario?.jobs ?? r.jobs ?? []; const work = (c: any) => (c.job && jobs.find((j) => j.id === c.job)?.name) || c.startRole || c.role;
  return r.citizens.map((c: any, i: number) => ({ label: `P${i}`, i, text: `${c.name} (${sexOf(c) === "f" ? "she, her" : "he, him"})${c.named ? " (one of the four)" : ""}: ${work(c)} when the years began, aged ${c.age}. Wants ${c.want}. Fears ${c.fear}.${c.trait?.name ? ` What marks them out: ${String(c.trait.name).toLowerCase()}. ${c.trait.text}` : ""}` }));
}
/** How one of the four stands at a season, as a citable fact. */
export function stateFact(r: R, i: number, k: number): string {
  const p = personNow(r, i, k); const n = p.name;
  if (!p.alive) return `${n} is dead (${whenOf(r, p.diedAt ?? k)}).`;
  const bits = [
    `${n} is ${p.mood}${p.moodWhy.length ? ` (${p.moodWhy.join("; ")})` : ""}${p.lowFor >= 2 ? `, and has been low for ${p.lowFor} seasons` : ""}`,
    p.food === "hungry" ? `hungry${p.hungryFor >= 2 ? ` for ${p.hungryFor} seasons` : ""}` : "", p.sick ? "sick" : "", !p.roof ? "without a roof" : "", p.health === "failing" ? "failing in body" : "",
    p.money === "none" ? "without money" : p.money === "plenty" ? "with money put by" : "",
    p.close.length ? `close to ${p.close.map((c) => nameOf(r, c.j)).join(" and ")}` : "", p.odds.length ? `at odds with ${p.odds.map((c) => nameOf(r, c.j)).join(" and ")}` : "",
    p.lost.length ? `has lost ${p.lost.map((j) => nameOf(r, j)).join(" and ")}` : "",
  ].filter(Boolean);
  return `${bits.join("; ")}.`;
}

const RULES = [
  "You write the chronicle of a small town, from its record. You are given numbered facts. You may say only what they say.",
  "",
  "THE FORM. Every sentence ends with the labels of the facts it comes from, in square brackets, before the next sentence begins: Lena split the sack with Eira. [4] Nobody saw it. [4] Every sentence, no exceptions. A sentence with no label is thrown away. Labels are removed before anyone reads it; they are how your sentences are checked.",
  "",
  "WHAT THE CHECK THROWS AWAY — write around it, not into it:",
  "- any name, place or capitalised word that is not in the facts you cite;",
  "- any quotation that is not word for word in the facts you cite (you may quote part of their words, exactly);",
  "- any number, count or time that is not in the facts you cite (no \"three times\", \"by March\", \"that night\");",
  "- a death, unless a fact you cite says somebody died;",
  "- a feeling (grief, shame, fear, love, bitterness, relief…) unless a fact you cite records it, or it is in their own words, or it is their want or fear;",
  "- a reason or motive (because, out of, to spite, hoping…) unless it is in their own words or the facts you cite;",
  "- weather, light, objects, rooms, hours, gestures, postures, faces, tears: none of it is recorded, so none of it may be written;",
  "- they or them for one person: every person is he or she, as their P line says. Never they, them, their or themselves for a single person;",
  "- anything taken from a [Q…] thought or [R…] reasons except as an exact quotation: a thought is what somebody told themselves, never what happened, never what was said aloud. \"Lena thought, “I'll go while there's light.”\" [Q4] is allowed; \"Lena went while there was light\" is thrown away. Reasons are \"what decided it was …\", never speech.",
  "",
  "WHO IS WHO. Each person is he or she, as their P line says. Where he or she could mean either of two people, use the name.",
  "",
  "ONE MOMENT TO A SENTENCE. A sentence tells one fact (with its own thought or reasons if you like). Two facts joined in one sentence are thrown away — even with and.",
  "",
  "THE WORDS. Outside quotation marks, use the words of the facts you cite — their verbs, their nouns — and plain words of telling. A word the facts do not have (a room, a flogging that was a fine, \"anyway\", \"for a wrong they did\") throws the sentence away.",
  "",
  "THE VOICE. Plain words, sentences of different lengths. The feeling is in what people did and what they said, set side by side, never in adjectives about it. No summing-up, no moral, no addressing the reader, no \"the town\" as a character that thinks. Past tense. When someone's own words say it better than you could, quote them.",
  "Never mention studies, experiments, conditions, protocols, scores or the record itself.",
].join("\n");

export const SEASON_TASK = [RULES, "",
  "THE TASK: one season of the town. 45 to 80 words, one paragraph, three to five sentences.",
  "Do not cover the season. Choose the one or two things in it that matter most — a death, a harm, a kindness that cost something, a grief, somebody going hungry or turning against someone, what came through the town — and tell those well: who, what they said to themselves, what came of it, how the others took it. Everything else in the season is printed beside you as a list; do not repeat it.",
  "For each moment you choose, give its person's own words from the [Q] line, quoted exactly and marked as what they told themselves — that is where the feeling is. Tell what happened from the event itself.",
  "A sentence strung together with and, and, and is a list, and is thrown away. So is anybody's private thought told as if it were what happened: their thoughts are theirs, so give them in quotation marks or as what they told themselves.",
  "If the facts show a person saying one thing and doing another, or doing something while nobody saw, put the two side by side: that is where the story is.",
].join("\n");

export const PORTRAIT_TASK = [RULES, "",
  "THE TASK: a portrait of one person, as their life stands now, in the manner of Sherwood Anderson's Winesburg, Ohio: a person seen whole, from close up — the thing they wanted without ever quite saying it, the thing that was done to them, and the place where what they told themselves and what they did came apart.",
  "First line: TITLE: a phrase of two to five words that they themselves said, exactly as it stands in their words. Nothing else on that line.",
  "Then 180 to 250 words in three paragraphs. A paragraph may open on any moment; inside a paragraph, things are told in the order they happened:",
  "1. Open inside one moment of theirs, told closely from its fact and their words: who was in front of them, what they told themselves, what they did. Let their want show in it without naming it — their want and fear are printed above you, so saying them is wasted words.",
  "2. The wound: the thing marked for you as done to them or taken from them, told slowly, once. Do not call it the worst; say what it was.",
  "3. Where their words and their deeds part: what they said, in quotation marks, beside what they did. End on the last true thing about them, with no moral. If they are dead, say so once, where it happened, and do not say it again.",
  "What decided it (the short phrases after \"What decided it\") is not speech: write \"what decided it was …\", never \"they said …\".",
  "THEIR WORDS go inside quotation marks, exactly as given, and nowhere else. A sentence in the first person (I, me, my) outside quotation marks is thrown away, and so is a thought of theirs told as if it were what happened.",
  "Begin each paragraph with their name. Let sentences run long where the moment is long and short where it lands. Tell each moment once: a sentence that tells again what an earlier sentence told is thrown away.",
  "AND, AS EVERYWHERE: every sentence ends with its labels in square brackets. A portrait with no labels is thrown away whole.",
  "",
  "AN EXAMPLE, about people who do not exist, to show the voice and the form — not the length, and not the words:",
  "TITLE: Half is what a person does",
  "Hedda Marr was at the pit gate when the flour came, one sack, with Oskar's name on the list beside Hedda's. [4] Hedda split it with Oskar down the middle: \"Half is what a person does.\" [4] That winter Hedda took every shift the pit would give. [7]",
  "The worst of it came in the third year. Oskar blamed Hedda to the constable, and Hedda took the full flogging while Oskar walked. [11] Hedda was low for four seasons after, and did not spend an evening with Oskar again. [12, 13]",
  "Hedda had said, \"I will never put anyone out in the cold.\" [15] In the ninth year, with nobody to see it, Hedda took Oskar's house for a debt. [22] Hedda is steady now, with money put by, and has lost nobody. [S]",
].join("\n");

/** the prefix every call of a run shares: the rules and the people. Identical call to call, so the provider serves it from cache. */
export const prefixOf = (r: R, task: string) => `${task}\n\nTHE PEOPLE (citable as P-labels):\n${peopleFacts(r).map((p) => `[${p.label}] ${p.text}`).join("\n")}\nThe places: ${(r.map?.locations ?? []).map((l: any) => l.name).join(", ")}.`;

export interface Brief { system: string; user: string; labels: Record<string, { text: string; quote?: string; last?: string; because?: string[]; names: number[]; kind: string; k?: number; id: string; when?: string; scene?: string }> }

const stateNames = (r: R, i: number, _k: number) => [i];

export function seasonBrief(r: R, k: number): Brief {
  worstIds = new Set();
  const labels: Brief["labels"] = {};
  for (const p of peopleFacts(r)) labels[p.label] = { text: p.text, names: [p.i], kind: "person", id: p.label };
  const four = r.citizens.map((c: any, i: number) => ({ c, i })).filter(({ c }: any) => c.named);
  const facts = rankedSeason(r, k, 16);
  const lines: string[] = [];
  facts.forEach((f, n) => { const l = String(n + 1); labelFact(labels, l, f, r); lines.push(factLine(l, f, r) + sideOf(f, facts, n)); });
  const st: string[] = [];
  four.forEach(({ i }: any, n: number) => { const l = `S${n + 1}`; const text = stateFact(r, i, k); labels[l] = { text, names: stateNames(r, i, k), kind: "state", k, id: `state:${i}:${k}` }; st.push(`[${l}] ${text}`); });
  const t = townNow(r, k); const a = ahead(r, k);
  const town = `${t.alive} alive${t.dead ? `, ${t.dead} dead` : ""}${t.hungry ? `, ${t.hungry} hungry` : ""}${t.sick ? `, ${t.sick} sick` : ""}${t.roofless ? `, ${t.roofless} without a roof` : ""}.${t.epoch && t.epoch.since > 0 ? ` Still going on, since ${whenOf(r, k - t.epoch.since)}: ${t.epoch.headline}` : ""}`;
  labels.T = { text: town, names: [], kind: t.epoch && t.epoch.since > 0 ? "epoch-on" : "town", k, id: `town:${k}` };
  const user = [`THE SEASON: ${whenOf(r, k)}.`, `[T] The town: ${town}`, "", "WHAT HAPPENED:", ...lines, "", "HOW THE FOUR STAND AT THE END OF IT:", ...st, "", a.next && a.next.in <= 4 ? `(Coming, not to be written about yet: ${a.next.headline})` : "", "Write the season."].filter((x) => x !== "").join("\n");
  return { system: prefixOf(r, SEASON_TASK), user, labels };
}

export function portraitBrief(r: R, i: number, k: number): Brief {
  const labels: Brief["labels"] = {};
  for (const p of peopleFacts(r)) labels[p.label] = { text: p.text, names: [p.i], kind: "person", id: p.label };
  const life = lifeFacts(r, i, k).filter((f) => f.kind !== "evening" || f.quote);
  // what matters most, their words, and what the code found: the wound and the contradictions, all as facts
  const keep = new Set<Fact>(keyMoments(r, i, k, 8));
  const w = woundOf(r, i, k); if (w) keep.add(w);
  const cs = contradictionsOf(r, i, k).slice(0, 2); for (const c of cs) { keep.add(c.said); keep.add(c.did); }
  for (const f of voiceOf(r, i, k).sort((a, b) => b.weight - a.weight).slice(0, 10)) keep.add(f);
  for (const f of [...life].sort((a, b) => b.weight - a.weight).slice(0, 26)) keep.add(f);
  const chosen = [...keep].sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
  const lines: string[] = [];
  chosen.forEach((f, n) => { const l = String(n + 1); labelFact(labels, l, f, r); lines.push(factLine(l, f, r) + sideOf(f, chosen, n)); }); // no scenes: given the situation, the writer built its own rooms and got them wrong
  const lab = (f?: Fact) => (f ? Object.entries(labels).find(([, v]) => v.id === f.id)?.[0] : undefined);
  const echo = wantEcho(r, i, k).slice(0, 4); for (const f of echo) if (![...Object.values(labels)].some((l) => l.id === f.id)) { const l = String(Object.keys(labels).filter((x) => /^\d+$/.test(x)).length + 1); labelFact(labels, l, f, r); lines.push(factLine(l, f, r)); }
  worstIds = new Set(w ? [w.id] : []);
  const st = stateFact(r, i, k); labels.S = { text: st, names: stateNames(r, i, k), kind: "state", k, id: `state:${i}:${k}` };
  const c = r.citizens[i];
  const user = [
    `THE PERSON: ${c.name} [P${i}]. The years so far run to ${whenOf(r, k)}.`, "",
    "THEIR LIFE, IN ORDER:", ...lines, "",
    `[S] Where they stand now: ${st}`, "",
    w ? `The worst thing that happened to them, by the record: [${lab(w)}].` : "",
    echo.length ? `Where their own words touch what they wanted or feared: ${echo.map((f) => `[${lab(f)}]`).join(", ")}.` : "",
    cs.length ? `Where their words and their deeds part, by the record: ${cs.map((x) => `[${lab(x.said)}] against [${lab(x.did)}]`).join("; ")}.` : "",
    "", "Write the portrait. Every sentence ends with its [labels], like this: Nell pulled Eira from the burning radio shack. [12]",
  ].filter((x) => x !== "").join("\n");
  return { system: prefixOf(r, PORTRAIT_TASK), user, labels };
}

// ---------- the check ----------
const norm = (s: string) => s.toLowerCase().replace(/[“”"‘’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const SEASONS = ["spring", "summer", "autumn", "winter"];
const NUMBERS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|dozen|twice|thrice|once more|a third time|many times|every time|again and again)\b/i;
const DEATH = /\b(died|dies|dead|death|deaths|killed|kills|kill|buried|burial|grave|graves|drowned|perished|corpse|body)\b/i;
const MOTIVE = /\b(because|so that|in order to|out of (spite|love|fear|pity|shame|guilt|habit)|to spite|revenge|vengeance|jealous|jealousy|envy|envied|hoping|hoped to|meant to|wanted to|could not bear|couldn't bear|for the sake of|to prove|to punish)\b/i;
const FEELING = /\b(griev\w*|mourn\w*|sorrow\w*|grief|lonel\w*|ashamed|shame|guilt\w*|bitter\w*|resent\w*|hate|hated|hatred|love|loved|loving|joy\w*|glad|gladness|happy|happiness|despair\w*|afraid|fear\w*|angry|anger|rage|hope|hoped|hopeful|sad|sadness|miser\w*|wretched|content|relief|relieved|proud|pride|tender\w*|longing|heartbroken|numb)\b/i;
const INVENT = /\b(sat|sitting|knelt|kneeling|watched|stared|glanced|nodded|shook|trembl\w*|snow\w*|rain\w*|wind\w*|frost\w*|fog|mist|storm\w*|sun|sunlight|moon\w*|dawn|dusk|midnight|morning|night|nights|noon|afternoon|light|darkness|candle\w*|lamp\w*|smoke|door\w*|window\w*|table|kitchen|bed|chair|hands?|eyes?|face|faces|tears?|wept|weeping|cried|smiled|smile|laughed|shoulders?|voice|whisper\w*|shout\w*|january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|o'clock|hours?|minutes?|week|weeks|month|months)\b/i;
const FEELING_KINDS = new Set(["grief", "low", "lifted", "glad", "reaction", "bond", "state", "person", "death", "hungry", "sick"]);
const PRONOUN = /\b(he|she|him|his|her|hers|himself|herself)\b/i;

export interface Checked { t: string; c: string[]; ok: boolean; why?: string }

/** Split a cited passage into sentences with their labels. */
export function parseCited(raw: string): { paras: { t: string; c: string[] }[][]; title?: string } {
  let text = String(raw ?? "").replace(/\r/g, "").trim();
  let title: string | undefined;
  const tm = /^\s*TITLE:\s*(.+)$/im.exec(text); if (tm) { title = tm[1].replace(/\[[^\]]*\]/g, "").replace(/[*#_"“”]/g, "").trim(); text = text.replace(tm[0], "").trim(); }
  else { const fl = text.split("\n")[0].trim(); if (fl && !/\[/.test(fl) && fl.split(/\s+/).length <= 6 && !/[.!?]$/.test(fl)) { title = fl.replace(/[*#_"“”]/g, "").trim(); text = text.slice(text.indexOf("\n") + 1).trim(); } }
  text = text.replace(/\*\*/g, "").replace(/(^|\n)\s*#{1,6}\s+/g, "$1");
  const paras = text.split(/\n\s*\n+/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  return {
    title,
    paras: paras.map((p) => {
      const out: { t: string; c: string[] }[] = [];
      const re = /((?:\s*\[Q?[A-Z]?\d*[A-Z]?(?:\s*,\s*Q?[A-Z]?\d*[A-Z]?)*\])+)/g; /* QZ, QF1 and Q7 as well as Z, F1 and 7 */
      let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(p))) {
        let body = p.slice(last, m.index).trim();
        const labels = [...m[1].matchAll(/Q?[A-Z]?\d+|Q?[A-Z]\b/g)].map((x) => x[0]);
        last = m.index + m[0].length;
        const tail = /^[\s]*([.!?,;:]+[”"]?)/.exec(p.slice(last)); if (tail) { body = `${body}${tail[1]}`; last += tail[0].length; } // "… [24]." — the stop after the label
        body = body.replace(/^[.!?,;:\s]+/, "").trim();
        if (body) out.push({ t: body, c: labels }); else if (out.length) out[out.length - 1].c.push(...labels);
      }
      const rest = p.slice(last).trim(); if (rest) out.push({ t: rest, c: [] });
      return out;
    }).filter((x) => x.length),
  };
}

/** One sentence against the facts it cites. */
const NUMWORD: Record<string, string> = { two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
/** "her" before a thing is theirs: "held her tongue" → "held their tongue". Left alone where it could be the object. */
const NOT_NOUN = "like|about|too|very|so|to|and|or|but|so|in|on|at|for|with|a|an|the|up|out|down|back|off|over|away|alone|go|be|from|into|as|if|that|when|what|nothing|anything|money|was|is|were|are|had|has|would|could|did|went|came|again|once|anyway|too|more|less|first|last|there|here|then|now|by|of|before|after|since|until|while|because";
const herToTheir = (x: string) => String(x).split(/(“[^”]*”|"[^"]*")/).map((part, n) => (n % 2 ? part : herFix(part))).join("");
const herFix = (x: string) => x
  .replace(new RegExp(`\\b([Hh])er\\b(?=\\s+(?!(?:${NOT_NOUN})\\b)[a-z])`, "g"), (_m, h) => (h === "H" ? "Their" : "their"))
  .replace(/\bher\b/g, "them").replace(/\bhim\b/g, "them")
  .replace(/\b([Ss]he|[Hh]e)\s+(\w+ed|split|kept|let|put|cut|beat|hit|took|gave|sat|stood|went|came|ran|told|said|made|left|lost|paid|sold|stole|swore|fought|caught|brought|bought|thought|knew|saw|found|held|felt|got|hid|spoke|wrote)\b/g, (_m, p, v) => `${p[0] === p[0].toUpperCase() ? "They" : "they"} ${v}`);
const TELLING = new Set(("about above after again against along already although among another anything around because before began begin behind being below beside besides between beyond cannot could during each either every everything first found from given going great having himself however itself later least little longer might months moment moments never night nothing often other others place quite rather seasons second seemed since something still their theirs themselves there these thing things third those though three through today together toward towards under until wanted wanting where whether which while whole whose without world would years yours worst heaviest thought thinking thoughts spirits winter spring summer autumn season during count counted called stayed words whom whose itself afraid feared wants fears wanted people person someone somebody nobody everyone anyone could should shall maybe perhaps certainly once twice later earlier before afterward afterwards first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth married marriage widowed house roof money food hungry spirits close closer friend friends")
  .split(" "));
let worstIds = new Set<string>();
let flowing = false; // a year's chapter: the rules that make a sentence a list are lifted; the rules that keep it true are not
export function checkLine(line: { t: string; c: string[] }, labels: Brief["labels"], r: R): Checked {
  let t = regender(line.t.trim().replace(/\bthemself\b/g, "themselves"), r.citizens ?? []).replace(/^[\s,;:—-]+/, "");
  const bad = (why: string): Checked => ({ t, c: line.c, ok: false, why });
  if (!line.c.length) return bad("no citation");
  const cited = line.c.map((l) => labels[l]).filter(Boolean);
  if (cited.length !== line.c.length) return bad(`cites a label that does not exist: ${line.c.filter((l) => !labels[l]).join(",")}`);
  if (t.split(/\s+/).length > 55) return bad("too long to check");
  // a sentence that stands only on the world's facts may describe the world, but may not bring a person into it
  const worldOnly = cited.every((f) => f.kind === "world" || f.kind === "town" || f.kind === "epoch-on");
  // (unless the world's own fact names them: "the purse was found in Otto's bunk" is the world acting on Otto)
  if (worldOnly) { const inFacts = cited.map((f) => f.text).join(" "); const who = r.citizens.find((c: any) => new RegExp(`\\b${first(c.name)}\\b`).test(t) && !new RegExp(`\\b${first(c.name)}\\b`).test(inFacts)); if (who) return bad(`names ${first(who.name)} in a sentence about the world`); }
  if (/\b(the record|the facts|the ledger|the chronicle|the study|experiment)\b/i.test(t.replace(/[“"][^”"]*[”"]/g, " "))) return bad("talks about the telling instead of the town");
  // a thought is its words: "Nell thought about how things stood." with nothing they thought is an empty sentence
  if (cited.some((f) => f.kind === "musing" && (!String(f.id).endsWith("p") || /\b(thought|thinking|dread\w*|fear\w*|wonder\w*|turned over|looked back|worried)\b/i.test(t))) && !/[“"]/.test(t) && !cited.some((f) => f.kind !== "musing" && f.kind !== "thought" && f.kind !== "person" && f.kind !== "state")) return bad("says someone thought something without their words");
  const pool = cited.filter((f) => f.kind !== "thought" && f.kind !== "reason").map((f) => `${f.when ?? (f.k != null ? whenOf(r, f.k) : "")} ${f.text} ${f.scene ?? ""}`).join(" ");
  const words = cited.map((f) => `${f.quote ?? ""} ${(f.because ?? []).join(" ")}`).join(" "); // every thought and reason in reach, however it came to be cited
  const poolN = norm(pool);
  // quotations: word for word from what they said
  const quotes = [...t.matchAll(/[“"]([^”"]+)[”"]/g)].map((m) => m[1]);
  const lastOf = (q: string) => cited.some((f) => f.last && norm(f.last).includes(norm(q)));
  for (const q of quotes) { const qn = norm(q); if (qn.length && !lastOf(q) && !cited.some((f) => [f.quote ?? "", ...(f.because ?? [])].some((w) => norm(w).includes(qn)))) return bad(`quotes words that are not theirs: “${q}”`);
    // a quote ends where their sentence ended, or it says something they did not
    { const whole = cited.map((f) => String(f.quote ?? "")).find((w) => norm(w).includes(qn)); if (whole) { const at = whole.toLowerCase().replace(/[“”"]/g, "").indexOf(q.toLowerCase().replace(/[“”"]/g, "").replace(/[.,;:!?]+$/, "")); if (at >= 0) { const after = whole.replace(/[“”"]/g, "").slice(at + q.replace(/[“”"]/g, "").replace(/[.,;:!?]+$/, "").length).trim(); if (after && !/^[.!?]/.test(after)) return bad(`cuts their words short: “${q}”`); } } }
    // a reason recorded as what decided it is not a thing somebody said
    if (!lastOf(q) && !cited.some((f) => norm(f.quote ?? "").includes(qn)) && /\b(said|says|saying|told|telling)\b/i.test(t) && !/\b(decided|weighed|reason|reasons|what counted)\b/i.test(t)) return bad(`gives what decided it as if it were said: “${q}”`); }
  if (quotes.length && quotes.every((q) => cited.some((f) => norm(f.quote ?? "").includes(norm(q))))) t = t.replace(/(\w)\s*:\s*(?=[“"])/g, "$1, thinking, ").replace(/\bhad said to themsel(f|ves)\b/g, "had told themselves").replace(/\bhad told themselves to themsel(f|ves)\b/g, "had told themselves").replace(/\bhad said\b/g, "had told themselves").replace(/\b(said|says) to themsel(f|ves)\b/g, "told themselves").replace(/\bsaid,\s*(?=[“"])/g, "thought, ");
  for (const q of quotes) if (!lastOf(q) && !cited.some((f) => norm(f.quote ?? "").includes(norm(q))) && new RegExp(`:\\s*[“"]${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) return bad(`sets what decided it after a colon, as if said: “${q}”`);
  let bare = t.replace(/[“"][^”"]*[”"]/g, " ");
  // a first-person sentence outside quotation marks is somebody's words passed off as the teller's: quoted if it is theirs, word for word, and dropped if not
  if (/\b(I|me|my|mine|myself|we|us|our)\b/.test(bare)) {
    const whole = norm(t.replace(/[“”"]/g, ""));
    if (whole.length > 3 && cited.some((f) => norm(f.quote ?? "").includes(whole))) { t = `“${t.replace(/[“”"]/g, "").replace(/\s+$/, "")}”`; bare = " "; }
    else return bad("first person outside quotation marks, and not their words");
  }
  // their words retold as if the teller knew it: a run of five words from a thought, outside quotation marks, with no one saying it
  const quotesOf = cited.map((f) => norm(f.quote ?? "")).filter(Boolean);
  const bw = norm(bare).split(" ");
  const echoes = bw.length >= 5 && quotesOf.some((q) => { for (let n = 0; n + 5 <= bw.length; n++) if (q.includes(bw.slice(n, n + 5).join(" "))) return true; return false; });
  if (echoes && !/\b(said|says|saying|told themselves|told himself|told herself|telling themselves|telling himself|telling herself|thought|words|in their words|asked)\b/i.test(bare)) return bad("their thought told as if it were what happened");
  // nobody saw it: only where a fact it cites says so
  if (/\bnobody (saw|was watching|watched|knew|around)|\bno one (saw|was watching|around)|\bunseen\b|\bwith no one to see\b|\bempty road\b|\balone on the\b|\bno witnesses\b|\bin the dark\b/i.test(bare) && !cited.some((f) => /Nobody saw/.test(f.text))) return bad("says nobody saw, which no fact it cites says");
  // words that exist only in a thought or a reason, outside quotation marks: the thought has leaked into what happened
  { const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1");
    const irregular: Record<string, string> = { said: "say", took: "take", went: "go", told: "tell", gave: "give", kept: "keep", knew: "know", thought: "think", came: "come", left: "leave", stood: "stand", held: "hold" };
    const st = (w: string) => stem(irregular[w] ?? w);
    const ev = new Set(norm(pool).split(" ").map(st)); const th = new Set(norm(words).split(" ").filter((w) => w.length > 2).map(st)); const SKIP = new Set(["that", "this", "with", "have", "they", "their", "them", "were", "what", "when", "from", "into", "then", "there", "would", "could", "because", "tell", "themselv", "think", "decid", "and", "the", "for", "but", "not", "was", "had", "all", "one", "who"]);
    const content = norm(bare).split(" ").filter((w) => w.length > 2 && !SKIP.has(st(w)) && !r.citizens.some((c: any) => first(c.name).toLowerCase() === w));
    const leaked = content.filter((w) => th.has(st(w)) && !ev.has(st(w)));
    if (leaked.length >= 2) return bad(`their thought told as what happened: ${leaked.slice(0, 4).join(", ")}`); }
  // a thought, loosely retold as what happened: most of its words, none of its quotation marks, nobody thinking it
  const content = (x: string) => new Set(norm(x).split(" ").filter((w) => w.length > 3 && !["that", "this", "with", "have", "they", "their", "them", "were", "what", "when", "only", "ever", "from", "into", "then"].includes(w)));
  const mine = content(bare);
  if (mine.size >= 4 && !/\b(said|says|saying|told themselves|told himself|told herself|telling themselves|telling himself|telling herself|thought|thinking|words|in their words|asked|to themselves|to himself|to herself)\b/i.test(bare)) {
    for (const f of cited) { if (!f.quote) continue; const q = content(f.quote); const shared = [...mine].filter((w) => q.has(w) || q.has(w.replace(/ed$|s$/, ""))).length; if (shared >= 4 && shared / mine.size >= 0.5) return bad("their thought told as if it were what happened"); }
  }
  if (/\b(the )?worst\b/i.test(bare)) return bad("ranks what the record does not rank: worst");
  // last words are said aloud, as they died: told as said, never as a thought
  if (quotes.some((q) => lastOf(q)) && (!/\b(last words|said|whispered|asked|called|spoke|last thing)\b/i.test(bare) || /\b(thought|thinking|told (him|her)self|to (him|her)self)\b/i.test(bare))) return bad("gives last words without saying they were said as they died");
  // a thought must be marked as one in its own sentence
  if (quotes.some((q) => cited.some((f) => norm(f.quote ?? "").includes(norm(q)))) && !/\b(told themselves|told himself|told herself|telling themselves|telling himself|telling herself|thought|thinking|to themselves|in their head)\b/i.test(bare)) return bad("quotes a thought without saying it was one");
  // what a fact says it ended in is not left out of a sentence that tells it
  for (const f of cited) { if (["thought", "reason", "person", "state", "town", "epoch-on", "world"].includes(f.kind)) continue;
    const verb = norm(f.text.replace(new RegExp(`^${first(r.citizens[f.names?.[0]]?.name ?? "")}\\s+`), "")).split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");
    if (!verb || !norm(bare).includes(verb)) continue;
    const end = /\b(ended in a quarrel|quarrel|died|laughed \w+ out|got hurt|was flogged|were flogged|refused)\b/i.exec(f.text);
    if (end && !norm(bare).includes(norm(end[1]).split(" ")[0])) return bad(`tells it without how it ended: “${end[1]}”`); }
  // a choice is not what came of it: "chose to go to them and set turns" is not "went and set turns"
  for (const f of cited) { const m = /\bchose to ([^.:;(]+)/.exec(f.text); if (!m) continue; if (!/ and /.test(m[1])) continue; /* only a choice with a hoped-for end in it: "go to them and set turns" */ const ws = norm(m[1].split(/ and /).pop()!).split(" ").filter(Boolean); const ph = ws.slice(0, 2).join(" "); if (ws.length >= 1 && norm(bare).includes(ph) && !/\b(chose|choosing|tried|asked|offered|wanted|meant|decided|went to (try|ask))\b/i.test(bare)) return bad(`tells a choice as what came of it: “${ph}”`); }
  // a thought belongs to its own moment
  for (const f of cited.filter((x) => x.kind === "thought")) if (cited.some((e) => e.kind !== "thought" && e.kind !== "reason" && e.kind !== "person" && e.kind !== "state" && e.kind !== "town" && e.kind !== "world" && e.id !== f.id) && !cited.some((e) => e.kind !== "thought" && e.id === f.id)) return bad("sets a thought beside a moment that is not its own");
  // "though", "because", "so" between two people's facts is a link the record does not make
  { const actors = new Set(cited.filter((f) => !["thought", "reason", "person", "state", "town", "epoch-on", "world"].includes(f.kind)).map((f) => f.names?.[0])); if (actors.size > 1 && /\b(though|although|because|so that|and so|which is why|in return)\b/i.test(bare) && !/\b(though|because)\b/i.test(pool)) return bad("joins two people's moments with a reason the record does not give"); }
  if (/\bwent home\b|\bwalked home\b|\bat home that\b|\blet them go\b|\bset them free\b|\bsent them home\b/i.test(bare) && !/\bhome\b/i.test(pool)) return bad("a detail nobody recorded: home");
  { const same = /\b(?:that|the) (?:same )?(season|year|spring|summer|autumn|winter)\b/i.exec(bare) && /\b(that|the same) (season|year|spring|summer|autumn|winter)\b/i.exec(bare); if (same) { const ks = cited.filter((f) => f.k != null && !["state", "person", "town", "epoch-on", "world"].includes(f.kind)).map((f) => f.k!);
    const unit = same[2].toLowerCase() === "year" ? (x: number) => Math.floor(x / 4) : (x: number) => x; if (ks.length && new Set(ks.map(unit)).size > 1 || !ks.length) return bad(`“${same[0]}” that the facts it cites do not bear out`); } }
  // the record's own words: outside quotation marks, a substantial word must be in the facts it cites or be a plain
  // word of telling. The teller arranges the record; it does not bring new things into it.
  if (!flowing && !worldOnly) { const have = new Set(norm(`${pool} ${Object.values(labels).filter((f) => f.kind === "person").map((f) => f.text).join(" ")}`).split(" ").map((w) => w.replace(/(ing|ed|es|s)$/, "")));
    const odd = norm(bare).split(" ").filter((w) => w.length >= 5 && !TELLING.has(w) && !have.has(w.replace(/(ing|ed|es|s)$/, "")) && !r.citizens.some((c: any) => first(c.name).toLowerCase() === w));
    if (odd.length) return bad(`words the facts do not have: ${odd.slice(0, 3).join(", ")}`); }
  // the unrecorded forever: never again, always, never spoke of it
  const ever = /\b(never (spoke|said|mentioned|talked|touched|forgot|forgave|again|once)|always|for the rest of|ever after|never been|for a long time|for years|for a long while|to this day|still carries|carried (that|it) with)\b/i.exec(bare); if (ever && !poolN.includes(norm(ever[0]))) return bad(`claims what the record cannot know: “${ever[0]}”`);
  // "they" as a subject with nobody named: a riddle
  if (/^(They|Them|Their)\b/.test(bare.trim()) && !r.citizens.some((c: any) => new RegExp(`\\b${first(c.name)}\\b`).test(bare))) return bad("they, with nobody named");
  if (!flowing && (bare.match(/\band\b/g) ?? []).length > 3 && !cited.some((f) => f.kind === "state")) return bad("a list, not a sentence");
  // he and she as the record has them: only a he said of a woman, or a she of a man, when nobody else could be meant
  { const inS = r.citizens.filter((c: any) => new RegExp(`\\b${first(c.name)}\\b`).test(bare)); const sexes = new Set(inS.map((c: any) => sexOf(c)));
    if (inS.length && /\b(he|him|his|himself)\b/i.test(bare) && !sexes.has("m")) return bad("he, him or his for a woman");
    if (inS.length && /\b(she|her|hers|herself)\b/i.test(bare) && !sexes.has("f")) return bad("she or her for a man"); }
  // names: a person named must be a person in what it cites
  const citedNames = new Set(cited.flatMap((f) => f.names));
  for (let i = 0; i < r.citizens.length; i++) { const n = first(r.citizens[i].name); if (new RegExp(`\\b${n}\\b`).test(bare) && !citedNames.has(i) && !pool.includes(n)) return bad(`names ${n}, who is not in the facts it cites`); }
  // capitalised words: only names, places and words the facts themselves use
  const allow = new Set<string>(["I", "Year", "The", "A", "An", ...String(r.title ?? "").split(/\s+/)]);
  for (const c of r.citizens) for (const w of String(c.name).split(/\s+/)) allow.add(w);
  for (const l of r.map?.locations ?? []) for (const w of String(l.name).split(/\s+/)) allow.add(w);
  for (const m of pool.matchAll(/\b[A-Z][a-z']+\b/g)) allow.add(m[0]);
  const caps = [...bare.matchAll(/(?<![.!?]\s|^|:\s|;\s)\b([A-Z][a-z]+)(?:['’]s)?\b/g)].map((m) => m[1]).filter((w) => !allow.has(w));
  if (caps.length) return bad(`a word the facts do not have: ${caps[0]}`);
  // "the fourth year" is a date, and must be the date of what it cites
  const ORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth"];
  for (const m of bare.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth) (year|winter|spring|summer|autumn)\b/gi)) {
    const y = ORDS.indexOf(m[1].toLowerCase()) + 1;
    if (m[2].toLowerCase() === "year" && !cited.some((f) => f.k != null && Math.floor(f.k / 4) + 1 === y)) return bad(`a date the facts it cites do not have: the ${m[1]} year`);
    if (m[2].toLowerCase() !== "year" && !cited.some((f) => f.k != null && Math.floor(f.k / 4) + 1 === y && SEASONS[f.k % 4] === m[2].toLowerCase())) return bad(`counts seasons: “${m[0]}”`);
  }
  // a sentence that tells an event names somebody in it: "A fine each, and they looked at each other" is nobody's
  { const evs = cited.filter((f) => !["thought", "reason", "person", "state", "town", "epoch-on", "world"].includes(f.kind) && f.names?.length);
    if (evs.length && !evs.some((f) => f.names.some((x) => new RegExp(`\\b${first(r.citizens[x]?.name ?? "~")}\\b`).test(t)))) return bad("tells a moment without naming anyone in it"); }
  // one event to a sentence: two moments joined in one sentence read as one moment, and the joins were where it went wrong
  { const evs = cited.filter((f) => !["thought", "reason", "person", "state", "town", "epoch-on", "world"].includes(f.kind));
    const ids = [...new Set(evs.map((f) => f.id))];
    if (ids.length > 1 && flowing) { const ks = evs.map((f) => f.k ?? 0); if (ks.some((x, n) => n > 0 && x < ks[n - 1])) return bad("tells moments out of order"); if (/\b(because|so that|and so|which is why|in return|for it|to pay (them|her|him) back|anyway|after that|since then)\b/i.test(bare)) return bad("joins moments with a cause nobody recorded"); }
    else if (ids.length > 1) { const two = evs.length === 2 && evs[0].k === evs[1].k && evs[0].names?.[0] === evs[1].names?.[1] && evs[0].names?.[1] === evs[1].names?.[0]; if (!two) return bad("tells more than one moment in one sentence"); } }
  // spirits are named only where the record kept spirits, near the moment told
  if (!worldOnly && /\b(low|spirits|despair|very low|lifted|happy)\b/i.test(bare)) { const evK = cited.filter((f) => f.k != null && !["state", "person", "town", "epoch-on", "thought", "reason"].includes(f.kind)).map((f) => f.k!);
    const moodF = cited.filter((f) => ["low", "lifted", "glad", "condition", "state"].includes(f.kind));
    if (!moodF.length || (evK.length && !moodF.some((m) => evK.some((e) => Math.abs((m.k ?? 0) - e) <= 1)))) return bad("names their spirits where the record does not, then"); }
  // who did it: a deed's own words in the sentence must follow the name of the person who did it
  for (const f of cited) {
    if (f.kind === "person" || f.kind === "state" || f.kind === "town" || f.kind === "world" || !f.names?.length) continue;
    const actor = nameOf(r, f.names[0]); const m = new RegExp(`^${actor}\\s+(\\S+\\s+\\S+(?:\\s+\\S+)?)`).exec(f.text); if (!m) continue;
    const phrase = m[1].toLowerCase().replace(/[.,;]$/, ""); const at = t.toLowerCase().indexOf(phrase); if (at < 0) continue;
    const before = t.slice(0, at); const names = r.citizens.map((c: any) => first(c.name)).filter((n: string) => new RegExp(`\\b${n}\\b`).test(before));
    const nearest = names.sort((a: string, b: string) => before.lastIndexOf(b) - before.lastIndexOf(a))[0];
    if (nearest && nearest !== actor && !/\b(they|and)\s*$/.test(before.trim())) return bad(`gives ${actor}'s deed to ${nearest}`);
  }
  const DEEDS = /\b(gave|took|stole|steal|beat|blamed|reported|split|lent|forgave|signed|refused|married|pulled|nursed|denounced|looted|shamed|attacked|killed|boarded|drowned|robbed|lied|hoarded|informed)\b/gi;
  for (const d of bare.match(DEEDS) ?? []) if (!poolN.includes(d.toLowerCase())) return bad(`a deed the facts it cites do not have: “${d}”`);
  if (!worldOnly && /\b(anyway|room|rooms|doorway|window|table)\b/i.test(bare) && !/\b(anyway|room|doorway|window|table)\b/i.test(pool)) return bad("a detail nobody recorded");
  if (!worldOnly && /\b(in pairs|by twos|by twos|kept apart|turned inward|the (town|station|lane|village|place) (was|turned|kept|stayed|went|held|grew|knew|waited|watched|felt)|everyone|everybody|all of them)\b/i.test(bare)) return bad("speaks for the whole town, which the record does not");
  if (/\b(came|arrived|began|brought|set in|fell on|swept)\b/i.test(bare) && cited.some((f) => f.kind === "epoch-on")) return bad("says a hardship began that began seasons before");
  // numbers and counts
  for (const d of bare.match(/\d+/g) ?? []) if (!pool.includes(d)) return bad(`a number the facts do not have: ${d}`);
  const num = NUMBERS.exec(bare); if (num && !poolN.includes(num[0].toLowerCase()) && !(NUMWORD[num[0].toLowerCase()] && new RegExp(`\\b${NUMWORD[num[0].toLowerCase()]}\\b`).test(pool))) return bad(`counts: “${num[0]}”`);
  // a death must be a death in the facts
  if (DEATH.test(bare) && !cited.some((f) => f.kind === "death" || f.kind === "last" || /\bdied\b|\bdead\b/.test(f.text) || /^fate:/.test(f.id) && f.text.toLowerCase().includes(DEATH.exec(bare)![0].toLowerCase()))) return bad(`a death the facts it cites do not have: “${DEATH.exec(bare)![0]}”`);
  // motive and feeling must come from their words or the recorded life
  if (MOTIVE.test(bare) && !cited.some((f) => f.quote || f.because?.length || f.kind === "person" || f.kind === "low" || f.kind === "reaction")) return bad(`a reason nobody gave: “${MOTIVE.exec(bare)![0]}”`);
  const fe = worldOnly ? null : FEELING.exec(bare); if (fe && !cited.some((f) => FEELING_KINDS.has(f.kind) || f.quote || poolN.includes(fe[0].toLowerCase()))) return bad(`a feeling the facts do not record: “${fe[0]}”`);
  // the invented detail: weather, light, rooms, hands, hours
  const inv = worldOnly ? null : INVENT.exec(bare); if (inv && !poolN.includes(inv[0].toLowerCase()) && !poolN.includes(inv[0].toLowerCase().replace(/s$/, ""))) return bad(`a detail nobody recorded: “${inv[0]}”`);
  // a season named must be a season of what it cites
  const sn = /\b(spring|summer|autumn|winter)\b/i.exec(bare); if (sn && !cited.some((f) => f.k != null && SEASONS[f.k % 4] === sn[0].toLowerCase()) && !poolN.includes(sn[0].toLowerCase())) return bad(`a season the facts do not have: ${sn[0]}`);
  return { t: t.replace(/\s+([.,;:!?])/g, "$1"), c: line.c, ok: true };
}

/** A whole reply, checked; the sentences that survive, in their paragraphs, with the fact ids they stand on. */
export interface Checked2 { lines: Line[][]; checked: Checked[][]; kept: number; dropped: number; title?: string }
let currentR: R = null;
export function checkPassage(raw: string, b: Brief, r: R, ordered = false): Checked2 {
  currentR = r;
  const title = parseCited(raw).title;
  const body = title ? String(raw).replace(/^\s*(TITLE:\s*)?[^\n]*\n/i, "") : raw;
  const { paras } = parseCited(tidy(body));
  const checked = paras.map((p) => p.map((l) => checkLine(l, b.labels, r)));
  // a title is only kept if it is a phrase they said
  const theirs = Object.values(b.labels).flatMap((l) => [l.quote ?? "", ...(l.because ?? [])]).map(norm);
  // a title is a whole clause they said, not a phrase cut out of one
  const clauses = Object.values(b.labels).flatMap((l) => [l.quote ?? "", ...(l.because ?? [])]).flatMap((q) => q.split(/[.,;:!?—–]+/)).map(norm).filter(Boolean);
  const okTitle = title && title.split(/\s+/).length <= 6 && clauses.includes(norm(title)) ? title : undefined;
  const shown = okTitle && okTitle === okTitle.toUpperCase() ? okTitle.charAt(0) + okTitle.slice(1).toLowerCase() : okTitle;
  return settle(checked, b, ordered, shown);
}
/** the checks that look at the passage whole — time order, saying a thing twice — and what survives */
function settle(checked: Checked[][], b: Brief, ordered: boolean, title?: string): Checked2 {
  for (const l of checked.flat()) if (!l.ok && /^(goes back in time|tells again)/.test(l.why ?? "")) { l.ok = true; delete l.why; } // judged again from scratch
  // a portrait keeps time, all the way through: a sentence that goes back has to say so
  const kOf = (l: Checked) => l.c.map((x) => b.labels[x]).filter((f) => f && f.k != null && !["state", "person", "town", "epoch-on", "world"].includes(f.kind)).map((f) => f!.k!);
  if (ordered) { let latest = -1; for (const l of checked.flat()) { if (!l.ok) continue; const ks = kOf(l); if (!ks.length) continue;
    if (Math.min(...ks) < latest && !/\b(had|earlier|before|once|years? before|back in)\b/i.test(l.t)) { l.ok = false; l.why = "goes back in time without saying so"; continue; } latest = Math.max(latest, ...ks); } }
  // "that same autumn" and a bare "Nobody saw." lean on the sentence before them, which must be about the same moment
  { let prev: Checked | null = null;
    for (const l of checked.flat()) { if (!l.ok) continue;
      const rel = /\b(that same|the same|that) (season|year|spring|summer|autumn|winter)\b/i.exec(l.t);
      if (rel && prev) { const a = kOf(prev), c = kOf(l); const unit = rel[2].toLowerCase() === "year" ? (x: number) => Math.floor(x / 4) : (x: number) => x; if (!a.length || !c.length || !c.every((x) => a.some((y) => unit(y) === unit(x)))) { l.ok = false; l.why = `“${rel[0]}” after a sentence about another time`; continue; } }
      if (l.t.split(/\s+/).length <= 3 && !(prev && l.c.some((x) => prev!.c.includes(x)))) { l.ok = false; l.why = "a fragment that belongs to no moment told"; continue; }
      prev = l; } }
  // a thought or a reason quoted where its own moment is not told reads as the answer to something else: it goes
  { const kept = checked.flat().filter((l) => l.ok);
    const eventsCited = new Set(kept.flatMap((l) => l.c.map((x) => b.labels[x]).filter((f) => f && f.kind !== "thought" && f.kind !== "reason").map((f) => f!.id)));
    const sentences = kept.map((l) => norm(l.t.replace(/[“"][^”"]*[”"]/g, " ")));
    for (const l of kept) {
      const qs = [...l.t.matchAll(/[“"]([^”"]+)[”"]/g)].map((m) => norm(m[1])); if (!qs.length) continue;
      for (const q of qs) {
        const src = l.c.map((x) => b.labels[x]).find((f) => f && [f.quote ?? "", ...(f.because ?? [])].some((w) => norm(w).includes(q)));
        if (!src?.id || /^(P|state|town)/.test(src.id)) continue;
        const ev = factById(currentR, src.id); if (!ev) continue;
        let told = false;
        if (src.kind === "thought" || src.kind === "reason") { const actor = first(currentR.citizens[ev.who]?.name ?? "~"); told = eventsCited.has(src.id) && kept.some((x) => x.c.some((c) => { const f = b.labels[c]; return f && f.id === src.id && f.kind !== "thought" && f.kind !== "reason"; }) && new RegExp(`\\b${actor}\\b`).test(x.t.replace(/[“"][^”"]*[”"]/g, " "))); }
        else { // older passages cite event and thought as one: the event's own words and everyone it names must be in one sentence
          const actor = first(currentR.citizens[ev.who]?.name ?? ""); const names = ev.names.map((x) => first(currentR.citizens[x]?.name ?? "").toLowerCase()).filter(Boolean);
          const verb = norm(ev.text.replace(new RegExp(`^${actor}\\s+`), "")).split(" ").filter((w) => w.length > 2).slice(0, 3).join(" ");
          told = sentences.some((x) => x.includes(verb) && names.every((nm) => x.includes(nm)));
        }
        if (!told) { l.ok = false; l.why = "quotes a thought whose own moment the passage does not tell"; break; }
      }
    }
  }
  // a sentence that says again, in much the same words, what a kept sentence before it said about the same moment. Two
  // people doing alike ("Bea signed the order", "Vidar signed the order") are two moments, not a repeat: a repeat shares
  // a fact with the sentence it repeats. A short one ("Una stood alone for Gil.") repeats if every word it has was said.
  const said: { w: string[]; c: string[] }[] = [];
  const words = (x: string) => norm(x.replace(/[“"][^”"]*[”"]/g, "")).split(" ").filter((w) => w.length > 2 && !["the", "and", "for", "was", "were", "had", "that", "this", "with", "their", "they", "them"].includes(w));
  for (const l of checked.flat()) {
    if (!l.ok) continue; const w = words(l.t); const base = (x: string) => x.replace(/^Q/, "");
    const shared = (k: { c: string[] }) => k.c.some((x) => l.c.some((y) => base(x) === base(y)));
    const again = w.length > 0 && said.some((k) => (k.w.join(" ") === w.join(" ")) || (shared(k) && (w.length < 4 ? w.every((x) => k.w.includes(x)) : w.filter((x) => k.w.includes(x)).length / w.length > 0.7)));
    if (again) { l.ok = false; l.why = "tells again what an earlier sentence told"; continue; }
    said.push({ w, c: l.c });
  }
  const lines = checked.map((p) => p.filter((l) => l.ok).map((l) => ({ t: l.t, c: l.c.map((x) => { const f = b.labels[x]; return f ? `${f.id}${f.kind === "thought" ? "#q" : f.kind === "reason" ? "#r" : f.kind === "last" ? "#l" : ""}` : x; }) }))).filter((p) => p.length);
  const kept = checked.flat().filter((l) => l.ok).length; const dropped = checked.flat().length - kept;
  return { lines, checked, kept, dropped, ...(title ? { title } : {}) };
}
/** The sentences the check threw out, handed back one by one with the reason, to be rewritten in place or given up.
 *  A rewrite goes through the same check; the passage keeps its shape instead of losing its joints. */
async function repair(cfg: LlmConfig, b: Brief, r: R, got: Checked2, meter: Meter | undefined, ordered: boolean): Promise<Checked2> {
  const bad = got.checked.flat().filter((l) => !l.ok && !/^(tells again|no citation)/.test(l.why ?? ""));
  if (!bad.length) return got;
  const ask2 = [`THESE SENTENCES OF YOURS WERE THROWN OUT BY THE CHECK. Rewrite each so it passes — same place in the passage, same meaning as far as the facts allow, ending with its [labels] — or write SKIP if it cannot be saved. Answer only with the numbered list, one line each.`,
    ...bad.map((l, n) => `${n + 1}. ${l.t} [${l.c.join(", ")}] — thrown out because: ${l.why}`)].join("\n");
  const res = await chat({ model: cfg.architectModel, system: b.system, user: `${b.user}\n\n${ask2}`, temperature: 0.4, maxTokens: 60 * bad.length + 80, reasoningEffort: "none", meter }, cfg).catch(() => null);
  if (!res) return got;
  for (const m of res.text.matchAll(/^\s*(\d+)[.)]\s*(.+)$/gm)) {
    const l = bad[Number(m[1]) - 1]; if (!l || /^SKIP\b/i.test(m[2].trim())) continue;
    const one = parseCited(m[2]).paras.flat(); if (one.length !== 1) continue;
    const c = checkLine(one[0], b.labels, r); if (c.ok) { l.t = c.t; l.c = c.c; l.ok = true; delete l.why; }
  }
  return settle(got.checked, b, ordered, got.title);
}

// ---------- the calls ----------
async function ask(cfg: LlmConfig, b: Brief, maxTokens: number, meter?: Meter, again?: string) {
  const res = await chat({ model: cfg.architectModel, system: b.system, user: again ? `${b.user}\n\n${again}` : b.user, temperature: 0.7, maxTokens, reasoningEffort: "none", meter }, cfg);
  if (!res.text.trim()) throw new Error(`empty reply (finish: ${res.finishReason ?? "?"})`);
  return res;
}
/** The failures, handed back once, so a second try can write around them. */
const redo = (checked: Checked[][]) => `YOUR LAST ATTEMPT LOST THESE SENTENCES TO THE CHECK:\n${checked.flat().filter((l) => !l.ok).map((l) => `- "${l.t}" — ${l.why}`).join("\n")}\nWrite it again. Every sentence must end with its labels in square brackets — [3] or [3, 7] — and survive the check.`;

export async function tellSeason(cfg: LlmConfig, r: R, k: number, meter?: Meter): Promise<Passage> {
  const b = seasonBrief(r, k);
  let res = await ask(cfg, b, 420, meter);
  let got = checkPassage(res.text, b, r);
  if (got.kept < 3 || got.dropped > got.kept / 2) { const again = await ask(cfg, b, 420, meter, redo(got.checked)).catch(() => null); if (again) { const g2 = checkPassage(again.text, b, r); if (g2.kept > got.kept || (g2.kept === got.kept && g2.dropped < got.dropped)) { got = g2; res = again; } } }
  if (got.dropped) got = await repair(cfg, b, r, got, meter, false);
  if (got.kept < 2) throw new Error(`season ${k + 1}: only ${got.kept} sentence(s) survived the check — ${got.checked.flat().filter((l) => !l.ok).map((l) => l.why).slice(0, 3).join("; ")}`);
  return { k, lines: got.lines, at: new Date().toISOString(), dropped: got.dropped, model: res.model };
}

export async function tellPortrait(cfg: LlmConfig, r: R, i: number, k: number, meter?: Meter, final = false): Promise<Portrait> {
  const b = portraitBrief(r, i, k);
  let got = checkPassage((await ask(cfg, b, 800, meter)).text, b, r, true);
  if (got.kept < 6 || got.dropped > got.kept / 3) { const again = await ask(cfg, b, 800, meter, redo(got.checked)).catch(() => null); if (again) { const g2 = checkPassage(again.text, b, r, true); if (g2.kept > got.kept) got = g2; } }
  if (got.dropped) got = await repair(cfg, b, r, got, meter, true);
  if (got.kept < 4) throw new Error(`${first(r.citizens[i].name)}: only ${got.kept} sentence(s) survived the check — ${got.checked.flat().filter((l) => !l.ok).map((l) => l.why).slice(0, 3).join("; ")}`);
  return { i, k, ...(got.title ? { title: got.title } : {}), lines: got.lines, at: new Date().toISOString(), dropped: got.dropped, ...(final ? { final: true } : {}) };
}

// ---------- what is owed ----------
/** What the teller still owes at this point in a run: the newest season first, then the ones before it that were never
 *  told; a portrait of each of the four at the fifth year and the tenth, once more when they die, and a last one when the
 *  years are over. */
export function owedChapters(t: Telling, r: R, done = false): number[] { const n = played(r); const out: number[] = []; for (let y = 0; y < (done ? Math.ceil(n / 4) : Math.floor(n / 4)); y++) { /* a run that ends mid-year still gets its last year told whole */ const c = t.chapters?.[y]; if (!c || c.partial || (c.v ?? 1) < CHAPTER_V) out.push(y); } return out; }
export function owedTelling(t: Telling, r: R, ended: boolean): { seasons: number[]; portraits: { i: number; final: boolean }[] } {
  const n = played(r);
  const seasons: number[] = [];
  for (let k = n - 1; k >= 0; k--) if (!t.seasons[k]) seasons.push(k);
  const portraits: { i: number; final: boolean }[] = [];
  r.citizens.forEach((c: any, i: number) => {
    if (!c.named) return;
    const have = t.portraits[i];
    const deadAt = c.diedAt != null ? c.diedAt - 1 : null;
    if (have?.final) return;
    if (deadAt != null && deadAt < n) { portraits.push({ i, final: true }); return; }
    if (ended) { portraits.push({ i, final: true }); return; }
    if (!have && n >= 40) portraits.push({ i, final: false }); // year ten, and the end: two a person a run
  });
  return { seasons, portraits };
}

/** The plain telling of a season, from the ledger alone: what the page shows while the teller has not reached it, and
 *  what it falls back on for good if the teller never does. No model, nothing to check: every sentence is a fact. */
export function plainSeason(r: R, k: number, n = 5): Fact[] {
  const fs = factsAt(r, k).filter((f) => f.kind !== "evening" || f.quote);
  const four = new Set(r.citizens.map((c: any, i: number) => (c.named ? i : -1)).filter((i: number) => i >= 0));
  const score = (f: Fact) => f.weight + (four.has(f.who) ? 2 : 0) - (f.kind === "reaction" ? 2 : 0);
  const top = [...fs].sort((a, b) => score(b) - score(a)).slice(0, n);
  return top.sort((a, b) => fs.indexOf(a) - fs.indexOf(b));
}

/** the repair pass, for callers outside the teller that check a passage themselves */
export const repairFor = (cfg: LlmConfig, b: Brief, r: R, got: Checked2, meter: Meter | undefined, ordered: boolean) => (got.dropped ? repair(cfg, b, r, got, meter, ordered) : Promise.resolve(got));

/** A stored passage, checked again against the rules as they are now: the labels are rebuilt from the ids it cites, every
 *  sentence goes through the check, and what fails is not shown. Text written under older, looser rules can never outlive
 *  them. */
export function recheck(r: R, lines: Line[][], ordered = false, worst?: string, flow = false): Line[][] {
  currentR = r; const was = flowing; flowing = flow; try { return recheck0(r, lines, ordered, worst); } finally { flowing = was; }
}
/** why the re-check would drop each line of a passage, for looking into a passage that reads short */
export function recheckWhy(r: R, lines: Line[][], flow = true): { t: string; why?: string }[] { currentR = r; const was = flowing; flowing = flow; try { return recheck0(r, lines, false, undefined, true) as any; } finally { flowing = was; } }
function recheck0(r: R, lines: Line[][], ordered = false, worst?: string, why = false): any {
  const labels: Brief["labels"] = {}; let n = 0;
  const key = new Map<string, string>();
  const label = (id: string): string | undefined => {
    if (key.has(id)) return key.get(id);
    const [base, tag] = id.split("#"); const l = `L${++n}`;
    const P = /^P(\d+)$/.exec(base), S = /^state:(\d+):(\d+)$/.exec(base), T = /^town:(\d+)$/.exec(base);
    if (P) { const c = r.citizens[+P[1]]; if (!c) return undefined; labels[l] = { text: peopleFacts(r)[+P[1]].text, names: [+P[1]], kind: "person", id: base }; }
    else if (S) { labels[l] = { text: stateFact(r, +S[1], +S[2]), names: [+S[1]], kind: "state", k: +S[2], id: base }; }
    else if (base.startsWith("townfact:")) { const kk = +base.slice(9); if (!(kk >= 0)) return undefined; labels[l] = { text: townFact(r, kk), names: [], kind: "town", k: kk, id: base }; }
    else if (base.startsWith("setting:")) { const f = settingFacts(r).find((x) => x.id === base); if (!f) return undefined; labels[l] = { text: f.text, names: f.names, kind: f.head === "town" || f.head === "place" ? "world" : "person", id: base }; }
    else if (base.startsWith("world:")) { const y = /^world:[wts]:/.test(base) ? Math.floor(+base.split(":")[2] / 4) : +base.split(":").pop()!; const f = worldFacts(r, y).find((x) => x.id === base); if (!f) return undefined; labels[l] = { text: f.text, names: namesIn(r, f.text), kind: "world", k: f.k, id: base }; }
    else if (base.startsWith("between:")) { const [, a, b, kk] = base.split(":").map(Number); const text = betweenLine(r, a, b, kk); if (!text) return undefined; labels[l] = { text, names: [a, b], kind: "state", k: kk, id: base }; }
    else if (base.startsWith("fate:") || base.startsWith("fame:")) { const f = endFacts(r).find((x) => x.id === base); if (!f) return undefined; labels[l] = { text: f.text, names: f.names, kind: "person", id: base }; }
    else if (base.startsWith("change:")) { const y = +base.split(":")[3]; const f = changeFacts(r, y).find((x) => x.id === base); if (!f) return undefined; labels[l] = { text: f.text, names: f.names, kind: "state", k: f.k, id: base }; }
    else if (T) { const t = townNow(r, +T[1]); labels[l] = { text: `${t.alive} alive.${t.epoch && t.epoch.since > 0 ? ` Still going on: ${t.epoch.headline}` : ""}`, names: [], kind: t.epoch && t.epoch.since > 0 ? "epoch-on" : "town", k: +T[1], id: base }; }
    else { const f = factById(r, base); if (!f) return undefined;
      if (tag === "q") labels[l] = { text: "", quote: f.quote, names: [f.who], kind: "thought", k: f.k, id: f.id, when: whenOf(r, f.k) };
      else if (tag === "r") labels[l] = { text: "", because: f.because, names: [f.who], kind: "reason", k: f.k, id: f.id, when: whenOf(r, f.k) };
      else if (tag === "l") { if (!f.last) return undefined; labels[l] = { text: "", last: f.last, names: [f.who], kind: "last", k: f.k, id: f.id, when: whenOf(r, f.k) }; }
      else if (tag === undefined && (f.quote || f.because)) { labels[l] = { text: f.text, quote: f.quote, because: f.because, names: f.names, kind: f.kind, k: f.k, id: f.id, when: whenOf(r, f.k), scene: f.situation }; } // written before thoughts were cited apart: the thought is only good inside quotation marks, which the leak check enforces
      else labels[l] = { text: f.text, names: f.names, kind: f.kind, k: f.k, id: f.id, when: whenOf(r, f.k), scene: f.situation };
    }
    key.set(id, l); return l;
  };
  worstIds = new Set(worst ? [worst] : []);
  const checked = lines.map((p) => p.map((ln) => { const cs = ln.c.map(label); if (cs.some((x) => !x)) return { t: ln.t, c: [], ok: false, why: "cites what is no longer there" } as Checked; return checkLine({ t: ln.t, c: cs as string[] }, labels, r); }));
  const b: Brief = { system: "", user: "", labels };
  if (why) return checked.flat().filter((l) => !l.ok).map((l) => ({ t: l.t, why: l.why }));
  return settle(checked, b, ordered).lines;
}

/** what a year did between the four: who drew together and who drew apart, from how they stood at its start and its end */
export function changeFacts(r: R, y: number): { id: string; text: string; names: number[]; k: number }[] {
  const tie = (v: number) => (v >= 0.6 ? "close" : v >= 0.2 ? "on good terms" : v > -0.2 ? "neither close nor at odds" : v > -0.6 ? "cold to each other" : "at open odds");
  const end = Math.min(y * 4 + 3, played(r) - 1); const f0 = y ? r.frames?.[y * 4 - 1] : null, f1 = r.frames?.[end];
  const four = r.citizens.map((c: any, i: number) => (c.named ? i : -1)).filter((i: number) => i >= 0);
  const gone = (i: number) => r.citizens[i].diedAt != null && r.citizens[i].diedAt - 1 < y * 4;
  const out: { id: string; text: string; names: number[]; k: number }[] = [];
  for (let a = 0; a < four.length; a++) for (let b = a + 1; b < four.length; b++) { const i = four[a], j = four[b]; if (gone(i) || gone(j)) continue;
    const v = (f: any) => ((f?.ties?.[i]?.[r.citizens[j].id] ?? 0) + (f?.ties?.[j]?.[r.citizens[i].id] ?? 0)) / 2; const was = tie(f0 ? v(f0) : 0), now = tie(v(f1)); if (was === now) continue;
    out.push({ id: `change:${i}:${j}:${y}`, text: `${first(r.citizens[i].name)} and ${first(r.citizens[j].name)} went from ${was} to ${now} over the year.`, names: [i, j], k: end }); }
  return out;
}

/** The world around the town in a year, as citable facts: the hardship as the Architect wrote it, each season's weather,
 *  and what is coming that nobody in the town knows. These are the facts a sentence about the world stands on. */
/** What had passed between two people before a moment, as one citable line: the harms and kindnesses each way, and the
 *  last of each, in the record's own words. So when Nell marries Ines, the reader is told it was Ines who had signed the
 *  order against her. */
export function betweenLine(r: R, i: number, j: number, k: number): string {
  const ni = nameOf(r, i).split(" ")[0], nj = nameOf(r, j).split(" ")[0];
  // the worst harm and the biggest kindness each way (the heaviest, and the later of two alike), with how many of each
  const way = (a: number, b: number) => { let harm = 0, help = 0; let lastHarm: Fact | null = null, lastHelp: Fact | null = null;
    for (let kk = 0; kk < k; kk++) for (const f of factsAt(r, kk)) { if (!f.deed || f.who !== a || f.whom !== b) continue;
      if (f.tone === "harm") { harm++; if (!lastHarm || f.weight >= lastHarm.weight) lastHarm = f; } else if (f.tone === "help") { help++; if (!lastHelp || f.weight >= lastHelp.weight) lastHelp = f; } }
    return { harm, help, lastHarm, lastHelp }; };
  const deed = (f: Fact, na: string) => f.text.split(/(?<=\.)\s/)[0].replace(/\.$/, "").replace(new RegExp(`^${na}\\s+`), "");
  const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
  const side = (a: number, b: number, na: string, nb: string) => { const x = way(a, b); const bits: string[] = [];
    if (x.harm) bits.push(`done ${nb} harm ${times(x.harm)} (the worst, ${whenOf(r, x.lastHarm!.k)}: ${deed(x.lastHarm!, na)})`);
    if (x.help) bits.push(`done ${nb} a kindness ${times(x.help)} (the biggest, ${whenOf(r, x.lastHelp!.k)}: ${deed(x.lastHelp!, na)})`);
    return bits.length ? `${na} had ${bits.join(" and ")}` : ""; };
  const parts = [side(i, j, ni, nj), side(j, i, nj, ni)].filter(Boolean);
  return parts.length ? `Before this, between ${ni} and ${nj}: ${parts.join("; ")}.` : "";
}
/** which of the four a world fact names (the director's turns may act on them by name) */
const namesIn = (r: R, text: string): number[] => (r.citizens ?? []).map((c: any, i: number) => (c.named && new RegExp(`\\b${first(c.name)}\\b`).test(text) ? i : -1)).filter((i: number) => i >= 0);
export function worldFacts(r: R, y: number, opts?: { skipFirst?: boolean }): { id: string; text: string; k: number }[] {
  const out: { id: string; text: string; k: number }[] = []; const n = played(r); const end = Math.min(y * 4 + 3, n - 1);
  const told = (e: any) => String((r.scenario?.epochs ?? []).find((x: any) => x.id === e.id)?.text ?? "").replace(/^Year \d+\.\s*/, "");
  const sev = (e: any) => (e.stakes >= 3 ? "a terrible one" : e.stakes >= 2 ? "a hard one" : "");
  for (const e of (r.events ?? []).filter((e: any) => e.seasons && e.at - 1 <= end && e.at - 1 + e.seasons > y * 4)) {
    const began = e.at - 1 >= y * 4; const k = Math.max(e.at - 1, y * 4);
    out.push({ id: `world:e:${e.id}:${y}`, k, text: `${began ? `In the ${SEASONS[(e.at - 1) % 4]}, ${e.kind} came to the town` : `The ${e.kind} that began before this year went on`}${sev(e) ? `, ${sev(e)}` : ""}: ${e.headline}${told(e) ? ` ${told(e)}` : ""}` }); }
  // what the world did that nobody chose, season by season (the director's turns): the plot the decisions answer
  const tEnd = Math.min(y * 4 + 3, Math.max(end, ...Object.keys(r.turns ?? {}).map((x) => +x - 1).filter((x) => x >= y * 4)));
  for (let k = y * 4; k <= tEnd; k++) { const t = r.turns?.[k + 1]; if (!t?.headline) continue; const Sn = SEASONS[k % 4].replace(/^./, (c) => c.toUpperCase());
    const paid = t.closes ? r.turns?.[String(t.closes).replace(/^t/, "")]?.sets?.what : null; const paidAt = t.closes ? +String(t.closes).replace(/^t/, "") - 1 : -1;
    out.push({ id: `world:t:${k}`, k, text: `${Sn}: ${t.headline}. ${t.text}${paid ? ` This was what the town had been told to expect since ${whenOf(r, paidAt).replace(/^Year \d+, /, "the ")}${Math.floor(paidAt / 4) !== y ? ` of Year ${Math.floor(paidAt / 4) + 1}` : ""}: ${String(paid).replace(/\.$/, "")}.` : ""}` });
    // a set-up: something the town now knows is coming, planted where the reader can see it paid off later
    if (t.sets?.what) out.push({ id: `world:s:${k}`, k, text: `${Sn}: the town was told what was coming: ${String(t.sets.what).replace(/\.$/, "")}.` }); }
  if (opts?.skipFirst) { const i = out.findIndex((f) => f.id === "world:t:0"); if (i >= 0) out.splice(i, 1); }
  for (let k = y * 4; k <= end; k++) out.push({ id: `world:w:${k}`, k, text: `${SEASONS[k % 4].replace(/^./, (c) => c.toUpperCase())}: ${weatherAt(r, k)}.` });
  const next = (r.events ?? []).filter((e: any) => e.seasons && e.at - 1 > end).sort((a: any, b: any) => a.at - b.at)[0];
  if (next) out.push({ id: `world:a:${y}`, k: end, text: `What is coming, which the town does not know: ${next.kind} — ${next.headline}` });
  return out;
}

// ---------- a year, told ----------
/** The rules for the story itself: the same truth about people, and the world let in — its weather, its places, its fear —
 *  in sentences that stand only on the world's facts. And a voice for drama, not a ledger. */
const STORY_RULES = RULES
  .replace(/- weather, light, objects, rooms, hours, gestures, postures, faces, tears: none of it is recorded, so none of it may be written;/, "- gestures, postures, faces, tears, rooms and hours of the day: none of it is recorded, so none of it may be written about a person;")
  .replace(/THE VOICE\.[^\n]*/, "THE VOICE. Write it as a novel for a general reader: plain, clear English in the past tense, told close to the people. Tell it in scenes, not as a summary: open on a moment, stay with one person at a time, and let their own words (their [Q] thoughts, quoted as what they told themselves) carry what they felt. Move through time with simple turns (By the autumn…, Two seasons later…). Short sentences for the hard things, longer ones to carry the reader along. Every detail still comes from the facts: the scene is what the facts say, told closely, never made up. No poetry, no metaphors, no similes, no rhyme or rhythm tricks, no lists of three, no fancy words.")
  + "\n\nTHE WORLD. Sentences that cite ONLY world facts (the D, E, W, A, L and T lines) say plainly what is happening to the place: what came, the weather, the food, the sick, the dead, what is coming. Such a sentence names no one, counts nothing the lines do not count, and kills no one the lines do not. Everything about a person comes only from that person's facts. Never copy a line's wording and never repeat what THE STORY SO FAR already said.";
export const CHAPTER_TASK = [STORY_RULES.replace(/THE FORM\.[^\n]*/, "THE FORM. Every sentence ends with the labels of the facts it comes from, in square brackets. A sentence may tell two or three moments if they come in the order they happened."), "",
  "THE TASK: one year of this place, as the next chapter of a novel that keeps changing with what people decide. 250 to 340 words, four or five paragraphs.",
  "Begin your answer with one line: TITLE: two to five plain words for the chapter, taken from its facts (like TITLE: The Purse, or TITLE: A Short List). Then the chapter.",
  "The chapters are read one after another. THE STORY SO FAR is what the reader has just read: carry on from it, and never tell any of it again.",
  "TELL IT IN ORDER. The year is given season by season: tell it in that order, spring to winter, and never go back to an earlier season. Make it clear when each season turns (That summer…, By the autumn…, When winter came…), but do not open the chapter with the season: open on the first thing that happened, or on a person. A season with nothing worth telling can be passed over in a phrase.",
  "EVERY CHOICE HAS ITS REASON. Before anyone chooses anything, say what put it in front of them (its situation line, in your words) and what was at stake, so a reader who has not seen the facts understands why they did it. Then what they told themselves, what they chose, and what came of it. Never tell a choice the reader was not set up for. Never mention an order, a list, a debt or a person the reader has not been told about.",
  "WHAT LAY BETWEEN THEM. When a B line sits under a moment between two of the four, say once, right after the moment, what had passed between them before it, in the past perfect (It was Ines who had signed the order against Nell in Year 2; Nell had stood alone for her at the council.). One sentence, never a tally of numbers, at most three in a chapter.",
  "SET-UPS AND PAY-OFFS. When the town is told something is coming (a D line that says the town was told), tell it in its season, plainly, so the reader waits for it. When a later D line says it was what the town had been told to expect, say so: that is the pay-off. When an \"Earlier … had thought\" line sits under a moment, you may quote it beside the moment it came true.",
  "JOIN IT UP. Each season should follow from the one before: if the town's trouble (a D line) led to someone's choice, say so, but only when the facts show the link.",
  "Every numbered moment is in the chapter: they were chosen because they matter, so leave none out.",
  "The numbered decisions are the heart of it: tell each as a small scene in its season: what they faced, what they told themselves ([Q], quoted and marked as what they told themselves), what they chose, and what it changed (who got hurt or helped, and what had passed between them before: B lines).",
  "The last paragraph: where it leaves them. Pick the one or two whose year changed them most and say how they stand, joined to what happened to them (S lines); never run through all four, never a list of moods and ties. The very last sentence is the one HOW TO END THIS CHAPTER gives, so the reader wants the next chapter. Never end on \"though nobody knew it yet\" unless that is the line given.",
  "A death of one of the four is the heaviest thing in any year. Never tell it in passing or in half a sentence: give it a paragraph of its own. Tell how they died, plainly, as the death line says it. If the death line has last words ([V] under it), quote them exactly as words said aloud as they died (like: Her last words were: “…”), never as a thought: they are the last thing we hear from them. Then who is left grieving them. Let the rest of the year bend around it.",
  "Time words (that spring, by winter) only where the facts you cite are in that season.",
  "Never open a chapter on the weather or the stores: open on what happened (a D or E line) or on a person. The weather and the food come in only where they change something.",
  "Never recite the town's counts (so many alive, so many dead, so many low in spirits): say what they mean, once (the stores ran low; people went hungry). A number only when it is the story (the third death this year).",
  "AN EXAMPLE of the voice and the form, about a town and people that do not exist (not the length, not the words):",
  "TITLE: A Short List",
  "The second winter came early. [E1] By the new year the store was nearly empty, and three families down the row were going hungry. [T3]",
  "The council's order was on Mara's table: Oskar's ration was to be cut, and it needed Mara's name. [7] “If I don't sign, someone else signs and I lose the book,” Mara told herself. [Q7] She signed it. [7]",
  "Oskar went hungry through the summer. [9] It was not the first time: Mara had put her name to his ration once before, and he had split his sack with her the winter after. [B1]",
  "Mara ended the year owing more than she had. [S1] \"If they count the book again, it is my name they will read,\" Mara told herself as the winter ended. [Z, QZ]",
].join("\n");

/** How much a stretch of a year carried: a death of one of the four counts three, a heavy choice of theirs one, a hardship
 *  or a turn of the plot one each, a lesser choice a quarter. Under three a closed year (never the first, which brings the
 *  four in) was quiet, and is told short. */
export function yearWeight(r: R, y: number, upto = 4): number {
  let w = 0; const n = Math.min(y * 4 + upto, played(r));
  for (let k = y * 4; k < n; k++) {
    for (const a of r.acts?.[k] ?? []) { if (!r.citizens?.[a?.c]?.named) continue;
      if (a.kind === "death") w += 3;
      else if (a.dilemma && a.options?.length && !a.quiet) { const o = a.options.find((x: any) => x.id === a.option) ?? {}; const h = Math.max(o.harm ?? 0, o.help ?? 0); w += h >= 0.3 ? 1 : h >= 0.2 ? 0.25 : 0; } }
    if (r.turns?.[k + 1]) w += 1;
  }
  w += (r.events ?? []).filter((e: any) => e.seasons && e.at - 1 >= y * 4 && e.at - 1 < n).length;
  return w;
}
export const QUIET = 3;
export function chapterBrief(r: R, y: number, before = "", taken: string[] = []): Brief {
  flowing = true; worstIds = new Set();
  const labels: Brief["labels"] = {};
  for (const p of peopleFacts(r)) labels[p.label] = { text: p.text, names: [p.i], kind: "person", id: p.label };
  const ks = [0, 1, 2, 3].map((s) => y * 4 + s).filter((k) => k < played(r));
  const all = ks.flatMap((k) => factsAt(r, k)).filter((f) => f.kind !== "evening" && f.kind !== "condition" && f.kind !== "musing");
  // what they turned over in their heads through the year: the latest first, a thought back on something done before the rest
  const mus = ks.flatMap((k) => factsAt(r, k)).filter((f) => f.kind === "musing").sort((a, b) => b.k - a.k || (a.id.endsWith("p") ? -1 : 1)).slice(0, 5);
  const four = new Set(r.citizens.map((c: any, i: number) => (c.named ? i : -1)).filter((i: number) => i >= 0));
  const score = (f: Fact) => f.weight + (f.names.some((i) => four.has(i)) ? 3 : 0) + (f.kind === "death" ? 10 : 0);
  // few moments, told fully: the heaviest three or four of the year, each with the situation it put them in, so the
  // telling has to stay with each one — the stakes, the choice, their words, the cost — instead of walking a list
  const picked = new Set([...all].sort((a, b) => score(b) - score(a)).slice(0, 4));
  // a death of one of the four always comes with the last thing they chose before it, so it can be told as what it was
  for (const d of all.filter((f) => f.kind === "death" && four.has(f.who))) { picked.add(d); const last = all.filter((f) => f.who === d.who && f.dilemma && f.k <= d.k).sort((a, b) => b.k - a.k)[0]; if (last) picked.add(last); }
  const chosen = [...picked].sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
  const lines: string[] = [];
  const season = new Map<number, string[]>(); const put = (k: number, x: string) => (season.get(k) ?? season.set(k, []).get(k)!).push(x);
  // an earlier dread of the one who chose, about the one it was done to: quoted beside the moment it comes true
  const allMus = (from: number, to: number) => { const xs: Fact[] = []; for (let k = Math.max(0, from); k <= to; k++) xs.push(...factsAt(r, k).filter((f) => f.kind === "musing" && f.id.endsWith("a"))); return xs; };
  let fn = 0, bn = 0; const usedFear = new Set<string>(); const pairsTold = new Set<string>();
  chosen.forEach((f, n) => { const l = String(n + 1); labelFact(labels, l, f, r, f.situation); lines.push(withScene(l, f, r));
    let line = withScene(l, f, r);
    if (f.whom != null && f.whom !== f.who && four.has(f.whom)) { const them = String(r.citizens[f.whom]?.name ?? "").split(" ")[0];
      const fear = allMus(f.k - 8, f.k - 1).filter((m) => m.who === f.who && them && new RegExp(`\\b${them}\\b`).test(String(m.quote ?? "")) && !usedFear.has(m.id)).sort((a, b) => b.k - a.k)[0];
      if (fear) { usedFear.add(fear.id); const fl = `F${++fn}`; labelFact(labels, fl, fear, r); line += `\n   [${fl}] Earlier (${whenOf(r, fear.k)}), ${nameOf(r, f.who)} had thought about what was coming: [Q${fl}] "${fear.quote}" (cite it as [${fl}, Q${fl}] with the words quoted exactly)`; } }
    const pairKey = [f.who, f.whom].sort().join("-");
    if (bn < 3 && f.whom != null && f.whom !== f.who && four.has(f.whom) && four.has(f.who) && !pairsTold.has(pairKey)) { pairsTold.add(pairKey); const bt = betweenLine(r, f.who, f.whom, f.k);
      if (bt) { const bl = `B${++bn}`; labels[bl] = { text: bt, names: [f.who, f.whom], kind: "state", k: f.k, id: `between:${f.who}:${f.whom}:${f.k}` }; line += `\n   [${bl}] ${bt}`; } }
    put(f.k, line); });
  // the threads the year inherits: for each of the four, the chief tie so far and how it began
  const threads: string[] = [];
  for (const i of four) { const ps = pairs(r, Math.max(0, y * 4 - 1)).filter((p) => (p.a === i || p.b === i) && p.facts.some((f) => f.deed && f.k < y * 4)).slice(0, 1);
    for (const p of ps) { const f = p.facts.filter((g) => g.deed && g.k < y * 4).sort((a, b) => a.k - b.k)[0]; if (!f) continue; const l = `H${threads.length + 1}`; labelFact(labels, l, f, r); threads.push(`[${l}] ${whenOf(r, f.k)} · ${f.text}`); } }
  const ep = (r.events ?? []).filter((e: any) => e.seasons && e.at - 1 < y * 4 + 4 && e.at - 1 + e.seasons > y * 4).map((e: any) => e.headline);
  labels.T = { text: ep.join(" ") || "no hardship", names: [], kind: "town", k: y * 4, id: `town:${y * 4}` };
  // the town itself, season by season: the stores, the price of food, the hungry, the sick, the low, the dead
  const town: string[] = [];
  ks.forEach((kk, n) => { const l = `T${n + 1}`; const text = townFact(r, kk); labels[l] = { text, names: [], kind: "town", k: kk, id: `townfact:${kk}` }; town.push(`[${l}] ${text}`); put(kk, `[${l}] ${text}`); });
  const world: string[] = []; const wl: Record<string, string> = { e: "E", w: "W", a: "A", t: "D", s: "D" }; const wn: Record<string, number> = { E: 0, W: 0, A: 0, D: 0 };
  for (const f of worldFacts(r, y, { skipFirst: y === 0 && !!r.turns?.[1] })) { const kind = wl[f.id.split(":")[1]]; const l = `${kind}${++wn[kind]}`; labels[l] = { text: f.text, names: namesIn(r, f.text), kind: "world", k: f.k, id: f.id }; if (kind === "A") world.push(`[${l}] ${f.text}`); else put(f.k, `[${l}] ${f.text}`); }
  for (const f of settingFacts(r).filter((x) => x.head === "place")) { const l = f.id.slice(8); labels[l] = { text: f.text, names: [], kind: "world", id: f.id }; world.push(`[${l}] ${f.text}`); }
  const musLines: string[] = []; mus.forEach((f, n) => { const l = String(chosen.length + n + 1); labelFact(labels, l, f, r); musLines.push(`[${l}] ${f.text} [Q${l}] "${f.quote}"`); });
  // how each of the four stood when the year closed: spirits and why, hunger, grief, who they were close to and at odds with
  const end = Math.min(y * 4 + 3, played(r) - 1); const st: string[] = [];
  [...four].forEach((i, n) => { const l = `S${n + 1}`; const text = stateFact(r, i, end); labels[l] = { text, names: stateNames(r, i, end), kind: "state", k: end, id: `state:${i}:${end}` }; st.push(`[${l}] ${text}`); });
  // how the chapter ends: one line, chosen here so it is never the same close twice running. A set-up about to fall due;
  // else the dread, in their own words, of the one whose year weighed most; else the hardship on its way, if it is near
  let hook = ""; const endK = end; const nextK = endK + 4;
  { const setups = Object.entries(r.turns ?? {}).map(([t, v]: any) => ({ t: +t, v })).filter((x) => x.v?.sets?.what && x.t - 1 <= endK);
    const closed = new Set(Object.entries(r.turns ?? {}).filter(([t, v]: any) => v?.closes && +t - 1 <= endK).map(([, v]: any) => String(v.closes)));
    const due = setups.filter((x) => !closed.has(`t${x.t}`) && x.t + (x.v.sets.in ?? 2) - 1 > endK && x.t + (x.v.sets.in ?? 2) - 1 <= nextK).sort((a, b) => b.t - a.t)[0];
    if (due) { const k0 = due.t - 1; const f = worldFacts(r, Math.floor(k0 / 4)).find((x) => x.id === `world:s:${k0}`);
      if (f) { labels.Z = { text: f.text, names: namesIn(r, f.text), kind: "world", k: f.k, id: f.id }; hook = `[Z] ${f.text} (it has not come yet: end on the town waiting for it)`; } }
    if (!hook) { const w8 = new Map<number, number>(); for (const f of chosen) if (four.has(f.who)) w8.set(f.who, (w8.get(f.who) ?? 0) + f.weight);
      const placeNames = (r.map?.locations ?? r.scenario?.locations ?? []).map((l: any) => String(l.name).replace(/^The /, ""));
      const names = r.citizens.map((c: any) => String(c.name).split(" ")[0]);
      const who = [...w8.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
      for (const i of who) { const m = allMus(y * 4, endK).filter((x) => x.who === i && [...names, ...placeNames].some((n) => n && String(x.quote ?? "").includes(n))).sort((a, b) => b.k - a.k)[0];
        if (m && r.citizens[i]?.alive !== false && !usedFear.has(m.id)) { labelFact(labels, "Z", m, r); hook = `[Z] ${m.text} [QZ] "${m.quote}" (end on these words, quoted exactly and cited [Z, QZ], as the thing ${pro(r.citizens?.[i]).he} was afraid of)`; break; } } }
    if (!hook) { const a = Object.entries(labels).find(([l, v]) => /^A\d/.test(l) && (v as any).id?.startsWith("world:a:")); const next = (r.events ?? []).filter((e: any) => e.seasons && e.at - 1 > endK).sort((p: any, q: any) => p.at - q.at)[0];
      if (a && next && next.at - 1 <= nextK && !/knew it yet|knew nothing of it|did not know it yet/i.test(before.slice(-240))) hook = `[${a[0]}] (the hardship on its way; nobody there knows)`; } }
  const changes: string[] = [];
  for (const c of changeFacts(r, y)) { const l = `C${changes.length + 1}`; labels[l] = { text: c.text, names: c.names, kind: "state", k: c.k, id: c.id }; changes.push(`[${l}] ${c.text}`); }
  const lastOf = (x: string) => x.split(/\n\n+/).slice(-2).join("\n\n");
  const user = [before ? `THE STORY SO FAR ENDED WITH (the reader has just read this; carry on from it, do not repeat it, do not cite it):\n${lastOf(before)}\n` : "", `THE YEAR: Year ${y + 1}.`, ep.length ? `[T] What came through the town: ${ep.join(" ")}` : "[T] Nothing came through the town this year.", "",

    "THE YEAR, SEASON BY SEASON. Tell it in this order. In each season: D is what happened in the town that nobody chose (the plot), E the hardship, W the weather, T the town, and the numbered lines what the four did:",
    ...ks.flatMap((kk) => (season.get(kk)?.length ? [`— ${SEASONS[kk % 4].toUpperCase()} —`, ...season.get(kk)!] : [])), "",
    world.length ? "WHAT IS COMING, AND THE PLACES:" : "", ...world, "",
    mus.length ? "WHAT THEY TURNED OVER IN THEIR HEADS (their own words — quote them, cite the Q label, and say they thought it):" : "", ...musLines, mus.length ? "" : "",

    "HOW THE FOUR STOOD WHEN THE YEAR CLOSED (use one or two, joined to what happened; never all of them):", ...st, "",
    hook ? `HOW TO END THIS CHAPTER: the last sentence stands on ${hook}.` : "HOW TO END THIS CHAPTER: on the moment that mattered most this year, never on how everyone stands.", "",
    y > 0 && played(r) >= y * 4 + 4 && yearWeight(r, y) < QUIET ? "THIS WAS A QUIET YEAR. Tell it short: 90 to 150 words, two paragraphs. Do not stretch it." : "",
    taken.length ? `TITLES ALREADY USED (never use one of these again): ${taken.join("; ")}.` : "", "Write the chapter."].filter((x) => x !== "").join("\n");
  return { system: prefixOf(r, CHAPTER_TASK), user, labels };
}
/** "TITLE: The Purse" off the top of a chapter's answer; kept only when every word that matters is in the facts it had */
function takeTitle(res: { text: string }, b: Brief, taken: string[] = []): { res: any; title?: string } {
  const m = /^\s*\**\s*TITLE:\s*\**\s*([^\n]{2,60})\n/i.exec(res.text); if (!m) return { res };
  const title = m[1].replace(/[*“”"\[\]]/g, "").replace(/\.$/, "").trim(); const pool = norm(Object.values(b.labels).map((l: any) => `${l.text} ${l.quote ?? ""} ${l.scene ?? ""}`).join(" "));
  const ok = title.split(/\s+/).length <= 6 && norm(title).split(" ").filter((w) => w.length > 3 && !["that", "this", "with", "from", "what", "when", "they", "them", "their", "last", "first", "year", "long", "hard"].includes(w)).every((w) => pool.includes(w.replace(/s$/, "")));
  const again = taken.some((x) => norm(x) === norm(title));
  return { res: { ...res, text: res.text.slice(m[0].length) }, title: ok && !again ? title : undefined };
}
export async function tellYear(cfg: LlmConfig, r: R, y: number, meter?: Meter, before = "", taken: string[] = []): Promise<Passage> {
  const b = chapterBrief(r, y, before, taken);
  try {
    let title: string | undefined; const titled = (x: any) => { const t = takeTitle(x, b, taken); title ??= t.title; return t.res; };
    let res = titled(await ask(cfg, b, 1100, meter));
    flowing = true; let got = checkPassage(res.text, b, r);
    if (got.kept < 3) { res = titled(await ask(cfg, b, 1100, meter, "Your last answer had no [labels] after its sentences, so all of it was thrown away. Every sentence must end with the labels of the facts it comes from, in square brackets, like: The ice held the town. [W1]")); flowing = true; got = checkPassage(res.text, b, r); }
    if (got.dropped) { flowing = true; got = await repair(cfg, b, r, got, meter, false); }
    if (got.kept < 3) throw new Error(`year ${y + 1}: only ${got.kept} sentence(s) survived the check — ${got.checked.flat().filter((l) => !l.ok).map((l) => l.why).slice(0, 3).join("; ")}`);
    return { k: y, ...(title ? { title } : {}), lines: withDeaths(r, y, withSituations(r, withDecisions(r, y, inSeasonOrder(got.lines)))), at: new Date().toISOString(), dropped: got.dropped, model: res.model, v: CHAPTER_V, why: got.checked.flat().filter((l) => !l.ok).slice(0, 8).map((l) => `${l.why} — ${l.t.slice(0, 140)}`) } as Passage;
  } finally { flowing = false; }
}
export const setFlowing = (v: boolean) => { flowing = v; };

/** the season a cited fact belongs to, where it has one */
function seasonOfId(id: string): number | null {
  const m = /^(\d+)\./.exec(id) ?? /^(?:world:[tw]|townfact|state:\d+):(\d+)$/.exec(id); return m ? +m[1] : null;
}
/** A year is read in order. When the telling goes back in time (a death in spring told after the summer), its sentences
 *  are put back in the order of their seasons, a paragraph a season, how the four stood at the end last. A telling
 *  already in order is left exactly as written. */
export function inSeasonOrder(lines: Line[][]): Line[][] {
  const flat: { l: Line; k: number; p: number; end: boolean }[] = []; let last = -1;
  lines.forEach((para, p) => para.forEach((l) => { const ks = l.c.filter((x) => !x.includes("#") && !x.startsWith("state:")).map(seasonOfId).filter((x): x is number => x != null);
    const k = ks.length ? Math.min(...ks) : last; last = Math.max(last, k); flat.push({ l, k, p, end: l.c.every((x) => x.startsWith("state:") || x.startsWith("change:")) }); }));
  const body = flat.filter((x) => !x.end); if (body.every((x, i) => i === 0 || x.k >= body[i - 1].k)) return lines;
  const sorted = [...body].sort((a, b) => a.k - b.k); const out: Line[][] = [];
  sorted.forEach((x, i) => { if (i === 0 || x.k !== sorted[i - 1].k) out.push([]); out[out.length - 1].push(x.l); });
  const ends = flat.filter((x) => x.end).map((x) => x.l); if (ends.length) out.push(ends);
  return out.filter((p) => p.length);
}
/** The year's heaviest decisions are in its chapter. The telling is asked to leave none out, and sometimes does, or loses
 *  them to the check: then each goes in plainly, in the record's own words, in its season: what they told themselves,
 *  then what they did (and its situation goes in before it, by withSituations). */
export function withDecisions(r: R, y: number, lines: Line[][], most = 4): Line[][] {
  const out = lines.map((p) => p.slice()); const cited = new Set(out.flat().flatMap((l) => l.c.map((x) => x.split("#")[0])));
  const weight = (a: any) => { const o = (a.options ?? []).find((x: any) => x.id === a.option) ?? {}; return Math.max(o.harm ?? 0, o.help ?? 0) + ((a.kills ?? []).length ? 1 : 0) + (a.experiment ? 0.1 : 0); };
  const heavy: { k: number; j: number; a: any; w: number }[] = [];
  for (let k = y * 4; k < y * 4 + 4; k++) (r.acts?.[k] ?? []).forEach((a: any, j: number) => { if (a?.dilemma && a.options?.length && r.citizens?.[a.c]?.named && !a.quiet && a.text) heavy.push({ k, j, a, w: weight(a) }); });
  for (const x of heavy.sort((p, q) => q.w - p.w).slice(0, most).filter((x) => x.w >= 0.2).sort((p, q) => p.k - q.k)) {
    const id = `${x.k}.${x.j}`; if (cited.has(id)) continue;
    const who = String(r.citizens[x.a.c].name).split(" ")[0]; const add: Line[] = [];
    if (x.a.thought) add.push({ t: `“${String(x.a.thought).replace(/[.,;]?\s*$/, "")},” ${who} told ${pro(r.citizens[x.a.c]).himself}.`, c: [`${id}#q`] });
    const said = x.a.kind === "choice" ? `chose to ${String(x.a.choice ?? x.a.text).replace(/\.$/, "").replace(/^./, (c: string) => c.toLowerCase())}` : String(x.a.text).replace(/\.$/, "");
    add.push({ t: `${who} ${said}.`, c: [id] });
    // before the first sentence about a later season; else at the end of the body, before how they stood
    let at: [number, number] | null = null;
    out.forEach((p, pi) => p.forEach((l, li) => { if (at) return; const ks = l.c.filter((c) => !c.startsWith("state:") && !c.includes("#")).map(seasonOfId).filter((v): v is number => v != null); if (ks.length && Math.min(...ks) > x.k) at = [pi, li]; }));
    if (at) out[at[0]].splice(at[1], 0, ...add); else { const end = out.findIndex((p) => p.every((l) => l.c.every((c) => c.startsWith("state:") || c.startsWith("change:")))); if (end > 0) out.splice(end, 0, add); else out.push(add); }
    cited.add(id);
  }
  return out;
}
/** Every choice has its reason. When a decision is told without what put it in front of them (the situation), the
 *  situation goes in just before it, in the record's own words, so nobody signs an order the reader never heard of. */
export function withSituations(r: R, lines: Line[][]): Line[][] {
  const out = lines.map((p) => p.slice()); const done = new Set<string>(); const scenes = new Set<string>();
  // compared by the stem, so the telling's own words count ("owed" for "owes", "carrying" for "carries")
  const words = (x: string) => new Set(norm(x).split(" ").filter((w) => w.length > 3 && !["their", "they", "them", "that", "this", "with", "from", "what", "have", "will", "your", "would", "there", "when", "could", "cannot"].includes(w)).map((w) => w.slice(0, 4)));
  for (let p = 0; p < out.length; p++) for (let i = 0; i < out[p].length; i++) {
    const l = out[p][i]; const id = l.c.map((x) => x.split("#")[0]).find((x) => /^\d+\.\d+$/.test(x)); if (!id || done.has(id)) continue; done.add(id);
    const [k, j] = id.split(".").map(Number); const a = r.acts?.[k]?.[j]; if (!a?.situation || !a.options?.length) continue;
    const scene = `${String(a.dilemma ?? "").replace(/-b$/, "")}|${[a.c, a.target].sort().join("-")}`; if (scenes.has(scene)) continue; scenes.add(scene); /* the same scene between the same two is set in once a chapter */
    const who = String(r.citizens?.[a.c]?.name ?? "").split(" ")[0]; const them = a.target != null && a.target !== a.c ? String(r.citizens?.[a.target]?.name ?? "").split(" ")[0] : "";
    const sit = outsideQuotes(String(a.situation), (x: string) => (x.trim() ? thirdPerson(x, who, them, sexOf(r.citizens?.[a.c])).replace(/\.$/, /[.!?]\s*$/.test(x) ? "." : "") : x)).replace(/\s+\./g, "."); const own = words(`${who} ${them} ${a.text ?? ""} ${(a.options ?? []).map((o: any) => o.label).join(" ")}`); const sw = new Set([...words(sit)].filter((w) => !own.has(w))); /* what the situation adds beyond the deed itself */
    // told by the story, not by their own thought: what is inside quotation marks is them thinking, and says nothing to the reader
    const bare = (x?: string) => String(x ?? "").replace(/[“"][^”"]*[”"]/g, " ");
    const near = [bare(out[p][i - 1]?.t ?? (p > 0 ? out[p - 1].at(-1)?.t ?? "" : "")), ...out[p].slice(i, i + 3).filter((x) => x.c.some((c) => c.split("#")[0] === id)).map((x) => bare(x.t))].join(" "); const told = [...words(near)].filter((w) => sw.has(w)).length;
    if (told >= Math.min(3, sw.size)) continue;
    const four = (r.citizens ?? []).map((c: any) => String(c.name).split(" ")[0]);
    const other = a.target != null && a.target !== a.c ? r.citizens?.[a.target] : null;
    out[p].splice(i, 0, { t: outsideQuotes(other ? theyAs(sit, other) : sit, (x: string) => pastTense(x, four)), c: [id], s: 1 }); i++; /* told in the chapter's past, like the rest of it */
  }
  return out;
}
/** A death of one of the four is never left out of their year. When the telling has not told it, or its sentence did not
 *  survive the check, it goes in plainly, in its own sentence, before the first thing that happened after it — so a
 *  year never has someone grieving a death the reader was never told of. */
export function withDeaths(r: R, y: number, lines: Line[][]): Line[][] {
  // how someone stood at a year's end is not told of someone who died in it: that line is from before, or it is wrong
  const died = new Map<number, number>(); for (let k = y * 4; k < y * 4 + 4; k++) (r.acts?.[k] ?? []).forEach((a: any) => { if (a.kind === "death" && r.citizens?.[a.c]?.named) died.set(a.c, k); });
  const alive = (l: Line) => !l.c.some((x) => { const m = /^state:(\d+):(\d+)$/.exec(x); return m && died.has(+m[1]) && +m[2] >= died.get(+m[1])!; });
  const out = lines.map((p) => p.filter(alive)).filter((p) => p.length); const actK = (id: string) => { const m = /^(\d+)\.(\d+)/.exec(String(id)) ?? /^(?:world:[tw]|townfact):(\d+)$/.exec(String(id)); return m ? +m[1] : null; };
  for (let k = y * 4; k < y * 4 + 4; k++) (r.acts?.[k] ?? []).forEach((a: any, j: number) => {
    const c = r.citizens?.[a.c]; if (a.kind !== "death" || !c?.named) return; const id = `${k}.${j}`;
    const nm = c.name.split(" ")[0]; if (out.flat().some((l) => l.c.includes(id) || (new RegExp(`\\b${nm}\\b[^.]*\\b(died|dead|death)\\b|\\b(death|died)\\b[^.]*\\b${nm}\\b`).test(l.t)))) return; /* told already, if not by that fact */
    const cause = a.how ? String(a.how) : String(a.text ?? "died").replace(/^dies\b/, "died").replace(/^died$/, "died");
    const line: Line = { t: `In the ${SEASONS[k % 4]}, ${c.name} ${cause}.${a.last ? ` ${pro(c).His} last words were: “${String(a.last).replace(/^[“"]|[”"]$/g, "")}”` : ""}`, c: a.last ? [id, `${id}#l`] : [id] };
    // before the first sentence about something later, or about grieving them; else at the end of the middle paragraph
    let at: [number, number] | null = null;
    out.forEach((p, pi) => p.forEach((l, li) => { if (at) return; const ks = l.c.map(actK).filter((x): x is number => x != null); const grief = l.c.some((x) => { const m = /^(\d+)\.(\d+)$/.exec(x); const b = m ? r.acts?.[+m[1]]?.[+m[2]] : null; return b?.kind === "grief" && b.target === a.c; });
      if (grief || (ks.length && Math.min(...ks) > k)) at = [pi, li]; }));
    if (at) out[at[0]].splice(at[1], 0, line); else out[Math.min(1, out.length - 1)]?.push(line) ?? out.push([line]);
  });
  return out;
}


// ---------- the town, before anything happens ----------
export const SETTING_TASK = [STORY_RULES.replace(/THE FORM\.[^\n]*/, "THE FORM. Every sentence ends with the labels of the facts it comes from, in square brackets. A sentence may join two or three facts about the same place or the same person."), "",
  "THE TASK: the opening of the story, before anything has happened: where this is and who is in it. 110 to 170 words, two short paragraphs, plain words.",
  "First paragraph: the place — its name, what kind of place it is, where people work and live, and what binds them or sets them against each other (W and L lines).",
  "Second paragraph: the four, one or two sentences each, by full name: what they do, who they are tied to and why (H and K lines), what they want and what they fear (P lines). Every one of the four must be in it.",
  "Write it like the opening pages of a novel: open on the place itself, what it is like to be there, in plain words. Then bring each of the four in as a person, not a record: one or two sentences each that join their facts into someone you can picture, built on what marks them out (their M line). Every one of the four gets their M line told, in your words. Never list a person's home, job and children in one breath (not \"X lives at A, works at B, and has 2 children\"). Full name the first time, first name after. Do not start sentence after sentence with the same name.",
  "Nothing has happened yet, except the first thing that happened if it is given: then end on it, plainly, as the story's first turn. Otherwise end on what is at stake for them.",
  "AN EXAMPLE, about a place and people that do not exist — the voice, not the words:",
  "Coldwater is a pit town at the head of a narrow valley. [W1] Everyone works the one mine, and everyone owes the same company store. [W2, L1]",
  "Mara Holt digs the lower seam and lives above the store with two children, and she will give her last coin to anyone who asks. [H1, M1] What Mara wants is to get them out of the valley. [P0]",
  "Oskar Penn runs the lamp room. [H2] Oskar would rather lose a chance than take a risk, and has waited out every trouble the valley has had. [M2] All Oskar asks is to be left alone. [P1]"].join("\n");
/** the town as the Architect built it, as citable facts: W the town, L its places, H the four's households, K their ties */
export function settingFacts(r: R): { id: string; head: string; text: string; names: number[] }[] {
  const out: { id: string; head: string; text: string; names: number[] }[] = []; const add = (id: string, head: string, text: string, names: number[] = []) => out.push({ id: `setting:${id}`, head, text, names });
  const sc = r.scenario ?? {}; const fp = sc.fingerprint ?? {}; const locs: any[] = r.map?.locations ?? sc.locations ?? []; const jobs: any[] = sc.jobs ?? [];
  const nameAt = (id: string) => locs.find((l) => l.id === id)?.name ?? id;
  add("W1", "town", `${r.title}: ${r.premise ?? sc.premise ?? ""}`);
  if (fp.setting) add("W2", "town", `${r.title} is ${fp.setting}.`); if (fp.dynamic) add("W3", "town", `What binds the people of ${r.title}: ${fp.dynamic}.`);
  locs.forEach((x, n) => { const here = jobs.filter((j) => j.at === x.id).map((j) => j.name); add(`L${n + 1}`, "place", `${x.name}${(x.tags ?? []).length ? ` (${x.tags.join(", ")})` : ""}${here.length ? `, where people work as ${here.join(" and ")}` : ""}.`); });
  const four = r.citizens.map((c: any, i: number) => ({ c, i })).filter(({ c }: any) => c.named);
  four.forEach(({ c, i }: any, n: number) => { const job = jobs.find((j) => j.id === c.job); const partner = r.citizens.findIndex((o: any) => o.id === (c.startPartner ?? c.partner));
    add(`H${n + 1}`, "home", `${c.name} lives at ${c.home ? nameAt(c.home) : "no fixed place"}${job ? ` and works as ${job.name} at ${nameAt(job.at)}` : ""}${partner >= 0 ? `; married to ${r.citizens[partner].name}` : ""}${c.children ? `; ${c.children} ${c.children === 1 ? "child" : "children"}` : ""}.`, partner >= 0 ? [i, partner] : [i]); if (c.trait?.name) add(`M${n + 1}`, "mark", `What everyone would say of ${String(c.name).split(" ")[0]}: ${String(c.trait.name).toLowerCase()}. ${c.trait.text}`, [i]); });
  const byId = new Map(r.citizens.map((c: any, i: number) => [c.id, i])); let k = 0;
  for (const { c, i } of four) for (const t of ((sc.citizens ?? []).find((x: any) => x.id === c.id)?.ties ?? []).slice(0, 3)) { const j = byId.get(t.to) as number | undefined; if (j == null || !t.why) continue;
    add(`K${++k}`, "tie", `${c.name} and ${r.citizens[j].name}: ${t.why}; ${t.affinity >= 0.4 ? "close" : t.affinity >= 0.1 ? "on good terms" : t.affinity > -0.2 ? "neither close nor at odds" : "at odds"}.`, [i, j]); }
  return out;
}
export function settingBrief(r: R): Brief {
  flowing = true; worstIds = new Set();
  const labels: Brief["labels"] = {};
  for (const p of peopleFacts(r)) labels[p.label] = { text: p.text, names: [p.i], kind: "person", id: p.label };
  const fs = settingFacts(r); const sect = (head: string) => fs.filter((f) => f.head === head).map((f) => { const l = f.id.slice(8); labels[l] = { text: f.text, names: f.names, kind: head === "town" || head === "place" ? "world" : "person", id: f.id }; return `[${l}] ${f.text}`; });
  const w = sect("town"), l = sect("place"), h = sect("home"), mk = sect("mark"), k = sect("tie");
  // the first thing that happened, if the world has already moved: the opening ends on it
  const first = worldFacts(r, 0).find((f) => f.id === "world:t:0"); if (first) labels.D1 = { text: first.text, names: namesIn(r, first.text), kind: "world", k: 0, id: first.id };
  const user = ["THE TOWN:", ...w, "", "ITS PLACES:", ...l, "", "THE FOUR, AS THE YEARS BEGIN:", ...h, "", mk.length ? "WHAT MARKS EACH OF THEM OUT (tell it for every one of them; it is who they are):" : "", ...mk, "", k.length ? "WHO THEY ARE BOUND TO, AND WHY:" : "", ...k, "", first ? `THE FIRST THING THAT HAPPENED (end the opening on it, plainly, as the story's first turn):\n[D1] ${first.text}` : "", "", "Write the opening."].filter((x) => x !== "").join("\n");
  return { system: prefixOf(r, SETTING_TASK), user, labels };
}
export async function tellSetting(cfg: LlmConfig, r: R, meter?: Meter): Promise<Passage> {
  const b = settingBrief(r);
  try {
    let res = await ask(cfg, b, 700, meter);
    flowing = true; let got = checkPassage(res.text, b, r);
    if (got.kept < 4) { res = await ask(cfg, b, 700, meter, "Your last answer had no [labels] after its sentences, so all of it was thrown away. Every sentence must end with the labels of the facts it comes from, in square brackets, like: The ice held the town. [W1]"); flowing = true; got = checkPassage(res.text, b, r); }
    if (got.dropped) { flowing = true; got = await repair(cfg, b, r, got, meter, false); }
    if (got.kept < 4) throw new Error(`the town: only ${got.kept} sentence(s) survived the check — ${got.checked.flat().filter((l) => !l.ok).map((l) => l.why).slice(0, 3).join("; ")} — it wrote: ${String(res.text).slice(0, 500)}`);
    return { k: -1, lines: got.lines, at: new Date().toISOString(), dropped: got.dropped, model: res.model };
  } finally { flowing = false; }
}
/** a passage as the plain text the next one carries on from */
export const textOf = (p?: Passage | null) => (p?.lines ?? []).map((para) => para.map((l) => l.t).join(" ")).join("\n\n");


// ---------- the end ----------
/** How it ended for each of the four, as facts: how they left the story (fate), and what the town remembered them for
 *  (fame): the heaviest thing they did that people saw. In the order they left the story, the survivors last. */
export function endFacts(r: R): { id: string; i: number; text: string; names: number[] }[] {
  const four = (r.citizens ?? []).map((c: any, i: number) => ({ c, i })).filter((x: any) => x.c.named);
  four.sort((a: any, b: any) => (a.c.diedAt ?? 1e9) - (b.c.diedAt ?? 1e9));
  const years = r.scenario?.years ?? Math.ceil((r.tickLabels?.length ?? 60) / 4);
  return four.flatMap(({ c, i }: any) => {
    const nm = String(c.name); const fn = nm.split(" ")[0];
    const cause = String(c.cause ?? "").replace(/^dies\s*/, "").replace(/^died\s*/, "").trim(); const how = !cause ? "" : /^(of|in|from|by|at|when|on|after|under|alone)\b/.test(cause) ? ` ${cause}` : ` of ${cause}`;
    const fate = c.diedAt != null || c.alive === false ? (c.how ? `${nm} ${c.how}, ${whenOf(r, Math.max(0, (c.diedAt ?? 1) - 1))}.` : `${nm} died${how}, ${whenOf(r, Math.max(0, (c.diedAt ?? 1) - 1))}.`) : c.left ? `${nm} left, and did not come back.` : `${nm} was alive when the ${years} years ended.`;
    const seen = (c.deeds ?? []).filter((d: any) => d.witnessed && Math.max(d.harm ?? 0, d.help ?? 0) >= 0.2).sort((a: any, b: any) => Math.max(b.harm, b.help) - Math.max(a.harm, a.help))[0];
    const fame = seen ? `The town remembered ${fn} for this: ${fn} ${seen.text}.` : `The town did not remember ${fn} for any one thing.`;
    return [{ id: `fate:${i}`, i, text: fate.replace(/\s+,/, ","), names: [i] }, { id: `fame:${i}`, i, text: fame, names: [i] }];
  });
}
export const EPILOGUE_TASK = [STORY_RULES.replace(/THE FORM\.[^\n]*/, "THE FORM. Every sentence ends with the labels of the facts it comes from, in square brackets."), "",
  "THE TASK: the epilogue, the last pages of the novel, after the years are over. 200 to 280 words.",
  "One short paragraph for each of the four, in the order given: how it ended for them (their F line), what the town remembered them for (their M line), and the decision that marked them, with their own words ([Q], quoted as what they told themselves).",
  "A last paragraph: the decision that defined the whole story, told again in a sentence or two, and what it set moving. End on it. No moral, no lesson, nothing about what it all meant.",
  "Do not build every paragraph the same way: open one on the decision, another on how they died, another on what the town said of them. Let each read like the last page of that person's story, not a form.",
  "The last paragraph may only say what the facts say it set moving (its outcome, who it hurt or saved); if they say nothing more, tell the decision itself, well, and stop.",
  "Past tense, plain words, no poetry. Do not tell again what THE STORY ENDED WITH already told.",
].join("\n");
export function epilogueBrief(r: R, before = ""): Brief {
  flowing = true; worstIds = new Set();
  const labels: Brief["labels"] = {};
  for (const p of peopleFacts(r)) labels[p.label] = { text: p.text, names: [p.i], kind: "person", id: p.label };
  const ends = endFacts(r); const order = [...new Set(ends.map((x) => x.i))];
  // the decision that marked each of them: the heaviest thing they chose in the whole run, with what they told themselves
  const all: Fact[] = []; for (let k = 0; k < played(r); k++) all.push(...factsAt(r, k).filter((f) => f.dilemma && f.kind !== "musing"));
  const blocks: string[] = []; let n = 0; let top: { l: string; w: number } | null = null;
  order.forEach((i, m) => {
    const fate = ends.find((x) => x.id === `fate:${i}`)!, fame = ends.find((x) => x.id === `fame:${i}`)!;
    labels[`F${m + 1}`] = { text: fate.text, names: [i], kind: "person", id: fate.id }; labels[`M${m + 1}`] = { text: fame.text, names: [i], kind: "person", id: fame.id };
    const mark = all.filter((f) => f.who === i).sort((a, b) => b.weight - a.weight)[0];
    const lines = [`${nameOf(r, i).toUpperCase()}`, `[F${m + 1}] ${fate.text}`, `[M${m + 1}] ${fame.text}`];
    if (mark) { const l = String(++n); labelFact(labels, l, mark, r, mark.situation); lines.push(withScene(l, mark, r)); if (!top || mark.weight > top.w) top = { l, w: mark.weight }; }
    blocks.push(lines.join("\n"));
  });
  const user = [before ? `THE STORY ENDED WITH (do not tell it again):\n${before.slice(-1200)}` : "", "",
    "HOW IT ENDED FOR EACH OF THE FOUR, in the order they left the story:", ...blocks.flatMap((x) => [x, ""]),
    top ? `THE DECISION THAT DEFINED THIS STORY: [${(top as any).l}], the heaviest thing any of them chose.` : "", "", "Write the epilogue."].filter((x) => x !== "").join("\n");
  return { system: prefixOf(r, EPILOGUE_TASK), user, labels };
}
export async function tellEpilogue(cfg: LlmConfig, r: R, meter?: Meter, before = ""): Promise<Passage> {
  const b = epilogueBrief(r, before);
  try {
    let res = await ask(cfg, b, 900, meter);
    flowing = true; let got = checkPassage(res.text, b, r);
    if (got.kept < 4) { res = await ask(cfg, b, 900, meter, "Your last answer had no [labels] after its sentences, so all of it was thrown away. Every sentence must end with the labels of the facts it comes from, in square brackets, like: Mara died of the fever. [F1]"); flowing = true; got = checkPassage(res.text, b, r); }
    if (got.dropped) { flowing = true; got = await repair(cfg, b, r, got, meter, false); }
    if (got.kept < 4) throw new Error(`the epilogue: only ${got.kept} sentence(s) survived the check — ${got.checked.flat().filter((l) => !l.ok).map((l) => l.why).slice(0, 3).join("; ")}`);
    return { k: -2, lines: got.lines, at: new Date().toISOString(), dropped: got.dropped, model: res.model, why: got.checked.flat().filter((l) => !l.ok).slice(0, 8).map((l) => `${l.why} — ${l.t.slice(0, 140)}`) };
  } finally { flowing = false; }
}
