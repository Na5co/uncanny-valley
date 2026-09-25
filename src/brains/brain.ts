import type { Citizen, World } from "../engine/state.ts";

/** A candidate action the rules engine has already checked as legal. */
export interface Candidate {
  id: "rest" | "work" | "move" | "talk" | "share" | "confront" | "commit" | "wait";
  target: string | null;   // citizen id | location id | belief id | choice id
  label: string;
  score: number;           // engine's ranking; brains may override
}
export interface Decision { action: Candidate["id"]; target: string | null; thought: string; say?: string; fallback?: string; templated?: boolean }

export interface Brain {
  name: string;
  decide(world: World, c: Citizen, candidates: Candidate[]): Promise<Decision> | Decision;
  reflect(world: World, c: Citizen): Promise<Reflection> | Reflection;
}
export interface Reflection { lean: string | null; thought: string; answers?: string[] }
