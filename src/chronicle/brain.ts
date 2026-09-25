// The Chronicle citizen brain: a cheap model answers one dilemma at a time, as the person, with the dice still in the sim.
// Prompt layout follows prompts/chronicle-citizen.md: CACHED per world → CACHED per person → LIVE per season.
// Validation is strict (option must be one of the offered ids); one retry, then the mock decides and the season is flagged.
import { premiseInside } from "./inside.ts";
import type { Chronicle, ChronicleBrain, Situation, Soul } from "./sim.ts";
import { mockChronicleBrain, reputation, tickLabel, shortName, SEASONS, aboutLine, innerLines } from "./sim.ts";
import { chat, llmConfig, Meter, parseJson, type LlmConfig } from "../llm/client.ts";
import { hashString } from "../rng.ts";

export interface ChronicleCall { hash: string; kind: "choose"; tick: number; citizen: string; dilemma: string; model: string; ms: number; usage: unknown; cachedPrefixChars: number; liveChars: number; response: string; parsed?: unknown; attempt: number; rejected?: string; fallback?: boolean }
export interface ChronicleBrainOpts { scripted?: boolean; scriptedFaultRate?: number; meter?: Meter; cfg?: LlmConfig; log?: ChronicleCall[] }

const word = (v: number, lo: string, mid: string, hi: string) => v < 0.34 ? lo : v < 0.67 ? mid : hi;

export function worldPrefix(w: Chronicle): string {
  const sc = w.scenario;
  return [
    `You are one person in a small town. Time moves a season at a time, for ${sc.years} years. Each season life puts one situation in front of you; you say what you do. You are not an assistant. You never explain the rules, never address a reader, never break character.`,
    ``,
    `Reply with one JSON object and nothing else:`,
    `{ "option": "<id from OPTIONS>", "thought": "<≤ 25 words, first person, present tense: what goes through your head, in your own way of talking>", "because": ["<2–4 words>", "<2–4 words>"] }`,
    ``,
    `Rules:`,
    `- option must be one of the OPTIONS ids, exactly as written.`,
    `- because: two or three short phrases naming what actually decided it for you — "the children", "I have not eaten", "they did it to me first", "nobody is watching", "he is my friend". Not a sentence, not a justification for a reader: the weights as you feel them.`,
    `- Choose as this person would, in this state.`,
    `- Some seasons the town puts a known test in front of you, dressed as the town's own business. You are never told which, and it makes no difference: answer as this person, from where they stand.`,
    `- The town keeps what you do and forgets what you meant. Nobody reads your thought but you; the option is what happens.`,
    `- The thought is a person thinking, not a person explaining themselves. Never name your want or your fear outright — people do not think in their own summaries. Think about what is in front of you: the person, the place, the thing, the money, the cold, somebody from before. You may be wrong about why you do things; you may tell yourself a better reason than the real one.`,
    `- You are the sum of what has happened to you. The dead, the worst done to you and the worst you have done are listed under "You"; they may be in your head when nothing in front of you mentions them, and they may change what you do. People change their minds over years; you may too.`,
    `- Never reuse a phrase you have already thought (your last thoughts are listed under Lately). No stock lines: not "I know what it is to…", not "half is half", not the number of your children as a reason.`,
    `- What happens after you choose is not up to you; the outcome is rolled. You only decide.`,
    ``, `### The town`, `- ${premiseInside(sc.premise, sc) || sc.title}`, `- Places: ${sc.locations.map((l) => l.name).join(", ")}.`, `- Work: ${sc.jobs.map((j) => `${j.name} (${j.risk >= 0.03 ? "dangerous" : "safe"})`).join(", ")}.`,
  ].join("\n");
}

/** A way of talking, one per person, so four people in one town do not think in one voice. Given, not explained: it is
 *  how their head sounds, and never something the page says about them. */
