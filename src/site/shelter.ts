// The town cut open, the way a house is shown in cross-section: every building with its floors laid bare, the people in
// the rooms the season found them in, what state each is in written over their heads, the dead in a yard at the end of
// the street. The reader steps through the seasons with two buttons; nothing moves until they press one. Every position,
// word and line here comes from the record: where each person was (frames.at), how they were (personNow), what happened
// (the ledger), and the teller's checked passage where one was written.
import { esc } from "../../web/draw.mjs";
import { sprite } from "./sprites.ts";
import { SEASON_NAMES, factsAt, personNow, storyOf, voiceOf, whenOf, nameOf, played, type Fact } from "../chronicle/ledger.ts";
import { plainSeason, recheck, type Telling } from "../chronicle/teller.ts";

type R = any;
export interface H { r: R; base: string; telling: Telling | null; linked: (t: string) => string; face: (i: number, mood: string, size: "s" | "m" | "l" | "xl") => string; faceNow: (i: number, k: number, size: "s" | "m" | "l" | "xl") => string; townSentence: (k: number) => string }

const first = (n: string) => String(n ?? "").split(" ")[0];
/** the ground floor is where people meet, the work above it, the beds at the top */
const FLOORS = ["public", "work", "home"];
export const floorsOf = (loc: any): string[] => { const t = FLOORS.filter((x) => (loc?.tags ?? []).includes(x)); return t.length ? t : ["public"]; };
// the street's measures, in CSS pixels; the canvases behind are a third of this and shown pixelated
export const G = { BW: 160, FH: 150, GH: 33, H: 33 + 3 * 150 + 45, PW: 54 };

export type Tag = { t: string; tone: "bad" | "good" | "plain" };
/** what state a person is in, in the fewest words, worst first — from personNow, which reads the record */
export function tagsOf(r: R, i: number, k: number): Tag[] {
  const p = personNow(r, i, k); if (!p.alive) return [{ t: "dead", tone: "bad" }];
  const out: Tag[] = [];
  if (p.sick) out.push({ t: "sick", tone: "bad" }); else if (p.health === "failing") out.push({ t: "weak", tone: "bad" });
  if (p.food === "hungry") out.push({ t: p.hungryFor >= 2 ? "very hungry" : "hungry", tone: "bad" }); else if (p.food === "short") out.push({ t: "short of food", tone: "bad" });
  if (!p.roof) out.push({ t: "no roof", tone: "bad" });
  for (const j of p.lost) { const d = r.citizens[j]?.diedAt; if (d && k + 1 - d < 6) out.push({ t: `grieving ${first(r.citizens[j].name)}`, tone: "bad" }); }
  if (p.mood === "very low") out.push({ t: "depressed", tone: "bad" }); else if (p.mood === "low") out.push({ t: "sad", tone: "bad" }); else if (p.moodV >= 0.2) out.push({ t: "content", tone: "good" });
  if (p.standing === "feared") out.push({ t: "feared", tone: "plain" });
  if (p.money === "none") out.push({ t: "broke", tone: "bad" });
  return out;
}

