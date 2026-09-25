// The four at home: the town's places as the rooms of one house cut open, drawn in charcoal pixels, and the four living in
// it — where the record puts them this season, in the state it puts them in. They walk about their rooms, work, sit when
// hunger or low spirits have them, lie down when sick; the dead of the four lie in the yard. When one of their decisions
// comes out, what they told themselves shows over their head. Every place, state and word is read off the record.
import { paint } from "./pixel.mjs";
import { esc } from "./draw.mjs";

const DW = 720, S = 3; // the house is laid out in 720 design pixels; one canvas pixel is three of them
const RANK = (l) => ((l.tags || []).includes("public") ? 0 : (l.tags || []).includes("work") ? 1 : 2); // meeting rooms low, beds high
const COATS = ["#5a534c", "#4b4f52", "#5c5145", "#44463f", "#605549", "#4a4950", "#56504a", "#474039"];
const coatOf = (id) => COATS[String(id).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % COATS.length];

export function house(L, R) {
  const locs = (L.map?.locations || []).slice(0, 6); if (!locs.length) return null;
  const P = R.P, FOUR = R.FOUR;
  const per = locs.length <= 3 ? locs.length : Math.ceil(locs.length / 2), floors = Math.ceil(locs.length / per);
  const YW = 110, HW = DW - YW - 16, FH = 132, GH = 30, RH = 42, DH = GH + floors * FH + RH;
  const order = [...locs].sort((a, b) => RANK(a) - RANK(b));
  const rooms = order.map((l, n) => { const f = Math.floor(n / per), c = n % per, cnt = Math.min(per, order.length - f * per), w = HW / cnt;
    return { id: l.id, name: l.name, tags: l.tags || [], x: 8 + c * w, w, y: DH - GH - (f + 1) * FH, f }; });
  const roomOf = (id) => rooms.find((r) => r.id === id) || rooms[0];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const el = document.createElement("section"); el.className = "house"; el.setAttribute("aria-label", "The four, where they are this season");
  const stoves = rooms.filter((r) => r.tags.includes("home")).map((r) => ({ x: r.x + r.w - 3 * 8, y: r.y + FH - 6 * 3 - 6 }));
  el.innerHTML = `<div class="hs" style="aspect-ratio:${DW}/${DH}"><canvas class="hbg" width="${DW / S}" height="${Math.round(DH / S)}"></canvas>${stoves.map((s) => `<i class="fire" style="left:${s.x / DW * 100}%;top:${s.y / DH * 100}%"></i>`).join("")}${rooms.filter((r) => r.f === floors - 1 && r.tags.includes("home")).slice(0, 1).map((r) => `<i class="smoke" style="left:${(r.x + r.w - 21) / DW * 100}%;top:${(r.y - 70) / DH * 100}%"><b></b><b></b><b></b></i>`).join("")}<canvas class="hsnow" width="${DW / S}" height="${Math.round(DH / S)}"></canvas><div class="hnight"></div><span class="hclock"></span><span class="hyard" style="left:${(8 + HW + 18) / DW * 100}%"></span>${rooms.map((r) => `<span class="hroom" style="left:${(r.x + 6) / DW * 100}%;top:${(r.y + 6) / DH * 100}%">${esc(r.name)}</span>`).join("")}</div><p class="hkey">The four, where this season finds them. Tap one to follow them.</p>`;
  const stage = el.querySelector(".hs"); const bg = el.querySelector(".hbg"); const snowCv = el.querySelector(".hsnow"); const night = el.querySelector(".hnight"); const clock = el.querySelector(".hclock"); const yardNote = el.querySelector(".hyard");
  let weather = null; const inX0 = 8 / S - 2, inX1 = (8 + HW) / S + 2, inY0 = (DH - GH - floors * FH) / S, inY1 = (DH - GH) / S; const flakes = Array.from({ length: 120 }, () => ({ x: Math.random() * DW / S, y: Math.random() * DH / S, v: 0.3 + Math.random() * 0.6 }));
  const pct = (x, y) => `left:${x / DW * 100}%;top:${y / DH * 100}%`;

  // ---- the house itself, drawn once a season
  function draw(season, epoch) {
    const x = bg.getContext("2d"), W = bg.width, H = bg.height; let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const px = (a, y, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(a), Math.round(y), Math.round(w), Math.round(h)); };
    const winter = season === "winter", frost = epoch === "winter" && !winter;
    for (let y = 0; y < H; y++) px(0, y, W, 1, y < H * 0.5 ? "#141313" : "#1e1c1b");
    for (let i = 0; i < 40; i++) px(rnd() * W, rnd() * H * 0.5, 1, 1, "#3a3836");
    const gy = (DH - GH) / S; px(0, gy, W, H - gy, "#1a1817"); for (let i = 0; i < 120; i++) px(rnd() * W, gy + rnd() * (H - gy), 1, 1, rnd() < 0.5 ? "#262321" : "#0f0e0d");
    const hx0 = 8 / S - 2, hx1 = (8 + HW) / S + 2, top = (DH - GH - floors * FH) / S;
    px(hx0, top - 1, hx1 - hx0, gy - top + 1, "#2b2927");
    for (let i = 0; i < 160; i++) { const yy = top + rnd() * (gy - top); px(rnd() < 0.5 ? hx0 + rnd() * 2 : hx1 - 2 + rnd() * 2, yy, 1, 1, "#1b1918"); }
    for (const r of rooms) {
      const L0 = r.x / S + 1, R0 = (r.x + r.w) / S - 1, y1 = r.y / S, y0 = (r.y + FH) / S;
      for (let yy = y1 + 1; yy < y0 - 1; yy++) for (let xx = L0; xx < R0; xx++) px(xx, yy, 1, 1, rnd() < 0.08 ? "#433f3a" : "#4b4641");
      const home = r.tags.includes("home"), work = r.tags.includes("work");
      if (home) for (let xx = L0 + 2; xx < R0; xx += 5) px(xx, y1 + 2, 1, y0 - y1 - 5, "#443f3a");
      px(L0 - 1, y0 - 2, R0 - L0 + 2, 2, "#151413"); px(R0, y1, 1, y0 - y1, "#1f1d1b");
      const wx = L0 + 5 + rnd() * 8; px(wx, y1 + 7, 8, 9, "#121214"); px(wx + 4, y1 + 7, 1, 9, "#2d2a27"); px(wx, y1 + 11, 8, 1, "#2d2a27");
      if (winter) for (let i = 0; i < 8; i++) px(wx + rnd() * 8, y1 + 7 + rnd() * 9, 1, 1, "#9a978f");
      const fy = y0 - 2;
      if (home) { px(L0 + 3, fy - 4, 17, 2, "#2a231d"); px(L0 + 3, fy - 5, 17, 1, "#5f5850"); px(L0 + 3, fy - 6, 4, 1, "#8f887e"); px(L0 + 3, fy - 2, 1, 2, "#2a231d"); px(L0 + 19, fy - 2, 1, 2, "#2a231d");
        px(R0 - 9, fy - 9, 6, 9, "#191817"); px(R0 - 8, fy - 4, 4, 2, "#d27a2c"); px(R0 - 7, fy - 5, 2, 1, "#f0b44c"); px(R0 - 7, y1 + 1, 2, fy - 9 - y1, "#1f1d1b"); }
      else if (work) { px(L0 + 4, fy - 7, 22, 1, "#2a231d"); px(L0 + 5, fy - 6, 1, 6, "#2a231d"); px(L0 + 24, fy - 6, 1, 6, "#2a231d"); for (let i = 0; i < 4; i++) px(L0 + 6 + i * 5, fy - 9, 2, 2, "#57514a");
        px(R0 - 12, fy - 7, 8, 7, "#3a3029"); px(R0 - 11, fy - 13, 6, 6, "#443830"); for (let i = 0; i < 3; i++) px(L0 + 8 + i * 6, y1 + 3, 1, 5, "#5a544c"); }
      else { const m = (L0 + R0) / 2; px(m - 13, fy - 6, 26, 1, "#2a231d"); px(m - 12, fy - 5, 1, 5, "#2a231d"); px(m + 12, fy - 5, 1, 5, "#2a231d"); px(m - 17, fy - 4, 2, 4, "#2e2620"); px(m + 15, fy - 4, 2, 4, "#2e2620"); px(m - 4, fy - 7, 2, 1, "#8d857a"); }
      const lx = L0 + (R0 - L0) * 0.55; px(lx, y1 + 1, 1, 3, "#1a1918"); px(lx - 1, y1 + 4, 3, 1, "#e8c078");
      for (let yy = y1 + 5; yy < y0 - 2; yy++) { const sp = (yy - y1) * 1.3; for (let xx = Math.max(L0, lx - sp); xx < Math.min(R0, lx + sp); xx++) { x.fillStyle = `rgba(214,176,112,${(0.09 * (1 - Math.abs(xx - lx) / (sp + 1))).toFixed(3)})`; x.fillRect(Math.round(xx), yy, 1, 1); } }
    }
    for (let i = 0; i < 12; i++) px(hx0 - 3 + i * 2, top - 1 - i, hx1 - hx0 + 6 - i * 4, 1, i === 0 ? "#171615" : "#262422");
    for (let i = 0; i < 7; i++) px(hx0 + 4 + rnd() * (hx1 - hx0 - 8), top - 1 - rnd() * 9, 2, 1, "#141313");
    if (winter || frost) for (let i = 0; i < 12; i++) px(hx0 - 3 + i * 2, top - 2 - i, hx1 - hx0 + 6 - i * 4, 1, winter ? "#d9d6d0" : "#6d6b68");
    const yx = (8 + HW + 16) / S; for (let i = yx; i < W - 2; i += 4) px(i, gy - 6, 1, 6, "#3b3733"); px(yx, gy - 5, W - yx - 2, 1, "#3b3733");
    px(W - 10, gy - 34, 2, 34, "#2e2a26"); for (let i = 0; i < 9; i++) { px(W - 10 - i, gy - 34 + i, 1, 1, "#2e2a26"); px(W - 8 + i * 0.6, gy - 30 + i, 1, 1, "#2e2a26"); }
    if (epoch === "fire") for (let i = 0; i < 80; i++) px(hx0 + rnd() * (hx1 - hx0), top - 14 + rnd() * 12, 1, 1, rnd() < 0.5 ? "#d2682c" : "#f2a53a");
    if (epoch === "war") for (let i = 0; i < 60; i++) px(hx0 + rnd() * (hx1 - hx0), top - 24 + rnd() * 20, 2, 1, "#3b3936");
    if (winter) px(0, gy - 1, W, 2, "#d9d6d0"); else if (frost) px(0, gy - 1, W, 1, "#6d6b68"); // snow lying in winter; a hard winter's frost into the other seasons
    if (epoch === "plague") { x.fillStyle = "rgba(120,140,100,.12)"; x.fillRect(0, 0, W, H); }
  }

  // ---- a person, head to foot: the portrait's head and shoulders, a coat and legs below, in the pose of the moment
  const heads = new Map();
  const head = (i) => { if (!heads.has(i)) heads.set(i, (async () => { const off = document.createElement("canvas"); off.width = off.height = 16; await paint(off, P[i], { res: 16, ink: "none", levels: 5 }); return off; })()); return heads.get(i); };
  async function body(cv, i, pose, f) {
    const lying = pose === "bed"; const w = lying ? 30 : 16, h = lying ? 16 : 30; if (cv.width !== w) { cv.width = w; cv.height = h; }
    const x = cv.getContext("2d"); x.clearRect(0, 0, w, h); const px = (a, y, ww, hh, c) => { x.fillStyle = c; x.fillRect(a, y, ww, hh); };
    const coat = coatOf(P[i]?.id), legs = "#262422", hd = await head(i);
    if (lying) { px(0, 12, 30, 4, "#2a231d"); x.drawImage(hd, 0, -3); px(13, 6, 17, 6, "#6a6259"); px(13, 6, 17, 1, "#80786e"); return; }
    const dy = pose === "sit" ? 4 : 0;
    px(2, 14 + dy, 12, 9, coat); px(7, 15 + dy, 1, 8, "rgba(0,0,0,.25)");
    if (pose === "work") { px(13, f ? 14 + dy : 17 + dy, 3, 2, coat); px(15, f ? 13 + dy : 19 + dy, 1, 1, "#a39c93"); }
    if (pose === "sit") { px(3, 23, 11, 3, legs); px(12, 26, 2, 4, legs); px(1, 26, 13, 1, "#1a1715"); px(2, 27, 1, 3, "#1a1715"); }
    else if (pose === "walk" && f) { px(5, 23, 3, 6, legs); px(8, 23, 3, 6, legs); px(5, 29, 6, 1, "#0e0d0c"); }
    else { px(4, 23, 3, 6, legs); px(9, 23, 3, 6, legs); px(4, 29, 3, 1, "#0e0d0c"); px(9, 29, 3, 1, "#0e0d0c"); }
    x.drawImage(hd, 0, dy - 1);
  }

  // ---- the people on the stage: the four always, and whoever one of their decisions this season brought in
  const figs = new Map();
  function fig(i, guest) {
    if (figs.has(i)) return figs.get(i);
    const b = document.createElement(guest ? "span" : "button"); b.className = `hf${guest ? " guest" : ""}`; if (!guest) { b.dataset.who = P[i].id; b.type = "button"; b.setAttribute("aria-label", `Follow ${P[i].name}`); }
    b.innerHTML = `<span class="hb" hidden></span><span class="hl"><b>${esc(R.nm(i))}</b><i></i></span><canvas width="16" height="30"></canvas>`;
    stage.appendChild(b); const o = { i, el: b, cv: b.querySelector("canvas"), room: null, x: 0, tx: 0, wait: 0, pose: "walk", f: 0, t: 0, guest: !!guest }; figs.set(i, o); return o;
  }
  const graves = new Map();
  function grave(i, n) {
    let g = graves.get(i); if (!g) { g = document.createElement("span"); g.className = "hg"; g.innerHTML = `<span class="hl"><b>${esc(R.nm(i))}</b><i class="bad">dead</i></span><svg viewBox="0 0 8 8" shape-rendering="crispEdges"><rect x="2" y="0" width="4" height="1" fill="#8d877e"/><rect x="1" y="1" width="6" height="6" fill="#8d877e"/><rect x="3" y="2" width="2" height="3" fill="#5a554e"/><rect x="2" y="3" width="4" height="1" fill="#5a554e"/><rect x="0" y="7" width="8" height="1" fill="#3a3029"/></svg>`; stage.appendChild(g); graves.set(i, g); }
    g.style.cssText = pct(8 + HW + 22 + (n % 3) * 30, DH - GH - 30 - Math.floor(n / 3) * 44); g.classList.toggle("hup", n % 2 === 1);
  }
  function place(o) { const r = o.room; o.el.style.cssText = `${pct(o.x, r.y + FH - (o.pose === "bed" ? 38 : o.pose === "sit" ? 82 : 92))};width:${(o.pose === "bed" ? 90 : 48) / DW * 100}%`; o.el.classList.toggle("left", o.dir < 0);
    // two names that would sit on each other: the later one is lifted a line
    const near = 58 * DW / Math.max(200, stage.clientWidth || DW); const taken = new Set();
    for (const p of figs.values()) { if (p === o) break; if (p.room === o.room && !p.el.hidden && Math.abs(p.x - o.x) < near) taken.add(p.lvl || 0); }
    let lvl = 0; while (taken.has(lvl)) lvl++; o.lvl = lvl; o.el.style.setProperty("--lvl", String(lvl)); }

  function words(i, k, u) {
    const fr = R.frameAt(k), fl = fr?.flags?.[i] ?? 0, mood = fr?.vitals?.[i]?.[3], c = fr?.conscience?.[i] ?? 0;
    const out = [];
    if (fl & 2 || fl & 128) out.push(["sick", "bad"]); if (fl & 1) out.push(["hungry", "bad"]); if (fl & 4) out.push(["no roof", "bad"]);
    if (mood != null && mood <= -0.55) out.push(["depressed", "bad"]); else if (mood != null && mood <= -0.25) out.push(["sad", "bad"]);
    if (!out.length) out.push(["well enough", ""]);
    return out.slice(0, 2);
  }

  let season = -1;
  function update(k, u, items) {
    const fr = R.frameAt(k);
    if (k !== season) { season = k; draw(R.seasonOf(k), R.epochAt(k)?.kind); weather = weatherOf(k); daylight(); musings = (L.musings || {})[k] || (L.musings || {})[k - 1] || {}; turn = 0; }
    let dead = 0; const inRoom = new Map(); const gone = [];
    for (const i of FOUR) {
      const d = R.deathOf(i, u); const o = fig(i);
      if (d) { o.el.hidden = true; grave(i, dead++); gone.push(R.nm(i)); continue; }
      o.el.hidden = false; graves.get(i)?.remove(); graves.delete(i);
      const fl = fr?.flags?.[i] ?? 0, mood = fr?.vitals?.[i]?.[3] ?? 0, ev = String(fr?.evening?.[i] || "");
      const room = roomOf(fr?.at?.[i] || P[i].home);
      const pose = fl & 2 || fl & 128 ? "bed" : fl & 1 || mood <= -0.45 ? "sit" : room.tags.includes("work") && ev === "work" ? "work" : "walk";
      const n = inRoom.get(room.id) || 0; inRoom.set(room.id, n + 1);
      if (o.room !== room || o.pose !== pose) { o.room = room; o.pose = pose; o.x = pose === "bed" ? room.x + 10 : room.x + 20 + ((n * 67) % Math.max(40, room.w - 80)); o.tx = o.x; o.dir = 1; }
      o.el.querySelector(".hl i").innerHTML = words(i, k, u).map(([w, t]) => `<em class="${t}">${esc(w)}</em>`).join(" · ");
      body(o.cv, i, pose, 0); place(o);
    }
    yardNote.textContent = gone.length ? `${gone.join(" · ")} — dead` : "";
  }

  // what someone told themselves, over their head, for as long as it takes to read
  function pop(it) {
    const a = it.a; const t = R.tgt(a); const i = FOUR.includes(a.c) ? a.c : FOUR.includes(t) ? t : null; if (i == null) return;
    const o = figs.get(i); if (!o || o.el.hidden) return;
    const said = i === a.c && a.thought ? `“${String(a.thought).split(/(?<=[.!?])\s+/)[0]}”` : R.said(a) + ".";
    const tone = R.toneOf(a); const b = o.el.querySelector(".hb");
    b.innerHTML = esc(said.length > 120 ? said.slice(0, 117) + "…”" : said); b.className = `hb t-${tone}${o.x < 170 ? " al" : o.x > DW - 230 ? " ar" : ""}`; b.hidden = false; // kept inside the house at its edges
    clearTimeout(o.pt); o.busy = Date.now() + 11000; o.pt = setTimeout(() => { b.hidden = true; }, 11000);
    // the one who did it goes to whoever it was done to, if they are in the house
    const other = t != null && t !== a.c ? figs.get(i === a.c ? t : a.c) : null;
    if (other && other.room === o.room && o.pose === "walk") o.tx = other.x + (other.x > o.x ? -40 : 40);
  }

  // ---- life: a slow walk about the room, a pause, another; work goes on at the bench. Nothing moves if asked not to.
  // what goes through their heads: their own thoughts at the end of the season — back on a thing they did, on now, on
  // what is coming — one person at a time, in turn, each for as long as it takes to read
  let musings = {}, turn = 0, nextMuse = Date.now() + 2500;
  const KIND = { past: "Looking back", now: "Right now", ahead: "About next season" };
  const aboutOf = (id) => { if (!id) return ""; const [kk, j] = String(id).split("."); const a = R.acts(+kk)?.[+String(j).replace(/\D.*/, "")]; return a && a.c != null ? ` on: ${R.said(a).replace(/^\S+\s/, "")}` : ""; };
  function muse() {
    const alive = FOUR.filter((i) => { const o = figs.get(i); return o && !o.el.hidden && musings[P[i].id]; }); if (!alive.length) return;
    const i = alive[turn % alive.length]; const m = musings[P[i].id]; const kinds = ["past", "now", "ahead"].filter((x) => m[x]); if (!kinds.length) { turn++; return; }
    const kind = kinds[Math.floor(turn / alive.length) % kinds.length]; turn++;
    const o = figs.get(i); if ((o.busy || 0) > Date.now()) return; const b = o.el.querySelector(".hb");
    b.innerHTML = `<small>${KIND[kind]}${kind === "past" ? esc(aboutOf(m.about)) : ""}</small>${esc(m[kind])}`; b.className = `hb muse${o.x < 170 ? " al" : o.x > DW - 230 ? " ar" : ""}`; b.hidden = false;
    clearTimeout(o.pt); o.pt = setTimeout(() => { b.hidden = true; }, 7500);
  }
  // the weather of a season: from its time of year and its hardship, and a fixed roll for the season so that everyone who
  // looks sees the same sky. Winter snows most seasons, harder in a hard winter; spring and autumn rain some of the time;
  // a hard winter leaves the odd flurry in spring and autumn; a fire drops ash; summer is clear.
  function weatherOf(k) {
    const s = R.seasonOf(k), e = R.epochAt(k)?.kind, roll = (((k + 1) * 2654435761) >>> 0) % 100 / 100;
    if (e === "fire" && s !== "winter") return { kind: "ash", n: 45, word: "ash falling" };
    if (s === "winter") return roll < (e === "winter" ? 0.85 : 0.6) ? { kind: "snow", n: e === "winter" ? 120 : 70, word: "snow" } : { kind: null, word: "cold, clear" };
    if (e === "winter" && s !== "summer" && roll < 0.3) return { kind: "snow", n: 25, word: "a few flakes" };
    if ((s === "autumn" && roll < 0.5) || (s === "spring" && roll < 0.35)) return { kind: "rain", n: 80, word: "rain" };
    return null;
  }
  // the day turns over the season: first light, the working day, dusk, the long night — so a season is seen to pass
  function daylight() { const p = Math.min(1, Math.max(0, (Date.now() - (L.seasonStartedAt || Date.now())) / (L.seasonMs || 1200000)));
    const dark = p < 0.12 ? 0.45 - p * 3 : p < 0.6 ? 0.08 : p < 0.8 ? 0.08 + (p - 0.6) * 1.6 : 0.42;
    night.style.opacity = String(L.final || L.ended ? 0.25 : dark); clock.textContent = L.final || L.ended ? (weather?.word ?? "") : `${p < 0.12 ? "first light" : p < 0.6 ? "day" : p < 0.8 ? "dusk" : "night"}${weather?.word ? ` · ${weather.word}` : ""}`; }
  daylight();

  if (!reduce) setInterval(() => {
    if (document.hidden || !el.isConnected) return;
    if (Date.now() > nextMuse) { nextMuse = Date.now() + 8500; muse(); }
    if (Math.random() < 0.02) daylight();
    const sx = snowCv.getContext("2d"); sx.clearRect(0, 0, snowCv.width, snowCv.height);
    // snow falls outside: over the roof and the yard, never through the rooms
    // it comes and goes within a season: heavier, lighter, a lull, over a few minutes
    if (weather?.kind) { const swell = (Math.sin(Date.now() / 38000) + 1) / 2; const n = Math.floor(weather.n * Math.max(0.12, swell));
      const rain = weather.kind === "rain", ash = weather.kind === "ash"; sx.fillStyle = rain ? "rgba(140,155,175,.65)" : ash ? "#8a837b" : "#d9d6d0";
      for (let i = 0; i < n; i++) { const f = flakes[i]; f.y += rain ? f.v * 4 : ash ? f.v * 0.4 : f.v; f.x += rain ? 0.7 : Math.sin(f.y / 7) * 0.2;
        if (f.y > snowCv.height || f.x > snowCv.width) { f.y = 0; f.x = Math.random() * snowCv.width; } if (f.x > inX0 && f.x < inX1 && f.y > inY0 && f.y < inY1) continue;
        sx.fillRect(Math.round(f.x), Math.round(f.y), 1, rain ? 3 : 1); } }
    for (const o of figs.values()) {
      if (!o.room || o.el.hidden) continue; o.t++;
      if (o.pose === "work") { if (o.t % 6 === 0) { o.f ^= 1; body(o.cv, o.i, "work", o.f); } continue; }
      if (o.pose !== "walk") continue;
      if (Math.abs(o.tx - o.x) > 1) { const d = Math.sign(o.tx - o.x); o.x += d * 1.6; if (d !== o.dir) { o.dir = d; } if (o.t % 3 === 0) { o.f ^= 1; body(o.cv, o.i, "walk", o.f); } place(o); }
      else if (--o.wait <= 0) { o.wait = 12 + Math.floor(Math.random() * 40); const r = o.room; o.tx = r.x + 16 + Math.random() * Math.max(10, r.w - 70); if (o.f) { o.f = 0; body(o.cv, o.i, "walk", 0); } }
    }
  }, 100);

  return { el, update, pop };
}