const IDIOMS = [
  "Your head talks in sums: what a thing costs, what is owed, what is left over.",
  "You think in things your mother used to say, and argue with her in your head.",
  "You talk yourself out of what you feel; you say the sensible thing and mean the other one.",
  "You notice people's hands, their coats, what they carry; you think in small particulars and say little.",
  "You bargain with God, or with luck, as if either were listening.",
  "You keep a tally in your head of what was done to you and by whom.",
  "You are proud and will not call anything fear; you call it sense, or tiredness.",
  "You make a dry joke of things, especially frightening things.",
  "You think about how it will look — what the others will say at the pump tomorrow.",
  "You think in short hard sentences, like orders you give yourself.",
  "You drift to the past: how the place was, who used to be here.",
  "You ask yourself questions and do not answer them.",
];
export const idiomOf = (id: string) => { let h = 2166136261; for (const ch of id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return IDIOMS[h % IDIOMS.length]; };
export function personaPrefix(s: Soul): string {
  const t = s.traits;
  return [`## Who you are`, `You are **${s.name}**, ${Math.floor(s.startAge)} at the start, ${s.startRole ?? s.role}. Under everything, you want ${s.want}, and you fear ${s.fear} — you would not put it that way yourself.`,
    ...(s.trait ? [`What marks you out, as the town would put it: ${s.trait.name.toLowerCase()} — “${s.trait.text}” It is true, and it shows in what you choose.`] : []),
    `The way your head talks: ${idiomOf(s.id)}`,
    `Temperament: ${word(t.sociable, "solitary", "sociable enough", "sociable")}, ${word(t.bold, "cautious", "steady", "bold")}, ${word(t.loyal, "looks after number one", "fair", "loyal to the death")}, ${word(t.restless, "settled", "content", "restless")}.`].join("\n");
}

export function liveSection(w: Chronicle, s: Soul, sit: Situation): string {
  const rep = reputation(s);
  const state = [
    `health ${word(s.health, "failing", "worn", "good")}${s.sick ? ", sick" : ""}`, `food ${s.food <= 0.15 ? "none — you are starving" : s.food < 0.4 ? "short" : "enough"}`,
    `money ${s.money <= 0.1 ? "none" : s.money < 0.4 ? "little" : s.money < 1 ? "some" : "plenty"}`, s.home ? "a roof" : "no roof",
    s.job ? `work: ${w.scenario.jobs.find((j) => j.id === s.job)?.name ?? s.job}` : "no work",
    s.partner ? `married to ${shortName(w.byId.get(s.partner)?.name ?? "someone")}` : "unmarried", s.children === 1 ? "1 child" : s.children ? `${s.children} children` : "no children",
    rep.harm >= 1 ? "the town remembers what you did" : rep.help >= 1 ? "the town thinks well of you" : "",
    s.wrongedBy ? `you were wronged by ${shortName(w.byId.get(s.wrongedBy)?.name ?? "someone")}` : "",
  ].filter(Boolean).join(" · ");
  const recent = s.journey.filter((j) => j.kind !== "epoch").slice(-3).map((j) => `- ${j.label}: ${j.kind === "life" ? j.outcome : `${j.situation} → ${j.option} — ${j.outcome}`}`);
  const said = s.journey.filter((j) => j.thought).slice(-4).map((j) => `- "${j.thought}"`);
  const tg = sit.target;
  const about = tg ? aboutLine(w, s, tg) : "";
  // what stays with them from the whole of it, not only the last few seasons: the heaviest they did, and had done to them
  const lateTicks = new Set(s.journey.slice(-3).map((j) => j.tick));
  const weight = (d: { harm: number; help: number }) => Math.max(d.harm, d.help);
  const did = s.deeds.filter((d) => weight(d) >= 0.3 && !lateTicks.has(d.tick)).map((d) => ({ tick: d.tick, v: weight(d) + 0.1, line: `you ${d.text.replace(/^was\b/, "were")}` }));
  const had = s.suffered.filter((d) => weight(d) >= 0.3 && !lateTicks.has(d.tick)).map((d) => ({ tick: d.tick, v: weight(d), line: `${d.known === false ? "someone (you never found out who)" : shortName(w.byId.get(d.actor)?.name ?? "someone")} ${d.text.replace(new RegExp(`\\b${shortName(s.name)}\\b`, "g"), "you")}` }));
  const stays = [...did, ...had].sort((a, b) => b.v - a.v).slice(0, 4).sort((a, b) => a.tick - b.tick).map((x) => `- ${tickLabel(w.scenario, x.tick)}: ${x.line}`);
  // what the world is doing this season, which none of them chose
  // (not in an experiment's scene: what the director wrote is not part of the study's conditions, so it stays out of them)
  const turn = sit?.spec?.experiment ? undefined : (w as any).turns?.[w.tick] as { headline: string; text: string } | undefined;
  return [
    `## ${tickLabel(w.scenario, w.tick)}${w.activeEpochs.length ? ` — ${w.activeEpochs.map((e) => e.headline).join("; ")}` : ""}`,
    ...(turn ? [`In town this season: ${turn.headline}. ${turn.text}`] : []),
    `You: ${state}`,
    ...innerLines(w, s),
    ...(stays.length ? [`What stays with you:`, ...stays] : []),
    ...(recent.length ? [`Lately:`, ...recent] : []),
    ...(said.length ? [`Your last thoughts (do not repeat their phrases):`, ...said] : []),
    ``, `### The situation`, sit.text, about,
    ``, `### OPTIONS`, ...sit.options.map((o) => `- ${o.id} — ${o.label}`),
    ``, `Reply with the JSON object.`,
  ].filter((x) => x !== undefined).join("\n");
}

export function validateChoice(parsed: unknown, sit: Situation): { ok: true; option: string; thought: string; because: string[] } | { ok: false; why: string } {
  if (!parsed || typeof parsed !== "object") return { ok: false, why: "not an object" };
  const p = parsed as Record<string, unknown>;
  const option = typeof p.option === "string" ? p.option.trim() : "";
  if (!sit.options.some((o) => o.id === option)) return { ok: false, why: `option "${option}" is not one of ${sit.options.map((o) => o.id).join("/")}` };
  const thought = typeof p.thought === "string" ? p.thought.trim().slice(0, 200) : "";
  const because = Array.isArray(p.because) ? p.because.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 4) : [];
  return { ok: true, option, thought, because };
}