type Pose = "stand" | "work" | "sit" | "bed";
interface Spot { i: number; b: number; f: number; x: number; y: number; pose: Pose; tags: string[]; tones: string[]; lift: number }
/** where everyone was in season k, and how: a spot on a floor of the building the record puts them in */
export function spotsAt(r: R, k: number, X: { x: number[]; w: number[] } | null = null): { spots: Spot[]; graves: { i: number; x: number; died: string }[] } {
  const locs = r.map?.locations ?? []; const fr = r.frames?.[k];
  const groups = new Map<string, { i: number; pose: Pose; b: number; f: number; tags: Tag[] }[]>(); const graves: { i: number; x: number; died: string }[] = [];
  r.citizens.forEach((c: any, i: number) => {
    const p = personNow(r, i, k);
    if (!p.alive) { if (!p.gone && c.diedAt) graves.push({ i, x: 0, died: whenOf(r, c.diedAt - 1) }); return; }
    let b = locs.findIndex((l: any) => l.id === fr?.at?.[i]); if (b < 0) b = locs.findIndex((l: any) => l.id === c.home); if (b < 0) b = 0;
    const fl = floorsOf(locs[b]); const ev = String(fr?.evening?.[i] ?? "");
    const pose: Pose = p.sick || p.health === "failing" ? "bed" : p.food === "hungry" || p.moodV <= -0.45 ? "sit" : (locs[b]?.tags ?? []).includes("work") && ev === "work" ? "work" : "stand";
    const want = pose === "bed" || ev === "home" ? "home" : pose === "work" ? "work" : "public";
    let f = fl.indexOf(want); if (f < 0) f = pose === "bed" ? fl.length - 1 : 0;
    const key = `${b}:${f}`; groups.set(key, [...(groups.get(key) ?? []), { i, pose, b, f, tags: tagsOf(r, i, k) }]);
  });
  const spots: Spot[] = []; const bx = (b: number) => X?.x[b] ?? b * G.BW, bw = (b: number) => X?.w[b] ?? G.BW;
  for (const g of groups.values()) {
    // the sick lie in the bed at the left of the room; the rest share out the floor, their labels staggered when crowded
    const beds = g.filter((s) => s.pose === "bed"), up = g.filter((s) => s.pose !== "bed");
    beds.forEach((s, n) => spots.push({ i: s.i, b: s.b, f: s.f, x: bx(s.b) + 8 + n * 22, y: G.GH + s.f * G.FH + 12 + n * 4, pose: "bed", tags: s.tags.slice(0, 2).map((t) => t.t), tones: s.tags.slice(0, 2).map((t) => t.tone), lift: 0 }));
    const x0 = beds.length ? 96 : 12; const w = bw(g[0].b) - x0 - 12; const many = up.length > 2;
    up.forEach((s, n) => { const x = bx(s.b) + x0 + ((n + 0.5) / up.length) * w - 24; const nt = many ? 1 : 2;
      spots.push({ i: s.i, b: s.b, f: s.f, x: Math.round(x), y: G.GH + s.f * G.FH + 4, pose: s.pose, tags: s.tags.slice(0, nt).map((t) => t.t), tones: s.tags.slice(0, nt).map((t) => t.tone), lift: many && n % 2 ? 1 : 0 }); });
  }
  graves.forEach((g, n) => { g.x = (X ? X.x[locs.length] : locs.length * G.BW) + 16 + n * 44; });
  return { spots, graves };
}

/** the season's colour on the strip: a death black, harm outweighing help red, help green */
function toneOf(r: R, k: number): string {
  const fs = factsAt(r, k); if (fs.some((f) => f.kind === "death")) return "loss";
  const h = fs.filter((f) => f.deed && f.tone === "harm").length, g = fs.filter((f) => f.deed && f.tone !== "harm").length;
  return h > g ? "harm" : g ? "help" : "plain";
}

/** what happened in a season, as a report: the teller's checked lines if there are any, then the moments that mattered,
 *  each with the face of the one who did it and what they told themselves */
export function report(h: H, k: number): string {
  const r = h.r; const tp = h.telling?.seasons?.[k]; const lines = tp ? recheck(r, tp.lines).flat() : [];
  const prose = lines.length >= 2 ? lines.slice(0, 4).map((l) => h.linked(l.t)).join(" ") : plainSeason(r, k, 3).map((f) => h.linked(f.text.split(/(?<=\.)\s/)[0])).join(" ");
  const ep = (r.events ?? []).find((e: any) => e.seasons && k + 1 >= e.at && k + 1 < e.at + e.seasons);
  const fs = factsAt(r, k); const deaths = fs.filter((f) => f.kind === "death");
  const deeds = fs.filter((f) => f.deed).sort((a, b) => b.weight - a.weight).slice(0, 4);
  const items = [...deaths, ...deeds].sort((a, b) => fs.indexOf(a) - fs.indexOf(b));
  const item = (f: Fact) => { const q = f.quote ? f.quote.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") : "";
    const tone = f.kind === "death" ? "loss" : f.tone === "harm" ? "harm" : "help";
    return `<li class="${tone}">${h.face(f.who, f.kind === "death" ? "dead" : tone === "harm" ? "angry" : "calm", "s")}<span>${h.linked(f.text.split(/(?<=\.)\s/).filter((x) => !/^\(Earlier/.test(x)).slice(0, 2).join(" "))}${q ? `<q>${esc(q)}</q><small>${esc(nameOf(r, f.who))}, to themselves</small>` : ""}</span></li>`; };
  return `<article class="rep"><header><b>${esc(whenOf(r, k))}</b>${ep ? `<span>${esc(ep.headline)}</span>` : ""}</header>
  <p class="rep-told">${prose}</p>
  ${items.length ? `<ul class="rep-ev">${items.map(item).join("")}</ul>` : ""}
  <p class="rep-town">${esc(h.townSentence(k))}</p></article>`;
}

