// The town, as pages. A printed book of a small place: what is happening in it now, the four whose years these are, what
// passed between people and why, and the years told a season at a time. Every sentence on these pages is either a fact
// from the ledger or a sentence of the teller's that cites its facts — and any of those can be opened to show them.
// Nothing moves on its own: no timers, no autoplay. The faces are printed as pixels, and that is the only picture.
import { esc } from "../../web/draw.mjs";
import { sprite, spriteFor } from "./sprites.ts";
import { shelter, bio, type H } from "./shelter.ts";
import { SEASON_NAMES, storyOf, toned, voiceLines, householdOf, didTo, doneTo, wantEcho, ledger, factsAt, factById, townNow, ahead, personNow, keyMoments, woundOf, contradictionsOf, voiceOf, pairs, whenOf, nameOf, played, lifeFacts, type Fact } from "../chronicle/ledger.ts";
import { plainSeason, recheck, type Telling, type Line } from "../chronicle/teller.ts";

type R = any;
export interface Ctx { r: R; telling: Telling | null; base: string; live: boolean; nextAt?: number; seasonMs?: number; cycle: number; runs?: { cycle: number; title?: string }[] }

const FONTS = "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Silkscreen&family=Special+Elite&display=swap";
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const Num = (n: number) => { const w = num(n); return w.charAt(0).toUpperCase() + w.slice(1); };
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const first = (n: string) => String(n ?? "").split(" ")[0];
const four = (r: R) => r.citizens.map((c: any, i: number) => ({ c, i })).filter((x: any) => x.c.named) as { c: any; i: number }[];
const yearLabel = (r: R, k: number) => whenOf(r, k).replace(/,.*$/, "");

// ---------- the frame ----------
function shell(ctx: Ctx, title: string, body: string, on = ""): string {
  const r = ctx.r; const b = ctx.base;
  const people = r.citizens.map((c: any) => ({ id: c.id, name: c.name, role: c.role, age: c.age }));
  const nav = [[`${b}/`, "The town", "town"], [`${b}/years`, "The years", "years"], ["/towns", "Other towns", "towns"], ["/about", "What this is", "about"]]
    .map(([h, l, k]) => `<a href="${h}"${on === k ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(r.title)} — ten people, fifteen years, told as it happens.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/web/town.css"></head>
<body><header class="top"><a class="mark" href="${b}/">${esc(r.title)}</a><nav>${nav}</nav></header>
<main>${body}</main>
<footer class="foot"><p>Every sentence here is a fact from the town's record, or cites the facts it was written from — open <span class="sc">the record</span> under any passage to see them. <a href="/about">What this is.</a></p></footer>
<script>window.PEOPLE=${JSON.stringify(people).replace(/</g, "\\u003c")}</script><script type="module" src="/web/town.js"></script></body></html>`;
}
/** a face, printed as pixels once the page has loaded; the dead are printed at the resolution of their last season, greyed */
function face(r: R, i: number, k: number, size: "s" | "m" | "l" | "xl" = "m"): string {
  const p = personNow(r, i, k);
  const mood = !p.alive ? "dead" : p.sick || p.health === "failing" ? "sick" : p.food === "hungry" ? "hungry" : p.moodV >= 0.2 ? "glad" : "calm"; // low spirits are not anger: the face stays still
  const res = { s: 28, m: 36, l: 44, xl: 48 }[size];
  return `<span class="face ${size}${p.alive ? "" : " gone"}"><canvas class="px" data-i="${i}" data-mood="${mood}" data-res="${res}" width="${res}" height="${res}" aria-label="${esc(r.citizens[i].name)}"></canvas></span>`;
}
/** a face with the look of one moment, not of today */
function faceAs(r: R, i: number, mood: string, size: "s" | "m" | "l" | "xl" = "l"): string {
  const res = { s: 28, m: 36, l: 44, xl: 48 }[size];
  return `<span class="face ${size}${mood === "dead" ? " gone" : ""}"><canvas class="px" data-i="${i}" data-mood="${mood}" data-res="${res}" width="${res}" height="${res}" aria-label="${esc(r.citizens[i].name)}"></canvas></span>`;
}
const who = (ctx: Ctx, i: number, text?: string) => `<a class="who" href="${ctx.base}/p/${encodeURIComponent(ctx.r.citizens[i].id)}">${esc(text ?? nameOf(ctx.r, i))}</a>`;
/** Facts in order, with the same thing done again and again folded into one line and its dates. */
function folded(ctx: Ctx, fs: Fact[], i?: number): string {
  const r = ctx.r; const groups: { text: string; ks: number[]; f: Fact }[] = [];
  for (const f of fs) { const g = groups.find((x) => x.text === f.text); if (g) g.ks.push(f.k); else groups.push({ text: f.text, ks: [f.k], f }); }
  return groups.map((g) => `<li class="${g.f.tone}">${g.ks.length > 1 ? `<span class="when">${esc(g.ks.map((k) => yearLabel(r, k).replace("Year ", "Y")).join(", "))}</span>` : when(r, g.ks[0])} ${linked(ctx, g.text)}${g.ks.length > 1 ? ` <span class="aside">(${num(g.ks.length)} times)</span>` : ""}${i != null && g.f.quote && g.f.who === i && g.ks.length === 1 ? ` ${quote(g.f.quote)}` : ""}</li>`).join("");
}
/** a fact's sentence, with each of the people it names made a link */
function linked(ctx: Ctx, text: string): string {
  let out = esc(text);
  const names = ctx.r.citizens.map((c: any, i: number) => ({ n: first(c.name), i })).sort((a: any, b: any) => b.n.length - a.n.length);
  for (const { n, i } of names) out = out.replace(new RegExp(`(?<![\\w>/"])${n}(?![\\w<])`, "g"), `\u0000${i}\u0000`);
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => who(ctx, +i));
}
const when = (r: R, k: number) => `<span class="when">${esc(whenOf(r, k))}</span>`;
const quote = (q?: string) => (q ? `<q>${esc(q)}</q>` : "");

// ---------- a told passage, and the record under it ----------
function told(ctx: Ctx, lines: Line[][], opts: { cls?: string } = {}): string {
  const r = ctx.r; const ids: string[] = [];
  const idx = (id0: string) => { const id = id0.split("#")[0]; let n = ids.indexOf(id); if (n < 0) { ids.push(id); n = ids.length - 1; } return n + 1; };
  const paras = lines.map((p) => `<p>${p.map((l) => `<span class="s">${linked(ctx, l.t)}<sup>${l.c.map(idx).join(",")}</sup></span>`).join(" ")}</p>`).join("");
  const facts = ids.map((id) => { const f = factText(r, id); return `<li>${f}</li>`; }).join("");
  return `<div class="told ${opts.cls ?? ""}">${paras}<details class="record"><summary>the record</summary><ol>${facts}</ol></details></div>`;
}
/** what a cited id stands for, as the reader should see it */
function factText(r: R, id0: string): string {
  const id = id0.split("#")[0];
  if (/^P\d+$/.test(id)) { const c = r.citizens[+id.slice(1)]; return c ? `${esc(c.name)}, ${esc(c.role)}, ${c.age} when the years began. Wants ${esc(c.want)}. Fears ${esc(c.fear)}.` : esc(id); }
  const st = /^state:(\d+):(\d+)$/.exec(id); if (st) return `${esc(whenOf(r, +st[2]))} · ${esc(stateLine(r, +st[1], +st[2]))}`;
  const tw = /^town:(\d+)$/.exec(id); if (tw) { const t = townNow(r, +tw[1]); return `${esc(t.when)} · ${esc(townSentence(r, +tw[1]))}`; }
  const f = factById(r, id); if (!f) return esc(id);
  return `${esc(whenOf(r, f.k))} · ${esc(f.text)}${f.quote ? ` <span class="their">${esc(nameOf(r, f.who))}, to themselves:</span> <q>${esc(f.quote)}</q>` : ""}${f.because?.length && f.quote ? ` <span class="their">What decided it, in ${esc(nameOf(r, f.who))}’s words:</span> ${f.because.map((b) => `<q>${esc(b)}</q>`).join(", ")}` : ""}`;
}
function stateLine(r: R, i: number, k: number): string {
  const p = personNow(r, i, k);
  if (!p.alive) return `${p.name} was dead.`;
  const bits = [p.mood + (p.moodWhy.length ? ` (${p.moodWhy.join("; ")})` : ""), p.food === "hungry" ? "hungry" : "", p.sick ? "sick" : "", !p.roof ? "without a roof" : "", p.close.length ? `close to ${listOf(p.close.map((c) => nameOf(r, c.j)))}` : "", p.odds.length ? `at odds with ${listOf(p.odds.map((c) => nameOf(r, c.j)))}` : "", p.lost.length ? `had lost ${listOf(p.lost.map((j) => nameOf(r, j)))}` : ""].filter(Boolean);
  return `${p.name} was ${bits.join("; ")}.`;
}
/** A season as the page tells it: the teller's passage if there is one, the ledger's own facts if not. */
function seasonTold(ctx: Ctx, k: number): string {
  const p0 = ctx.telling?.seasons?.[k];
  const p = p0 ? { ...p0, lines: recheck(ctx.r, p0.lines) } : undefined;
  if (p?.lines?.length && p.lines.flat().length >= 2) {
    // the rest of the season, from the ledger, so nothing that happened is left out because the passage chose
    const cited = new Set(p.lines.flat().flatMap((l) => l.c.map((x) => x.split("#")[0])));
    const rest = factsAt(ctx.r, k).filter((f) => !cited.has(f.id) && f.kind !== "evening" && f.kind !== "choice" && f.weight >= 2.5).sort((a, b) => b.weight - a.weight).slice(0, 6);
    return `<div>${told(ctx, p.lines)}${rest.length ? `<details class="also"><summary>also this season</summary><ul>${rest.map((f) => `<li>${linked(ctx, f.text)}</li>`).join("")}</ul></details>` : ""}</div>`;
  }
  const fs = plainSeason(ctx.r, k, 5);
  if (!fs.length) return `<p class="quiet">Nothing the record keeps happened this season.</p>`;
  return `<div class="told plain"><p>${fs.map((f) => `<span class="s">${linked(ctx, f.text)}${f.quote && f.deed ? ` <span class="their">${esc(nameOf(ctx.r, f.who))}, to themselves:</span> <q>${esc(f.quote)}</q>` : ""}</span>`).join(" ")}</p></div>`;
}

