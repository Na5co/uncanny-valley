// The chronicler: the slow model reads the record and writes the run as a story — a year at a time while it runs, and one
// life at a time when it ends. It is given facts and nothing else, and it is told it may not add any. The factual lines
// stay underneath every passage, so a reader can check the prose against the record that produced it.
import { chat, type LlmConfig, type Meter } from "../llm/client.ts";
import { arcOf, arcBrief, chaptersOf, chapterBrief, runDigest, spineOf, threadsOf, threadBrief, type Arc, type Chapter, type Thread } from "./arc.ts";

const short = (s: string) => String(s || "").split(" ")[0];
const lower = (s: string) => String(s || "").charAt(0).toLowerCase() + String(s || "").slice(1);
/** A situation is written to be read aloud in the room, in two or three sentences. The chronicler needs the setup, not
 *  the staging: the first sentence, and the second only if the first was short. Input is most of what a passage costs. */
const setup = (x: unknown): string => {
  const t = String(x ?? "").trim(); if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/);
  let out = parts[0] ?? "";
  if (out.length < 70 && parts[1]) out += ` ${parts[1]}`;
  return out.length > 190 ? `${out.slice(0, 187)}…` : out;
};

/** everything that happened in one year, as facts, with nothing decided about how to tell it — except what to leave out.
 *  A season has far more in it than a paragraph can hold, and most of it is people going to work; the facts are ranked
 *  (a death, a turning, a choice with a harm on the table, one of the four rather than a stranger) and cut to the top
 *  of the list, so what reaches the chronicler is the year and not the ledger. */

/** one person's whole run, as facts: what they did, what was done to them, and how they stood. Ranked and cut the same
 *  way a year is — a life is fifteen years of shifts and half a dozen moments that decided it. */

/** What the chronicler has written for one run. Kept beside the run, not inside it: the record stays the record. */
export interface Story { cycle: number; runId?: string; opening?: string; told?: ToldPart[]; threads?: { a: string; b: string; title: string; text: string }[]; chapters: { n: number; title: string; when: string; kind: string; text: string; upto?: number; live?: boolean }[]; lives: Record<string, { at: number; text: string }> }
export const emptyStory = (cycle: number): Story => ({ cycle, chapters: [], lives: {} });

/** What it still owes, at this point in the run. A year is written when it closes; a life once the fifth year is behind
 *  it and then every fifth year after, so a person's page is never more than five years behind the room and a run costs
 *  a few cents to tell. A passage that failed is simply still owed, and is tried again next season. */
export function owed(story: Story | null, r: any, tick: number, ended: boolean): { opening: boolean; chapters: Chapter[]; lives: string[] } {
  const s = story ?? emptyStory(0);
  const played = Math.min((r.acts || []).length, r.frames?.length ?? Infinity);
  const all = chaptersOf(r);
  // The chapter being lived in is told as well, once there is enough in it, and told again when it has grown by a year.
  // Leaving it for later meant the war — the thing every chapter above it was building towards — sat under its heading
  // with no prose at all while a reader scrolled past forty rows of log to reach nothing.
  const tellable = all.filter((c) => ended || !c.live || (c.to - c.from >= 2 && c.facts.length + c.deaths.length >= 2));
  const chapters = tellable.filter((c) => {
    const had = s.chapters.find((x) => x.n === c.n);
    if (!had) return true;
    return c.live ? c.to - (had.upto ?? c.to) >= 4 : had.when !== c.when;
  });
  const lives: string[] = [];
  const years = Math.floor(played / 4);
  if (ended || years >= 8) {
    const mark = ended ? years : 8;
    for (const c of (r.citizens || []).filter((c: any) => c.named)) {
      const have = s.lives[c.id];
      if (!have || have.at < mark) lives.push(c.id);
    }
  }
  return { opening: !s.opening, chapters, lives };
}

