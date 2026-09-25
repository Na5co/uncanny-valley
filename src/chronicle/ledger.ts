// The ledger: a run's record turned into facts — plain sentences in the third person, each with the season it happened in,
// who it is about, how much it matters, and the person's own words where they have any. Everything a page prints about the
// town and everything the chronicler is allowed to say comes from here, so the two can never disagree with the record.
//
// It reads a record (JSON), not a live world, so it works the same for the run in progress and for any run on the shelf.
// Runs recorded before the simulation kept the life between decisions (hunger, spirits, grief, how people took a deed) get
// what can be read back off the season frames instead: hunger, sickness, money and who grew close are all in there.

export interface Fact {
  id: string;           // "<season>.<n>", stable for a season once it has happened
  k: number;            // season index, 0-based
  kind: string;
  who: number;          // the person it is about (-1 for the town)
  whom?: number;        // the other person, if there is one
  names: number[];      // everyone the sentence names
  text: string;         // one plain sentence, third person, ends with a full stop
  quote?: string;       // what they said to themselves, verbatim
  last?: string;        // their last words, said aloud as they died
  because?: string[];   // what they said decided it, verbatim
  weight: number;
  tone: "harm" | "help" | "loss" | "joy" | "low" | "plain";
  seen?: number;        // how many saw it (a deed)
  place?: string;
  deed?: boolean;       // a thing done to somebody
  forced?: boolean;     // every road open to them harmed somebody
  dilemma?: string;     // the situation it answered, so the same situation met twice can be set side by side
  situation?: string;   // the situation as it was put to them, word for word (in the second person, before they chose)
}