const t0 = (r: R, k: number) => { const e = (r.events ?? []).find((x: any) => x.seasons && k + 1 >= x.at && k + 1 < x.at + x.seasons); return e ? `, the last of them under ${esc(e.headline.replace(/\.$/, "").replace(/^The /, "the "))}` : ""; };
// ---------- the town, in a sentence or three ----------
function townSentence(r: R, k: number): string {
  const t = townNow(r, k); const total = r.citizens.length;
  const bits = [`${Num(t.alive)} of the ${num(total)} who began are alive`];
  const trouble = [t.hungry ? `${num(t.hungry)} hungry` : "", t.sick ? `${num(t.sick)} sick` : "", t.roofless ? `${num(t.roofless)} without a roof` : "", t.low ? `${num(t.low)} low in spirits` : ""].filter(Boolean);
  return `${bits[0]}${trouble.length ? `; ${listOf(trouble)}` : ""}.`;
}
function lede(ctx: Ctx, k: number): string {
  const r = ctx.r; const t = townNow(r, k); const a = ahead(r, k);
  const died = t.deaths.filter((d) => d.k === k).map((d) => nameOf(r, d.i));
  const parts: string[] = [];
  if (t.epoch) parts.push(t.epoch.since > 0 ? `${esc(t.epoch.headline)} <span class="aside">— under way since ${esc(whenOf(r, k - t.epoch.since))}${t.epoch.left > 0 ? `, and ${num(t.epoch.left)} more season${t.epoch.left === 1 ? "" : "s"} of it to come` : ", in its last season"}.</span>` : esc(t.epoch.headline));
  parts.push(esc(townSentence(r, k)));
  if (died.length) parts.push(`${listOf(died.map((n) => n))} died this season.`);
  return `<p class="lede">${parts.join(" ")}</p>`;
}