const RULES = [
  "You are the chronicler of a small town over fifteen hard years. You write what happened, from the record you are given.",
  "",
  "Hard rules:",
  "- Use only the facts given. Never invent an event, a name, a place, a death, or a motive that is not in them.",
  "- That includes every detail. THE TEST: every thing, place, time and person in your chapter must be findable in the facts you were given. You were not told the month, the hour, the weather, the light, what anybody was carrying, what was inside a house, how often somebody passed a door, or what a room looked like — so \"by February\", \"twice a week on the way to the pit\", \"a length of twine from the cart\" and \"because the light was going\" are inventions, however well they read.",
  "- You may not narrate a moment nobody saw. Where the facts say nobody was watching, that is a fact about the choice — it is not permission to describe what happened next in an empty lane. \"Oskar stood there a moment with no one watching, then walked back up the lane alone\" is a thing you cannot know, and you wrote it after being told this.",
  "- You may not kill anybody, or write anybody out of the town, unless the facts say they died. Somebody who was only harmed is alive and walks into the next chapter.",
  "- Where a person's own thought is quoted in the facts, you may quote it. Never invent a line of speech.",
  "- Those quoted lines sometimes say he or she, because the person speaking guessed. Quote them as they stand and do not take the guess up into your own sentences.",
  "- Name people plainly. Say who bore a thing when the facts say who.",
  "- Nobody's gender is recorded anywhere, so use they/them for every person, always — the four and everyone else alike. Never he, she, his, her, himself or herself. This is not a stylistic preference: the record does not know, so neither do you.",
  "- Where the facts say who was watching, or that nobody was, use it: in this town that is often the whole of why.",
  "- The situations are written to the person as \"you\". Retell them in the third person, by name.",
  "- The facts are the ones that mattered, not all of them. Do not say that a list is partial, and do not count things.",
  "- Past tense, plain words, no ornament for its own sake, no moral summing-up, no addressing the reader.",
  "- Do not mention experiments, protocols, conditions or psychology by name. They are the town's own business, not a study.",
].join("\n");