type R = any;
const first = (n: string) => { const p = String(n ?? "").split(" "); return p[0].endsWith(".") && p[1] ? `${p[0]} ${p[1]}` : p[0]; };
export const nameOf = (r: R, i: number | undefined | null) => (i == null || !r.citizens[i] ? "someone" : first(r.citizens[i].name));
export const SEASON_NAMES = ["spring", "summer", "autumn", "winter"];
export const whenOf = (r: R, k: number) => String(r.tickLabels?.[k] ?? `Season ${k + 1}`);
export const yearOf = (k: number) => Math.floor(k / 4) + 1;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stop = (s: string) => { const t = s.trim().replace(/\s+/g, " "); return /[.!?”"]$/.test(t) ? t : `${t}.`; };
const HARM_KINDS = new Set(["theft", "violence", "betrayal", "abandonment", "lie", "justice"]);
const HELP_KINDS = new Set(["help", "gift", "rescue", "sacrifice", "mercy", "loyalty"]);
/** the season index people are named in, by index */
const idxOf = (r: R, id: unknown): number | undefined => typeof id === "number" ? id : typeof id === "string" ? r.citizens.findIndex((c: any) => c.id === id) : undefined;

/** Imperative option labels into what somebody did: "Keep your savings" → "chose to keep their savings". */
const LABELS: Record<string, string> = { "half each": "offered half each", "take what is offered": "took what was offered", "refuse it": "refused it", "say nothing": "said nothing", "keep at it": "kept at it" };
export function choseTo(label: string, target?: string): string {
  let l = String(label ?? "").trim();
  if (LABELS[l.toLowerCase()]) return LABELS[l.toLowerCase()];
  if (target) l = l.replace(/\bthem\b/, target);
  if (/^["“]/.test(l)) return `said ${l.replace(/^"|"$/g, "“").replace(/“([^“]*)“$/, "“$1”")}`;
  if (/^they\b/i.test(l) && target) return l.replace(/^they\b/i, target);
  const t = l.replace(/[;:—–].*$/, "").trim().replace(/\byou (have|are|can|will|had|were|do|did|need|owe)\b/gi, "they $1").replace(/\byourself\b/gi, "themselves").replace(/\byour\b/gi, "their").replace(/\byou\b/gi, "them");
  return `chose to ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}
/** An outcome written to the person ("you keep your savings; they plant less") is only used where it can be said of them
 *  without guessing at grammar: when it does not speak to them at all. */
export const plainOutcome = (o: string | undefined) => (o && !/\byou\b|\byour\b|\byours\b|\byou're\b/i.test(o) ? o.trim() : "");

const PAST: Record<string, string> = { "do not": "did not", crawl: "crawled", cough: "coughed", watch: "watched", hear: "heard", come: "came", comes: "came", are: "were", is: "was", go: "went", goes: "went", walk: "walked", eat: "ate", save: "saved", notice: "noticed", carry: "carried", pay: "paid", pays: "paid", refuse: "refused", take: "took", takes: "took", throw: "threw", keep: "kept", get: "got", leave: "left", look: "looked", recover: "recovered", collapse: "collapsed", sit: "sat", marry: "married", survive: "survived", move: "moved", find: "found", hate: "hated", laugh: "laughed", calls: "called", call: "called", flog: "flogged", forget: "forgot", remember: "remembered", plant: "planted", pull: "pulled", die: "died", dies: "died", do: "did", does: "did", become: "became", cannot: "could not", thanks: "thanked", lend: "lent", stay: "stayed", stays: "stayed", bring: "brought", share: "shared", owe: "owed", lose: "lost", win: "won", sell: "sold", work: "worked", catch: "caught", want: "wanted", need: "needed", say: "said", tell: "told", see: "saw", run: "ran", drink: "drank", fight: "fought", help: "helped", answer: "answered", agree: "agreed", turn: "turned", "can't": "couldn't", can: "could", will: "would", has: "had", have: "had", give: "gave", gives: "gave", send: "sent", wait: "waited", stand: "stood", hold: "held", open: "opened", close: "closed", fall: "fell", falls: "fell", begin: "began", spend: "spent", try: "tried", buy: "bought", feed: "fed", mend: "mended", build: "built", burn: "burned", burns: "burned", drown: "drowned", floods: "flooded", flood: "flooded", reach: "reached" };
const pastOf = (w: string) => PAST[w] ?? (w.endsWith("s") ? PAST[w.slice(0, -1)] : undefined);
const PASTS = new Set(Object.values(PAST).concat(["were", "was", "never", "would", "could", "did", "had"]));
/** An outcome written to the person — "you come back wounded", "they pull through" — retold of them in the past tense,
 *  or nothing if it cannot be done without guessing. "you" is the person, "they" the other one unless the clause already
 *  names them (then it is whoever else was there, and stays "they"). */
export function retell(o: string | undefined, N: string, T?: string): string {
  if (!o) return "";
  const out: string[] = [];
  for (const c0 of String(o).trim().replace(/\.\s+(?=[A-Z])/g, "; ").replace(/\.$/, "").split(/;\s*/)) {
    let c = c0.trim(); if (!c) continue;
    const namesT = !!T && new RegExp(`\\b${T}\\b`).test(c);
    if (T) c = c.replace(/\byou are both\b/g, `${N} and ${T} are both`).replace(/\byou both\b/g, `${N} and ${T} both`).replace(/\byou (\w+) at each other\b/g, `${N} and ${T} $1 at each other`);
    const words = c.split(/\s+/); const res: string[] = []; let expect = false, plural = false, ok = true;
    for (let n = 0; n < words.length; n++) {
      const w = words[n]; const punct = w.match(/[.,!?]$/)?.[0] ?? ""; const lw = w.toLowerCase().replace(/[.,!?]$/, "");
      if (expect) {
        if (["never", "still", "eventually", "also", "both", "all", "not"].includes(lw)) { res.push(w); continue; }
        const pv = pastOf(lw); if (pv) { res.push((pv === "were" && !plural ? "was" : pv) + punct); expect = false; continue; }
        if (PASTS.has(lw) || /ed$/.test(lw)) { res.push(w); expect = false; continue; }
        ok = false; break;
      }
      if (lw === "you") { const subj = n === 0 || /^(and|when|then|but|so|as|while|if|until|because|after|before)$/i.test(words[n - 1] ?? ""); res.push(N + punct); if (subj) { expect = true; plural = false; } continue; } // "you" after a verb is its object
      if (lw === "they") { const s = T && !namesT ? T : "they"; res.push(n === 0 && s === "they" ? "They" : s); expect = true; plural = s === "they"; continue; }
      if (lw === "them" && T && !namesT) { res.push(T + punct); continue; }
      if (lw === "your") { res.push("their"); continue; }
      if (lw === "yourself") { res.push("themselves"); continue; }
      if (/^[A-Z][a-z]+$/.test(w.replace(/[.,!?]$/, "")) && pastOf(words[n + 1]?.toLowerCase().replace(/[.,!?]$/, "") ?? "") && n + 1 < words.length) { res.push(w); expect = true; plural = words[n + 1]?.toLowerCase() === "are"; continue; }
      if (lw === "and" && res.length && /^[A-Z]/.test(res[res.length - 1]) && /^[A-Z][a-z]+$/.test(words[n + 1] ?? "")) { res.push("and", words[n + 1]); n++; expect = true; plural = true; continue; }
      if ((lw === "is" || lw === "comes" || lw === "goes" || lw === "stays" || lw === "floods" || lw === "burns") && n > 0) { res.push(PAST[lw] + punct); continue; }
      res.push(w);
    }
    if (!ok || /\byou\b|\byour\b|\byours\b|\byou're\b/i.test(res.join(" "))) continue; // this clause cannot be said of them; the others may
    out.push(res.join(" ").replace(/\band (\w+)\b/g, (m, v) => (PAST[v] && !["work", "help", "answer", "open", "close", "run", "stand", "fall"].includes(v) ? `and ${PAST[v]}` : m)));
  }
  const t = out.map((x, n) => (n > 0 && /^They\b/.test(x) ? `they${x.slice(4)}` : x)).join("; ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

const DIED: Record<string, string> = { hunger: "of hunger", sickness: "of the sickness", exposure: "of the cold", violence: "a violent death", "old age": "of old age", childbirth: "in childbirth", accident: "in an accident" };
const EVENING: Record<string, string> = { tavern: "spent the evenings at the tavern", chapel: "spent the evenings at the chapel", home: "kept to the house", square: "spent the evenings in the square", work: "took every shift going" };

/** what moved somebody's spirits, as it can be said of them: an outcome written to "you" is retold or left out */
const causesOf = (xs: string[] | undefined, N: string) => (xs ?? []).map((x) => (/\byou\b|\byour\b/i.test(x) ? retell(x, N).replace(/\.$/, "") : x)).filter(Boolean).map((x) => (/^[A-Z][a-z]+ [a-z]/.test(x) && !/^(The|A|An|It|Nothing|Nobody|No|Hurt|Sick)\b/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1)));
const namesIn = (r: R, xs: string[]) => r.citizens.map((c: any, i: number) => ({ n: first(c.name), i })).filter(({ n }: any) => xs.some((x) => new RegExp(`\\b${n}\\b`).test(x))).map(({ i }: any) => i);
/** An outcome is the card's text, written before anything happened; the season may have gone otherwise. A clause that
 *  says somebody recovered in the season they died, went hungry while fed, was or was not seen (that is said separately,
 *  from who was actually there), or that says nothing at all, is not repeated as a fact. */
function checkedOutcome(r: R, k: number, text: string, settled = false): string {
  if (!text) return "";
  const died = new Set((r.acts?.[k] ?? []).filter((a: any) => a.kind === "death").map((a: any) => nameOf(r, a.c)));
  const idx = (n: string) => r.citizens.findIndex((c: any) => first(c.name) === n);
  const delta = (n: string, v: number) => { const i = idx(n); if (i < 0) return 0; const now = r.frames?.[k]?.vitals?.[i]?.[v], was = k > 0 ? r.frames?.[k - 1]?.vitals?.[i]?.[v] : undefined; return now != null && was != null ? now - was : 0; };
  const keep = text.split(/;\s*/).filter((c) => {
    const who = r.citizens.map((x: any) => first(x.name)).find((n: string) => new RegExp(`\\b${n}\\b`).test(c));
    // what a card promises about later is not a thing that happened
    if (/eventually|\bnever\b|remember|forget|for a (season|month|year)|for ever|later|someday|behind their eyes|watches|notice|recover|pull(ed)? through|survive|hungry|starv|nobody saw|no one saw|nobody knows|unseen|in front of|quiet when/i.test(c)) return false;
    if (who && died.has(who) && /do not come back|did not come back|never came back/.test(c)) return true;
    if (who && died.has(who) && !/died/.test(c)) return false;
    if (/could not pay|cannot pay|no money/i.test(c)) { const i = who ? idx(who) : -1; return i >= 0 && (r.frames?.[k]?.vitals?.[i]?.[2] ?? 1) < 0.15; }
    if (settled) return true; // the result of two people's choices, which is certain once both have chosen
    // the rest only where the season's own numbers bear it out
    if (/wound|beaten|ditch|hurt|drown|flog|collapse|stronger than|shouted down/i.test(c)) return !!who && delta(who, 0) <= -0.1 || /shouted down|flog/i.test(c);
    if (/\b(ate|eat|fed|food|shared|sack|flour|bread)\b/i.test(c)) return !!who && delta(who, 1) >= 0.1;
    if (/money|paid|pay|coin|purse|double|savings|tools|house|debt|fine/i.test(c)) return !!who && Math.abs(delta(who, 2)) >= 0.05;
    if (/\b(refused|threw it back|took the|walked the other way|went back|went to the council|stayed dry|came back|pulled|brought|taken away|drove|driven|married|left|ended in a quarrel|quarrel|spent the evenings|laughed \w+ out|called \w+ soft|crawled out|crawls out|burned and coughing|were agreed|was agreed)\b/i.test(c)) return true;
    return false;
  });
  const t = keep.join("; ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
/** One act of the record as a fact, or null for the ones that say nothing (a card with one road, a responder's echo). */
function factOf(r: R, k: number, a: any, n: number): Fact | null {
  const who = a.c as number; const N = nameOf(r, who); const T = a.target != null ? nameOf(r, a.target) : "";
  const named = (i: number | undefined) => i != null && !!r.citizens[i]?.named;
  const base = { ...(a.dilemma ? { dilemma: String(a.dilemma) } : {}), ...(a.situation && a.options ? { situation: String(a.situation) } : {}), id: `${k}.${n}`, k, who, ...(a.target != null ? { whom: a.target } : {}), ...(a.place ? { place: a.place } : {}), ...(a.seen != null ? { seen: a.seen } : {}) };
  const names = [who, ...(a.target != null ? [a.target] : []), ...(a.on != null && a.on !== a.target ? [a.on] : [])];
  const boost = names.some(named) ? 1.6 : 1;
  const quote = a.thought ? String(a.thought).trim() : undefined;
  const because = Array.isArray(a.because) && a.because.length ? a.because.map(String) : undefined;
  const words = { ...(quote ? { quote } : {}), ...(because && a.life !== true ? { because } : {}) };
  switch (a.kind) {
    case "death": {
      const by = a.by != null && a.by !== who ? a.by : undefined;
      const cause = String(a.text ?? "").replace(/^dies of /, "");
      // the cause as the record has it; whose act brought it about is said by the deed itself ("… died of it"), not here
      const sp = k > 0 ? r.frames?.[k - 1]?.partner?.[who] : r.citizens[who]?.startPartner; const spI = sp ? idxOf(r, sp) : undefined;
      const widowed = spI != null && spI >= 0 && r.citizens[spI] && !(r.citizens[spI].diedAt != null && r.citizens[spI].diedAt - 1 < k) ? spI : undefined;
      // how it happened, in the town's own places, and the last words, when the record has them
      return { ...base, kind: "death", names: [who, ...(widowed != null ? [widowed] : [])], ...(by != null ? { whom: by } : {}), ...(a.last ? { last: String(a.last) } : {}), text: stop(`${N} ${a.how ? String(a.how) : `died ${DIED[cause] ?? `of ${cause}`}`}${widowed != null ? `, and ${nameOf(r, widowed)} was widowed` : ""}`), weight: 12 * boost, tone: "loss" };
    }
    case "turned": return { ...base, kind: "turned", names: [who], text: `By now the harm ${N} had done outweighed the good.`, weight: 7 * boost, tone: "harm" };
    case "marry": return { ...base, kind: "marry", names, text: stop(`${N} married${T ? ` ${T}` : ""}`), weight: 6 * boost, tone: "joy" };
    // a secret coming out: what the town now knew, and, where it had been kept from them, the one it was done to learning who
    case "exposed": return { ...base, kind: "exposed", names, text: stop(`It came out that ${N} ${String(a.text ?? "").replace(/^was found out: they /, "")}`), weight: 6 * boost, tone: "loss" };
    case "learned": return { ...base, kind: "learned", names, text: stop(`${N} ${String(a.text ?? "")}`), weight: 6 * boost, tone: a.tone === "help" ? "joy" : "loss" };
    case "birth": return { ...base, kind: "birth", names: [who], text: stop(`A child was born to ${N}`), weight: 5 * boost, tone: "joy" };
    case "leave": return { ...base, kind: "leave", names: [who], text: stop(`${N} left for good`), weight: 7 * boost, tone: "loss" };
    case "sick": return { ...base, kind: "sick", names: [who], text: stop(`${N} fell sick`), weight: 4 * boost, tone: "low" };
    case "well": return { ...base, kind: "well", names: [who], text: stop(`${N} got well again`), weight: 3 * boost, tone: "joy" };
    case "homeless": return { ...base, kind: "homeless", names: [who], text: stop(`${N} ${String(a.text).replace(/^has lost the roof$/, "lost the roof over their head").replace(/^lost their home/, "lost their home")}`), weight: 5 * boost, tone: "loss" };
    case "housed": return { ...base, kind: "housed", names, text: stop(`${N} had a roof again${T ? `, at ${T}'s` : ""}`), weight: 3 * boost, tone: "joy" };
    case "work": return { ...base, kind: "work", names: [who], text: stop(`${N} ${a.text}`), weight: 1.5 * boost, tone: "plain" };
    case "hungry": return { ...base, kind: "hungry", names: [who], text: stop(`${N} went hungry`), because: a.because, weight: 3.5 * boost, tone: "low" };
    case "fed": return { ...base, kind: "fed", names: [who], text: stop(`${N} had enough to eat again${a.seasons > 1 ? ` after ${a.seasons} hungry seasons` : ""}`), weight: 2 * boost, tone: "joy" };
    case "hurt": return { ...base, kind: "hurt", names: [who], text: stop(`${N} ${a.text}`), weight: 3 * boost, tone: "low" };
    case "money": return { ...base, kind: "money", names: [who], text: stop(`${N} ${a.text}${a.because?.[0] ? ` (${a.because[0]})` : ""}`), weight: 2 * boost, tone: /ran out|out of money/.test(a.text) ? "low" : "plain", ...(/ran out/.test(a.text) ? { text: stop(`${N} was all but out of money${a.because?.[0] ? ` (${a.because[0]})` : ""}`) } : {}) };
    case "low": { a = { ...a, text: String(a.text).replace("fell into despair", "fell very low") }; const why = causesOf(a.because, N); return { ...base, kind: "low", names: [who, ...namesIn(r, why)], text: stop(`${N} ${a.text}${why.length ? `: ${why.join("; ")}` : ""}`), because: why, weight: 3 * boost, tone: "low" }; }
    case "lifted": { if ((r.frames?.[k]?.vitals?.[who]?.[3] ?? 0) <= -0.25 || (k > 0 && (r.frames?.[k - 1]?.vitals?.[who]?.[3] ?? 0) > -0.25)) return null; // one line for low, the ledger's: crossing it is the lifting
      let low = 0; for (let x = k - 1; x >= 0 && (r.frames?.[x]?.vitals?.[who]?.[3] ?? 0) <= -0.25; x--) low++;
      return { ...base, kind: "lifted", names: [who], text: stop(`${N} came up out of it${low > 1 ? ` after ${low} seasons low` : ""}`), weight: 2 * boost, tone: "joy" }; }
    case "glad": { const why = causesOf(a.because, N).slice(0, 2); return { ...base, kind: "glad", names: [who, ...namesIn(r, why)], text: stop(`${N} was in good spirits${why.length ? `: ${why.join("; ")}` : ""}`), weight: 1.5 * boost, tone: "joy" }; }
    case "grief": { const spouse = k > 0 && r.frames?.[k - 1]?.partner?.[who] === r.citizens[a.target]?.id || (k === 0 && r.citizens[who]?.startPartner === r.citizens[a.target]?.id);
      return { ...base, kind: "grief", names, text: stop(`${N} grieved for ${T}${spouse ? `, whom ${N} had married` : ""}`), weight: (spouse ? 6 : 4) * boost, tone: "loss" }; }
    case "standing": return { ...base, kind: "standing", names: [who], text: /harm/.test(a.text) ? `People had begun to speak of ${N} for the harm done.` : `People had begun to think well of ${N}.`, weight: 3 * boost, tone: /harm/.test(a.text) ? "harm" : "help" };
    case "bond": {
      const why = a.deed && !/^you\b/i.test(a.deed) && !/^(neighbours|married|an old quarrel)$/.test(a.deed) ? a.deed : "";
      return { ...base, kind: "bond", names, text: stop(`${N} ${a.text}${why ? ` (${why})` : ""}`), weight: 3 * boost, tone: /against|drifted|fell out/.test(a.text) ? "harm" : "help" };
    }
    case "reaction": {
      const on = a.on != null ? nameOf(r, a.on) : "";
      const text = /^blamed/.test(a.text) ? `${N} ${a.text}` : `${N} ${a.how === "saw" ? "saw" : "heard"} that ${T} ${a.deed}, and ${a.shift < 0 ? "thought less of" : "thought better of"} ${T} for it`;
      return { ...base, kind: "reaction", names: [...names], text: stop(text), weight: (1.2 + Math.abs(a.shift ?? 0) * 6) * boost * (on && r.citizens[a.on]?.named ? 1.2 : 1), tone: a.tone === "harm" || (a.shift ?? 0) < 0 ? "harm" : "help" };
    }
  }
  // a deed or a choice
  const harm = a.harm ?? 0, help = a.help ?? 0;
  if (/took \w+ in for the winter/.test(String(a.text)) && a.target != null && (k > 0 ? r.frames?.[k - 1]?.partner?.[who] : r.citizens[who]?.startPartner) === r.citizens[a.target]?.id) a = { ...a, text: `took in ${T}, whom ${N} had married, for the winter` };
  if (/ during the winter\b/.test(String(a.text)) && k % 4 !== 3) a = { ...a, text: String(a.text).replace(/ during the winter\b/, "") };
  if (a.text === "told a neighbour who had robbed them") a = { ...a, text: `told the neighbour that ${T || "someone"} had taken from their store` }; // an older card's words, which read the wrong way round
  if (/^(was|were) [^.]* by /.test(String(a.text ?? ""))) // "was refused the battery by Wren": done to them, not by them
    return { ...base, ...words, kind: "refused", names, text: stop(`${N} ${a.text}`), weight: (1.5 + harm * 4) * boost, tone: "low" };
  if (HARM_KINDS.has(a.kind) || HELP_KINDS.has(a.kind) || harm > 0 || help > 0) {
    const watcher = /\b(clerk|crowd|watching|watches|waits at the door|stands over|in front of|everyone|the council|the lane hears)\b/i.test(`${a.situation ?? ""} ${a.condition?.label ?? ""}`);
    const nobody = a.seen === 0 && !watcher && !/\b(seen|caught|spotted|noticed)\b/i.test(`${a.text ?? ""} ${a.outcome ?? ""}`) ? " Nobody saw." : ""; /* "was seen taking it" with no one else about: the one it was done to saw, which is not nobody */
    let why = "";
    if (/for an old wrong/.test(String(a.text)) && a.target != null) {
      // which wrong the card means is not recorded, so none is named: only what the other had done them before, as history
      const before: string[] = [];
      for (let x = k - 1; x >= 0 && before.length < 2; x--) for (const b of [...(r.acts?.[x] ?? [])].reverse()) {
        if (before.length >= 2) break;
        if (b.c === a.target && b.target === who && (b.harm ?? 0) >= 0.2 && !/^(was|were) /.test(String(b.text))) before.push(`${nameOf(r, a.target)} ${String(b.text).replace(x % 4 !== 3 ? / during the winter\b/ : /$^/, "")}, ${whenOf(r, x)}`);
      }
      if (before.length) why = ` (Earlier between them: ${before.join("; ")}.)`;
    }
    const widowOf = (x: number) => { const sp = k > 0 ? r.frames?.[k - 1]?.partner?.[x] : r.citizens[x]?.startPartner; const j = sp ? idxOf(r, sp) : undefined; return j != null && j >= 0 && j !== who ? j : undefined; };
    const killed = (a.kills ?? []).length ? ` ${a.kills.map((x: number) => { const w = widowOf(x); return `${nameOf(r, x)} died${w != null ? `, and ${nameOf(r, w)}, who had married ${nameOf(r, x)}, was widowed` : ""}`; }).join("; ")}.` : "";
    const tDied = a.target != null && (r.acts?.[k] ?? []).some((x: any) => x.kind === "death" && x.c === a.target);
    if (T && /though they had wronged them/.test(String(a.text))) a = { ...a, text: String(a.text).replace(/though they had wronged them/, `though ${T} had wronged ${N}`) }; // two "they"s blur who did what
    if (tDied) a = { ...a, text: String(a.text).replace(/ through the sickness/, " in the sickness").replace(/ through it/, "") };
    const came = checkedOutcome(r, k, retell(a.outcome, N, T || undefined), !!a.game);
    const bare = came.replace(new RegExp(`^${N} `), "").toLowerCase().slice(0, 16);
    if (/left \w+ in the ditch/i.test(came) && /beat /.test(a.text)) a = { ...a, outcome: "" };
    const overlap = (() => { const w = (x: string) => new Set(x.toLowerCase().match(/[a-z]{3,}/g) ?? []); const A = w(`${N} ${a.text}`), B = w(came); const same = [...B].filter((x) => A.has(x)).length; return B.size ? same / B.size : 0; })();
    const outcome = a.outcome && came && overlap < 0.45 && !/\bdie|\bdied|\bdead\b/.test(came) && !a.text.toLowerCase().includes(bare) ? ` ${stop(came)}` : "";
    const forced = Array.isArray(a.options) && a.options.length > 1 && a.options.every((o: any) => (o.harm ?? 0) > 0);
    return { ...base, ...words, ...(forced ? { forced: true } : {}), kind: a.kind, names, deed: true, text: `${stop(`${N} ${a.text}`)}${why}${outcome}${nobody}${a.unknown && T ? ` ${T} did not know who it was.` : ""}${killed}`, weight: (2 + harm * 10 + help * 7 + (killed ? 6 : 0)) * boost, tone: harm > help ? "harm" : "help" };
  }
  if (a.kind === "choice") {
    if (!a.options && !a.quiet && !a.evening && !a.thought) return null; // the echo of somebody else's game, with nothing of the person in it
    const out0 = checkedOutcome(r, k, /\b(you|your|they|them)\b/i.test(a.outcome ?? "") ? retell(a.outcome, N, T || undefined) : plainOutcome(a.outcome), !!a.game);
    const out = out0 && !r.citizens.some((c: any) => out0.startsWith(first(c.name))) ? out0.charAt(0).toLowerCase() + out0.slice(1) : out0;
    const ev = a.evening === "visit" && T ? (out && out.includes(T) ? out : `spent the evenings with ${T}`) : a.evening && EVENING[a.evening] && !((a.choice ?? a.text) && ["work", "home"].includes(a.evening) && !/^(take every shift going|keep to the house)$/i.test(String(a.choice ?? a.text))) ? EVENING[a.evening] : "";
    if (a.quiet && out && T && out.startsWith(T)) return { ...base, ...words, kind: "choice", names, text: stop(out), weight: 1.2 * boost, tone: "plain" };
    const did0 = ev || (out && a.quiet ? out : choseTo(a.choice ?? a.text, T || undefined));
    const did = did0.startsWith(T) && T ? `was told no: ${did0}` : did0;
    const responder = String(a.dilemma ?? "").endsWith("-b");
    const to = a.game && T && !responder && !did.includes(T) ? (/^(chose to )?offer/.test(did) ? ` to ${T}` : ` (with ${T})`) : "";
    const startsWithName = r.citizens.some((c: any) => out.startsWith(first(c.name)));
    const tail = !ev && out && !a.quiet ? `: ${startsWithName ? out : out.charAt(0).toLowerCase() + out.slice(1)}` : "";
    const game = a.game && responder ? ` (${nameOf(r, a.game.with)} ${choseTo(a.game.theirLabel)})` : "";
    const textOf = `${N} ${did}${to}${game}${tail}`;
    return { ...base, ...words, kind: a.quiet || ev ? "evening" : "choice", names, text: stop(textOf), weight: (a.quiet || ev ? 0.6 : 1.4) * boost, tone: "plain" };
  }
  return null;
}

/** What a season read back off the frames can say, for runs recorded before the life between decisions was kept. */
function derived(r: R, k: number): Fact[] {
  const f = r.frames?.[k], p = r.frames?.[k - 1]; if (!f) return [];
  const out: Fact[] = []; let n = 900;
  const alive = (fr: any, i: number) => fr?.at?.[i] != null;
  for (const d of (r.acts?.[k] ?? []).filter((a: any) => a.kind === "death")) {
    const pf = r.frames?.[k - 1]; if (!pf) continue; const deadId = r.citizens[d.c]?.id;
    r.citizens.forEach((c: any, i: number) => {
      if (i === d.c || !alive(f, i)) return;
      const spouse = pf.partner?.[i] === deadId; const aff = spouse ? 1 : (pf.ties?.[i]?.[deadId] ?? 0);
      if (aff < 0.45) return;
      out.push({ id: `${k}.${n++}`, k, kind: "grief", who: i, whom: d.c, names: [i, d.c], text: spouse ? `${first(c.name)} lost ${nameOf(r, d.c)}, whom ${first(c.name)} had married.` : `${first(c.name)} lost ${nameOf(r, d.c)}, a friend.`, weight: (spouse ? 6 : 4) * (c.named || r.citizens[d.c]?.named ? 1.6 : 1), tone: "loss" });
    });
  }
  r.citizens.forEach((c: any, i: number) => {
    if (!alive(f, i)) return;
    const fl = f.flags?.[i] ?? 0, pl = p?.flags?.[i] ?? 0; const boost = c.named ? 1.6 : 1;
    if (fl & 1 && !(pl & 1)) out.push({ id: `${k}.${n++}`, k, kind: "hungry", who: i, names: [i], text: `${first(c.name)} went hungry.`, weight: 3.5 * boost, tone: "low" });
    if (!(fl & 1) && pl & 1 && p) out.push({ id: `${k}.${n++}`, k, kind: "fed", who: i, names: [i], text: `${first(c.name)} had enough to eat again.`, weight: 2 * boost, tone: "joy" });
    const m = f.vitals?.[i]?.[2], pm = p?.vitals?.[i]?.[2];
    if (m != null && pm != null && m < 0.08 && pm >= 0.08) out.push({ id: `${k}.${n++}`, k, kind: "money", who: i, names: [i], text: `${first(c.name)} was all but out of money.`, weight: 2 * boost, tone: "low" });
    const t = f.ties?.[i] ?? {}, pt = p?.ties?.[i] ?? {};
    for (const [id, v] of Object.entries(t) as [string, number][]) {
      const j = idxOf(r, id); if (j == null || j < 0 || !alive(f, j)) continue; const was = (pt as any)[id] ?? 0;
      if (v >= 0.45 && was < 0.45 && f.partner?.[i] !== id) out.push({ id: `${k}.${n++}`, k, kind: "bond", who: i, whom: j, names: [i, j], text: `${first(c.name)} grew close to ${nameOf(r, j)}.`, weight: 3 * boost, tone: "help" });
      if (v <= -0.4 && was > -0.4) out.push({ id: `${k}.${n++}`, k, kind: "bond", who: i, whom: j, names: [i, j], text: `${first(c.name)} turned against ${nameOf(r, j)}.`, weight: 3 * boost, tone: "harm" });
    }
  });
  return out;
}

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (n: number) => ORD[n] ?? `${n}th`;
/** What people were living with this season that no single event says: still hungry, still sick, still low, still poor,
 *  still without a roof, failing in body. One fact a person, only for what has lasted — the season it began has its own. */
function conditions(r: R, k: number, n0 = 800): Fact[] {
  const f = r.frames?.[k]; if (!f) return [];
  const out: Fact[] = []; let n = n0;
  r.citizens.forEach((c: any, i: number) => {
    if (f.at?.[i] == null) return;
    const run = (test: (x: number) => boolean) => { let m = 0; for (let x = k; x >= 0 && r.frames[x]?.at?.[i] != null && test(x); x--) m++; return m; };
    const fl = (x: number) => r.frames[x]?.flags?.[i] ?? 0, v = (x: number) => r.frames[x]?.vitals?.[i] ?? [1, 0.5, 0.5, 0];
    const bits: string[] = [];
    const hungry = run((x) => !!(fl(x) & 1)); if (hungry >= 2) bits.push(`hungry for the ${nth(hungry)} season running`);
    else if (!hungry) { const short = run((x) => v(x)[1] < 0.3 && !(fl(x) & 1)); if (short >= 2) bits.push(`short of food, ${nth(short)} season`); }
    const sick = run((x) => !!(fl(x) & 2)); if (sick >= 2) bits.push(`sick, ${nth(sick)} season`);
    const roof = run((x) => !!(fl(x) & 4)); if (roof >= 2) bits.push(`without a roof, ${nth(roof)} season`);
    if (v(k)[0] < 0.3) bits.push("failing in body"); else if (v(k)[0] < 0.45) bits.push("worn in body");
    const low = run((x) => (v(x)[3] ?? 0) <= -0.25); if (low >= 2) bits.push(`${(v(k)[3] ?? 0) <= -0.55 ? "very low" : "low"} in spirits, ${nth(low)} season`);
    const poor = run((x) => v(x)[2] < 0.08); if (poor >= 2) bits.push(`without money, ${nth(poor)} season`);
    if (!bits.length) return;
    out.push({ id: `${k}.${n++}`, k, kind: "condition", who: i, names: [i], text: `${first(c.name)} was ${listOf(bits)}.`, weight: (1 + bits.length * 0.6) * (c.named ? 1.6 : 1), tone: "low" });
  });
  return out;
}
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** how things stood when the years began: who was married to whom */
function start(r: R): Fact[] {
  const out: Fact[] = []; const seen = new Set<string>(); let n = 700;
  r.citizens.forEach((c: any, i: number) => {
    const j = c.startPartner != null ? idxOf(r, c.startPartner) : undefined; if (j == null || j < 0) return;
    const key = [i, j].sort().join("-"); if (seen.has(key)) return; seen.add(key);
    out.push({ id: `0.${n++}`, k: 0, kind: "married", who: i, whom: j, names: [i, j], text: `${first(c.name)} and ${nameOf(r, j)} were married when the years began${c.children ? "" : ""}.`, weight: 3 * (c.named || r.citizens[j]?.named ? 1.6 : 1), tone: "joy" });
  });
  return out;
}

/** the first season the record kept the life between decisions, if it ever did */
export function lifeFrom(r: R): number {
  const k = (r.acts ?? []).findIndex((as: any[]) => (as ?? []).some((a) => a.life));
  return k < 0 ? Infinity : k;
}

const cache = new WeakMap<object, Fact[][]>();
/** Every fact of every season that has happened, in order. */
export function ledger(r: R): Fact[][] {
  const hit = cache.get(r); if (hit) return hit;
  const played = Math.min((r.acts ?? []).length, r.frames?.length ?? Infinity);
  const from = lifeFrom(r);
  const out: Fact[][] = [];
  for (let k = 0; k < played; k++) {
    const fs: Fact[] = k === 0 ? start(r) : [];
    for (const e of r.events ?? []) if (e.at === k + 1) fs.push({ id: `${k}.e${e.id}`, k, kind: "epoch", who: -1, names: [], text: stop(e.headline), weight: 9, tone: "low" });
    (r.acts[k] ?? []).forEach((a: any, n: number) => { const f = factOf(r, k, a, n); if (f) fs.push(f); });
    if (k < from) fs.push(...derived(r, k));
    fs.push(...conditions(r, k));
    const price = r.population?.[k]?.price, was = k > 0 ? r.population?.[k - 1]?.price : undefined;
    if (price != null && was != null && was > 0 && price / was >= 1.3) fs.push({ id: `${k}.b`, k, kind: "town", who: -1, names: [], text: price / was >= 1.8 ? "Bread cost nearly twice what it had." : "Bread grew dearer.", weight: 5, tone: "low" });
    if (price != null && was != null && was > 0 && price / was <= 0.7) fs.push({ id: `${k}.b`, k, kind: "town", who: -1, names: [], text: "Bread grew cheaper.", weight: 2.5, tone: "joy" });
    // one of the four with nothing to their name this season still had a season: say how they stood
    r.citizens.forEach((c: any, i: number) => {
      if (!c.named || r.frames?.[k]?.at?.[i] == null || fs.some((f) => f.who === i || f.whom === i)) return;
      const f = r.frames[k]; const m = f.vitals?.[i]?.[3] ?? 0; const ev = f.evening?.[i];
      const where = ev === "tavern" ? "spent the evenings at the tavern" : ev === "chapel" ? "spent the evenings at the chapel" : ev?.startsWith?.("visit:") ? `spent the evenings with ${nameOf(r, idxOf(r, ev.slice(6)))}` : ev === "work" ? "worked every shift" : "kept to the house";
      fs.push({ id: `${k}.790${i}`, k, kind: "quiet", who: i, names: [i], text: `${first(c.name)} ${where}; nothing came to them this season, and they were ${moodWordOf(m)}.`, weight: 1, tone: "plain" });
    });
    // what the four turned over in their heads as the season ended, in their own words: back on a thing they had done, on
    // how things stood, on what was coming. The thought is the quote; the fact says only that they thought it, and when.
    for (const [id, m] of Object.entries(r.musings?.[k] ?? {}) as [string, any][]) {
      const i = idxOf(r, id); if (i < 0) continue; const N = first(r.citizens[i].name); const when = whenOf(r, k);
      const about = m.about ? [...out.flat(), ...fs].find((f) => f.id === m.about) : undefined;
      if (m.past && about) fs.push({ id: `${k}.m${i}p`, k, kind: "musing", who: i, names: [...new Set([i, ...about.names])], text: `As ${when} ended, ${N} thought back on it: ${about.text.split(/(?<=\.)\s/)[0]}`, quote: String(m.past), weight: 1.5, tone: "plain" } as Fact);
      if (m.now) fs.push({ id: `${k}.m${i}n`, k, kind: "musing", who: i, names: [i], text: `As ${when} ended, ${N} thought about how things stood.`, quote: String(m.now), weight: 1.2, tone: "plain" } as Fact);
      if (m.ahead) fs.push({ id: `${k}.m${i}a`, k, kind: "musing", who: i, names: [i], text: `As ${when} ended, ${N} thought about the season to come.`, quote: String(m.ahead), weight: 1.2, tone: "plain" } as Fact);
    }
    out.push(fs);
  }
  cache.set(r, out);
  return out;
}
export const factsAt = (r: R, k: number): Fact[] => ledger(r)[k] ?? [];
export const allFacts = (r: R): Fact[] => ledger(r).flat();
export const factById = (r: R, id: string): Fact | undefined => { const k = Number(id.split(".")[0]); return factsAt(r, k).find((f) => f.id === id); };
/** how many seasons have been played */
export const played = (r: R) => ledger(r).length;

// ---------- the town, now ----------
export interface TownNow { k: number; when: string; year: number; season: string; epoch: { headline: string; kind: string; since: number; left: number } | null; alive: number; dead: number; gone: number; hungry: number; sick: number; roofless: number; low: number; price?: number; priceWas?: number; deaths: { i: number; k: number; cause: string }[] }
/** what a season did to the town as a whole, in words, from its population count: the stores, the price of food, how many
 *  were alive, hungry, sick, without a roof, low in spirits, and who died — compared with the season before */
export function townFact(r: R, k: number): string {
  const p = r.population?.[k] ?? {}, q = k > 0 ? r.population?.[k - 1] ?? {} : null;
  const W = (n: number) => ["no one", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] ?? String(n);
  const store = (v: number) => (v >= 0.75 ? "well stocked" : v >= 0.5 ? "half full" : v >= 0.25 ? "running low" : "nearly empty");
  const bits: string[] = [];
  if (p.supply != null) bits.push(q?.supply != null && store(q.supply) !== store(p.supply) ? `the stores went from ${store(q.supply)} to ${store(p.supply)}` : `the stores were ${store(p.supply)}`);
  if (p.price != null && q?.price) { const ch = p.price / q.price - 1; if (ch > 0.12) bits.push("food cost more than the season before"); else if (ch < -0.12) bits.push("food cost less than the season before"); }
  bits.push(`${W(p.alive ?? 0)} ${p.alive === 1 ? "was" : "were"} alive${p.dead ? `, ${W(p.dead)} dead` : ""}`);
  if (p.starving) bits.push(`${W(p.starving)} going hungry`); if (p.sick) bits.push(`${W(p.sick)} sick`); if (p.homeless) bits.push(`${W(p.homeless)} without a roof`);
  if (p.low) bits.push(`${W(p.low)} low in spirits`);
  const died = r.citizens.filter((c: any) => c.diedAt === k + 1).map((c: any) => `${first(c.name)} died${c.cause ? ` (${c.cause})` : ""}`);
  const s0 = `${SEASON_NAMES[k % 4].replace(/^./, (c: string) => c.toUpperCase())}: ${bits.join("; ")}${died.length ? `; ${died.join(", ")}` : ""}.`;
  return s0;
}

export function townNow(r: R, k = played(r) - 1): TownNow {
  const pop = r.population?.[k] ?? {};
  const ep = (r.events ?? []).find((e: any) => e.seasons && k + 1 >= e.at && k + 1 < e.at + e.seasons);
  const deaths = r.citizens.map((c: any, i: number) => ({ i, k: (c.diedAt ?? 0) - 1, cause: c.cause })).filter((d: any) => d.k >= 0 && d.k <= k).sort((a: any, b: any) => b.k - a.k);
  const f = r.frames?.[k]; const live = (i: number) => f?.at?.[i] != null;
  const count = (test: (i: number) => boolean) => r.citizens.filter((_: any, i: number) => live(i) && test(i)).length;
  const low = count((i) => (f?.vitals?.[i]?.[3] ?? 0) <= -0.25);
  return { k, when: whenOf(r, k), year: yearOf(k), season: SEASON_NAMES[k % 4], epoch: ep ? { headline: ep.headline, kind: ep.kind, since: k + 1 - ep.at, left: ep.at + ep.seasons - 1 - (k + 1) } : null, alive: count(() => true), dead: pop.dead ?? 0, gone: pop.left ?? 0, hungry: count((i) => !!((f?.flags?.[i] ?? 0) & 1) || (r.acts?.[k] ?? []).some((a: any) => a.c === i && a.kind === "hungry")), sick: count((i) => !!((f?.flags?.[i] ?? 0) & 2) || (r.acts?.[k] ?? []).some((a: any) => a.c === i && a.kind === "sick")), roofless: count((i) => !!((f?.flags?.[i] ?? 0) & 4)), low, price: pop.price, priceWas: r.population?.[Math.max(0, k - 4)]?.price, deaths };
}

/** what is coming: the next thing the years bring, and how long until it */
export function ahead(r: R, k = played(r) - 1): { next: { headline: string; kind: string; in: number; at: number } | null; seasonsLeft: number } {
  const e = (r.events ?? []).filter((e: any) => e.at > k + 1).sort((a: any, b: any) => a.at - b.at)[0];
  return { next: e ? { headline: e.headline, kind: e.kind, in: e.at - (k + 1), at: e.at - 1 } : null, seasonsLeft: (r.hours ?? 60) - (k + 1) };
}

// ---------- a person, now ----------
export interface PersonNow {
  i: number; name: string; alive: boolean; gone: boolean; diedAt?: number; cause?: string;
  health: string; food: string; money: string; mood: string; moodV: number; moodWhy: string[]; sick: boolean; roof: boolean;
  hungryFor: number; lowFor: number; partner?: number; children: number; standing: string;
  close: { j: number; v: number; why: string }[]; odds: { j: number; v: number; why: string }[];
  lost: number[];
}
const word = (v: number, lo: string, mid: string, hi: string) => (v < 0.34 ? lo : v < 0.67 ? mid : hi);
export const moodWordOf = (m: number) => (m <= -0.55 ? "very low" : m <= -0.25 ? "low" : m >= 0.45 ? "happy" : m >= 0.2 ? "in good spirits" : "steady");

/** why two people stand as they do: the last thing that passed between them, as a fact */
export function lastBetween(r: R, i: number, j: number, k = played(r) - 1): Fact | undefined {
  const all = ledger(r); const ni = nameOf(r, i), nj = nameOf(r, j);
  const both = (f: Fact) => ((f.who === i && f.whom === j) || (f.who === j && f.whom === i)) && f.text.includes(ni) && f.text.includes(nj);
  let light: Fact | undefined;
  for (let x = Math.min(k, all.length - 1); x >= 0; x--) {
    for (const f of [...all[x]].reverse()) {
      if (!both(f)) continue;
      if (f.deed || f.kind === "marry" || f.kind === "grief" || f.kind === "reaction" || f.kind === "refused" || f.kind === "bond" && /\(/.test(f.text)) return f;
      light ??= f;
    }
  }
  return light;
}

/** the weightiest thing of one tone that passed between two people, by either of them */
export function toned(r: R, i: number, j: number, k: number, tone: string): Fact | undefined {
  const ni = nameOf(r, i), nj = nameOf(r, j);
  return ledger(r).slice(0, k + 1).flat().filter((f) => (f.deed || f.kind === "refused" || f.kind === "reaction") && f.tone === tone && ((f.who === i && f.whom === j) || (f.who === j && f.whom === i)) && f.text.includes(ni) && f.text.includes(nj)).sort((a, b) => b.weight - a.weight || b.k - a.k)[0];
}
export function personNow(r: R, i: number, k0 = played(r) - 1): PersonNow {
  const c = r.citizens[i];
  const dead = c.diedAt != null && c.diedAt - 1 <= k0;
  const k = dead ? Math.max(0, c.diedAt - 2) : k0; // the dead are as they were in their last season alive
  const f = r.frames?.[k]; const gone = !dead && f?.at?.[i] == null && (c.left ?? false);
  const v = f?.vitals?.[i] ?? [1, 0.5, 0.5, 0]; const fl = f?.flags?.[i] ?? 0;
  // how long they have been hungry, and how long low
  let hungryFor = 0; for (let x = k; x >= 0 && ((r.frames[x]?.flags?.[i] ?? 0) & 1); x--) hungryFor++;
  let lowFor = 0; for (let x = k; x >= 0 && (r.frames[x]?.vitals?.[i]?.[3] ?? 0) <= -0.25; x--) lowFor++;
  // why they are low: what the record said when they went low, or what the season did to them
  const facts = ledger(r);
  let moodWhy: string[] = [];
  if ((v[3] ?? 0) <= -0.25) { for (let x = k; x >= Math.max(0, k - lowFor); x--) { const lf = facts[x]?.find((f) => f.who === i && f.kind === "low"); if (lf?.because?.length) { moodWhy = lf.because; break; } } }
  const ties = f?.ties?.[i] ?? {};
  const live = (j: number) => f?.at?.[j] != null;
  const tieList = Object.entries(ties).map(([id, a]) => ({ j: idxOf(r, id)!, v: a as number })).filter((x) => x.j != null && x.j >= 0 && live(x.j));
  const why = (j: number, tone?: string) => (tone ? toned(r, i, j, k, tone) : undefined)?.text ?? lastBetween(r, i, j, k)?.text ?? "";
  const partnerId = f?.partner?.[i]; const partner = partnerId ? idxOf(r, partnerId) : undefined;
  const close = tieList.filter((x) => x.v >= 0.45 && x.j !== partner).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => ({ ...x, why: why(x.j, "help") }));
  const odds = tieList.filter((x) => x.v <= -0.35).sort((a, b) => a.v - b.v).slice(0, 3).map((x) => ({ ...x, why: why(x.j, "harm") }));
  const lost = facts.slice(0, k + 1).flat().filter((f) => f.kind === "grief" && f.who === i).map((f) => f.whom!).filter((x, n, xs) => xs.indexOf(x) === n);
  const standing = fl & 32 ? "feared" : fl & 64 ? "trusted" : "";
  return {
    i, name: first(c.name), alive: !dead && !gone, ...(dead ? {} : {}), gone, ...(dead ? { diedAt: c.diedAt - 1, cause: c.cause } : {}),
    health: fl & 128 ? "failing" : word(v[0], "failing", "worn", "well"), food: fl & 1 ? "hungry" : v[1] < 0.3 ? "short" : "enough", money: v[2] <= 0.1 ? "none" : v[2] < 0.4 ? "little" : v[2] < 1 ? "some" : "plenty",
    mood: moodWordOf(v[3] ?? 0), moodV: v[3] ?? 0, moodWhy, sick: !!(fl & 2), roof: !(fl & 4), hungryFor, lowFor, ...(partner != null && partner >= 0 ? { partner } : {}), children: c.children ?? 0, standing, close, odds, lost,
  };
}

// ---------- a household ----------
/** Who they were married to, from when to when and how it ended; and their children. Read off the frames, which keep the
 *  partner of every person every season. */
export function householdOf(r: R, i: number, k = played(r) - 1): { partners: { j: number; from: number; to: number | null; ended: "death" | "theirs" | null }[]; children: number } {
  const out: { j: number; from: number; to: number | null; ended: "death" | "theirs" | null }[] = [];
  const id = (x: number) => { const p = x < 0 ? r.citizens[i].startPartner : r.frames?.[x]?.partner?.[i]; return p ? idxOf(r, p) : undefined; };
  let cur = id(-1); let from = 0;
  const close = (to: number) => { if (cur == null || cur < 0) return; const died = r.citizens[cur]?.diedAt != null && r.citizens[cur].diedAt - 1 <= to; out.push({ j: cur, from, to, ended: died ? "death" : null }); };
  const last = Math.min(k, (r.citizens[i].diedAt ?? 1e9) - 1);
  for (let x = 0; x <= last; x++) { const p = id(x); if (p !== cur) { close(x); cur = p; from = x; } }
  if (cur != null && cur >= 0) { const died = r.citizens[cur]?.diedAt != null && r.citizens[cur].diedAt - 1 <= k; out.push({ j: cur, from, to: died ? r.citizens[cur].diedAt - 1 : null, ended: died ? "death" : null }); }
  return { partners: out.filter((p, n, xs) => xs.findIndex((q) => q.j === p.j && q.from === p.from) === n), children: r.citizens[i].children ?? 0 };
}
/** what they did to others, and what others did to them: both, so a card is fair */
export const didTo = (r: R, i: number, k = played(r) - 1, n = 3) => lifeFacts(r, i, k).filter((f) => f.who === i && f.deed && f.whom != null).sort((a, b) => b.weight - a.weight).slice(0, n).sort((a, b) => a.k - b.k);
export const doneTo = (r: R, i: number, k = played(r) - 1, n = 3) => lifeFacts(r, i, k).filter((f) => f.whom === i && f.deed && f.who !== i).sort((a, b) => b.weight - a.weight).slice(0, n).sort((a, b) => a.k - b.k);

// ---------- a life ----------
/** everything that happened to one person or was done by them, weightiest first, up to a season */
export function lifeFacts(r: R, i: number, k = played(r) - 1): Fact[] {
  return ledger(r).slice(0, k + 1).flat().filter((f) => f.who === i || f.whom === i || (f.kind === "reaction" && f.names.includes(i)));
}
/** the handful of things that made someone who they are by now, in the order they happened */
export function keyMoments(r: R, i: number, k = played(r) - 1, n = 5): Fact[] {
  const fs = lifeFacts(r, i, k).filter((f) => f.kind !== "evening" && f.kind !== "reaction" && !(f.kind === "choice" && !f.quote));
  // what happened to them counts as much as what they did; a death of theirs is always in
  const score = (f: Fact) => f.weight * (f.who === i ? 1 : f.deed ? 1.1 : 0.8) + (f.kind === "death" && f.who === i ? 100 : 0);
  const told = (f: Fact) => f.kind === "death" && fs.some((g) => g !== f && g.k === f.k && g.deed && g.text.includes(`${nameOf(r, f.who)} died`) || (g !== f && g.k === f.k && g.who === f.who && g.deed && /\bdied\b/.test(g.text)));
  const top = [...fs].filter((f) => !told(f)).sort((a, b) => score(b) - score(a)).slice(0, n);
  return top.sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
}

/** The worst thing that happened to them — not what they did, what was done to them or taken from them. */
export function woundOf(r: R, i: number, k = played(r) - 1): Fact | undefined {
  const fs = lifeFacts(r, i, k);
  const score = (f: Fact) =>
    f.kind === "grief" && f.who === i ? 7 + (r.frames?.[f.k - 1]?.partner?.[i] === r.citizens[f.whom!]?.id ? 5 : 0) :
    f.deed && f.whom === i && f.tone === "harm" ? 4 + f.weight / 2 - (fs.some((g) => g.deed && g.tone === "harm" && g.who === i && g.whom === f.who && g.k >= f.k - 1 && g.k <= f.k && (g.k < f.k || g.id < f.id)) ? 4 : 0) :
    f.kind === "homeless" && f.who === i ? 5 :
    f.kind === "hungry" && f.who === i ? 3.5 :
    f.kind === "sick" && f.who === i ? 3 :
    f.kind === "bond" && f.whom === i && f.tone === "harm" ? 2.5 : 0;
  const loss = (f: Fact) => (/\bhouse|\bhome|\broof/.test(f.text) ? 1 : 0);
  return [...fs].filter((f) => score(f) > 0).sort((a, b) => score(b) + loss(b) - score(a) - loss(a) || a.k - b.k)[0];
}

/** Where what they told themselves and what they did part company. Found in the record, not guessed at: a line about
 *  somebody set against a harm done to that same somebody; a kindness done in front of people set against a harm done
 *  where nobody could see. */
export interface Contradiction { said: Fact; did: Fact; how: "friend" | "unseen" | "same" | "turned" | "denied" | "judged" }
export function contradictionsOf(r: R, i: number, k = played(r) - 1): Contradiction[] {
  const mine = lifeFacts(r, i, k).filter((f) => f.who === i);
  const out: (Contradiction & { score: number })[] = [];
  const all = lifeFacts(r, i, k);
  const provoked = (said: Fact, h: Fact) => /for an old wrong/.test(h.text) || all.some((g) => g.deed && g.tone === "harm" && g.who === h.whom && g.whom === i && (g.k > said.k || (g.k === said.k && g.id > said.id)) && (g.k < h.k || (g.k === h.k && g.id < h.id)));
  const harms = mine.filter((f) => f.deed && f.tone === "harm" && f.whom != null && !f.forced);
  const ATTACH = /\b(friend|love|loved|mine|my own|owe|trust|family|brother|sister|never|won't|will not|would not|wouldn't|stand by|protect|look after)\b/i;
  const DENY = /\bno friend|\bnot (my|a) friend|\bnobody to me|\bno one to me|\bnothing to me|\bdo not like|\bdon't like|\bnever liked|\bi hate|\bowe (them|him|her) nothing|\bmore for me|\bfor me\b|\bmy own come first|\blook after (myself|number one)|\bcoin is a coin|\bmoney is money/i;
  const names = r.citizens.map((c: any) => first(c.name));
  const namesOther = (q: string, j: number | undefined) => names.some((n: string, x: number) => x !== i && x !== j && new RegExp(`\\b${n}\\b`).test(q));
  for (const h of harms) {
    const them = nameOf(r, h.whom);
    for (const f of mine) {
      if (f === h || !f.quote || DENY.test(f.quote) || f.k > h.k || (f.k === h.k && f.id >= h.id)) continue;
      const about = f.whom === h.whom || f.quote.includes(them);
      if (!about || f.tone === "harm") continue;
      const kind = f.tone === "help" || (f.quote.includes(them) && ATTACH.test(f.quote));
      if (!kind || provoked(f, h)) continue;
      if (h.k - f.k > 16) continue; // years apart and slight is drift, not a contradiction
      out.push({ said: f, did: h, how: "friend", score: h.weight + (f.quote.includes(them) ? 3 : 0) + (ATTACH.test(f.quote) ? 2 : 0) + (f.tone === "help" ? 1 : 0) });
    }
  }
  // the same situation met twice: a kindness with words to it, and later the harm the words ruled out
  for (const h of mine.filter((f) => f.deed && f.tone === "harm" && f.dilemma && !f.forced)) {
    const s0 = mine.find((f) => f !== h && f.dilemma === h.dilemma && f.quote && f.tone === "help" && !DENY.test(f.quote) && (f.whom === h.whom || !namesOther(f.quote, h.whom)) && (f.k < h.k || (f.k === h.k && f.id < h.id)) && !provoked(f, h));
    if (s0) out.push({ said: s0, did: h, how: "same", score: h.weight + 8 });
  }
  // judged somebody for a thing in words, then did it, or let it go, themselves
  for (const j of mine.filter((f) => f.deed && f.kind === "justice" && f.quote && /theft|steal|stole/.test(f.text))) {
    const later = mine.find((f) => (f.k > j.k || (f.k === j.k && f.id > j.id)) && ((f.deed && f.kind === "theft") || (f.dilemma === j.dilemma && f.tone === "help" && f.quote)));
    if (later) out.push({ said: j, did: later, how: "judged", score: later.weight + 9 });
  }
  const unseenHarm = [...harms].filter((f) => f.seen === 0).sort((a, b) => b.weight - a.weight)[0];
  const seenHelp = mine.filter((f) => f.deed && f.tone === "help" && (f.seen ?? 0) > 0 && f.quote).sort((a, b) => b.weight - a.weight)[0];
  if (unseenHarm && seenHelp && !provoked(seenHelp, unseenHarm) && seenHelp.whom === unseenHarm.whom) out.push({ said: seenHelp, did: unseenHarm, how: "unseen", score: unseenHarm.weight + 1 });
  // turned against somebody, and then married them
  for (const m of all.filter((f) => f.kind === "marry" && f.who === i)) {
    const other = m.whom;
    const before = all.find((f) => f.who === i && f.whom === other && f.k < m.k && f.kind === "bond" && /turned against|fell out/.test(f.text));
    if (before) out.push({ said: before, did: m, how: "turned", score: 20 });
  }
  // a line that denies what they had already done: "I have never held a rifle" after taking the rifle
  const STOP = new Set(["never", "would", "could", "should", "their", "there", "these", "those", "other", "about", "again", "still", "every", "thing", "things", "anyone", "someone", "nobody", "people", "because", "before", "after", "while", "which", "where", "being", "going", "house", "winter", "summer"]);
  for (const q of mine.filter((f) => f.quote && /\b(I have never|I've never|I never|I did not|I didn't|I have not|I haven't|never have I)\b/i.test(f.quote!))) {
    // the thing denied: the words right after the "never", which must be the thing the earlier deed was about
    const m = /\b(?:I have never|I've never|I never|I did not|I didn't|I have not|I haven't|never have I)\b((?:\s+\S+){1,6})/i.exec(q.quote!);
    const words = ((m?.[1] ?? "").toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !STOP.has(w) && !r.citizens.some((c: any) => first(c.name).toLowerCase() === w));
    const earlier = mine.find((f) => f.deed && f !== q && (f.k < q.k || (f.k === q.k && f.id < q.id)) && words.filter((w) => f.text.toLowerCase().includes(w)).length >= 2);
    if (earlier) out.push({ said: q, did: earlier, how: "denied", score: earlier.weight + 10 });
  }
  const used = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((c) => { if (used.has(c.did.id) || used.has(c.said.id)) return false; used.add(c.did.id); used.add(c.said.id); return true; }).map(({ score: _s, ...c }) => c);
}

/** Their own words where they touch what they wanted or what they feared: the want and the fear, met in a dated moment. */
export function wantEcho(r: R, i: number, k = played(r) - 1): Fact[] {
  const c = r.citizens[i]; const STOPW = new Set(["about", "their", "being", "never", "again", "other", "there", "thing", "keep", "what", "they", "have", "with", "that", "this", "from", "into", "someone", "anyone", "people", "will", "back", "going", "came", "come", "none", "does", "hold", "want", "wants", "fear", "fears", "before", "over", "very", "much", "just", "only", "some", "town", "lane", "them", "were", "when", "where", "which", "would", "could", "should", "every", "once", "still", "else", "whom", "whose", "left", "take", "make", "made", "know", "known"]);
  const stems = `${c.want} ${c.fear}`.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOPW.has(w)).map((w) => (w.length > 6 ? w.slice(0, w.length - 2) : w)) ?? [];
  if (!stems.length) return [];
  return voiceOf(r, i, k).filter((f) => stems.some((st) => new RegExp(`\\b${st}`).test((f.quote ?? "").toLowerCase()))).sort((a, b) => b.weight - a.weight);
}
/** A handful of their own words, chosen: the lines that carry the most, not two alike, spread across their years, the
 *  words beside a contradiction always among them — in the order they said them. Their voice, with nothing added. */
export function voiceLines(r: R, i: number, k = played(r) - 1, n = 8): Fact[] {
  const all = voiceOf(r, i, k); if (!all.length) return [];
  const must = new Set(contradictionsOf(r, i, k).slice(0, 2).flatMap((c) => [c.said, c.did]).filter((f) => f.who === i && f.quote).map((f) => f.id));
  const bag = (q: string) => new Set(q.toLowerCase().match(/[a-z']{4,}/g) ?? []);
  const alike = (a: string, b: string) => { const x = bag(a), y = bag(b); const inter = [...x].filter((w) => y.has(w)).length; return inter / Math.max(1, Math.min(x.size, y.size)) > 0.5; };
  const chosen: Fact[] = all.filter((f) => must.has(f.id));
  const byYear = new Map<number, number>();
  for (const f of [...all].sort((a, b) => b.weight - a.weight)) {
    if (chosen.length >= n) break;
    if (chosen.includes(f) || chosen.some((c) => alike(c.quote!, f.quote!))) continue;
    const y = Math.floor(f.k / 4); if ((byYear.get(y) ?? 0) >= 2) continue;
    byYear.set(y, (byYear.get(y) ?? 0) + 1); chosen.push(f);
  }
  return chosen.sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
}
/** their own words, in order: every line they said to themselves, with what they then did */
export const voiceOf = (r: R, i: number, k = played(r) - 1): Fact[] => lifeFacts(r, i, k).filter((f) => f.who === i && f.quote);

/** A person's story so far, as the moments that carry it, in order: the heaviest thing they did and the heaviest done to
 *  them, their turn if they turned, how their chief bonds and quarrels began and what came just before the worst of them,
 *  the loss of anyone they married, and their death. Chosen by code from the ledger; told in the ledger's own sentences. */
export function storyOf(r: R, i: number, k = played(r) - 1, n = 16): Fact[] {
  const life = lifeFacts(r, i, k).filter((f) => f.kind !== "evening" && f.kind !== "condition" && f.kind !== "reaction");
  const must = new Map<Fact, number>();
  const add = (f: Fact | undefined, p: number) => { if (f) must.set(f, Math.max(must.get(f) ?? 0, p)); };
  const byW = (fs: Fact[]) => [...fs].sort((a, b) => b.weight - a.weight);
  add(life.find((f) => f.who === i && f.kind === "death"), 100);
  add(life.find((f) => f.who === i && f.kind === "turned"), 90);
  for (const f of life.filter((f) => (f.kind === "grief" || f.kind === "death") && /whom \w+ had married|was widowed/.test(f.text) && f.names.includes(i))) add(f, 85);
  // the people who mattered most: how it began, the heaviest thing between them, and what came just before it
  for (const p of pairs(r, k).filter((q) => q.a === i || q.b === i).slice(0, 2)) {
    const fs = p.facts.filter((f) => f.deed && (f.who === i || f.whom === i)).sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
    const heavy = byW(fs)[0]; add(heavy, 80); add(fs[0], 60);
    const before = fs.filter((f) => f.k < (heavy?.k ?? 0)).at(-1); if (before && heavy && heavy.k - before.k <= 4) add(before, 75);
  }
  // every heavy harm between them and another, with the kindness that came before it between the same two: a betrayal is
  // only a betrayal beside what it betrayed, and a mercy before a killing is the turn of the story
  const perPair = new Map<number, number>(); const seenText = new Set<string>();
  for (const h of [...life].filter((f) => f.deed && f.tone === "harm" && f.weight >= 7 && f.whom != null && (f.who === i || f.whom === i)).sort((a, b) => b.weight - a.weight)) {
    const key = h.text.split(/(?<=\.)\s/)[0]; if (seenText.has(key)) continue; seenText.add(key); // the same blow again is one line, and one slot
    const o = h.who === i ? h.whom! * 2 : h.who * 2 + 1; if ((perPair.get(o) ?? 0) >= 2) continue; perPair.set(o, (perPair.get(o) ?? 0) + 1); // each way: // one long feud is three of its blows, not all of them
    add(h, 70 + h.weight);
    const other = h.who === i ? h.whom! : h.who;
    const kind = life.filter((f) => f.deed && f.tone === "help" && ((f.who === i && f.whom === other) || (f.who === other && f.whom === i)) && (f.k < h.k || (f.k === h.k && f.id < h.id))).sort((a, b) => b.k - a.k);
    add(kind.find((f) => f.who === h.whom), 68); // what the one harmed had done for the one who harmed them
    add(kind.find((f) => f.who === h.who), 66);  // and any mercy the one who harmed had shown first
  }
  // how each of their chief quarrels began: the first harm between the two, whichever way it ran
  for (const p of pairs(r, k).filter((q) => (q.a === i || q.b === i) && q.harm > 0).slice(0, 3)) add(p.facts.filter((f) => f.deed && f.tone === "harm").sort((a, b) => a.k - b.k || a.id.localeCompare(b.id))[0], 72);
  // what befell them that nobody chose for them: sickness, hunger, losing the roof
  for (const f of life.filter((f) => f.who === i && ["sick", "hungry", "homeless", "hurt"].includes(f.kind))) add(f, 50 + f.weight);
  // every weighty thing they did, and every weighty thing done to them: both sides of a person
  for (const f of life.filter((f) => f.deed && f.who === i && f.weight >= 7 && f.tone !== "harm")) add(f, 40 + f.weight);
  for (const f of life.filter((f) => f.deed && f.whom === i && f.who !== i && f.tone === "harm" && f.weight >= 5 && (perPair.get(f.who * 2 + 1) ?? 0) < 2)) add(f, 45 + f.weight); // what was done to them counts as much as what they did
  const chosen = [...must.entries()].filter(([f], x, xs) => !(f.kind === "death" && xs.some(([g]) => g !== f && g.k === f.k && g.deed && /\bdied\b/.test(g.text) && g.names.includes(f.who))) && !(f.kind === "grief" && xs.some(([g]) => g.kind === "death" && g.k === f.k && g.who === f.whom)));
  // the same deed again and again is one line
  const seen = new Map<string, Fact>(); const out: Fact[] = [];
  for (const [f] of chosen.sort((a, b) => b[1] - a[1])) { const key = f.text.split(/(?<=\.)\s/)[0]; if (seen.has(key)) continue; seen.set(key, f); out.push(f); if (out.length >= n) break; }
  return out.sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
}

// ---------- between people ----------
export interface Pair { a: number; b: number; facts: Fact[]; harm: number; help: number; weight: number }
/** Who hurt or saved whom: every pair of people with deeds between them, heaviest first. */
export function pairs(r: R, k = played(r) - 1): Pair[] {
  const m = new Map<string, Pair>();
  const add = (a0: number, b0: number, f: Fact) => { const a = Math.min(a0, b0), b = Math.max(a0, b0); const key = `${a}-${b}`;
    const p = m.get(key) ?? { a, b, facts: [], harm: 0, help: 0, weight: 0 }; m.set(key, p);
    if (p.facts.includes(f)) return; p.facts.push(f); p.weight += f.weight; if (f.tone === "harm" || f.kind === "death") p.harm += f.weight; else p.help += f.weight; };
  for (const f of ledger(r).slice(0, k + 1).flat()) {
    // a deed that killed somebody's wife or husband passes between the one who did it and the one left widowed, too
    if (f.deed && f.whom != null && /\bdied\b/.test(f.text)) { const sp = f.k > 0 ? r.frames?.[f.k - 1]?.partner?.[f.whom] : r.citizens[f.whom]?.startPartner; const j = sp ? idxOf(r, sp) : undefined; if (j != null && j >= 0 && j !== f.who) add(f.who, j, f); }
    if (!(f.deed || f.kind === "death" && f.whom != null) || f.whom == null || f.whom === f.who) continue;
    const a = Math.min(f.who, f.whom), b = Math.max(f.who, f.whom); const key = `${a}-${b}`;
    const p = m.get(key) ?? { a, b, facts: [], harm: 0, help: 0, weight: 0 }; m.set(key, p);
    p.facts.push(f); p.weight += f.weight;
    if (f.tone === "harm" || f.kind === "death") p.harm += f.weight; else p.help += f.weight;
  }
  return [...m.values()].sort((x, y) => y.weight - x.weight);
}

/** the people the town has lost, and how */
export const dead = (r: R, k = played(r) - 1) => r.citizens.map((c: any, i: number) => ({ i, c })).filter(({ c }: any) => c.diedAt != null && c.diedAt - 1 <= k);

/** A season, ranked: what a telling of it must not leave out, the four first. */
export function rankedSeason(r: R, k: number, n = 14): Fact[] {
  const fs = factsAt(r, k);
  return [...fs].sort((a, b) => b.weight - a.weight).slice(0, n).sort((a, b) => fs.indexOf(a) - fs.indexOf(b));
}


/** The weather of a season, as the house draws it (web/house.js weatherOf — keep the two the same): from its time of year
 *  and its hardship, with a fixed roll for the season. Winter snows most seasons, harder in a hard winter; spring and
 *  autumn rain some of the time; a hard winter leaves the odd flurry; a fire drops ash; summer is clear. */
export function weatherAt(r: R, k: number): string {
  const s = SEASON_NAMES[k % 4]; const e = (r.events ?? []).find((x: any) => x.seasons && k + 1 >= x.at && k + 1 < x.at + x.seasons)?.kind; const roll = (((k + 1) * 2654435761) >>> 0) % 100 / 100;
  if (e === "fire" && s !== "winter") return "ash falling from the fire";
  if (s === "winter") return roll < (e === "winter" ? 0.85 : 0.6) ? (e === "winter" ? "heavy snow" : "snow") : "cold and clear";
  if (e === "winter" && s !== "summer" && roll < 0.3) return "a few flakes of snow";
  if ((s === "autumn" && roll < 0.5) || (s === "spring" && roll < 0.35)) return "rain";
  return s === "summer" ? "clear and warm" : "clear";
}