/** the street for season k, drawn now, with every season's positions beside it for the buttons */
export function shelter(h: H, k: number): string {
  const r = h.r; const locs = r.map?.locations ?? [];
  // each building as wide as the most people it ever held on one floor; the yard as wide as its graves
  const most = locs.map(() => 1); let graves0 = 0;
  for (let kk = 0; kk <= k; kk++) { const s = spotsAt(r, kk); graves0 = Math.max(graves0, s.graves.length); const per = new Map<string, number>();
    for (const p of s.spots) { const key = `${p.b}:${p.f}`; per.set(key, (per.get(key) ?? 0) + (p.pose === "bed" ? 1.6 : 1)); most[p.b] = Math.max(most[p.b], per.get(key)!); } }
  const w = [...most.map((m) => Math.max(G.BW, Math.round(40 + m * G.PW))), Math.max(G.BW, 40 + graves0 * 44)];
  const X = { x: w.map((_, b) => w.slice(0, b).reduce((a, c) => a + c, 0)), w }; const W = w.reduce((a, c) => a + c, 0);
  const all = Array.from({ length: k + 1 }, (_, kk) => { const s = spotsAt(r, kk, X); const ep = (r.events ?? []).find((e: any) => e.seasons && kk + 1 >= e.at && kk + 1 < e.at + e.seasons);
    return { when: whenOf(r, kk), season: SEASON_NAMES[kk % 4], epoch: ep?.kind ?? null, spots: s.spots.map((p) => [p.i, p.x, p.y, p.pose, p.tags, p.tones, p.lift, p.b]), graves: s.graves.map((g) => [g.i, g.x, g.died]) }; });
  const now = all[k];
  const data = { W, ...G, locs: locs.map((l: any) => ({ tags: floorsOf(l) })), seasons: all, seed: r.seed ?? 1 };
  const at = new Map(now.spots.map((s: any) => [s[0], s]));
  const figs = r.citizens.map((c: any, i: number) => { const s: any = at.get(i);
    return `<a class="fig${s ? ` pose-${s[3]}${s[6] ? " lift" : ""}` : " away"}${c.named ? " named" : ""}" data-i="${i}" href="${h.base}/p/${encodeURIComponent(c.id)}" style="left:${s ? s[1] : -99}px;bottom:${s ? s[2] : 0}px"><span class="tag"><b>${esc(first(c.name))}</b><span class="tl">${s ? s[4].map((t: string, n: number) => `<em class="${s[5][n]}">${esc(t)}</em>`).join("") : ""}</span></span><canvas class="figc" data-i="${i}" width="16" height="30"></canvas></a>`; }).join("");
  const graves = r.citizens.map((c: any, i: number) => { const g: any = now.graves.find((x: any) => x[0] === i);
    return `<a class="grave${g ? "" : " away"}" data-i="${i}" href="${h.base}/p/${encodeURIComponent(c.id)}" style="left:${g ? g[1] : -99}px"><span class="tag"><b>${esc(first(c.name))}</b><span class="tl"><em class="plain">${esc(g ? g[2] : "")}</em></span></span>${sprite("grave", "#8d877e", 30)}</a>`; }).join("");
  const strip = Array.from({ length: k + 1 }, (_, kk) => `<button class="tick ${toneOf(r, kk)}${kk === k ? " on" : ""}" data-k="${kk}" title="${esc(whenOf(r, kk))}" aria-label="${esc(whenOf(r, kk))}"></button>`).join("");
  return `<section class="shelter" data-now="${k}">
  <div class="street-wrap"><div class="street" style="width:${W}px;height:${G.H}px" data-shelter='${esc(JSON.stringify(data))}'>
    ${locs.map((l: any, b: number) => `<div class="bld" style="left:${X.x[b]}px;width:${X.w[b]}px"><canvas class="bld-bg" data-b="${b}" width="${Math.round(X.w[b] / 3)}" height="${Math.round(G.H / 3)}"></canvas><span class="bname">${esc(l.name)}</span></div>`).join("")}
    <div class="bld yard" style="left:${X.x[locs.length]}px;width:${X.w[locs.length]}px"><canvas class="bld-bg" data-b="yard" width="${Math.round(X.w[locs.length] / 3)}" height="${Math.round(G.H / 3)}"></canvas><span class="bname">The dead</span></div>
    ${graves}${figs}
  </div></div>
  <div class="places">${locs.map((l: any, b: number) => { const n = now.spots.filter((p: any) => p[7] === b).length; return `<button class="place" data-x="${X.x[b]}" data-b="${b}">${esc(l.name)} <span>${n}</span></button>`; }).join("")}<button class="place" data-x="${X.x[locs.length]}" data-b="yard">The dead <span>${now.graves.length}</span></button></div>
  <div class="stepper"><button class="step" data-step="-1" aria-label="the season before">◀</button><span class="st-when">${esc(now.when)}</span><button class="step" data-step="1" aria-label="the season after">▶</button></div>
  <div class="strip" role="group" aria-label="every season so far">${strip}</div>
  <div class="report-slot">${report(h, k)}</div>
  ${Array.from({ length: k }, (_, kk) => `<template id="rep-${kk}">${report(h, kk)}</template>`).join("")}<template id="rep-${k}">${report(h, k)}</template>
</section>`;
}