export const OPEN_SYSTEM = [RULES, "",
  "Write the opening of the chronicle: 45 to 70 words. No more.",
  "",
  "Where this is, what it lives on, and what is coming for it. Two or three sentences, and the last of them should land.",
  "",
  "DO NOT introduce the four. Their faces, names, trades, wants and fears are printed directly beneath what you write, one to a card. Listing them in clauses — 'X wanted this and feared that, Y wanted this and feared that' — is a roster, and the page already has the roster. Naming even one of them here is a mistake.",
  "Do not predict what anybody will do.",
].join("\n");
export const CHAPTER_SYSTEM = [RULES, "",
  "You are writing one chapter of a town's years: a thing that came through it — a famine, a winter, a sickness, a war — or a stretch where nothing did.",
  "",
  "Write 45 to 70 words. One short paragraph, and no more.",
  "It is a caption over the chapter, not a retelling of it. The moments are laid out beneath you as cards — who chose, where, who was watching, the road they took and the road they refused, and what they said. Do not repeat what a card will show.",
  "Say what the year did to the place and what it turned into. Name at most two people; the cards name the rest.",
  "",
  "HOW TO BEGIN AND END THIS PARTICULAR CHAPTER is given to you below as THE MOVE. Follow it. It changes from chapter to chapter on purpose: a run of chapters that all open by announcing what the year asked of the town, and all close on what it left behind, is the same formula nine times over, and reads as one.",
  "",
  "BANNED, because these are the ruts this keeps falling into:",
  '- "X did A rather than B." At most one sentence in the chapter may be built that way. It was nine of them.',
  '- The "saying…" tag: "X kept it all, saying no one would ever know." It was the connective in every chapter. Use it once at most; otherwise put what they said in its own sentence, or leave it out.',
  "- Two consecutive sentences beginning with a person's name. If that happens, rewrite one.",
  "- Naming more than three people. A chapter that names six is a roll-call.",
  '- Any caption, title or heading before the prose. The chapter\'s title and years are printed directly above what you write. Do not restate them in any form, including as a first line like "The Lane, Year 6 to Year 7".',
  "- Markdown of any kind. No asterisks, no hashes. Plain prose.",
  '- Entering a scene with somebody standing. "X stood at the store with…", "X stood in the doorway of…", "X stood at Y\'s door…" opened four chapters in a row and seven scenes out of nine. It is the only camera move you have been using. Come in on what somebody is doing, or on what is said, or on what has just finished happening.',
  "- One unbroken block. Six chapters in a row arrived as a single paragraph of a hundred and ninety words. Break where the scene changes; two or three paragraphs, and a short one is allowed.",
  '- The rhythm "[something happened], and [something followed]". Seven chapters out of eight opened on it: different words, one metronome. At most one sentence here may be built that way, and it may not be the first.'
  ,'- Any sentence about whether the chapter settled anything, or about what it left unfinished. That is a note to yourself, not a sentence for a reader.',
  '- The phrase "more harm behind them now than kindness", and any variation of it. Say what the person did and let the reader see it.',
  '- "asked the town to choose between", "made the lane decide whether", and every other variation of announcing the chapter\'s theme in its first sentence. Show it happening instead.',
  '- "What the year left behind was…", "left a lane that had learned…", and every other variation of summing the chapter up at the end.',
  "",
  "If a moment says nobody could see, that is usually the whole of why it went that way, and it belongs in the sentence.",
  "If somebody died or crossed over in this chapter, that is where the chapter ends.",
  "If there is genuinely nothing of weight here, say so in one sentence and stop.",
].join("\n");
export const LIFE_SYSTEM = [RULES, "",
  "You are writing one person's life out of the years. You are given the SHAPE of it first, then the four to six moments that decided it, and each moment says why it is in the story.",
  "",
  "Write 150 to 220 words, in two or three paragraphs. Obey the shape: a fall is not told like a holding-out, and a life cut short is not told like one that got out.",
  "Build the story the reasons make. A moment marked as the first harm is where something starts; one marked as not fitting the rest is where the reader should be pulled up short. Put them in an order that means something, which is usually but not always the order they happened.",
  "Two or three of the moments, told closely — where they were, who was in front of them, what they said to themselves — are worth more than all six listed. You may leave a moment out.",
  "Where you are told what being watched did to them, that is the centre of this place and not a statistic: write it as a fact about the person.",
  "",
  "",
  "BANNED, because four lives came out as one life with the names changed:",
  '- "they did X, and Y, and twice they did Z" — any sentence that is a list with conjunctions.',
  '- Opening on a moment that came to everybody. If you are given a thread of their own, the story starts there. The sack of flour, the informer and the wrecked house happen to all four; a life that opens on one of them is a life nobody will remember.',
  "- Restating their name, trade, age, want or fear. Those are printed directly above what you write.",
  '- Ending on a moral, a summary, or "In the end".',
  '- Counting. Do not write "they left it alone twenty-four times out of twenty-five" — the numbers are on the page already and you will get them wrong.',
  "- The shape's own word. If you are told this is a holding-out, do not write that they held.",
  "",
  "USE THEIR WORDS. You are given what they told themselves, verbatim. Those lines are the best writing you have and no two people's sound alike — quote them rather than paraphrasing them into something blander.",
].join("\n");

