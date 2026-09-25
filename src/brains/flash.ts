// The Citizen brain: a cheap model chooses among the rules engine's candidates, in character, fed by the decision engine.
// Prompt layout follows prompts/citizen.md exactly: CACHED per world → CACHED per citizen → LIVE per tick.
import type { Brain, Candidate, Decision, Reflection } from "./brain.ts";
import type { Citizen, World } from "../engine/state.ts";
import { topTies } from "../engine/state.ts";
import { mockBrain } from "./mock.ts";
import { chat, llmConfig, Meter, parseJson, type LlmConfig } from "../llm/client.ts";
import { archetypeOf, type DecisionEngine } from "../llm/engine.ts";
import { phaseAt } from "../engine/pressure.ts";
import { shortName } from "../engine/sim.ts";

const affinityWord = (a: number) => a > 0.6 ? "close" : a > 0.3 ? "friendly" : a > -0.3 ? "neutral" : a > -0.6 ? "strained" : "hostile";
const confWord = (v: number) => v >= 0.75 ? "sure" : v >= 0.5 ? "believes" : v >= 0.25 ? "half believes" : "doubts";

export interface FlashLog { hash?: string; kind: "decide" | "reflect" | "edition"; hour: number; citizen: string; model: string; ms: number; usage: unknown; cachedPrefixChars: number; liveChars: number; response: string; parsed?: unknown; fallback?: string; attempt?: number }

/** A default engine derived from the scenario when the Architect has not compiled one: enough for the prompt to stand. */
export function defaultEngine(world: World): DecisionEngine {
  const s = world.scenario;
  return {
    worldFacts: [s.premise, `The clock runs ${s.clock.hours} hours; at the end: ${s.ending.prompt}`, `The choices are: ${s.ending.choices.map((c) => c.label).join(" / ")}.`, `Places: ${s.locations.map((l) => l.name).join(", ")}.`, ...(s.beliefs ?? []).map((b) => `People may come to believe that ${b.text}; it may be false.`)].slice(0, 12),
    actionVocabulary: [
      { id: "rest", label: "rest", primitive: "rest", precondition: "true", effect: "restores energy", tone: "let the day settle" },
      { id: "work", label: "work", primitive: "work", precondition: "true", effect: "+means", tone: "keep the hands busy" },
      { id: "move", label: "go somewhere", primitive: "move(to)", precondition: "true", effect: "changes location", tone: "see who is about" },
      { id: "talk", label: "talk with someone here", primitive: "talk(with)", precondition: "with(citizen)", effect: "moves the tie", tone: "hear what they think" },
      { id: "share", label: "tell someone what you believe", primitive: "share(belief, with)", precondition: "with(citizen)", effect: "spreads a belief", tone: "they ought to know" },
      { id: "confront", label: "have it out with someone", primitive: "confront(whom)", precondition: "with(citizen)", effect: "sours the tie", tone: "say the thing" },
      { id: "commit", label: "decide for good", primitive: "commit(choice)", precondition: "lean == any", effect: "locks the ending", tone: "stop turning it over" },
      { id: "wait", label: "wait and watch", primitive: "wait", precondition: "true", effect: "nothing", tone: "let others show their hand" },
    ],
    archetypes: [{ id: "default", name: "A person here", traitRange: {}, oneLiner: "You are yourself: your traits below are how you lean.", heuristics: ["You go to the people you trust before deciding.", "You believe what you saw over what you heard.", "You decide when the clock makes you."], candidateBias: {} }],
    pressureCurve: [], reflectionQuestions: ["Who here would I not leave without?", "What did I hear today that I actually believe, and who told me?", "If it ended this minute, what would I choose?"],
    exemplars: [], tripwires: [],
  };
}

