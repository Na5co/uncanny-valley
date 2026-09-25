// Variants: the same scenario with one thing changed, so a population can be compared against itself.
import type { Scenario, TraitName } from "./types.ts";
import { TRAITS } from "./types.ts";

export interface Variant { label: string; scenario: Scenario; change: string; isBase: boolean; eventId?: string; eventField?: string; citizenId?: string; warnings: string[] }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/**
 * Spec forms (all deterministic, all pure data edits):
 *   trait:loyal[=-0.2,0,0.2]        shift every citizen's trait (named and fill) by each delta
 *   <trait>                         shorthand for trait:<trait>=-0.2,0,0.2
 *   event:<id>.at=32,44,56          set an event field to each value (at | chance | jitterHours | stakes)
 *   <token>-at | <token>-chance     shift the event whose id contains <token> by -12,0,+12 h / set chance 0,1
 *   belief:<id>.initial=0,0.5
 *   pull:<choice>.<factor>=0.2,0.6
 *   citizen:<id>.traits.bold=0.2,0.9  (any dotted path under a named citizen)
 *   clock.reflectionAt=24;48|24|48;60  (';' separates list items inside one value)
 */
export function makeVariants(base: Scenario, spec: string): Variant[] {
  const globalWarnings: string[] = [];
  let [path, valuesRaw] = spec.split("=", 2) as [string, string | undefined];
  // shorthands
  if ((TRAITS as readonly string[]).includes(path)) { path = `trait:${path}`; valuesRaw ??= "-0.2,0,0.2"; }
  const m = /^(.+)-(at|chance)$/.exec(path);
  if (m && !path.includes(":") && !path.includes(".")) {
    const ev = base.events.filter((e) => e.id.includes(m[1])).sort((a, b) => b.stakes - a.stakes)[0];
    if (!ev) throw new Error(`--vary ${spec}: no event id contains "${m[1]}" (events: ${base.events.map((e) => e.id).join(", ")})`);
    if (m[2] === "at") {
      // ±24 h keeps the hour of day (and so the room's occupancy) the same; fall back to ±12 h only when the clock is too short
      const H = base.clock.hours; const step = ev.at - 24 >= 2 && ev.at + 24 <= H - 2 ? 24 : 12;
      path = `event:${ev.id}.at`; valuesRaw ??= [ev.at - step, ev.at, ev.at + step].join(",");
      if (step === 12) globalWarnings.push(`${ev.id}: ±24 h does not fit the clock, using ±12 h — the hour of day changes, so compare the reach column before trusting the difference`);
    }
    else { path = `event:${ev.id}.chance`; valuesRaw ??= "0.05,1"; }
  }
  if (!valuesRaw) throw new Error(`--vary ${spec}: give values, e.g. ${path}=a,b,c`);
  const values = valuesRaw.split(",").map((v) => (v.includes(";") ? v.split(";").map(Number) : isNaN(Number(v)) ? v : Number(v)));

  return values.map((v) => {
    const s = clone(base);
    let change = "", eventId: string | undefined, eventField: string | undefined, citizenId: string | undefined; const warnings = [...globalWarnings];
    if (path.startsWith("trait:")) {
      const tr = path.slice(6) as TraitName; if (!(TRAITS as readonly string[]).includes(tr)) throw new Error(`unknown trait ${tr}`);
      const d = Number(v);
      for (const c of s.citizens) c.traits[tr] = clamp01(c.traits[tr] + d);
      (s as any).fillTraitShift = { ...((s as any).fillTraitShift ?? {}), [tr]: d }; // applied to generated citizens too (scenario.ts)
      change = `${tr} ${d >= 0 ? "+" : ""}${d} for everyone`;
    } else if (path.startsWith("event:")) {
      const [id, field] = path.slice(6).split(".", 2); const e = s.events.find((x) => x.id === id); if (!e) throw new Error(`unknown event ${id}`);
      if (!["at", "chance", "jitterHours", "stakes", "where"].includes(field)) throw new Error(`event field must be at | chance | jitterHours | stakes | where (got "${field}")`);
      if (field === "at") {
        const was = e.at;
        const finale = Math.max(...s.events.filter((x) => x.id !== id && x.stakes === 3).map((x) => x.at));
        if (Number(v) >= finale) warnings.push(`${id} at h${v} lands after the stakes-3 finale at h${finale}; whatever it changes, the ending is already being forced`);
        const hod = (h: number) => (h % 24 < 6 ? "night" : h % 24 < 17 ? "workday" : "evening");
        if (hod(Number(v)) !== hod(was)) warnings.push(`${id} at h${v} is ${hod(Number(v))}, as written (h${was}) is ${hod(was)} — the room will not hold the same people; compare reach`);
      }
      (e as any)[field] = v; change = `${id}.${field} = ${v}`; eventId = id; eventField = field;
    } else if (path.startsWith("belief:")) {
      const [id, field] = path.slice(7).split(".", 2); const b = s.beliefs?.find((x) => x.id === id); if (!b) throw new Error(`unknown belief ${id}`);
      if (field !== "initial") throw new Error(`belief field must be initial (got "${field}")`);
      (b as any)[field] = v; change = `${id}.${field} = ${v}`;
    } else if (path.startsWith("pull:")) {
      const [choice, factor] = path.slice(5).split(".", 2); const ch = s.ending.choices.find((x) => x.id === choice); if (!ch) throw new Error(`unknown choice ${choice}`);
      ch.pull[factor] = Number(v); change = `${choice}.pull.${factor} = ${v}`;
    } else if (path.startsWith("citizen:")) {
      const [id, ...rest] = path.slice(8).split("."); const c = s.citizens.find((x) => x.id === id); if (!c) throw new Error(`unknown citizen ${id}`);
      if (rest[0] === "remove") { if (v === true || v === "true") c.absent = true; else delete c.absent; change = `${id} ${c.absent ? "absent (everyone else unchanged)" : "present"}`; }
      else { setPath(c, rest, v); change = `${id}.${rest.join(".")} = ${v}`; }
      citizenId = id;
    } else { setPath(s, path.split("."), v); change = `${path} = ${Array.isArray(v) ? v.join(";") : v}`; }
    const isBase = JSON.stringify(stripShift(s)) === JSON.stringify(stripShift(base)) || (path.startsWith("trait:") && Number(v) === 0);
    return { label: isBase ? "as written" : String(Array.isArray(v) ? v.join(";") : v), scenario: s, change: isBase ? "as written" : change, isBase, eventId, eventField, citizenId, warnings };
  });
}

const stripShift = (s: Scenario) => { const { fillTraitShift: _, ...rest } = s as any; return rest; };

/** A background edit applied to every variant (e.g. `--with trait:bold=-0.3` to make the town timid before varying one citizen). */
export function applyWith(base: Scenario, spec: string): Scenario {
  const vs = makeVariants(base, spec.includes("=") ? spec : `${spec}=${spec}`);
  if (vs.length !== 1) throw new Error(`--with takes exactly one value, e.g. trait:bold=-0.3 (got ${vs.length})`);
  return vs[0].scenario;
}

function setPath(obj: any, keys: string[], v: unknown) {
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (o[k] === undefined) throw new Error(`no such field ${keys.join(".")}`); o = o[k]; }
  const last = keys[keys.length - 1];
  if (o[last] === undefined) throw new Error(`no such field ${keys.join(".")}`);
  o[last] = v;
}