/** what the place is: the premise's own words where they describe the place and not the people, then its places and trades */
function placeLine(r: R): string {
  const sentences = String(r.premise ?? "").split(/(?<=[.!?])\s+/).filter((x) => x && !/\b(four|temperament|nobody is told|subjects?|protocol|experiment)\b/i.test(x)).slice(0, 2);
  const places = (r.map?.locations ?? []).map((l: any) => l.name);
  const jobs = [...new Set((r.scenario?.jobs ?? []).map((j: any) => j.name))];
  return `${sentences.length ? `${esc(sentences.join(" "))} ` : ""}${places.length ? `Its places: ${esc(listOf(places))}.` : ""}${jobs.length ? ` Its work: ${esc(listOf(jobs as string[]))}.` : ""}`;
}
/** the living who are not among the four, a line each */
function others(ctx: Ctx, k: number): string {
  const r = ctx.r; const xs = r.citizens.map((c: any, i: number) => ({ c, i })).filter(({ c, i }: any) => !c.named && personNow(r, i, k).alive);
  if (!xs.length) return "";
  return `<p class="coming"><span class="sc">Also here</span> ${xs.map(({ c, i }: any) => { const p = personNow(r, i, k); const tie = p.close[0] ? `, close to ${nameOf(r, p.close[0].j)}` : "";
    const h = householdOf(r, i, k).partners.map((x) => `${x.ended === "death" && x.to != null ? `widowed ${esc(yearLabel(r, x.to))}, when ${who(ctx, x.j)} died` : `married to ${who(ctx, x.j)}`}`).join("; ");
    return `${who(ctx, i)}, ${esc(c.role)}${h ? ` — ${h}` : ""}${tie}${p.moodV <= -0.25 ? ", low in spirits" : ""}.`; }).join(" ")}</p>`;
}
// ---------- the four ----------
function household(ctx: Ctx, i: number, k: number): string {
  const r = ctx.r; const h = householdOf(r, i, k); const N = nameOf(r, i);
  const before = (p: any) => { if (p.from === 0) return ""; const f = lifeFacts(r, i, p.from).filter((g) => g.deed && g.tone === "help" && ((g.who === i && g.whom === p.j) || (g.who === p.j && g.whom === i)) && g.k < p.from).sort((a, b) => b.weight - a.weight)[0]; const prev = h.partners.find((q) => q.to === p.from || (q.to != null && q.to <= p.from && q.to >= p.from - 1)); return `${prev && prev.j !== p.j ? `, the same season ${who(ctx, prev.j)} died` : ""}${f ? ` (before that, ${linked(ctx, lowerFirst(f.text.split(/(?<=\.)\s/)[0]).replace(/\.$/, ""))}, ${esc(yearLabel(r, f.k))})` : ""}`; };
  const bits = h.partners.map((p) => `${p.from === 0 ? "married to" : `married ${esc(yearLabel(r, p.from))} to`} ${who(ctx, p.j)}${before(p)}${p.ended === "death" && p.to != null ? `, who died ${esc(whenOf(r, p.to))}` : ""}`);
  const kids = h.children ? `${Num(h.children)} ${h.children === 1 ? "child" : "children"}` : "";
  if (!bits.length && !kids) return `<p class="house">${esc(N)} was never married.</p>`;
  return `<p class="house">${bits.length ? `${esc(N)} was ${bits.join("; then ")}.` : ""}${kids ? ` ${kids}.` : ""}</p>`;
}
function carrying(ctx: Ctx, i: number, k: number): string[] {
  const r = ctx.r; const p = personNow(r, i, k); const out: string[] = [];
  if (!p.alive) return out;
  const low = p.moodV <= -0.25;
  if (low) out.push(`Low in spirits${p.lowFor >= 2 ? ` for ${num(p.lowFor)} seasons` : ""}${p.mood === "very low" ? ", and very low now" : ""}${p.moodWhy.length ? ` — ${esc(p.moodWhy.slice(0, 2).join("; "))}` : ""}.`);
  else if (p.moodV >= 0.2) out.push(`In good spirits.`);
  if (p.food === "hungry") out.push(`Hungry${p.hungryFor >= 2 ? `, ${num(p.hungryFor)} seasons now` : ""}.`);
  if (p.sick) out.push(`Sick${p.health === "failing" ? " and failing" : ""}.`); else if (p.health === "failing") out.push("Failing in body.");
  if (!p.roof) out.push("Without a roof.");
  for (const j of p.lost.slice(-3)) { const d = r.citizens[j]; const was = householdOf(r, i, k).partners.some((x) => x.j === j) ? "whom they had married" : (() => { const f = toned(r, i, j, k, "help"); return f ? `a friend — ${linked(ctx, f.text.replace(/\.$/, ""))}` : "a friend"; })();
    out.push(`Has lost ${who(ctx, j)}${d?.diedAt ? ` (${esc(yearLabel(r, d.diedAt - 1))})` : ""}, ${was}.`); }
  for (const o of p.odds.slice(0, 2)) { const f = lastWhy(r, i, o.j, k); out.push(`At odds with ${who(ctx, o.j)}${f ? ` — ${linked(ctx, f.text.replace(/\.$/, ""))} (${esc(yearLabel(r, f.k))})` : ""}.`); }
  for (const o of p.close.slice(0, 2)) {
    const hurt = pairs(r, k).find((q) => (q.a === i && q.b === o.j) || (q.b === i && q.a === o.j))?.facts.filter((g) => g.who === o.j && (g.tone === "harm" || /\bdied\b/.test(g.text))).sort((a, b) => b.weight - a.weight)[0];
    if (hurt) { out.push(`Close to ${who(ctx, o.j)}, though ${linked(ctx, lowerFirst(hurt.text).replace(/\.$/, ""))} (${esc(yearLabel(r, hurt.k))}).`); continue; }
    const f = toned(r, i, o.j, k, "help"); const times = f ? lifeFacts(r, i, k).filter((g) => g.text === f.text).length : 0; out.push(`Close to ${who(ctx, o.j)}${f ? ` — ${linked(ctx, f.text.replace(/\.$/, ""))} (${times > 1 ? `${num(times)} times` : esc(yearLabel(r, f.k))})` : ""}.`); }
  return out;
}
/** the weightiest thing between two people, for saying why they stand as they do */
function lastWhy(r: R, i: number, j: number, k: number): Fact | undefined {
  const ni = nameOf(r, i), nj = nameOf(r, j);
  return lifeFacts(r, i, k).filter((f) => (f.deed || f.kind === "refused") && ((f.who === i && f.whom === j) || (f.who === j && f.whom === i)) && f.text.includes(ni) && f.text.includes(nj)).sort((a, b) => b.weight - a.weight || b.k - a.k)[0];
}
function statusWord(r: R, i: number, k: number): string {
  const p = personNow(r, i, k);
  if (!p.alive) { const c = r.citizens[i]; return p.gone ? "gone" : `died ${esc(whenOf(r, (c.diedAt ?? 1) - 1))}`; }
  return "alive";
}
function personCard(ctx: Ctx, i: number, k: number): string {
  const r = ctx.r; const c = r.citizens[i]; const p = personNow(r, i, k);
  const did = didTo(r, i, k, p.alive ? 3 : 2), done = doneTo(r, i, k, 2);
  const befell = lifeFacts(r, i, k).filter((f) => f.who === i && ["sick", "hungry", "homeless", "hurt", "money"].includes(f.kind) && !/had money/.test(f.text)).sort((a, b) => b.weight - a.weight).slice(0, 2).sort((a, b) => a.k - b.k);
  const epigraph = voiceLines(r, i, k, 8).sort((a, b) => b.weight - a.weight)[0];
  const last = voiceOf(r, i, k).at(-1);
  const carry = carrying(ctx, i, k);
  // their life as told by the chronicler, if enough of it stands against the record as it is now
  const pt = ctx.telling?.portraits?.[i]; const ptLines = pt ? recheck(r, pt.lines, true, woundOf(r, i, pt.k)?.id) : [];
  const told0 = ptLines.flat().length >= 5 ? `${pt!.title ? `<p class="ptitle">“${esc(pt!.title)}”</p>` : ""}${told(ctx, ptLines, { cls: "card" })}` : "";
  const moment = (f: Fact) => lowerFirst(f.text.replace(new RegExp(`^${nameOf(r, i)} `), "")).split(/(?<=\.)\s/)[0].replace(/\.$/, "");
  return `<article class="card${p.alive ? "" : " dead"}">
  <a class="card-head" href="${ctx.base}/p/${encodeURIComponent(c.id)}">${face(r, i, k, "l")}<span><b class="nm">${esc(c.name)}</b><span class="role">${esc(c.role)}, ${c.age + Math.floor(Math.min(k, (c.diedAt ?? 999) - 1) / 4)} · ${statusWord(r, i, k)}</span></span></a>
  ${epigraph ? `<p class="epi">${quote(epigraph.quote)} <span class="ctx">— ${esc(whenOf(r, epigraph.k))}, when ${esc(nameOf(r, i))} ${linked(ctx, moment(epigraph))}</span></p>` : ""}
  <p class="wants">Wants ${esc(c.want)}. Fears ${esc(c.fear)}.</p>
  ${household(ctx, i, k)}
  ${told0 ? `<div class="cardtold">${told0}</div>` : ""}<details class="entries"${told0 ? "" : " open"}><summary>${p.alive ? "Their years so far" : "Their years"}, moment by moment</summary><ol class="story">${storyOf(r, i, k).map((f) => `<li class="${f.tone}">${f.who === i && f.quote && f.deed && f.id !== epigraph?.id ? `<q class="voice">${esc(f.quote)}</q><span class="deedline">${when(r, f.k)} ${linked(ctx, f.text)}</span>` : `${when(r, f.k)} ${linked(ctx, f.text)}`}</li>`).join("")}</ol></details>
  ${carry.length && p.alive ? `<h4>Now</h4><ul class="carry">${carry.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
  ${last && p.alive && last.id !== epigraph?.id ? `<p class="last"><span class="sc">Last heard</span> ${quote(last.quote)} <span class="ctx">— ${esc(whenOf(r, last.k))}, as ${esc(nameOf(r, i))} ${esc(moment(last))}</span></p>` : ""}
  <a class="more" href="${ctx.base}/p/${encodeURIComponent(c.id)}">${esc(first(c.name))}’s life →</a>
</article>`;
}
/** the one quarrel and the one friendship that ran longest through their years, gathered into a line each */
function longest(ctx: Ctx, i: number, k: number): string {
  const r = ctx.r; const mine = pairs(r, k).filter((p) => p.a === i || p.b === i);
  const line = (p: any, word: string) => { const j = p.a === i ? p.b : p.a; const all = p.facts.filter((f: Fact) => f.deed).sort((a: Fact, b: Fact) => a.k - b.k);
    const fs = all.filter((f: Fact) => (f.who === i || f.who === j) && (f.whom === i || f.whom === j)); if (fs.length < 2) return "";
    const kind = /friendship|dealings/.test(word) ? "help" : "harm"; const firstF = fs.find((f: Fact) => f.tone === kind) ?? fs[0], lastF = fs[fs.length - 1];
    const inside = fs.filter((f: Fact) => f.tone === "harm" && f.k >= firstF.k && f.weight >= 5).sort((a: Fact, b: Fact) => b.weight - a.weight)[0];
    const death = inside ?? all.find((f: Fact) => /\bdied\b/.test(f.text) && f.tone === "harm");
    const though = death && kind === "help" ? ` Though: ${linked(ctx, death.text)}` : "";
    return `<li><b>${word}</b> ${who(ctx, j)}: ${num(fs.length)} things between them from ${esc(yearLabel(r, firstF.k))} to ${esc(yearLabel(r, lastF.k))}. It began: ${linked(ctx, firstF.text.split(/(?<=\.)\s/)[0])} The last: ${linked(ctx, lastF.text.split(/(?<=\.)\s/)[0])}${though}</li>`; };
  const tieNow = (p: any) => { const j = p.a === i ? p.b : p.a; const kk = Math.min(k, (r.citizens[i].diedAt ?? 999) - 2, (r.citizens[j].diedAt ?? 999) - 2); return (r.frames?.[Math.max(0, kk)]?.ties?.[i] ?? {})[r.citizens[j].id] ?? 0; };
  const q = mine.filter((p) => p.harm > p.help || tieNow(p) <= -0.2).sort((a, b) => b.facts.length - a.facts.length)[0];
  const f = mine.filter((p) => p !== q && p.help >= p.harm).sort((a, b) => b.facts.length - a.facts.length)[0];
  const items = [q ? line(q, "The long quarrel, with") : "", f ? line(f, tieNow(f) >= 0.3 ? "The long friendship, with" : "Long dealings, with") : ""].filter(Boolean);
  return items.length ? `<ul class="carry long">${items.join("")}</ul>` : "";
}
const heaviest = (fs: Fact[]) => [...fs].sort((a, b) => b.weight - a.weight)[0];
const lowerFirst = (s: string) => (/^[A-Z][a-z]+\b/.test(s) && !/^(The|A|An|It|By|People|Bread|Nobody|Nothing)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

// ---------- what passed between people ----------
function reactionsTo(r: R, f: Fact): Fact[] {
  return factsAt(r, f.k).filter((x) => x.kind === "reaction" && x.whom === f.who && f.whom != null && x.names.includes(f.whom));
}
/** what two people were to each other, if the record says: married */
function kin(r: R, a: number, b: number, k: number): string {
  const h = householdOf(r, a, k).partners.find((p) => p.j === b);
  return h ? ` <span class="kin">married${h.from === 0 ? "" : ` ${esc(yearLabel(r, h.from))}`}</span>` : "";
}
function betweenBlock(ctx: Ctx, k: number, limit = 6): string {
  const r = ctx.r; const named = new Set(four(r).map((x) => x.i));
  const all = pairs(r, k).filter((p) => named.has(p.a) || named.has(p.b));
  // feuds and bonds both: the harm is not the whole of what passed between people, and ranked by harm alone the loyalty goes missing
  // among the four themselves first: what they did to each other is the centre of it
  const inner = all.filter((p) => named.has(p.a) && named.has(p.b) && p.facts.some((f) => f.deed && f.weight >= 6)).slice(0, 3);
  const rest = all.filter((p) => !inner.includes(p));
  const bonds = rest.filter((p) => p.help > p.harm).slice(0, Math.max(1, Math.ceil((limit - inner.length) / 2)));
  const feuds = rest.filter((p) => p.help <= p.harm).slice(0, Math.max(0, limit - inner.length - bonds.length));
  const ps = [...inner, ...[...feuds, ...bonds].sort((x, y) => y.weight - x.weight)];
  if (!ps.length) return "";
  return `<div class="pairs">${ps.map((p) => {
    const deeds = p.facts.filter((f) => f.deed);
    const groups: { f: Fact; ks: number[]; w: number }[] = [];
    for (const f of deeds) { const g = groups.find((x) => x.f.text === f.text); if (g) { g.ks.push(f.k); g.w += f.weight; } else groups.push({ f, ks: [f.k], w: f.weight }); }
    const top = [...groups].sort((a, b) => b.w - a.w).slice(0, 3).sort((a, b) => a.ks[0] - b.ks[0]);
    const tone = p.facts.some((f) => f.deed && f.tone === "harm") && p.help > 0 ? "both" : p.harm > p.help * 1.5 ? "harm" : p.help > p.harm * 1.5 ? "help" : "both";
    const rows = top.map((g) => {
      const f = g.f; const re = g.ks.length === 1 ? reactionsTo(r, f) : [];
      const less = re.filter((x) => x.tone === "harm").map((x) => nameOf(r, x.who)); const more = re.filter((x) => x.tone === "help").map((x) => nameOf(r, x.who));
      const react = less.length ? ` <span class="react">${listOf(less)} thought less of ${esc(nameOf(r, f.who))} for it.</span>` : more.length ? ` <span class="react">${listOf(more)} thought better of ${esc(nameOf(r, f.who))} for it.</span>` : "";
      const whenTxt = g.ks.length > 1 ? `<span class="when">${esc(g.ks.map((x) => yearLabel(r, x).replace("Year ", "Y")).join(", "))}</span>` : when(r, f.k);
      const widow = f.whom != null && f.whom !== p.a && f.whom !== p.b ? (p.a === f.who ? p.b : p.a) : -1;
      const note = widow >= 0 ? ` <span class="react">${esc(nameOf(r, f.whom!))} had been married to ${esc(nameOf(r, widow))}.</span>` : "";
      return `<li class="${f.tone}">${whenTxt} ${linked(ctx, f.text)}${note}${g.ks.length > 1 ? ` <span class="aside">(${num(g.ks.length)} times)</span>` : ""}${f.quote && g.ks.length === 1 ? ` <span class="their">${esc(nameOf(r, f.who))}, to themselves: ${quote(f.quote)}</span>` : ""}${react}</li>`;
    }).join("");
    const firstDeed = [...deeds].sort((a, b) => a.k - b.k || a.id.localeCompare(b.id))[0];
    const began = firstDeed && !top.some((g) => g.f.text === firstDeed.text) ? `<p class="began"><span class="sc">It began</span> ${when(r, firstDeed.k)} ${linked(ctx, firstDeed.text)}${firstDeed.quote ? ` <span class="their">${esc(nameOf(r, firstDeed.who))}, to themselves: ${quote(firstDeed.quote)}</span>` : ""}</p>` : "";
    const shown = top.reduce((a, g) => a + g.ks.length, 0) + (began ? 1 : 0); const more = deeds.length - shown;
    const who0 = named.has(p.a) ? p.a : p.b;
    return `<section class="pair ${tone}"><h3>${face(r, p.a, k, "s")}${face(r, p.b, k, "s")} ${who(ctx, p.a)} <span class="and">and</span> ${who(ctx, p.b)}${kin(r, p.a, p.b, k)} <span class="kin">${tone === "help" ? "kept faith" : tone === "harm" ? "at war" : "both"}</span></h3>${began}<ol>${rows}</ol>${more > 0 ? `<p class="aside">and ${num(more)} more thing${more === 1 ? "" : "s"} between them, in <a href="${ctx.base}/p/${encodeURIComponent(r.citizens[who0].id)}#between">${esc(nameOf(r, who0))}’s life</a>.</p>` : ""}</section>`;
  }).join("")}</div>`;
}

// ---------- the years ----------
function yearBlock(ctx: Ctx, y: number, upto: number, open: boolean): string {
  const r = ctx.r; const ks = [0, 1, 2, 3].map((s) => y * 4 + s).filter((k) => k <= upto);
  if (!ks.length) return "";
  const lastK = ks[ks.length - 1];
  const epoch = (r.events ?? []).filter((e: any) => e.at - 1 >= y * 4 && e.at - 1 < y * 4 + 4).map((e: any) => e.headline);
  const deaths = r.citizens.map((c: any, i: number) => ({ c, i })).filter((x: any) => x.c.diedAt && x.c.diedAt - 1 >= y * 4 && x.c.diedAt - 1 < y * 4 + 4 && x.c.diedAt - 1 <= upto);
  const how: Record<string, string> = { hunger: "hunger", sickness: "the sickness", exposure: "the cold", violence: "violence", "old age": "old age", childbirth: "childbirth", accident: "an accident" };
  const top = ledger(r).slice(y * 4, Math.min(upto + 1, y * 4 + 4)).flat().filter((f) => f.deed).sort((a, b) => b.weight - a.weight)[0];
  const deathHow = (d: any) => { const k0 = d.c.diedAt - 1; const N = nameOf(r, d.i);
    const f = factsAt(r, k0).find((g) => g.deed && g.whom === d.i && new RegExp(`\\b${N} died`).test(g.text)) ?? factsAt(r, k0).find((g) => g.deed && g.who === d.i && /\bdied trying\b|\bdid not come back\b/.test(g.text));
    return f ? `${N} (${f.text.split(/(?<=\.)\s/)[0].replace(/\.$/, "").replace(new RegExp(`^${N} `), "")})` : `${N} (${how[d.c.cause] ?? d.c.cause})`; };
  const died = deaths.map((d: any) => deathHow(d));
  const topLine = top ? top.text.split(/(?<=\.)\s/)[0] : "";
  const sum = [epoch.join(" "), topLine && !died.some((x: string) => x.includes(topLine.replace(/\.$/, "").replace(/^\w+ /, ""))) ? topLine : "", died.length ? `Died: ${died.join("; ")}.` : ""].filter(Boolean).join(" ");
  const body = ks.map((k) => `<section class="season" id="s${k + 1}"><h4>${esc(whenOf(r, k).replace(/^Year \d+, /, ""))}</h4>${seasonTold(ctx, k)}</section>`).join("");
  return `<details class="year"${open ? " open" : ""}><summary><span class="y">${esc(yearLabel(r, lastK))}</span>${sum ? ` <span class="ysum">${esc(sum)}</span>` : ""}</summary>${body}</details>`;
}

// ---------- the pages ----------
// ---------- the front page, as a picture ----------
const SEASON_COL: Record<string, string> = { spring: "#8fb065", summer: "#b3b05a", autumn: "#b98a4a", winter: "#d6dbe2" };
/** where somebody spent the season: their evening's place if they went to somebody, else where the day kept them */
function whereOf(r: R, i: number, k: number): string | null {
  const f = r.frames?.[k]; if (!f || f.at?.[i] == null) return null;
  const ev = f.evening?.[i]; if (ev?.startsWith?.("visit:")) { const j = r.citizens.findIndex((c: any) => c.id === ev.slice(6)); if (j >= 0 && f.at[j] != null) return f.at[j]; }
  return f.at[i];
}
/** The town, drawn: its places, everyone living where the season found them, the dead in a row of graves. Static. */
function sceneBlock(ctx: Ctx, k: number): string {
  const r = ctx.r; const locs = r.map?.locations ?? [];
  const place = (id: string) => locs.findIndex((l: any) => l.id === id);
  const pos = (n: number) => { const l = locs[n]; if (l && l.x != null && l.y != null) return { x: 12 + l.x * 76, y: 18 + l.y * 56 }; const a = (n / Math.max(1, locs.length)) * Math.PI * 2; return { x: 50 + 34 * Math.cos(a), y: 46 + 24 * Math.sin(a) }; };
  const t = townNow(r, k);
  const byPlace = new Map<number, number[]>();
  r.citizens.forEach((_: any, i: number) => { const w = whereOf(r, i, k); if (w == null) return; const n = place(w); if (n < 0) return; (byPlace.get(n) ?? byPlace.set(n, []).get(n)!).push(i); });
  const people = [...byPlace.entries()].flatMap(([n, is]) => is.map((i, m) => { const p = pos(n); const ang = (m / Math.max(1, is.length)) * Math.PI * 2 + 0.6; const rad = is.length > 1 ? 7 : 0; return { i, x: p.x + rad * Math.cos(ang), y: p.y + 9 + rad * 0.8 * Math.sin(ang) }; }));
  const dead = r.citizens.map((c: any, i: number) => ({ c, i })).filter(({ c }: any) => c.diedAt && c.diedAt - 1 <= k);
  const data = { places: locs.map((l: any, n: number) => ({ ...pos(n), tags: l.tags ?? [], id: l.id })), paths: (r.map?.paths ?? []).map(([a, b]: string[]) => [place(a), place(b)]), season: t.season, epoch: t.epoch?.kind ?? null, graves: dead.length, seed: r.seed ?? 1 };
  return `<div class="scene" data-scene='${esc(JSON.stringify(data))}' style="--ground:${SEASON_COL[t.season]}">
  <canvas class="scene-bg" width="240" height="132" aria-hidden="true"></canvas>
  ${locs.map((l: any, n: number) => { const p = pos(n); return `<span class="pl" style="left:${p.x}%;top:${p.y - 7}%">${esc(l.name)}</span>`; }).join("")}
  ${people.map(({ i, x, y }) => { const c = r.citizens[i]; const pn = personNow(r, i, k); const mark = pn.food === "hungry" ? sprite("bread", "#c98a2a", 10) : pn.sick ? sprite("drop", "#6f8a3a", 10) : pn.moodV <= -0.25 ? sprite("cloud", "#7d7aa0", 10) : pn.moodV >= 0.2 ? sprite("sun", "#d8b83a", 10) : "";
    return `<a class="who-at${c.named ? " named" : ""}" href="${ctx.base}/p/${encodeURIComponent(c.id)}" style="left:${x}%;top:${y}%" title="${esc(c.name)}">${face(r, i, k, c.named ? "m" : "s")}${mark ? `<span class="mk">${mark}</span>` : ""}<span class="nm">${esc(first(c.name))}</span></a>`; }).join("")}
  <div class="graves">${dead.map(({ c, i }: any) => `<a href="${ctx.base}/p/${encodeURIComponent(c.id)}" title="${esc(c.name)} — died ${esc(whenOf(r, c.diedAt - 1))}">${sprite("grave", "#6b6257", 14)}<span>${esc(first(c.name))}</span></a>`).join("")}</div>
</div>`;
}
/** one of the four as a tile: the face, the state in pixels, a thought in a bubble, three marks of the life */
function tile(ctx: Ctx, i: number, k: number): string {
  const r = ctx.r; const c = r.citizens[i]; const p = personNow(r, i, k);
  const voice = voiceOf(r, i, k); const lastQ = voice.at(-1); const big = [...voiceLines(r, i, k, 8)].sort((a, b) => b.weight - a.weight)[0];
  const said = p.alive ? lastQ : big ?? lastQ;
  const bubble = said?.quote ? said.quote.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") : "";
  const chips = [p.alive ? "" : sprite("grave", "#8a8078", 18, `died ${whenOf(r, p.diedAt ?? k)}`), p.food === "hungry" ? sprite("bread", "#c98a2a", 18, "hungry") : "", p.sick ? sprite("drop", "#6f8a3a", 18, "sick") : "",
    p.alive && p.moodV <= -0.25 ? sprite("cloud", "#7d7aa0", 18, p.mood) : "", p.alive && p.moodV >= 0.2 ? sprite("sun", "#d8b83a", 18, "in good spirits") : "",
    ...p.lost.slice(0, 3).map((j) => sprite("grave", "#6b6257", 18, `lost ${nameOf(r, j)}`)), householdOf(r, i, k).partners.length ? sprite("ring", "#c9a64a", 18, "married") : ""].filter(Boolean).join("");
  const marks = storyOf(r, i, k, 16).filter((f) => f.deed || f.kind === "death" || f.kind === "turned").sort((a, b) => b.weight - a.weight).slice(0, 3).sort((a, b) => a.k - b.k);
  const short = (t: string) => t.split(/(?<=\.)\s/)[0].replace(/\s*\(Earlier between them:.*$/, "").replace(/\.$/, "");
  return `<a class="tile${p.alive ? "" : " dead"}" href="${ctx.base}/p/${encodeURIComponent(c.id)}">
  <span class="tile-face">${face(r, i, k, "xl")}</span>
  <span class="tile-name"><b>${esc(first(c.name))}</b><small>${esc(c.role)}, ${c.age + Math.floor(Math.min(k, (c.diedAt ?? 999) - 1) / 4)}${p.alive ? "" : ` · died ${esc(yearLabel(r, (c.diedAt ?? 1) - 1))}`}</small></span>
  <span class="chips">${chips}</span>
  ${marks.length ? `<span class="sofar">${marks.map((f) => `<span class="${f.kind === "death" ? "loss" : f.tone === "harm" ? "harm" : "help"}">${esc(short(f.text))}</span>`).join("")}</span>` : ""}
  ${bubble ? `<span class="bubble"><q>${esc(bubble)}</q><small>${esc(first(c.name))}, to themselves, ${esc(whenOf(r, said!.k))}</small></span>` : ""}
</a>`;
}
/** who hurt and who saved whom: the four and those most tangled with them, as faces joined by red and green threads */
function webBlock(ctx: Ctx, k: number): string {
  const r = ctx.r; const named = four(r).map((x) => x.i);
  const ps = pairs(r, k).filter((p) => named.includes(p.a) || named.includes(p.b)).slice(0, 12);
  const nodes = [...new Set([...named, ...ps.flatMap((p) => [p.a, p.b])])].slice(0, 9);
  const at = (n: number) => { const a = -Math.PI / 2 + (n / nodes.length) * Math.PI * 2; return { x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) }; };
  const P = new Map(nodes.map((i, n) => [i, at(n)]));
  const lines = ps.filter((p) => P.has(p.a) && P.has(p.b)).map((p) => {
    const A = P.get(p.a)!, B = P.get(p.b)!; const married = householdOf(r, p.a, k).partners.some((x) => x.j === p.b);
    const col = married ? "#c9a64a" : p.harm > p.help ? "#c2503f" : p.help > p.harm ? "#5f9a4f" : "#9a8a6a";
    const top = [...p.facts].filter((f) => f.deed).sort((a, b) => b.weight - a.weight)[0];
    const w = Math.min(7, 1.5 + p.weight / 25);
    return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" vector-effect="non-scaling-stroke"><title>${esc(nameOf(r, p.a))} and ${esc(nameOf(r, p.b))}${top ? `: ${esc(top.text.split(/(?<=\.)\s/)[0])}` : ""}</title></line>`;
  }).join("");
  const heavy = ps.filter((p) => named.includes(p.a) && named.includes(p.b) || p.weight > 40).slice(0, 3).map((p) => { const f = [...p.facts].filter((x) => x.deed).sort((a, b) => b.weight - a.weight)[0]; return f ? `<li class="${f.tone}">${sprite(spriteFor(f.kind, f.tone), "currentColor", 14)} <i>${esc(yearLabel(r, f.k).replace("Year ", "Y"))}</i> ${linked(ctx, f.text.split(/(?<=\.)\s/)[0])}</li>` : ""; }).join("");
  return `<div class="web"><div class="web-pic"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes.map((i) => { const q = P.get(i)!; const c = r.citizens[i]; return `<a class="node${c.named ? " named" : ""}" href="${ctx.base}/p/${encodeURIComponent(c.id)}" style="left:${q.x}%;top:${q.y}%" title="${esc(c.name)}">${face(r, i, k, c.named ? "m" : "s")}<span>${esc(first(c.name))}</span></a>`; }).join("")}</div>
  <div class="web-key"><span><i style="background:#c2503f"></i>harm</span><span><i style="background:#5f9a4f"></i>kindness</span><span><i style="background:#c9a64a"></i>married</span><span class="aside">thicker is more between them</span></div>
  ${heavy ? `<ul class="heavy">${heavy}</ul>` : ""}</div>`;
}
/** fifteen years as sixty squares: the season's colour, the hardship over it, a grave where someone died */
function stripBlock(ctx: Ctx, k: number): string {
  const r = ctx.r; const total = r.hours ?? 60;
  const cells = Array.from({ length: total }, (_, x) => {
    const ep = (r.events ?? []).find((e: any) => e.seasons && x + 1 >= e.at && x + 1 < e.at + e.seasons);
    const died = r.citizens.filter((c: any) => c.diedAt === x + 1).map((c: any) => first(c.name));
    const cls = x > k ? "future" : ep ? `ep-${ep.kind}` : `s-${SEASON_NAMES[x % 4]}`;
    const tip = `${whenOf(r, x)}${ep ? ` — ${ep.headline}` : ""}${died.length ? ` — died: ${died.join(", ")}` : ""}`;
    return `<a class="sq ${cls}${x === k ? " now" : ""}" href="${ctx.base}/years#s${x + 1}" title="${esc(tip)}">${died.length ? sprite("grave", "#2a241e", 10) : ""}</a>`;
  }).join("");
  return `<div class="yearstrip">${cells}</div><div class="strip-key"><span class="sq s-spring"></span>spring <span class="sq s-summer"></span>summer <span class="sq s-autumn"></span>autumn <span class="sq s-winter"></span>winter <span class="sq ep-famine"></span>hardship ${sprite("grave", "currentColor", 10)} a death · <a href="${ctx.base}/years">every season, told →</a></div>`;
}

