// The Architect pipeline (docs/BRAINS.md §1, §7): question → scenario → validation gauntlet → novelty check → decision engine → ledger.
// Runs once per 72 h in production; `--dry-run` writes the assembled prompts without calling anything; `--llm scripted` exercises
// every stage with canned answers so the plumbing is testable with no key.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { validateScenario } from "./validate.ts";
import { soak } from "./reach.ts";
import type { Scenario } from "./types.ts";
import { chat, llmConfig, Meter, parseJson, estTokens, type ChatResult } from "./llm/client.ts";
import { ACTION_PRIMITIVES, checkEngine, type DecisionEngine } from "./llm/engine.ts";

export interface LedgerEntry { id: string; setting: string; pressure: string; endingShape: string; dynamic: string; question: string; createdAt: string; source: string }

const LEDGER = "scenarios/ledger.jsonl";
const OUT = "scenarios/generated";

export function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
export function ledgerLine(s: Scenario, source: string): LedgerEntry {
  return { id: s.id, ...s.fingerprint, question: s.socialQuestion.text, createdAt: new Date().toISOString().slice(0, 10), source };
}
/** Seed the ledger from every scenario on disk so the first generated one has something to differ from. */
export function seedLedger() {
  const have = new Set(readLedger().map((l) => l.id));
  for (const dir of ["scenarios", "scenarios/critic", "scenarios/generated"]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".engine.json") && !f.endsWith(".rejected.json"))) {
      const s = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Scenario;
      if (s.id && !s.id.startsWith("scripted-") && !have.has(s.id) && s.fingerprint) { appendFileSync(LEDGER, JSON.stringify(ledgerLine(s, dir)) + "\n"); have.add(s.id); }
    }
  }
}

/** Split a prompt file into system (everything before the first input section) and the template of input sections. */
export function splitPrompt(file: string, firstInput: string): { system: string; inputs: string } {
  const text = readFileSync(file, "utf8");
  const i = text.indexOf(`## ${firstInput}`);
  if (i < 0) throw new Error(`${file}: no "## ${firstInput}" section`);
  // drop the leading H1 + italic note (documentation), keep from "## System" on
  const sys = text.slice(0, i); const j = sys.indexOf("## System");
  return { system: (j >= 0 ? sys.slice(j) : sys).trim(), inputs: text.slice(i) };
}
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => vars[k] ?? "(none)");
}