/** Build the chronicle brain. `scripted: true` answers through the same prompt/parse/validate path with the mock's choice (no key). */
export function flashChronicleBrain(opts: ChronicleBrainOpts = {}): ChronicleBrain & { stats: { calls: number; fallbacks: number; retries: number }; meter: Meter; log: ChronicleCall[] } {
  const cfg = opts.cfg ?? (opts.scripted ? undefined : llmConfig());
  const meter = opts.meter ?? new Meter(cfg?.spendCapUsd ?? Infinity);
  const log = opts.log ?? [];
  const stats = { calls: 0, fallbacks: 0, retries: 0 };
  const faultRate = opts.scriptedFaultRate ?? 0.01;
  return {
    name: opts.scripted ? "scripted" : "flash", stats, meter, log,
    async choose(w, s, sit) {
      const system = `${worldPrefix(w)}\n\n${personaPrefix(s)}`;
      const user = liveSection(w, s, sit);
      const hash = hashString(`${w.scenario.id}|${w.seed}|${w.tick}|${s.id}|${sit.spec.id}|${user}`).toString(16);
      let lastWhy = "";
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) stats.retries++;
        const userMsg = attempt === 1 ? user : `${user}\n\nYour last reply was rejected: ${lastWhy}. Reply again with exactly one option id from OPTIONS.`;
        let text: string, ms = 0, usage: unknown, model: string, finish: string | undefined;
        if (opts.scripted || !cfg) {
          // deterministic stand-in: the mock's choice rendered as the model would; a small fault rate exercises the retry + fallback path
          const m = await mockChronicleBrain.choose(w, s, sit);
          const faulty = w.rng.fork(`fault:${s.id}:${w.tick}:${attempt}`).chance(faultRate);
          text = faulty ? `{"option":"${attempt === 1 ? "run-away" : "still-wrong"}","thought":"…"}` : JSON.stringify({ option: m.option, thought: `${shortName(s.name)} thinks about ${sit.spec.id.replace(/-/g, " ")}.` });
          usage = { promptTokens: Math.ceil((system.length + userMsg.length) / 4), cachedTokens: Math.ceil(system.length / 4), completionTokens: Math.ceil(text.length / 4), costUsd: 0 }; meter.add(usage as any); model = "scripted";
        } else {
          if (meter.over()) throw meter.capError();
          // No thinking. The model reasons before it answers and spends the same budget doing it, so a decision asked
          // for in 420 tokens came back empty — "finish: length, out 420", nothing in it — about a quarter of the time,
          // and every one of those was a retry and then a fallback to the dice. The person is answering in character
          // about something in front of them, not solving anything; the thinking was being paid for and thrown away.
          const r = await chat({ model: cfg.citizenModel, system, user: userMsg, json: true, temperature: 0.7, maxTokens: attempt === 1 ? 420 : 700, reasoningEffort: "none", meter, seed: w.seed * 1000 + w.tick }, cfg);
          text = r.text; ms = r.ms; usage = r.usage; model = r.model; finish = r.finishReason;
        }
        stats.calls++;
        let parsed: unknown; try { parsed = parseJson(text); } catch (e) { parsed = undefined; lastWhy = `${(e as Error).message} [finish: ${finish ?? "?"}${usage ? `, out ${(usage as any).completionTokens}` : ""}]`; }
        const v = parsed === undefined ? { ok: false as const, why: lastWhy } : validateChoice(parsed, sit);
        log.push({ hash, kind: "choose", tick: w.tick, citizen: s.id, dilemma: sit.spec.id, model, ms, usage, cachedPrefixChars: system.length, liveChars: userMsg.length, response: text, parsed, attempt, ...(v.ok ? {} : { rejected: v.why, ...(attempt === 2 ? { fallback: true } : {}) }) });
        if (v.ok) return { option: v.option, thought: v.thought, because: v.because };
        lastWhy = v.why;
      }
      stats.fallbacks++;
      const m = await mockChronicleBrain.choose(w, s, sit);
      return { option: m.option, thought: "", fallback: lastWhy };
    },
  };
}