/** one of the four, the way a survivor is shown: the face, what state they are in, what they want and fear (set down
 *  when the town was made), who they are close to and at odds with and why, the last things that happened to them, and
 *  the last thing they told themselves */
export function bio(h: H, i: number, k: number): string {
  const r = h.r; const c = r.citizens[i]; const p = personNow(r, i, k);
  const age = c.age + Math.floor(Math.min(k, (c.diedAt ?? 999) - 1) / 4);
  const tags = tagsOf(r, i, k);
  const why = (t: string) => t.split(/(?<=\.)\s/)[0].replace(/\s*\(Earlier between them:.*$/, "");
  const close = p.close.slice(0, 1), odds = p.odds.slice(0, 2);
  const journal = storyOf(r, i, k, 16).sort((a, b) => b.k - a.k).slice(0, 4);
  const said = voiceOf(r, i, k).at(-1);
  const q = said?.quote ? said.quote.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ") : "";
  return `<article class="bio${p.alive ? "" : " dead"}">
  <a class="bio-face" href="${h.base}/p/${encodeURIComponent(c.id)}">${h.faceNow(i, k, "xl")}</a>
  <div class="bio-body">
    <h3><a href="${h.base}/p/${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3>
    <span class="bio-role">${esc(c.role)}, ${age}${p.alive ? "" : ` · died ${esc(whenOf(r, (c.diedAt ?? 1) - 1))}`}</span>
    <div class="bio-tags">${tags.map((t) => `<em class="${t.tone}">${esc(t.t)}</em>`).join("")}</div>
    ${c.want || c.fear ? `<p class="bio-want">${c.want ? `Wants ${esc(String(c.want).replace(/\.$/, ""))}.` : ""} ${c.fear ? `Afraid of ${esc(String(c.fear).replace(/\.$/, ""))}.` : ""}</p>` : ""}
    ${close.length || odds.length ? `<p class="bio-rel">${close.map((x) => `<span class="help">Close to ${h.linked(first(r.citizens[x.j].name))}: ${h.linked(why(x.why))}</span>`).join("")}${odds.map((x) => `<span class="harm">At odds with ${h.linked(first(r.citizens[x.j].name))}: ${h.linked(why(x.why))}</span>`).join("")}</p>` : ""}
    ${journal.length ? `<ol class="journal">${journal.map((f) => `<li class="${f.kind === "death" ? "loss" : f.tone === "harm" ? "harm" : f.tone === "help" || f.tone === "joy" ? "help" : "plain"}"><span class="jw">${esc(whenOf(r, f.k))}</span>${h.linked(why(f.text))}</li>`).join("")}</ol>` : ""}
    ${q ? `<blockquote><q>${esc(q)}</q><small>${esc(first(c.name))}, to themselves, ${esc(whenOf(r, said!.k))}</small></blockquote>` : ""}
    <a class="bio-more" href="${h.base}/p/${encodeURIComponent(c.id)}">${esc(first(c.name))}'s whole story →</a>
  </div>
</article>`;
}
export { played };