/** the town as a whole, season by season: what it has now, and the line of it from the first season — the stores, the
 *  living, the low in spirits, the hardships, the dead — all from the record's count of each season */
export function townPanel(L, R, k) {
  const pop = L.population || []; const p = pop[k] || pop[pop.length - 1]; if (!p) return "";
  const store = (v) => (v >= 0.75 ? "well stocked" : v >= 0.5 ? "half full" : v >= 0.25 ? "running low" : "nearly empty");
  const n = Math.max(2, L.ticks || 60), W = 720, H = 110, X = (kk) => 8 + (kk / (n - 1)) * (W - 16), Y = (v) => 8 + (1 - v) * (H - 30);
  const upto = pop.slice(0, k + 1); const all = Math.max(...upto.map((q) => (q.alive || 0) + (q.dead || 0) + (q.left || 0)), 1);
  const line = (f) => upto.map((q, kk) => `${X(kk).toFixed(1)},${Y(f(q)).toFixed(1)}`).join(" ");
  const bands = (L.events || []).filter((e) => e.seasons && e.at - 1 <= k).map((e) => `<rect x="${X(e.at - 1)}" y="4" width="${Math.max(3, X(Math.min(k, e.at - 2 + e.seasons)) - X(e.at - 1))}" height="${H - 22}" class="band b-${esc(e.kind)}"><title>${esc(e.headline)}</title></rect>`).join("");
  const deaths = (L.people || []).map((c, i) => ({ c, i, d: (L.citizensDied || [])[i] })).filter((x) => x.d && x.d - 1 <= k).map((x) => `<g class="dm${R.named(x.i) ? " four" : ""}"><line x1="${X(x.d - 1)}" x2="${X(x.d - 1)}" y1="${H - 22}" y2="${H - 12}"/>${R.named(x.i) ? `<text x="${X(x.d - 1)}" y="${H - 2}">${esc(R.nm(x.i))}</text>` : ""}<title>${esc(x.c.name)} died, ${esc(R.labelOf(x.d - 1).toLowerCase())}</title></g>`).join("");
  const years = Array.from({ length: Math.floor((n - 1) / 4) + 1 }, (_, y) => `<line class="yr" x1="${X(y * 4)}" x2="${X(y * 4)}" y1="4" y2="${H - 22}"/>`).join("");
  const line0 = (L.townLines || [])[k] || "";
  return `<section class="town-now"><h2 class="ph">The town, ${esc(R.labelOf(k).toLowerCase())}</h2>
  <div class="tn-row"><span class="st">Stores <b>${store(p.supply ?? 0)}</b></span><span><b>${p.alive ?? 0}</b> alive</span><span class="${p.dead ? "bad" : ""}"><b>${p.dead ?? 0}</b> dead</span><span class="${p.starving ? "bad" : ""}"><b>${p.starving ?? 0}</b> hungry</span><span class="${p.sick ? "bad" : ""}"><b>${p.sick ?? 0}</b> sick</span><span class="${p.low ? "low" : ""}"><b>${p.low ?? 0}</b> low in spirits</span></div>
  ${line0 ? `<p class="tn-line">${esc(line0)}</p>` : ""}
  <figure class="tn-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="The town season by season">${bands}${years}
    <polyline class="l-store" points="${line((q) => q.supply ?? 0)}"/><polyline class="l-alive" points="${line((q) => (q.alive || 0) / all)}"/><polyline class="l-low" points="${line((q) => (q.low || 0) / all)}"/>${deaths}</svg>
    <figcaption><span class="k-store">stores</span><span class="k-alive">the living</span><span class="k-low">low in spirits</span><span class="k-band">a hardship</span><span class="k-dm">a death</span> &middot; season by season, from the first</figcaption></figure></section>`;
}
