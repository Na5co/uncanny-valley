// Replay cache: every brain call is keyed by a hash of its prompt/context. A fork reads its parent's calls.jsonl and
// answers identical calls from the log — zero spend — until the world's state diverges and the prompts stop matching.
import { readFileSync, existsSync } from "node:fs";
import type { Brain, Candidate, Decision, Reflection } from "./brain.ts";
import type { Citizen, World } from "../engine/state.ts";
import { hashString } from "../rng.ts";
import { stateHash } from "../engine/sim.ts";

export interface CallRecord { hash: string; kind: "decide" | "reflect"; hour: number; citizen: string; prompt?: string; response: unknown; replayed?: boolean; model?: string; usage?: unknown; fallback?: string | null; raw?: string; attempts?: { usage: unknown; raw: string; fallback?: string }[] }

export function loadCalls(dir: string): Map<string, CallRecord> {
  const m = new Map<string, CallRecord>();
  const f = `${dir}/calls.jsonl`;
  if (!existsSync(f)) return m;
  for (const line of readFileSync(f, "utf8").split("\n")) if (line.trim()) { const r = JSON.parse(line) as CallRecord; m.set(r.hash, r); }
  return m;
}

/** Wraps a brain: logs every call; serves from `parentCalls` when the same call was made before. Mock brains make no calls. */
export function withReplay(inner: Brain, parentCalls: Map<string, CallRecord>, log: CallRecord[]): Brain & { hits: number; misses: number } {
  // The key is everything the prompt would contain: who this person is, the world so far (down to the last applied action), and the choice they face.
  const persona = (c: Citizen) => `${c.id}|${c.seed.name}|${c.seed.want}|${c.seed.fear}|${Object.values(c.seed.traits).join(",")}|${c.seed.lean}`;
  // stateHash(world) is computed at call time, so an event that fired this hour or a talk that landed differently a moment ago already changes the key.
  const keyOf = (kind: string, world: World, c: Citizen, extra = "") => hashString(`${kind}|${world.scenario.id}|${world.hour}|${persona(c)}|${stateHash(world)}|${world.turnHash}|${extra}`).toString(16);
  let consumed = 0; // index into inner.log: every model attempt since the last call becomes part of this call's record
  const attemptsSince = () => { const l = (inner as any).log as any[] | undefined; if (!l) return undefined; const a = l.slice(consumed); consumed = l.length; return a.map((x) => ({ usage: x.usage, raw: x.response, ...(x.fallback ? { fallback: x.fallback } : {}) })); };
  const b = {
    name: inner.name, hits: 0, misses: 0,
    async decide(world: World, c: Citizen, cands: Candidate[]): Promise<Decision> {
      if (inner.name === "mock") return inner.decide(world, c, cands); // deterministic and free: nothing to log or replay
      const hash = keyOf("decide", world, c, cands.map((k) => `${k.id}:${k.target}`).join(","));
      const prev = parentCalls.get(hash);
      if (prev) { b.hits++; log.push({ ...prev, replayed: true }); return prev.response as Decision; }
      b.misses++;
      const d = await inner.decide(world, c, cands);
      const last = (inner as any).log?.at?.(-1); const attempts = attemptsSince();
      const usage = attempts?.length ? attempts.reduce((s: any, a: any) => ({ promptTokens: s.promptTokens + (a.usage?.promptTokens ?? 0), cachedTokens: s.cachedTokens + (a.usage?.cachedTokens ?? 0), completionTokens: s.completionTokens + (a.usage?.completionTokens ?? 0), costUsd: s.costUsd + (a.usage?.costUsd ?? 0) }), { promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 }) : last?.usage;
      log.push({ hash, kind: "decide", hour: world.hour, citizen: c.id, response: d, model: last?.model, usage, fallback: d.fallback ?? null, raw: last?.response, ...(attempts && attempts.length > 1 ? { attempts } : {}) });
      return d;
    },
    async reflect(world: World, c: Citizen): Promise<Reflection> {
      if (inner.name === "mock") return inner.reflect(world, c);
      const hash = keyOf("reflect", world, c);
      const prev = parentCalls.get(hash);
      if (prev) { b.hits++; log.push({ ...prev, replayed: true }); return prev.response as Reflection; }
      b.misses++;
      const r = await inner.reflect(world, c);
      const last = (inner as any).log?.at?.(-1); const attempts = attemptsSince();
      const usage = attempts?.length ? attempts.reduce((s: any, a: any) => ({ promptTokens: s.promptTokens + (a.usage?.promptTokens ?? 0), cachedTokens: s.cachedTokens + (a.usage?.cachedTokens ?? 0), completionTokens: s.completionTokens + (a.usage?.completionTokens ?? 0), costUsd: s.costUsd + (a.usage?.costUsd ?? 0) }), { promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 }) : last?.usage;
      log.push({ hash, kind: "reflect", hour: world.hour, citizen: c.id, response: r, model: last?.model, usage, fallback: (r as any).fallback ?? last?.fallback ?? null, raw: last?.response, ...(attempts && attempts.length > 1 ? { attempts } : {}) });
      return r;
    },
  };
  return b;
}