// ---------- the story as frames ----------
const EPOCH_SPRITE = (kind: string) => (kind === "winter" ? "snow" : kind === "famine" ? "wheat" : kind === "fire" ? "flame" : kind === "war" ? "sword" : kind === "plague" ? "skull" : "dot");
/** the moments of a year worth a frame: every death, and the weightiest deeds that touch the four, in order */
function framesOf(r: R, y: number, upto: number, named: string[] = []): Fact[] {
  const four = new Set(r.citizens.map((c: any, i: number) => (c.named ? i : -1)).filter((i: number) => i >= 0));
  const fs = [0, 1, 2, 3].map((s) => y * 4 + s).filter((k) => k <= upto).flatMap((k) => factsAt(r, k));
  const deaths = fs.filter((f) => f.kind === "death");
  const told = new Set(deaths.map((f) => f.who));
  const deeds = fs.filter((f) => (f.deed || f.kind === "marry") && f.names.some((i) => four.has(i)) && !(f.whom != null && told.has(f.whom) && /\bdied\b/.test(f.text) === false && false));
  const byDeath = deaths.map((d) => fs.find((f) => f.deed && f.k === d.k && f.whom === d.who && /\bdied\b/.test(f.text)) ?? d);
  // the heaviest blow and the heaviest kindness first, so a year shows both sides of what people did; then the next heaviest
  const rest = [...deeds].filter((f) => !byDeath.includes(f)).sort((a, b) => b.weight - a.weight);
  const told2 = rest.filter((f) => named.includes(f.id)); // what the year's own telling names is shown first, so the card and its shots agree
  const pick: Fact[] = told2.slice(0, 2); const room = Math.max(1, 3 - byDeath.length);
  for (const t of ["harm", "help"]) { const f = rest.find((x) => (x.tone === t || (t === "help" && x.tone === "joy")) && !pick.includes(x)); if (f && pick.length < room) pick.push(f); }
  for (const f of rest) if (pick.length < room && !pick.includes(f) && !pick.some((p) => p.who === f.who && p.whom === f.whom)) pick.push(f);
  const top = pick;
  return [...new Set([...byDeath, ...top])].sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
}
/** what followed from a deed, as the ledger has it: who heard of it and thought better or less of the doer, and who
 *  turned against or grew close to whom over it. Only facts of the same season that name the deed. */
