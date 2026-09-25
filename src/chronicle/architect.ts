// The Architect for chronicles: question → town + years + dilemmas → static validation → ten-seed soak → ledger.
// `--dry-run` writes the assembled prompt; `--llm scripted` re-skins the fixture through the same validate/soak/retry path.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { ChronicleScenario } from "./types.ts";
import { LIBRARY } from "./dilemmas.ts";
import { validateChronicle, soakChronicle } from "./validate.ts";
import { schemaText, libraryText, varietyText } from "./worldsmith.ts";
import { splitPrompt, fill, readLedger, promptLedger, type LedgerEntry } from "../architect.ts";
import { chat, llmConfig, Meter, parseJson, estTokens } from "../llm/client.ts";
import { FX } from "../validate.ts";

const LEDGER = "scenarios/ledger.jsonl";
const OUT = "scenarios/chronicle/generated";

/** The same shape the worker's Architect is given, read off disk here — one definition, in src/chronicle/worldsmith.ts. */
export const chronicleSchemaText = (): string => schemaText(JSON.parse(readFileSync("scenarios/chronicle/the-four.json", "utf8")) as ChronicleScenario);

export { libraryText };

export { rollVariety, varietyText, type Variety } from "./worldsmith.ts"; // the dice live with the Architect that has no disk

export function buildChroniclePrompt(question: string | undefined, failureReport?: string, previous?: unknown, variety?: Variety): { system: string; user: string } {
  const { system, inputs } = splitPrompt("prompts/architect-chronicle.md", "SCHEMA");
  const ledger = promptLedger().map((l) => `${l.id} · ${l.setting} · ${l.pressure} · ${l.endingShape} · ${l.dynamic} · ${l.question}`).join("\n") || "(empty)";
  const fr = failureReport ? `${failureReport}${previous ? `\n\nYOUR PREVIOUS JSON (fix it, do not start over):\n${JSON.stringify(previous)}` : ""}` : "(none — first attempt)";
  return { system, user: fill(inputs, { SCHEMA: chronicleSchemaText(), LIBRARY: libraryText(), LEDGER: ledger, QUESTION: question ?? "(none — choose one a chronicle can test)", VARIETY: variety ? varietyText(variety) : "(none rolled — choose freely, but differ from the ledger)", FAILURE_REPORT: fr }) };
}

export async function chronicleGauntlet(raw: unknown, opts: { allowExistingId?: boolean } = {}): Promise<{ ok: boolean; report: string; scenario?: ChronicleScenario }> {
  const v = validateChronicle(raw);
  if (!v.ok) return { ok: false, report: `Static validation failed:\n${v.errors.map((e) => `- ${e}`).join("\n")}${v.warnings.length ? `\nWarnings:\n${v.warnings.map((w) => `- ${w}`).join("\n")}` : ""}` };
  const sc = raw as ChronicleScenario;
  if (!opts.allowExistingId && (readLedger().some((l) => l.id === sc.id) || existsSync(`scenarios/chronicle/${sc.id}.json`) || existsSync(`${OUT}/${sc.id}.json`))) return { ok: false, report: `Static validation failed:\n- id: "${sc.id}" already exists — choose a new slug` };
  const sk = await soakChronicle(sc, 10);
  const lines = [...sk.lines, ...(v.warnings.length ? [`Warnings:\n${v.warnings.map((w) => `- ${w}`).join("\n")}`] : [])];
  return { ok: sk.problems.length === 0, report: [...lines, ...(sk.problems.length ? [`Problems:\n${sk.problems.map((p) => `- ${p}`).join("\n")}`] : [])].join("\n\n"), scenario: sc };
}

export interface ChronicleArchitectOpts { question?: string; llm?: "live" | "scripted"; dryRun?: boolean; maxAttempts?: number; onLog?: (s: string) => void; variety?: Variety | null }
export interface ChronicleArchitectResult { scenario: ChronicleScenario; attempts: number; files: string[]; meter: Meter; calls: object[] }