/** The schema text the Architect writes to: the JSONC example plus the rules, lifted from docs/SCENARIO.md. */
export function schemaText(): string {
  const doc = readFileSync("docs/SCENARIO.md", "utf8");
  const section = (start: string, end: RegExp) => { const i = doc.indexOf(start); if (i < 0) return ""; const rest = doc.slice(i + start.length); const m = end.exec(rest); return (m ? rest.slice(0, m.index) : rest).trim(); };
  const block = /```jsonc\n([\s\S]*?)```/.exec(doc)?.[1] ?? "";
  const rules = section("### Validator rules in one place", /\n## |\n```/);
  const when = section("### Where people are, and when — put events where the people are", /\n### /);
  const notes = section("## Field notes", /\n## /);
  return `JSON shape (comments explain each field; output plain JSON without comments):\n\n${block}\n\nRules the validator enforces:\n${rules}\n\nWhere people are, and when — put events where the people are:\n${when}\n\nHow the engine scores things (read before writing pull weights):\n${notes}`;
}
/** The exact live-tick format the citizen model sees (prompts/citizen.md), shown to the Architect so exemplars match it. */
export function contextFormatText(): string {
  return `## Now
Hour 44 · 28 hours left · taking sides — The manifest is posted. Who you drink with starts to matter.
You are at **The Lamp**. Here: Bo (cook), Pia (clerk), Dov (doctor).
Your lean: undecided. Means: 0.4.

Recent:
- h44: Word goes round: the ferry isn't coming.
- h41: Pia talked with me

Ties:
- Pia: friendly — talked at The Lamp
- Bo: friendly — they work near each other

Beliefs you hold:
- the ferry has been cancelled (believes)

CANDIDATES (ranked):
1. talk → dov — talk with Dov Ekeli
2. share → ferryCancelled|kai — tell Kai that the ferry has been cancelled
3. move → homes — go to Row Houses

Choose.`;
}

export const QUESTION_BANK = [
  "Do strong ties keep people in a place that is dying?",
  "Does a rumour introduced late change more minds than one introduced early?",
  "Under scarcity, do the bold take first or do the loyal give way first?",
  "When an authority figure leaves, do groups re-form around the most sociable or the most bold?",
  "Does knowing the deadline exactly (vs. approximately) make people decide earlier?",
  "Do citizens who witness a betrayal choose differently from those who only hear of it?",
];

/** Ledger lines a live Architect should see: real scenarios only (scripted plumbing runs are tagged and excluded). */
export function promptLedger(excludeId?: string): LedgerEntry[] {
  return readLedger().filter((l) => l.source !== "architect:scripted" && l.source !== "architect-chronicle:scripted" && l.id !== excludeId);
}
const ledgerText = (ls: LedgerEntry[]) => ls.map((l) => `${l.id} · ${l.setting} · ${l.pressure} · ${l.endingShape} · ${l.dynamic} · Q: ${l.question}`).join("\n");

export function buildScenarioPrompt(question: string | undefined, failureReport?: string, previous?: unknown): { system: string; user: string } {
  const { system, inputs } = splitPrompt("prompts/architect-scenario.md", "SCHEMA");
  const ledger = ledgerText(promptLedger()) || "(empty — this is the first scenario)";
  // a retry sees its own previous JSON, so "fix what was named and keep the rest" is possible
  const failure = failureReport ? `${failureReport}\n\nYOUR PREVIOUS SCENARIO (fix exactly what the report names; keep everything else):\n${previous ? JSON.stringify(previous) : "(could not be parsed — start again, output compact JSON only)"}` : "(none — first attempt)";
  const user = fill(inputs, { SCHEMA: schemaText(), LEDGER: ledger, QUESTION: question ?? `(choose one from the QUESTION BANK, or propose one of the same kind)`, FAILURE_REPORT: failure });
  return { system, user };
}
export function buildEnginePrompt(s: Scenario): { system: string; user: string } {
  const { system, inputs } = splitPrompt("prompts/architect-decision-engine.md", "SCENARIO");
  return { system, user: fill(inputs, { SCENARIO: JSON.stringify(s), ACTION_PRIMITIVES: ACTION_PRIMITIVES.join(", "), CONTEXT_FORMAT: contextFormatText() }) };
}
/** The novelty critic reads the scenario's substance (premise, ending labels, event headlines, cast roles) and writes its own fingerprint before comparing. */
export function buildNoveltyPrompt(s: Scenario): { system: string; user: string } {
  const ledger = ledgerText(promptLedger(s.id));
  return {
    system: `You are the novelty critic for a scenario generator. You are shown a ledger of past scenarios (one per line: id · setting · pressure · ending shape · dynamic · question) and one candidate described by its SUBSTANCE: premise, ending choices, event headlines, cast roles, and its own claimed fingerprint. First write the candidate's fingerprint yourself from the substance (ignore the claimed one — it was written by the model that wants acceptance). Then compare: the candidate is novel only if your fingerprint differs from EVERY ledger line on at least two of the four axes (setting, pressure, endingShape, dynamic) AND its social question is not a rephrasing of any listed question. Judge the substance, not the wording: a "dying fishing village" and a "dying mining town" share a setting; "the last train before the pass closes" and "the last ferry" share a pressure; a re-skin that keeps the same events and choices under new names is not novel. Reply with one JSON object: {"fingerprint": {"setting": "…", "pressure": "…", "endingShape": "…", "dynamic": "…"}, "novel": boolean, "closest": "<ledger id>", "sharedAxes": ["setting", ...], "sameQuestionAs": "<ledger id or null>", "reason": "<one sentence>"}`,
    user: `LEDGER:\n${ledger || "(empty)"}\n\nCANDIDATE ${s.id}\nPremise: ${s.premise}\nEnding: ${s.ending.prompt} — ${s.ending.choices.map((c) => c.label).join(" / ")}\nEvents: ${s.events.map((e) => `h${e.at} ${e.headline}`).join(" · ")}\nCast roles: ${[...new Set(s.citizens.map((c) => c.role))].join(", ")}\nQuestion: ${s.socialQuestion.text}\nClaimed fingerprint: ${s.fingerprint.setting} · ${s.fingerprint.pressure} · ${s.fingerprint.endingShape} · ${s.fingerprint.dynamic}`,
  };
}

/** A validation report the Architect can act on: static errors, reach, ending split. */
export async function gauntlet(s: unknown, opts: { allowExistingId?: boolean } = {}): Promise<{ ok: boolean; report: string; scenario?: Scenario }> {
  const v = validateScenario(s);
  if (!v.ok) return { ok: false, report: `Static validation failed:\n${v.errors.map((e) => `- ${e}`).join("\n")}${v.warnings.length ? `\nWarnings:\n${v.warnings.map((w) => `- ${w}`).join("\n")}` : ""}` };
  const sc = s as Scenario;
  if (!opts.allowExistingId) {
    const taken = readLedger().some((l) => l.id === sc.id) || ["scenarios", "scenarios/critic", "scenarios/generated"].some((d) => existsSync(`${d}/${sc.id}.json`));
    if (taken) return { ok: false, report: `Static validation failed:\n- id: "${sc.id}" already exists (on the ledger or on disk) — choose a new slug` };
  }
  const sk = await soak(sc, 20);
  const lines: string[] = [];
  const weak = sk.reach.filter((r) => r.weak);
  lines.push(`Event reach over 20 seeds (mean citizens present):\n${sk.reach.map((r) => `- ${r.id} h${r.at} ${r.where}: ${r.meanReached.toFixed(1)} / ${r.cast}${r.weak ? "  ← fires into an empty room" : ""}`).join("\n")}`);
  lines.push(`Ending split over 20 seeds: ${Object.entries(sk.shares).map(([k, v]) => `${k} ${Math.round(v * 100)} %`).join(", ")}${sk.oneSidedSeeds ? ` (${sk.oneSidedSeeds} seeds one-sided)` : ""}`);
  const problems: string[] = [];
  if (!sk.diversityOk) problems.push("The ending is not contested: a choice takes > 80 % or < 5 % of citizens. Rebalance pull weights (balance expected scores, not |pull| totals).");
  const loadBearing = weak.filter((r) => Object.keys(sc.events.find((e) => e.id === r.id)?.effects?.belief ?? {}).length);
  if (loadBearing.length) problems.push(`These events carry beliefs but reach almost nobody: ${loadBearing.map((r) => r.id).join(", ")}. Move them to where people are at that hour, or use "where": "all".`);
  if (v.warnings.length) lines.push(`Warnings:\n${v.warnings.map((w) => `- ${w}`).join("\n")}`);
  return { ok: problems.length === 0, report: [...lines, ...(problems.length ? [`Problems:\n${problems.map((p) => `- ${p}`).join("\n")}`] : [])].join("\n\n"), scenario: sc };
}

export interface ArchitectOpts { question?: string; llm?: "live" | "scripted"; dryRun?: boolean; maxAttempts?: number; onLog?: (s: string) => void }
export interface ArchitectResult { scenario: Scenario; engine: DecisionEngine; attempts: number; files: string[]; meter: Meter; calls: object[] }

export async function runArchitect(opts: ArchitectOpts): Promise<ArchitectResult | null> {
  const calls: object[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try { return await runArchitectInner(opts, calls); }
  catch (e) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/last-failure.md`, `# run aborted: ${(e as Error).message}\n\n${calls.length} call(s) made; see the failed-*.calls.jsonl next to this file.`);
    const acc = (calls as any[]).find((c) => c.acceptedScenario)?.acceptedScenario;
    if (acc) writeFileSync(`${OUT}/${acc.id}.rejected.json`, JSON.stringify(acc, null, 2));
    throw e;
  }
  finally {
    // every call is on disk whatever happened — success writes <id>.calls.jsonl, failures write a timestamped log
    const real = calls.filter((c: any) => !c.acceptedScenario && !c.flushedAs);
    if (real.length && !calls.some((c: any) => c.flushedAs)) { mkdirSync(OUT, { recursive: true }); const p = `${OUT}/failed-${stamp}.calls.jsonl`; writeFileSync(p, real.map((c) => JSON.stringify(c)).join("\n") + "\n"); (opts.onLog ?? (() => {}))(`calls written to ${p}`); }
  }
}

async function runArchitectInner(opts: ArchitectOpts, calls: object[]): Promise<ArchitectResult | null> {
  const log = opts.onLog ?? (() => {});
  mkdirSync(OUT, { recursive: true });
  seedLedger();
  const words = (q: string) => new Set(q.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !["that", "than", "with", "from", "does", "more", "people", "their", "they", "them", "when", "which", "what", "into"].includes(w)));
  const similar = (a: string, b: string) => { const x = words(a), y = words(b); const inter = [...x].filter((w) => y.has(w)).length; return inter / Math.max(1, Math.min(x.size, y.size)) >= 0.6; };
  const askedQs = promptLedger().map((l) => l.question);
  const question = opts.question ?? QUESTION_BANK.find((q) => !askedQs.some((a) => similar(a, q))) ?? `A question of the same kind as the bank's, but on a dynamic not yet on the ledger (which already asks: ${askedQs.slice(-4).join(" | ")}).`;
  if (opts.question && askedQs.some((a) => similar(a, opts.question!))) log(`note: a very similar question is already on the ledger (${askedQs.find((a) => similar(a, opts.question!))}); the novelty critic will want a different one`);
  if (opts.dryRun) {
    const dir = `${OUT}/dryrun`; mkdirSync(dir, { recursive: true });
    const sp = buildScenarioPrompt(question);
    writeFileSync(`${dir}/architect-scenario.system.md`, sp.system); writeFileSync(`${dir}/architect-scenario.user.md`, sp.user);
    const sample = JSON.parse(readFileSync("scenarios/last-ferry.json", "utf8")) as Scenario;
    const ep = buildEnginePrompt(sample);
    writeFileSync(`${dir}/architect-decision-engine.system.md`, ep.system); writeFileSync(`${dir}/architect-decision-engine.user.md`, ep.user);
    const np = buildNoveltyPrompt(sample);
    writeFileSync(`${dir}/novelty-critic.system.md`, np.system); writeFileSync(`${dir}/novelty-critic.user.md`, np.user);
    log(`dry run: prompts written to ${dir}/ (scenario ≈ ${estTokens(sp.system + sp.user)} tokens, engine ≈ ${estTokens(ep.system + ep.user)} tokens, novelty ≈ ${estTokens(np.system + np.user)} tokens). No calls made.`);
    return null;
  }
  const cfg = llmConfig();
  const meter = new Meter(cfg.spendCapUsd);
  const ask = async (stage: string, p: { system: string; user: string }, maxTokens: number): Promise<string> => {
    if (meter.costUsd >= meter.capUsd) throw new Error(`spend cap reached before ${stage} call ($${meter.costUsd.toFixed(3)} ≥ $${meter.capUsd})`);
    if (opts.llm === "scripted") { const text = scripted(stage, p, question); calls.push({ stage, model: "scripted", ms: 0, usage: null, prompt: { system: p.system, user: p.user }, response: text }); return text; }
    const r: ChatResult = await chat({ model: cfg.architectModel, system: p.system, user: p.user, json: true, maxTokens, meter, temperature: 0.7 }, cfg);
    calls.push({ stage, model: r.model, ms: r.ms, usage: r.usage, finishReason: r.finishReason, prompt: { system: p.system, user: p.user }, response: r.text });
    if (meter.over()) throw meter.capError(); // the call is logged above; nothing after this spends
    if (r.finishReason === "length") throw new Error(`reply truncated at ${maxTokens} tokens — use fill for the unnamed cast and output compact JSON`);
    log(`${stage}: ${r.usage.promptTokens} in / ${r.usage.completionTokens} out · ${r.ms} ms · $${r.usage.costUsd.toFixed(4)}`);
    return r.text;
  };

  let failure: string | undefined; let previous: unknown; let scenario: Scenario | undefined; let attempts = 0;
  const max = opts.maxAttempts ?? 3;
  while (attempts < max && !scenario) {
    attempts++;
    log(`attempt ${attempts}/${max}: generating scenario for "${question}"`);
    let raw: unknown;
    try { raw = parseJson(await ask("scenario", buildScenarioPrompt(question, failure, previous), 8000)); }
    catch (e) { if (/spend cap/.test((e as Error).message)) throw e; failure = `Your reply was not a single JSON object: ${(e as Error).message}${/truncated/i.test((e as Error).message) ? "" : ". If it was cut off, use fill for the unnamed cast and output compact JSON."}`; previous = undefined; log(failure); continue; }
    previous = raw;
    const g = await gauntlet(raw);
    if (!g.ok) { failure = g.report; log(`validation failed:\n${g.report}`); continue; }
    let nov: { novel: boolean; closest?: string; sharedAxes?: string[]; sameQuestionAs?: string | null; reason?: string; fingerprint?: Scenario["fingerprint"] };
    try { nov = parseJson(await ask("novelty", buildNoveltyPrompt(g.scenario!), 800)); if (!nov || typeof nov !== "object" || typeof nov.novel !== "boolean") throw new Error("reply has no boolean 'novel'"); }
    catch (e) { if (/spend cap/.test((e as Error).message)) throw e; log(`novelty critic reply unusable (${(e as Error).message}); treating as novel and continuing — check the ledger by hand`); nov = { novel: true, reason: "critic reply unusable" }; }
    if (!nov.novel) { failure = `Not novel: ${nov.reason ?? ""} (closest: ${nov.closest}; shared axes: ${(nov.sharedAxes ?? []).join(", ")}${nov.sameQuestionAs ? `; same question as ${nov.sameQuestionAs}` : ""}). The critic read your premise, ending and events and fingerprinted them as: ${nov.fingerprint ? Object.values(nov.fingerprint).join(" · ") : "(n/a)"}. Change the SUBSTANCE on at least two axes (different pressure and setting, or a different ending shape), not just the labels${nov.sameQuestionAs ? "; and the question must not be a rephrasing of the one already on the ledger" : ""}.`; log(failure); continue; }
    scenario = g.scenario!;
    calls.push({ acceptedScenario: scenario }); // so an abort later (cap, transport) still leaves the accepted scenario on disk
    log(`accepted after validation + novelty:\n${g.report}`);
  }
  if (!scenario) { log(`gave up after ${attempts} attempts; last failure:\n${failure ?? "(no attempt was made)"}`); writeFileSync(`${OUT}/last-failure.md`, `# no scenario accepted after ${attempts} attempts\n\n${failure ?? "(no attempt was made — --attempts 0?)"}`); return null; }

  // decision engine, up to 3 compile attempts; each retry sees its own previous JSON and the errors
  let engine: DecisionEngine | undefined; let engineErrors: string[] = []; let prevEngine: unknown; let engineAttempts = 0;
  for (let k = 0; k < 3 && !engine; k++) {
    engineAttempts++;
    const p = buildEnginePrompt(scenario);
    const userWithErrors = engineErrors.length ? `${p.user}\n\n## COMPILATION ERRORS (fix exactly these; keep everything else)\n${engineErrors.map((e) => `- ${e}`).join("\n")}\n\n## YOUR PREVIOUS ENGINE\n${prevEngine ? JSON.stringify(prevEngine) : "(could not be parsed — output compact JSON only)"}` : p.user;
    let cand: DecisionEngine;
    try { cand = parseJson<DecisionEngine>(await ask("engine", { system: p.system, user: userWithErrors }, 8000)); } catch (e) { if (/spend cap/.test((e as Error).message)) throw e; engineErrors = [`not a JSON object: ${(e as Error).message}`]; prevEngine = undefined; log(engineErrors[0]); continue; }
    prevEngine = cand;
    try { engineErrors = checkEngine(cand, scenario); } catch (e) { engineErrors = [`engine JSON is not the documented shape: ${(e as Error).message}`]; }
    if (!engineErrors.length) engine = cand; else log(`engine compile errors (attempt ${engineAttempts}):\n${engineErrors.map((e) => `- ${e}`).join("\n")}`);
  }
  if (!engine) {
    log(`decision engine did not compile after ${engineAttempts} attempts — the run is a failure (a scenario without an engine is not a world the cheap brain can run). Scenario saved for inspection as ${OUT}/${scenario.id}.rejected.json.`);
    writeFileSync(`${OUT}/${scenario.id}.rejected.json`, JSON.stringify(scenario, null, 2));
    writeFileSync(`${OUT}/last-failure.md`, `# ${scenario.id}: decision engine did not compile\n\n${engineErrors.map((e) => `- ${e}`).join("\n")}`);
    return null;
  }

  const files: string[] = [];
  const sp = `${OUT}/${scenario.id}.json`; writeFileSync(sp, JSON.stringify(scenario, null, 2)); files.push(sp);
  if (engine) { const ep = `${OUT}/${scenario.id}.engine.json`; writeFileSync(ep, JSON.stringify(engine, null, 2)); files.push(ep); }
  const cp = `${OUT}/${scenario.id}.calls.jsonl`; writeFileSync(cp, calls.filter((c: any) => !c.acceptedScenario).map((c) => JSON.stringify(c)).join("\n") + "\n"); files.push(cp); calls.push({ flushedAs: cp });
  appendFileSync(LEDGER, JSON.stringify(ledgerLine(scenario, opts.llm === "scripted" ? "architect:scripted" : `architect:${cfg.architectModel}`)) + "\n");
  const rp = `${OUT}/${scenario.id}.architect.md`;
  writeFileSync(rp, `# Architect run — ${scenario.title}\n\nQuestion: ${question}\nScenario attempts: ${attempts} · engine attempts: ${engineAttempts}\nLLM: ${opts.llm === "scripted" ? "scripted (no model)" : cfg.architectModel}\nSpend: ${meter.summary()}\n\n## Fingerprint\n${Object.entries(scenario.fingerprint).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n## Premise\n${scenario.premise}\n\n## Ending\n${scenario.ending.choices.map((c) => `- ${c.label}`).join("\n")}\n\n## Events\n${scenario.events.map((e) => `- h${e.at} (${e.stakes}) ${e.headline}`).join("\n")}\n\n## Decision engine\ncompiled: ${engine.archetypes.length} archetypes, ${engine.actionVocabulary.length} actions, ${engine.exemplars.length} exemplars, ${engine.tripwires.length} tripwires\n`);
  files.push(rp);
  return { scenario, engine: engine!, attempts, files, meter, calls };
}

/** Canned Architect for plumbing tests: a fixture re-skinned with a new fingerprint, and the reference engine. */
function scripted(stage: string, _p: { system: string; user: string }, question: string): string {
  if (stage === "scenario") {
    const base = JSON.parse(readFileSync("scenarios/last-ferry.json", "utf8")) as Scenario;
    let n = 1; while (existsSync(`${OUT}/scripted-${n}.json`) || readLedger().some((l) => l.id === `scripted-${n}`)) n++;
    const s: Scenario = { ...base, id: `scripted-${n}`, title: `Scripted World ${n}`, premise: `${base.premise} (scripted re-skin ${n} for pipeline tests.)`, socialQuestion: { ...base.socialQuestion, text: question }, fingerprint: { setting: `scripted setting ${n}`, pressure: `scripted pressure ${n}`, endingShape: base.fingerprint.endingShape, dynamic: base.fingerprint.dynamic } };
    return JSON.stringify(s);
  }
  if (stage === "novelty") {
    // scripted critic: string-compare the claimed fingerprint against the prompt ledger, honestly
    const cand = /Claimed fingerprint: (.+?) · (.+?) · (.+?) · (.+)$/m.exec(_p.user);
    const q = /^Question: (.+)$/m.exec(_p.user)?.[1]?.toLowerCase();
    const ledger = promptLedger();
    let worst = { id: "", shared: [] as string[] };
    for (const l of ledger) { const shared = (["setting", "pressure", "endingShape", "dynamic"] as const).filter((k, i) => cand && cand[i + 1].trim().toLowerCase() === l[k].toLowerCase()); if (shared.length > worst.shared.length) worst = { id: l.id, shared }; }
    const sameQ = ledger.find((l) => l.question.toLowerCase() === q)?.id ?? null;
    const novel = worst.shared.length <= 2 && !sameQ;
    return JSON.stringify({ fingerprint: cand ? { setting: cand[1], pressure: cand[2], endingShape: cand[3], dynamic: cand[4] } : null, novel, closest: worst.id, sharedAxes: worst.shared, sameQuestionAs: sameQ, reason: novel ? "scripted: differs on at least two axes and the question is new" : "scripted: too close on the fingerprint or the same question" });
  }
  if (stage === "engine") return readFileSync("scenarios/last-ferry.engine.json", "utf8");
  throw new Error(`scripted: unknown stage ${stage}`);
}
