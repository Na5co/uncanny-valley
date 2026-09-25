// Mock brain: free, deterministic, heuristic. Picks among engine candidates with personality-weighted noise.
import type { Brain, Candidate, Decision, Reflection } from "./brain.ts";
import type { Citizen, World } from "../engine/state.ts";
import { preference } from "../engine/ending.ts";

const who = (world: World, k: Candidate) => { const full = k.target ? world.byId.get(k.target.split("|").pop()!)?.seed.name : undefined; return full ? (full.split(" ")[0].endsWith(".") ? full.split(" ").slice(0, 2).join(" ") : full.split(" ")[0]) : ""; };
// What the mock says out loud on a talk — a line addressed to the other person. The Flash brain replaces this.
function mockSay(world: World, c: Citizen, k: Candidate): string {
  const left = world.scenario.clock.hours - world.hour, lbl = c.lean ? world.scenario.ending.choices.find((x) => x.id === c.lean)?.label : undefined;
  const w = who(world, k);
  if (left < 12 && lbl) return `${w}, I've made up my mind: ${lbl}. Where do you stand?`;
  if (c.lean === null) return `${w}, what are you going to do? I can't settle it.`;
  return `${w}, are you hearing the same things I am?`;
}
// Templated inner voice so beats read as a person, not a log line. The Flash brain replaces this.
function mockThought(world: World, c: Citizen, k: Candidate): string {
  const left = world.scenario.clock.hours - world.hour, t = c.seed.traits;
  const full = k.target ? world.byId.get(k.target.split("|").pop()!)?.seed.name : undefined;
  const who = full ? (full.split(" ")[0].endsWith(".") ? full.split(" ").slice(0, 2).join(" ") : full.split(" ")[0]) : "";
  switch (k.id) {
    case "talk": return t.sociable > 0.6 ? `${who} will know what people are saying.` : left < 12 ? `If I don't say it to ${who} now I never will.` : `I should hear what ${who} thinks.`;
    case "confront": return t.bold > 0.7 ? `${who} owes me an answer.` : `I've held this in long enough with ${who}.`;
    case "share": return `${who} ought to know.`;
    case "commit": return left < 8 ? `No more turning it over. This is what I do.` : t.loyal > 0.6 ? `I know where I stand.` : `Decided. Before I talk myself out of it.`;
    case "work": return left < 24 ? `Keep the hands busy. It stops the thinking.` : `The work is still here, so I am.`;
    case "rest": return c.energy < 0.3 ? `I can't think straight. Sleep first.` : `Let the day settle.`;
    case "move": return left < 12 ? `Not much time. Where I need to be.` : t.restless > 0.6 ? `Can't sit still.` : `See who's about.`;
    default: return `Wait. Watch.`;
  }
}

export const mockBrain: Brain = {
  name: "mock",
  decide(world: World, c: Citizen, cands: Candidate[]): Decision {
    const rng = world.rng.fork(`mock:${c.id}:${world.hour}`);
    let best: Candidate = cands[0], bestScore = -Infinity;
    for (const k of cands) {
      const s = k.score + rng.range(-0.12, 0.12) + (k.id === "confront" ? c.seed.traits.bold - 0.5 : 0);
      if (s > bestScore) { bestScore = s; best = k; }
    }
    const say = best.id === "talk" ? mockSay(world, c, best) : best.id === "confront" ? `${who(world, best)}, you owe me an answer.` : undefined;
    return { action: best.id, target: best.target, thought: mockThought(world, c, best), ...(say ? { say } : {}), templated: true };
  },
  reflect(world: World, c: Citizen): Reflection {
    const { best, margin } = preference(world, c);
    const pressure = world.hour / world.scenario.clock.hours;
    // The loyal change their minds less readily; everyone changes them more readily as the clock runs down.
    const flipThreshold = (0.15 + c.seed.traits.loyal * 0.25) * (1 - pressure * 0.5);
    const decideThreshold = 0.03 + 0.25 * (1 - pressure); // the undecided make up their minds gradually, not all on night one
    const t = c.seed.traits;
    if (c.lean === null) return margin > decideThreshold ? { lean: best, thought: t.bold > 0.6 ? "Right. I know what I'd do." : "I think I know what I want." } : { lean: null, thought: "Still not sure." };
    if (best !== c.lean && margin > flipThreshold) return { lean: best, thought: t.loyal > 0.6 ? "I didn't want to change my mind. I have." : pressure > 0.6 ? "No time left to pretend otherwise." : "Something changed today." };
    return { lean: c.lean, thought: "Same as before." };
  },
};