export async function runChronicleArchitect(opts: ChronicleArchitectOpts): Promise<ChronicleArchitectResult | null> {
  const log = opts.onLog ?? (() => {});
  mkdirSync(OUT, { recursive: true });
  const question = opts.question;
  if (opts.dryRun) {
    const dir = `${OUT}/dryrun`; mkdirSync(dir, { recursive: true });
    const p = buildChroniclePrompt(question, undefined, undefined, opts.variety ?? undefined);
    writeFileSync(`${dir}/architect-chronicle.system.md`, p.system); writeFileSync(`${dir}/architect-chronicle.user.md`, p.user);
    log(`dry run: prompt written to ${dir}/ (≈ ${estTokens(p.system + p.user)} tokens). No calls made.`);
    return null;
  }
  const cfg = llmConfig(); const meter = new Meter(cfg.spendCapUsd); const calls: object[] = [];
  const ask = async (p: { system: string; user: string }): Promise<string> => {
    if (opts.llm === "scripted") { const text = scriptedTown(question); calls.push({ stage: "chronicle", model: "scripted", ms: 0, usage: null, prompt: p, response: text }); return text; }
    if (!cfg.apiKey) throw new Error("architect --chronicle needs a key: DEEPSEEK_API_KEY in .env, or --llm scripted / --dry-run");
    const r = await chat({ model: cfg.architectModel, system: p.system, user: p.user, json: true, maxTokens: 8000, meter, temperature: 0.7 }, cfg);
    calls.push({ stage: "chronicle", model: r.model, ms: r.ms, usage: r.usage, finishReason: r.finishReason, prompt: p, response: r.text });
    if (meter.over()) throw meter.capError();
    if (r.finishReason === "length") throw new Error("reply truncated at 8000 tokens — use fill for the unnamed cast and output compact JSON");
    log(`chronicle: ${r.usage.promptTokens} in / ${r.usage.completionTokens} out · ${r.ms} ms · $${r.usage.costUsd.toFixed(4)}`);
    return r.text;
  };
  let failure: string | undefined, previous: unknown, scenario: ChronicleScenario | undefined, attempts = 0;
  const max = opts.maxAttempts ?? 3;
  while (attempts < max && !scenario) {
    attempts++;
    log(`attempt ${attempts}/${max}: generating a town${question ? ` for "${question}"` : ""}`);
    let raw: unknown;
    try { raw = parseJson(await ask(buildChroniclePrompt(question, failure, previous, opts.variety ?? undefined))); }
    catch (e) { if (/spend cap/.test((e as Error).message)) throw e; failure = `Your reply was not a single JSON object: ${(e as Error).message}`; log(failure); continue; }
    previous = raw;
    const g = await chronicleGauntlet(raw);
    if (!g.ok) { failure = g.report; log(`validation failed:\n${g.report}`); continue; }
    scenario = g.scenario; log(`accepted:\n${g.report}`);
  }
  if (!scenario) { writeFileSync(`${OUT}/last-failure.md`, `# no town accepted after ${attempts} attempts\n\n${failure ?? ""}`); log(`gave up after ${attempts} attempts; see ${OUT}/last-failure.md`); return null; }
  const files: string[] = [];
  const sp = `${OUT}/${scenario.id}.json`; writeFileSync(sp, JSON.stringify(scenario, null, 2)); files.push(sp);
  const cp = `${OUT}/${scenario.id}.calls.jsonl`; writeFileSync(cp, calls.map((c) => JSON.stringify(c)).join("\n") + "\n"); files.push(cp);
  const entry: LedgerEntry = { id: scenario.id, ...scenario.fingerprint, question: scenario.socialQuestion.text, createdAt: new Date().toISOString().slice(0, 10), source: opts.llm === "scripted" ? "architect-chronicle:scripted" : `architect-chronicle:${cfg.architectModel}` };
  appendFileSync(LEDGER, JSON.stringify(entry) + "\n");
  return { scenario, attempts, files, meter, calls };
}

/** Canned Architect for plumbing tests: the fixture with a new id and one extra town dilemma, through the real validate/soak path. */
function scriptedTown(question: string | undefined): string {
  const base = JSON.parse(readFileSync("scenarios/chronicle/the-valley.json", "utf8")) as ChronicleScenario;
  let n = 1; while (existsSync(`${OUT}/scripted-town-${n}.json`) || readLedger().some((l) => l.id === `scripted-town-${n}`)) n++;
  const s: ChronicleScenario = {
    ...base, id: `scripted-town-${n}`, title: `Scripted Town ${n}`, premise: `${base.premise} (scripted re-skin ${n} for pipeline tests.)`,
    fingerprint: { ...base.fingerprint, setting: `scripted valley ${n}` }, socialQuestion: question ? { text: question, hypothesis: base.socialQuestion.hypothesis } : base.socialQuestion,
    dilemmas: [{ id: "pit-lamp", when: ["employed", "epoch:boom"], weight: 1, target: "friend", text: "The foreman offers double pay for the deep seam. {{target}} says the props are rotten.",
      options: [
        { id: "go", label: "Take the double pay", pull: { bold: 0.4, poverty: 0.4, danger: -0.3 }, outcomes: [{ chance: 0.8, text: "the seam pays", self: { money: 0.25 } }, { chance: 0.2, text: "the props give", self: { health: -0.4 }, deed: { kind: "sacrifice", help: 0.1, text: "was buried in the deep seam" } }] },
        { id: "refuse", label: "Refuse, and say why", pull: { loyal: 0.3, danger: 0.4 }, outcomes: [{ chance: 1, text: "the foreman remembers", self: { money: -0.03 }, target: { tie: 0.3 }, deed: { kind: "loyalty", help: 0.2, text: "backed {{target}} against the foreman" } }] },
      ] }],
  };
  return JSON.stringify(s);
}
