// How a decision and a person are shown wherever they come up — the front page, a person's page, the story — so a reader
// always gets the same thing: what they faced, what they could have done, what they chose, why, and what came of it.
// Shared by the server (the story page) and the browser (the front page).
import { sexOf, pro, regender } from "./pronoun.mjs";
import { esc, short, choiceTone } from "./draw.mjs";

const cap = (s) => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);
const toneOf = (o) => ((o?.harm || 0) >= 0.1 ? "harm" : (o?.help || 0) >= 0.2 ? "help" : "neutral");
const said = (x) => esc(x).replace(/“([^”]{2,400})”/g, "<em class=\"said\">“$1”</em>");

/** nobody's sex is recorded: the cast's own words are given in they and them, as the story gives everything */
export const neutral = (t) => String(t ?? ""); /* he and she as written: the record says which */
export const neutralOld = (t) => String(t ?? "").replace(/\b(he|she)\b/g, "they").replace(/\b(He|She)\b/g, "They").replace(/\bhim\b|\bher\b(?=\s*[.,;:!?]|$)/g, "them").replace(/\b(his|her|hers)\b/g, "their").replace(/\b(His|Her)\b/g, "Their").replace(/\bhimself\b|\bherself\b/g, "themselves").replace(/\b([Tt]hey) (is|was|has|does)\b/g, (m, y, v) => `${y} ${({ is: "are", was: "were", has: "have", does: "do" })[v]}`);
/** what came of it, said of them: the record tells it to the one who chose ("you walk the other way") */
const VERB = { are: "is", were: "was", do: "does", have: "has", go: "goes", catch: "catches", marry: "marries", carry: "carries", try: "tries", cry: "cries", pass: "passes", miss: "misses", reach: "reaches" };
export function thirdPerson(text, A, T, sex) {
  const P = pro(sex ? { sex } : A);
  let t = String(text ?? "").trim().replace(/\.$/, ""); if (!t) return "";
  t = t.replace(/^you both\b/i, T ? `${A} and ${T} both` : `${A} and the other both`).replace(/\byou both\b/gi, T ? `${A} and ${T} both` : "both");
  let first = true; let adv = false;
  // "you" after a preposition is not doing anything ("four people before you have said"): the name, and the verb left alone
  const OBJ = /\b(before|after|to|at|for|with|from|on|of|about|like|than|behind|beside|over|under|near|past|towards?|against|around|without|by|onto|into|upon)\s*$/i;
  const PAST = ["saw", "took", "went", "gave", "came", "found", "knew", "told", "thought", "felt", "got", "kept", "left", "made", "said", "ran", "sat", "stood", "heard", "brought", "bought", "caught", "lost", "won", "paid", "fed", "led", "met", "held", "meant", "sent", "spent", "built", "lent", "owe", "owed", "half", "a", "an", "the", "your", "their", "some", "too", "very", "much", "more", "less", "out", "in", "up", "down", "back", "away", "off", "again", "now", "here", "there", "alone", "first", "each", "every", "no", "not", "one", "two", "three", "all", "twice", "once", "so", "as", "if", "but", "what", "how", "why", "when", "where", "knew", "slept", "woke", "stole", "hid", "fell", "broke", "spoke", "swore"];
  t = t.replace(/\b([Yy]ou)\b(\s+)(\w+)/g, (m, y, sp, w, at, all) => { const who = A; first = false; const lw = w.toLowerCase();
    // "you" does something only at the start of a sentence or a clause; after any other word ("calls you soft") it is done to
    const pre = String(all).slice(0, at); const subject = /(^|[.!?;:—–(]\s*|,\s*|\b(and|but|or|so|then|when|if|while|because|that|as|until|though|although|once|unless|where|now|still|what|which|whether|how|why|whatever)\s+)$/i.test(pre);
    if (["never", "still", "also", "just", "only", "already", "barely", "hardly", "often", "always", "rarely", "really", "even"].includes(lw)) { adv = true; return `${who}${sp}${w}`; } /* "someone you barely know": an adverb means a verb follows, so this "you" is doing it */
    if (OBJ.test(pre) || !subject) return `${who}${sp}${w}`;
    if (["never", "still", "also", "just", "only", "already", "barely", "hardly", "often", "always", "rarely", "really", "even"].includes(lw)) { adv = true; return `${who}${sp}${w}`; }
    if (["both", "all", "and", "or", "who", "that", "did", "had", "was", "could", "would", "should", "will", "can", "must", "might", "may", "shall", ...PAST].includes(lw) || /ed$/.test(lw)) return `${who}${sp}${w}`;
    const v = VERB[lw] ?? (/(s|sh|ch|x|z)$/.test(lw) ? `${lw}es` : /[^aeiou]y$/.test(lw) ? `${lw.slice(0, -1)}ies` : /^[a-z]+$/.test(lw) && !/ed$|ing$/.test(lw) ? `${lw}s` : lw);
    return `${who}${sp}${v}`; });
  if (adv) t = t.replace(new RegExp(`\\b(${A})\\s+(never|still|also|just|only|already|barely|hardly|often|always|rarely|really|even)\\s+([a-z]+)\\b`, "g"), (m, who, a, v) => (["have", "do", "are", "go"].includes(v) ? `${who} ${a} ${({ have: "has", do: "does", are: "is", go: "goes" })[v]}` : /(ed|s)$/.test(v) || ["could", "would", "should", "will", "can", "must", "might", "may", "did", "had", "was"].includes(v) ? m : `${who} ${a} ${/(s|sh|ch|x|z)$/.test(v) ? `${v}es` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : `${v}s`}`));
  t = t.split(/(?<=[.!?;])\s+/).map((s) => (new RegExp(`\\b${A}\\b`).test(s) ? s : s.replace(/\byou\b/, A))).join(" ");
  t = t.replace(/\byourself\b/g, P.himself).replace(/\byou\b/g, P.him).replace(/\byour\b/g, P.his).replace(/\bYour\b/g, P.His);
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]["”]$/.test(t) ? "" : ".");
}
/** only the narration is changed, never what someone says: words inside quotation marks are left exactly as spoken */
export function outsideQuotes(text, f) {
  return String(text ?? "").split(/(“[^”]*”|"[^"]*")/).map((part, i) => { if (i % 2) return part; const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(part); return `${m[1]}${m[2] ? f(m[2]) : ""}${m[3]}`; }).join("");
}
const firstSentences = (t, n) => { const s = String(t ?? "").split(/(?<=[.!?])\s+/); return { head: s.slice(0, n).join(" "), rest: s.slice(n).join(" ") }; };
/** where a decision was one of the classic experiments in disguise: which, what people did in the original study, and
 *  whether this choice is what the study counts. One builder, so the story's hover card and the findings never disagree.
 *  The prose never names a study; only this row does. */
export const expSlug = (name) => `x-${String(name).toLowerCase().replace(/[^a-z]+/g, "-")}`;
export function labCounts(a) { const ex = a?.experiment; if (!ex) return null; return (ex.effect || []).includes(a.option) ? ex.effectLabel || "what the study counts" : (ex.effectB || []).includes(a.option) ? ex.effectLabelB || "what the study counts" : ""; }
export function labRow(a, who) {
  const ex = a?.experiment; if (!ex?.name) return "";
  const eff = labCounts(a); const study = String(ex.study || "").split(";")[0].trim();
  return `<div class="dc-r lab"><span class="dc-l">In the lab</span><div class="dc-v"><p><b>${esc(ex.name)}</b>${a.condition?.label ? `, ${esc(a.condition.label)}` : ""}${study ? ` <small>(${esc(study)})</small>` : ""}.${ex.baseline ? ` In the original study, ${esc(String(ex.baseline).replace(/\.$/, ""))}.` : ""} ${esc(who)} ${eff ? `did what the study counts: <b>${esc(eff)}</b>.` : "did not do what the study counts."} <a href="/history#${expSlug(ex.name)}">How the AI does in every town &rarr;</a></p></div></div>`;
}
/** a decision, whole and easy to read: the situation, the choices with the one taken ticked, why in their own words, and
 *  what came of it — each on its own labelled row */
export function decisionBody(a, people) {
  const nm = (i) => short(people[i]?.name ?? ""); const A = nm(a.c), T = a.target != null && a.target !== a.c ? nm(a.target) : "";
  const choices = (a.options || []).map((o) => `<span class="ch t-${toneOf(o)}${o.id === a.option ? " took" : ""}">${o.id === a.option ? "&#10003; " : ""}${esc(o.label)}</span>`).join("");
  const th = firstSentences(a.thought, 2);
  const row = (label, body) => `<div class="dc-r"><span class="dc-l">${label}</span><div class="dc-v">${body}</div></div>`;
  return `<div class="dc">
    ${a.situation ? row("Situation", `<p>${esc(a.situation)}</p>`) : ""}
    ${choices ? row("Choices", `<div class="dc-ch">${choices}</div>`) : ""}
    ${a.thought || (a.because || []).length ? row("Why", `${a.thought ? `<p class="dc-q">“${esc(th.head)}${th.rest ? `<span class="dc-rest"> ${esc(th.rest)}</span>` : ""}”</p>` : ""}${(a.because || []).length ? `<p class="dc-w">What decided it: ${a.because.map((b) => esc(b)).join(" · ")}</p>` : ""}`) : ""}
    ${a.outcome ? row("Result", `<p class="dc-o">${esc(thirdPerson(a.outcome, A, T, sexOf(people[a.c])))}</p>`) : ""}
    ${labRow(a, A)}
  </div>`;
}
/** what someone does in this town: the job the town gave them, or their trade when it gave them none — the same word the
 *  story uses, so a card never says "moneylender" of someone the story has working as the station doctor */
export const workOf = (c, jobs = []) => (c?.job && jobs.find((j) => j.id === c.job)?.name) || c?.role || "";
/** a person, in brief: who they are and what they are after */
export function personBody(c, jobs = []) {
  return `<b>${esc(c.name)}</b><span>${esc(workOf(c, jobs))}${c.age ? `, ${c.age}` : ""}</span>${c.trait ? `<span class="trait">${esc(c.trait.name)}</span>` : ""}${c.want ? `<span>Wants ${esc(neutral(c.want))}.</span>` : ""}${c.fear ? `<span>Fears ${esc(neutral(c.fear))}.</span>` : ""}`;
}

/** The story's own sentences, as the page shows them: a sentence that tells a decision opens it on hover, and every one
 *  of the four named in it opens who they are and links to them. `lines` are the checked sentences with the fact ids
 *  they stand on ("season.act" for an act, "…#q" for its thought). */
export function storyHtml(lines, r, { personHref, faceOf, anchor = true } = {}) {
  const people = r.citizens ?? r.people ?? [];
  const names = people.map((c, i) => ({ i, first: short(c.name) })).filter((x) => x.first && (people[x.i].named ?? true));
  const actOf = (id) => { const m = /^(\d+)\.(\d+)$/.exec(String(id).split("#")[0]); if (!m) return null; const a = r.acts?.[+m[1]]?.[+m[2]]; return a && a.dilemma && a.options?.length ? { k: +m[1], j: +m[2], a } : null; };
  // each of the four linked once, where they are first named in the sentence; found in the text before anything is inserted
  const withNames = (html) => { const hits = [];
    for (const x of names) { const m = new RegExp(`\\b${x.first}\\b`).exec(html); if (m && !hits.some((h) => m.index < h.end && m.index + x.first.length > h.start)) hits.push({ start: m.index, end: m.index + x.first.length, x }); }
    let out = html; for (const h of hits.sort((a, b) => b.start - a.start)) out = `${out.slice(0, h.start)}<a class="pn" href="${personHref ? personHref(people[h.x.i]) : "#"}">${h.x.first}<span class="hc hp">${faceOf ? faceOf(h.x.i) : ""}${personBody(people[h.x.i], r.scenario?.jobs ?? r.jobs ?? [])}</span></a>${out.slice(h.end)}`;
    return out; };
  const anchored = new Set();
  return (lines || []).map((para) => `<div class="para">${para.map((l) => {
    const act = (l.c || []).map(actOf).find(Boolean);
    const died = (l.c || []).map((id) => { const m = /^(\d+)\.(\d+)$/.exec(String(id)); const a = m ? r.acts?.[+m[1]]?.[+m[2]] : null; return a && a.kind === "death" ? { k: +m[1], a } : null; }).find(Boolean);
    if (died && !act) return `<span class="dl-death" tabindex="0">&#10013; ${withNames(said(regender(l.t, people)))}<span class="hc hd"><small>${esc(r.tickLabels?.[died.k] ?? "")}</small><p class="dc-o">${esc(people[died.a.c]?.name ?? "")} ${esc(String(died.a.text || "died").replace(/^dies/, "died"))}.</p></span></span>`;
    const text = withNames(said(regender(l.t, people)));
    // the situation a choice came out of, set in where the telling left it out: a line of scene, in the record's own words
    if (l.s) return `<span class="sit">${text}</span>`;
    const aid = anchor && act && !anchored.has(`${act.k}-${act.j}`) ? (anchored.add(`${act.k}-${act.j}`), ` id="d-${act.k}-${act.j}"`) : "";
    return act ? `<span class="hv t-${choiceTone(act.a) === "kill" ? "harm" : choiceTone(act.a)}"${aid} tabindex="0">${text}<span class="hc hd"><small>${esc(r.tickLabels?.[act.k] ?? "")}${act.a.place ? ` · ${esc(act.a.place)}` : ""}</small>${decisionBody(act.a, people)}</span></span>` : text;
  }).join(" ")}</div>`).join("");
}

/** A situation is written as it stood, in the present ("The council orders Nell's ration docked. The clerk has left the
 *  book"); set into a chapter it must read in the chapter's past. This turns the short, plain sentences the record uses
 *  into the past: the common verbs by name, the rest by rule where the one doing it is plain. */
const PAST_IRR = { is: "was", are: "were", "isn't": "wasn't", "aren't": "weren't", has: "had", have: "had", "hasn't": "hadn't", "haven't": "hadn't", does: "did", "doesn't": "didn't", "don't": "didn't",
  can: "could", "can't": "couldn't", cannot: "could not", will: "would", "won't": "wouldn't", "'ll": "'d", may: "might", shall: "should",
  says: "said", goes: "went", comes: "came", gives: "gave", takes: "took", sees: "saw", knows: "knew", leaves: "left", finds: "found", brings: "brought", keeps: "kept", holds: "held", sits: "sat", stands: "stood", runs: "ran", falls: "fell", gets: "got", makes: "made", tells: "told", thinks: "thought", feels: "felt", sleeps: "slept", wakes: "woke", lies: "lay", begins: "began", buys: "bought", sells: "sold", pays: "paid", lends: "lent", owes: "owed", means: "meant", sends: "sent", spends: "spent", builds: "built", catches: "caught", teaches: "taught", fights: "fought", hears: "heard", loses: "lost", wins: "won", drinks: "drank", eats: "ate", speaks: "spoke", lets: "let", puts: "put", cuts: "cut", sets: "set", hits: "hit", hurts: "hurt", reads: "read", shuts: "shut", grows: "grew", throws: "threw", draws: "drew", rides: "rode", writes: "wrote", breaks: "broke", steals: "stole", hides: "hid", shakes: "shook", swears: "swore", wears: "wore", tears: "tore", bears: "bore", leads: "led", feeds: "fed", meets: "met", bleeds: "bled", spreads: "spread", rises: "rose", becomes: "became", forgets: "forgot", understands: "understood", stinks: "stank", sinks: "sank", sings: "sang", rings: "rang", swims: "swam", flies: "flew", freezes: "froze", chooses: "chose", seeks: "sought", sweeps: "swept", creeps: "crept", weeps: "wept", breeds: "bred", sweats: "sweated", shoots: "shot", bites: "bit", hangs: "hung", strikes: "struck", sticks: "stuck", swings: "swung", digs: "dug", spins: "spun" };
const BASE_IRR = { come: "came", go: "went", take: "took", see: "saw", know: "knew", say: "said", give: "gave", find: "found", bring: "brought", keep: "kept", hold: "held", stand: "stood", run: "ran", fall: "fell", get: "got", make: "made", tell: "told", think: "thought", feel: "felt", sleep: "slept", begin: "began", pay: "paid", owe: "owed", mean: "meant", send: "sent", hear: "heard", lose: "lost", eat: "ate", drink: "drank", speak: "spoke", leave: "left", grow: "grew", become: "became", choose: "chose", rise: "rose" };
const BASE_REG = new Set(["turn", "look", "watch", "talk", "want", "need", "walk", "ask", "wait", "laugh", "call", "work", "stay", "pull", "push", "help", "count", "start", "stop", "share", "argue", "shout", "whisper", "point", "stare", "cough", "listen", "agree", "refuse", "blame", "claim", "decide", "expect", "hope", "live", "move", "open", "close", "carry", "try", "cry", "die", "line", "queue", "crowd", "gather", "notice", "believe", "remember", "offer", "promise", "follow", "hand", "sign", "vote", "trust", "fear", "hate", "love", "like", "mutter", "grumble"]);
const NOT_VERB = new Set(["this", "his", "hers", "its", "yours", "ours", "theirs", "as", "was", "is", "us", "yes", "less", "unless", "news", "always", "sometimes", "perhaps", "towards", "across", "whereas", "thus", "plus", "status", "series", "species", "lens", "bus", "gas", "thanks", "means", "ways", "days", "weeks", "years", "months", "hours", "nights", "others", "things", "people", "children", "hands", "eyes", "words", "stores", "rations", "sacks", "coins", "debts", "papers", "rules", "shifts", "pumps", "boats", "rooms", "doors", "walls"]);
const SUBJ = /^(?:he|she|it|who|which|that|nobody|somebody|someone|everyone|anyone|no one|one|everybody|anybody|each)$/i;
const dbl = (b) => (b.length <= 4 && /[^aeiou][aeiou][bdgklmnprt]$/.test(b) ? b + b.slice(-1) : b); /* drop -> dropped, nod -> nodded */
const toPast = (w) => /^[a-z]{2,4}s$/.test(w) && /[^aeiou][aeiou][bdgklmnprt]s$/.test(w) ? `${dbl(w.slice(0, -1))}ed` : /ies$/.test(w) ? w.replace(/ies$/, "ied") : /(ss|sh|ch|x|z|o)es$/.test(w) ? w.replace(/es$/, "ed") : /es$/.test(w) && /e$/.test(w.slice(0, -1)) ? w.replace(/s$/, "d") : /e?s$/.test(w) ? (w.slice(0, -1).endsWith("e") ? w.slice(0, -1) + "d" : w.slice(0, -1) + "ed") : w;
const baseToPast = (w) => BASE_IRR[w] ?? (w.endsWith("e") ? `${w}d` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ied` : `${dbl(w)}ed`);
const AGENT = /^(council|clerk|foreman|captain|constable|watch|landlord|priest|guard|guards|doctor|stranger|lender|trader|master|keeper|officer|officers|man|woman|boy|girl|child|family|neighbour|town|crowd|queue|line|well|store|fever|sickness|water|river|sea|storm|frost|cold|wind|rain|snow|ice|flood|fire|harvest|price|cost|note|letter|order|word|talk|rumour|list|book|door|light|lamp|tunnel|shaft|boat|cart|ship|train|bell|horn|shift|work|pay|debt|share|sack|purse|supply|pump|engine|air|food|bread|grain|meat|money|coin|house|roof|room|bed|one|other|lot|side|mother|father|son|daughter|brother|sister|husband|wife|baby|voice|hand|face|eye|dog|horse|herd|flock)$/i;
export function pastTense(text, names = []) {
  const isName = (w) => names.includes(w);
  const keep = (orig, next) => (orig[0] === orig[0].toUpperCase() ? next.charAt(0).toUpperCase() + next.slice(1) : next);
  const out = []; const toks = String(text ?? "").split(/(\s+|[.,;:!?—–()“”"])/);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]; if (!/^[A-Za-z']+$/.test(t)) { out.push(t); continue; }
    const lw = t.toLowerCase(); const prevWords = out.filter((x) => /^[A-Za-z']+$/.test(x)); const prev = prevWords[prevWords.length - 1] ?? ""; const prev2 = prevWords[prevWords.length - 2] ?? "";
    const startOfSentence = !prevWords.length || /[.!?]\s*$/.test(out.slice(out.lastIndexOf(prev)).join(""));
    if (lw === "now" && startOfSentence) { out.push(keep(t, "then")); continue; }
    if (lw === "this" && /^\s*$/.test(toks[i + 1] ?? "") && /^(dry |wet |hard |cold |long )?(spring|summer|autumn|winter|year|season|week|morning|evening|night)\b/i.test(toks.slice(i + 2, i + 5).join(""))) { out.push(keep(t, "that")); continue; }
    if (/^[A-Z]/.test(t) && !PAST_IRR[lw]) { out.push(t); continue; } /* a name, or a word opening a sentence: never a verb here */
    if (PAST_IRR[lw] && !(lw === "can" && /^(a|the|tin)$/i.test(prev)) && !(lw === "will" && /^(a|the|his|her|their|free)$/i.test(prev))) { out.push(keep(t, PAST_IRR[lw])); continue; }
    // a name or he/she/who/the council doing it: "the council orders" -> "ordered"
    const named = !!prev && (isName(prev) || (!names.length && /^[A-Z]/.test(prev) && !/^(The|A|An|At|In|On|But|And|If|When|Then|So|Your|Their|His|Her|Its|Nobody|Winter|Summer|Spring|Autumn)$/.test(prev)));
    const theNoun = /^(the|a|an|your|their|his|her|its|every|each|no|one|this|that)$/i.test(prev2) && AGENT.test(prev);
    if (/[a-z]s$/.test(lw) && !NOT_VERB.has(lw) && lw.length > 3 && (named || SUBJ.test(prev) || theNoun)) { out.push(keep(t, toPast(lw))); continue; }
    // they / people / both doing it: "they turn" -> "turned"
    const plural = /^(they|people|both|all|others|we|you|men|women|children|families|neighbours)$/i.test(prev) || (/^[a-z]+s$/.test(prev) && /^(the|your|their|his|her|its|some|all|both|two|three|four)$/i.test(prev2));
    if (plural && (BASE_IRR[lw] || BASE_REG.has(lw))) { out.push(keep(t, baseToPast(lw))); continue; }
    out.push(t);
  }
  return out.join("");
}