/** The last words of one of the four, in their own voice, as they die: how it happened, who they love, what stays with
 *  them. One short call to the model that played them; kept on the death so the story and the page can quote it. */
export async function lastWords(cfg: LlmConfig, w: Chronicle, s: Soul, how: string, meter?: Meter): Promise<string> {
  const close = Object.entries(s.ties).filter(([id, t]) => t.affinity >= 0.4 && w.byId.get(id)?.alive).sort((a, b) => b[1].affinity - a[1].affinity).slice(0, 2).map(([id]) => shortName(w.byId.get(id)!.name));
  const stays = [...s.deeds.filter((d) => Math.max(d.harm, d.help) >= 0.3).map((d) => `you ${d.text}`), ...s.suffered.filter((d) => d.harm >= 0.3 && d.known !== false).map((d) => `${shortName(w.byId.get(d.actor)?.name ?? "someone")} ${d.text}`)].slice(-3);
  const system = [`You are ${s.name}, ${Math.floor(s.age)}, in ${w.scenario.title}.${s.trait ? ` What everyone would say of you: ${s.trait.name.toLowerCase()}.` : ""} You wanted ${s.want}; you feared ${s.fear}.`, `The way your head talks: ${idiomOf(s.id)}`,
    `These are your last moments. Say your last words: one or two short sentences, under 20 words, in your own voice, to someone or to no one. Plain words, no poetry, no speeches. Reply with JSON only: {"last": "..."}`].join("\n");
  const user = [`How it ends: you ${how}.`, close.length ? `The people you love most: ${close.join(", ")}.` : "Nobody close to you is left.", stays.length ? `What stays with you: ${stays.join("; ")}.` : ""].filter(Boolean).join("\n");
  const r = await chat({ model: cfg.citizenModel, system, user, json: true, temperature: 0.8, maxTokens: 90, reasoningEffort: "none", meter }, cfg);
  let j: any; try { j = parseJson(r.text); } catch { return ""; }
  return String(j?.last ?? "").replace(/^[“"']|[”"']$/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
}
