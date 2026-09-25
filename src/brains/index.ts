// Brain selection for the CLI. `mock` is free and deterministic; `flash` calls the citizen model; `scripted` runs the flash
// prompt/parse/validate path with canned answers (no key) so the plumbing, logging and cost accounting can be exercised.
import type { Brain } from "./brain.ts";
import { mockBrain } from "./mock.ts";
import { flashBrain, type FlashLog } from "./flash.ts";
import { loadEngine, type DecisionEngine } from "../llm/engine.ts";
import { Meter, llmConfig } from "../llm/client.ts";
import { withReplay, type CallRecord } from "./replay.ts";

export type BrainName = "mock" | "flash" | "scripted";

export interface MadeBrain { brain: Brain & { hits?: number; misses?: number }; inner: Brain; engine: DecisionEngine | null; calls: CallRecord[]; flashLog: FlashLog[]; meter?: Meter }

/** Every non-mock brain is wrapped in the replay cache, so its calls.jsonl carries replay hashes and a fork can serve from it. */
export function makeBrain(name: BrainName, scenarioId: string, opts: { meter?: Meter; faultRate?: number; parentCalls?: Map<string, CallRecord>; engine?: DecisionEngine | null } = {}): MadeBrain {
  const engine = opts.engine !== undefined ? opts.engine : loadEngine(scenarioId);
  const calls: CallRecord[] = [];
  if (name === "mock") return { brain: mockBrain, inner: mockBrain, engine, calls, flashLog: [] };
  const flashLog: FlashLog[] = [];
  let inner: Brain & { meter?: Meter }; let meter: Meter | undefined;
  if (name === "scripted") { inner = flashBrain({ engine, log: flashLog, scripted: true, scriptedFaultRate: opts.faultRate }); meter = inner.meter; }
  else {
    const cfg = llmConfig();
    if (!cfg.apiKey) throw new Error(`--brain flash needs a key: put DEEPSEEK_API_KEY=… in .env (see .env.example). Or use --brain scripted to exercise the same path without a model.`);
    meter = opts.meter ?? new Meter(cfg.spendCapUsd);
    inner = flashBrain({ engine, log: flashLog, meter, cfg });
  }
  const brain = withReplay(inner, opts.parentCalls ?? new Map(), calls);
  return { brain, inner, engine, calls, flashLog, meter };
}

/** calls.jsonl lines: one per brain call, replay hash first. */
export function callsFromLog(calls: CallRecord[]): object[] {
  return calls.map((l) => ({ hash: l.hash, kind: l.kind, hour: l.hour, citizen: l.citizen, replayed: !!l.replayed, model: l.model ?? null, usage: l.usage ?? null, fallback: l.fallback ?? null, response: l.response, raw: l.raw ?? null, ...(l.attempts ? { attempts: l.attempts } : {}) }));
}
