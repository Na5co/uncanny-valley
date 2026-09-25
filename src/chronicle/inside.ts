// What the people inside the town may know of it. The Architect's premise is written for the reader and often says what is
// coming ("a flood, a plague and a boom are coming, and nobody is told when") or who is being watched ("four of them are
// the ones the recorder watches"). Put in front of the four, that told them their own future: their thoughts named the
// plague before it came. Inside the town, the premise is only what the place is.
const OUTSIDE = /\b(four|recorder|record|watch(?:es|ed|ing)?|watched|coming|come through|will come|will bring|nobody is told|no one is told|not told|experiment|temperaments?|subjects?|protocol|the years (?:bring|will)|ahead of them|what is coming|lie ahead)\b/i;
// the words for each kind of hardship, so a sentence that names one of the town's own coming troubles is left out
const KIND_WORDS: Record<string, string> = { famine: "famine|hunger|harvest|starv\\w*", plague: "plague|sickness|fever|flu|pox|disease|epidemic", war: "war|soldiers|army|siege", winter: "winter|frost|freeze|cold snap", fire: "fire|blaze|burn\\w*", flood: "flood\\w*|the water rises", boom: "boom|good years|plenty", quake: "quake|earthquake" };
const ORDER = /\b(then a|then the|first a|first the|and last|at the last|near the end|in the middle years|late in|early on|in the years)\b/i;
/** the premise as the four may know it: what the place is. Not what is coming (the town's own hardships, named or put in
 *  order), not how long, not that they are watched */
export function premiseInside(premise: string | undefined | null, _sc?: { epochs?: { kind: string }[] } | null): string {
  // a sentence that lists hardships, or names one as still to come, or puts them in order, tells the future: it goes.
  // One named as how things are now ("a flooded station") stays
  const FUTURE = /\b(will|coming|ahead|to come|later|one day|someday|in time|before long|the years)\b/i;
  const count = (x: string) => Object.values(KIND_WORDS).filter((w) => new RegExp(`\\b(${w})\\b`, "i").test(x)).length;
  return String(premise ?? "").split(/(?<=[.!?])\s+/).filter((x) => { if (!x.trim() || OUTSIDE.test(x) || ORDER.test(x)) return false; const n = count(x); return !(n >= 2 || (n >= 1 && FUTURE.test(x))); }).join(" ");
}

/** the premise as a reader sees it: what the place is and what it faces, never the machinery ("four of them are the ones the
 *  recorder watches", "four temperaments") */
export function premiseForReaders(premise: string | undefined | null): string {
  return String(premise ?? "").split(/(?<=[.!?])\s+/).filter((s) => s.trim() && !/\b(four|recorder|temperaments?|subjects?|protocol|experiment|watches)\b/i.test(s)).join(" ");
}
