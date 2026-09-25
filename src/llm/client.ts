// One small client for any OpenAI-compatible chat endpoint (DeepSeek, OpenRouter, local). No SDK, just fetch.
// Every call is metered against config/prices.json and a per-run spend cap; every call is returned with its usage so it can be logged.
import { existsSync, readFileSync } from "node:fs";

export interface LlmConfig { baseUrl: string; apiKey: string | undefined; architectModel: string; citizenModel: string; spendCapUsd: number }
export interface Usage { promptTokens: number; cachedTokens: number; completionTokens: number; costUsd: number }
export interface ChatResult { text: string; usage: Usage; model: string; ms: number; finishReason?: string }
export interface Prices { models: Record<string, { input: number; cachedInput: number; output: number; role?: string }>; spendCapUsdPerRun: number }

let envLoaded = false;
/** Load `.env` into process.env once (KEY=value lines; existing env wins). */
export function loadEnv(path = ".env") {
  if (envLoaded) return; envLoaded = true;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

let injected: Prices | null = null;
/** Hand the prices in instead of reading them off disk — the Workers build has no filesystem and bundles them. */
export function usePrices(p: Prices) { injected = p; }
export function loadPrices(path = "config/prices.json"): Prices {
  if (injected) return injected;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function llmConfig(): LlmConfig {
  loadEnv();
  const prices = loadPrices();
  return {
    baseUrl: ((process.env.VALLEY_LLM_BASE_URL ?? process.env.AFTERPARTY_LLM_BASE_URL) ?? "https://api.deepseek.com").replace(/\/$/, ""),
    apiKey: process.env.DEEPSEEK_API_KEY ?? (process.env.VALLEY_LLM_API_KEY ?? process.env.AFTERPARTY_LLM_API_KEY),
    architectModel: (process.env.VALLEY_ARCHITECT_MODEL ?? process.env.AFTERPARTY_ARCHITECT_MODEL) ?? Object.entries(prices.models).find(([, m]) => m.role === "architect")?.[0] ?? "deepseek-v4-pro",
    citizenModel: (process.env.VALLEY_CITIZEN_MODEL ?? process.env.AFTERPARTY_CITIZEN_MODEL) ?? Object.entries(prices.models).find(([, m]) => m.role === "citizen")?.[0] ?? "deepseek-v4-flash",
    spendCapUsd: Number((process.env.VALLEY_SPEND_CAP_USD ?? process.env.AFTERPARTY_SPEND_CAP_USD) ?? prices.spendCapUsdPerRun ?? 2),
  };
}

export function costOf(model: string, u: { promptTokens: number; cachedTokens: number; completionTokens: number }, prices = loadPrices()): number {
  const p = prices.models[model] ?? { input: 0, cachedInput: 0, output: 0 };
  return ((u.promptTokens - u.cachedTokens) * p.input + u.cachedTokens * p.cachedInput + u.completionTokens * p.output) / 1e6;
}

/** A meter shared by every call in one run; throws when the cap is crossed so a runaway loop cannot spend. */
export class Meter {
  calls = 0; promptTokens = 0; cachedTokens = 0; completionTokens = 0; costUsd = 0; capUsd: number;
  constructor(capUsd: number) { this.capUsd = capUsd; }
  /** Records the call first; the cap check is separate so a call that crosses the cap is still logged by the caller. */
  add(u: Usage) { this.calls++; this.promptTokens += u.promptTokens; this.cachedTokens += u.cachedTokens; this.completionTokens += u.completionTokens; this.costUsd += u.costUsd; }
  over(): boolean { return this.costUsd > this.capUsd; }
  capError(): Error { return new Error(`spend cap: $${this.costUsd.toFixed(3)} > $${this.capUsd} (VALLEY_SPEND_CAP_USD)`); }
  summary() { return `${this.calls} calls · ${this.promptTokens} in (${this.cachedTokens} cached) · ${this.completionTokens} out · $${this.costUsd.toFixed(4)}`; }
}

export interface ChatOpts { model: string; system: string; user: string; json?: boolean; temperature?: number; maxTokens?: number; meter?: Meter; seed?: number; reasoningEffort?: "none" | "low" | "high" | "max" }

/** Refuse to spend when the model has no price on file: the cap would be inert and "$0.0000" would be a lie. */
export function assertPriced(model: string, prices = loadPrices()) {
  const p = prices.models[model];
  if (!p || (p.input === 0 && p.output === 0)) throw new Error(`config/prices.json has no non-zero rates for "${model}" — fill them in from the provider's price sheet so the spend cap means something (or set VALLEY_ALLOW_UNPRICED=1 to run anyway)`);
}

export async function chat(o: ChatOpts, cfg = llmConfig()): Promise<ChatResult> {
  if (!cfg.apiKey) throw new Error("no API key: put DEEPSEEK_API_KEY=… in .env (see .env.example)");
  if (!(process.env.VALLEY_ALLOW_UNPRICED ?? process.env.AFTERPARTY_ALLOW_UNPRICED)) assertPriced(o.model);
  if (o.meter?.over()) throw o.meter.capError();
  const t0 = performance.now();
  const body: Record<string, unknown> = { model: o.model, messages: [{ role: "system", content: o.system }, { role: "user", content: o.user }], temperature: o.temperature ?? 0, max_tokens: o.maxTokens ?? 1024 };
  if (o.json) body.response_format = { type: "json_object" };
  // The architect tier thinks before it answers, out of the same token budget, and an answer asked for in a few hundred
  // tokens comes back empty having reasoned itself out of room. "none" is the switch for the work that needs no thinking.
  if (o.reasoningEffort) body.reasoning_effort = o.reasoningEffort;
  if (o.seed !== undefined) body.seed = o.seed;
  // transport errors and 5xx/429 are retried here with backoff, so an attempt of the pipeline is never burned on a hiccup
  let res: Response | undefined, lastErr = "";
  for (let i = 0; i < 4; i++) {
    try { res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(body) }); }
    catch (e) { lastErr = (e as Error).message; res = undefined; }
    if (res && res.ok) break;
    if (res && res.status < 500 && res.status !== 429) throw new Error(`${o.model}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    if (res) lastErr = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
    if (i < 3) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  if (!res || !res.ok) throw new Error(`${o.model}: ${lastErr} (after 4 tries)`);
  const data = await res.json() as any;
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const u = data.usage ?? {};
  const cached = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const usage: Usage = { promptTokens: u.prompt_tokens ?? 0, cachedTokens: cached, completionTokens: u.completion_tokens ?? 0, costUsd: 0 };
  usage.costUsd = costOf(o.model, usage);
  o.meter?.add(usage); // recorded; the caller logs the call, then the next call is refused if over the cap
  return { text, usage, model: o.model, ms: Math.round(performance.now() - t0), finishReason: data.choices?.[0]?.finish_reason };
}

/** Pull the first JSON object out of a model reply (tolerates code fences and leading prose). */
export function parseJson<T = unknown>(text: string): T {
  const s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(s) as T; } catch { /* fall through */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1)) as T;
  throw new Error(`no JSON object in reply: ${s.slice(0, 120)}`);
}

/** Rough token estimate for budgets (4 chars ≈ 1 token). */
export const estTokens = (s: string) => Math.ceil(s.length / 4);
