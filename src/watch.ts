// Terminal feed: replays an archive at the scenario's tempo with a stakes board (docs/PACING.md §3–4).
import { readFileSync } from "node:fs";
import type { Record_ } from "./archive.ts";

const ESC = "\x1b[";
const dim = (s: string) => `${ESC}2m${s}${ESC}0m`, bold = (s: string) => `${ESC}1m${s}${ESC}0m`, inv = (s: string) => `${ESC}7m${s}${ESC}0m`;
const affinityWord = (a: number) => a > 0.6 ? "close" : a > 0.3 ? "friendly" : a > -0.3 ? "neutral" : a > -0.6 ? "strained" : "hostile";

export function secondsPerHour(tempo: string | undefined, fallback: string): number {
  const t = tempo ?? fallback;
  if (t === "live") return 45; if (t === "day") return 1200; if (t === "instant") return 0;
  const m = /^(\d+(?:\.\d+)?)(s|m)?$/.exec(t); if (!m) throw new Error(`bad tempo "${t}" — use live | day | instant | <n>s | <n>m`);
  return Number(m[1]) * (m[2] === "m" ? 60 : 1);
}

export function board(r: Record_, hour: number, width = 80, tallyHour = hour, shownCommits = new Set<string>()): string {
  const L: string[] = [];
  const tally = r.leanHistory.find((l) => l.hour === tallyHour)?.tally ?? {};
  const total = r.citizens.length;
  const phase = [...r.phases].reverse().find((p) => p.hour <= hour)?.name ?? "";
  const nextEv = r.events.filter((e) => !e.skipped && e.at > hour).sort((a, b) => a.at - b.at)[0];
  L.push(inv(` ${r.title} `) + `  hour ${String(hour).padStart(2, "0")}/${r.hours}  ` + bold(`${r.hours - hour}h left`) + `  ${dim(phase)}` + (nextEv ? dim(`  · something at h${nextEv.at}`) : ""));
  L.push(`${bold(r.ending.prompt)}`);
  const barW = Math.max(10, width - 34);
  for (const c of r.ending.choices) {
    const n = tally[c.id] ?? 0; const filled = Math.round((n / total) * barW);
    L.push(`  ${c.label.padEnd(24).slice(0, 24)} ${"█".repeat(filled)}${dim("░".repeat(barW - filled))} ${String(n).padStart(2)}`);
  }
  L.push(`  ${"undecided".padEnd(24)} ${dim(String(tally.undecided ?? 0))}`);
  const short = (n: string) => { const p = n.split(" "); return p[0].endsWith(".") && p[1] ? `${p[0]} ${p[1]}` : p[0]; };
  const leanAt = (c: Record_["citizens"][number]) => [...c.leanTimeline].filter((l) => l.hour <= hour).pop()?.lean ?? null;
  const lbl = (id: string | null) => id ? r.ending.choices.find((c) => c.id === id)?.label ?? id : "undecided";
  // threads: the pairs that moved in the last 12h, with the reason the record attached to the tie
  const recent = r.beats.filter((b) => b.hour > hour - 12 && b.hour <= hour && / ↔ /.test(b.headline));
  const byPair = new Map<string, string>();
  for (const b of recent) { const m = /^(.+?) ↔ (.+?): (\w+) → (\w+)/.exec(b.headline); if (m) byPair.set([m[1], m[2]].sort().join("|"), `${m[3]} → ${m[4]}${b.because ? ` — ${b.because}` : ""}`); }
  const threadLines = [...byPair.entries()].slice(-3).map(([k, v]) => { const [a, b] = k.split("|"); return `${short(a)} ↔ ${short(b)} ${dim(v)}`; });
  if (threadLines.length) L.push(dim("threads  ") + threadLines.join("\n         "));
  // who's about to act: commits in the next 3 hours (the archive knows), and who is close but leaning apart
  const soon = r.citizens.filter((c) => c.committedAt !== null && c.committedAt > hour && c.committedAt <= hour + 3).map((c) => `${short(c.name)} (${c.role})`);
  const opposed: string[] = [];
  const wordNow = (th: Record_["threads"][number]) => { const last = [...r.beats].filter((b) => b.hour <= hour && / ↔ /.test(b.headline) && ((b.headline.startsWith(`${th.aName} ↔ ${th.bName}`)) || b.headline.startsWith(`${th.bName} ↔ ${th.aName}`))).pop(); const m = last && /→ (\w+)/.exec(last.headline); return m ? m[1] : th.startWord; };
  for (const th of r.threads) if (wordNow(th) === "close") { const a = r.citizens.find((c) => c.id === th.a)!, b = r.citizens.find((c) => c.id === th.b)!; const la = leanAt(a), lb = leanAt(b); if (la && lb && la !== lb) opposed.push(`${short(a.name)} (${lbl(la)}) and ${short(b.name)} (${lbl(lb)}) are close and leaning apart`); }
  const hints: string[] = [];
  const tw = r.beats.filter((b) => b.hour <= hour && b.hour > hour - 12 && b.headline.startsWith("Watch: ")).slice(-2).map((b) => b.headline.slice(7));
  hints.push(...tw);
  if (soon.length) hints.push(`about to decide: ${soon.slice(0, 3).join(", ")}`);
  if ((tally.undecided ?? 0) > 0) hints.push(`${tally.undecided} undecided`);
  const committedSoFar = r.citizens.filter((c) => c.committedAt !== null && (c.committedAt < hour || (c.committedAt === hour && shownCommits.has(c.id)))).length;
  if (committedSoFar) hints.push(`${committedSoFar}/${total} committed`);
  if (hints.length) L.push(dim("watch    ") + hints.join(" · "));
  for (const o of opposed.slice(0, 2)) L.push(dim("         ") + o);
  return L.join("\n");
}

