// Chronicle mode: years compressed into minutes. People face situations; what they do is who they become.
import type { TraitName } from "../types.ts";

export interface ChronicleScenario {
  id: string;
  mode: "chronicle";
  title: string;
  premise: string;
  years: number;                 // ticks = years × 4 seasons
  startYear?: number;
  fingerprint: { setting: string; pressure: string; endingShape: string; dynamic: string };
  socialQuestion: { text: string; hypothesis: string };
  locations: { id: string; name: string; tags: string[]; x?: number; y?: number }[];
  paths: [string, string][];
  jobs: { id: string; name: string; at: string; pay: number; risk?: number }[]; // pay per season 0–1
  epochs: Epoch[];
  citizens: Person[];
  cast?: Person[]; // a company: the subjects of a run are drawn from here, so the same characters recur across worlds
  castPick?: number; // how many of the cast take part in one run (default 4)
  include?: string[]; // other scenarios whose dilemmas are mixed into this world's
  fill?: { count: number; roles?: string[]; wants?: string[]; fears?: string[] };
  /** extra dilemmas written for this world (same shape as the built-in library, data-only) */
  dilemmas?: DilemmaSpec[];
}

export interface Epoch {
  id: string;
  at: number;              // tick
  seasons: number;         // duration
  kind: "famine" | "plague" | "war" | "winter" | "festival" | "reform" | "boom" | "flood" | "fire" | "omen";
  headline: string;
  text: string;
  severity: 1 | 2 | 3;
  fx?: string;
}

export interface Person {
  id: string; name: string; age: number; role: string; want: string; fear: string; trait?: { name: string; text: string };
  traits: Record<TraitName, number>;
  home: string | null; job: string | null; partner?: string | null; children?: number; money?: number;
  ties?: { to: string; affinity: number; why: string }[];
}

export interface DilemmaSpec {
  id: string;
  /** conditions on the actor; all must hold. keys: starving, sick, poor, rich, employed, jobless, hasFamily, hasChildren, homeless, widowed, young, old, known:thief, known:helper, epoch:<kind>, season:<0-3> */
  when: string[];
  /** optional target: nearby | partner | child | richer | poorer | sick | stranger | rival | friend */
  target?: string;
  weight: number;
  casual?: boolean;
  text: string;            // {{name}} {{target}} {{place}} {{season}}
  /** where it happens, as a tag the town's places carry (public, work, home): the person's own place if it has the tag,
   *  else the other person's, else the first that does. Without it, where the person works or lives. The cards are
   *  shared by every town, so they name the place by this and never by one town's name for it. */
  at?: string;
  /** alternative phrasings of the same situation, chosen by the dice, so ten people do not read the same sentence */
  texts?: string[];
  /** a quiet season: rendered as a sentence, not as a dilemma */
  quiet?: boolean;
  options: DilemmaOption[];
  /** a named protocol from social psychology, so the page can name the study and its human baseline; effect: the option ids that count as the studied effect (obeyed, conformed, defected…) */
  experiment?: { id: string; name: string; study: string; baseline: string; effect: string[]; effectLabel: string; effectB?: string[]; effectLabelB?: string; delta?: string; debrief?: string; rates?: (number | null)[]; ratesB?: (number | null)[] };
  /** manipulated conditions: one is drawn when the situation is offered; its fills go into the text; the record carries its id, so the board can report the difference the study measured */
  conditions?: { id: string; label: string; fill: Record<string, string>; weight?: number; target?: string; mock?: { harm?: number } }[];
  /** a two-player game: the target decides too, at the same time, and the matrix "<mine>:<theirs>" says what comes of it */
  pair?: { text: string; options: { id: string; label: string; pull: DilemmaOption["pull"]; voice?: string[] }[]; matrix: Record<string, { text: string; theirText: string; self?: Delta; target?: Delta; deed?: DeedSpec; theirDeed?: DeedSpec; moot?: boolean }> };
}
export interface DilemmaOption {
  id: string; label: string;
  /** base pull: trait-weighted expected score for the mock; the model reads only the label */
  pull: Partial<Record<TraitName | "hunger" | "poverty" | "danger" | "family", number>>;
  /** what happens; each outcome has a chance and consequences */
  /** first person, present tense: what the person thinks as they choose this; {{target}} {{want}} {{fear}} {{children}}. The mock brain speaks with these; the model brain speaks for itself */
  voice?: string[];
  /** where the evening goes, for the scene: work | home | tavern | chapel | square | visit (the target's home) */
  evening?: "work" | "home" | "tavern" | "chapel" | "square" | "visit";
  outcomes: { chance: number; text: string; self?: Delta; target?: Delta; deed?: DeedSpec; world?: { supply?: number }; move?: string; leave?: boolean; die?: DeathCause; targetDie?: DeathCause }[];
}
export interface Delta { health?: number; food?: number; money?: number; mood?: number; children?: number; tie?: number; sick?: boolean; home?: string | null; job?: string | null; partner?: string | null }
export type DeathCause = "hunger" | "sickness" | "exposure" | "violence" | "old age" | "childbirth" | "accident";
export interface DeedSpec { kind: "theft" | "violence" | "betrayal" | "abandonment" | "lie" | "help" | "gift" | "rescue" | "sacrifice" | "mercy" | "justice" | "loyalty"; harm?: number; help?: number; text: string }
export interface Deed { tick: number; kind: DeedSpec["kind"]; actor: string; target: string | null; harm: number; help: number; text: string; witnessed: boolean; /** false: done where nobody saw and the one it was done to does not know who did it, until it comes out */ known?: boolean }