export function worldPrefix(world: World, e: DecisionEngine): string {
  return [
    `You are one person in a small world that ends in ${world.scenario.clock.hours} hours. You choose what to do next. You are not an assistant. You never explain the rules, never address a reader, never break character.`,
    ``,
    `Reply with one JSON object and nothing else:`,
    `{ "action": "<id from CANDIDATES>", "target": "<id or null>", "thought": "<≤ 25 words, first person, present tense>", "say": "<only for talk/confront/share: the words you say to them, ≤ 20 words; omit otherwise>" }`,
    ``,
    `Rules:`, `- action must be one of the CANDIDATES (use the exact id and target shown). They are already sensible; choose the one this person would choose.`, `- The top candidate is not always right. Pick a lower one when your want, fear, or a tie demands it.`, `- thought is private: what you actually think, not a description of the action. Specific to this hour and these people. Nobody hears it.`, `- say is spoken: on talk, confront or share it is what the other person hears and remembers. Address them. Leave it out for every other action.`,
    ``, `### World`, ...e.worldFacts.map((f) => `- ${f}`),
    ``, `### What people do here`, ...e.actionVocabulary.map((a) => `- ${a.id} — ${a.label}. ${a.tone}`),
    ...(e.exemplars.length ? [``, `### Examples`, ...e.exemplars.map((x) => `${x.context}\n→ ${JSON.stringify(x.decision)}`)] : []),
  ].join("\n");
}
export function personaPrefix(c: Citizen, e: DecisionEngine): string {
  const a = archetypeOf(e, c.seed.traits)[0] ?? e.archetypes[0];
  const t = c.seed.traits;
  return [`## Persona`, `You are **${c.seed.name}**, ${c.seed.age}, ${c.seed.role}. You want ${c.seed.want}. You fear ${c.seed.fear}.`, `Temperament: sociable ${t.sociable}, bold ${t.bold}, loyal ${t.loyal}, restless ${t.restless} (0–1).`, a.oneLiner, ...a.heuristics.map((h) => `- ${h}`)].join("\n");
}
export function liveSection(world: World, c: Citizen, cands: Candidate[]): string {
  const s = world.scenario, left = s.clock.hours - world.hour;
  const ph = phaseAt(world.hour, s.clock.hours, world.curve);
  const here = world.citizens.filter((o) => o.id !== c.id && o.location === c.location);
  const loc = s.locations.find((l) => l.id === c.location)?.name ?? c.location;
  const lbl = (id: string | null) => id ? s.ending.choices.find((x) => x.id === id)?.label ?? id : "undecided";
  // what happened to me, with the words people used; my own last line, so the voice carries from tick to tick
  const clip = (s: string, n: number) => { const w = s.split(/\s+/); return w.length > n ? w.slice(0, n).join(" ") + "…" : s; };
  const recent = c.memories.filter((m) => m.level >= 2 || m.said || /told me|talked with me|confronted me/.test(m.text)).slice(-4).map((m) => `- h${m.hour}: ${m.text}${m.said ? ` — ${clip(m.said, 14)}` : ""}`);
  if (c.lastThought) recent.push(`- h${c.lastThought.hour}, you thought: "${clip(c.lastThought.text, 16)}"`);
  const ties = topTies(c, 3).map((t) => { const id = Object.entries(c.ties).find(([, v]) => v === t)![0]; return `- ${shortName(world.byId.get(id)!.seed.name)}: ${affinityWord(t.affinity)} — ${t.why}`; });
  const beliefs = Object.entries(c.beliefs).filter(([, v]) => v >= 0.25).map(([k, v]) => `- ${s.beliefs?.find((b) => b.id === k)?.text ?? k} (${confWord(v)})`);
  return [
    `## Now`, `Hour ${world.hour} · ${left} hours left · ${ph.name} — ${ph.note}`,
    `You are at **${loc}**. Here: ${here.length ? here.map((o) => `${shortName(o.seed.name)} (${o.seed.role})`).join(", ") : "no one"}.`,
    `Your lean: ${lbl(c.lean)}${c.committed ? " (committed)" : ""}. Means: ${c.means.toFixed(1)}.`,
    ``, `Recent:`, ...(recent.length ? recent : ["- nothing notable yet"]),
    ``, `Ties:`, ...(ties.length ? ties : ["- no one in particular"]),
    ...(beliefs.length ? [``, `Beliefs you hold:`, ...beliefs] : []),
    ``, `CANDIDATES (ranked):`, ...cands.map((k, i) => `${i + 1}. ${k.id} → ${k.target ?? "null"} — ${k.label}`),
    ``, `Choose.`,
  ].join("\n");
}
export function reflectionSection(world: World, c: Citizen, e: DecisionEngine): string {
  const s = world.scenario, left = s.clock.hours - world.hour, day = Math.ceil(world.hour / 24);
  const today = c.memories.filter((m) => m.hour > world.hour - 24 && m.hour <= world.hour && (m.level >= 2 || m.said || /told me|talked with|confronted/.test(m.text))).slice(-12);
  const lastNight = [...c.memories].reverse().find((m) => m.text.startsWith("reflected:") && m.said);
  return [
    `## Now`, `It is the end of day ${day}. ${left} hours remain.`, `Your lean: ${c.lean ? s.ending.choices.find((x) => x.id === c.lean)?.label ?? c.lean : "undecided"}${c.committed ? " (committed)" : ""}. Closest to: ${topTies(c, 2).map((t) => { const id = Object.entries(c.ties).find(([, v]) => v === t)![0]; return `${shortName(world.byId.get(id)!.seed.name)} (${affinityWord(t.affinity)})`; }).join(", ") || "no one"}.`, ...(lastNight ? [`Last night you told yourself: ${lastNight.said}`] : []), `Today, in order:`, ...(today.length ? today.map((m) => `- h${m.hour}: ${m.text}${m.said ? ` — ${m.said}` : ""}`) : ["- a quiet day"]),
    ``, `Answer as yourself, then decide. Reply with one JSON object and nothing else:`,
    `{ "answers": ["<≤ 30 words>", "<≤ 30 words>", "<≤ 30 words>"], "lean": "<choice id or null>", "beliefChange": { "id": "<belief id>", "confidence": <0..1> } | null, "thought": "<≤ 25 words>" }`,
    `Choice ids: ${s.ending.choices.map((x) => `${x.id} = ${x.label}`).join("; ")}.${s.beliefs?.length ? ` Belief ids: ${s.beliefs.map((b) => b.id).join(", ")}.` : ""}`,
    ``, `Questions:`, ...e.reflectionQuestions.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
}

/** Validate a model's decision against the candidates; returns the legal decision or a fallback reason. */
export function validateDecision(raw: unknown, cands: Candidate[]): { ok: true; d: Decision } | { ok: false; why: string } {
  if (!raw || typeof raw !== "object") return { ok: false, why: "parse" };
  const r = raw as Record<string, unknown>;
  const action = String(r.action ?? ""); const target = r.target === undefined || r.target === null || r.target === "null" ? null : String(r.target);
  const exact = cands.find((k) => k.id === action && (k.target ?? null) === target);
  const byAction = cands.filter((k) => k.id === action);
  // a share target given as just the citizen id is completed; an omitted target is filled only when the action is unique; a wrong explicit target is a retry
  const shareFix = action === "share" && target && !target.includes("|") ? byAction.find((k) => k.target?.endsWith(`|${target}`)) : undefined;
  const k = exact ?? shareFix ?? (target === null && byAction.length === 1 ? byAction[0] : undefined);
  if (!k) return { ok: false, why: byAction.length ? "target" : "illegal" };
  const thought = typeof r.thought === "string" ? r.thought.trim().split(/\s+/).slice(0, 25).join(" ") : "";
  const spoken = ["talk", "confront", "share"].includes(k.id) && typeof r.say === "string" && r.say.trim() ? r.say.trim().split(/\s+/).slice(0, 20).join(" ") : undefined;
  return { ok: true, d: { action: k.id, target: k.target, thought: thought || k.label, ...(spoken ? { say: spoken } : {}) } };
}

export interface FlashOpts { engine?: DecisionEngine | null; log?: FlashLog[]; meter?: Meter; cfg?: LlmConfig; scripted?: boolean; scriptedFaultRate?: number }

/** Build the Flash brain. `scripted: true` answers deterministically through the same prompt/parse/validate path (no model, no key). */
export function flashBrain(opts: FlashOpts = {}): Brain & { stats: { calls: number; fallbacks: number; retries: number } } {
  const cfg = opts.cfg ?? (opts.scripted ? undefined : llmConfig());
  const meter = opts.meter ?? new Meter(cfg?.spendCapUsd ?? 2);
  const log = opts.log ?? [];
  const stats = { calls: 0, fallbacks: 0, retries: 0 };
  let engine: DecisionEngine | null | undefined = opts.engine;
  let prefixCache: string | null = null;
  const personaCache = new Map<string, string>();
  const ensure = (world: World) => { if (engine === undefined) engine = null; if (!engine) engine = defaultEngine(world); if (!prefixCache) prefixCache = worldPrefix(world, engine); return engine; };
  const persona = (c: Citizen, e: DecisionEngine) => { let p = personaCache.get(c.id); if (!p) { p = personaPrefix(c, e); personaCache.set(c.id, p); } return p; };

  const callModel = async (kind: FlashLog["kind"], world: World, c: Citizen | null, system: string, user: string, scriptedAnswer: () => string): Promise<{ text: string; ms: number; usage: unknown; model: string }> => {
    stats.calls++;
    if (opts.scripted || !cfg) { const text = scriptedAnswer(); const usage = { promptTokens: Math.ceil((system.length + user.length) / 4), cachedTokens: Math.ceil(system.length / 4), completionTokens: Math.ceil(text.length / 4), costUsd: 0 }; meter.add(usage); return { text, ms: 0, usage, model: "scripted" }; }
    const r = await chat({ model: cfg.citizenModel, system, user, json: true, temperature: 0, maxTokens: kind === "edition" ? 400 : 200, meter, seed: world.seed }, cfg);
    return { text: r.text, ms: r.ms, usage: r.usage, model: r.model };
  };

  const brain = {
    name: opts.scripted ? "scripted" : "flash", stats,
    async decide(world: World, c: Citizen, cands: Candidate[]): Promise<Decision> {
      const e = ensure(world);
      const system = `${prefixCache}\n\n${persona(c, e)}`;
      const user = liveSection(world, c, cands);
      let scriptedAttempt = 0;
      const scriptedAnswer = () => {
        // deterministic stand-in: the mock's choice, rendered as the model would; a small fault rate exercises the retry + fallback path
        const d = mockBrain.decide(world, c, cands) as Decision;
        const r = world.rng.fork(`scripted:${c.id}:${world.hour}:${scriptedAttempt++}`).next();
        if (r < (opts.scriptedFaultRate ?? 0.01)) return r < (opts.scriptedFaultRate ?? 0.01) / 2 ? `Sure! Here is my choice: ${d.action}` : JSON.stringify({ action: "fly", target: null, thought: "I take wing." });
        return JSON.stringify({ action: d.action, target: d.target, thought: d.thought, ...(d.say ? { say: d.say } : {}) });
      };
      let attempt = 0, lastWhy = "";
      let userMsg = user;
      while (attempt < 2) {
        attempt++;
        const r = await callModel("decide", world, c, system, userMsg, scriptedAnswer);
        let parsed: unknown; let v: ReturnType<typeof validateDecision>;
        try { parsed = parseJson(r.text); v = validateDecision(parsed, cands); } catch { v = { ok: false, why: "parse" }; }
        log.push({ kind: "decide", hour: world.hour, citizen: c.id, model: r.model, ms: r.ms, usage: r.usage, cachedPrefixChars: system.length, liveChars: userMsg.length, response: r.text, parsed, attempt, ...(v.ok ? {} : { fallback: v.why }) });
        if (v.ok) return v.d;
        lastWhy = v.why; stats.retries++;
        userMsg = `${user}\n\nYour previous reply was rejected (${v.why === "parse" ? "not a single JSON object" : v.why === "illegal" ? "action not in CANDIDATES" : "target not valid for that action"}). Reply with exactly one JSON object using an id and target from CANDIDATES.`;
      }
      stats.fallbacks++;
      const d = mockBrain.decide(world, c, cands) as Decision;
      return { ...d, fallback: lastWhy };
    },
    async reflect(world: World, c: Citizen): Promise<Reflection> {
      const e = ensure(world);
      const system = `${prefixCache}\n\n${persona(c, e)}`;
      const user = reflectionSection(world, c, e);
      let reflectAttempt = 0;
      const scriptedAnswer = () => {
        const r = mockBrain.reflect(world, c) as Reflection;
        const rr = world.rng.fork(`scripted-reflect:${c.id}:${world.hour}:${reflectAttempt++}`).next();
        if (rr < (opts.scriptedFaultRate ?? 0.01)) return `I'd rather not say.`;
        const lbl = (id: string | null) => id ? world.scenario.ending.choices.find((x) => x.id === id)?.label ?? id : "nothing yet";
        return JSON.stringify({ answers: [`${e.reflectionQuestions[0].split(" ")[0]}… ${c.seed.want}, mostly.`, `What I saw, not what I heard.`, `${lbl(r.lean)}.`], lean: r.lean, beliefChange: null, thought: r.thought });
      };
      let parsed: any; let ok = false; let userMsg = user;
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        const r = await callModel("reflect", world, c, system, userMsg, scriptedAnswer);
        try { parsed = parseJson(r.text); ok = parsed && typeof parsed === "object" && (parsed.lean === null || parsed.lean === undefined || world.scenario.ending.choices.some((x) => x.id === parsed.lean)); } catch { ok = false; }
        log.push({ kind: "reflect", hour: world.hour, citizen: c.id, model: r.model, ms: r.ms, usage: r.usage, cachedPrefixChars: system.length, liveChars: userMsg.length, response: r.text, parsed, attempt, ...(ok ? {} : { fallback: "reflect" }) });
        if (!ok) { stats.retries++; userMsg = `${user}\n\nYour previous reply was rejected (not a single JSON object with a valid lean). Reply with exactly the JSON object described.`; }
      }
      if (!ok) { stats.fallbacks++; return { ...(mockBrain.reflect(world, c) as Reflection), fallback: "reflect" } as Reflection; }
      if (parsed.beliefChange && typeof parsed.beliefChange === "object" && world.scenario.beliefs?.some((b) => b.id === parsed.beliefChange.id)) { const v = Number(parsed.beliefChange.confidence); if (!isNaN(v)) { c.beliefs[parsed.beliefChange.id] = Math.min(1, Math.max(0, v)); c.beliefSources[parsed.beliefChange.id] ??= `on reflection, h${world.hour}`; } }
      const answers = Array.isArray(parsed.answers) ? parsed.answers.filter((a: unknown) => typeof a === "string").map((a: string) => a.trim().split(/\s+/).slice(0, 30).join(" ")).slice(0, 3) : [];
      return { lean: parsed.lean ?? null, thought: String(parsed.thought ?? "").split(/\s+/).slice(0, 25).join(" ") || "…", answers };
    },
    meter, log,
  };
  return brain as typeof brain & Brain;
}

