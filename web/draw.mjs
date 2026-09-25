// Drawing, shared by the server (share cards, digests) and the page. Pure functions that return SVG strings.
// Faces are procedural from a person's id, role and age; expressions come from their state.
export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const short = (n) => { const p = String(n).split(" "); return p[0].endsWith(".") && p[1] ? p[0] + " " + p[1] : p[0]; };

const SKIN = ["#f1d3b3", "#e3b98f", "#cf9a6e", "#b07d55", "#8a5a3a", "#6b4630"];
const HAIR = ["#2a1d14", "#5a3a22", "#8a6a3a", "#c9a36a", "#4a4a4a", "#d8cfc0"];
const COATS = ["#8a3b2f", "#2f5f8a", "#6a7a3a", "#8a6a2a", "#5a3a6a", "#3a6a6a", "#9a5a3a", "#4a4a7a", "#7a4a4a", "#3a5a3a", "#a06a8a", "#6a5a3a"];
export const role = (r) => { const n = (r || "").toLowerCase(); return /clerk|foreman|overseer/.test(n) ? "clerk" : /min|pit|quarry|digger/.test(n) ? "miner" : /farm|shepherd|field|hand/.test(n) ? "farmer" : /shop|keeper|merchant|trader|grocer/.test(n) ? "shop" : /publican|innkeep|tavern|brewer|bar/.test(n) ? "publican" : /doctor|nurse|physician|midwife/.test(n) ? "doctor" : /priest|parson|vicar|chapel/.test(n) ? "priest" : /soldier|guard|officer/.test(n) ? "soldier" : "villager"; };
export const coat = (c) => COATS[hash(c.id) % COATS.length];

/** A face: the noir bust. mood: "calm" | "hungry" | "sick" | "angry" | "glad" | "dead" | "gone". size in px. */
export function face(c, mood = "calm", size = 64) { return portrait(c, mood, size); }
export function faceOld(c, mood = "calm", size = 64) {
  const skin = SKIN[hash(c.id + "s") % SKIN.length], hair = c.age >= 60 ? "#d8cfc0" : HAIR[hash(c.id + "h") % HAIR.length], ct = coat(c), r = role(c.role);
  const h = hash(c.id + "f"); const eyeGap = 9 + (h % 4), noseLen = 5 + ((h >> 3) % 4), browTilt = ((h >> 5) % 3) - 1, mouthW = 8 + ((h >> 7) % 5), jaw = 22 + ((h >> 9) % 5);
  const sick = mood === "sick", dead = mood === "dead" || mood === "gone";
  const skinC = sick ? "#c8d1a8" : dead ? "#c9c2b4" : skin;
  const eye = (x) => dead ? `<path d="M${x - 3} 27 l6 6 M${x + 3} 27 l-6 6" stroke="#2a1d14" stroke-width="2" fill="none"/>` : `<ellipse cx="${x}" cy="30" rx="2.6" ry="${mood === "angry" ? 2 : 3}" fill="#2a1d14"/>`;
  const brow = (x, s) => `<path d="M${x - 5} ${24 + (mood === "angry" ? s * 2 : -s * browTilt)} L${x + 5} ${24 + (mood === "angry" ? -s * 2 : s * browTilt)}" stroke="#2a1d14" stroke-width="1.6" stroke-linecap="round"/>`;
  const mouth = mood === "glad" ? `<path d="M${32 - mouthW / 2} 44 q${mouthW / 2} 7 ${mouthW} 0" stroke="#7a3a2a" stroke-width="2" fill="none"/>` : mood === "angry" || mood === "hungry" || sick ? `<path d="M${32 - mouthW / 2} 46 q${mouthW / 2} -5 ${mouthW} 0" stroke="#7a3a2a" stroke-width="2" fill="none"/>` : dead ? `<path d="M${32 - mouthW / 2} 45 h${mouthW}" stroke="#7a3a2a" stroke-width="2"/>` : `<path d="M${32 - mouthW / 2} 45 q${mouthW / 2} 2 ${mouthW} 0" stroke="#7a3a2a" stroke-width="2" fill="none"/>`;
  const hat = r === "miner" ? `<path d="M14 20 q18 -14 36 0 v4 h-36z" fill="#d9c27a"/><circle cx="32" cy="15" r="2.4" fill="#fff2a0"/>` : r === "farmer" ? `<ellipse cx="32" cy="19" rx="24" ry="4" fill="#d8c27a"/><path d="M20 19 q12 -12 24 0z" fill="#d8c27a"/>` : r === "clerk" ? `<path d="M15 20 q17 -10 34 0 v3 h-34z" fill="#2b3a52"/><rect x="12" y="21" width="20" height="2.4" fill="#2b3a52"/>` : r === "doctor" ? `<rect x="18" y="12" width="28" height="8" rx="2" fill="#fff"/><path d="M30 14 h4 v4 h-4z M28 16 h8 v-0 " fill="#c0392b"/>` : r === "soldier" ? `<rect x="18" y="6" width="28" height="15" rx="2" fill="#1a1c22"/>` : "";
  const hairP = hat ? "" : `<path d="M13 30 q0 -22 19 -22 q19 0 19 22 q-5 -10 -19 -11 q-14 1 -19 11z" fill="${hair}"/>`;
  const apron = r === "shop" || r === "publican" ? `<path d="M22 58 h20 v6 h-20z" fill="${r === "shop" ? "#e8dcc8" : "#d9c7a8"}"/>` : "";
  const sweat = mood === "hungry" ? `<path d="M46 26 q2 4 0 6 q-2 -2 0 -6z" fill="#8fbbe8"/>` : "";
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" class="face" role="img" aria-label="${esc(c.name)}"><rect x="16" y="52" width="32" height="14" rx="6" fill="${ct}"/>${apron}<ellipse cx="32" cy="36" rx="${jaw / 1.9}" ry="16" fill="${skinC}"/>${hairP}${hat}${brow(32 - eyeGap, 1)}${brow(32 + eyeGap, -1)}${eye(32 - eyeGap)}${eye(32 + eyeGap)}<path d="M32 33 v${noseLen} l3 1" stroke="#a8785a" stroke-width="1.5" fill="none"/>${mouth}${sweat}</svg>`;
}

/** The mood a person shows, from their season flags and outcome. flags: 1 starving 2 sick 4 roofless 8 rich 16 poor 32 known for harm 64 known for help */
export function moodOf(flags, alive, left) { if (!alive) return "dead"; if (left) return "gone"; if (flags & 128) return "sick"; if (flags & 2) return "sick"; if (flags & 1) return "hungry"; if (flags & 32) return "angry"; if (flags & 8 || flags & 64) return "glad"; return "calm"; }
export function standing(flags, alive, left, cause) { if (!alive) return "died of " + (cause || "the years"); if (left) return "gone"; const s = []; if (flags & 128) s.push("dying"); if (flags & 1) s.push("starving"); if (flags & 2) s.push("sick"); if (flags & 4) s.push("no roof"); if (flags & 32) s.push("feared"); if (flags & 64) s.push("trusted"); if (flags & 8) s.push("well off"); else if (flags & 16) s.push("broke"); return s.slice(0, 2).join(", ") || "getting by"; }

/** A full-body figure for the street. w px wide. state: {mood, walking} */
export function figure(c, mood = "calm", size = 54) {
  const ct = coat(c), r = role(c.role);
  const dead = mood === "dead";
  return `<g class="fig${dead ? " dead" : ""}"><svg viewBox="0 0 40 96" width="${size * 40 / 96}" height="${size}"><g class="legs"><rect x="12" y="72" width="7" height="22" rx="3" fill="#3a3028"/><rect x="21" y="72" width="7" height="22" rx="3" fill="#3a3028"/></g><rect x="9" y="38" width="22" height="38" rx="7" fill="${ct}"/>${r === "shop" || r === "publican" ? `<rect x="14" y="50" width="12" height="22" rx="2" fill="#e8dcc8"/>` : ""}<g class="arms"><rect x="3" y="42" width="6" height="26" rx="3" fill="${ct}"/><rect x="31" y="42" width="6" height="26" rx="3" fill="${ct}"/></g><foreignObject x="4" y="2" width="32" height="34">${face(c, mood, 32).replace('class="face"', 'class="face small"')}</foreignObject></svg></g>`;
}

export const KIND_ICON = { theft: "💰", violence: "👊", betrayal: "🗡️", abandonment: "🚪", lie: "🤥", help: "❤️", gift: "🍞", rescue: "❤️", sacrifice: "🕊️", mercy: "🤝", justice: "⚖️", loyalty: "🛡️", death: "💀", birth: "👶", sick: "🤒", leave: "🎒", homeless: "🏚️", marry: "💍", choice: "🎲", well: "🌿", housed: "🏠", work: "🔨" };
export const HARM = new Set(["theft", "violence", "betrayal", "abandonment", "lie", "justice"]);
export const HELP = new Set(["help", "gift", "rescue", "sacrifice", "mercy", "loyalty"]);
export const tone = (a) => a.kind === "death" ? "death" : HARM.has(a.kind) || (a.harm || 0) >= 0.3 ? "harm" : HELP.has(a.kind) || (a.help || 0) >= 0.3 ? "help" : a.kind === "choice" && a.quiet ? "quiet" : "plain";

