// Scenario format v0 — see docs/SCENARIO.md. The engine never knows what a "ferry" is.

export type TraitName = "sociable" | "bold" | "loyal" | "restless";
export const TRAITS: readonly TraitName[] = ["sociable", "bold", "loyal", "restless"];

export type TempoPreset = "live" | "day" | "instant";

export interface Scenario {
  id: string;
  title: string;
  premise: string;
  socialQuestion: SocialQuestion;
  fingerprint: { setting: string; pressure: string; endingShape: string; dynamic: string };
  clock: { hours: number; decisionEveryHours: number; reflectionAt: number[] };
  tempo: { preset: TempoPreset } | { realMinutesPerHour: number };
  boardingHours: number;
  locations: Location[];
  paths: [string, string][];
  resources?: Resource[];
  beliefs?: Belief[];
  events: ScenarioEvent[];
  ending: Ending;
  citizens: CitizenSeed[];
  /** Optional procedurally generated extras so a hand-written cast can stay short. */
  fill?: CastFill;
  playerSlots: number;
}

export interface SocialQuestion {
  text: string;
  hypothesis: string;
  measure: { outcome: "ending" | "changedMind"; splitBy: string; buckets?: number[] };
}

export interface Location { id: string; name: string; tags: string[]; x?: number; y?: number /* optional map placement, 0–1 */ }
export interface Resource { id: string; name: string; initial: number; perHour: number; visible: boolean }
export interface Belief { id: string; text: string; initial: number; about?: string /* citizen id the belief is about; they know the truth and never spread it */ }

export interface ScenarioEvent {
  id: string;
  at: number;
  jitterHours: number;
  chance: number;
  stakes: 1 | 2 | 3;
  where: string; // location id | "all"
  headline: string;
  text: string;
  effects?: {
    belief?: Record<string, number>;   // delta to confidence for citizens present
    mood?: number;                     // delta for citizens present
    resource?: Record<string, number>; // delta
  };
  removesOption?: boolean;
  /** A visual effect for the 3D view when the event fires: rain | storm | quake | fog | fire | snow | flood | eclipse | aurora | swarm | silence. Optional; the Architect may use it. */
  fx?: string;
  fxHours?: number;
}

export interface Ending {
  prompt: string;
  choices: EndingChoice[];
}
export interface EndingChoice { id: string; label: string; pull: Record<string, number> }

export interface CitizenSeed {
  id: string;
  name: string;
  age: number;
  role: string;
  want: string;
  fear: string;
  traits: Record<TraitName, number>;
  home: string;
  lean: string | null;
  ties?: Tie[];
  /** Set by `--vary citizen:<id>.remove=true`: the citizen is generated, then left out of the world, so nothing else in the cast changes. */
  absent?: boolean;
}
export interface Tie { to: string; affinity: number; why: string }

export interface CastFill {
  count: number;
  roles: string[];
  homes?: string[]; // defaults to all locations tagged "rest"/"private", else any
  wants?: string[];
  fears?: string[];
  names?: string[];
}