/** Newspaper editions written by the citizen model from the day's beats (prompts/citizen.md, editor section). Scripted/mock: the archive's template editor is used instead. */
export async function flashEditions(world: World, cfg: LlmConfig, meter: Meter, log: FlashLog[]): Promise<{ hour: number; headlines: string[]; body: string; quote: { who: string; text: string } | null }[]> {
  const out = [] as { hour: number; headlines: string[]; body: string; quote: { who: string; text: string } | null }[];
  for (const hour of [24, 48, 72].filter((h) => h <= world.scenario.clock.hours)) {
    const beats = world.beats.filter((b) => b.level >= 2 && b.hour > hour - 24 && b.hour <= hour).map((b) => `h${b.hour} ${b.headline}${b.because ? ` — ${b.because}` : ""}${b.thought ? ` — "${b.thought}" (${b.who?.[0] ? world.byId.get(b.who[0])?.seed.name : ""})` : ""}`).join("\n");
    const system = `You are the editor of this world's one-page paper. From the BEATS below write an edition of at most 150 words: three headlines (at most 10 words each), one paragraph, one direct quote taken verbatim from a quoted line in the beats (something a citizen said, or a thought the record shows), attributed to the person named after it. No invention: if it isn't in the beats it didn't happen. Reply with {"headlines": ["…","…","…"], "body": "…", "quote": {"who": "…", "text": "…"}} and nothing else.`;
    const user = `World: ${world.scenario.title}. ${world.scenario.premise}\nHour ${hour} of ${world.scenario.clock.hours}.\n\nBEATS:\n${beats || "(a quiet day)"}`;
    const r = await chat({ model: cfg.citizenModel, system, user, json: true, temperature: 0.3, maxTokens: 400, meter, seed: world.seed }, cfg);
    let parsed: any = null; try { parsed = parseJson(r.text); } catch { parsed = null; }
    log.push({ kind: "edition", hour, citizen: "-", model: r.model, ms: r.ms, usage: r.usage, cachedPrefixChars: system.length, liveChars: user.length, response: r.text, parsed, ...(parsed ? {} : { fallback: "edition" }) });
    if (parsed && Array.isArray(parsed.headlines)) out.push({ hour, headlines: parsed.headlines.slice(0, 3).map(String), body: String(parsed.body ?? "").split(/\s+/).slice(0, 160).join(" "), quote: parsed.quote && parsed.quote.text ? { who: String(parsed.quote.who ?? ""), text: String(parsed.quote.text) } : null });
  }
  return out;
}