function aftermathOf(r: R, f: Fact): { tone: string; faces: number[]; text: string; turn?: boolean }[] {
  const core = f.text.split(/(?<=\.)\s/)[0].replace(/\.$/, "");
  const at = factsAt(r, f.k); const out: { tone: string; faces: number[]; text: string; turn?: boolean }[] = [];
  const heard = at.filter((x) => x.kind === "reaction" && x.whom === f.who && x.text.includes(core));
  for (const t of ["less", "better"]) {
    const ns = [...new Set(heard.filter((x) => x.text.includes(`thought ${t} of`)).map((x) => x.who))]; if (!ns.length) continue;
    const list = ns.length === 1 ? nameOf(r, ns[0]) : ns.slice(0, -1).map((i) => nameOf(r, i)).join(", ") + " and " + nameOf(r, ns[ns.length - 1]);
    out.push({ tone: t === "less" ? "harm" : "help", faces: ns, text: `${list} thought ${t} of ${nameOf(r, f.who)}` });
  }
  const tail = core.replace(/^\S+\s/, "");
  for (const x of at.filter((x) => x.kind === "bond" && /\(([^)]*)\)/.test(x.text) && x.text.match(/\(([^)]*)\)/)![1].startsWith(tail.slice(0, 24)))) out.push({ tone: x.tone === "harm" ? "harm" : "help", faces: [x.who], text: x.text.replace(/\s*\([^)]*\)/, "").replace(/\.$/, "") });
  // the one turn that matters for the story: when the harm someone had done came to outweigh their good
  for (const x of at.filter((x) => x.kind === "turned" && x.who === f.who)) out.push({ tone: "harm", faces: [], text: x.text.replace(/\.$/, ""), turn: true });
  return out.slice(0, 3);
}
/** One shot: the place in its season and weather, the people standing in it with the look of that moment, the mark of what
 *  happened between them, and beneath it — as subtitles — the line that says it and what the one who did it told
 *  themselves. Every part is drawn from the ledger; nothing in a shot is written for it. */
