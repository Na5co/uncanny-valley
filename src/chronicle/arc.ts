// A person's run, read as an arc rather than a list.
//
// This is the thing that was wrong. Handing the chronicler every decision a person made, in order, got back every
// decision a person made, in order, with conjunctions — "they did this, and this, and twice they did that" — and every
// person's page read the same because every person's input had the same shape. A list in, a list out.
//
// So the list is not what goes in. What goes in is a shape: what kind of run this was (a fall, a holding-out, a life cut
// short), where it turned, the five or six moments that decided it and *why each one is in the story* — the first harm,
// the worst, the kindest, the one where being watched was the whole of the difference, the one that contradicts the
// rest — and who it all landed on. Different people have differently shaped runs, so they get differently shaped
// stories, which is the only way they stop sounding alike.
import type { } from "./types.ts";

const short = (s: string) => String(s || "").split(" ")[0];
const WATCHED = new Set(["seen", "near", "aloud", "crowd"]), UNSEEN = new Set(["unseen", "private", "far", "alone"]);

export interface Scene {
  k: number;                 // the season it happened in
  when: string;              // "Year 4, autumn"
  why: string;               // why this moment is in the story — the chronicler's reason to tell it
  situation: string;         // what was in front of them
  chose: string;             // the option they took
  passed?: string;           // the option they did not take, when it was the one that would have hurt somebody
  harm: number; help: number;
  other?: string;            // the other party
  where?: string;            // the place
  seen?: number;             // how many were there
  watching?: string;         // "nobody could see" / "the clerk watching"
  said?: string;             // what they told themselves
  because?: string[];        // what weighed for it
  outcome?: string;          // what came of it, which for a choice that hurts only themselves is the whole point
}

export interface Arc {
  id: string; name: string; role: string; age: number; want: string; fear: string;
  traits: Record<string, number>;
  shape: "fall" | "hold" | "drift" | "recover" | "cut short" | "left" | "quiet";
  shapeNote: string;         // the shape in a sentence, as a brief
  year: number; of: number; over: boolean;
  end: string;
  tests: number; humane: number;      // moments with a harm on the table, and how often they left it alone
  watchedSplit?: string;              // what being watched did to them — the experiment, for this one person
  thread?: string;                    // the situation that came at this one and hardly at the others
  turn?: Scene;
  scenes: Scene[];
  bore: { name: string; times: number; worst?: string }[];   // who their choices landed on
  borne: { name: string; times: number; worst?: string }[];  // who did things to them
  pressure: string[];                                        // what the world was doing while this happened
}

const label = (r: any, k: number) => String(r.tickLabels?.[k] ?? "");

/** every decision this person made, with the shape of the choice attached — the raw material scenes are picked from */
function decisions(r: any, i: number) {
  const out: (Scene & { worstOnTable: number; chosenId: string; study?: string; condId?: string })[] = [];
  (r.acts as any[][]).forEach((as, k) => (as || []).forEach((a: any) => {
    if (a.c !== i || !a.dilemma || !Array.isArray(a.options) || a.options.length < 2) return;
    const chosen = a.options.find((o: any) => o.id === a.option); if (!chosen) return;
    const worstOpt = a.options.reduce((m: any, o: any) => ((o.harm ?? 0) > (m.harm ?? 0) ? o : m), a.options[0]);
    out.push({
      k, when: label(r, k), why: "",
      situation: String(a.situation ?? a.text ?? "").trim(),
      chose: String(chosen.label ?? ""),
      passed: (worstOpt.harm ?? 0) >= 0.1 && worstOpt.id !== chosen.id ? String(worstOpt.label ?? "") : undefined,
      harm: chosen.harm ?? 0, help: chosen.help ?? 0,
      other: a.target != null && a.target !== i ? short(r.citizens[a.target]?.name ?? "") : undefined,
      where: a.place ? String(a.place) : undefined,
      seen: a.seen,
      // one account of the room, not two: a condition label and "2 others there" together produced
      // "Two others were there, but Sif settled it. They told themself nobody was watching."
      watching: a.condition?.label ? String(a.condition.label) : a.seen === 0 ? "nobody could see" : a.seen ? `${a.seen} others there` : undefined,
      said: a.thought ? String(a.thought) : undefined,
      because: Array.isArray(a.because) ? a.because.slice(0, 2).map(String) : undefined,
      outcome: a.outcome ? String(a.outcome) : undefined,
      worstOnTable: worstOpt.harm ?? 0, chosenId: String(chosen.id), study: a.experiment?.id, condId: a.condition?.id, dilemma: String(a.dilemma ?? ""),
    });
  }));
  return out;
}

/** what being watched did to this person: the whole point of the place, in one sentence, or nothing if it never varied */
function watchedSplit(ds: ReturnType<typeof decisions>): string | undefined {
  const tests = ds.filter((d) => d.worstOnTable >= 0.1);
  const seen = tests.filter((d) => d.condId && WATCHED.has(d.condId));
  const unseen = tests.filter((d) => d.condId && UNSEEN.has(d.condId));
  if (seen.length < 2 || unseen.length < 2) return undefined;
  const rate = (xs: typeof tests) => xs.filter((d) => d.harm < 0.1).length / xs.length;
  const s = rate(seen), u = rate(unseen);
  if (Math.abs(s - u) < 0.2) return `Watched or not made no difference to them: they left the harm alone ${Math.round(s * 100)} % of the time in front of people and ${Math.round(u * 100)} % when nobody could see.`;
  return s > u
    ? `They were better when somebody was looking: they left the harm alone ${Math.round(s * 100)} % of the time in front of people, and ${Math.round(u * 100)} % when nobody could see.`
    : `They were better when nobody was looking: ${Math.round(u * 100)} % unwatched against ${Math.round(s * 100)} % in front of people.`;
}

/** How often each of the four met each kind of situation. The flour sack, the informer and the wrecked house come to
 *  everybody, so a story built from the heaviest moments is built from the moments everyone shares — which is exactly
 *  why four lives came out as one life with the names changed. What is worth telling is what this person kept being
 *  asked that the others were not. */
