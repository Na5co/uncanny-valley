// The series. A run is a series, a season an episode, a decision a scene — and a scene is shot like one: the slate,
// the situation, the choice held open, the voice in their head, what happened, what it did to everyone else, and why.
// Each scene plays once as it comes on screen; the page scrolls like any page, and nothing changes under the reader.
import { pro } from "./pronoun.mjs";
import { esc } from "./draw.mjs";
import { reader, words, cap, plural } from "./story.mjs";
import { px, hydrate, paint } from "./pixel.mjs";
import { townPanel } from "./house.js";
import { storyHtml, decisionBody, workOf, thirdPerson, neutral } from "./tell.mjs";

const L = window.LIVE; if (!L) throw new Error("no LIVE data");
// the pages are drawn ahead and kept: one stored page serves every episode and one every person, so which is read off the address
{ const m = location.pathname.match(/\/ep\/(\d+)$/); if (m && L.page === "episode") L.ep = +m[1]; const c = location.pathname.match(/\/p\/([^/]+)$/); if (c && L.page === "cast") L.focus = decodeURIComponent(c[1]); }
const R = reader(L); const { P, nm, named, FOUR, labelOf, yearOf, seasonOf, toneOf, tgt, killsOf, rest, said, chosen } = R;
const $ = (s, el = document) => el.querySelector(s);
let clockOff = L.serverNow ? L.serverNow - Date.now() : 0; const now = () => Date.now() + clockOff;
/** how long is left, said the way a person would: "about 10 hours", "about 40 minutes" */
const hoursLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 90 ? `about ${Math.round(m / 60)} hours` : m >= 45 ? "about an hour" : `about ${Math.max(1, Math.round(m / 5) * 5)} minutes`; };
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const BASE = L.base || ""; // "" live, "/run/N" for a finished run
const epHref = (n) => `${BASE}/ep/${n}`; const castHref = (i) => `${BASE}/p/${P[i].id}`;
const INK = { harm: "red", kill: "red", help: "green", gold: "gold", death: "grey", neutral: "none" };
const moodFor = (i, t) => t === "death" ? "dead" : t === "harm" || t === "kill" ? "angry" : "calm";
const slug = (a, k) => `${String(a.place || "The town").replace(/^The /, "").toUpperCase()} — ${seasonOf(k).toUpperCase()}, YEAR ${yearOf(k)}`;
const seenLine = (a) => a.seen == null ? "" : a.seen === 0 ? "Nobody is watching." : a.seen === 1 ? "One other person is there." : `${cap(words(a.seen))} people are watching.`;
const root = $("#film");

