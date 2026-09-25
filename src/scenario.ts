import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateScenario } from "./validate.ts";
import { makeRng, hashString } from "./rng.ts";
import { TRAITS, type CitizenSeed, type Scenario, type TraitName } from "./types.ts";

const DEFAULT_NAMES = ["Ada", "Bram", "Cato", "Dell", "Eira", "Finn", "Greta", "Hal", "Ines", "Jory", "Kit", "Lena", "Milo", "Nell", "Oskar", "Pia", "Quill", "Rune", "Sif", "Teo", "Una", "Vidar", "Wren", "Xan", "Yara", "Zev", "Alva", "Bo", "Cleo", "Dag", "Elin", "Fen", "Gus", "Hedda", "Ivo", "Juno", "Kai", "Liv", "Mona", "Nils"];
const DEFAULT_WANTS = ["to be left alone", "to be needed", "to see what happens next", "to keep what they have", "to be proven right", "to leave a mark"];
const DEFAULT_FEARS = ["being forgotten", "being wrong in public", "having nothing", "being the last one left", "being blamed"];

/** Resolve a scenario id or path to a file. */
export function scenarioPath(idOrPath: string): string {
  if (existsSync(idOrPath)) return resolve(idOrPath);
  for (const dir of ["scenarios", "scenarios/critic", "scenarios/generated"]) {
    const p = resolve(dir, `${idOrPath}.json`);
    if (existsSync(p)) return p;
  }
  throw new Error(`scenario not found: ${idOrPath} (looked in scenarios/, scenarios/critic/, scenarios/generated/)`);
}

export function loadScenario(idOrPath: string): Scenario {
  const raw = JSON.parse(readFileSync(scenarioPath(idOrPath), "utf8"));
  const v = validateScenario(raw);
  if (!v.ok) throw new Error(`invalid scenario:\n  ${v.errors.join("\n  ")}`);
  return raw as Scenario;
}

/** Expand `fill` into concrete citizens, deterministically from the seed. Named citizens are untouched. */
export function expandCast(s: Scenario, seed: number): CitizenSeed[] {
  const cast = [...s.citizens];
  if (!s.fill || s.fill.count <= 0) return cast;
  const used = new Set(cast.map((c) => c.id));
  const taken = new Set(cast.map((c) => c.name.split(" ")[0].toLowerCase()));
  const names = [...(s.fill.names ?? DEFAULT_NAMES)].filter((n) => !taken.has(n.toLowerCase()));
  const namedIds = cast.map((c) => c.id);
  const homes = s.fill.homes ?? s.locations.filter((l) => l.tags.includes("rest") || l.tags.includes("private")).map((l) => l.id);
  const homePool = homes.length ? homes : s.locations.map((l) => l.id);
  const choiceIds = s.ending.choices.map((c) => c.id);
  for (let i = 0; i < s.fill.count; i++) {
    const rng = makeRng(seed).fork(`fill:${i}`); // one stream per seat: seat i is the same person whatever else changes
    const base = names.length ? names[hashString(`${seed}:name:${i}`) % names.length] : `Citizen${i}`;
    if (names.includes(base)) names.splice(names.indexOf(base), 1);
    let id = base.toLowerCase().replace(/[^a-z0-9]/g, ""), n = 2;
    while (used.has(id)) id = `${base.toLowerCase()}${n++}`;
    used.add(id);
    const shift = (s as any).fillTraitShift as Partial<Record<TraitName, number>> | undefined; // set by --vary trait:<name>
    const traits = Object.fromEntries(TRAITS.map((t) => [t, Math.min(1, Math.max(0, Math.round(rng.next() * 100) / 100 + (shift?.[t] ?? 0)))])) as Record<TraitName, number>;
    const c: CitizenSeed = {
      id, name: base, age: 18 + rng.int(50), role: rng.pick(s.fill.roles),
      want: rng.pick(s.fill.wants ?? DEFAULT_WANTS), fear: rng.pick(s.fill.fears ?? DEFAULT_FEARS),
      traits, home: rng.pick(homePool),
      lean: rng.chance(0.5) ? null : rng.pick(choiceIds),
      ties: [],
    };
    cast.push(c);
  }
  // Give fill citizens 1–2 ties to others so they are not islands. Targets are drawn from a stable list (named first, then seats),
  // so removing one citizen only removes their edges.
  const targets = [...namedIds, ...cast.slice(s.citizens.length).map((c) => c.id)];
  for (const [i, c] of cast.slice(s.citizens.length).entries()) {
    const rng = makeRng(seed).fork(`ties:${i}`);
    const n = 1 + rng.int(2);
    for (let k = 0; k < n; k++) {
      const pickId = targets[rng.int(targets.length)];
      const other = cast.find((x) => x.id === pickId);
      if (!other) continue;
      if (other.id === c.id || c.ties!.some((t) => t.to === other.id)) continue;
      const a = Math.round(rng.range(-0.4, 0.6) * 100) / 100;
      c.ties!.push({ to: other.id, affinity: a, why: a >= 0 ? `they work near each other` : `an old argument nobody remembers the start of` });
    }
  }
  return cast;
}

export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("");
}
