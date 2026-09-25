// `uncanny-valley preflight` — everything that must be true before the site is put in front of anyone, checked in one pass.
// Read-only: it makes no calls and writes nothing. Exit code 1 if anything is a hard stop.
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPrices, llmConfig } from "./llm/client.ts";
import { loadChronicleScenario } from "./live/server.ts";
import { validateChronicle, soakChronicle } from "./chronicle/validate.ts";
import { readCycles } from "./chronicle/cycles.ts";

export interface Check { name: string; ok: boolean; hard: boolean; detail: string; fix?: string }

const ok = (name: string, detail: string): Check => ({ name, ok: true, hard: false, detail });
const bad = (name: string, detail: string, fix: string, hard = true): Check => ({ name, ok: false, hard, detail, fix });

export async function preflight(o: { scenario?: string; root?: string; brain?: string } = {}): Promise<Check[]> {
  const root = o.root ?? "."; const want = (o.brain ?? "flash") !== "mock";
  const cs: Check[] = [];

  const major = Number(process.versions.node.split(".")[0]);
  cs.push(major >= 22 ? ok("node", `${process.versions.node} — native TypeScript, no build step`) : bad("node", `${process.versions.node}`, "node 22.18 or newer is required (it runs the .ts files directly)"));

  // the key, the endpoint, the models
  const cfg = llmConfig();
  if (!want) cs.push({ name: "model", ok: true, hard: false, detail: "running on the mock brain — no key needed, and no result about a model" });
  else if (!cfg.apiKey) cs.push(bad("api key", "no DEEPSEEK_API_KEY (or VALLEY_LLM_API_KEY) in the environment", "put it in .env — cp .env.example .env and fill DEEPSEEK_API_KEY"));
  else cs.push(ok("api key", `present (…${cfg.apiKey.slice(-4)}) · ${cfg.baseUrl}`));

  // prices: the spend cap is inert without them, and the client refuses to call
  try {
    const prices = loadPrices();
    const priced = (m: string) => { const p = prices.models[m]; return !!p && (p.input > 0 || p.output > 0); };
    const missing = [cfg.architectModel, cfg.citizenModel].filter((m) => !priced(m));
    if (!want) cs.push(ok("prices", "not needed on the mock brain"));
    else if (missing.length) cs.push(bad("prices", `config/prices.json has no non-zero rates for ${missing.join(", ")}`, "fill input/output USD per 1M tokens from the provider's price sheet; the client refuses to spend against a price of zero"));
    else cs.push(ok("prices", `${cfg.architectModel} and ${cfg.citizenModel} priced · cap $${prices.spendCapUsdPerRun}/run`));
  } catch (e) { cs.push(bad("prices", (e as Error).message, "check config/prices.json is valid JSON")); }

  // the scenario the site will run, statically and over ten seeds
  const name = o.scenario ?? "the-many";
  try {
    const sc = loadChronicleScenario(name);
    const v = validateChronicle(sc);
    if (!v.ok) cs.push(bad("scenario", `${name}: ${v.errors.slice(0, 3).join("; ")}`, "pnpm validate scenarios/chronicle/<world>.json and fix what it names"));
    else {
      const subjects = sc.cast?.length ? `${sc.cast.length} in the company, ${sc.castPick ?? 4} drawn a run` : `${sc.citizens.length} subjects`;
      const sk = await soakChronicle(sc, 10);
      if (sk.problems.length) cs.push(bad("scenario soak", `${name}: ${sk.problems[0]}`, "the world is too lethal or too quiet over ten seeds — adjust the epochs or the dilemma weights", false));
      else cs.push(ok("scenario", `${name} · ${subjects} · ten seeds live and die`));
    }
  } catch (e) { cs.push(bad("scenario", `${name}: ${(e as Error).message}`, "check the file exists and is valid JSON")); }

  // somewhere to keep the runs, and what is already there
  for (const d of ["cycles", "archive", "live"]) {
    const p = join(root, d);
    if (!existsSync(p)) { cs.push({ name: d, ok: true, hard: false, detail: "will be created on the first run" }); continue; }
    try { const n = readdirSync(p).length; cs.push(ok(d, `${n} entr${n === 1 ? "y" : "ies"}`)); } catch { cs.push(bad(d, "exists but cannot be read", `chown the directory to the user the service runs as`)); }
  }
  const rows = (() => { try { return readCycles(o.scenario ?? "the-many", join(root, "cycles")).length; } catch { return 0; } })();
  cs.push({ name: "runs on file", ok: rows > 0, hard: false, detail: rows ? `${rows} finished run${rows === 1 ? "" : "s"} — findings and the company have something to read` : "none yet: /history and /who will be thin until the first run ends", fix: rows ? undefined : "pnpm cycle <world> --count 20 seeds them in a couple of minutes on the mock brain" });

  // the web files the server hands out
  const web = ["web/town.js", "web/town.css", "web/draw.mjs", "web/pixel.mjs"].filter((f) => !existsSync(f));
  cs.push(web.length ? bad("web", `missing ${web.join(", ")}`, "the repository is incomplete — check out the whole tree") : ok("web", "town.js, town.css, draw.mjs, pixel.mjs"));

  // disk: an archive is ~1.5 MB a run
  try {
    const st = statSync(root);
    void st; const { execSync } = await import("node:child_process");
    const out = execSync(`df -Pk ${JSON.stringify(root)}`, { encoding: "utf8" }).trim().split("\n")[1].split(/\s+/);
    const freeGb = Number(out[3]) / 1024 / 1024;
    cs.push(freeGb > 2 ? ok("disk", `${freeGb.toFixed(1)} GB free · an archived run is ~1.5 MB (≈ ${Math.floor(freeGb * 1024 / 1.5)} runs)`) : bad("disk", `${freeGb.toFixed(1)} GB free`, "archives are ~1.5 MB a run; free some space or point --root at a bigger disk", false));
  } catch { cs.push({ name: "disk", ok: true, hard: false, detail: "not checked" }); }

  return cs;
}

export function report(cs: Check[]): string {
  const w = Math.max(...cs.map((c) => c.name.length));
  const lines = cs.map((c) => `  ${c.ok ? "✓" : c.hard ? "✗" : "!"} ${c.name.padEnd(w)}  ${c.detail}${c.fix && !c.ok ? `\n      → ${c.fix}` : ""}`);
  const hard = cs.filter((c) => !c.ok && c.hard).length, soft = cs.filter((c) => !c.ok && !c.hard).length;
  return [...lines, "", hard ? `${hard} hard stop${hard === 1 ? "" : "s"}${soft ? ` and ${soft} warning${soft === 1 ? "" : "s"}` : ""} — not ready.` : soft ? `Ready, with ${soft} warning${soft === 1 ? "" : "s"}.` : "Ready."].join("\n");
}
