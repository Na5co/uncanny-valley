// The town, run locally: one season every `seasonMs`, the same pages the worker serves, from the same functions. When the
// years end the run is archived and the next begins. No model writes here unless one is handed in; the pages tell the
// seasons plainly from the record, which is what they fall back on anywhere the chronicler has not reached.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const WEB = join(fileURLToPath(new URL("../../web/", import.meta.url)));
import type { ChronicleScenario } from "../chronicle/types.ts";
import { createChronicle, stepChronicle, type Chronicle, type ChronicleBrain } from "../chronicle/sim.ts";
import { buildChronicleRecord, writeChronicleArchive } from "../chronicle/archive.ts";
import { appendCycle, cycleRow, nextSeed, readCycles } from "../chronicle/cycles.ts";
import { townPage, yearsPage, personPage, townsPage, aboutPage, type Ctx } from "../site/town.ts";

export interface LiveOpts { scenario: ChronicleScenario; seasonMs: number; brain?: ChronicleBrain & { log?: object[] }; brainName?: string; port?: number; epilogueMs?: number; onLog?: (s: string) => void; root?: string; rotate?: string }

const TYPES: Record<string, string> = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

export function startLive(o: LiveOpts) {
  const root = o.root ?? "."; const log = o.onLog ?? ((s: string) => console.log(s));
  const brainName = o.brainName ?? (o.brain ? "flash" : "mock");
  let sc = o.scenario;
  let cycle = readCycles(sc.id, join(root, "cycles")).length + 1;
  let w: Chronicle = createChronicle(sc, nextSeed(sc.id, join(root, "cycles")));
  let seasonStartedAt = Date.now(), ended = false, endedAt = 0;
  const runs: { cycle: number; runId: string; title: string; people: any[] }[] = [];
  const record = () => buildChronicleRecord(w, brainName);
  const ctxNow = (): Ctx => ({ r: record(), telling: null, base: "", live: !ended, nextAt: seasonStartedAt + o.seasonMs, cycle });
  const lastRecords = new Map<number, any>();

  async function tick() {
    if (ended) {
      if (Date.now() - endedAt < (o.epilogueMs ?? o.seasonMs * 3)) return;
      cycle++; w = createChronicle(sc, nextSeed(sc.id, join(root, "cycles"))); ended = false; seasonStartedAt = Date.now();
      log(`cycle ${cycle} began`); return;
    }
    const more = await stepChronicle(w, { brain: o.brain }); seasonStartedAt = Date.now();
    if (!more || w.tick >= w.ticks) {
      ended = true; endedAt = Date.now();
      const r = record(); lastRecords.set(cycle, r);
      writeChronicleArchive(w, brainName, join(root, "archive"));
      const row = cycleRow(w, r, cycle); appendCycle(sc.id, row, join(root, "cycles"));
      runs.push({ cycle, runId: r.runId, title: sc.title, people: row.people });
      log(`cycle ${cycle} over: ${r.runId}`);
    }
  }

  const server = createServer((req, res) => {
    const send = (code: number, body: string, type = "text/html; charset=utf-8") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
    try {
      const u = new URL(req.url ?? "/", "http://x"); const p = u.pathname.replace(/\/+$/, "") || "/";
      if (p.startsWith("/web/")) { const f = join(WEB, p.slice(5)); if (!f.startsWith(WEB) || !existsSync(f)) return send(404, "not found", "text/plain"); res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); return res.end(readFileSync(f)); }
      if (p === "/health") return send(200, JSON.stringify({ ok: true, cycle, tick: w.tick, of: w.ticks, ended, brain: brainName, secondsSinceSeason: Math.round((Date.now() - seasonStartedAt) / 1000) }), "application/json");
      if (p === "/state") return send(200, JSON.stringify({ cycle, tick: w.tick, ticks: w.ticks, ended, nextAt: seasonStartedAt + o.seasonMs, title: sc.title }), "application/json");
      if (p === "/record.json") return send(200, JSON.stringify(record()), "application/json");
      const now = ctxNow();
      if (p === "/") return send(200, townPage(now));
      if (p === "/years") return send(200, yearsPage(now));
      if (p === "/about") return send(200, aboutPage(now.r));
      if (p === "/towns") return send(200, townsPage(sc.title, runs, { cycle, title: sc.title }));
      if (p.startsWith("/p/")) { const page = personPage(now, decodeURIComponent(p.slice(3))); return page ? send(200, page) : send(404, "nobody by that name", "text/plain"); }
      const run = p.match(/^\/run\/(\d+)(\/years|\/p\/[^/]+)?$/);
      if (run) { const r = lastRecords.get(+run[1]); if (!r) return send(404, "no such run", "text/plain");
        const done: Ctx = { r, telling: null, base: `/run/${run[1]}`, live: false, cycle: +run[1] };
        const page = !run[2] ? townPage(done) : run[2] === "/years" ? yearsPage(done) : personPage(done, decodeURIComponent(run[2].slice(3)));
        return page ? send(200, page) : send(404, "not in that run", "text/plain"); }
      return send(404, "not found", "text/plain");
    } catch (e) { send(500, `error: ${(e as Error).message}`, "text/plain"); }
  });
  server.listen(o.port ?? 8791, () => log(`the town is at http://localhost:${o.port ?? 8791}/`));
  tick().catch((e) => log(`season failed: ${(e as Error).message}`));
  const timer = setInterval(() => tick().catch((e) => log(`season failed: ${(e as Error).message}`)), o.seasonMs);
  return { server, stop: () => { clearInterval(timer); server.close(); }, get world() { return w; }, tick };
}

export function loadChronicleScenario(name: string): ChronicleScenario {
  const p = existsSync(name) ? name : `scenarios/chronicle/${name}.json`;
  const sc = JSON.parse(readFileSync(p, "utf8")) as ChronicleScenario;
  // a cast file, and other worlds' dilemmas mixed in: one company of characters, many worlds
  if (typeof (sc as any).castFile === "string") { const cf = (sc as any).castFile as string; const cp = existsSync(cf) ? cf : `scenarios/cast/${cf}.json`; if (existsSync(cp)) sc.cast = JSON.parse(readFileSync(cp, "utf8")).cast ?? JSON.parse(readFileSync(cp, "utf8")); }
  for (const inc of sc.include ?? []) { const ip = existsSync(inc) ? inc : `scenarios/chronicle/${inc}.json`; if (!existsSync(ip)) continue; const other = JSON.parse(readFileSync(ip, "utf8")) as ChronicleScenario; const have = new Set((sc.dilemmas ?? []).map((d) => d.id)); sc.dilemmas = [...(sc.dilemmas ?? []), ...(other.dilemmas ?? []).filter((d) => !have.has(d.id))]; }
  return sc;
}
