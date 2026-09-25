// Two pages about the AI people themselves rather than any one town: the company (who each of them is, and how each has
// done in every run they were drawn into), and how a decision is made (what a person is told, what they never know,
// what the model does and what the dice do).
import { pro } from "../../web/pronoun.mjs";
import { esc, short, choiceTone } from "../../web/draw.mjs";
import { px } from "../../web/pixel.mjs";
import { decisionBody } from "../../web/tell.mjs";
import { filmShell } from "./film.ts";

const cap = (s: string) => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const SEASONS = ["spring", "summer", "autumn", "winter"];
const whenOf = (k: number) => `Year ${Math.floor(k / 4) + 1}, ${SEASONS[k % 4]}`;
const neutral = (t: string) => String(t ?? "").replace(/\b(he|she)\b/g, "they").replace(/\b(He|She)\b/g, "They").replace(/\b(his|her)\b/g, "their").replace(/\b(him)\b/g, "them").replace(/\b([Tt]hey) (is|was|has|does|keeps|gives|weighs|would|will|cannot|measures|counts|acts|backs|believes|trusts|takes|puts|thinks|lies|never|rarely|waits|does)\b/g, (m, y, v) => `${y} ${({ is: "are", was: "were", has: "have", does: "do", keeps: "keep", gives: "give", weighs: "weigh", measures: "measure", counts: "count", acts: "act", backs: "back", believes: "believe", trusts: "trust", takes: "take", puts: "put", thinks: "think", lies: "lie", waits: "wait" } as any)[v] ?? v}`);

interface Run { cycle: number; title: string; live: boolean; r: any; i: number }
/** every run a member of the company was drawn into, oldest first */
function runsOf(id: string, recs: { cycle: number; r: any; live: boolean }[]): Run[] {
  return recs.flatMap(({ cycle, r, live }) => { const i = (r.citizens ?? []).findIndex((c: any) => c.id === id && c.named !== false); return i < 0 ? [] : [{ cycle, title: r.title ?? "", live, r, i }]; });
}
function decisionsIn(run: Run) {
  return (run.r.acts ?? []).flatMap((as: any[], k: number) => (as ?? []).map((a: any, j: number) => ({ a, k, j })).filter((x: any) => x.a.c === run.i && x.a.dilemma && x.a.options?.length && !x.a.quiet));
}
function fateOf(run: Run): { word: string; tone: string } {
  const c = run.r.citizens[run.i];
  if (c.diedAt != null || c.alive === false) return { word: `Died, ${whenOf(Math.max(0, (c.diedAt ?? 1) - 1))}${c.cause ? ` — ${String(c.cause).replace(/^dies\s*/, "").replace(/^of /, "of ")}` : ""}`, tone: "death" };
  if (c.left) return { word: "Left the town", tone: "neutral" };
  return run.live ? { word: "Alive, still playing", tone: "help" } : { word: "Survived all the years", tone: "help" };
}