export async function watch(dir: string, opts: { tempo?: string; from?: number; to?: number; width?: number }) {
  const r: Record_ = JSON.parse(readFileSync(`${dir}/record.json`, "utf8"));
  const sph = secondsPerHour(opts.tempo, "live");
  const from = opts.from ?? 0, to = opts.to ?? r.hours;
  const beats = r.beats.filter((b) => b.level >= 2);
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const draw = (hour: number, tail: typeof beats, tallyHour = hour) => {
    const shownCommits = new Set(shown.filter((b) => b.hour === hour && / commits /.test(b.headline)).flatMap((b) => b.who ?? []));
    const out = [board(r, hour, opts.width ?? 80, tallyHour, shownCommits), "", ...tail.map((b) => b.level === 1 ? dim(`  h${String(b.hour).padStart(2, "0")}     ${b.headline}`) : `  ${dim(`h${String(b.hour).padStart(2, "0")}`)} ${b.level === 3 ? bold("•••") : dim("•• ")} ${b.level === 3 ? bold(b.headline) : b.headline}${b.because ? dim(`  — ${b.because}`) : ""}${b.thought ? dim(`  — "${b.thought}"`) : ""}`)];
    process.stdout.write((sph ? `${ESC}2J${ESC}H` : "") + out.join("\n") + "\n");
  };
  const shown: typeof beats = [];
  const ambient = (h: number) => { // a quiet hour shows a minor beat if there is one, else a dim line of ordinary life
    const minor = r.beats.find((b) => b.hour === h && b.level === 1 && !/present\)$/.test(b.headline));
    if (minor) return minor;
    const c = r.citizens.filter((c) => c.named)[h % Math.max(1, r.citizens.filter((c) => c.named).length)];
    const m = c?.routine?.find((x) => x.hour === h);
    return m ? { hour: h, level: 1 as const, headline: `${c.name} ${m.text}`, who: [c.id] } : null;
  };
  for (let h = from; h <= to; h++) {
    const hb = beats.filter((b) => b.hour === h);
    if (sph === 0) { shown.push(...hb); continue; }
    if (hb.length === 0) { const a = ambient(h); if (a) shown.push(a); draw(h, shown.slice(-12)); await sleep(sph * 1000); continue; }
    const gap = (sph * 1000) / hb.length;
    for (let i = 0; i < hb.length; i++) { shown.push(hb[i]); draw(h, shown.slice(-12), i === hb.length - 1 ? h : h - 1); await sleep(gap); }
  }
  if (sph === 0) draw(to, shown);
  process.stdout.write(`\n${bold(to >= r.hours ? "The world has ended." : `Paused at hour ${to}.`)} ${dir}/record.md\n`);
}