function frame(ctx: Ctx, f: Fact): string {
  const r = ctx.r; const locs = r.map?.locations ?? [];
  const placeName = f.place ?? locs.find((l: any) => l.id === r.frames?.[f.k]?.at?.[f.who])?.name ?? "";
  const loc = locs.find((l: any) => l.name === placeName);
  const ep = (r.events ?? []).find((e: any) => e.seasons && f.k + 1 >= e.at && f.k + 1 < e.at + e.seasons);
  const death = f.kind === "death" || /\bdied\b/.test(f.text);
  const tone = death ? "loss" : f.tone === "harm" ? "harm" : f.tone === "help" || f.tone === "joy" ? "help" : "plain";
  const actor = f.who, other = f.whom != null && f.whom !== f.who ? f.whom : undefined;
  const deadNow = (i: number) => r.citizens[i]?.diedAt === f.k + 1 || (f.kind === "death" && i === f.who);
  const moodOf = (i: number, role: "a" | "b") => deadNow(i) ? "dead" : role === "a" ? (tone === "harm" ? "angry" : tone === "help" ? "glad" : "calm") : (tone === "harm" ? "hungry" : tone === "help" ? "glad" : "calm");
  const ink = tone === "harm" ? "#e0735f" : tone === "help" ? "#8cc47f" : tone === "loss" ? "#e8e0cf" : "#e0c46a";
  const mark = death ? sprite("grave", "#e8e0cf", 30) : sprite(spriteFor(f.kind, f.tone), ink, 30);
  // how the shot is framed follows what happened: the one who struck in front and the one struck small behind; for a mercy
  // the one wronged in front and the one who let it go walking off; the two close for a kindness; a council's faces in a row
  const k0 = f.kind; const council = /\bcouncil\b/.test(f.text);
  const shot = death ? "grave" : other == null ? "solo" : council ? "council" : k0 === "mercy" ? "mercy" : tone === "harm" ? "blow" : tone === "help" ? "close" : "apart";
  const pos: { a: number; b?: number } = { grave: { a: 24, b: 76 }, solo: { a: 50 }, council: { a: 30, b: 70 }, mercy: { a: 80, b: 30 }, blow: { a: 30, b: 74 }, close: { a: 38, b: 62 }, apart: { a: 28, b: 72 } }[shot]!;
  const back = shot === "blow" ? "b" : shot === "mercy" ? "a" : "";
  const alive = r.citizens.map((_: any, i: number) => i).filter((i: number) => i !== actor && i !== other && !(r.citizens[i].diedAt && r.citizens[i].diedAt <= f.k + 1));
  const crowd = shot === "council" ? alive.slice(0, 6) : [];
  const data = { season: SEASON_NAMES[f.k % 4], epoch: ep?.kind ?? null, tags: loc?.tags ?? [], evening: f.kind === "evening", grave: death, seed: (r.seed ?? 1) * 100 + f.k * 7 + (f.who ?? 0) };
  const q = f.quote ? f.quote.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") : "";
  const bust = (i: number, side: "a" | "b") => `<a class="fwho ${side}${back === side ? " back" : ""}" style="left:${side === "a" ? pos.a : pos.b}%" href="${ctx.base}/p/${encodeURIComponent(r.citizens[i].id)}"><span class="fbust"><canvas class="px" data-i="${i}" data-mood="${moodOf(i, side)}" data-res="44" data-ink="none" width="44" height="44" aria-label="${esc(r.citizens[i].name)}"></canvas></span><span class="fname">${esc(nameOf(r, i))}</span></a>`;
  return `<figure class="frame ${tone}" id="f${f.id.replace(".", "-")}">
  <div class="slate"><span>${esc(whenOf(r, f.k))}</span>${placeName ? `<span>${esc(placeName)}</span>` : ""}</div>
  <div class="fscene" data-scene='${esc(JSON.stringify(data))}'><canvas class="fscene-bg" width="176" height="76" aria-hidden="true"></canvas>
    ${crowd.length ? `<span class="crowd">${crowd.map((i: number) => `<span class="cf"><canvas class="px" data-i="${i}" data-mood="calm" data-res="28" data-ink="none" width="28" height="28"></canvas></span>`).join("")}</span>` : ""}
    ${death && f.kind === "death" ? `<span class="ghost"><canvas class="px" data-i="${f.who}" data-mood="dead" data-res="36" data-ink="none" width="36" height="36"></canvas></span>` : ""}
    ${death && f.kind === "death" ? "" : bust(actor, "a")}${other != null ? `<span class="fmark" style="left:${(pos.a + (pos.b ?? pos.a)) / 2}%">${mark}</span>${bust(other, "b")}` : `<span class="fmark solo">${mark}</span>`}
  </div>
  <figcaption class="subs"><span class="sub">${linked(ctx, f.text.split(/(?<=\.)\s/).filter((x) => !/^\(Earlier/.test(x)).slice(0, 2).join(" "))}</span>
    ${q ? `<span class="subq"><q>${esc(q)}</q> <small>— ${esc(nameOf(r, actor))}, to themselves</small></span>` : ""}</figcaption>
  ${(() => { const af = aftermathOf(r, f); return af.length ? `<p class="after"><span class="then">then</span>${af.map((a) => `<span class="af ${a.tone}${a.turn ? " turn" : ""}">${a.faces.slice(0, 3).map((i) => faceAs(r, i, a.tone === "harm" ? "angry" : "calm", "s")).join("")}${linked(ctx, a.text)}</span>`).join("")}</p>` : ""; })()}
</figure>`;
}
/** the last card of the film so far: when the next season comes, what hardship is on its way, and the wrongs between the
 *  four where the last thing that passed between two of them was a harm */
function nextCard(ctx: Ctx, k: number): string {
  const r = ctx.r; if (!ctx.live) return "";
  const a = ahead(r, k); const named = new Set(four(r).map((x) => x.i));
  const aliveAt = (i: number) => !(r.citizens[i].diedAt && r.citizens[i].diedAt <= k + 1);
  const open = pairs(r, k).filter((p) => (named.has(p.a) || named.has(p.b)) && aliveAt(p.a) && aliveAt(p.b) && p.harm > 0)
    .map((p) => ({ p, last: [...p.facts].sort((x, y) => y.k - x.k)[0] })).filter((x) => x.last && x.last.tone === "harm" && x.last.whom != null && k - x.last.k <= 8)
    .sort((x, y) => y.last.k - x.last.k || y.p.harm - x.p.harm).slice(0, 2);
  const when = ctx.nextAt ? `<time datetime="${new Date(ctx.nextAt).toISOString()}">${new Date(ctx.nextAt).toISOString().slice(11, 16)} UTC</time>` : "";
  return `<section class="reel" id="next"><div class="title-card next"><span class="yr">Next</span>
    <p class="narr">${esc(SEASON_NAMES[(k + 1) % 4].replace(/^./, (c) => c.toUpperCase()))} comes at ${when}.${a.next && a.next.in <= 4 ? ` ${sprite(EPOCH_SPRITE(a.next.kind), "currentColor", 14)} In ${a.next.in === 1 ? "one season" : `${a.next.in} seasons`}: ${esc(a.next.headline)}` : ""}</p>
    ${open.length ? `<div class="open">${open.map(({ p, last }) => `<div class="op">${faceAs(r, last.who, "angry", "m")}<span class="vs">${sprite("dagger", "#e0735f", 16)}</span>${faceAs(r, last.whom!, "hungry", "m")}<span class="ot">${linked(ctx, last.text.split(/(?<=\.)\s/)[0])} <small>${esc(whenOf(r, last.k))} — the last that passed between them</small></span></div>`).join("")}</div>` : ""}
  </div></section>`;
}
/** the film: an intertitle for each year — its number, what came through the town, a line or two of the year told, the
 *  year's decisions as coloured squares — and then its shots */
function filmBlock(ctx: Ctx, k: number): string {
  const r = ctx.r; const years = Math.floor(k / 4) + 1;
  return `<div class="film">${Array.from({ length: years }, (_, y) => {
    const ep = (r.events ?? []).filter((e: any) => e.at - 1 >= y * 4 && e.at - 1 < y * 4 + 4 && e.at - 1 <= k);
    const ch = (ctx.telling as any)?.chapters?.[y]; const chLines = ch?.lines ? recheck(r, ch.lines, false, undefined, true).flat().slice(0, 2) : [];
    const dead = r.citizens.filter((c: any) => c.diedAt && c.diedAt - 1 >= y * 4 && c.diedAt - 1 < y * 4 + 4 && c.diedAt - 1 <= k);
    const fr = framesOf(r, y, k, chLines.flatMap((l) => l.c));
    return `<section class="reel" id="y${y + 1}">
      <div class="title-card"><span class="yr">Year ${y + 1}</span>
        ${ep.map((e: any) => `<span class="ep">${sprite(EPOCH_SPRITE(e.kind), "currentColor", 14)} ${esc(e.headline)}</span>`).join("")}
        ${dead.length ? `<span class="ep">${sprite("grave", "currentColor", 14)} ${dead.map((c: any) => esc(c.name)).join(", ")} died</span>` : ""}
        ${chLines.length ? `<p class="narr">${chLines.map((l) => `<span class="s" title="${esc(l.c.map((id) => factText(r, id).replace(/<[^>]+>/g, "")).join(" | "))}">${linked(ctx, l.t)}</span>`).join(" ")}</p>` : ""}
        ${!chLines.length && y === Math.floor(k / 4) ? `<p class="narr still">The year is still going.</p>` : ""}
        ${decisionsRow(ctx, y, k)}</div>
      ${fr.map((f) => frame(ctx, f)).join("")}
    </section>`; }).join("")}${nextCard(ctx, k)}</div>
  <p class="story-key"><span><i class="d harm"></i>a harm</span><span><i class="d help"></i>a kindness</span><span><i class="d plain"></i>neither</span><span><i class="d loss"></i>a death</span> · one square a decision · <a href="${ctx.base}/years">every season, with its record →</a></p>`;
}