// ---------------------------------------------------------------- a decision, told: who did what, in their words, what came of it
const xpTag = (ex) => ex ? `<span class="xp" tabindex="0">${esc(ex.name)}<span class="pop"><b>${esc(ex.name)}</b><em>${esc(ex.study || "")}</em>${ex.baseline ? `<span>In the original: ${esc(ex.baseline)}</span>` : ""}</span></span>` : "";
const faceLink = (i, o = {}) => `<a class="fl${o.dies ? " dies" : ""}" href="${castHref(i)}" data-who="${esc(P[i].id)}" title="${esc(P[i].name)}">${px(i, { res: 48, cls: o.flip ? "flip" : "", mood: o.mood || "calm", ink: o.ink || "none" })}</a>`;
function decHtml(it, opts = {}) {
  const { k, j, a } = it; const t = toneOf(a); const A = a.c, T = tgt(a); const killed = killsOf(a);
  const dies = a.kind === "death" ? A : killed[0] ?? (R.deathAfter(k, j, A) ? A : null);
  const big = a.kind !== "choice" && (R.weight(a) >= 5 || !a.dilemma) || opts.full;
  const when = `${esc(labelOf(k))}${a.place ? ` &middot; ${esc(a.place)}` : ""}${a.dilemma && a.seen != null ? ` &middot; ${a.seen === 0 ? "nobody watching" : a.seen === 1 ? "one other there" : `${words(a.seen)} watching`}` : ""}`;
  const faces = `<div class="fc">${faceLink(A, { dies: dies === A, mood: a.kind === "death" ? "dead" : a.kind === "turned" ? "angry" : "calm" })}${T != null ? `<i class="to"></i>${faceLink(T, { flip: true, dies: dies === T })}` : a.kind === "marry" && a.target != null ? `<i class="to gold"></i>${faceLink(a.target, { flip: true })}` : ""}</div>`;
  const head = `<h3><a href="${castHref(A)}" data-who="${esc(P[A].id)}">${esc(nm(A))}</a>${named(A) ? "" : ` <small class="side">side</small>`} ${esc(rest(a))}${a.kind === "turned" ? ": harm now outweighs kindness in them" : ""}.</h3>`;
  if (!a.dilemma) {
    let sub = ""; const fr = R.frameAt(k);
    if (a.kind === "death") { const mourn = P.map((_, i) => i).filter((i) => i !== A && !R.deathOf(i, { k, j }) && (fr?.ties?.[i]?.[P[A].id] ?? 0) >= 0.4); sub = mourn.length ? `Mourned by ${mourn.slice(0, 4).map(nm).join(", ")}.` : "Nobody close is left to mourn them."; }
    if (a.kind === "marry") sub = "Whatever is coming, they will meet it together.";
    return `<article class="dec ev t-${t}" id="s${k}-${j}" data-dz="${a.kind === "death" ? A : ""}"><p class="dw">${when}</p><div class="db">${faces}<div class="dt">${head}${sub ? `<p class="sit">${esc(sub)}</p>` : ""}</div></div></article>`;
  }
  const other = (a.options || []).filter((o) => o.id !== a.option);
  const after = big ? R.aftermath(k, j, a) : [];
  let notes = "";
  if (big) {
    const ps = R.why(a, k); const past = T != null ? R.pairPast(k, j, A, T) : []; const came = R.cameOf(k, j, a, R.upto(now()));
    const g = past.filter((x) => x.t === "help").length, h = past.filter((x) => x.t === "harm" || x.t === "kill").length; const lastKind = [...past].reverse().find((x) => x.t === "help");
    const turn = (t === "harm" || t === "kill") && g >= 3 && h * 3 <= g;
    notes = `<div class="nt">${turn ? `<p class="turn">After ${plural(g, "kindness", "kindnesses")} between them.</p>` : ""}
      ${ps.length ? `<p class="why"><span class="k">Why</span>${ps.map((p) => `<span class="xp w" tabindex="0">${esc(p.name)}<span class="pop"><b>${esc(p.name)}</b><em>${esc(p.cite)}</em><span>${esc(p.how)}</span></span></span>`).join("")}</p>` : ""}
      ${T != null && past.length ? `<p class="past"><span class="k">Before this</span><span class="dots">${past.map((x) => `<i class="t-${x.t}" title="${esc(labelOf(x.k))}: ${esc(said(x.a))}"></i>`).join("")}</span>${g ? plural(g, "kindness", "kindnesses") : "no kindness"}, ${h ? plural(h, "harm") : "no harm"} between them.${lastKind ? ` The last kindness: <a href="#s${lastKind.k}-${lastKind.j}" data-go="s${lastKind.k}-${lastKind.j}">${esc(said(lastKind.a))}</a>.` : ""}</p>` : ""}
      ${came ? `<p class="came"><span class="k">What came of it</span><a href="#s${came.k}-${came.j}" data-go="s${came.k}-${came.j}">${esc(labelOf(came.k))}: ${esc(said(came.a))} &rarr;</a></p>` : ""}</div>`;
  }
  return `<article class="dec t-${t}${big ? " big" : ""}" id="s${k}-${j}" data-dz="${dies ?? ""}"><p class="dw">${when}${xpTag(a.experiment)}</p>
    <div class="db">${faces}<div class="dt">${head}
      ${a.situation ? `<p class="sit">${esc(a.situation)}</p>` : ""}
      ${a.thought ? `<blockquote>&ldquo;${esc(a.thought)}&rdquo;</blockquote>` : ""}
      ${a.outcome ? `<p class="oc">${esc(cap(String(a.outcome).replace(/\.$/, "")))}.</p>` : ""}
      ${other.length ? `<p class="alt">Could have: ${other.map((o) => `<span class="o-${(o.harm || 0) >= 0.1 ? "harm" : (o.help || 0) >= 0.2 ? "help" : "neutral"}">${esc(o.label)}</span>`).join(" &middot; ")}</p>` : ""}
      ${after.length ? `<div class="rips">${after.map((r) => `<span class="rip t-${r.t}">${r.i != null ? px(r.i, { res: 36, mood: r.t === "death" ? "dead" : "calm", ink: r.t === "death" ? "none" : INK[r.t] || "none" }) : ""}${r.i != null ? `<b>${esc(nm(r.i))}</b> ` : ""}${esc(r.line)}</span>`).join("")}</div>` : ""}
      ${notes}</div></div></article>`;
}
// a death plays once, when it is on screen: the face loses its pixels
const seenOnce = new WeakSet();
const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) play(e.target); }, { threshold: 0.5 }) : null;
function play(el) {
  if (seenOnce.has(el)) return; seenOnce.add(el); const i = el.dataset.dz; if (!i) return; const cv = el.querySelector(".fl.dies canvas"); if (!cv) return;
  const t0 = performance.now() + 700; const D = 2400;
  const step = (tt) => { const q = Math.min(1, Math.max(0, (tt - t0) / D)); paint(cv, P[+i], { res: Math.round(48 - q * 42), mood: q > 0.4 ? "dead" : "calm", fade: q * 0.6 }); if (q < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function watchDecs() { for (const el of document.querySelectorAll(".dec[data-dz]:not([data-dz=''])")) { if (io) io.observe(el); else play(el); } }

// ---------------------------------------------------------------- what counts as happening in town
/** the season's notable moments, newest first: every decision the four made, and anybody else's that hurt, helped or ended someone */
function notable(k, u, who) {
  const out = []; R.acts(k).forEach((a, j) => { if (!R.shown(k, j, u) || R.isQuiet(a) || (a.kind === "death" && R.causeOf(k, j) != null)) return;
    if (who != null) { if (a.c === who || (!a.dilemma && R.involves(a, who))) out.push({ k, j, a }); return; }
    if (named(a.c) || R.involvesFour(a) || R.weight(a) >= 5 || !a.dilemma) out.push({ k, j, a }); });
  return out.reverse();
}
/** what is still to come this season: who, where, the situation they are about to be in — never the roads, never the answer */
function upcoming(k, u, who) {
  if (L.ended || L.final || k !== L.tick - 1) return [];
  const out = []; R.acts(k).forEach((a, j) => { if (j <= u.j || !a.dilemma || R.isQuiet(a)) return; if (who != null ? a.c !== who : !(named(a.c) || R.involvesFour(a) || R.weight(a) >= 5)) return; out.push({ k, j, a, at: R.dueAt(L.tick, j) }); });
  return out;
}
function upHtml(x) {
  const { a } = x; const A = a.c, T = tgt(a);
  return `<article class="up"><p class="dw"><span class="cd">in <b data-cd="${x.at}">${mmss(x.at - now())}</b></span>${a.place ? ` &middot; ${esc(a.place)}` : ""}${a.experiment ? ` &middot; ${esc(a.experiment.name)}` : ""}</p>
    <div class="db"><div class="fc">${faceLink(A)}${T != null ? `<i class="to"></i>${faceLink(T, { flip: true })}` : ""}</div><div class="dt"><h3><a href="${castHref(A)}" data-who="${esc(P[A].id)}">${esc(nm(A))}</a>${named(A) ? "" : ` <small class="side">side</small>`}${T != null ? ` and ${esc(nm(T))}` : ""}</h3>${a.situation ? `<p class="sit">${esc(a.situation)}</p>` : ""}</div></div></article>`;
}
function yearLines(u, uptoK, desc) {
  const rows = []; const lastY = yearOf(uptoK);
  for (let y = 1; y <= lastY; y++) {
    const items = []; for (let k = 4 * y - 4; k <= Math.min(4 * y - 1, uptoK); k++) R.acts(k).forEach((a, j) => { if (!R.shown(k, j, u) || R.isQuiet(a) || (a.kind === "death" && R.causeOf(k, j) != null) || !R.involvesFour(a)) return; items.push({ k, j, a, w: R.weight(a) }); });
    const must = items.filter((x) => (["death", "marry", "turned"].includes(x.a.kind) && named(x.a.c)) || killsOf(x.a).some(named) || (x.a.kind === "sacrifice" && named(x.a.c)));
    const more = items.filter((x) => !must.includes(x) && x.w >= 5).sort((p, q) => q.w - p.w).slice(0, Math.max(0, 2 - must.length));
    const pick = [...must, ...more].sort((p, q) => p.k - q.k || p.j - q.j).slice(0, 4);
    const eps = (L.events || []).filter((e) => e.seasons && yearOf(e.at - 1) === y && e.at - 1 <= uptoK);
    const line = (x) => { const d = killsOf(x.a).filter(named).map((i) => ` ${nm(i)} died of it.`).join("") + (R.deathAfter(x.k, x.j, x.a.c) ? ` ${nm(x.a.c)} did not come out.` : ""); return `<a class="sfl t-${toneOf(x.a)}" href="${epHref(x.k + 1)}#s${x.k}-${x.j}">${px(x.a.c, { res: 36, mood: x.a.kind === "death" ? "dead" : "calm" })}<span>${esc(said(x.a))}.${esc(d)}</span></a>`; };
    rows.push(`<li class="sfy"><p class="y"><b>Year ${y}</b>${eps.map((e) => `<span class="ept e-${esc(e.kind)}" title="${esc(e.headline)}">${esc(e.kind)}</span>`).join("")}</p><div class="sfs">${pick.length ? pick.map(line).join("") : `<p class="quiet">A quiet year for the four.</p>`}</div></li>`);
  }
  return `<ol class="sfl-list">${(desc ? rows.reverse() : rows).join("")}</ol>`;
}

// ---------------------------------------------------------------- two panes under the house
// left, the whole story in short: each year a line or two of its chapter and its notable decisions, coloured; right, the
// four's latest decisions as they come out, newest first, with what each told themselves
const TONE_WORD = { harm: "a harm", kill: "a killing", help: "a kindness", neutral: "neither harm nor help", gold: "", death: "a death" };
/** a decision card with everything in it: who, when and where, what they faced, the options with the one they took, what
 *  they told themselves, what decided it, what came of it. Folded to its headline when `folded`. */
function fullCard(x, folded = false) {
  const t = toneOf(x.a); const head = `<span class="fc-h">${px(x.a.c, { res: 36, mood: moodFor(x.a.c, t) })}<span><small>${esc(labelOf(x.k))}${x.a.place ? ` &middot; ${esc(x.a.place)}` : ""}${TONE_WORD[t] ? ` &middot; <em>${TONE_WORD[t]}</em>` : ""}</small><b>${esc(said(x.a))}.</b></span></span>`;
  return folded ? `<details class="fcard t-${t}"><summary>${head}</summary><div class="fc-b">${decisionBody(x.a, P)}</div></details>` : `<article class="fcard t-${t}" id="s${x.k}-${x.j}">${head}<div class="fc-b">${decisionBody(x.a, P)}</div></article>`;
}
function panes(k, u, live, n, end) {
  // the town's story as it has been written, in order and whole, a sentence that tells a decision opening it on hover;
  // then what has happened since the last year was written, as full decisions, so the story is never behind the town
  const told = (L.told || []).filter((c) => c.text); const RR = { citizens: P, acts: L.acts, tickLabels: L.tickLabels, jobs: L.jobs || [] };
  const tell = (lines, text) => lines?.length ? storyHtml(lines, RR, { personHref: (p) => `${BASE}/p/${p.id}`, faceOf: (i) => px(i, { res: 36 }) }) : String(text || "").split(/\n+/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("");
  const opening = (L.openingLines || []).length || L.opening ? `<article class="ys"><header><b>Prologue</b><span>${esc(L.title || "")}</span></header><div class="novel">${tell(L.openingLines, L.opening)}</div></article>` : "";
  const years = told.map((c) => { const e = (L.events || []).find((ev) => ev.at - 1 >= 4 * (c.n - 1) && ev.at - 1 < 4 * (c.n - 1) + 4);
    const title = c.title || ""; /* already the chapter's own title or its hardship's, never one used before */
    return `<article class="ys"><header><b>Chapter ${c.n}</b>${title ? `<span>${esc(title)}</span>` : ""}<small>Year ${c.n}</small>${c.live ? `<i>so far</i>` : ""}</header><div class="novel">${tell(c.lines, c.text)}</div></article>`; }).join("");
  // since the story was last written: the four's decisions from the first season it has not reached
  const upto = told.length ? Math.max(...told.map((c) => (c.to ?? (c.n * 4 - 1)))) : -1; const since = [];
  // and, at the start of each of those seasons, what the world did that nobody chose
  for (let kk = upto + 1; kk <= k; kk++) { const t = L.turns?.[kk + 1]; if (t?.headline) since.push({ k: kk, turn: t });
    R.acts(kk).forEach((a, j) => { if (R.shown(kk, j, u) && a.dilemma && named(a.c) && !R.isQuiet(a)) since.push({ k: kk, j, a }); }); }
  const turnCard = (x) => `<div class="evcard t-world"><span class="ev-mark">!</span><div><small>${esc(labelOf(x.k))} &middot; in town</small><b>${esc(x.turn.headline)}</b><p>${esc(x.turn.text)}</p></div></div>`;
  const nx = live ? `<p class="nx"><i class="pulse"></i>${n ? `Next decision${n.a.place ? `, at ${esc(n.a.place)},` : ""} in <b data-cd="${n.at}">${mmss(n.at - now())}</b>` : `Next season in <b data-cd="${end}">${mmss(end - now())}</b>`}</p>` : "";
  const epilogue = (L.epilogueLines || []).length ? `<article class="ys"><header><b>Epilogue</b><span>What became of them</span></header><div class="novel">${storyHtml(L.epilogueLines, RR, { personHref: (p) => `${BASE}/p/${p.id}`, faceOf: (i) => px(i, { res: 36 }), anchor: false })}</div></article><p class="the-end-s">The End</p>` : "";
  return `<section class="story-now"><h2 class="ph">The story so far</h2><p class="story-key"><span class="t-harm"><i></i>a harm</span><span class="t-help"><i></i>a kindness</span><span class="t-neutral"><i></i>neither</span><span>&middot; hover a marked line for the decision, a name for the person</span></p>${opening}${years}${epilogue}
    ${since.length ? `<article class="ys since"><header><b>Since then</b><span>not yet written into the story</span></header>${since.slice().reverse().map((x) => x.turn ? turnCard(x) : fullCard(x)).join("")}</article>` : ""}${nx}
    <p class="more"><a href="${BASE ? BASE + "/story" : "/story"}">The whole story on its own page &rarr;</a></p></section>`;
}

// ---------------------------------------------------------------- the four, each on their own screen
// what they are doing right now, how they are, the last thing they decided; the dead fall where they stood and stay down.
// A little life on each: they breathe, slower and lower when they are low, and shiver when they are unwell; a screen goes
// on air when its person has just decided something.
const DOING = { work: "working", home: "at home", tavern: "at the tavern", chapel: "at the chapel", square: "out in the square" };
function wallHtml(u, k, fr, opts = {}) {
  let newest = null; R.acts(k).forEach((a, j) => { if (R.shown(k, j, u) && a.dilemma && named(a.c) && !R.isQuiet(a)) newest = { k, j, a }; });
  const place = (id) => (L.map?.locations || []).find((l) => l.id === id)?.name || "";
  return `<section class="wall${opts.big ? " big" : ""}">${FOUR.map((i, n) => { const d = R.deathOf(i, u); const s = R.pushed(i, u); const [sw, st] = R.stateOf(fr?.conscience?.[i] ?? 0, s.n > 0);
    let last = null; for (let kk = k; kk >= 0 && !last; kk--) { const as = R.acts(kk); for (let j = as.length - 1; j >= 0; j--) { const a = as[j]; if (R.shown(kk, j, u) && a.c === i && a.dilemma && !R.isQuiet(a)) { last = { k: kk, j, a }; break; } } }
    const v = fr?.vitals?.[i]; const cond = d || !v ? "" : v[1] < 0.3 ? "hungry" : v[0] < 0.35 ? "unwell" : (v[3] ?? 0) <= -0.25 ? "low" : "";
    const ev = String(fr?.evening?.[i] ?? ""); const doing = d ? "" : ev.startsWith("visit:") ? `visiting ${nm(R.byId[ev.slice(6)] ?? i)}` : DOING[ev] ? `${DOING[ev]}${ev === "work" && fr?.at?.[i] ? ` at ${place(fr.at[i])}` : ""}` : fr?.at?.[i] ? `at ${place(fr.at[i])}` : "";
    const onair = !d && newest && newest.a.c === i;
    // what goes through their head tonight: their own words at the end of the last season, or the thought behind their last choice
    const mu = L.musings?.[k - 1]?.[P[i].id] ?? L.musings?.[k - 2]?.[P[i].id]; const tonight = d ? String(d.last || "").trim() : String(mu?.ahead || mu?.now || last?.a?.thought || "").trim();
    const face = d ? "dead" : cond === "hungry" ? "hungry" : cond === "unwell" ? "sick" : moodFor(i, last ? toneOf(last.a) : "neutral");
    return `<button class="tv${who === i ? " on" : ""}${d ? " dead" : ""}${d && d.k >= k - 1 ? " fell" : ""}${cond ? ` st-${cond}` : ""}${onair ? ` onair t-${toneOf(newest.a) === "kill" ? "harm" : toneOf(newest.a)}` : ""}" data-who="${esc(P[i].id)}" aria-pressed="${who === i}" style="--n:${n}"><span class="scr"><span class="cam"><i></i>CAM ${n + 1} &middot; ${esc(nm(i).toUpperCase())}${onair ? `<b class="air">just now</b>` : ""}</span><span class="fig">${px(i, { res: 48, mood: face, ink: d ? "grey" : "none" })}</span>${d ? `<span class="rip-tv">DEAD<small>${esc(d.by != null ? `killed by ${nm(d.by)}` : d.how)}</small></span>` : ""}<span class="subt">${d ? esc(labelOf(d.k)) : last ? esc(said(last.a)) + "." : esc(workOf(P[i], L.jobs || []))}</span></span><span class="plate"><b>${esc(P[i].name)}</b>${P[i].trait ? `<i class="ptrait">${esc(P[i].trait.name)}</i>` : ""}<small class="t-${d ? "death" : st}">${d ? "dead" : esc(sw)}${cond ? ` &middot; ${cond}` : ""}</small>${doing ? `<em>${esc(doing)}</em>` : ""}${tonight ? `<q class="tht" title="What ${esc(nm(i))} is thinking">${esc(tonight.length > 110 ? `${tonight.slice(0, 107).replace(/\s+\S*$/, "")}…` : tonight)}</q>` : ""}</span></button>`; }).join("")}</section>`;
}

// ---------------------------------------------------------------- watch all: the four large, and what is happening now
let watching = false;
function watchAll() {
  let o = document.getElementById("watchall"); if (!watching) { o?.remove(); return; }
  const u = R.upto(now()); const k = Math.max(0, u.k); const fr = R.frameAt(k); const live = !L.ended && !L.final;
  let kk = k, xs = notable(k, u, null); if (!xs.length && k > 0) { kk = k - 1; xs = notable(kk, u, null); }
  const n = nextScene(k, u); const end = L.seasonStartedAt + L.seasonMs;
  const html = `<div class="wa-in"><header><p class="kicker">${live ? `<span class="rec">&#9679; LIVE</span> &middot; ` : ""}${esc(L.title || "")} &middot; ${esc(labelOf(k))}</p><button class="wa-x" data-watch aria-label="Close">&times;</button></header>
    <div class="wa-grid">${wallHtml(u, k, fr, { big: true })}<div class="wa-feed"><h2 class="ph">${kk === k ? "Happening now" : `Last: ${esc(labelOf(kk))}`}</h2>${live ? `<p class="nx"><i class="pulse"></i>${n ? `Next decision${n.a.place ? `, at ${esc(n.a.place)},` : ""} in <b data-cd="${n.at}">${mmss(n.at - now())}</b>` : `Next season in <b data-cd="${end}">${mmss(end - now())}</b>`}</p>` : ""}${xs.map((x, m) => fullCard(x, m >= 2)).join("") || `<p class="quiet">Nothing yet this season.</p>`}</div></div></div>`;
  if (!o) { o = document.createElement("div"); o.id = "watchall"; o.className = "watchall-o"; document.body.appendChild(o); }
  o.innerHTML = html; hydrate(o, P); o.dataset.u = `${u.k}:${u.j}`;
}

// ---------------------------------------------------------------- what the town is waiting for, what nobody knows, what you missed
/** Suspense the record already holds, shown without ever asking the reader anything: the set-ups the world has promised
 *  and when they fall due, the things one of the four did that the town does not know, and, for someone coming back, what
 *  happened while they were away. */
function suspense(k, u, live, shown = null) {
  const t = k + 1; const rows = [];
  if (live) {
    for (const s of (L.setups || []).filter((x) => x.closed == null && x.at <= t && x.due >= t && x.due - t <= 4).slice(-2)) {
      const dueK = s.due - 1; rows.push(`<p class="sp-row sp-wait"><span class="sp-k">The town is waiting for</span>${esc(String(s.what).replace(/\.$/, ""))} <small>${dueK <= k ? "any day now" : `by ${esc(labelOf(dueK).toLowerCase())}`}</small></p>`); }
    const aired = (x, i) => { const sk = x.tick - 1; if (sk < u.k) return true; if (sk > u.k) return false; const kind = String(x.id).split(":")[2]; return R.acts(sk).some((a, j) => a.c === i && a.kind === kind && R.shown(sk, j, u)); };
    const exposedIds = new Set(); for (let kk = 0; kk <= k; kk++) R.acts(kk).forEach((a, j) => { if (a.kind === "exposed" && R.shown(kk, j, u)) exposedIds.add(a.c); });
    // (a secret already told above, as this season's or last season's decision, is not told again)
    const told = (x) => shown && x.tick - 1 === shown.k && R.byId[x.who] === shown.a.c && String(x.id).split(":")[2] === shown.a.kind;
    for (const x of (L.secrets || []).filter((x) => { const i = R.byId[x.who]; return i != null && aired(x, i) && !told(x); }).slice(-2)) { const i = R.byId[x.who]; if (i == null) continue;
      rows.push(`<p class="sp-row sp-secret"><span class="sp-k">Nobody in town knows</span>${px(i, { res: 24 })}${esc(x.text)} <small>${esc(labelOf(x.tick - 1).toLowerCase())}, kept ${plural(Math.max(0, k - (x.tick - 1)), "season", "seasons")}</small></p>`); }
    for (let kk = Math.max(0, k - 3); kk <= k; kk++) R.acts(kk).forEach((a, j) => { if (a.kind === "exposed" && R.shown(kk, j, u)) rows.push(`<p class="sp-row sp-out"><span class="sp-k">It came out</span>${esc(String(a.text || "").replace(/^was found out: they /, `${nm(a.c)} `))} <small>${esc(labelOf(kk).toLowerCase())}</small></p>`); });
  }
  const away = awayRecap(k, u);
  return rows.length || away ? `<div class="suspense">${away}${rows.join("")}</div>` : "";
}
/** for someone coming back: what happened since the last season they saw, in a few lines, and where the story picks up */
const SEEN = (() => { try { return JSON.parse(localStorage.getItem("ap-seen") || "null"); } catch { return null; } })();
let seenNow = null; const saveSeen = () => { try { if (seenNow) localStorage.setItem("ap-seen", JSON.stringify(seenNow)); } catch { /* private window */ } };
try { setTimeout(saveSeen, 15000); addEventListener("pagehide", saveSeen); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveSeen(); }); } catch { /* */ }
function awayRecap(k, u) {
  seenNow = { cycle: L.cycle, k }; const seen = SEEN;
  if (!seen) return "";
  if (seen.cycle !== L.cycle) return seen.cycle < L.cycle ? `<p class="sp-row sp-away"><span class="sp-k">While you were away</span>The story you were following has ended. <a href="/run/${seen.cycle}/story#epilogue">Read how it ended &rarr;</a></p>` : "";
  if (k - seen.k < 2) return "";
  const deaths = [], turns = [], big = [];
  for (let kk = seen.k + 1; kk <= k; kk++) { R.acts(kk).forEach((a, j) => { if (a.kind === "death" && named(a.c) && R.shown(kk, j, u)) deaths.push({ k: kk, j, html: `<li class="t-death">&#10013; ${esc(nm(a.c))} died, ${esc(labelOf(kk).toLowerCase())}</li>` }); });
    const tn = L.turns?.[kk + 1]; if (tn?.headline) turns.push({ k: kk, j: -1, html: `<li>${esc(tn.headline)}</li>` });
    big.push(...notable(kk, u, null).filter((x) => x.a.kind !== "death").map((x) => ({ ...x, k: kk }))); }
  const top = big.sort((p, q) => R.weight(q.a) - R.weight(p.a)).slice(0, 3).map((x) => ({ k: x.k, j: x.j, html: `<li class="t-${toneOf(x.a) === "kill" ? "harm" : toneOf(x.a)}"><a href="#s${x.k}-${x.j}" data-go="s${x.k}-${x.j}">${esc(said(x.a))}</a></li>` }));
  const kept = [...deaths.slice(0, 3), ...top]; const room = Math.max(0, 8 - kept.length); kept.push(...turns.slice(-room));
  const lines = kept.sort((p, q) => p.k - q.k || p.j - q.j).map((x) => x.html);
  if (!lines.length) return "";
  const y0 = Math.floor((seen.k + 1) / 4) + 1;
  return `<details class="sp-away"><summary><span class="sp-k">While you were away</span>${plural(k - seen.k, "season", "seasons")} went by. <small>Show what happened</small></summary><ul>${lines.join("")}</ul><p><a href="${BASE ? BASE + "/story" : "/story"}#year-${y0}">Pick the story up at Year ${y0} &rarr;</a></p></details>`;
}

// ---------------------------------------------------------------- the front page: the town now, and whoever you pick
let who = (() => { const m = location.hash.match(/who=([\w-]+)/); return m && R.byId[m[1]] != null ? R.byId[m[1]] : null; })();
/** a paragraph cut to its first sentence under a headline, the rest a click away: the top of the page is not a wall of text */
function dek(text, pre = "") {
  const parts = String(text || "").trim().split(/(?<=[.!?])\s+(?=[A-Z“"])/); const first = parts.shift() || "";
  return parts.length ? `<details class="turn"><summary>${esc(pre)}${esc(first)} <small>more</small></summary>${esc(parts.join(" "))}</details>` : `<p class="turn">${esc(pre)}${esc(first)}</p>`;
}
function nowPage() {
  const u = R.upto(now()); const k = Math.max(0, u.k); const live = !L.ended && !L.final; const fr = R.frameAt(k);
  const e = R.epochAt(k); const since = e ? k - (e.at - 1) + 1 : 0;
  // the headline: the heaviest thing of this season, or of the last if this one has only just begun
  let hk = k, hs = notable(k, u, null); if (!hs.length && k > 0) { hk = k - 1; hs = notable(hk, u, null); }
  const top = [...hs].sort((x, y) => R.weight(y.a) - R.weight(x.a))[0];
  // what the world did this season that nobody chose, or last season's if this one has none
  const tk = [k, k - 1].find((x) => x >= 0 && L.turns?.[x + 1]?.headline); const turn = tk != null ? L.turns[tk + 1] : null;
  // with nothing from the world and no hardship, the season's heaviest decision is the headline itself (and is not said twice)
  const actHead = !turn && !e && top && R.weight(top.a) >= 5;
  const wall = `<div class="wall-h"><button class="watchall" data-watch>&#9654; Watch all</button></div>${wallHtml(u, k, fr)}${who != null ? `<p class="wall-x"><button data-who="">&larr; back to the whole town</button></p>` : ""}`;
  const head = `<header class="nowh"><p class="kicker">${live ? `<span class="rec">&#9679; LIVE</span> &middot; ` : ""}Run ${L.cycle} &middot; ${esc(labelOf(k).replace(/^Year (\d+)/, `Year $1 of ${Math.round(L.ticks / 4)}`))}${live ? ` &middot; <span class="left" title="A season every ${Math.round(L.seasonMs / 60000)} minutes, ${Math.round(L.ticks / 4)} years in all: about ${Math.round(L.ticks * L.seasonMs / 3.6e6)} hours from start to end. It ends sooner if all four die.">${hoursLeft((L.ticks - L.tick) * L.seasonMs + Math.max(0, L.seasonStartedAt + L.seasonMs - now()))} of story left</span>` : ""}</p>
    ${(() => { const plain = turn ? turn.headline : e ? e.headline : actHead ? `${said(top.a)}.` : k === 0 && !hs.length ? "A new story begins." : "A quiet season in town.";
      const h = actHead ? `<a href="#s${top.k}-${top.j}" data-go="s${top.k}-${top.j}">${esc(plain)}</a>` : esc(plain); return `<h1${String(plain).length > 34 ? ' class="long"' : ""}>${h}</h1>`; })()}
    ${!turn && !e && k === 0 && !hs.length && L.premise ? dek(L.premise) : ""}
    ${turn ? dek(turn.text, tk === k ? "" : "Last season: ") : ""}
    <p class="when">${e && turn ? `${esc(e.headline)} ` : ""}${e ? `${since === 1 ? "It began this season." : `Its ${["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][since] || since + "th"} season of ${words(e.seasons)}.`} ` : ""}${top && !actHead ? `${hk === k ? "This season" : "Last season"}: <a href="#s${top.k}-${top.j}" data-go="s${top.k}-${top.j}">${esc(said(top.a))}</a>.` : k === 0 ? "The first season is under way." : ""}</p>
    <p class="toplinks"><a class="story-btn" href="${BASE ? BASE + "/story" : "/story"}">Read the whole story &rarr;</a><button class="story-btn ghost" data-intro>How this works</button></p>
    ${wall}${(() => { const s = suspense(k, u, live, top); return s ? `<div class="sp-below">${s}</div>` : ""; })()}</header>`;
  let body = "";
  if (who == null) {
    const n = nextScene(k, u); const end = L.seasonStartedAt + L.seasonMs;
    const next = live ? `<p class="nxt"><i class="pulse"></i>${n ? `Next decision${n.a.place ? `, at ${esc(n.a.place)},` : ""} in <b data-cd="${n.at}">${mmss(n.at - now())}</b>` : `Next season in <b data-cd="${end}">${mmss(end - now())}</b>`}</p>` : "";
    const ups = upcoming(k, u, null);
    const coming = ups.length ? `<section class="ssn"><h2 class="ph">Coming up this season</h2>${ups.slice(0, 4).map(upHtml).join("")}${ups.length > 4 ? `<p class="quiet">and ${plural(ups.length - 4, "more")} before the season turns.</p>` : ""}</section>` : live ? `<section class="ssn">${next}</section>` : "";
    const seasons = []; for (let kk = k; kk >= Math.max(0, k - 1); kk--) { const xs = notable(kk, u, null); seasons.push(`<section class="ssn"><h2 class="ph">${kk === k && live ? "This season, so far" : esc(labelOf(kk))}</h2>${xs.length ? xs.map((x) => decHtml(x)).join("") : `<p class="quiet">Nothing yet.</p>`}</section>`); }
    // the town's story from the first season to this one, as the chronicler told it and the record checked it: every year in
    // order, the one being lived open, the rest a click away — so the whole of it can be read without leaving the page
    const told = (L.told || []).filter((c) => c.text);
    const story = told.length ? `<section class="ssn sofar"><h2 class="ph">The story so far</h2>${told.map((c, n) => `<details class="chap-s"${n === told.length - 1 ? " open" : ""}><summary><span class="yk">${esc(c.when)}${c.live ? " &middot; still being lived" : ""}</span><b>${esc(c.title)}</b></summary>${String(c.text).split(/\n+/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("")}<p class="more"><a href="${epHref(c.from + 1)}">Watch it: episodes ${c.from + 1}&ndash;${c.to + 1} &rarr;</a></p></details>`).join("")}<p class="more"><a href="${BASE ? BASE + "/story" : "/story"}">The whole story, with its scenes &rarr;</a></p></section>` : "";
    body = townPanel(L, R, k) + panes(k, u, live, n, end) + `<section class="ssn" hidden><h2 class="ph">How it got here, a year to a line</h2>${yearLines(u, Math.max(0, k - 2), true)}<p class="more"><a href="${BASE}/episodes">Every season, in full &rarr;</a> &nbsp; <a href="${BASE ? BASE + "/story" : "/story"}">The story, told &rarr;</a></p></section>`;
  } else {
    const i = who; const d = R.deathOf(i, u); const s = R.pushed(i, u); const [sw, st] = R.stateOf(fr?.conscience?.[i] ?? 0, s.n > 0);
    const ties = P.map((_, x) => x).filter((x) => x !== i && Math.abs(fr?.ties?.[i]?.[P[x].id] ?? 0) >= 0.2 && !R.deathOf(x, u)).sort((a, b) => (fr.ties[i][P[b].id] ?? 0) - (fr.ties[i][P[a].id] ?? 0)).slice(0, 6).map((x) => { const v = fr.ties[i][P[x].id]; return `<span class="t-${v >= 0.2 ? "help" : "harm"}">${R.feel(v)} ${esc(nm(x))}</span>`; }).join("");
    const place = (id) => (L.map?.locations || []).find((l) => l.id === id)?.name || "";
    const p = P[i]; const age = (p.age || 30) + Math.max(0, yearOf(k) - 1);
    const life = String((L.lives || {})[p.id] || "").split(/\n+/).filter(Boolean);
    const mine = []; for (let kk = k; kk >= 0; kk--) { const as = R.acts(kk); for (let j = as.length - 1; j >= 0; j--) { const a = as[j]; if (!R.shown(kk, j, u)) continue;
      if (a.c === i && a.dilemma && !R.isQuiet(a)) mine.push({ k: kk, j, a });
      else if ((a.c === i || (a.kind === "marry" && a.target === i)) && ["death", "marry", "birth", "turned"].includes(a.kind)) mine.push({ k: kk, j, a, ev: true }); } }
    // a life event is a card of its own: a death above all, with what came just before it
    const evCard = (x) => { const a = x.a; const t = a.kind === "death" ? "death" : a.kind === "turned" ? "harm" : "gold";
      const before = a.kind === "death" ? mine.find((y) => !y.ev && (y.k < x.k || (y.k === x.k && y.j < x.j))) : null;
      const title = a.kind === "death" ? (d?.by != null ? `${nm(i)} was killed by ${nm(d.by)}` : `${nm(i)} ${String(d?.how || a.text || "died").replace(/^dies/, "died")}`) : a.kind === "marry" ? `${nm(a.c)} married ${a.target != null ? nm(a.target) : ""}` : a.kind === "birth" ? `A child was born to ${nm(a.c)}` : `${nm(i)} turned: harm now outweighs kindness in them`;
      return `<article class="evcard t-${t}"><span class="ev-mark">${a.kind === "death" ? "&#10013;" : a.kind === "turned" ? "!" : "&#9829;"}</span><div><small>${esc(labelOf(x.k))}</small><b>${esc(title)}.</b>${a.kind === "death" && a.last ? `<p class="lastw">Last words: <q>${esc(String(a.last))}</q></p>` : ""}${before && before.k >= x.k - 1 ? `<p>Just before: ${esc(said(before.a))}.${before.a.outcome ? ` ${esc(thirdPerson(before.a.outcome, nm(i), "", P[i]?.sex))}` : ""}</p>` : ""}</div></article>`; };
    const log = mine.map((x, n) => x.ev ? evCard(x) : fullCard(x, n >= 3)).join("");
    body = `<section class="who"><div class="wh">${px(i, { res: 48, mood: d ? "dead" : "calm", ink: d ? "grey" : "none" })}<div><h2>${esc(p.name)}</h2><p class="ep">${esc(R.epithet(i))} &middot; ${esc(workOf(p, L.jobs || []))}, ${age}</p><p class="s t-${d ? "death" : st}">${d ? (d.by != null ? `Killed by ${esc(nm(d.by))}, ${esc(labelOf(d.k).toLowerCase())}.` : `${esc(cap(d.how))}, ${esc(labelOf(d.k).toLowerCase())}.`) : `${sw === "no choices yet" ? "Nothing has been asked of them yet." : `${esc(cap(sw))}.`}`}${s.n ? ` Spared the other person <b class="g">${s.spared}</b> ${s.spared === 1 ? "time" : "times"}, hurt them <b class="r">${s.hurt}</b>.` : ""}</p>${ties ? `<p class="ties">${ties}</p>` : ""}</div></div>
      <div class="bio"><div><h3>Who ${pro(p).he} is</h3><p>${esc(p.name)}, ${age}, ${esc(workOf(p, L.jobs || []))}${p.home && place(p.home) ? `, living at ${esc(place(p.home))}` : ""}.</p></div>${p.trait ? `<div><h3>What marks ${pro(p).him} out</h3><p><b class="trait">${esc(p.trait.name)}</b> ${esc(neutral(p.trait.text))}</p></div>` : ""}<div><h3>What ${pro(p).he}'s after</h3><p>${p.want ? `${esc(cap(neutral(p.want)))}.` : "&mdash;"}</p></div><div><h3>What ${pro(p).he} fears</h3><p>${p.fear ? `${esc(cap(neutral(p.fear)))}.` : "&mdash;"}</p></div></div>
      ${(() => { const mu = L.musings?.[k - 1]?.[p.id] ?? L.musings?.[k - 2]?.[p.id]; if (d || !mu) return "";
        const rows = [["Looking back", mu.past], ["Tonight", mu.now], ["What they dread", mu.ahead]].filter(([, v]) => v);
        return rows.length ? `<div class="turning"><h3>What ${esc(nm(i))} is turning over</h3>${rows.map(([h, v]) => `<p><span class="lab">${h}</span><q>${esc(v)}</q></p>`).join("")}</div>` : ""; })()}
      ${life.length ? `<div class="their"><h3>${pro(p).His} story</h3>${life.map((x) => `<p>${esc(x)}</p>`).join("")}</div>` : ""}</section>
      ${(() => { const ups = upcoming(k, u, i); return ups.length ? `<section class="ssn"><h2 class="ph">Coming up for ${esc(nm(i))}</h2>${ups.map(upHtml).join("")}</section>` : ""; })()}
      <section class="ssn"><h2 class="ph">${pro(p).His} decisions and what happened to ${pro(p).him}, newest first</h2>${log || `<p class="quiet">No decisions yet.</p>`}</section>`;
  }
  root.innerHTML = `${head}<div class="feed" id="feed">${body}</div><div class="toast" id="toast" hidden></div>`;
  hydrate(root, P); watchDecs();
  return { k, u: `${u.k}:${u.j}`, who };
}

// ---------------------------------------------------------------- an episode (any season, in full, from the guide)
function episodePage() {
  const u = R.upto(now()); const k = (L.ep ?? (u.k + 1)) - 1; const live = !L.ended && !L.final && k === L.tick - 1;
  const ep = R.episode(k, u); const e = ep.epoch; const xs = notable(k, u, null).reverse();
  root.innerHTML = `<header class="nowh"><p class="kicker">${esc(labelOf(k))} &middot; season ${k + 1} of ${L.ticks}</p><h1>${esc(ep.title)}</h1>${e ? `<p class="when">${esc(e.headline)}</p>` : ""}</header>
    <div class="feed"><section class="ssn">${xs.length ? xs.map((x) => decHtml(x)).join("") : `<p class="quiet">Nothing happened this season.</p>`}</section>
    ${ep.evenings.length ? `<section class="ssn eve"><h2 class="ph">Otherwise</h2>${ep.evenings.map((x) => `<p><b>${esc(nm(x.a.c))}</b> ${esc(String(x.a.outcome || x.a.text).replace(/^you /, ""))}.</p>`).join("")}</section>` : ""}
    <p class="epnav">${k > 0 ? `<a href="${epHref(k)}">&larr; ${esc(labelOf(k - 1))}</a>` : "<span></span>"}<a href="${BASE}/episodes">All seasons</a>${k + 1 < Math.min(L.tick || 0, L.ticks) || (L.ended && k + 1 < L.frames.length) ? `<a href="${epHref(k + 2)}">${esc(labelOf(k + 1))} &rarr;</a>` : "<span></span>"}</p></div>`;
  hydrate(root, P); watchDecs();
  return { k, live };
}
function nextScene(k, u) { if (L.ended || L.final || k !== L.tick - 1) return null; const as = R.acts(k); for (let j = u.j + 1; j < as.length; j++) { const a = as[j]; if (R.isQuiet(a) || (a.kind === "death" && R.causeOf(k, j) != null)) continue; if (!(named(a.c) || R.involvesFour(a) || R.weight(a) >= 5 || !a.dilemma)) continue; return { j, a, at: R.dueAt(L.tick, j) }; } return null; }

// ---------------------------------------------------------------- the episode guide
function guidePage() {
  const u = R.upto(now()); const last = u.k; const years = Math.ceil((L.ticks || 60) / 4);
  let html = `<header class="gh"><p class="kicker">${!L.ended && !L.final ? `<span class="rec">&#9679; LIVE</span> &middot; ` : ""}Run ${L.cycle}</p><h1>${esc(L.title || "")}</h1><p class="when">${cap(plural(FOUR.length, "person", "people"))}, ${words(years)} hard years, ${L.ticks} seasons. ${L.final || L.ended ? "The whole run, start to end." : last >= 0 ? `${last + 1} so far.` : "It has not begun."}</p>
    <div class="lineup">${FOUR.map((i) => { const d = R.deathOf(i, u); return `<a class="lu${d ? " dead" : ""}" href="${castHref(i)}">${px(i, { res: 30, mood: d ? "dead" : "calm", ink: d ? "grey" : "none" })}<b>${esc(nm(i))}</b><small>${d ? `gone, ${esc(labelOf(d.k).toLowerCase())}` : esc(R.epithet(i))}</small></a>`; }).join("")}</div></header>`;
  for (let y = years; y >= 1; y--) {
    const ks = [4 * y - 4, 4 * y - 3, 4 * y - 2, 4 * y - 1].filter((k) => k < L.ticks);
    if (ks[0] > last) continue;
    html += `<section class="yr"><h2 class="ph">Year ${y}</h2><div class="eps">${ks.map((k) => {
      if (k > last) return `<div class="epc fut"><div class="pic"></div><p><small>Season ${k + 1}</small>${esc(cap(seasonOf(k)))}</p></div>`;
      const ep = R.episode(k, u); const top = ep.top; const t = top ? toneOf(top.a) : "neutral"; const T = top ? (tgt(top.a) ?? killsOf(top.a)[0]) : null;
      const marks = ep.scenes.map((x) => `<i class="t-${toneOf(x.a)}"></i>`).join("");
      return `<a class="epc t-${t}${k === L.tick - 1 && !L.ended ? " live" : ""}" href="${epHref(k + 1)}"><div class="pic">${top ? px(top.a.c, { res: 22, ink: INK[t] || "none", mood: moodFor(top.a.c, t) }) + (T != null ? px(T, { res: 22, cls: "flip", mood: killsOf(top.a).includes(T) ? "dead" : "calm" }) : "") : ""}${ep.epoch ? `<span class="ept e-${esc(ep.epoch.kind)}">${esc(ep.epoch.kind)}</span>` : ""}${k === L.tick - 1 && !L.ended ? `<span class="lv">&#9679; live</span>` : ""}</div><p><small>Episode ${k + 1} &middot; ${esc(seasonOf(k))}</small><b>${esc(ep.title)}</b>${top ? `<span>${esc(said(top.a))}.</span>` : ""}</p><p class="mk">${marks}</p></a>`; }).join("")}</div></section>`;
  }
  root.innerHTML = html; hydrate(root, P);
}

// ---------------------------------------------------------------- a person
function castPage() {
  const u = R.upto(now()); const i = R.byId[L.focus]; if (i == null) return; const p = P[i]; const d = R.deathOf(i, u); const fr = R.frameAt(Math.max(0, u.k));
  const s = R.pushed(i, u); const [sw, st] = R.stateOf(fr?.conscience?.[i] ?? 0, s.n > 0); const age = (p.age || 30) + Math.max(0, yearOf(Math.max(0, u.k)) - 1);
  const mine = []; for (let k = 0; k <= u.k; k++) R.acts(k).forEach((a, j) => { if (!R.shown(k, j, u) || R.isQuiet(a) || (a.kind === "death" && R.causeOf(k, j) != null)) return; if (R.involves(a, i)) mine.push({ k, j, a, w: R.weight(a) + (a.c === i ? 1 : 0) }); });
  const key = [...mine].sort((x, y) => y.w - x.w).slice(0, 6).sort((x, y) => x.k - y.k || x.j - y.j);
  const years = Math.ceil((L.ticks || 60) / 4);
  const arc = `<div class="arc">${Array.from({ length: years }, (_, y) => `<span class="ay"><small>${y + 1}</small></span>`).join("")}${mine.map((m) => { const t = toneOf(m.a); const big = m.w >= 6; const same = mine.filter((x) => x.k === m.k); const at = same.indexOf(m); return `<a class="am t-${t}${big ? " big" : ""}${m.a.c !== i ? " done-to" : ""}" style="left:${((m.k + 0.5) / (years * 4)) * 100}%;top:calc(50% + ${(at - (same.length - 1) / 2) * 17}px)" href="${epHref(m.k + 1)}#s${m.k}-${m.j}" title="Episode ${m.k + 1}: ${esc(said(m.a))}"></a>`; }).join("")}${d ? `<span class="aend" style="left:${((d.k + 1) / (years * 4)) * 100}%"></span>` : ""}</div>`;
  const life = String((L.lives || {})[p.id] || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const people = []; P.forEach((q, x) => { if (x === i) return; const ms = mine.filter((m) => (m.a.c === i && tgt(m.a) === x) || (m.a.c === x && tgt(m.a) === i) || (m.a.c === i && killsOf(m.a).includes(x)) || (m.a.c === x && killsOf(m.a).includes(i))); if (ms.length) people.push({ x, ms }); });
  people.sort((a, b) => b.ms.length - a.ms.length);
  document.title = `${p.name} · ${L.title || ""}`;
  root.innerHTML = `<header class="dossier t-${d ? "death" : st}">
    <div class="big">${px(i, { res: 48, mood: d ? "dead" : (fr?.conscience?.[i] ?? 0) <= -0.5 ? "angry" : "calm", ink: d ? "grey" : "none" })}</div>
    <div class="who"><p class="kicker">${esc(L.title || "")} &middot; Run ${L.cycle}${named(i) ? "" : " &middot; a side character"}</p><h1>${esc(p.name)}</h1><p class="ep">${esc(R.epithet(i))} &middot; ${esc(workOf(p, L.jobs || []))}, ${age}</p>
      <p class="state t-${d ? "death" : st}">${d ? (d.by != null ? `Killed by ${esc(nm(d.by))}, ${esc(labelOf(d.k).toLowerCase())}.` : `${esc(cap(d.how))}, ${esc(labelOf(d.k).toLowerCase())}.`) : `${sw === "no choices yet" ? "Nothing has been asked of them yet." : `${esc(cap(sw))}.`}`}</p>
      ${p.want || p.fear ? `<p class="wf">${p.want ? `Wants ${esc(neutral(p.want))}.` : ""} ${p.fear ? `Fears ${esc(neutral(p.fear))}.` : ""}</p>` : ""}
      ${s.n ? `<p class="nums"><span><b class="g">${s.spared}</b>spared</span><span><b class="r">${s.hurt}</b>hurt</span><span class="of">of ${plural(s.n, "time", "times")} a harm was within reach</span></p>` : ""}</div></header>
    <section class="arcs"><h2 class="ph">${pro(p).His} fifteen years</h2>${arc}<p class="akey"><i class="t-help"></i>kindness <i class="t-neutral"></i>held back <i class="t-harm"></i>harm <i class="t-death"></i>death &nbsp; &middot; hollow: done to them</p></section>
    ${key.length ? `<section class="prev"><h2 class="ph">The scenes that made ${pro(p).him}</h2><div class="frames">${key.map((x) => { const t = toneOf(x.a); const T = tgt(x.a) ?? killsOf(x.a)[0]; return `<a class="fr t-${t}" href="${epHref(x.k + 1)}#s${x.k}-${x.j}"><div class="pic">${px(x.a.c, { res: 24, ink: INK[t] || "none" })}${T != null ? px(T, { res: 24, cls: "flip", mood: killsOf(x.a).includes(T) ? "dead" : "calm" }) : ""}</div><p><small>Episode ${x.k + 1}</small>${esc(said(x.a))}.${x.a.thought && x.a.c === i ? ` <q>${esc(x.a.thought)}</q>` : ""}</p></a>`; }).join("")}</div></section>` : ""}
    ${life.length ? `<section class="life"><h2 class="ph">${pro(p).His} story</h2>${life.map((x) => `<p>${esc(x)}</p>`).join("")}</section>` : L.writing ? `<section class="life"><h2 class="ph">${pro(p).His} story</h2><p class="dim">The chronicler is reading their years now. It will be here in a moment.</p></section>` : ""}
    ${people.length ? `<section class="ppl"><h2 class="ph">The people in ${pro(p).his} story</h2><div class="pg">${people.slice(0, 9).map(({ x, ms }) => { const v = fr?.ties?.[i]?.[P[x].id] ?? 0; const dx = R.deathOf(x, u); return `<a class="pc" href="${castHref(x)}">${px(x, { res: 26, mood: dx ? "dead" : "calm", ink: dx ? "grey" : "none" })}<div><b>${esc(nm(x))}${named(x) ? "" : ` <small>side</small>`}</b><span class="t-${v >= 0.2 ? "help" : v > -0.2 ? "neutral" : "harm"}">${dx ? "dead" : `${esc(nm(i))} ${R.feel(v)} them`}</span><p class="dots">${ms.map((m) => `<i class="t-${toneOf(m.a)}"></i>`).join("")}</p></div></a>`; }).join("")}</div></section>` : ""}
    <p class="epnav"><a href="${BASE || "/"}">&larr; ${BASE ? "Back to this run" : "Now playing"}</a><a href="${BASE}/story">Read the story</a><a href="/people#${esc(p.id)}">${esc(nm(i))} across every run</a></p>`;
  hydrate(root, P);
}

// ---------------------------------------------------------------- live: new scenes arrive at the end; nothing above you moves
function toast(html, href) { const t = $("#toast"); if (!t) return; t.innerHTML = html; t.hidden = false; t.onclick = () => { if (href.startsWith("/")) { location.href = href; return; } location.hash = href; t.hidden = true; }; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 12000); }
let state = null;
function render() { if (L.page === "guide") guidePage(); else if (L.page === "cast") castPage(); else if (L.ep) state = episodePage(); else state = nowPage(); }
render();
if (location.hash && !location.hash.startsWith("#who")) setTimeout(() => { document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" }); }, 80);
document.addEventListener("click", (ev) => {
  const wa = ev.target.closest("[data-watch]"); if (wa) { ev.preventDefault(); watching = !watching; watchAll(); document.body.classList.toggle("wa-open", watching); return; }
  if (watching && ev.target.closest("#watchall [data-who]")) { watching = false; watchAll(); document.body.classList.remove("wa-open"); }
  const w = ev.target.closest("[data-who]"); if (w && L.page === "episode" && !L.ep) { ev.preventDefault(); const id = w.dataset.who; who = id && R.byId[id] !== who ? R.byId[id] : null; try { history.replaceState(null, "", who == null ? location.pathname : `#who=${P[who].id}`); } catch {} render(); $(".pick")?.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
  const g = ev.target.closest("[data-go]"); if (g) { const el = document.getElementById(g.dataset.go); if (el) { ev.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } else if (who != null) { ev.preventDefault(); who = null; render(); setTimeout(() => document.getElementById(g.dataset.go)?.scrollIntoView({ block: "center" }), 60); } else { ev.preventDefault(); const m = g.dataset.go.match(/^s(\d+)-/); if (m) location.href = `${epHref(+m[1] + 1)}#${g.dataset.go}`; } }
});
setInterval(() => {
  for (const el of document.querySelectorAll("[data-cd]")) el.textContent = mmss(+el.dataset.cd - now());
  if (L.page !== "episode" || L.ep || !state) return;
  const u = R.upto(now()); if (`${u.k}:${u.j}` === state.u) return;
  const before = notable(Math.max(0, u.k), R.upto(now() - 1000), null).length; const after = notable(Math.max(0, u.k), u, null);
  const y = scrollY; state = nowPage(); scrollTo(0, y); if (watching) watchAll();
  if (after.length > before && after[0]) { toast(`<b>New</b> ${esc(said(after[0].a))} &#9654;`, `s${after[0].k}-${after[0].j}`); }
}, 1000);

// a new season: the page asks the server on the Workers build and is told on the local one
function onSeason(d) { if (d.cycle !== L.cycle) { location.reload(); return; } if (d.serverNow) clockOff = d.serverNow - Date.now(); L.tick = d.tick; L.seasonStartedAt = d.seasonStartedAt; L.frames[d.tick - 1] = d.frame; L.acts[d.tick - 1] = d.acts; if (d.musings) (L.musings ??= {})[d.tick - 2] = d.musings; if (d.secrets) L.secrets = d.secrets; if (d.setups) L.setups = d.setups; if (d.turns) L.turns = d.turns;
  if (L.page === "episode" && !L.ep) render(); }
if (!L.final && !L.ended && L.poll) { let last = L.tick; setInterval(async () => { try { const d = await fetch("/state", { headers: { accept: "application/json" } }).then((r) => r.json()); if (d.serverNow) clockOff = d.serverNow - Date.now(); if (d.cycle !== L.cycle) { location.reload(); return; } if (d.ended && !L.ended) { L.ended = true; L.endedAt = d.endedAt; } if (d.tick !== last) { last = d.tick; const k = d.tick - 1; onSeason({ cycle: d.cycle, tick: d.tick, seasonStartedAt: d.seasonStartedAt, serverNow: d.serverNow, frame: d.frame ?? d.record?.frames?.[k], acts: d.acts ?? d.record?.acts?.[k], musings: d.musings, secrets: d.secrets, setups: d.setups, turns: d.turns }); } } catch {} }, L.poll); }
else if (!L.final && !L.ended) { try { const es = new EventSource("/events"); es.addEventListener("season", (e) => onSeason(JSON.parse(e.data))); es.addEventListener("cycle", () => location.reload()); } catch {} }
window.__film = { L, R, render };

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && watching) { watching = false; watchAll(); document.body.classList.remove("wa-open"); } });


// ---------------------------------------------------------------- first visit: what this is, and how to watch it
const INTRO = () => { const four = P.filter((c) => c.named !== false).slice(0, 4); const nm = (c) => esc(String(c.name).split(" ")[0]);
  return [
    { k: "Welcome to Uncanny Valley", h: "Four AI people. Fifteen hard years.", b: `<p>An AI plays four people living in ${esc(L.title || "a small town")}: ${four.map(nm).join(", ").replace(/, ([^,]*)$/, " and $1")}. Each has a face, a job, something they want, something they fear, and one trait that marks them out.</p><p>Famine, sickness, war and hard winters will come through. Nobody tells them when, and nobody tells them they are being watched.</p>`, faces: true },
    { k: "Every choice is theirs", h: "Classic experiments, in disguise.", b: `<p>Each season, life puts something in front of each of them: a purse left on a stall, an order to sign, someone hungry at the door. Some are famous psychology experiments (Milgram's obedience test, the trolley problem, the bystander) dressed up as the town's own business.</p><p>They choose, and they tell themselves why. Then the dice decide what comes of it. Nobody plays them: the AI does, in character.</p>` },
    { k: "The world moves too", h: "Things happen that nobody chose.", b: `<p>A director writes what happens in town each season: a ship arrives, a debt falls due, a rumour spreads. Things they did in secret can come out. What they did stays with them, and a wrong in year two can decide something in year nine.</p>` },
    { k: "How to watch", h: "Four screens, one town.", b: `<p><b>The wall</b> shows each of them live. Click anyone to open who they are, their story, and every decision they made. <b>Watch all</b> puts every scene on at once.</p><p>In the story, lines you can hover are decisions: <span class="t-harm-k">red</span> for a harm, <span class="t-help-k">green</span> for a kindness, <span class="t-neutral-k">amber</span> for neither. Hover a name to see who they are.</p>` },
    { k: "Read it as a story", h: "A new chapter every year.", b: `<p>A second AI writes each year as a chapter of a novel, from the record only: it may only say what happened, and every word anyone says is one they really thought. When the fifteen years are over, or the last of the four is gone, there is an epilogue, and the story ends.</p><p>A year passes in about eighty minutes; a whole story takes about twenty hours.</p>` },
    { k: "What we are finding", h: "When hurting someone would pay, does it?", b: `<p>Every decision is counted and set against what people did in the original studies. The findings show how often it chose to hurt someone, what pushes it (hunger, grudges, being unwatched), where its words and deeds part ways, and whether the character it was given shows.</p>`, end: true },
  ]; };
let introAt = 0;
function intro(open = true) {
  let el = document.getElementById("intro"); if (!open) { el?.remove(); document.body.classList.remove("intro-open"); try { localStorage.setItem("ap-intro", "1"); } catch { /* private window */ } return; }
  const steps = INTRO(); const st = steps[introAt];
  if (!el) { el = document.createElement("div"); el.id = "intro"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); document.body.appendChild(el); document.body.classList.add("intro-open"); }
  el.innerHTML = `<div class="in-card"><button class="in-x" data-in="close" aria-label="Close">&times;</button>
    <p class="in-k">${introAt + 1} of ${steps.length} &middot; ${esc(st.k)}</p><h2>${st.h}</h2>
    ${st.faces ? `<div class="in-faces">${P.map((c, i) => (c.named !== false ? `<span>${px(i, { res: 48 })}<b>${esc(String(c.name).split(" ")[0])}</b>${c.trait ? `<i>${esc(c.trait.name)}</i>` : ""}</span>` : "")).join("")}</div>` : ""}
    <div class="in-b">${st.b}</div>
    <div class="in-nav"><span class="in-dots">${steps.map((_, i) => `<i class="${i === introAt ? "on" : ""}" data-in="${i}"></i>`).join("")}</span>
      ${introAt > 0 ? `<button data-in="back">Back</button>` : `<button data-in="close" class="ghost">Skip</button>`}
      ${st.end ? `<a class="in-go" href="/history" data-in="close-link">See the findings</a><button class="in-go" data-in="close">Start watching</button>` : `<button class="in-go" data-in="next">Next</button>`}</div></div>`;
  try { hydrateFaces(el); } catch { /* faces are a nicety */ }
}
function hydrateFaces(root) { if (typeof hydrate === "function") hydrate(root, P); }
document.addEventListener("click", (ev) => {
  if (ev.target.closest("[data-intro]")) { ev.preventDefault(); introAt = 0; intro(); return; }
  const b = ev.target.closest("[data-in]"); if (!b) { if (ev.target.id === "intro") intro(false); return; }
  const v = b.dataset.in; if (v === "close-link") { intro(false); return; } ev.preventDefault();
  if (v === "close") intro(false); else if (v === "next") { introAt = Math.min(INTRO().length - 1, introAt + 1); intro(); } else if (v === "back") { introAt = Math.max(0, introAt - 1); intro(); } else if (/^\d+$/.test(v)) { introAt = +v; intro(); }
});
document.addEventListener("keydown", (e) => { if (!document.getElementById("intro")) return; if (e.key === "Escape") intro(false); else if (e.key === "ArrowRight") { introAt = Math.min(INTRO().length - 1, introAt + 1); intro(); } else if (e.key === "ArrowLeft") { introAt = Math.max(0, introAt - 1); intro(); } });
if (L.page === "episode" && !L.ep) { let seen = false; try { seen = !!localStorage.getItem("ap-intro"); } catch { /* private window: show it */ } if (!seen) setTimeout(() => intro(), 400); }
try { const on = document.querySelector("header.site nav a.on"); const nav = on?.parentElement; if (on && nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2; } catch { /* a nicety */ }