export function signatures(r: any): Map<string, Map<string, number>> {
  const per = new Map<string, Map<string, number>>();
  (r.acts as any[][]).forEach((as) => (as || []).forEach((a: any) => {
    if (!a.dilemma) return; const c = r.citizens[a.c]; if (!c) return;
    const m = per.get(c.id) ?? new Map<string, number>(); m.set(String(a.dilemma), (m.get(String(a.dilemma)) ?? 0) + 1); per.set(c.id, m);
  }));
  return per;
}

/** the moments that decided it, each with the reason it is being told */
function pickScenes(ds: ReturnType<typeof decisions>, turnedK?: number, sig?: { mine: Map<string, number>; others: Map<string, number> }): Scene[] {
  const picked = new Map<number, Scene>();
  const take = (d: (typeof ds)[number] | undefined, why: string) => { if (d && !picked.has(d.k)) picked.set(d.k, { ...d, why }); };
  const tests = ds.filter((d) => d.worstOnTable >= 0.1);
  const harms = tests.filter((d) => d.harm >= 0.1).sort((a, b) => b.harm - a.harm || a.k - b.k);
  const kept = tests.filter((d) => d.harm < 0.1).sort((a, b) => b.worstOnTable - a.worstOnTable || a.k - b.k);
  const kind = ds.filter((d) => d.help >= 0.2).sort((a, b) => b.help - a.help);

  if (turnedK != null) take(ds.find((d) => d.k === turnedK) ?? harms[0], "this is where they crossed over");
  take(harms.slice().sort((a, b) => a.k - b.k)[0], "the first time they took the harm");
  take(harms[0], "the worst thing they did");
  take(kept[0], "the biggest harm they left on the table");
  take(kind[0], "the kindest thing they did");
  // the one where being seen, or not being seen, was the whole of the difference
  take(tests.find((d) => d.condId && UNSEEN.has(d.condId) && d.harm >= 0.1), "nobody could see, and they took it anyway");
  take(tests.find((d) => d.condId && UNSEEN.has(d.condId) && d.harm < 0.1), "nobody could see, and they left it alone");
  // the contradiction: a kindness after a harm, or a harm after a kindness, towards anyone
  const afterHarm = harms.length ? kind.find((d) => d.k > harms[0].k) : undefined;
  take(afterHarm, "and then this, which does not fit the rest");

  // Their own thread: the situation this person met again and again that the others hardly met at all. Two of these,
  // before anything generic, because this is the part of the run that belongs to them and nobody else.
  if (sig) {
    const own = [...sig.mine.entries()]
      .map(([id, mine]) => [id, mine * 2 - (sig.others.get(id) ?? 0)] as const)
      .filter(([, score]) => score >= 2).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    for (const id of own.slice(0, 2)) {
      const runs = ds.filter((d) => d.dilemma === id);
      const decisive = runs.find((d) => d.harm >= 0.1) ?? runs.find((d) => d.worstOnTable >= 0.1) ?? runs[0];
      take(decisive, runs.length > 2
        ? `this came at them over and over across the years and hardly at anyone else — it is the thread of their run`
        : `this is theirs: it barely happened to anybody else in the lane`);
    }
  }

  // Somebody who never took a harm would otherwise get two scenes and a thin story. Fill from the hardest things they
  // were asked and refused, oldest first, so a life of holding out still has a middle.
  for (const d of kept) { if (picked.size >= 5) break; take(d, "another time the easy road would have cost somebody else"); }
  for (const d of tests.slice().sort((a, b) => a.k - b.k)) { if (picked.size >= 4) break; take(d, "what the years kept asking of them"); }
  return [...picked.values()].sort((a, b) => a.k - b.k).slice(0, 6);
}

const SHAPES: Record<Arc["shape"], string> = {
  fall: "This is a fall. Find the point it turned and make the reader feel the difference between before and after — but do not assume they began clean. Look at what they did earliest; if it was already ugly, the fall is from something smaller than innocence.",
  hold: "This is a holding-out. The years kept putting a harm on the table and they kept leaving it there, at a cost. Do not make them a saint and do not simply approve of them: say what it was in them that held, what it cost them, and where it nearly did not hold.",
  drift: "This is a drift. No single moment damns them; they gave way a little at a time, each one reasonable. Show the slope, not a cliff.",
  recover: "They were worse early and better later. Say what turned them back, if the record shows it, and do not tidy the early years away.",
  "cut short": "This life ends inside the years. Write towards the end without announcing it, and let the last thing they did stand where it falls.",
  left: "They got out. Say what they were leaving and whether they left anything behind them worth staying for.",
  quiet: "Little was asked of them. That is the story: a life the years mostly went around. Do not inflate it.",
};