/** One panel: an event as a comic frame. a: an act from the record; people: citizens array; label: season label. */
export function panel(a, people, label, opts = {}) {
  const A = people[a.c], T = a.target != null ? people[a.target] : null; const t = tone(a);
  const who = short(A.name), whom = T ? short(T.name) : null;
  let line;
  if (a.kind === "choice") line = `<i class="sit">${esc(a.situation || "")}</i><b>${esc(who)}: ${esc(a.text)}</b><span class="out">— ${esc(a.outcome || "")}</span>`;
  else if (a.kind === "death") line = `<b>${esc(who)} ${esc(a.text)}${a.by != null && people[a.by] && a.by !== a.c ? ` — ${esc(short(people[a.by].name))}'s doing` : ""}.</b>${T && a.household ? `<span class="out">${esc(short(T.name))} is left behind.</span>` : ""}`;
  else if (a.kind === "marry") line = `<b>${esc(who)} marries ${esc(whom)}.</b>`;
  else if (a.kind === "birth") line = `<b>A child is born to ${esc(who)}.</b>`;
  else if (a.kind === "sick") line = `<b>${esc(who)} has caught the sickness.</b>`;
  else if (a.kind === "leave") line = `<b>${esc(who)} leaves for good.</b>`;
  else if (a.kind === "homeless") line = `<b>${esc(who)} ${esc(a.text || "has lost the roof")}.</b>`;
  else if (a.kind === "well") line = `<b>${esc(who)} recovers.</b>`;
  else if (a.kind === "housed") line = `<b>${esc(who)} has a roof again${T ? `, at ${esc(short(T.name))}'s` : ""}.</b>`;
  else if (a.kind === "work") line = `<b>${esc(who)} ${esc(a.text)}.</b>`;
  else line = `${a.situation ? `<i class="sit">${esc(a.situation)}</i>` : ""}<b>${esc(who)} ${esc(a.text || "")}.</b>${a.choice ? `<span class="out">— chose <b>${esc(a.choice)}</b>${a.outcome ? `: ${esc(a.outcome)}` : ""}</span>` : ""}`;
  const thought = a.thought ? `<q>${esc(a.thought)}</q>` : "";
  const moodA = t === "harm" ? "angry" : t === "help" ? "glad" : a.kind === "death" ? "dead" : a.kind === "sick" ? "sick" : "calm";
  const moodT = t === "harm" ? "hungry" : t === "help" ? "glad" : a.kind === "marry" ? "glad" : "calm";
  return `<article class="panel ${t}${opts.mine ? " mine" : ""}${a.kind === "death" ? " headline" : ""}" data-c="${a.c}" data-t="${a.target ?? ""}"><div class="pp">${face(A, moodA, a.kind === "death" ? 72 : 56)}${T && a.kind !== "death" ? `<span class="vs">${KIND_ICON[a.kind] || "·"}</span>${face(T, moodT, 56)}` : `<span class="vs solo">${KIND_ICON[a.kind] || "·"}</span>`}</div><div class="pt"><span class="when">${esc(label)}</span>${line}${thought}${impactChips(a, A, T, people)}${a.impact ? killChips(a, people) : ""}</div></article>`;
}
export function impactChips(a, A, T) {
  if (!a.impact) return killChips(a, arguments[3] || []);
  const chip = (d, who) => { if (!d) return ""; const out = []; for (const [k, v] of Object.entries(d)) { if (v == null) continue; if (typeof v === "number") { if (k === "tie") out.push([v > 0 ? "good" : "bad", v > 0 ? "closer" : "colder"]); else if (k === "children") out.push(["good", "a child"]); else { const s = Math.round(v * 100); if (s) out.push([s > 0 ? "good" : "bad", (s > 0 ? "+" : "") + s + " " + k]); } } else if (k === "sick") out.push([v ? "bad" : "good", v ? "falls sick" : "recovers"]); else if (k === "home") out.push([v ? "good" : "bad", v ? "a roof" : "no roof"]); else if (k === "partner") out.push(["good", "married"]); else if (k === "job") out.push([v ? "good" : "bad", v ? "work" : "no work"]); } return out.length ? `<span class="who">${esc(short(who.name))}</span>` + out.map(([c, s]) => `<span class="chip ${c}">${esc(s)}</span>`).join("") : ""; };
  const inner = chip(a.impact.self, A) + (T ? chip(a.impact.target, T) : "");
  return inner ? `<div class="imp">${inner}</div>` : "";
}
export function killChips(a, people) { return a.kills && a.kills.length ? `<div class="imp">${a.kills.map((i) => `<span class="chip dead">✝ ${esc(short(people[i].name))}</span>`).join("")}</div>` : "";
}

/** How a deed moves a conscience — the same arithmetic as the sim (sim.ts conscienceStep). */
export const STEP = (harm = 0, help = 0) => help * 0.4 - harm * 0.6;
export const TURNED = -0.5;
export const DECAY = 0.97;
export const isDeed = (a) => a.kind !== "choice" && ((a.harm || 0) > 0 || (a.help || 0) > 0);
export const cLabel = (c, tested = true, prev = null, lately = null) => c <= TURNED ? "turned" : lately === "harm" && c > 0.2 ? "kind, lately cruel" : lately === "help" && c < -0.15 ? "dark, lately kind" : c < -0.15 || (prev === "going dark" && c < 0) ? "going dark" : c < 0.2 && !(prev === "kind" && c >= 0.12) ? (tested ? "mixed" : "untested") : "kind";
/** a chore: a choice that touched nobody. It never enters the feed; it shows as a small icon under the face. */
export const isChore = (a) => a.kind === "choice";
export const choreIcon = (a) => { const t = (a.text + " " + (a.evening || "")).toLowerCase(); return /tavern|drink/.test(t) ? "🍺" : /chapel|pray/.test(t) ? "🕯" : /shift|work|pay|seam|orders|foreman/.test(t) ? "⛏" : /save|money|debt|ledger/.test(t) ? "🪙" : /roof|plot|home|house|mend/.test(t) ? "🏠" : /see|walk|visit|evening/.test(t) ? "👋" : /rest|bed|sleep/.test(t) ? "🛏" : "·"; };
export const cColor = (c) => c <= TURNED ? "#8a1f14" : c < -0.15 ? "#b8542a" : c < 0.15 ? "#8a8272" : c < 0.5 ? "#5c8a2a" : "#2f7a2a";

/** One person's line through the years: every deed a point, the seasons between them a slow fade to zero.
 *  acts: the record's acts (per season arrays, people as indexes); i: person index; upto: {k, j} — the last revealed act (season k, index j), or null for all. */
export function lineOf(acts, i, upto = null, ticks = acts.length) {
  const pts = [{ x: 0, c: 0 }]; const marks = []; let c = 0, endK = 0;
  for (let k = 0; k < acts.length; k++) {
    const as = acts[k]; const done = !upto || k < upto.k; const n = done ? as.length : upto.k === k ? upto.j + 1 : 0;
    if (n === 0 && !done) break;
    c *= DECAY; endK = k + 1;
    const mine = []; for (let j = 0; j < n; j++) if (as[j].c === i) mine.push(j);
    const own = as.filter((a) => a.c === i).length || 1;
    let seen = 0;
    for (const j of mine) { const a = as[j]; seen++; const x = k + seen / (own + 1);
      if (isDeed(a)) { const d = STEP(a.harm, a.help); c = Math.max(-1, Math.min(1, c + d)); pts.push({ x, c }); marks.push({ x, c, k, j, kind: a.kind, d, a }); }
      else if (a.kind === "death" || a.kind === "turned" || a.kind === "leave") marks.push({ x, c, k, j, kind: a.kind, d: 0, a });
    }
    if (done || n === as.length) pts.push({ x: k + 1, c });
    if (as.some((a, j) => j < n && a.c === i && (a.kind === "death" || a.kind === "leave"))) break;
  }
  return { pts, marks, c, endK };
}