/** A decision, as a colour: red where it harmed somebody, green where it was a kindness, grey where it was neither. */
const toneOf = (f: Fact) => (f.kind === "death" ? "loss" : f.tone === "harm" ? "harm" : f.tone === "help" || f.tone === "joy" ? "help" : "plain");
function decisionsRow(ctx: Ctx, y: number, upto: number): string {
  const r = ctx.r; const ks = [0, 1, 2, 3].map((s) => y * 4 + s).filter((x) => x <= upto);
  return `<div class="dots">${ks.map((x) => `<span class="dseason" title="${esc(whenOf(r, x))}">${factsAt(r, x).filter((f) => f.deed || f.kind === "choice" || f.kind === "death").map((f) => `<i class="d ${toneOf(f)}" title="${esc(f.text.split(/(?<=\.)\s/)[0])}"></i>`).join("")}</span>`).join("")}</div>`;
}
/** one season's sentences as the story tells them: checked against the record, coloured by what they report, sources on hover */
function storySentences(ctx: Ctx, k: number): string {
  const r = ctx.r; const p = ctx.telling?.seasons?.[k]; const lines = p ? recheck(r, p.lines).flat() : [];
  if (lines.length >= 2) return lines.map((l) => {
    const facts = l.c.map((id) => factById(r, id.split("#")[0])).filter(Boolean) as Fact[];
    const tone = facts.some((f) => f.kind === "death") ? "loss" : facts.some((f) => f.deed && f.tone === "harm") ? "harm" : facts.some((f) => f.deed && (f.tone === "help" || f.tone === "joy")) ? "help" : "";
    const src = l.c.map((id) => factText(r, id).replace(/<[^>]+>/g, "")).join(" | ");
    return `<span class="s ${tone}" title="${esc(src)}">${linked(ctx, l.t)}</span>`;
  }).join(" ");
  return plainSeason(r, k, 3).map((f) => `<span class="s ${f.deed ? toneOf(f) : ""}" title="${esc(`${whenOf(r, f.k)} · ${f.text}`)}">${linked(ctx, f.text.split(/(?<=\.)\s/)[0])}</span>`).join(" ");
}
function storyBlock(ctx: Ctx, k: number): string {
  const r = ctx.r; const years = Math.floor(k / 4) + 1;
  return `<div class="story2">${Array.from({ length: years }, (_, y) => {
    const ks = [0, 1, 2, 3].map((s) => y * 4 + s).filter((x) => x <= k);
    const ep = (r.events ?? []).filter((e: any) => e.at - 1 >= y * 4 && e.at - 1 < y * 4 + 4);
    const dead = r.citizens.map((c: any, i: number) => ({ c, i })).filter(({ c }: any) => c.diedAt && c.diedAt - 1 >= y * 4 && c.diedAt - 1 < y * 4 + 4 && c.diedAt - 1 <= k);
    const ch = (ctx.telling as any)?.chapters?.[y];
    const chLines = ch?.lines ? recheck(r, ch.lines, false, undefined, true).flat() : [];
    const prose = chLines.length >= 3 ? chLines.map((l) => `<span class="s" title="${esc(l.c.map((id) => factText(r, id).replace(/<[^>]+>/g, "")).join(" | "))}">${linked(ctx, l.t)}</span>`).join(" ") : ks.map((x) => storySentences(ctx, x)).join(" ");
    return `<article class="chap" id="y${y + 1}">
      <header><span class="yr">Year ${y + 1}</span>${ep.map((e: any) => `<span class="ep">${sprite(e.kind === "winter" ? "snow" : e.kind === "famine" ? "wheat" : e.kind === "fire" ? "flame" : e.kind === "war" ? "sword" : e.kind === "plague" ? "skull" : "dot", "currentColor", 12)} ${esc(e.headline)}</span>`).join("")}${dead.map(({ c, i }: any) => `<a class="gr" href="${ctx.base}/p/${encodeURIComponent(c.id)}" title="${esc(c.name)} died ${esc(whenOf(r, c.diedAt - 1))}">${sprite("grave", "currentColor", 12)} ${esc(first(c.name))}</a>`).join("")}</header>
      ${decisionsRow(ctx, y, k)}
      <p>${prose}</p>
    </article>`; }).join("")}</div>
  <p class="story-key"><span><i class="d harm"></i>a harm</span><span><i class="d help"></i>a kindness</span><span><i class="d plain"></i>a choice that was neither</span><span><i class="d loss"></i>a death</span> · one square a decision · <a href="${ctx.base}/years">every season, with its record →</a></p>`;
}

export function townPage(ctx: Ctx): string {
  const r = ctx.r; const k = played(r) - 1;
  if (k < 0) return shell(ctx, r.title, `<section class="intro"><h1>${esc(r.title)}</h1><p class="lede">${esc(r.premise)}</p><p>The first season has not happened yet.</p></section>`, "town");
  const t = townNow(r, k); const a = ahead(r, k);
  const tp = ctx.telling?.seasons?.[k]; const lines = tp ? recheck(r, tp.lines) : [];
  const passage = lines.flat().length >= 2 ? told(ctx, [lines.flat().slice(0, 4)], { cls: "now-told" }) : `<div class="told plain now-told"><p>${plainSeason(r, k, 3).map((f) => `<span class="s">${linked(ctx, f.text.split(/(?<=\.)\s/)[0])}</span>`).join(" ")}</p></div>`;
  const next = ctx.live && ctx.nextAt ? `next season <time datetime="${new Date(ctx.nextAt).toISOString()}">${new Date(ctx.nextAt).toISOString().slice(11, 16)} UTC</time>` : "the years are over";
  const h: H = { r, base: ctx.base, telling: ctx.telling, linked: (t) => linked(ctx, t), face: (i, mood, size) => faceAs(r, i, mood, size), faceNow: (i, kk, size) => face(r, i, kk, size), townSentence: (kk) => townSentence(r, kk) };
  const body = `
<section class="head">
  <h1>${esc(r.title)}</h1>
  <p class="head-when"><b>${esc(whenOf(r, k))}</b>${t.epoch ? ` · ${esc(t.epoch.headline)}` : ""} · ${next}</p>
  <p class="head-premise">${esc(r.premise ?? "")}</p>
</section>
${shelter(h, k)}
<section class="people"><h2>The four</h2>${four(r).sort((x, y) => (personNow(r, y.i, k).alive ? 1 : 0) - (personNow(r, x.i, k).alive ? 1 : 0)).map(({ i }) => bio(h, i, k)).join("")}
  <details class="others"><summary>The other ${num(r.citizens.length - four(r).length)} in town</summary>${r.citizens.map((c: any, i: number) => (c.named ? "" : bio(h, i, k))).join("")}</details>
</section>
<p class="more-link"><a href="${ctx.base}/years">The whole story, a year at a time →</a></p>`;
  return shell(ctx, `${r.title} — ${whenOf(r, k)}`, body, "town");
}

export function yearsPage(ctx: Ctx): string {
  const r = ctx.r; const k = played(r) - 1;
  const years = Array.from({ length: Math.max(0, Math.floor(k / 4) + 1) }, (_, y) => y);
  const body = `<section class="years all"><h1>The years</h1><p class="lede">${esc(r.title)}, told a season at a time from the first. Open <span class="sc">the record</span> under any season to see the facts it was written from.</p>${years.map((y) => yearBlock(ctx, y, k, true)).join("")}</section>`;
  return shell(ctx, `${r.title} — the years`, body, "years");
}