export function arcOf(r: any, i: number): Arc {
  const c = r.citizens[i];
  const ds = decisions(r, i);
  // what this person kept being asked that the other three were not: the part of the run that is theirs
  const sigs = signatures(r);
  const mine = sigs.get(c.id) ?? new Map<string, number>();
  const others = new Map<string, number>();
  for (const [id, m] of sigs) { if (id === c.id) continue; const cz = r.citizens.find((x: any) => x.id === id); if (!cz?.named) continue;
    for (const [d, n] of m) others.set(d, (others.get(d) ?? 0) + n); }
  const sig = { mine, others };
  const played = Math.min((r.acts || []).length, r.frames?.length ?? Infinity);
  const year = Math.ceil(played / 4), of = Math.ceil((r.hours ?? played) / 4); /* the year being lived, not the last one finished: a story that reaches season 43 may speak of year 11 */
  const over = year >= of;

  const tests = ds.filter((d) => d.worstOnTable >= 0.1);
  const humane = tests.filter((d) => d.harm < 0.1).length;
  const turnedK = c.turnedAt ? c.turnedAt - 1 : undefined;

  // the conscience, at the quarter marks: the curve the shape is read off
  const cons = (k: number) => Number(r.frames?.[Math.min(k, played - 1)]?.conscience?.[i] ?? 0);
  const early = cons(Math.floor(played / 3)), late = cons(played - 1);

  // The shape is read off what they did, not off the conscience line — that line rises for nearly everybody, because
  // kindness accumulates, and reading it naively made every single person a "recover", which is how four people ended
  // up with the same story again. Harms early against harms late is the thing that actually differs.
  const third = Math.max(1, Math.floor(played / 3));
  const harmsEarly = tests.filter((d) => d.k < third && d.harm >= 0.1).length;
  const harmsLate = tests.filter((d) => d.k >= played - third && d.harm >= 0.1).length;
  const rate = humane / Math.max(1, tests.length);
  let shape: Arc["shape"] = "quiet";
  if (!c.alive) shape = "cut short";
  else if (c.left) shape = "left";
  else if (c.turnedAt) shape = "fall";
  else if (tests.length < 4) shape = "quiet";
  else if (rate >= 0.85) shape = "hold";
  else if (harmsEarly > 0 && harmsLate === 0 && late > early) shape = "recover";
  else if (harmsLate > harmsEarly) shape = "drift";
  else if (rate >= 0.6) shape = "hold";
  else shape = "drift";

  // who it landed on, both ways round
  const tally = (pick: (a: any) => boolean, who: (a: any) => number | undefined) => {
    const m = new Map<number, { times: number; worst: number; text: string }>();
    (r.acts as any[][]).forEach((as) => (as || []).forEach((a: any) => {
      if (!pick(a)) return; const j = who(a); if (j == null || j === i) return;
      const e = m.get(j) ?? { times: 0, worst: 0, text: "" }; e.times++;
      if ((a.harm ?? 0) > e.worst) { e.worst = a.harm ?? 0; e.text = String(a.text ?? ""); }
      m.set(j, e);
    }));
    return [...m.entries()].sort((a, b) => b[1].worst - a[1].worst || b[1].times - a[1].times).slice(0, 3)
      .map(([j, e]) => ({ name: short(r.citizens[j]?.name ?? ""), times: e.times, worst: e.worst >= 0.1 ? e.text : undefined }));
  };
  const bore = tally((a) => a.c === i && (a.harm ?? 0) >= 0.05, (a) => a.target);
  const borne = tally((a) => a.target === i && a.c !== i && ((a.harm ?? 0) >= 0.05 || (a.help ?? 0) >= 0.1), (a) => a.c);

  const pressure = (r.events || []).filter((e: any) => e.seasons && e.at - 1 < played).map((e: any) => String(e.headline));

  const end = !c.alive ? `They died of ${c.cause}${c.diedAt ? `, ${label(r, c.diedAt - 1)}` : ""}.`
    : c.left ? "They left the town."
    : over ? `They were alive at the end of the ${of} years.`
    : `They are alive, and the years are not over: this is their life to the end of year ${year} of ${of}.`;

  return {
    id: c.id, name: c.name, role: c.role, age: c.age, want: c.want, fear: c.fear, traits: c.traits ?? {},
    shape, shapeNote: SHAPES[shape], year, of, over, end,
    tests: tests.length, humane,
    watchedSplit: watchedSplit(ds),
    thread: (() => {
      const own = [...mine.entries()].map(([id, n]) => [id, n * 2 - (others.get(id) ?? 0), n] as const).sort((a, b) => b[1] - a[1])[0];
      if (!own || own[1] < 3) return undefined;
      const runs = ds.filter((d) => d.dilemma === own[0]);
      const took = runs.filter((d) => d.harm >= 0.1).length;
      // Qualitative, not counted. Told "8 times" it wrote "nine springs": a number handed over is a number that can
      // come back wrong, and the one thing this must not do is put a false fact on the page.
      const often = own[2] >= 6 ? "again and again, most years of the run" : own[2] >= 4 ? "over and over" : "more than once";
      // What they actually did across the thread, not what it cost anybody else. Counting only harm-to-others made
      // "took the double pay in the deep seam and was dug out half-dead" read as never having taken it, so the
      // chronicler was told Ivo refused every time and wrote a man who never wavered — a plaque, not a life, and
      // contradicted by his own log four inches down the page.
      const byOption = new Map<string, number>();
      for (const d of runs) { const lab = d.chose.replace(/^["“]|["”]$/g, ""); byOption.set(lab, (byOption.get(lab) ?? 0) + 1); }
      const spread = [...byOption.entries()].sort((a, b) => b[1] - a[1]);
      const how = spread.length === 1
        ? `and every time they chose the same thing: "${spread[0][0]}"`
        : `and they did not answer it the same way twice over: ${spread.map(([lab, n]) => `"${lab}" ${n === 1 ? "once" : n === 2 ? "twice" : `${n} times`}`).join(", ")}`;
      const cost = runs.map((d) => d.outcome).filter(Boolean).filter((x, z, arr) => arr.indexOf(x) === z).slice(0, 2);
      return `${often} the years put this in front of them — "${runs[0]?.situation.split(/(?<=[.!?])\s/)[0] ?? own[0]}" — ${how}.${cost.length ? ` What came of it, in their own record: ${cost.join(" / ")}` : ""}`;
    })(),
    turn: turnedK != null ? pickScenes(ds, turnedK, sig).find((s) => s.k === turnedK) : undefined,
    scenes: pickScenes(ds, turnedK, sig),
    bore, borne, pressure,
  };
}