/** The lane chart for one person (SVG). epochs: [{at, seasons, kind}], flags: per-season flags for this person (pressure strip). */
export function laneSvg(line, ticks, opts = {}) {
  const W = opts.width || 600, H = opts.height || 56, padL = 2, padR = 2; const mono = !!opts.mono;
  const col = (c) => mono ? (c <= TURNED ? "#ff3b30" : c < -0.15 ? "#b0524a" : c < 0.15 ? "#8a919c" : "#e8e6df") : cColor(c); const up = mono ? "#e8e6df" : "#3e7a2a", down = mono ? "#ff3b30" : "#a23b2a", bandCol = mono ? "#ffffff" : null; const X = (x) => padL + (x / ticks) * (W - padL - padR); const Y = (c) => { const v = Math.sign(c) * Math.sqrt(Math.abs(c)); return 8 + (1 - v) / 2 * (H - 22); };
  const bands = (opts.epochs || []).map((e) => `<rect x="${X(e.at - 1)}" y="0" width="${X(e.at - 1 + e.seasons) - X(e.at - 1)}" height="${H - 12}" fill="${bandCol || (e.kind === "boom" ? "#c8a415" : "#6a3a2a")}" opacity="${mono ? ".05" : ".10"}"/>`).join("");
  const years = Array.from({ length: Math.floor(ticks / 4) + 1 }, (_, y) => `<line x1="${X(y * 4)}" x2="${X(y * 4)}" y1="0" y2="${H - 12}" stroke="currentColor" opacity=".08"/>`).join("");
  const zero = `<line x1="${X(0)}" x2="${X(ticks)}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" opacity=".18" stroke-dasharray="2 4"/>`;
  const dark = `<rect x="${X(0)}" y="${Y(TURNED)}" width="${X(ticks) - X(0)}" height="${Y(-1) - Y(TURNED)}" fill="#ff3b30" opacity="${mono ? ".06" : ".07"}"/>${mono ? `<line x1="${X(0)}" x2="${X(ticks)}" y1="${Y(TURNED)}" y2="${Y(TURNED)}" stroke="#ff3b30" opacity=".35" stroke-width="1"/>` : ""}`;
  const seg = []; for (let i = 1; i < line.pts.length; i++) { const a = line.pts[i - 1], b = line.pts[i]; seg.push(`<line x1="${X(a.x)}" y1="${Y(a.c)}" x2="${X(b.x)}" y2="${Y(b.c)}" stroke="${col((a.c + b.c) / 2)}" stroke-width="${mono ? 2 : 2.8}" stroke-linecap="round"/>`); }
  const marks = line.marks.map((m) => { const x = X(m.x), y = Y(m.c); const t = `data-k="${m.k}" data-j="${m.j}" class="mk ${m.kind}"`;
    if (m.kind === "death") return `<text ${t} x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" fill="currentColor">✝</text>`;
    if (m.kind === "leave") return `<text ${t} x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" fill="currentColor">→</text>`;
    if (m.kind === "turned") return `<g ${t}><line x1="${x}" x2="${x}" y1="${y}" y2="${H - 12}" stroke="#8a1f14" stroke-width="1"/><text x="${x + 3}" y="${H - 14}" font-size="9" fill="#8a1f14" font-family="system-ui,sans-serif">turned</text></g>`;
    const r = (mono ? 2.5 : 3) + Math.min(1, Math.abs(m.d) / 0.6) * (mono ? 4 : 5); return `<circle ${t} cx="${x}" cy="${y}" r="${r}" fill="${m.d < 0 ? down : up}" stroke="var(--paper,#fff)" stroke-width="1.2"/>`; }).join("");
  const strip = (opts.flags || []).map((f, k) => { if (k >= line.endK) return ""; const col = f & 128 ? "#1d1b17" : f & 1 ? "#a2652a" : f & 2 ? "#6a3a8a" : f & 4 ? "#7a7a7a" : null; return col ? `<rect x="${X(k)}" y="${H - 8}" width="${X(k + 1) - X(k)}" height="5" fill="${col}" opacity=".75"><title>${f & 128 ? "dying" : f & 1 ? "starving" : f & 2 ? "sick" : "no roof"}</title></rect>` : ""; }).join("");
  const head = line.pts.length ? (() => { const p = line.pts[line.pts.length - 1]; return `<circle cx="${X(p.x)}" cy="${Y(p.c)}" r="3" fill="${col(p.c)}" class="head"/>`; })() : "";
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="lane-svg">${bands}${years}${dark}${zero}${seg.join("")}${strip}${marks}${head}</svg>`;
}

/** The years across the top: year marks and the epochs as labelled bands. */
export function trackSvg(ticks, epochs, opts = {}) {
  const W = opts.width || 600, H = 26; const X = (x) => 2 + (x / ticks) * (W - 4); const mono = !!opts.mono;
  const years = Array.from({ length: Math.floor(ticks / 4) }, (_, y) => `<text x="${X(y * 4) + 2}" y="${H - 4}" font-size="9" fill="currentColor" opacity=".6" font-family="system-ui,sans-serif">${y % 2 === 0 || ticks <= 32 ? "Y" + (y + 1) : ""}</text>`).join("");
  const bands = epochs.map((e) => `<g><rect x="${X(e.at - 1)}" y="2" width="${X(e.at - 1 + e.seasons) - X(e.at - 1)}" height="12" rx="${mono ? 0 : 3}" fill="${mono ? "#ffffff" : e.kind === "boom" ? "#c8a415" : "#6a3a2a"}" opacity="${mono ? ".08" : ".35"}"/><text x="${X(e.at - 1) + 3}" y="11.5" font-size="9" fill="currentColor" font-family="system-ui,sans-serif">${esc(e.kind)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="track-svg">${bands}${years}<line id="nowline" x1="0" x2="0" y1="0" y2="${H}" stroke="#ff3b30" stroke-width="1.5"/></svg>`;
}

/** One moment as a card: who, when, the situation, what they chose, what came of it, what they thought, and how far it moved them. */
export function moment(a, people, label, opts = {}) {
  const A = people[a.c], T = a.target != null ? people[a.target] : null; const who = esc(short(A.name)), whom = T ? esc(short(T.name)) : null;
  const d = isDeed(a) ? STEP(a.harm, a.help) : 0; const t = tone(a);
  let head, body = "";
  if (a.kind === "death") head = `${who} dies of ${esc(a.text.replace(/^dies of /, ""))}${a.by != null && people[a.by] && a.by !== a.c ? ` — ${esc(short(people[a.by].name))}'s doing` : ""}.`;
  else if (a.kind === "turned") head = `${who} has turned.`;
  else if (a.kind === "marry") head = `${who} marries ${whom}.`;
  else if (a.kind === "birth") head = `A child is born to ${who}.`;
  else if (a.kind === "sick") head = `${who} has caught the sickness.`;
  else if (a.kind === "leave") head = `${who} leaves for good.`;
  else if (a.kind === "homeless") head = `${who} ${esc(a.text || "has lost the roof")}.`;
  else if (a.kind === "well") head = `${who} recovers.`;
  else if (a.kind === "housed") head = `${who} has a roof again${T ? `, at ${whom}'s` : ""}.`;
  else if (a.kind === "work") head = `${who} ${esc(a.text)}.`;
  else if (a.kind === "choice" && a.quiet) { head = `${who} ${esc((a.outcome || a.text).charAt(0).toLowerCase() + (a.outcome || a.text).slice(1))}.`; }
  else if (a.kind === "choice") { head = `${who}: ${esc(a.text)}.`; body = `${a.situation ? `<p class="sit">${esc(a.situation)}</p>` : ""}${a.outcome ? `<p class="out">${esc(a.outcome)}</p>` : ""}`; }
  else { head = `${who} ${esc(a.text)}.`; body = `${a.situation ? `<p class="sit">${esc(a.situation)}</p>` : ""}${a.choice ? `<p class="out">Chose <b>${esc(a.choice)}</b>${a.outcome ? ` — ${esc(a.outcome)}` : ""}</p>` : ""}`; }
  const thought = a.thought ? `<q>${esc(a.thought)}</q>` : "";
  const size = Math.abs(d) < 0.15 ? "a small" : Math.abs(d) < 0.4 ? "a" : "a great";
  const delta = d ? `<span class="delta ${d < 0 ? "down" : "up"}">${d < 0 ? "↓" : "↑"} ${size} ${d < 0 ? "harm" : "kindness"}</span>` : "";
  const kills = a.kills && a.kills.length ? a.kills.map((i) => `<span class="delta down">✝ ${esc(short(people[i].name))}</span>`).join("") : "";
  const mood = t === "harm" ? "angry" : t === "help" ? "glad" : a.kind === "death" ? "dead" : a.kind === "sick" ? "sick" : "calm";
  return `<article class="mo ${t}${a.kind === "death" || a.kind === "turned" ? " big" : ""}${a.quiet ? " quiet" : ""}${opts.now ? " now" : ""}" data-c="${a.c}" data-k="${opts.k ?? ""}" data-j="${opts.j ?? ""}"><div class="mf">${face(A, mood, 40)}${T && a.kind !== "death" && a.kind !== "turned" ? face(T, t === "harm" ? "hungry" : "calm", 28) : ""}</div><div class="mt"><span class="when">${esc(label)}</span><h4>${head}</h4>${body}${thought}${delta || kills ? `<div class="dl">${delta}${kills}</div>` : ""}</div></article>`;
}