export function personPage(ctx: Ctx, id: string): string | null {
  const r = ctx.r; const i = r.citizens.findIndex((c: any) => c.id === id); if (i < 0) return null;
  const k = Math.max(0, played(r) - 1); const c = r.citizens[i]; const p = personNow(r, i, k);
  const wound = woundOf(r, i, k);
  const p0 = ctx.telling?.portraits?.[i];
  const portrait = p0 ? { ...p0, lines: recheck(r, p0.lines, true, woundOf(r, i, p0.k)?.id) } : undefined; const cs = contradictionsOf(r, i, k).slice(0, 2);
  const voice = voiceOf(r, i, k); const echo = wantEcho(r, i, k);
  const carry = carrying(ctx, i, k);
  const moments = keyMoments(r, i, k, 7);
  // everyone they had dealings with, and what passed
  const theirs = pairs(r, k).filter((x) => x.a === i || x.b === i).slice(0, 8);
  const strip = seasonStrip(r, i, k);
  const age = c.age + Math.floor(Math.min(k, (c.diedAt ?? 999) - 1) / 4);
  const body = `
<section class="person">
  <div class="phead">${face(r, i, k, "xl")}<div><h1>${esc(c.name)}</h1><p class="role">${esc(c.role)}${c.startRole && c.startRole !== c.role ? ` (${esc(c.startRole)} when the years began)` : ""}, ${age} · ${statusWord(r, i, k)}${c.named ? "" : " · one of the town, not of the four"}</p><p class="wants">Wants ${esc(c.want)}. Fears ${esc(c.fear)}.</p></div></div>
  ${strip}
  ${(() => { const vl = voiceLines(r, i, k); return vl.length ? `<div class="spoken"><h2>${esc(first(c.name))}, in ${esc(first(c.name))}’s own words</h2>${vl.map((f) => `<p class="line"><q>${esc(f.quote)}</q><span class="ctx">${esc(whenOf(r, f.k))} — ${linked(ctx, f.text)}</span></p>`).join("")}</div>` : ""; })()}
  ${portrait?.lines && portrait.lines.flat().length >= 5 ? `<div class="portrait">${portrait.title ? `<h2 class="ptitle">“${esc(portrait.title)}”</h2>` : ""}${told(ctx, portrait.lines, { cls: "long" })}<p class="note">Written ${esc(whenOf(r, portrait.k))}${portrait.final ? ", after the end" : ""}, from the record below.</p></div>` : ""}
  <div class="grid">
    <div>
      ${echo.length ? `<h3>Their own words, where they touch what they wanted or feared</h3><ul class="carry">${echo.slice(0, 3).map((f) => `<li>${quote(f.quote)} <span class="ctx">— ${esc(whenOf(r, f.k))}, when ${linked(ctx, f.text.split(/(?<=\.)\s/)[0].replace(/\.$/, ""))}</span></li>`).join("")}</ul>` : ""}
      <h3>Their household</h3>${household(ctx, i, k)}
      ${wound ? `<h3>The worst of it</h3><p class="fact">${when(r, wound.k)} ${linked(ctx, wound.text)}${wound.quote && wound.who === i ? ` ${quote(wound.quote)}` : ""}</p>` : ""}
      ${cs.length ? `<h3>What they told themselves, and what they did</h3>${cs.map((x) => x.how === "denied" ? `<div class="contra"><p><span class="sc">did</span> ${when(r, x.did.k)} ${linked(ctx, x.did.text)}</p><p><span class="sc">later, to themselves</span> ${quote(x.said.quote)} <span class="ctx">— ${esc(whenOf(r, x.said.k))}</span></p></div>` : `<div class="contra">${x.said.quote ? `<p><span class="sc">to themselves</span> ${quote(x.said.quote)} <span class="ctx">— ${esc(whenOf(r, x.said.k))}, when ${linked(ctx, lowerFirst(x.said.text).replace(/\.$/, ""))}</span></p>` : `<p><span class="sc">first</span> ${when(r, x.said.k)} ${linked(ctx, x.said.text)}</p>`}<p><span class="sc">${x.said.quote ? "did" : "then"}</span> ${when(r, x.did.k)} ${linked(ctx, x.did.text)}${x.did.quote ? ` <span class="ctx">Their words then:</span> ${quote(x.did.quote)}` : ""}</p></div>`).join("")}` : ""}
      ${carry.length ? `<h3>${p.alive ? "What they carry now" : "What they carried"}</h3><ul class="carry">${carry.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
      ${moments.length ? `<h3>The turns of it</h3><ol class="moments">${moments.map((f) => `<li>${when(r, f.k)} ${linked(ctx, f.text)}</li>`).join("")}</ol>` : ""}
    </div>
    <div>
      ${voice.length ? `<details class="all"><summary>Everything ${esc(first(c.name))} said to themselves (${voice.length})</summary><ol class="voice">${voice.map((f) => `<li>${quote(f.quote)}<span class="ctx">${esc(whenOf(r, f.k))} — then ${linked(ctx, lowerFirst(f.text.replace(new RegExp(`^${nameOf(r, i)} `), "")).replace(/\.$/, ""))}.</span></li>`).join("")}</ol></details>` : ""}
    </div>
  </div>
  ${theirs.length ? `<h3 id="between">The people in their life</h3><div class="pairs mini">${theirs.map((x) => { const j = x.a === i ? x.b : x.a; const fs = x.facts.filter((f) => f.deed).sort((a, b) => a.k - b.k); return `<section class="pair"><h4>${face(r, j, k, "s")} ${who(ctx, j)}</h4><ol>${folded(ctx, fs)}</ol></section>`; }).join("")}</div>` : ""}
  <details class="all"><summary>Everything the record holds about ${esc(first(c.name))}</summary><ol class="alllist">${folded(ctx, lifeFacts(r, i, k), i)}</ol></details>
</section>`;
  return shell(ctx, `${c.name} — ${r.title}`, body);
}

/** a person's years as a row of pixels: one square a season, shaded by what the season was to them */
function seasonStrip(r: R, i: number, k: number): string {
  const cells: string[] = []; const L = ledger(r);
  for (let x = 0; x <= k; x++) {
    const f = r.frames?.[x]; const alive = f?.at?.[i] != null; const fl = f?.flags?.[i] ?? 0; const m = f?.vitals?.[i]?.[3] ?? 0;
    const died = r.citizens[i].diedAt === x + 1;
    const cls = died ? "died" : !alive ? "none" : fl & 2 ? "sick" : fl & 1 ? "hungry" : m <= -0.25 ? "low" : m >= 0.2 ? "glad" : "even";
    const mark = (L[x] ?? []).some((g) => g.who === i && g.deed && g.tone === "harm") ? "h" : (L[x] ?? []).some((g) => g.who === i && g.deed && g.tone === "help") ? "k" : (L[x] ?? []).some((g) => g.whom === i && g.deed && g.tone === "harm") ? "w" : "";
    cells.push(`<i class="${cls}${mark ? ` m${mark}` : ""}" title="${esc(whenOf(r, x))}"></i>`);
    if (died) break;
  }
  return `<figure class="strip"><div class="cells">${cells.join("")}</div><figcaption><span class="k even"></span>steady <span class="k glad"></span>in good spirits <span class="k low"></span>low <span class="k hungry"></span>hungry <span class="k sick"></span>sick · <span class="k mh"></span>did harm <span class="k mk"></span>did a kindness <span class="k mw"></span>was harmed — one square a season</figcaption></figure>`;
}

export function townsPage(title: string, rows: { cycle: number; runId: string; title?: string; people: { id: string; name: string; named: boolean; alive: boolean; cause: string | null }[] }[], now: { cycle: number; title: string }): string {
  const fake = { r: { title: "Uncanny Valley", citizens: [] }, telling: null, base: "", live: true, cycle: now.cycle } as any;
  const body = `<section class="towns"><h1>Other towns</h1><p class="lede">Each run is fifteen years in one town. The one going now is <a href="/">${esc(now.title)}</a>. These are the ones that are over.</p>
  ${rows.length ? `<ol class="runs">${rows.slice().reverse().map((x) => `<li><a href="/run/${x.cycle}"><b>${esc(x.title ?? x.runId)}</b></a> <span class="aside">run ${x.cycle}</span><p>${x.people.filter((p) => p.named).map((p) => `${esc(p.name)} — ${p.alive ? "alive at the end" : p.cause ? `died (${esc(p.cause)})` : "gone"}`).join("; ")}.</p></li>`).join("")}</ol>` : `<p>None yet.</p>`}</section>`;
  return shell(fake, `Other towns — ${title}`, body, "towns").replace(/<script>window\.PEOPLE=[^<]*<\/script>/, "<script>window.PEOPLE=[]</script>");
}

export function aboutPage(r: R): string {
  const fake = { r: { title: r.title, citizens: [] }, telling: null, base: "", live: true, cycle: 0 } as any;
  const body = `<section class="about"><h1>What this is</h1>
<p class="lede">A small town, run by a computer for fifteen years at a time — a season every twenty minutes — and told as it happens.</p>
<p>Ten people live in it. Four of them are followed closely. Every season each of them meets one situation and decides what to do; the deciding is done by a language model speaking as that person, and what they say to themselves as they choose is kept word for word. What comes of it is rolled by the simulation.</p>
<p>Between those choices the town goes on by itself. People earn and spend, go hungry when bread is dear, fall sick, lose their roofs, marry, have children, grieve, grow close, fall out, and hear what their neighbours did. All of that is computed, not written: how low someone is and why, who thinks less of whom after a theft that was seen, who mourns whom.</p>
<p>A second model, the chronicler, writes each season and a portrait of each of the four. It is handed only the town's facts, and every sentence it writes has to name the facts it came from; code checks each sentence against them and throws out any that says more than they do — a name, a number, a feeling, a reason, a death, a word in quotation marks. Under every passage, <span class="sc">the record</span> opens to the facts it was written from. Where the chronicler has not reached a season, the facts are printed plainly.</p>
<p>Some of the situations are old experiments from social psychology — the trolley, the ultimatum, the bystander, obedience — rewritten as the town's own business. The town is never told. When the fifteen years end, another model builds a new town, and it begins again.</p>
<p class="aside">Nobody's sex is recorded, so everyone is “they”, except in their own words.</p></section>`;
  return shell(fake, `What this is — ${r.title}`, body, "about").replace(/<script>window\.PEOPLE=[^<]*<\/script>/, "<script>window.PEOPLE=[]</script>");
}

/** a plain page in the same paper, for the running costs */
export function opsShell(title: string, body: string): string {
  return shell({ r: { title: "Uncanny Valley", citizens: [] }, telling: null, base: "", live: true, cycle: 0 } as any, title, body).replace(/<script>window\.PEOPLE=[^<]*<\/script>/, "<script>window.PEOPLE=[]</script>");
}