/** the arc as the brief the chronicler is given: a shape, its scenes, and the reason each scene is in the story */
export function arcBrief(a: Arc): string {
  const scene = (s: Scene) => [
    `- ${s.when} — ${s.why}.`,
    s.situation ? `  What was in front of them: ${s.situation}` : "",
    `  They chose: "${s.chose}"${s.other ? ` · the other party was ${s.other}` : ""}${s.where ? ` · at ${s.where}` : ""}${s.watching ? ` · ${s.watching}` : ""}`,
    s.passed ? `  What they did not choose: "${s.passed}" — the one that would have hurt somebody.` : "",
    s.said ? `  What they told themselves: "${s.said}"` : "",
    s.because?.length ? `  What weighed for it: ${s.because.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  return [
    `${a.name}, ${a.role}, ${a.age}. Wants ${a.want}. Fears ${a.fear}. ${a.end}`,
    "",
    `THE SHAPE OF IT: ${a.shapeNote}`,
    // the ratio in words, for the same reason: it was restating the numbers and getting them wrong against its own header
    a.tests ? `How often a harm was on the table in front of them, and how often they left it there: ${a.humane === a.tests ? "every single time" : a.humane === 0 ? "never once" : a.humane / a.tests >= 0.85 ? "nearly always, with a handful of exceptions" : a.humane / a.tests >= 0.6 ? "more often than not" : a.humane / a.tests >= 0.4 ? "about half the time" : "seldom"}. Do not put a number on this.` : "",
    a.watchedSplit ? a.watchedSplit : "",
    a.thread ? `THEIR OWN THREAD: ${a.thread}. This is what the years kept putting in front of this person and hardly in front of anyone else. If the story is about anything, it is about this.` : "",
    a.pressure.length ? `What the world was doing meanwhile: ${a.pressure.join("; ")}.` : "",
    "",
    "THE MOMENTS THAT DECIDED IT, in order. Each one says why it is in the story; write the story those reasons make, not a list of the moments:",
    a.scenes.map(scene).join("\n"),
    a.bore.length ? `\nWho their choices landed on: ${a.bore.map((b) => `${b.name} (${b.times}${b.worst ? `, worst: ${b.worst}` : ""})`).join(", ")}.` : "",
    a.borne.length ? `Who did things to them: ${a.borne.map((b) => `${b.name} (${b.times}${b.worst ? `, worst: ${b.worst}` : ""})`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

// ---------- the run itself, in chapters ----------
//
// Fifteen paragraphs, one per year, is a list of years however well each one is written. The town already has a
// dramatic structure and it is not the calendar: it is what comes through the place. A famine is an act. The winter
// after it is an act. The quiet stretch where everyone is waiting is an act. So the chapters are the epochs and the
// lulls between them, and each one is told as a thing that happened to people rather than a period that elapsed.

export interface Chapter {
  n: number; from: number; to: number;      // seasons [from, to]
  live?: boolean;                           // the one being lived in: tellable, and retold as it grows
  title: string;                            // the epoch's own headline, or what the quiet was
  kind: string;                             // famine | plague | war | winter | fire | flood | … | quiet
  when: string;                             // "Year 3 to year 5"
  facts: string[];
  deaths: string[];
  turns: string[];                          // who crossed during it
  cast: { name: string; who: string }[];    // everyone the chapter names who is not one of the four, and who they are
  carried: string[];                        // what the chapter before left unfinished, so this one can answer it
}

const yearOf = (k: number) => Math.floor(k / 4) + 1;

/** What to call a stretch the world let alone. Four chapters headed "Year N, and nothing came through the town" is one
 *  template with the numbers changed — and it is not even true: nothing came through, but plenty happened. */
const QUIET = [
  "No famine, no fever, no soldiers", "The lane left to itself", "Nothing came down the road",
  "A stretch with no weather in it", "The years the world forgot the lane", "Between one trouble and the next",
];

export function chaptersOf(r: any, cap = 12): Chapter[] {
  const labels: string[] = r.tickLabels ?? [];
  const played = Math.min((r.acts || []).length, r.frames?.length ?? Infinity);
  if (!played) return [];
  const eps = (r.events || []).filter((e: any) => e.seasons && e.at - 1 < played)
    .map((e: any) => ({ from: e.at - 1, to: Math.min(played - 1, e.at - 2 + e.seasons), headline: String(e.headline), kind: String(e.kind) }))
    .sort((a: any, b: any) => a.from - b.from);

  // the spans: each epoch, and each stretch of quiet between them
  const spans: { from: number; to: number; title: string; kind: string }[] = [];
  let at = 0;
  for (const e of eps) {
    if (e.from > at) spans.push({ from: at, to: e.from - 1, title: "", kind: "quiet" });
    spans.push({ from: Math.max(at, e.from), to: Math.max(e.to, e.from), title: e.headline, kind: e.kind });
    at = Math.max(at, e.to + 1);
  }
  if (at <= played - 1) spans.push({ from: at, to: played - 1, title: "", kind: "quiet" });

  // A short lull is not an act; it is the run-up to the next one. Absorb it, so the chapters are the things that came
  // through the town rather than an alternation of weather and waiting.
  const merged: typeof spans = [];
  for (const sp of spans) {
    const short4 = sp.kind === "quiet" && sp.to - sp.from < 3;
    const prev = merged[merged.length - 1];
    if (short4 && merged.length && prev.kind === "quiet") { prev.to = sp.to; continue; }
    if (short4) { merged.push(sp); continue; }                        /* decided below, once we know what follows */
    if (prev?.kind === "quiet" && prev.to - prev.from < 3) { merged[merged.length - 1] = { ...sp, from: prev.from }; continue; }
    merged.push(sp);
  }
  const last = merged[merged.length - 1];
  if (merged.length > 1 && last?.kind === "quiet" && last.to - last.from < 3) { merged[merged.length - 2].to = last.to; merged.pop(); }
  spans.length = 0; spans.push(...merged);

  const people = r.citizens;
  const out: Chapter[] = []; let quiet = 0;
  for (const sp of spans) {
    const facts: string[] = [], deaths: string[] = [], turns: string[] = [];
    let weight = 0;
    for (let k = sp.from; k <= sp.to; k++) for (const a of (r.acts[k] || [])) {
      const name = short(people[a.c]?.name ?? ""); if (!name) continue;
      const other = a.target != null && a.target !== a.c ? short(people[a.target].name) : null;
      if (a.kind === "death") { const by = a.by != null && a.by !== a.c ? short(people[a.by].name) : null;
        deaths.push(by ? `${by} killed ${name}.` : `${name} ${String(a.text).replace(/^dies/, "died")}.`); weight += 10; continue; }
      if (a.kind === "turned") { turns.push(`${name} passed the point where their harm outweighs their kindness.`); weight += 8; continue; }
      if (!a.dilemma || !a.options?.length) continue;
      const chosen = a.options.find((o: any) => o.id === a.option); if (!chosen) continue;
      const worst = a.options.reduce((m: any, o: any) => ((o.harm ?? 0) > (m.harm ?? 0) ? o : m), a.options[0]);
      if ((worst.harm ?? 0) < 0.1) continue;                // no harm was on the table: not a moment
      const took = (chosen.harm ?? 0) >= 0.1;
      const w = (took ? 6 : 3) + (people[a.c]?.named ? 3 : 0) + (a.seen === 0 ? 1 : 0);
      weight += w;
      facts.push(`[${w}] ${labels[k] ?? `Year ${yearOf(k)}`}: ${name}${a.you ? ` (${a.you})` : ""} chose "${chosen.label}"${other ? ` — it fell on ${other}` : ""}${a.place ? `, at ${a.place}` : ""}${a.condition?.label ? `, ${a.condition.label}` : a.seen === 0 ? ", nobody there to see it" : ""}. ${took ? "It hurt them." : `They left "${lowerFirst(String(worst.label))}" on the table.`}${a.thought ? ` They said: "${a.thought}"` : ""}`);
    }
    if (!facts.length && !deaths.length && !turns.length) continue;
    // A death and the decision that caused it are one event. Listing both is what made the chronicler write "Oskar
    // drowned anyway, and Teo killed Oskar, though the record does not say how the one became the other."
    // A death and the decision that caused it are one event, but deleting the decision deleted the whole point of it:
    // "Teo turned the water onto Oskar to save three" became "Teo killed Oskar", with the three saved lives gone and
    // the choice flattened into a murder. They are joined instead.
    const inDeaths = deaths.join(" ").match(/\b[A-Z][a-z]+\b/g) ?? [];
    if (inDeaths.length) for (let z = facts.length - 1; z >= 0; z--) {
      if (!inDeaths.some((nm) => facts[z].includes(nm)) || !facts[z].includes("It hurt them.")) continue;
      const cause = facts[z].replace(/^\[\d+\] /, "");
      const di = deaths.findIndex((d) => inDeaths.some((nm) => d.includes(nm) && cause.includes(nm)));
      if (di >= 0) deaths[di] = `${deaths[di]} This is how: ${cause}`; /* the fact, not a sermon about it — the sermon was going over the wire and coming back verbatim in the prose */
      facts.splice(z, 1);
    }
    // Sorted back into the order they happened — by season, not by year. Sorting by year alone left the moments inside
    // a year in weight order, so a chapter told Sif beating Oskar before the sickness that caused it: the chapter's
    // causal chain ran backwards against its own fold.
    const top = facts.map((f, idx) => [Number(/^\[(\d+)\]/.exec(f)?.[1] ?? 0), idx, f] as const)
      .sort((a, b) => b[0] - a[0]).slice(0, 3)
      .sort((a, b) => a[1] - b[1]).map(([, , f]) => f.replace(/^\[\d+\] /, ""));
    const y1 = yearOf(sp.from), y2 = yearOf(sp.to);
    // everyone this chapter names who is not one of the four: a reader meets them as a bare name otherwise
    const said = new Set<string>();
    for (const f of [...top, ...deaths, ...turns]) for (const m of f.match(/\b[A-Z][a-z]+\b/g) ?? []) said.add(m);
    const cast = people.filter((p: any) => !p.named && said.has(short(p.name)))
      .map((p: any) => ({ name: short(p.name), who: `${p.role}, ${p.age}${p.partner ? `, married to ${short(people.find((x: any) => x.id === p.partner)?.name ?? "")}` : ""}${p.children ? `, ${p.children} child${p.children === 1 ? "" : "ren"}` : ""}` }));
    out.push({
      cast, carried: [],
      n: out.length + 1, from: sp.from, to: sp.to, kind: sp.kind,
      title: sp.title || QUIET[quiet++ % QUIET.length],
      when: y1 === y2 ? `Year ${y1}` : `Year ${y1} to year ${y2}`,
      facts: top, deaths, turns,
    });
  }
  if (out.length) out[out.length - 1].live = true;

  // The thread. Each chapter is told what the one before it left unfinished — who crossed over, who died, who was
  // wronged and not answered — so a chapter can open on a consequence instead of on its own weather.
  for (let z = 1; z < out.length; z++) {
    const prev = out[z - 1]; const carried: string[] = [];
    for (const t of prev.turns) carried.push(`${t} That was the chapter before this one, and nobody in the town has answered it.`);
    for (const d of prev.deaths) carried.push(`${d} That happened in the chapter before this one.`);
    const hurt = prev.facts.filter((f) => f.includes("It hurt them.")).slice(-2);
    for (const h of hurt) carried.push(`Left over from the chapter before: ${h}`);
    out[z].carried = carried.slice(0, 3);
  }

  // a run with many small epochs would give many thin chapters; keep the heaviest, in order
  if (out.length <= cap) return out;
  const keep = new Set(out.map((c, i) => [i, c.facts.length + c.deaths.length * 4 + c.turns.length * 3] as const)
    .sort((a, b) => b[1] - a[1]).slice(0, cap).map(([i]) => i));
  return out.filter((_, i) => keep.has(i)).map((c, i) => ({ ...c, n: i + 1 }));
}

const lowerFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

/** How this chapter opens and closes. Rotated by its number, because nine chapters that all open on what the year
 *  asked of the town and all close on what it left behind are one chapter told nine times. */
const MOVES = [
  "Open on something being said, in somebody's own words, before the reader knows who is speaking or where. Close on an object, a door, a distance — not on a conclusion.",
  "Open on what somebody had just finished doing when the moment found them. Close on what one of them said, with nothing after it.",
  "Open on what the chapter before this one left unfinished, by name, as something still happening. Close inside a moment. Never write a sentence about whether the chapter settled anything.",
  "Open on a thing changing hands, or refusing to. Close on somebody going home, or not going home.",
  "Open on what was at stake in the moments you were given, in their own terms. Close on who ended up with it.",
  "Open on the weather of the town's mood — what people had started doing differently — and get to a person inside two sentences. Close on somebody left alone with the result.",
];

export function chapterBrief(c: Chapter, title: string, four: string[] = [], places: { name: string; what: string }[] = []): string {
  return [
    `THE MOVE, for this chapter only: ${MOVES[(c.n - 1) % MOVES.length]}`,
    "",
    `THE CHAPTER: ${c.kind === "quiet" ? "a stretch with nothing coming through the town" : c.title}`,
    `WHEN: ${c.when}, in ${title}.`,
    four.length ? `The four whose years these are: ${four.join(", ")}. Everyone else is one of the lane.` : "",
    "",
    c.carried.length ? `WHAT THE CHAPTER BEFORE THIS ONE LEFT OPEN — open on it, or answer it, or say plainly that nobody did:\n${c.carried.map((x) => `- ${x}`).join("\n")}` : "",
    "",
    c.deaths.length ? `SOMEBODY DIED IN THIS CHAPTER, AND THAT IS WHAT THE CHAPTER IS. Tell it — how it came about, who did it, what they thought they were doing — and let the other moments be the room around it or leave them out. A chapter that buries a death under a quarrel about a debt has failed.\n${c.deaths.map((d) => `- ${d}`).join("\n")}` : "NOBODY DIED IN THIS CHAPTER. Everyone named here is alive at the end of it and goes on into the next one. Do not write anybody out.",
    c.turns.length ? `Who crossed over in it:\n${c.turns.map((d) => `- ${d}`).join("\n")}` : "",
    c.facts.length ? `What was asked of people, and what they did — choose ONE of these to tell properly:\n${c.facts.map((f) => `- ${f}`).join("\n")}` : "",
    c.cast.length ? `\nWho the other names are, if you use them: ${c.cast.map((x) => `${x.name} (${x.who})`).join("; ")}. Say who somebody is the first time you name them, in three words, or do not name them.` : "",
    places.length ? `\nThe only places this town has: ${places.map((p) => `${p.name} (${p.what})`).join("; ")}. There is nowhere else. Do not give the town a building, a road or a room that is not on this list.` : "",
  ].filter(Boolean).join("\n");
}

// ---------- the whole run, for one telling ----------
//
// Chapters written one at a time can never make a story, because no author ever holds the whole thing: twelve
// captions is twelve authors. A finished run goes to the chronicler once, entire — with its spine named, because
// every run has one: the person who crossed over, or died at somebody's hands, or held while everyone else gave way.

export interface RunSpine { protagonist: any; why: string; counter?: any; counterWhy?: string }

/** whose run this was: the four ranked by how much story happened to them */
export function spineOf(r: any): RunSpine {
  const four = (r.citizens as any[]).filter((c) => c.named);
  const score = (c: any) => (c.turnedAt ? 40 - c.turnedAt / 4 : 0) + (!c.alive ? 30 : 0) + (c.harm ?? 0) * 6 + (c.left ? 10 : 0);
  const ranked = four.slice().sort((a, b) => score(b) - score(a));
  const p = ranked[0];
  const why = p.turnedAt ? `they crossed over in year ${Math.ceil(p.turnedAt / 4)} and the town never answered it`
    : !p.alive ? `the years killed them` : `their choices cost the most`;
  const counter = ranked.slice(1).sort((a, b) => (b.help ?? 0) - (a.help ?? 0))[0];
  return { protagonist: p, why, counter, counterWhy: counter ? `they kept refusing the same roads ${short(p.name)} took` : undefined };
}

/** everything one telling needs — and nothing that is not an event. The first drafts handed over every quiet word
 *  and every year given on a debt, and the telling came back the same: long, dutiful, nothing happening. A story is
 *  made of the moments that changed somebody's life; the rest of a run is weather, and gets a clause. */
export function runDigest(r: any): string {
  const sp = spineOf(r);
  const people = r.citizens; const labels: string[] = r.tickLabels ?? [];
  const played = Math.min((r.acts || []).length, r.frames?.length ?? Infinity);
  const fourArcs = (people as any[]).map((c, i) => ({ c, i })).filter((x) => x.c.named)
    .map(({ c, i }) => { const a = arcOf(r, i); return `- ${c.name}, ${c.role}. ${a.shape === "fall" ? "A fall." : a.shape === "hold" ? "A holding-out." : a.shape === "cut short" ? "Cut short." : "A drift."} ${a.thread ? `Their own thread: ${a.thread}.` : ""} ${a.end}`; });

  // events only: a death, a crossing, a leaving, a harm somebody took, a big refusal or rescue. Nothing smaller.
  const pool: { w: number; k: number; t: string }[] = [];
  const main = new Set([sp.protagonist?.id, sp.counter?.id]);
  for (let k = 0; k < played; k++) for (const a of (r.acts[k] || [])) {
    const nm2 = short(people[a.c]?.name ?? ""); if (!nm2) continue;
    const when = labels[k] ?? `Year ${Math.floor(k / 4) + 1}`;
    const weight = (base: number) => base + (main.has(people[a.c]?.id) ? 8 : people[a.c]?.named ? 4 : 0) + (a.target != null && main.has(people[a.target]?.id) ? 3 : 0);
    let w0 = 0; const push = (t: string) => { pool.push({ w: w0, k, t: `- ${when}: ${t}` }); };
    if (a.kind === "death") { const by = a.by != null && a.by !== a.c ? short(people[a.by].name) : null;
      w0 = weight(by ? 100 : people[a.c]?.named ? 60 : 25); push(by ? `${by} killed ${nm2}.` : `${nm2} ${String(a.text).replace(/^dies/, "died")}.`); continue; }
    if (a.kind === "turned") { w0 = weight(70); push(`${nm2} passed the point where their harm outweighs their kindness. Nobody in the town answered it.`); continue; }
    if (a.kind === "leave") { w0 = weight(50); push(`${nm2} left the town for good.`); continue; }
    if (!a.dilemma || !a.options?.length) continue;
    const chosen = a.options.find((o: any) => o.id === a.option); if (!chosen) continue;
    const worst = a.options.reduce((m: any, o: any) => ((o.harm ?? 0) > (m.harm ?? 0) ? o : m), a.options[0]);
    const other = a.target != null && a.target !== a.c ? short(people[a.target].name) : null;
    const kills = (a.kills || []).filter((x: number) => x !== a.c);
    const said2 = a.thought ? ` They said: "${a.thought}"` : "";
    if (kills.length || (chosen.harm ?? 0) >= 0.15) {
      w0 = weight(kills.length ? 90 : 20 + (chosen.harm ?? 0) * 40 + (a.seen === 0 ? 5 : 0));
      push(`${nm2} ${lowerFirst(String(a.text ?? chosen.label))}${other ? ` — it fell on ${other}` : ""}${a.seen === 0 ? ", with nobody watching" : ""}.${said2}`);
    } else if ((worst.harm ?? 0) >= 0.3 && people[a.c]?.named && (chosen.harm ?? 0) < 0.1) {
      w0 = weight(12 + (worst.harm ?? 0) * 20);
      push(`${nm2} refused "${lowerFirst(String(worst.label ?? ""))}"${other ? `, and ${other} was spared it` : ""}.${said2}`);
    } else if ((chosen.help ?? 0) >= 0.35) {
      w0 = weight(14 + (chosen.help ?? 0) * 15);
      push(`${nm2} ${lowerFirst(String(a.text ?? chosen.label))}${other ? ` for ${other}` : ""}.${said2}`);
    }
  }
  // Sixteen, the heaviest, back in the order they happened. Forty was a chronicle of sacks of flour.
  const kept = pool.sort((x, y) => y.w - x.w).slice(0, 16).sort((x, y) => x.k - y.k);
  const events = kept.map((e) => e.t);
  const eventYears = new Set(kept.map((e) => Math.floor(e.k / 4) + 1));
  // the years nothing happened in, named as such, so the telling can cross them in a clause
  const lastYear = Math.ceil(played / 4);
  const quiet: string[] = [];
  for (let y = 1; y <= lastYear; y++) if (!eventYears.has(y)) quiet.push(`year ${y}`);
  const epochs = (r.events || []).filter((e: any) => e.seasons && e.at - 1 < played).map((e: any) => `- around year ${Math.ceil(e.at / 4)}: ${e.headline}`);

  return [
    `THE PLACE: ${r.title}. ${r.premise ?? ""}`,
    "",
    `THE SPINE OF THIS RUN — this is whose story it is: ${sp.protagonist.name}, ${sp.protagonist.role}, because ${sp.why}.`,
    sp.counter ? `THE COUNTERWEIGHT: ${sp.counter.name}, ${sp.counter.role} — ${sp.counterWhy}.` : "",
    "",
    "THE FOUR:",
    ...fourArcs,
    "",
    "WHAT THE WORLD DID:",
    ...epochs,
    "",
    "THE EVENTS — everything below changed somebody's life, and there is nothing else worth a sentence:",
    ...events,
    "",
    quiet.length ? `Nothing that changed anyone happened in ${quiet.join(", ")}. Cross those in a clause; do not furnish them.` : "",
  ].filter(Boolean).join("\n");
}

// ---------- threads: the same two people, crossing again and again ----------
//
// A run told as a timeline is a list of incidents — "Sif beat Alva", "Lena let someone take the harm" — each one with
// no why and no after. What makes it a story is that the same people keep meeting: Kai refuses to sign the order
// against Nell, Nell lets Kai pay half for ten years, Kai guards her house through the war, and then Kai is the one
// at the sluice. Every moment answers the one before. That is a thread, and the kindnesses are as much of it as the
// harms — they are what makes the betrayal land. The record is full of them; nobody was looking for them.

export interface ThreadMoment { k: number; when: string; by: string; to: string; kind: "harm" | "help" | "kill" | "neutral"; text: string; said?: string; outcome?: string; during?: string; since?: string }
export interface Thread { a: any; b: any; moments: ThreadMoment[]; score: number; from: number; to: number; ended?: string }

/** The turn in a thread: the harm that came after years of kindness between the same two people. It is the thing a
 *  reader should feel most and the thing a list of moments hides best, so it is found in code and handed to the
 *  narrator and the page by name rather than left for either to notice. A killing is the turn if there is one. */
export interface Turn { m: ThreadMoment; kind: "kill" | "harm"; before: ThreadMoment[]; years: number }
export function turnOf(t: Thread): Turn | null {
  const ms = t.moments;
  const at = (i: number) => {
    const m = ms[i]; const before = ms.slice(0, i);
    const helps = before.filter((x) => x.kind === "help"), harms = before.filter((x) => x.kind === "harm" || x.kind === "kill");
    if (helps.length < 3 || harms.length * 3 > helps.length) return null;
    return { m, kind: m.kind as "kill" | "harm", before: helps, years: Math.max(1, Math.floor(m.k / 4) - Math.floor(helps[0].k / 4)) };
  };
  const kill = ms.findIndex((m) => m.kind === "kill");
  if (kill >= 0) return at(kill);
  for (let i = 0; i < ms.length; i++) if (ms[i].kind === "harm") { const x = at(i); if (x) return x; }
  return null;
}

export function threadsOf(r: any, max = 5): Thread[] {
  const people = r.citizens; const labels: string[] = r.tickLabels ?? [];
  const played = Math.min((r.acts || []).length, r.frames?.length ?? Infinity);
  const eps = (r.events || []).filter((e: any) => e.seasons);
  const during = (k: number) => eps.find((e: any) => e.at - 1 <= k && k < e.at - 1 + e.seasons)?.kind as string | undefined;
  const byPair = new Map<string, ThreadMoment[]>();
  const add = (x: number, y: number, m: ThreadMoment) => { const key = [x, y].sort((p, q) => p - q).join(":"); (byPair.get(key) ?? byPair.set(key, []).get(key)!).push(m); };

  for (let k = 0; k < played; k++) for (const a of (r.acts[k] || [])) {
    const t = a.target;
    if (t == null || t === a.c || !a.dilemma) continue;
    const kills = (a.kills || []).includes(t);
    const harm = a.harm ?? 0, help = a.help ?? 0;
    const onTable = Array.isArray(a.options) && a.options.some((o: any) => (o.harm ?? 0) >= 0.1);
    const neutral = !kills && harm < 0.1 && help < 0.2 && onTable; /* could have hurt them and did not — neither good nor bad, and part of the shape */
    if (!kills && harm < 0.1 && help < 0.2 && !neutral) continue;
    add(a.c, t, {
      k, when: labels[k] ?? `Year ${Math.floor(k / 4) + 1}`,
      by: short(people[a.c].name), to: short(people[t].name),
      kind: kills ? "kill" : harm >= 0.1 ? "harm" : neutral ? "neutral" : "help",
      text: String(a.text ?? "").trim(), said: a.thought ? String(a.thought) : undefined,
      outcome: a.outcome ? String(a.outcome) : undefined, during: during(k),
    });
  }

  const out: Thread[] = [];
  for (const [key, ms] of byPair) {
    ms.sort((p, q) => p.k - q.k);
    const [x, y] = key.split(":").map(Number);
    const real = ms.filter((m) => m.kind !== "neutral");
    const harms = ms.filter((m) => m.kind === "harm").length, helps = ms.filter((m) => m.kind === "help").length;
    const kill = ms.some((m) => m.kind === "kill");
    const bothWays = new Set(ms.map((m) => m.by)).size > 1;
    if (real.length < 3 && !kill) continue;
    const named = [people[x], people[y]].filter((p) => p?.named).length;
    const score = real.length + harms * 3 + helps * 1.5 + (kill ? 30 : 0) + (harms && helps ? 10 : 0) + (bothWays ? 5 : 0) + named * 4;
    // how each moment stands to the one before it: that link is the story
    for (let i = 1; i < ms.length; i++) {
      const prev = ms[i - 1]; const gap = Math.floor(ms[i].k / 4) - Math.floor(prev.k / 4);
      const answers = prev.by !== ms[i].by;
      ms[i].since = `${gap <= 0 ? "the same year" : gap === 1 ? "a year later" : `${gap} years later`}${answers ? `, and after ${prev.by} had ${prev.text.replace(/\.$/, "")}` : `, and again`}`;
    }
    const last = ms[ms.length - 1];
    const px = people[x], py = people[y];
    const ended = kill ? `${last.by} killed ${last.to}.`
      : !px.alive || !py.alive ? `${!px.alive ? short(px.name) : short(py.name)} did not live to the end.`
      : `Both were alive when the years ended.`;
    out.push({ a: px, b: py, moments: ms, score, from: ms[0].k, to: last.k, ended });
  }
  // the strongest threads, but not four versions of the same person: at most two per head
  const chosen: Thread[] = []; const per = new Map<string, number>();
  // a killing is always a thread: it is the heaviest thing a run holds, whoever else is already in the story
  for (const t of out.filter((t) => t.moments.some((m) => m.kind === "kill"))) { chosen.push(t); per.set(t.a.id, (per.get(t.a.id) ?? 0) + 1); per.set(t.b.id, (per.get(t.b.id) ?? 0) + 1); }
  for (const t of out.sort((p, q) => q.score - p.score)) {
    if (chosen.includes(t)) continue;
    const ca = per.get(t.a.id) ?? 0, cb = per.get(t.b.id) ?? 0;
    if (ca >= 2 || cb >= 2) continue;
    chosen.push(t); per.set(t.a.id, ca + 1); per.set(t.b.id, cb + 1);
    if (chosen.length >= max) break;
  }
  return chosen.sort((p, q) => p.from - q.from);
}

export function threadBrief(t: Thread, title: string): string {
  const who = (c: any) => `${c.name}, ${c.role}, ${c.age}${c.named ? " (one of the four)" : ""}`;
  return [
    `THE TOWN: ${title}.`,
    `THE TWO: ${who(t.a)}; and ${who(t.b)}.`,
    `EVERY TIME THEIR LIVES CROSSED, IN ORDER — each one says how it stands to the one before:`,
    ...t.moments.filter((m) => m.kind !== "neutral").map((m, i) => [
      `${i + 1}. ${m.when}${m.during ? `, during the ${m.during}` : ""}${m.since ? ` (${m.since})` : ""}: ${m.by} ${m.text.replace(/\.$/, "")}${m.kind === "kill" ? " — and it killed them" : ""}.`,
      m.said ? `   ${m.by} said: "${m.said}"` : "",
      m.outcome ? `   What came of it: ${m.outcome}` : "",
    ].filter(Boolean).join("\n")),
    `HOW IT ENDED: ${t.ended}`,
    ...(() => { const tu = turnOf(t); return tu ? ["",
      `THE TURN — this is the story: after ${tu.before.length} kindnesses between them over ${tu.years} year${tu.years > 1 ? "s" : ""}, ${tu.m.by} ${tu.m.text.replace(/\.$/, "")}${tu.kind === "kill" ? ", and it killed " + tu.m.to : ""}. Build to it. Let the kindnesses be warm and specific so the reader trusts them; then slow right down for the turn — short sentences, the line ${tu.m.by} said, nothing after it but how it ended.`] : []; })(),
  ].join("\n");
}
