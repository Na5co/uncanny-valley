// What the page does for itself: print the faces as pixels, draw the town cut open in charcoal, and move the people
// between seasons when — and only when — the reader presses a button. Nothing moves by itself.
import { paint } from "./pixel.mjs";
const people = window.PEOPLE || [];

function faces(root) {
  for (const cv of root.querySelectorAll("canvas.px:not([data-done])")) {
    const c = people[+cv.dataset.i]; if (!c) continue; cv.dataset.done = "1";
    const dead = cv.dataset.mood === "dead";
    paint(cv, c, { mood: cv.dataset.mood || "calm", res: dead ? Math.round(+(cv.dataset.res || 40) * 0.6) : +(cv.dataset.res || 40), ink: "none", levels: 6 });
  }
}
faces(document);
for (const t of document.querySelectorAll("time[datetime]")) {
  const d = new Date(t.getAttribute("datetime")); if (isNaN(d)) continue;
  t.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------- the town cut open ----------
const street = document.querySelector(".street[data-shelter]");
if (street) {
  const D = JSON.parse(street.dataset.shelter);
  const S = 3; // one canvas pixel is three CSS pixels
  const rng = (seed) => { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
  const C = { night: "#121110", sky1: "#1c1b1c", sky2: "#2c2a28", wall: "#2b2927", brick: "#211f1d", back: "#4d4843", back2: "#433f3a", slab: "#151413", ground: "#1d1b19", wood: "#2a231d", cloth: "#5f5850", light: "rgba(214,176,112,", snow: "#d9d6d0" };

  function building(cv, b, s) {
    const x = cv.getContext("2d"); const W = cv.width, H = cv.height; const r = rng(D.seed * 31 + b * 7 + 1);
    const winter = s.season === "winter", frost = s.epoch === "winter" && !winter;
    const px = (a, y, w, h, c) => { x.fillStyle = c; x.fillRect(a, y, w, h); };
    // sky and ground
    for (let y = 0; y < H; y++) px(0, y, W, 1, y < H * 0.5 ? C.sky1 : C.sky2);
    for (let i = 0; i < 30; i++) px(Math.floor(r() * W), Math.floor(r() * H * 0.6), 1, 1, "#3a3836");
    const gy = H - Math.round(D.GH / S);
    px(0, gy, W, H - gy, C.ground); for (let i = 0; i < 70; i++) px(Math.floor(r() * W), gy + Math.floor(r() * (H - gy)), 1, 1, r() < 0.5 ? "#2a2724" : "#141312");
    if (b === "yard") {
      // a fence and a bare tree; the graves are laid on it by the page
      for (let i = 2; i < W - 2; i += 4) px(i, gy - 6, 1, 6, "#3b3733"); px(1, gy - 5, W - 2, 1, "#3b3733");
      px(W - 12, gy - 30, 2, 30, "#2e2a26"); for (let i = 0; i < 9; i++) px(W - 12 - i, gy - 30 + i, 1, 1, "#2e2a26"), px(W - 10 + i, gy - 26 + i, 1, 1, "#2e2a26");
    } else {
      const fl = D.locs[b].tags; const fh = Math.round(D.FH / S); const L = 3, R = W - 4; const top = gy - fl.length * fh;
      // outer walls, broken at the edges
      px(L - 2, top - 1, R - L + 5, gy - top + 1, C.wall);
      for (let i = 0; i < 90; i++) { const yy = top + Math.floor(r() * (gy - top)); px(r() < 0.5 ? L - 2 + Math.floor(r() * 2) : R + Math.floor(r() * 2), yy, 1, 1, C.brick); }
      fl.forEach((kind, f) => {
        const y1 = gy - (f + 1) * fh, y0 = gy - f * fh; // room from y1 (ceiling) to y0 (floor)
        for (let yy = y1 + 1; yy < y0 - 1; yy++) for (let xx = L; xx < R; xx++) px(xx, yy, 1, 1, r() < 0.08 ? C.back2 : C.back);
        if (kind === "home") for (let xx = L + 2; xx < R; xx += 5) px(xx, y1 + 2, 1, y0 - y1 - 5, "#3f3b37");
        px(L - 2, y0 - 2, R - L + 5, 2, C.slab);
        // a window in the back wall with the night in it
        const wx = L + 6 + Math.floor(r() * 10); px(wx, y1 + 6, 7, 8, "#161618"); px(wx + 3, y1 + 6, 1, 8, "#2d2a27"); px(wx, y1 + 9, 7, 1, "#2d2a27");
        if (winter) for (let i = 0; i < 6; i++) px(wx + Math.floor(r() * 7), y1 + 6 + Math.floor(r() * 8), 1, 1, "#8c8983");
        const fy = y0 - 2;
        if (kind === "home") { px(L + 3, fy - 4, 15, 2, C.wood); px(L + 3, fy - 5, 15, 1, C.cloth); px(L + 3, fy - 6, 4, 1, "#8f887e"); px(L + 3, fy - 2, 1, 2, C.wood); px(L + 17, fy - 2, 1, 2, C.wood);
          px(R - 9, fy - 9, 6, 9, "#191817"); px(R - 8, fy - 4, 4, 2, "#d27a2c"); px(R - 7, fy - 5, 2, 1, "#f0b44c"); px(R - 7, y1 + 1, 2, fy - 9 - y1, "#1f1d1b"); }
        if (kind === "work") { px(L + 4, fy - 7, 22, 1, C.wood); px(L + 5, fy - 6, 1, 6, C.wood); px(L + 24, fy - 6, 1, 6, C.wood); for (let i = 0; i < 4; i++) px(L + 6 + i * 5, fy - 9, 2, 2, "#57514a");
          px(R - 12, fy - 7, 8, 7, "#3a3029"); px(R - 11, fy - 13, 6, 6, "#443830"); px(R - 12, fy - 4, 8, 1, "#2a221c"); for (let i = 0; i < 3; i++) px(L + 8 + i * 6, y1 + 3, 1, 5, "#5a544c"); }
        if (kind === "public") { px(L + 12, fy - 6, 26, 1, C.wood); px(L + 13, fy - 5, 1, 5, C.wood); px(L + 36, fy - 5, 1, 5, C.wood); px(L + 8, fy - 4, 2, 4, "#2e2620"); px(L + 40, fy - 4, 2, 4, "#2e2620"); px(L + 20, fy - 7, 2, 1, "#8d857a"); px(L + 28, fy - 7, 1, 1, "#8d857a"); }
        // a lamp and the warm light it throws: the only warm thing in the house
        const lx = L + Math.round((R - L) * (kind === "home" ? 0.6 : 0.5)); px(lx, y1 + 1, 1, 3, "#1a1918"); px(lx - 1, y1 + 4, 3, 1, "#e8c078");
        for (let yy = y1 + 5; yy < y0 - 2; yy++) { const spread = (yy - y1) * 1.3; for (let xx = Math.max(L, Math.round(lx - spread)); xx < Math.min(R, Math.round(lx + spread)); xx++) { x.fillStyle = C.light + (0.10 * (1 - Math.abs(xx - lx) / (spread + 1))).toFixed(3) + ")"; x.fillRect(xx, yy, 1, 1); } }
      });
      // the roof, and the holes in it
      for (let i = 0; i < 9; i++) px(L - 3 + i * 2, top - 1 - i, R - L + 7 - i * 4, 1, i === 0 ? "#171615" : "#262422");
      for (let i = 0; i < 5; i++) px(L + 2 + Math.floor(r() * (R - L - 4)), top - 1 - Math.floor(r() * 7), 2, 1, C.sky1);
      if (winter || frost) for (let i = 0; i < 9; i++) px(L - 3 + i * 2, top - 2 - i, R - L + 7 - i * 4, 1, winter ? C.snow : "#6d6b68");
      if (s.epoch === "fire") { for (let i = 0; i < 50; i++) px(L + Math.floor(r() * (R - L)), top - 12 + Math.floor(r() * 10), 1, 1, r() < 0.5 ? "#d2682c" : "#f2a53a"); }
      if (s.epoch === "war") for (let i = 0; i < 40; i++) px(L + Math.floor(r() * (R - L)), top - 20 + Math.floor(r() * 16), 2, 1, "#3b3936");
    }
    if (winter) { for (let i = 0; i < 80; i++) px(Math.floor(r() * W), Math.floor(r() * H), 1, 1, i % 3 ? "#a9a6a0" : C.snow); px(0, gy - 1, W, 2, C.snow); }
    else if (frost) px(0, gy - 1, W, 1, "#6d6b68");
    if (s.epoch === "plague") { x.fillStyle = "rgba(120,140,100,.12)"; x.fillRect(0, 0, W, H); }
  }

  // a person, head to foot: the face printed small on top, a coat the colour of their name, the pose of their season
  const heads = new Map();
  async function head(i) {
    if (!heads.has(i)) heads.set(i, (async () => { const off = document.createElement("canvas"); off.width = off.height = 16; await paint(off, people[i], { res: 16, ink: "none", levels: 5 }); return off; })());
    return heads.get(i);
  }
  const COATS = ["#5a534c", "#4b4f52", "#5c5145", "#44463f", "#605549", "#4a4950", "#56504a", "#474039"];
  // the portrait is a bust: its head and shoulders are the top of the figure, and a coat and legs are drawn on below
  async function figure(cv, i, pose) {
    const lying = pose === "bed"; const w = lying ? 30 : 16, hh = lying ? 16 : 30; if (cv.width !== w) { cv.width = w; cv.height = hh; }
    const x = cv.getContext("2d"); x.clearRect(0, 0, w, hh); const px = (a, y, ww, h, c) => { x.fillStyle = c; x.fillRect(a, y, ww, h); };
    const coat = COATS[(people[i]?.id || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % COATS.length];
    const legs = "#262422", h = await head(i);
    if (lying) { px(0, 12, 30, 4, "#2a231d"); px(0, 11, 30, 1, "#3a3029"); x.drawImage(h, 0, -3); px(13, 6, 17, 6, "#6a6259"); px(13, 6, 17, 1, "#80786e"); return; } // under a blanket, the face on the pillow
    const dy = pose === "sit" ? 4 : 0;
    px(2, 14 + dy, 12, 9, coat); px(2, 14 + dy, 12, 1, "rgba(255,255,255,.08)"); px(7, 15 + dy, 1, 8, "rgba(0,0,0,.25)");
    if (pose === "work") { px(13, 16 + dy, 3, 2, coat); px(15, 18 + dy, 1, 1, "#a39c93"); }
    if (pose === "sit") { px(3, 23, 11, 3, legs); px(12, 26, 2, 4, legs); px(1, 26, 13, 1, "#1a1715"); px(2, 27, 1, 3, "#1a1715"); }
    else { px(4, 23, 3, 6, legs); px(9, 23, 3, 6, legs); px(4, 29, 3, 1, "#0e0d0c"); px(9, 29, 3, 1, "#0e0d0c"); }
    x.drawImage(h, 0, dy - 1);
  }

  const figs = [...street.querySelectorAll(".fig")], graves = [...street.querySelectorAll(".grave")];
  const cvs = [...street.querySelectorAll("canvas.bld-bg")];
  const whenEl = document.querySelector(".st-when"), slot = document.querySelector(".report-slot");
  const places = [...document.querySelectorAll(".place")];
  const ticks = [...document.querySelectorAll(".tick")], steps = [...document.querySelectorAll(".step")];
  let now = D.seasons.length - 1;
  function show(k, first) {
    now = Math.max(0, Math.min(D.seasons.length - 1, k)); const s = D.seasons[now];
    cvs.forEach((cv) => building(cv, cv.dataset.b === "yard" ? "yard" : +cv.dataset.b, s));
    const at = new Map(s.spots.map((p) => [p[0], p])), gr = new Map(s.graves.map((g) => [g[0], g]));
    for (const el of figs) {
      const i = +el.dataset.i, p = at.get(i);
      el.className = `fig${p ? ` pose-${p[3]}${p[6] ? " lift" : ""}` : " away"}${el.classList.contains("named") ? " named" : ""}`;
      if (!p) continue;
      el.style.left = p[1] + "px"; el.style.bottom = p[2] + "px";
      el.querySelector(".tag .tl").innerHTML = p[4].map((t, n) => `<em class="${p[5][n]}">${String(t).replace(/[<&]/g, "")}</em>`).join("");
      figure(el.querySelector("canvas.figc"), i, p[3]);
    }
    for (const el of graves) { const g = gr.get(+el.dataset.i); el.classList.toggle("away", !g); if (g) { el.style.left = g[1] + "px"; el.querySelector(".tag em").textContent = g[2]; } }
    whenEl.textContent = s.when;
    for (const pl of places) { const b = pl.dataset.b; pl.querySelector("span").textContent = b === "yard" ? s.graves.length : s.spots.filter((p) => p[7] === +b).length; }
    ticks.forEach((t) => t.classList.toggle("on", +t.dataset.k === now));
    steps[0].disabled = now === 0; steps[1].disabled = now === D.seasons.length - 1;
    if (!first) { const tpl = document.getElementById(`rep-${now}`); if (tpl) { slot.replaceChildren(tpl.content.cloneNode(true)); faces(slot); } }
  }
  steps.forEach((b) => b.addEventListener("click", () => show(now + +b.dataset.step)));
  ticks.forEach((t) => t.addEventListener("click", () => show(+t.dataset.k)));
  document.addEventListener("keydown", (e) => { if (e.target.closest && e.target.closest("input,textarea")) return; if (e.key === "ArrowLeft") show(now - 1); if (e.key === "ArrowRight") show(now + 1); });
  places.forEach((pl) => pl.addEventListener("click", () => street.parentElement.scrollTo({ left: Math.max(0, +pl.dataset.x - 16), behavior: "instant" })));
  show(now, true);
  // on a narrow screen, open the street where most of the four are
  const wrap = street.parentElement; if (wrap.scrollWidth > wrap.clientWidth) { const n = street.querySelector(".fig.named:not(.away)"); if (n) wrap.scrollLeft = Math.max(0, n.offsetLeft - wrap.clientWidth / 2); }
}