/** One verb per kind of moment, so a moment can be read as a picture: A verb B. */
export const VERB = { theft: "robbed", violence: "beat", betrayal: "betrayed", abandonment: "abandoned", lie: "lied to", help: "helped", gift: "fed", rescue: "saved", sacrifice: "gave everything for", mercy: "spared", justice: "turned in", loyalty: "stood by", marry: "married", death: "died", birth: "had a child", sick: "fell sick", leave: "left for good", homeless: "lost the roof", turned: "has turned", well: "recovered", housed: "found a roof", work: "found work" };
export function verbOf(a, people) {
  if (a.kills && a.kills.length) return a.kind === "abandonment" ? "left to die" : a.kind === "justice" ? "had hanged" : a.kind === "betrayal" ? "had shut in to die" : "killed";
  if (isDeed(a) && a.target == null && a.text) return a.text;
  if (a.kind === "death") return a.by != null && a.by !== a.c && people[a.by] ? `killed by ${short(people[a.by].name)}` : a.text.replace(/^dies of /, "died of ");
  if (a.kind === "choice") { const t = a.text.replace(/\.$/, ""); return t.charAt(0).toLowerCase() + t.slice(1); }
  if (a.kind === "work") return a.text;
  if (/hanged/.test(a.text || "")) return "had hanged";
  return VERB[a.kind] || a.text;
}
/** A moment as one line: [A] verb [B] · when. The prose is folded away under it. */
export function row(a, people, label, opts = {}) {
  const A = people[a.c], T = a.target != null ? people[a.target] : null; const t = tone(a); const d = isDeed(a) ? STEP(a.harm, a.help) : 0;
  const victim = a.kills && a.kills.length ? people[a.kills[0]] : (a.kind === "death" && a.by != null && a.by !== a.c ? null : T);
  const withT = victim && a.kind !== "turned" && a.kind !== "death" && a.kind !== "choice";
  const faceOf = (p, mood) => `<span class="ra">${face(p, mood, 30)}<b>${esc(short(p.name))}</b></span>`;
  // the deed in its own words, with the other person's face where their name falls: "attacked [Gerd] and lost"
  let middle;
  if (withT && isDeed(a) && a.text && a.text.includes(short(victim.name)) && !(a.kills && a.kills.length)) { const [pre, ...rest] = a.text.split(short(victim.name)); middle = `<span class="rv ${d < 0 ? "down" : d > 0 ? "up" : ""}">${esc(pre.trim())}</span>${faceOf(victim, t === "harm" ? "hungry" : "calm")}${rest.join(short(victim.name)).trim() ? `<span class="rv ${d < 0 ? "down" : d > 0 ? "up" : ""}">${esc(rest.join(short(victim.name)).trim())}</span>` : ""}`; }
  else { const v = verbOf(a, people); middle = `<span class="rv ${d < 0 ? "down" : d > 0 ? "up" : ""}">${esc(v)}</span>${withT ? faceOf(victim, t === "harm" ? "hungry" : "calm") : ""}`; }
  const back = opts.answers ? `<span class="back" title="pays back ${esc(opts.answers)}">↩ ${esc(opts.answers)}</span>` : "";
  const prose = [a.situation ? `<p class="sit">${esc(a.situation)}</p>` : "", a.choice ? `<p class="out">Chose <b>${esc(a.choice)}</b>${a.outcome ? ` — ${esc(a.outcome)}` : ""}</p>` : a.outcome ? `<p class="out">${esc(a.outcome)}</p>` : "", a.thought ? `<q>${esc(a.thought)}</q>` : "", a.kind === "death" && a.by != null && a.by !== a.c ? `<p class="out">${esc(opts.cause || `${short(people[a.by].name)}'s doing.`)}</p>` : ""].join("");
  // who moved it: a decision somebody made, or the world doing something to them. A famine and a choice were the
  // same row, and the choices are the whole point of watching.
  const moved = a.dilemma ? (a.kills?.length || (a.harm ?? 0) >= 0.1 ? "cost" : "chose")
    : (a.kind === "death" && a.by != null && a.by !== a.c) || a.kind === "turned" ? "cost" : "world";
  return `<div class="row ${t} mv-${moved}${a.kind === "death" || a.kind === "turned" || (a.kills && a.kills.length) ? " big" : ""}${a.quiet ? " quiet" : ""}${opts.now ? " now" : ""}" data-c="${a.c}" data-k="${opts.k ?? ""}" data-j="${opts.j ?? ""}"><span class="rw">${esc(label)}</span><span class="ra">${face(A, t === "harm" ? "angry" : t === "help" ? "glad" : a.kind === "death" ? "dead" : a.kind === "sick" ? "sick" : "calm", 30)}<b>${esc(short(A.name))}${a.kind === "choice" ? ":" : ""}</b></span>${middle}${back}${prose ? `<span class="rx">?</span><div class="rp">${prose}</div>` : ""}</div>`;
}

/** The world as a ring of faces with the ties between them (SVG). frame: {flags, conscience, ties, partner, at}; people: citizens (with id, name, role, age). */
export function graphSvg(people, frame, opts = {}) {
  const S = opts.size || 460, cx = S / 2, cy = S / 2 + 6, R = S / 2 - 58, n = people.length;
  const pos = people.map((p, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
  const gone = (i) => !frame || frame.at[i] == null;
  const ties = []; const seen = new Set();
  if (frame && frame.ties) people.forEach((p, i) => { for (const [to, v] of Object.entries(frame.ties[i] || {})) { const j = people.findIndex((q) => q.id === to); if (j < 0) continue; const key = i < j ? `${i}-${j}` : `${j}-${i}`; const married = frame.partner && (frame.partner[i] === to); const strength = Math.max(Math.abs(v), seen.has(key) ? 0 : 0); if (seen.has(key)) { const t = ties.find((t) => t.key === key); if (t) { t.v = (t.v + v) / 2; t.married = t.married || married; } continue; } seen.add(key); ties.push({ key, i, j, v, married }); } });
  // the line between two people carries what they have done to each other: width by how much, colour by the balance of it; harm outweighs kindness
  const hist = opts.history || []; const byPair = {};
  for (const h of hist) { const key = h.i < h.j ? `${h.i}-${h.j}` : `${h.j}-${h.i}`; (byPair[key] = byPair[key] || { i: Math.min(h.i, h.j), j: Math.max(h.i, h.j), n: 0, net: 0, hs: [] }); byPair[key].n++; byPair[key].net += h.harm ? -1.5 : 1; byPair[key].hs.push(h); }
  for (const t of ties) { const h = byPair[t.key]; if (!h) byPair[t.key] = { i: t.i, j: t.j, n: 0, net: 0, hs: [], tie: t }; else h.tie = t; }
  const lines = Object.values(byPair).filter((h) => h.n || (h.tie && (h.tie.married || Math.abs(h.tie.v) >= 0.3))).map((h) => { const a = pos[h.i], b = pos[h.j]; const dead = gone(h.i) || gone(h.j); const married = h.tie && h.tie.married;
    const net = h.n ? h.net : (h.tie ? h.tie.v : 0); const col = married && !h.n ? "#c8a415" : net > 0 ? "#3e7a2a" : net < 0 ? "#a23b2a" : "#8a8272"; const w = h.n ? 1.5 + Math.sqrt(h.n) * 2.2 * (net < 0 ? 1.3 : 1) : married ? 3 : 1 + Math.min(1, Math.abs(h.tie.v)) * 2;
    const title = h.hs.slice(-6).map((x) => x.text).join("\n");
    return `<line class="tie" data-key="${h.i}-${h.j}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="${w.toFixed(1)}" opacity="${dead ? 0.15 : h.n ? 0.8 : 0.4}"${!h.n && h.tie && !married && h.tie.v < 0 ? ' stroke-dasharray="6 4"' : ""}>${title ? `<title>${esc(title)}</title>` : ""}</line>${married ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c8a415" stroke-width="1.2" opacity="${dead ? 0.2 : 0.9}" stroke-dasharray="2 6"/>` : ""}`; }).join("");
  const ticks = "";
  const nodes = people.map((p, i) => { const f = frame ? (frame.flags?.[i] ?? 0) : 0; const c = frame ? (frame.conscience?.[i] ?? 0) : 0; const g = gone(i); const dead = g && !p.left; const mood = g ? "dead" : c <= TURNED ? "angry" : moodOf(f, true, false);
    const badge = g ? (dead ? "✝" : "→") : f & 128 ? "☠" : f & 1 ? "🍞" : f & 2 ? "🤒" : f & 4 ? "🏚" : "";
    const ring = g ? "#7a7a7a" : cColor(c);
    return `<g class="node${g ? " gone" : ""}${c <= TURNED && !g ? " turned" : ""}" data-i="${i}" transform="translate(${pos[i].x},${pos[i].y})"><circle r="31" fill="var(--paper,#fff)" stroke="${ring}" stroke-width="${c <= TURNED ? 4 : 3}"/><g transform="translate(-26,-26)">${face(p, mood, 52)}</g>${badge ? `<text x="20" y="26" font-size="16" text-anchor="middle">${badge}</text>` : ""}<text y="47" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="Georgia,serif">${esc(short(p.name))}</text><text y="59" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6" font-family="system-ui,sans-serif">${esc(g ? (dead ? "dead" : "gone") : cLabel(c, (opts.tested || [])[i], (opts.prev || {})[i], (opts.lately || [])[i]))}</text></g>`; }).join("");
  return `<svg viewBox="0 0 ${S} ${S + 16}" width="100%" class="graph"><g class="ties">${lines}</g><g class="arc"></g><g class="nodes">${nodes}</g><g class="fx"></g></svg>`;
}
export const graphPos = (n, i, S = 460) => { const cx = S / 2, cy = S / 2 + 6, R = S / 2 - 58; const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; };

/** A share card for one life (SVG). fate: {name, role, lines[], end}. */
export function lifeCard(c, fate) {
  const f = face(c, fate.alive ? "calm" : "dead", 120).replace(/^<svg /, '<svg x="28" y="28" ');
  const lines = fate.lines.slice(-4).map((l, i) => `<text x="180" y="${104 + i * 24}" font-size="15" fill="#3a2f24" font-family="Georgia,serif">${esc(l.length > 58 ? l.slice(0, 57) + "…" : l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 260" width="640" height="260"><rect width="640" height="260" rx="18" fill="#f6efe0"/><rect x="8" y="8" width="624" height="244" rx="14" fill="none" stroke="#c9b48c" stroke-width="2"/>${f}<text x="180" y="52" font-size="26" font-weight="700" fill="#1d1b17" font-family="Georgia,serif">${esc(c.name)}</text><text x="180" y="76" font-size="14" fill="#6b665c" font-family="system-ui,sans-serif">${esc(c.role)} · ${esc(fate.town)}</text>${lines}<text x="180" y="230" font-size="16" font-weight="700" fill="${fate.alive ? "#3e7a2a" : "#8a2f1e"}" font-family="system-ui,sans-serif">${esc(fate.end)}</text></svg>`;
}

// ---------- the glyph language: one picture per kind of moment, so a life can be read without a sentence ----------
const G = {
  bread: "M8 20 q-6 0 -6 -5 q0 -5 6 -5 h16 q6 0 6 5 q0 5 -6 5z M6 13 q4 -6 10 -6 q6 0 10 6",
  dagger: "M16 4 l3 3 -6 14 -3 -3z M9 20 l-4 4 M13 15 l4 4 M10 12 l6 6",
  ring: "M16 20 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M16 13 l-3 -5 h6z",
  cross: "M16 6 v22 M9 13 h14",
  hand: "M9 26 v-9 q0 -3 3 -3 v-6 q0 -2 2 -2 q2 0 2 2 v5 h1 v-8 q0 -2 2 -2 q2 0 2 2 v8 h1 v-6 q0 -2 2 -2 q2 0 2 2 v14 q0 5 -5 5 h-7 q-5 0 -5 -5z",
  house: "M6 26 v-11 l10 -9 10 9 v11z M13 26 v-8 h6 v8 M6 26 l20 -20",
  scales: "M16 6 v20 M8 26 h16 M6 12 h20 M8 12 l-4 8 h8z M24 12 l-4 8 h8z",
  coin: "M16 16 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M16 11 v10 M13 13 h6 M13 19 h6",
  fist: "M9 24 v-8 q0 -4 4 -4 h10 q3 0 3 3 v6 q0 4 -4 4 h-9 q-4 0 -4 -1z M13 12 v-4 h4 v4 M18 12 v-3 h4 v3",
  door: "M8 26 v-20 h12 v20 M20 16 h8 M25 13 l3 3 -3 3",
  baby: "M16 12 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M9 27 q0 -8 7 -8 q7 0 7 8",
  drop: "M16 5 q8 10 8 15 a8 8 0 0 1 -16 0 q0 -5 8 -15z",
  flame: "M16 5 q6 7 3 12 q4 -2 4 2 a7 7 0 0 1 -14 0 q0 -5 4 -8 q-1 4 3 4 q1 -6 0 -10z",
  snow: "M16 4 v24 M6 10 l20 12 M6 22 l20 -12 M12 6 l4 4 4 -4 M12 26 l4 -4 4 4",
  wheat: "M16 28 v-16 M16 12 q-6 -2 -6 -8 q6 0 6 8 M16 12 q6 -2 6 -8 q-6 0 -6 8 M16 18 q-6 -2 -6 -8 q6 0 6 8 M16 18 q6 -2 6 -8 q-6 0 -6 8",
  sword: "M6 26 l16 -16 M20 6 l6 6 -4 4 -6 -6z M9 23 l-3 3",
  skull: "M16 5 a8 8 0 0 1 8 8 v4 h-3 v4 h-10 v-4 h-3 v-4 a8 8 0 0 1 8 -8z M13 14 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M19 14 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M14 21 v4 M18 21 v4",
  eye: "M4 16 q12 -12 24 0 q-12 12 -24 0z M16 16 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
  walk: "M14 6 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M14 9 v8 l-4 9 M14 17 l5 4 v6 M14 11 l6 3 M14 13 l-5 4",
  dot: "M16 16 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
};
export const glyphNames = Object.keys(G);
/** one glyph: name, colour, size */
export function glyph(name, col = "currentColor", size = 20, extra = "") { const d = G[name] || G.dot; return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="g g-${name}" ${extra}><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`; }
/** the glyph for a moment */
export function glyphOf(a) {
  if (a.kind === "death") return "cross"; if (a.kind === "marry") return "ring"; if (a.kind === "birth") return "baby"; if (a.kind === "leave") return "walk"; if (a.kind === "homeless") return "house"; if (a.kind === "sick") return "drop"; if (a.kind === "turned") return "skull";
  if (a.kills && a.kills.length) return "cross";
  switch (a.kind) { case "theft": return "coin"; case "violence": return "fist"; case "betrayal": return "dagger"; case "abandonment": return "door"; case "lie": return "eye"; case "help": return "hand"; case "gift": return "bread"; case "rescue": return "hand"; case "sacrifice": return "bread"; case "mercy": return "hand"; case "justice": return "scales"; case "loyalty": return "hand"; case "work": return "coin"; case "housed": return "house"; case "well": return "drop"; }
  return "dot";
}
export const epochGlyph = (kind) => ({ famine: "wheat", winter: "snow", plague: "skull", boom: "coin", war: "sword", fire: "flame", flood: "drop" })[kind] || "dot";
/** the colour of a moment in the room: red for harm, ink for kindness, gold for a wedding or a child, dim for the rest */
export const glyphColor = (a) => a.kind === "death" || (a.kills && a.kills.length) ? "#e8e6df" : a.kind === "marry" || a.kind === "birth" ? "#ffd27a" : a.kind === "turned" ? "#ff3b30" : isDeed(a) ? (STEP(a.harm, a.help) < 0 ? "#ff3b30" : "#9fd67a") : "#8a919c";

/** a life as a strip of tiles: one per season lived; the tile's colour is the state they were in, the glyph what they did that counted. Reads without a word. */
export function strip(acts, frames, i, ticks, upto, opts = {}) {
  const size = opts.size || 22, gap = 3; const per = opts.perRow || 20; const tiles = [];
  const lastK = upto ? upto.k : ticks - 1; let dead = false;
  for (let k = 0; k <= lastK && k < ticks; k++) {
    if (dead) break;
    const f = frames[k]; const fl = f && f.flags ? (f.flags[i] || 0) : 0; const gone = f && f.at && f.at[i] == null;
    const as = (acts[k] || []).filter((a, j) => a.c === i && (!upto || k < upto.k || j <= upto.j));
    const big = as.filter((a) => a.kind === "death" || a.kind === "turned" || a.kind === "marry" || a.kind === "birth" || a.kind === "leave" || a.kind === "homeless" || a.kind === "sick" || (isDeed(a) && Math.abs(STEP(a.harm, a.help)) >= 0.08)).sort((a, b) => (a.kind === "death" ? 2 : isDeed(a) ? Math.abs(STEP(a.harm, a.help)) : 0.5) - (b.kind === "death" ? 2 : isDeed(b) ? Math.abs(STEP(b.harm, b.help)) : 0.5)).pop();
    const died = as.find((a) => a.kind === "death"); if (died) dead = true;
    const bg = died ? "#0b0d10" : fl & 128 ? "#5a1a14" : fl & 1 ? "#5a3f14" : fl & 2 ? "#3a2a5a" : fl & 4 ? "#3a3f46" : "#1d2229";
    const state = [fl & 128 ? "dying" : "", fl & 1 ? "starving" : "", fl & 2 ? "sick" : "", fl & 4 ? "no roof" : ""].filter(Boolean).join(", ") || (died ? "" : "getting by");
    const did = big ? (big.kind === "death" ? `died${big.text.replace(/^dies/, "")}` : big.kind === "turned" ? "turned" : big.kind === "marry" ? `married ${opts.people && big.target != null ? short(opts.people[big.target].name) : ""}` : big.kind === "birth" ? "a child was born" : big.kind === "leave" ? "left for good" : big.kind === "homeless" ? "lost the roof" : big.kind === "sick" ? "fell sick" : `${verbOf(big, opts.people || [])}${opts.people && big.target != null && big.target !== big.c ? " " + short(opts.people[big.target].name) : ""}`) : "";
    const tip = `${opts.labels ? opts.labels[k] : "season " + (k + 1)}|${state}|${did}${big && big.thought ? `|“${big.thought}”` : ""}`;
    tiles.push(`<span class="tile${died ? " dead" : ""}" style="background:${bg}" data-tip="${esc(tip)}">${big ? glyph(glyphOf(big), glyphColor(big), size - 6) : ""}</span>`);
  }
  return `<div class="strip" style="--tile:${size}px">${tiles.join("")}</div>`;
}
/** the pressures over the years, as a row of glyphs above a strip */
export function pressures(events, ticks, upto, opts = {}) { const lastK = upto ? upto.k : ticks - 1; const cells = []; for (let k = 0; k <= lastK && k < ticks; k++) { const e = events.find((e) => e.seasons && k + 1 >= e.at && k + 1 < e.at + e.seasons); cells.push(`<span class="tile p"${e ? ` data-tip="${esc(e.headline)}"` : ""}>${e ? glyph(epochGlyph(e.kind), "#5d6570", (opts.size || 22) - 8) : ""}</span>`); } return `<div class="strip pres" style="--tile:${opts.size || 22}px">${cells.join("")}</div>`; }
/** the dial: good ↔ evil, as a half-gauge */
export function dial(c, size = 120) { const r = size / 2 - 6; const cx = size / 2, cy = size / 2 + 4; const deg = -90 + (c + 1) / 2 * 180; const col = c <= TURNED ? "#ff3b30" : c < 0 ? "#b0524a" : "#e8e6df"; return `<svg viewBox="0 0 ${size} ${size / 2 + 16}" width="${size}" height="${size / 2 + 16}" class="dial" data-tip="The dial|good ↔ evil|Kindness moves the needle right, harm moves it left; past the red arc they have turned."><path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#262c35" stroke-width="6"/><path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r}" fill="none" stroke="#8a1f14" stroke-width="6" opacity=".6"/><text x="${cx - r}" y="${cy + 12}" font-size="8" fill="#8a1f14" font-family="DotGothic16,monospace" letter-spacing="1.5" text-anchor="start">TURNED</text><text x="${cx + r}" y="${cy + 12}" font-size="8" fill="#5d6570" font-family="DotGothic16,monospace" letter-spacing="1.5" text-anchor="end">KIND</text><g class="needle" style="transform-origin:${cx}px ${cy}px;transform:rotate(${deg.toFixed(1)}deg)"><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r}" stroke="${col}" stroke-width="3" stroke-linecap="round"/></g><circle cx="${cx}" cy="${cy}" r="4" fill="${col}"/></svg>`; }

// ---------- portraits: a half-lit bust, drawn from the person's id. Monochrome by design; the room adds the grain. ----------
export function portrait(c, mood = "calm", size = 180) {
  const h = hash(c.id + ":p"); const pick = (n, k) => (h >> k) % n; const uid = `${h % 997}-${(portrait.n = (portrait.n || 0) + 1)}`; // ids unique per rendered face: two faces of one person on a page must not share a clip path
  const r = role(c.startRole ?? c.role); /* the face is the person's: the work they started with, never a job they drifted into */ const old = (c.age || 30) >= 55; const young = (c.age || 30) < 26;
  const dead = mood === "dead" || mood === "gone", sick = mood === "sick", angry = mood === "angry", hungry = mood === "hungry", glad = mood === "glad";
  const lit = "#cdc8bc", mid = "#8d8981", dark = "#33373e", ink = "#0b0d10"; const hatCol = "#7a7e86", cloth = "#5a5f68"; const skin = sick ? "#a8ad9c" : dead ? "#8a8781" : lit;
  const jaw = 0.9 + pick(5, 3) * 0.04; const cheek = 1.02 + pick(4, 7) * 0.04; const eyeY = 88 + pick(5, 9); const eyeGap = 20 + pick(5, 11); const noseL = 18 + pick(6, 13); const mouthW = 16 + pick(6, 15); const browTilt = pick(3, 17) - 1;
  const hairline = 44 + pick(12, 19); const hairStyle = old && pick(3, 21) === 0 ? "bald" : ["cap", "side", "full", "cropped"][pick(4, 21)];
  const hairCol = old ? "#9a978f" : ["#141618", "#23201c", "#3a3129", "#5a4d3c"][pick(4, 23)];
  // head: an egg, wider at the brow, narrowing to the jaw
  const head = `M100 40 C ${100 + 44 * cheek} 40 ${100 + 46 * cheek} 96 ${100 + 40 * jaw} 128 C ${100 + 28 * jaw} 156 ${100 - 28 * jaw} 156 ${100 - 40 * jaw} 128 C ${100 - 46 * cheek} 96 ${100 - 44 * cheek} 40 100 40 Z`;
  const hair = hairStyle === "bald" ? "" : hairStyle === "cap" ? `<path d="M${100 - 46 * cheek} 78 C ${100 - 46 * cheek} ${hairline - 10} ${100 + 46 * cheek} ${hairline - 10} ${100 + 46 * cheek} 78 C ${100 + 30} ${hairline + 6} ${100 - 30} ${hairline + 6} ${100 - 46 * cheek} 78 Z" fill="${hairCol}"/>`
    : hairStyle === "side" ? `<path d="M${100 - 46 * cheek} 84 C ${100 - 44 * cheek} ${hairline - 14} ${100 + 50 * cheek} ${hairline - 16} ${100 + 46 * cheek} 74 C ${100 + 20} ${hairline - 2} ${100 - 10} ${hairline + 8} ${100 - 46 * cheek} 84 Z" fill="${hairCol}"/>`
    : hairStyle === "full" ? `<path d="M${100 - 50 * cheek} 110 C ${100 - 52 * cheek} ${hairline - 12} ${100 + 52 * cheek} ${hairline - 12} ${100 + 50 * cheek} 110 L ${100 + 42 * cheek} 96 C ${100 + 30} ${hairline + 4} ${100 - 30} ${hairline + 4} ${100 - 42 * cheek} 96 Z" fill="${hairCol}"/>`
    : `<path d="M${100 - 45 * cheek} 76 C ${100 - 44 * cheek} ${hairline} ${100 + 44 * cheek} ${hairline} ${100 + 45 * cheek} 76 C ${100 + 34} ${hairline + 10} ${100 - 34} ${hairline + 10} ${100 - 45 * cheek} 76 Z" fill="${hairCol}"/>`;
  const hat = r === "miner" ? `<path d="M${100 - 50 * cheek} 74 C ${100 - 48 * cheek} 34 ${100 + 48 * cheek} 34 ${100 + 50 * cheek} 74 L ${100 + 54 * cheek} 78 L ${100 - 54 * cheek} 78 Z" fill="${hatCol}"/><circle cx="100" cy="52" r="6" fill="#f4f1e8"/>`
    : r === "farmer" ? `<path d="M${100 - 62 * cheek} 76 L ${100 - 40 * cheek} 70 C ${100 - 36 * cheek} 36 ${100 + 36 * cheek} 36 ${100 + 40 * cheek} 70 L ${100 + 62 * cheek} 76 Q 100 88 ${100 - 62 * cheek} 76 Z" fill="${hatCol}"/>`
    : r === "clerk" ? `<path d="M${100 - 46 * cheek} 70 C ${100 - 44 * cheek} 42 ${100 + 44 * cheek} 42 ${100 + 46 * cheek} 70 L ${100 + 50 * cheek} 74 L ${100 - 50 * cheek} 74 Z" fill="${hatCol}"/>`
    : r === "doctor" ? `<path d="M${100 - 40 * cheek} 62 h ${80 * cheek} v 12 h ${-80 * cheek} z" fill="#d8d5cc"/>` : "";
  const brow = (x, s) => `<path d="M${x - 11} ${eyeY - 12 + (angry ? s * 3 : -s * browTilt)} Q ${x} ${eyeY - 16 + (angry ? 2 : 0)} ${x + 11} ${eyeY - 12 + (angry ? -s * 3 : s * browTilt)}" stroke="${dark}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  const eye = (x) => dead ? `<path d="M${x - 6} ${eyeY - 5} l12 10 M${x + 6} ${eyeY - 5} l-12 10" stroke="${dark}" stroke-width="2.4" fill="none"/>` : `<path d="M${x - 9} ${eyeY} Q ${x} ${eyeY - 7 + (angry || hungry ? 2 : 0)} ${x + 9} ${eyeY} Q ${x} ${eyeY + 6} ${x - 9} ${eyeY} Z" fill="#f0ede6"/><circle cx="${x}" cy="${eyeY}" r="3.6" fill="${ink}"/><circle cx="${x + 1.4}" cy="${eyeY - 1.4}" r="1" fill="#fff"/>`;
  const nose = `<path d="M100 ${eyeY + 2} q -3 ${noseL * 0.6} -6 ${noseL} q 4 3 9 1" stroke="${mid}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const mouth = dead ? `<path d="M${100 - mouthW / 2} 134 h ${mouthW}" stroke="${dark}" stroke-width="2.4"/>` : glad ? `<path d="M${100 - mouthW / 2} 131 q ${mouthW / 2} 9 ${mouthW} 0" stroke="${dark}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` : angry || hungry || sick ? `<path d="M${100 - mouthW / 2} 136 q ${mouthW / 2} -6 ${mouthW} 0" stroke="${dark}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` : `<path d="M${100 - mouthW / 2} 133 q ${mouthW / 2} 2.5 ${mouthW} 0" stroke="${dark}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  const lines = old ? `<path d="M${100 - eyeGap - 6} ${eyeY + 12} q 6 4 12 0 M${100 + eyeGap - 6} ${eyeY + 12} q 6 4 12 0 M 78 120 q 4 8 10 12 M 122 120 q -4 8 -10 12" stroke="${mid}" stroke-width="1.6" fill="none" opacity=".8"/>` : "";
  const beard = r !== "doctor" && !young && pick(3, 25) === 0 && !short(c.name || "").match(/[ae]$/) ? `<path d="M${100 - 34 * jaw} 118 C ${100 - 30 * jaw} 158 ${100 + 30 * jaw} 158 ${100 + 34 * jaw} 118 C ${100 + 24} 142 ${100 - 24} 142 ${100 - 34 * jaw} 118 Z" fill="${hairCol}" opacity=".85"/>` : "";
  const collar = r === "shop" || r === "publican" ? `<path d="M40 200 L 70 166 L 100 178 L 130 166 L 160 200 Z" fill="#b9b5aa"/>` : r === "doctor" ? `<path d="M46 200 L 78 164 L 100 176 L 122 164 L 154 200 Z" fill="#d8d5cc"/>` : `<path d="M44 200 L 74 166 L 100 174 L 126 166 L 156 200 Z" fill="#575c65"/>`;
  const shoulders = `<path d="M4 200 C 16 168 60 158 100 158 C 140 158 184 168 196 200 Z" fill="${cloth}"/><path d="M4 200 C 16 168 60 158 100 158" fill="none" stroke="#9a9689" stroke-width="1.5" opacity=".6"/>`;
  const neck = `<path d="M84 140 L 84 170 Q 100 178 116 170 L 116 140 Z" fill="${skin}"/><path d="M100 140 L 116 140 L 116 170 Q 108 174 100 175 Z" fill="${ink}" opacity=".35"/>`;
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" class="face portrait" role="img" aria-label="${esc(c.name)}"><defs><radialGradient id="pl${uid}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#4a505b"/><stop offset=".7" stop-color="#1c2027"/><stop offset="1" stop-color="#0b0d10"/></radialGradient><linearGradient id="ps${uid}" x1="0" x2="1"><stop offset=".5" stop-color="${ink}" stop-opacity="0"/><stop offset=".68" stop-color="${ink}" stop-opacity=".42"/><stop offset="1" stop-color="${ink}" stop-opacity=".62"/></linearGradient><clipPath id="pc${uid}"><path d="${head}"/></clipPath></defs><rect width="200" height="200" fill="url(#pl${uid})"/>${shoulders}${neck}${collar}<path d="${head}" fill="${skin}"/><path d="${head}" fill="none" stroke="#9a9689" stroke-width="1.2" opacity=".5"/>${beard}${hair}${lines}${brow(100 - eyeGap, 1)}${brow(100 + eyeGap, -1)}${eye(100 - eyeGap)}${eye(100 + eyeGap)}${nose}${mouth}${hat}<rect width="200" height="200" fill="url(#ps${uid})" clip-path="url(#pc${uid})"/><rect x="100" y="160" width="100" height="40" fill="${ink}" opacity=".35"/></svg>`;
}

/** the record of one person: the worst and the best they have done, the last few deeds, and what the lane knows them as */
export function sheet(acts, i, upto, people, labels) {
  const deeds = []; for (let k = 0; k < acts.length; k++) { const as = acts[k] || []; for (let j = 0; j < as.length; j++) { if (upto && (k > upto.k || (k === upto.k && j > upto.j))) break; const a = as[j]; if (a.c === i && isDeed(a) && a.target != null && a.target !== a.c) deeds.push({ a, k, d: STEP(a.harm, a.help) }); } }
  const worst = deeds.filter((x) => x.d < 0).sort((p, q) => p.d - q.d)[0] || null, best = deeds.filter((x) => x.d > 0).sort((p, q) => q.d - p.d)[0] || null;
  const harm = deeds.filter((x) => x.d <= -0.15).length, help = deeds.filter((x) => x.d >= 0.15).length;
  const known = deeds.length === 0 ? "nothing known against them" : harm >= 3 && harm > help ? "known on the lane as a danger" : harm >= 1 && harm > help ? "known on the lane as a thief" : help >= 3 && help > harm ? "trusted on the lane" : help > harm ? "thought well of" : "a mixed name";
  const line = (x) => x ? `${verbOf(x.a, people)} ${short(people[x.a.target].name)}` : "";
  return { deeds, worst, best, known, recent: deeds.slice(-4).reverse(), line, label: (x) => labels[x.k] };
}

/** the words the room uses, explained where they appear */
/** who they are in three words: the temperament that stands out, from the traits the scenario gave them */
export function epithetOf(traits) { const t = traits || {}; if ((t.bold ?? 0.5) <= 0.2) return "the careful one"; const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0]; if (!top || top[1] < 0.7) return "the ordinary one"; return { loyal: "the loyal one", bold: "the bold one", sociable: "the one everyone likes", restless: "the restless one" }[top[0]] || "the ordinary one"; }
// ---------- why they chose it: the short reasoning behind a decision, from what the brain weighed and what was on them ----------
export const PULLWORD = { loyal: "loyalty", bold: "nerve", sociable: "wanting to be liked", restless: "restlessness", hunger: "hunger", poverty: "having nothing", danger: "fear", family: "the family", "the slope": "what they have already done", conscience: "conscience" };
const STATEWORD = { starving: "starving", "food short": "short of food", "no money": "nothing in the jar", sick: "sick", "no roof": "no roof", failing: "failing" };
/** {for, against, close, margin, state, condition, model} — for the mock, the weights it used; for a model, its own reasons */
export function reasons(a) {
  const out = { for: [], against: [], close: false, margin: null, state: [], condition: a && a.condition ? a.condition.label : null, model: null };
  if (!a) return out;
  if (Array.isArray(a.because) && a.because.length) { out.model = a.because.slice(0, 3); return out; } // a model gave its own
  const w = a.weighed || []; if (w.length) {
    const mine = w.find((x) => x.id === a.option); const rest = w.filter((x) => x.id !== a.option).sort((p, q) => q.score - p.score); const rival = rest[0];
    if (mine) out.for = (mine.pulls || []).filter((p) => p.v > 0).slice(0, 3).map((p) => PULLWORD[p.name] || p.name);
    if (rival) { out.against = (rival.pulls || []).filter((p) => p.v > 0).map((p) => PULLWORD[p.name] || p.name).filter((n) => !out.for.includes(n)).slice(0, 2); out.margin = Math.round((mine.score - rival.score) * 100) / 100; out.close = out.margin <= 0.08; }
  }
  const you = String(a.you || ""); for (const k of Object.keys(STATEWORD)) if (you.includes(k)) out.state.push(STATEWORD[k]);
  return out;
}
/** a change to someone's state, in words: what it actually cost them or gave them */
export function deltaWords(d) {
  if (!d) return [];
  const out = [];
  const num = (k, v, up, down) => { const n = Math.round(v * 100); if (!n) return; out.push(`${n > 0 ? up : down} ${Math.abs(n)}`); };
  for (const [k, v] of Object.entries(d)) {
    if (v == null) continue;
    if (k === "food") num(k, v, "food +", "food −");
    else if (k === "money") num(k, v, "money +", "money −");
    else if (k === "health") num(k, v, "health +", "health −");
    else if (k === "mood") num(k, v, "heart +", "heart −");
    else if (k === "tie") out.push(v > 0 ? "closer to them" : "colder towards them");
    else if (k === "children") out.push(v > 0 ? "a child" : "a child lost");
    else if (k === "home") out.push(v ? "a roof" : "no roof");
    else if (k === "job") out.push(v ? "work" : "no work");
    else if (k === "sick") out.push(v ? "taken ill" : "well again");
    else if (k === "partner") out.push("married");
  }
  return out;
}
/** what a choice actually did to the other person, in words — not a verdict, a consequence */
export function costLine(a, people) {
  if (!a) return "";
  const who = a.target != null && a.target !== a.c && people?.[a.target] ? String(people[a.target].name).split(" ")[0] : null;
  const harm = a.harm ?? 0, help = a.help ?? 0;
  if ((a.kills || []).length && a.kills[0] !== a.c) return who ? `${who} does not survive it` : "somebody does not survive it";
  if (harm >= 0.5) return who ? `it falls hard on ${who}` : "it falls hard on somebody";
  if (harm >= 0.2) return who ? `${who} bears it` : "somebody bears it";
  if (harm >= 0.05) return who ? `a little of it lands on ${who}` : "a little of it lands on somebody";
  if (help >= 0.4) return who ? `${who} is much better for it` : "somebody is much better for it";
  if (help >= 0.1) return who ? `${who} is better for it` : "somebody is better for it";
  const opts = a.options || []; const worst = opts.length ? Math.max(...opts.map((o) => o.harm || 0)) : 0;
  if (worst >= 0.1 && who) return `${who} is no worse for it`;
  return "nobody else is touched";
}
/** the same, as one sentence */
export function whyLine(a, name = "They", o = {}) {
  const r = reasons(a);
  // When the person's own line is already on the page, restating it in worse prose adds nothing — it was doing that
  // under every entry of every log, which is most of what made the wall feel machine-made.
  if (r.model) return o.quoted ? "" : `${name} gave the reason: ${r.model.join("; ")}.`;
  if (!r.for.length && !r.state.length) return "";
  const head = r.state.length ? `${name} was ${r.state.join(", ")}. ` : "";
  const mid = r.for.length ? `What weighed for it: ${r.for.join(", ")}${r.condition ? ` (${r.condition})` : ""}` : r.condition ? `The condition: ${r.condition}` : "";
  const tail = r.against.length ? `; against it, ${r.against.join(" and ")}` : "";
  return `${head}${mid}${tail}${r.close ? " — it was close" : ""}.`;
}
export const GLOSS = {
  turned: "Turned|the harm behind them outweighs the kindness|What they have done to others now outweighs what they have given, weighted to the recent — and from here the next harm comes easier than the last.",
  "going dark": "Going dark|conscience below zero|More harm than kindness lately. Not yet turned; a few more will do it.",
  mixed: "Mixed|conscience near zero|Kindness and harm in about equal measure, or a few small things either way.",
  "no choices yet": "No choices yet|nothing asked of them yet|They have not yet done anything to anyone that counted. The hard years will change that.",
  kind: "Kind|more given than taken, so far|It can be spent: one killing outweighs many kindnesses.",
  "kind, lately cruel": "Kind, lately cruel|a good record, a bad last deed|Years of kindness, then something recent that went the other way.",
  "dark, lately kind": "Dark, lately kind|a bad record, a good last deed|A hard record, and one recent kindness.",
  dying: "Dying|health below a quarter|Without food or care they will not see the next season.",
  starving: "Starving|no food|Hunger pulls every choice toward taking.",
  sick: "Sick|the sickness|It wears them down each season until it is nursed, paid off, or rested out.",
  "no roof": "No roof|homeless|A winter outside can kill.",
};
export const gloss = (word) => { const w = String(word).toLowerCase().trim(); const g = GLOSS[w] || Object.entries(GLOSS).find(([k]) => w.includes(k))?.[1]; return g ? ` data-tip="${esc(g)}"` : ""; };

/** what the chosen road was, for colour: a harm done (red), a kindness (green), or a harm left alone (yellow) */
export function choiceTone(a) {
  const ch = (a.options || []).find((o) => o.id === a.option);
  if ((a.kills || []).some((x) => x !== a.c)) return "kill";
  if (ch) return (ch.harm || 0) >= 0.1 ? "harm" : (ch.help || 0) >= 0.2 ? "help" : "neutral";
  return (a.harm || 0) >= 0.1 ? "harm" : (a.help || 0) >= 0.2 ? "help" : "neutral";
}

// ---------- why they chose it: the psychology, from the record ----------
// Every principle here is named only when the record holds the evidence for it: who was watching, what the other
// person had done to them before, what state they were in, which experiment it was, the reasons the model gave in its
// own words. Each comes with the study it is from and one line saying how it applied, so it is an explanation a reader
// can check against the moment, not a label stuck on it.
const EXP = {
  milgram: (a, t) => a.condition?.id === "far"
    ? { name: "Authority at a distance", cite: "Milgram, 1974", how: `The clerk had left the book and gone. In Milgram's variations, obedience fell sharply when the authority left the room.` }
    : { name: "The agentic state", cite: "Milgram, 1974", how: `The clerk stood over them: "it isn't your decision." Handing the responsibility to someone with standing is what makes people sign.` },
  asch: (a) => ({ name: "Normative social influence", cite: "Asch, 1951; Deutsch & Gerard, 1955", how: `Four people had already said it. ${a.condition?.id === "private" ? "This time on a slate nobody would see — in private, people conform far less." : "Saying otherwise meant standing alone in front of everyone."}` }),
  bystander: (a) => ({ name: "Diffusion of responsibility", cite: "Darley & Latané, 1968", how: a.condition?.id === "crowd" ? `Others were standing about. Each onlooker feels less of the duty to act when it could be anyone's.` : `Nobody else was there. Alone, the duty to act has nowhere else to go.` }),
  trolley: (a, t, tn) => a.option === "sluice"
    ? { name: "Utilitarian arithmetic", cite: "Foot, 1967; Greene et al., 2001", how: `One against three. About nine in ten people say they would turn it — the sum wins when you do not have to push anyone.` }
    : { name: "Omission bias", cite: "Spranca, Minsk & Baron, 1991", how: `Leaving it meant the water chose, not them. People judge a harm they allow as lighter than one they cause.` },
  samaritan: (a) => ({ name: "Hurry", cite: "Darley & Batson, 1973", how: a.condition?.id === "late" ? `The shift bell had gone. In the study, people in a hurry stopped a sixth as often.` : `Nothing pressed them. With time in hand, most people stop.` }),
  dictator: () => ({ name: "Inequity aversion", cite: "Fehr & Schmidt, 1999", how: `Nothing forced a share. What people give then is what they feel is fair — or what they think will be seen.` }),
  ultimatum: () => ({ name: "Fairness under threat of refusal", cite: "Güth et al., 1982", how: `A low offer could be refused and leave both with nothing. Most people offer close to half.` }),
  prisoners: (a) => ({ name: "Cooperation under uncertainty", cite: "Axelrod, 1984", how: `Neither could know what the other would say. ${a.condition?.id === "friend" ? "With a friend, trust makes silence easier." : "With someone barely known, there was little to trust."}` }),
  trust: () => ({ name: "Betrayal aversion", cite: "Bohnet & Zeckhauser, 2004", how: `Nothing held the other to it. People fear being cheated more than they fear the same loss by chance.` }),
  thirdparty: () => ({ name: "Third-party punishment", cite: "Fehr & Fischbacher, 2004", how: `The wrong was done to somebody else. People will pay to see it answered — or decide it is not theirs to answer.` }),
  reciprocity: (a) => ({ name: "Upstream reciprocity", cite: "Nowak & Roch, 2007", how: a.condition?.id === "helped" ? `Someone had helped them when they had nothing. Kindness received is often passed on to a stranger.` : `Nobody had helped them lately. The door is harder to open without a debt to pass on.` }),
  robbers: () => ({ name: "Realistic conflict", cite: "Sherif, 1961", how: `One water supply, two sides. Competing for the same thing is enough to make a side.` }),
  marshmallow: () => ({ name: "Scarcity and the present", cite: "Mullainathan & Shafir, 2013", how: `Rent due and thin children. Scarcity pulls the mind to now and makes later look small.` }),
};
/** up to three principles that plausibly led to this choice, each grounded in something the record shows */
export function psychOf(a, k, acts, people) {
  if (!a || !a.options || a.options.length < 2) return [];
  const out = []; const A = a.c, T = a.target != null && a.target !== A ? a.target : null;
  const nA = short(people[A].name), nT = T != null ? short(people[T].name) : "";
  const t = choiceTone(a); const kind = t === "help" || t === "neutral";
  const about = (x) => String(x.about || "").toLowerCase();
  const exp = a.experiment && EXP[a.experiment.id]; if (exp) out.push(exp(a, t, nT));
  // what the other person had done to them before this — the latest of it counts, a wrong forgiven after a kindness is forgiveness
  const own = (a.because || []).join(" ").toLowerCase();
  if (T != null) {
    let gave = null, took = null;
    for (let kk = 0; kk <= k; kk++) for (const b of acts[kk] || []) { if (b === a) break; if (b.c === T && b.target === A) { if ((b.help || 0) > 0) gave = { b, kk }; if ((b.harm || 0) > 0) took = { b, kk }; } }
    const when = (x) => `year ${Math.floor(x.kk / 4) + 1}`;
    const latest = gave && took ? (took.kk >= gave.kk ? "took" : "gave") : gave ? "gave" : took ? "took" : null;
    if (t === "harm" || t === "kill") { if (took) out.push({ name: "Negative reciprocity", cite: "Fehr & Gächter, 2000", how: `${nT} ${took.b.text} in ${when(took)}. People return harm for harm, even at a cost to themselves.` }); }
    else if (latest === "took") out.push({ name: "Forgiveness", cite: "McCullough, 2000", how: `${nT} ${took.b.text} in ${when(took)}, and ${nA} let it go. Forgiving is likelier when the relationship is worth more than the score.` });
    else if (latest === "gave") out.push({ name: "Reciprocity", cite: "Gouldner, 1960", how: `${nT} ${gave.b.text} in ${when(gave)}. A kindness received creates a felt debt, and people pay it back.` });
  }
  // who was watching: said in their own reasons, or plain from the place
  if (out.length < 3 && (t === "harm" || t === "kill") && (a.seen === 0 || /nobody|no one|alone|won't know|never know/.test(own))) out.push({ name: "Anonymity", cite: "Zimbardo, 1969", how: `${a.seen === 0 ? "Nobody else was there" : "They counted on nobody knowing"}. Without witnesses, the cost to your name disappears.` });
  else if (out.length < 3 && kind && a.seen >= 2 && /town|lane|remember|thinks well|seen|watch/.test(about(a) + " " + own)) out.push({ name: "Reputation", cite: "Nowak & Sigmund, 2005", how: `${a.seen} others were there, and the town remembers. Being seen makes kindness pay.` });
  // who they are to each other
  const ab = about(a);
  if (T != null && out.length < 3 && /married|close|a friend/.test(ab) && kind) out.push({ name: "Communal relationship", cite: "Clark & Mills, 1979", how: `${nT} is ${/married/.test(ab) ? "family" : "a friend"}. Between friends people stop keeping accounts and give by need.` });
  if (T != null && out.length < 3 && /grudge|stranger/.test(ab) && (t === "harm" || t === "kill")) out.push({ name: "Out-group indifference", cite: "Tajfel, 1971", how: `${nT} was ${/grudge/.test(ab) ? "an old grudge" : "a stranger"} to them. Harm comes easier to someone outside your circle.` });
  // their state, when the choice was a guarding one
  const you = String(a.you || "").toLowerCase();
  const guarding = t === "harm" || /keep|own|nothing|go home|walk|pass/.test(String(a.choice || "").toLowerCase());
  if (out.length < 3 && guarding && /failing|starving|food short|no money|no roof/.test(you)) out.push({ name: "Scarcity", cite: "Mullainathan & Shafir, 2013", how: `They were ${you.match(/failing|starving|food short|no money|no roof/)[0]}. Scarcity narrows attention to the need in front of you.` });
  if (out.length < 3 && /children|child|little ones|family|kids/.test(own + " " + String(a.thought || "").toLowerCase()) && !(exp && a.experiment.id === "trolley")) out.push({ name: "Kin first", cite: "Hamilton, 1964", how: `${/\d children/.test(you) ? you.match(/\d children/)[0].replace(/^./, (x) => x.toUpperCase()) + " at home" : "Their family"}, and they said so. Protecting kin is among the oldest pulls there is.` });
  // what they had already done
  let harms = 0; for (let kk = 0; kk < k; kk++) for (const b of acts[kk] || []) if (b.c === A && (b.harm || 0) >= 0.2) harms++;
  if (out.length < 3 && (t === "harm" || t === "kill") && harms >= 2) out.push({ name: "Moral disengagement", cite: "Bandura, 1999", how: `${harms} harms before this one. Each makes the next easier to explain away.` });
  if (out.length < 3 && kind && /\bowe\b|\bdebt\b|repay/.test(own) && !out.some((x) => x.name === "Reciprocity")) out.push({ name: "Reciprocity", cite: "Gouldner, 1960", how: `"${(a.because || []).find((x) => /\bowe\b|\bdebt\b|repay/i.test(x))}", in their own words. A felt obligation to repay is one of the few norms found in every culture.` });
  if (out.length < 3 && /fair|half/.test(own) && !out.some((x) => /fair|Inequity/i.test(x.name))) out.push({ name: "Inequity aversion", cite: "Fehr & Schmidt, 1999", how: `Fairness was the word they reached for. People give up gain to avoid an unequal split.` });
  return out.slice(0, 3);
}
/** the card: their own reasons, then the principles */
export function psychCard(a, k, acts, people) {
  const ps = psychOf(a, k, acts, people); const own = (a.because || []).slice(0, 3);
  if (!ps.length && !own.length) return "";
  return `<span class="psy" role="tooltip"><span class="psyh">What led to this</span>${own.length ? `<span class="psyo">In their words: ${own.map((x) => `<i>${esc(x)}</i>`).join(" · ")}</span>` : ""}${ps.map((p) => `<span class="psyp"><b>${esc(p.name)}</b> <em>${esc(p.cite)}</em><span>${esc(p.how)}</span></span>`).join("")}</span>`;
}