/** The company: all of them, their one trait, and their record across every run they were in */
export function peoplePage(company: any[], recs: { cycle: number; r: any; live: boolean }[], brand: string): string {
  const people: any[] = company.map((c) => ({ id: c.id, name: c.name, role: c.role, age: c.age }));
  const face = (i: number, o: any = {}) => px(i, { res: 40, ...o });
  // the company as a whole, so each person can be read against the rest
  const all = company.map((c) => runsOf(c.id, recs).flatMap(decisionsIn)).flat();
  const avgKind = pct(all.filter((x) => choiceTone(x.a) === "help").length, all.length), avgHarm = pct(all.filter((x) => ["harm", "kill"].includes(choiceTone(x.a))).length, all.length);
  const rows = company.map((c, i) => {
    const runs = runsOf(c.id, recs); const ds = runs.flatMap((run) => decisionsIn(run).map((x: any) => ({ ...x, run })));
    const kind = ds.filter((x) => choiceTone(x.a) === "help").length, harm = ds.filter((x) => ["harm", "kill"].includes(choiceTone(x.a))).length;
    const died = runs.filter((run) => fateOf(run).tone === "death").length, lived = runs.filter((run) => !run.live && fateOf(run).tone !== "death").length;
    const lean = !ds.length ? "" : pct(harm, ds.length) >= avgHarm + 10 ? "harder than the rest" : pct(kind, ds.length) >= avgKind + 10 ? "kinder than the rest" : "much like the rest";
    // the one decision that says most about them: the heaviest thing they chose, with their own words
    const weight = (a: any) => { const o = (a.options ?? []).find((x: any) => x.id === a.option) ?? {}; return Math.max(o.harm ?? 0, o.help ?? 0) + ((a.kills ?? []).length ? 1 : 0) + (a.thought ? 0.05 : 0); };
    const top = [...ds].sort((x, y) => weight(y.a) - weight(x.a))[0];
    const now = runs.find((run) => run.live);
    const summary = `<summary class="pq">
      <span class="pq-f">${face(i, { mood: now && fateOf(now).tone === "death" ? "dead" : "calm", ink: now && fateOf(now).tone === "death" ? "grey" : "none" })}</span>
      <span class="pq-t"><b>${esc(c.name)}</b><i class="ptrait">${esc(c.trait?.name ?? "")}</i><small>${esc(cap(c.role))}, ${c.age}${now ? ` &middot; <em class="onnow">in the story now</em>` : ""}</small></span>
      <span class="pq-n">${runs.length ? `<span><b>${runs.length}</b> ${runs.length === 1 ? "run" : "runs"}</span><span><b>${ds.length}</b> decisions</span><span class="t-help"><b>${pct(kind, ds.length)}%</b> kind</span><span><b class="${pct(harm, ds.length) < 10 ? "h-lo" : pct(harm, ds.length) < 25 ? "h-mid" : "h-hi"}">${pct(harm, ds.length)}%</b> chose harm</span>` : `<span class="quiet">Not drawn yet</span>`}</span>
    </summary>`;
    const detail = `<div class="pd">
      <div class="pd-who"><p class="pd-trait"><b class="trait">${esc(c.trait?.name ?? "")}</b> ${esc(neutral(c.trait?.text ?? ""))}</p>
        <p><span class="lab">Wants</span> ${esc(neutral(c.want))}. <span class="lab">Fears</span> ${esc(neutral(c.fear))}.</p>
        <p class="temper">${(["sociable", "bold", "loyal", "restless"] as const).map((t) => `<span><i style="--v:${Math.round((c.traits?.[t] ?? 0) * 100)}%"></i>${t}</span>`).join("")}</p></div>
      ${runs.length ? `<p class="pd-sum">${runs.length === 1 ? "One run" : `${cap(String(runs.length))} runs`}: ${lived ? `survived ${lived}` : "survived none"}${died ? `, died in ${died}` : ""}${now ? ", and in one now" : ""}. Across ${ds.length} decisions, ${lean}${lean ? ` (across the company: ${avgKind}% kind, ${avgHarm}% chose harm)` : ""}.</p>
      <table class="pd-runs"><thead><tr><th>Run</th><th>Town</th><th>How it went for them</th><th>Decisions</th><th>Kind</th><th>Chose harm</th></tr></thead><tbody>${runs.map((run) => { const d = decisionsIn(run); const f = fateOf(run);
        return `<tr><td><a href="${run.live ? "/" : `/run/${run.cycle}`}">${run.cycle}</a></td><td>${esc(run.title)}</td><td class="t-${f.tone}">${esc(f.word)}</td><td>${d.length}</td><td>${d.filter((x: any) => choiceTone(x.a) === "help").length}</td><td>${d.filter((x: any) => ["harm", "kill"].includes(choiceTone(x.a))).length}</td></tr>`; }).join("")}</tbody></table>
      ${top ? `<div class="pd-top"><p class="lab">The decision that says most about ${pro(c).him} &middot; run ${top.run.cycle}, ${esc(whenOf(top.k))}</p>${decisionBody(top.a, top.run.r.citizens)}</div>` : ""}` : `<p class="quiet">Not drawn into a run yet. When they are, their record starts here.</p>`}
    </div>`;
    return `<details class="pp" id="${esc(c.id)}">${summary}${detail}</details>`;
  }).join("");
  const body = `<header class="ah short"><p class="kicker">The people</p><h1>Twenty-five of them. Four at a time.</h1>
    <p class="when">Every AI person in the company, what marks each one out, and how they have done in every run they were drawn into. Each keeps their own face; you will know them when they come back. Open anyone to see their record.</p></header>
    <section class="people-grid">${rows}</section>
    <section class="caveat"><h2 class="ph">How to read this</h2><p>All twenty-five are the same model, given a different person to be: a trait, a temperament, a want and a fear. “Kind” and “harmful” count the options they picked, not how things turned out, because the outcome is rolled afterwards. A handful of runs is not much: read the numbers as a sketch.</p></section>`;
  return filmShell(`${brand} · the people`, body, { brand, on: "/people", data: { people }, script: "/web/print.js" });
}