/** the premise: where this is, what it lives on, and who the four are — written once, at the top of the run */
export function openingDigest(r: any): string {
  const four = (r.citizens || []).filter((c: any) => c.named);
  const places = (r.map?.locations ?? r.scenario?.locations ?? []).map((l: any) => l.name).filter(Boolean);
  const jobs = (r.scenario?.jobs ?? []).map((j: any) => j.name).filter(Boolean);
  const coming = (r.events || []).slice(0, 4).map((e: any) => e.headline);
  return [
    `The place: ${r.title}. ${r.premise ?? ""}`.trim(),
    places.length ? `Its places: ${places.join(", ")}.` : "",
    jobs.length ? `What it lives on: ${jobs.join(", ")}.` : "",
    "",
    `The four whose years these are — their cards are printed under your paragraph, so do not name them: ${four.map((c: any) => c.role).join(", ")}.`,
    "",
    coming.length ? `What the fifteen years bring: ${coming.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

/** The architect tier thinks before it writes and spends the same budget doing it, so a paragraph asked for in a few
 *  hundred tokens comes back empty, having reasoned itself out of room. The chronicler asks for no thinking: it is
 *  retelling facts it has been handed, not working anything out. And an empty reply is a failure with its reason
 *  attached — never a passage of nothing, quietly stored. */
const said = (r: { text: string; finishReason?: string; usage: { completionTokens: number } }, what: string, what2?: string): string => {
  const t = tidy(r.text, what2);
  if (!t) throw new Error(`${what}: the reply was empty (finish: ${r.finishReason ?? "?"}, ${r.usage.completionTokens} tokens out — the budget is being spent on thinking)`);
  return t;
};

/** A rule the model ignores is not a rule, it is a hope. It is asked not to caption its chapters and not to write
 *  markdown, and it does both anyway, so the caption and the markdown come off here. */
export function tidy(raw: string, title?: string): string {
  let t = String(raw ?? "").trim();
  // Every strip below is a guess that something is a caption. A guess that leaves the text starting in lower case was
  // wrong — it took the subject off a real sentence ("The Lane in the fourth year was a strip of packed earth" became
  // "in the fourth year was a strip of packed earth") — so any strip that does that is put back.
  const cut = (fn: (x: string) => string) => { const out = fn(t).trim(); if (out && /^[A-Z"“'(]/.test(out)) t = out; };
  t = t.replace(/\*\*/g, "").replace(/(?<=\s|^)\*(?=\S)|(?<=\S)\*(?=\s|[.,;:!?]|$)/g, "").replace(/(^|\n)\s*#{1,6}\s+/g, "$1");           // markdown that was asked not to appear
  cut((x) => x.replace(/^\s*(?:title|chapter)\s*:\s*.*\n+/i, ""));
  // a caption line: short, no full stop, often an em dash — "The Lane, Year 6 to Year 7", "A Quiet Year"
  cut((x) => { const nl = x.indexOf("\n"); if (nl <= 0 || nl >= 90) return x; const head = x.slice(0, nl).trim();
    return !/[.!?"]$/.test(head) && head.split(" ").length <= 12 ? x.slice(nl + 1) : x; });
  // or the caption run into the prose on one line, which is how it usually arrives
  cut((x) => x.replace(/^([A-Z][^.!?\n]{0,70}?(?:—|–)\s*Year\s+\d[^.!?\n]{0,40}?)\s+(?=[A-Z])/, ""));
  cut((x) => x.replace(/^(The [A-Z][a-z]+,\s*Year\s+\d+(?:\s*to\s*Year\s*\d+)?)\s+(?=[A-Z])/, ""));
  cut((x) => x.replace(/^(Year\s+\d+(?:\s*(?:to|–|—)\s*(?:Year\s*)?\d+)?(?:,?\s*[A-Z][a-z]+)?)\s{2,}(?=[A-Z])/, ""));
  cut((x) => x.replace(/^(A Quiet Year|The Quiet Years)\s+(?=[A-Z])/, ""));
  // and the town's own name left behind by a stripped caption: "The Harvest Fails — Year 2, The Lane Sif took…"
  if (title) { const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); cut((x) => x.replace(new RegExp(`^(?:in\\s+)?${esc}[,:—–]?\\s+(?=[A-Z])`, "i"), "")); }
  return t.trim();
}

/** The record does not know anybody's gender, so neither may the chronicler — and it has been told so in four
 *  different wordings and gone on writing "She had put the four children in the back room". A rule the model will not
 *  keep is one the code keeps.
 *
 *  Only outside quotation marks: the lines people say are theirs, guesses and all, and are left exactly as spoken. */
const VERB: Record<string, string> = { is: "are", was: "were", has: "have", does: "do", goes: "go", says: "say" };
export function degender(raw: string): string {
  const parts = String(raw ?? "").split(/(“[^”]*”|"[^"]*")/); /* odd indices are quoted speech, left alone */
  // Conservative on purpose. An earlier, bolder version turned "he hangs" into "they hangs" and "tear her apart"
  // into "tear their apart" — three ungrammatical sentences in the four blocks meant to make these people feel
  // particular, which is worse than the thing it was fixing. So: only what can be changed without touching the verb,
  // and "her" is left alone entirely, because possessive and object are not distinguishable without parsing.
  const AUX = "is|was|has|had|does|did|will|would|could|should|can|may|might|must|goes|went|said|says|kept|took|stood|left|came|walked|looked|knew|wanted|feared|let|gave|saw|found|told|paid|beat|brought|heard|made|thought|ran|sat|held|lost|felt|got|put|set|shut|meant|became|began|chose|drove|fell|forgot|grew|hid|hit|hung|lay|led|lent|met|rose|sold|sent|shook|slept|spoke|stole|swore|threw|understood|woke|wore|won|wrote|[a-z]+ed";
  const fix = (x: string) => x
    .replace(/\bhimself\b|\bherself\b/g, "themselves").replace(/\bHimself\b|\bHerself\b/g, "Themselves")
    .replace(/\bhis\b/g, "their").replace(/\bHis\b/g, "Their")
    .replace(/\bhim\b/g, "them").replace(/\bHim\b/g, "Them")
    // he/she only where the verb that follows can be corrected with it; otherwise left, because "they hangs" is worse
    .replace(new RegExp(`\\b(he|she)\\s+(${AUX})\\b`, "g"), (_m, _p, v: string) => `they ${VERB[v] ?? v}`)
    .replace(new RegExp(`\\b(He|She)\\s+(${AUX})\\b`, "g"), (_m, _p, v: string) => `They ${VERB[v] ?? v}`);
  return parts.map((x, i) => (i % 2 ? x : fix(x))).join("");
}

/** A passage written before the length cut learned about quotation marks can be stored ending mid-speech — "Vera
 *  said, \u201cI have plenty." — and no regeneration will reach it. Trim back to the last sentence that ends with its
 *  quotes closed, so what is on the page is at least whole. */
export function balanced(t: string): string {
  const x = String(t ?? "").trim();
  if (((x.match(/[“”"]/g) ?? []).length % 2) === 0) return x;
  for (let i = x.length - 1; i > x.length * 0.35; i--) {
    if (!/[.!?]/.test(x[i])) continue;
    const head = x.slice(0, i + 1);
    if (((head.match(/[“”"]/g) ?? []).length % 2) === 0) return head.trim();
  }
  return x;
}

/** Six chapters in a row arrived as one unbroken block of a hundred and ninety words, through two rounds of being
 *  asked for paragraphs. So the break is put in: at the sentence nearest the middle, which is where a two-scene
 *  chapter turns anyway. */
export function paragraphed(t: string, min = 110): string {
  if (t.includes("\n") || t.split(/\s+/).length < min) return t;
  const sentences = t.split(/(?<=[.!?”"])\s+/);
  if (sentences.length < 4) return t;
  let best = 1, bestGap = Infinity;
  for (let i = 1; i < sentences.length; i++) {
    const head = sentences.slice(0, i).join(" ").length;
    const gap = Math.abs(head - (t.length - head));
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  return `${sentences.slice(0, best).join(" ")}\n\n${sentences.slice(best).join(" ")}`;
}

/** A word count the model will not keep is one the code keeps. Asked for 150 words it wrote 500 and was cut off by the
 *  token budget in the middle of "the distance between the two" — so the cut is made here instead, at the last sentence
 *  that finished, which is the difference between a short chapter and a broken one. */
export function toLength(raw: string, words: number): string {
  const t = raw.trim();
  const all = t.split(/\s+/);
  if (all.length <= words * 1.25) return t;
  const kept = all.slice(0, Math.round(words * 1.15)).join(" ");
  // and not inside an open quotation: cutting at the first full stop of a speech left the climax ending on
  // 'Ivo said, "I warned Sif and it cost me nothing.' with the quote never closed.
  const open = (upto: number) => { const q = kept.slice(0, upto).match(/[“”"]/g) ?? []; return q.length % 2 === 1; };
  for (let i = kept.length - 1; i > kept.length * 0.4; i--) {
    if (!/[.!?”"]/.test(kept[i])) continue;
    const cut = i + 1;
    if (open(cut)) continue;
    return kept.slice(0, cut).trim();
  }
  return kept.trim();
}

export const STORY_SYSTEM = [RULES, "",
  "You are telling the whole run, once, as one story. You are the only author it will ever have, and you have all of it in front of you: whose story it is, who stood against the grain of it, and everything that happened, in order.",
  "",
  "280 to 380 words in total, in FIVE short parts of two to four sentences each. Every sentence is an event — somebody did something to somebody and it cost. If a sentence has no event in it, cut it. Each part begins with a line of exactly this form, alone on its line:",
  "PART I · YEARS 1-3",
  "(roman numeral, then the span of years the part covers; the five spans are contiguous and cover the run).",
  "",
  "HOW TO TELL IT:",
  "- It is the protagonist's story. Open inside a moment of theirs, not with the town. Everyone else enters when they cross the protagonist's path.",
  "- Connect causes. You are allowed — required — to say that one thing happened because of another, where the order of the facts supports it: a theft nobody answered, and the next one easier; a kindness refused, and a door shut for good. That chain is the story.",
  "- The counterweight is your second thread. Cut to them when the protagonist's road darkens, so the reader sees the same years refusing to go the same way.",
  "- Part IV or V must contain the heaviest thing in the record — the death, the crossing — told at full weight, not in passing. When somebody dies, the sentence where it happens says that they died.",
  "- End on the last true thing in the record, plainly, and about ONE person — never a list of who was still alive. No moral, no summary, no 'in the end'.",
  "",
  "Never refer to the story, the spine, the record, the chapter or the run — those are the digest's words for its own scaffolding, not things anyone in the town knows exist.",
  "STILL BANNED, all of it: inventing any fact, object, weather or unwitnessed moment; rosters; dossier appositions ('a farmhand of sixty with two children'); counting; markdown beyond the PART lines; sentences shaped 'X did A rather than B' more than once; gendered pronouns outside quoted speech.",
].join("\n");

export interface ToldPart { from: number; to: number; text: string }

export function parseParts(raw: string): ToldPart[] {
  const re = /^PART\s+[IVX]+\s*[·.:-]\s*YEARS?\s+(\d+)\s*(?:[–—-]\s*(\d+))?\s*$/gim;
  const marks: { from: number; to: number; at: number; len: number }[] = [];
  for (let m = re.exec(raw); m; m = re.exec(raw)) marks.push({ from: +m[1], to: +(m[2] ?? m[1]), at: m.index, len: m[0].length });
  if (!marks.length) return [{ from: 1, to: 99, text: raw.trim() }];
  return marks.map((mk, i) => ({ from: mk.from, to: mk.to, text: raw.slice(mk.at + mk.len, marks[i + 1]?.at ?? raw.length).trim() })).filter((p) => p.text);
}

/** the run, told whole: one call, one author, one arc. Only for a run that is over — a story needs its ending. */
export async function narrateRun(cfg: LlmConfig, r: any, meter?: Meter): Promise<ToldPart[]> {
  const res = await chat({ model: cfg.architectModel, system: STORY_SYSTEM, user: runDigest(r), temperature: 0.8, maxTokens: 900, reasoningEffort: "none", meter }, cfg);
  const t = res.text.trim();
  if (!t) throw new Error(`the telling came back empty (finish: ${res.finishReason ?? "?"})`);
  return parseParts(balanced(degender(t)));
}

export const THREAD_SYSTEM = [RULES, "",
  "You are telling what happened between two people over fifteen years in the same town. You are given every time their lives crossed, in order, and how each one stood to the one before.",
  "",
  "First line: a title for their story, four to eight words, alone on the line, starting with TITLE: — plain, not poetic: what it was between them.",
  "Then 110 to 170 words.",
  "",
  "THIS IS ONE STORY, NOT A LIST. Connect each moment to the one before — \"Two years later, with the beating still between them, Alva let Cleo pass on the same road.\" — but only with what the list gives you: what happened before, and the words they said. Never give a reason they did not give.",
  "Some moments the world forced on them. \"Turned the water onto X to save three\" is water coming in: X alone in a side room (a side gallery, in older runs), three people in the main one, and somebody at the gate who had to choose. \"Went along with the council\" is four people having spoken first. Say what the world put in front of them. It is not revenge, and it is not a grudge, unless their own words say so — and if the words they said argue the other way, keep them, because that is the story.",
  "Kindnesses matter as much as harms: a debt forgiven four times is what makes a betrayal land. Keep them, compressed if they repeat — \"four more times Nell let Kai pay half\".",
  "Quote each of them once at most, the line that matters most.",
  "The last sentence is how it ended. If one killed the other, the sentence says so plainly, and says it was the same person who had done the kindness.",
  "No moral. No summary. Do not explain what it meant.",
  "",
  "THE NUMBERED LIST IS EVERYTHING THAT HAPPENED BETWEEN THEM. Anything not in it is invention, and forbidden: what anybody heard later, what the town noticed, how a body was carried, what the water or the pit did, where the children grew up, who passed whom afterwards. You may connect the moments; you may not add to them. When the list runs out, the story ends.",
].join("\n");

export async function narrateThread(cfg: LlmConfig, t: Thread, title: string, meter?: Meter): Promise<{ title: string; text: string }> {
  const r = await chat({ model: cfg.architectModel, system: THREAD_SYSTEM, user: threadBrief(t, title), temperature: 0.75, maxTokens: 600, reasoningEffort: "none", meter }, cfg);
  const raw = r.text.trim();
  if (!raw) throw new Error(`a thread came back empty (finish: ${r.finishReason ?? "?"})`);
  const m = /^\s*TITLE:\s*(.+)$/im.exec(raw);
  const body = m ? raw.replace(m[0], "").trim() : raw;
  return { title: degender((m?.[1] ?? `${short(t.a.name)} and ${short(t.b.name)}`).trim().replace(/[*#]/g, "")), text: paragraphed(balanced(degender(tidy(body))), 90) };
}

export async function narrateOpening(cfg: LlmConfig, digest: string, meter?: Meter): Promise<string> {
  const r = await chat({ model: cfg.architectModel, system: OPEN_SYSTEM, user: digest, temperature: 0.8, maxTokens: 320, reasoningEffort: "none", meter }, cfg);
  return degender(toLength(said(r, "the opening"), 80));
}

/** The opening the chronicler falls back on when it has nothing better: somebody standing somewhere. It opened four
 *  chapters in a row and seven scenes out of nine, and two rounds of being told not to did not stop it — so it is
 *  caught here and the chapter is asked for once more, with that sentence quoted back. */
const LIMP = /^[^.!?]{0,60}\b(stood|was standing|stands)\b/i;

export async function narrateChapter(cfg: LlmConfig, c: Chapter, title: string, meter?: Meter, four: string[] = [], places: { name: string; what: string }[] = []): Promise<string> {
  if (!c.facts.length && !c.deaths.length && !c.turns.length) return "";
  const brief = chapterBrief(c, title, four, places);
  const ask = (extra?: string) => chat({ model: cfg.architectModel, system: CHAPTER_SYSTEM, user: extra ? `${brief}\n\n${extra}` : brief, temperature: extra ? 0.9 : 0.75, maxTokens: 700, reasoningEffort: "none", meter }, cfg);
  let r = await ask();
  let text = degender(toLength(said(r, `chapter ${c.n}`, title), 75));
  if (LIMP.test(text)) {
    const again = await ask(`YOU ALREADY TRIED THIS ONCE AND OPENED IT WITH SOMEBODY STANDING SOMEWHERE:\n"${text.split(/(?<=[.!?])\s/)[0]}"\nThat is the sentence every chapter of this run has opened on. Write the chapter again with a different first sentence — a different verb, and if you can, a different subject.`).catch(() => null);
    if (again) { const t2 = degender(toLength(said(again, `chapter ${c.n}`, title), 170)); if (t2 && !LIMP.test(t2)) text = t2; }
  }
  return paragraphed(text);
}

export async function narrateLife(cfg: LlmConfig, a: Arc, meter?: Meter): Promise<string> {
  if (a.scenes.length < 2) return "";
  const r = await chat({ model: cfg.architectModel, system: LIFE_SYSTEM, user: arcBrief(a), temperature: 0.75, maxTokens: 900, reasoningEffort: "none", meter }, cfg);
  return paragraphed(degender(toLength(said(r, a.name), 230)));
}

/** the arc a life is written from, for the callers that only have a record and an index */
export const lifeOf = (r: any, i: number): Arc => arcOf(r, i);

