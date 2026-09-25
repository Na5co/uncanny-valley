// Reading the record as a series: a run is a series, a season is an episode, a decision is a scene. Everything a page
// shows is worked out here from the acts and frames the server sends — who did what to whom, what it cost, what came of it.
import { short, choiceTone, psychOf, epithetOf } from "./draw.mjs";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
export const words = (n) => WORDS[n] ?? String(n);
export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const plural = (n, one, many = one + "s") => `${words(n)} ${n === 1 ? one : many}`;
const QUIETK = new Set(["work", "sick", "well", "housed"]);

export function reader(L) {
  const P = L.people; const byId = Object.fromEntries(P.map((p, i) => [p.id, i]));
  const FOUR = P.map((_, i) => i).filter((i) => P[i].named);
  const named = (i) => i != null && !!P[i]?.named;
  const nm = (i) => short(P[i].name);
  const yearOf = (k) => Math.floor(k / 4) + 1;
  const seasonOf = (k) => ["spring", "summer", "autumn", "winter"][k % 4];
  const labelOf = (k) => L.tickLabels?.[k] ?? `Year ${yearOf(k)}, ${seasonOf(k)}`;
  const acts = (k) => L.acts[k] || [];
  const shown = (k, j, u) => !u || k < u.k || (k === u.k && j <= u.j);

  const isQuiet = (a) => !!a.quiet || QUIETK.has(a.kind) || (a.kind === "choice" && !a.dilemma);
  const tgt = (a) => a.kind === "death" ? (a.by != null && a.by !== a.c ? a.by : null) : a.target != null && a.target !== a.c ? a.target : null;
  const killsOf = (a) => (a.kills || []).filter((x) => x !== a.c);
  const toneOf = (a) => a.kind === "death" ? "death" : a.kind === "marry" || a.kind === "birth" ? "gold" : a.kind === "turned" ? "harm" : a.kind === "leave" ? "neutral" : choiceTone(a);
  /** a death caused in the same season belongs to the act that caused it */
  function causeOf(k, j) { const as = acts(k); const d = as[j]; for (let x = j - 1; x >= 0; x--) { const b = as[x]; if (killsOf(b).includes(d.c)) return x; if (b.c === d.c && (b.kind === "sacrifice" || (b.impact?.self?.health ?? 0) <= -1)) return x; } return null; }
  const deathAfter = (k, j, i) => acts(k).find((b, x) => x > j && b.kind === "death" && b.c === i && causeOf(k, x) === j) || null;
  function weight(a) {
    const t = toneOf(a); let w = 0;
    if (killsOf(a).length) w = 10; else if (a.kind === "sacrifice") w = 9; else if (a.kind === "turned") w = 8.5; else if (a.kind === "death") w = 8;
    else if (t === "harm") w = 5 + (a.harm || 0) * 3; else if (a.kind === "marry") w = 5; else if (t === "help") w = 3 + (a.help || 0) * 3;
    else if (a.kind === "birth" || a.kind === "leave") w = 3; else if (a.dilemma) w = 1.5;
    return w + (named(a.c) ? 2 : 0) + (named(tgt(a)) ? 1 : 0);
  }
  /** "Keep your savings" said of them: "keep their savings" */
  function chose(a) { let s = String(a.choice || a.text || "").replace(/[.!]+$/, ""); s = s.charAt(0).toLowerCase() + s.slice(1); const T = tgt(a); if (T != null) s = s.replace(/\b(them|they)\b/, nm(T)); return s.replace(/\byourself\b/g, "themselves").replace(/\byour\b/g, "their").replace(/\byou\b/g, "them"); }
  function rest(a) {
    switch (a.kind) {
      case "death": return a.by != null && a.by !== a.c ? `was killed by ${nm(a.by)}` : String(a.text || "died").replace(/^dies/, "died");
      case "marry": return `married ${a.target != null ? nm(a.target) : "someone"}`;
      case "birth": return "had a child";
      case "turned": return "turned";
      case "leave": return "left for good";
    }
    return a.kind === "choice" ? `chose to ${chose(a)}` : String(a.text || "");
  }
  // two "they"s in one clause blur who did what; a choice retold from "I" can leave "them can't": both put right here
  const said = (a) => `${nm(a.c)} ${rest(a)}`.replace(/though they had wronged them/, () => `though ${a.target != null ? nm(a.target) : "they"} had wronged ${nm(a.c)}`)
    .replace(/\bthem (can't|cannot|won't|will|are|were|have|had|can|could|would|should|do|did|don't|need|must)\b/g, "they $1");
  const involves = (a, i) => a.c === i || tgt(a) === i || killsOf(a).includes(i) || (a.kind === "marry" && a.target === i);
  const involvesFour = (a) => named(a.c) || named(tgt(a)) || killsOf(a).some(named);
  const epochAt = (k) => (L.events || []).find((e) => e.seasons && e.at - 1 <= k && k < e.at - 1 + e.seasons) || null;
  const chosen = (a) => (a.options || []).find((o) => o.id === a.option) || null;

  /** where the story has got to: live, a season's moments come out one by one across its real time */
  function upto(now) {
    if (L.final || L.ended) { const k = Math.min(L.tick || L.ticks, L.frames.length) - 1; return { k, j: acts(k).length - 1 }; }
    const t = L.tick; if (!t) return { k: -1, j: -1 };
    const n = acts(t - 1).length; let j = -1; for (let i = 0; i < n; i++) if (dueAt(t, i) <= now) j = i;
    return { k: t - 1, j };
  }
  const dueAt = (t, j) => { const n = acts(t - 1).length || 1; return L.seasonStartedAt + ((j + 0.5) / n) * L.seasonMs * 0.85; };
  const frameAt = (k) => L.frames[k] || L.frames[L.frames.length - 1] || null;

  function deathOf(i, u) { for (let k = 0; k <= u.k; k++) { const as = acts(k); for (let j = 0; j < as.length; j++) { if (!shown(k, j, u)) break; const a = as[j]; if (a.kind === "death" && a.c === i) { const x = causeOf(k, j); const by = x != null ? as[x].c : a.by; return { k, j, by: by != null && by !== i ? by : null, how: a.how ? String(a.how) : x != null && as[x].c === i ? String(as[x].text) : String(a.text || "").replace(/^dies/, "died"), last: a.last ? String(a.last) : "", cause: x != null ? as[x] : null, causeAt: x }; } } } return null; }
  function pushed(i, u) { let n = 0, spared = 0; for (let k = 0; k <= u.k; k++) acts(k).forEach((a, j) => { if (!shown(k, j, u) || a.c !== i || !a.dilemma || (a.options || []).length < 2) return; if (Math.max(...a.options.map((o) => o.harm || 0)) < 0.1 || a.options.every((o) => (o.harm || 0) >= 0.1)) return; const ch = chosen(a); if (!ch) return; n++; if ((ch.harm || 0) < 0.1) spared++; }); return { n, spared, hurt: n - spared }; }
  const stateOf = (c, tested) => !tested ? ["no choices yet", "neutral"] : c <= -0.5 ? ["turned", "harm"] : c < -0.15 ? ["hardening", "harm"] : c < 0.15 ? ["torn", "neutral"] : c < 0.5 ? ["mostly kind", "help"] : ["kind", "help"];
  const feel = (v) => v >= 0.6 ? "loves" : v >= 0.2 ? "likes" : v > -0.2 ? "barely knows" : v > -0.6 ? "resents" : "hates";

  function pairPast(k, j, A, T) { const out = []; for (let kk = 0; kk <= k; kk++) acts(kk).forEach((b, jj) => { if (kk === k && jj >= j) return; if (isQuiet(b) || !b.dilemma) return; if ((b.c === A && b.target === T) || (b.c === T && b.target === A)) out.push({ k: kk, j: jj, a: b, t: toneOf(b) }); }); return out; }
  function cameOf(k, j, a, u) { const A = a.c, T = tgt(a); if (T == null) return null; const pid = L.frames[k]?.partner?.[T]; const pT = pid != null ? byId[pid] : null;
    for (let kk = k; kk <= u.k; kk++) { const as = acts(kk); for (let jj = kk === k ? j + 1 : 0; jj < as.length; jj++) { if (!shown(kk, jj, u)) break; const b = as[jj]; if (isQuiet(b) || !b.dilemma) continue; if (b.target === A && (b.c === T || (pT != null && b.c === pT))) return { k: kk, j: jj, a: b, via: b.c !== T }; } } return null; }

  /** what a choice did to everyone else: each one a face and a line */
  function aftermath(k, j, a) {
    const out = []; const T = tgt(a); const tg = a.impact?.target || {}, sf = a.impact?.self || {}; const dead = new Set();
    for (const x of killsOf(a)) { dead.add(x); out.push({ i: x, t: "death", line: "dies" }); const d = acts(k).find((b) => b.kind === "death" && b.c === x);
      if (d?.target != null && d.target !== a.c && d.household) out.push({ i: d.target, t: "loss", line: "loses a partner" });
      if (d?.children) out.push({ i: null, t: "loss", line: `${cap(plural(d.children, "child", "children"))} ${d.children === 1 ? "loses" : "lose"} a parent` }); }
    if (deathAfter(k, j, a.c)) { dead.add(a.c); out.push({ i: a.c, t: "death", line: "does not come out" }); }
    if (T != null && !dead.has(T)) {
      if ((tg.health || 0) <= -0.3) out.push({ i: T, t: "harm", line: "badly hurt" }); else if ((tg.health || 0) < 0) out.push({ i: T, t: "harm", line: "hurt" });
      if ((tg.food || 0) > 0) out.push({ i: T, t: "help", line: "eats tonight" }); else if ((tg.food || 0) < 0) out.push({ i: T, t: "harm", line: "goes hungry" });
      if ((tg.money || 0) > 0) out.push({ i: T, t: "help", line: "is better off" }); else if ((tg.money || 0) < 0) out.push({ i: T, t: "harm", line: "is out of pocket" });
      const tie = tg.tie; if (tie) out.push({ i: T, t: tie > 0 ? "help" : "harm", line: tie >= 0.5 ? `will not forget it` : tie > 0 ? `warms to ${nm(a.c)}` : tie <= -0.5 ? `will never forgive ${nm(a.c)}` : `holds it against ${nm(a.c)}` });
    }
    if (!dead.has(a.c)) { if ((sf.health || 0) <= -0.15) out.push({ i: a.c, t: "harm", line: "is hurt too" }); if ((sf.mood || 0) <= -0.3) out.push({ i: a.c, t: "neutral", line: "carries it" }); else if ((sf.mood || 0) >= 0.3) out.push({ i: a.c, t: "help", line: "is lighter for it" }); if (sf.partner) out.push({ i: a.c, t: "gold", line: "will marry within the year" }); }
    if (a.dilemma && a.seen != null && ["harm", "kill", "help"].includes(toneOf(a))) out.push({ i: null, t: "seen", line: a.seen === 0 ? "Nobody saw it" : a.seen === 1 ? "One other person saw it" : `${cap(words(a.seen))} people saw it` });
    return out;
  }

  /** an episode: its scenes, what happened elsewhere, the evenings */
  function episode(k, u) {
    const items = []; acts(k).forEach((a, j) => { if (!shown(k, j, u)) return; if (a.kind === "death" && causeOf(k, j) != null) return; items.push({ k, j, a, w: weight(a), quiet: isQuiet(a) }); });
    const scenes = items.filter((x) => !x.quiet && involvesFour(x.a));
    const elsewhere = items.filter((x) => !x.quiet && !involvesFour(x.a));
    const evenings = items.filter((x) => x.quiet && named(x.a.c) && (x.a.evening || x.a.impact) && (x.a.outcome || x.a.text));
    const top = [...scenes].sort((x, y) => y.w - x.w)[0] || [...elsewhere].sort((x, y) => y.w - x.w)[0] || null; // the four first: an episode is named for them
    return { k, n: k + 1, scenes, elsewhere, evenings, top, title: titleOf(top, k), epoch: epochAt(k) };
  }
  function titleOf(top, k) {
    if (!top) { const e = epochAt(k); return e ? cap(e.kind) : "A season begins"; }
    const a = top.a;
    if (a.kind === "death") return `${nm(a.c)} dies`; if (a.kind === "marry") return "A wedding"; if (a.kind === "birth") return "A child"; if (a.kind === "turned") return `${nm(a.c)} turns`;
    const ch = chosen(a); return cap(String(ch?.label || a.choice || a.text || "").replace(/[.!]+$/, ""));
  }
  /** previously: the scenes before this episode that it grows out of — the same people, the heaviest, the most recent */
  function previously(k, u, cast, max = 4) {
    const pool = []; for (let kk = Math.max(0, k - 12); kk < k; kk++) acts(kk).forEach((a, j) => { if (!shown(kk, j, u) || isQuiet(a) || (a.kind === "death" && causeOf(kk, j) != null)) return; if (!involvesFour(a)) return; const rel = cast.has(a.c) || cast.has(tgt(a)) ? 3 : 0; pool.push({ k: kk, j, a, s: weight(a) + rel - (k - kk) * 0.35 }); });
    return pool.sort((x, y) => y.s - x.s).slice(0, max).sort((x, y) => x.k - y.k || x.j - y.j);
  }
  const why = (a, k) => psychOf(a, k, L.acts, P);

  return { P, byId, FOUR, named, nm, yearOf, seasonOf, labelOf, acts, shown, isQuiet, tgt, killsOf, toneOf, causeOf, deathAfter, weight, rest, said, involves, involvesFour, epochAt, chosen, upto, dueAt, frameAt, deathOf, pushed, stateOf, feel, pairPast, cameOf, aftermath, episode, previously, why, epithet: (i) => (P[i].trait?.name ? String(P[i].trait.name).toLowerCase() : epithetOf(P[i].traits)) };
}