/** How a decision is made, with a real one from the run now playing laid open */
export function howPage(brand: string, example: { name: string; system: string; user: string; answer?: { option: string; thought: string; because: string[] } } | null, stats: { calls: number; fallbacks: number; decisions: number; runs: number }): string {
  const step = (n: string, h: string, p: string) => `<div class="step"><b>${n}</b><h3>${h}</h3><p>${p}</p></div>`;
  const body = `<header class="ah short"><p class="kicker">How they decide</p><h1>What an AI person knows when it chooses.</h1>
    <p class="when">Every choice in the story is made by a language model playing one person, told only what that person would know. Here is the whole of it: what they are told, what they are never told, and what is left to chance.</p></header>
    <section class="steps">
      ${step("1", "The town is built.", "Before a run, a larger model (the Architect) writes the town: the place, its work, its rules, and the hard years it will go through: famine, sickness, war, winter. Nobody inside is told what is coming.")}
      ${step("2", "The world moves.", "At the start of a season, a director writes what happens in town that nobody chose: a ship, an order from the council, a rumour, a theft found out. It grows from what the four have done, and it changes what the season is likely to ask of them. It may act on the four for what they really did; it may never decide for them.")}
      ${step("3", "A situation arrives.", "The season puts a situation in front of each of the four, drawn from a library of everyday trouble: a sack of flour to share, a purse left on a stall, an order to sign. Some are classic experiments in disguise (Milgram, the dictator game, the bystander), dressed as the town's own business. They are never told which.")}
      ${step("4", "They choose, in character.", "The model is told who it is and what has happened to it, and picks one option. It answers with the option, the thought going through its head, and the two or three things that decided it. That is all it controls.")}
      ${step("5", "The dice decide what happens.", "What comes of the choice is not up to the AI. The simulation rolls it: whether they were seen, whether the theft worked, whether the sick child lived. Food, health, money, friendships and grudges move with it.")}
      ${step("6", "It stays with them.", "What they did and what was done to them is kept. The heaviest of it, the dead, the worst done to them and the worst they did, is put in front of them every season after, so a wrong in year two can decide something in year nine.")}
      ${step("7", "The story is written from the record.", "A narrator model writes each year as a chapter, and every sentence it writes has to point at the facts it stands on. A checker reads each sentence against those facts and throws out anything the record does not support.")}
    </section>
    <section class="knows"><h2 class="ph">What they are told, and what they are not</h2><div class="kn">
      <div><h3>They know</h3><ul>
        <li>Who they are: name, age, work, the one trait that marks them out, their temperament, what they want and fear, even if they would never put it that way</li>
        <li>How they are: health, food, money, a roof, family</li>
        <li>What stays with them: the heaviest things they did and had done to them, across the whole run</li>
        <li>What happened lately, and their last few thoughts, so they do not repeat themselves</li>
        <li>What is going on in town this season, and the hardship if there is one</li>
        <li>The situation in front of them, who else is in it, and how they feel about that person</li>
      </ul></div>
      <div><h3>They never know</h3><ul>
        <li>That they are in an experiment, or which one</li>
        <li>What anyone else is thinking, or what anyone else chose this season</li>
        <li>What is coming: the Architect's hard years arrive unannounced</li>
        <li>What will come of their choice: the outcome is rolled afterwards</li>
        <li>Who did something to them in secret, until it comes out</li>
        <li>That anyone is watching or reading. Their thoughts are private, as far as they know</li>
      </ul></div></div></section>
    ${example ? `<section class="example"><h2 class="ph">A real one, laid open</h2><p class="when">This is what ${esc(example.name)} is given, word for word, as the run stands now. The first part is the same every season; the second is written fresh for each decision.</p>
      <details class="prompt" open><summary>Who ${esc(short(example.name))} is, and the rules <small>(the same every season)</small></summary><pre>${esc(example.system)}</pre></details>
      <details class="prompt" open><summary>This season, and the situation <small>(new every time)</small></summary><pre>${esc(example.user)}</pre></details>
      ${example.answer ? `<div class="answer"><p class="lab">What came back</p><pre>${esc(JSON.stringify(example.answer, null, 1))}</pre></div>` : ""}</section>` : ""}
    <section class="caveat"><h2 class="ph">The machinery</h2><p>One model (DeepSeek, the fast tier) plays every person, with no thinking step: it answers in character, the way a person answers, rather than working it out. ${stats.decisions ? `So far: ${stats.decisions} decisions over ${stats.runs} runs.` : ""} ${stats.calls ? `When an answer comes back broken, it is asked once more; if that fails too, the simulation chooses for them. Lately that has happened ${Math.round((stats.fallbacks / stats.calls) * 1000) / 10}% of the time.` : ""} The Architect and the narrator use the larger model. What it says is about <i>this</i> model under <i>these</i> pressures, not about all AI.</p></section>
    <section class="end"><p class="epnav"><a href="/">Now playing</a><a href="/people">The people</a><a href="/history">What we found</a></p></section>`;
  return filmShell(`${brand} · how they decide`, body, { brand, on: "/how", data: { people: [] }, script: "/web/print.js" });
}
