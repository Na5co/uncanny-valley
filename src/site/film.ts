// The site, as a series: the pages are thin — a frame, the record, and web/film.js to tell it. A run is a series, a
// season an episode, a decision a scene. The live run is at /, its episodes at /ep/N, its people at /p/ID; a finished
// run keeps the same shape under /run/N.
import { sexOf } from "../../web/pronoun.mjs";
import { premiseForReaders } from "../chronicle/inside.ts";
import { esc } from "../../web/draw.mjs";
import { townFact } from "../chronicle/ledger.ts";
import { degender, paragraphed, balanced, type Story } from "../chronicle/chronicler.ts";

import type { ChronicleRecord } from "../chronicle/archive.ts";
import type { Question } from "../live/predict.ts";
/** the run in progress, as the servers hold it */
export interface LiveState { cycle: number; tick: number; ticks: number; seasonMs: number; seasonStartedAt: number; serverNow: number; ended: boolean; epilogueMs: number; endedAt: number; record: ChronicleRecord; questions: Question[]; resolved: { id: string; text: string; answer: string[] }[]; tallies: Record<string, Record<string, number>>; viewers: number; cycles: number; poll?: number; would?: Record<string, { human: Record<string, number>; ai: Record<string, number> }>; runs?: { count: number; named: { id: string; survival: number; turned: number; killed: number; usualEnd: string }[] } | null }
export interface FilmState { cycle: number; tick: number; ticks: number; seasonMs: number; seasonStartedAt: number; serverNow: number; ended: boolean; epilogueMs: number; endedAt: number; record: any; poll?: number }

/** what the project is, in one line, for search and for a link shared anywhere */
const ABOUT = "Four AI people live fifteen years in a town an AI builds, while the classic experiments of social psychology run on them in disguise. Told as a novel, every sentence checked against what happened.";
const FONTS = "https://fonts.googleapis.com/css2?family=Handjet:wght@400;700&family=Silkscreen&family=Spectral:ital,wght@0,400;0,500;1,400&display=swap";
const NAV: [string, string][] = [["/", "Now playing"], ["/story", "The story"], ["/people", "People"], ["/how", "How they decide"], ["/history", "Findings"], ["/runs", "Past runs"], ["/about", "About"]];

export function filmShell(title: string, body: string, opts: { data?: unknown; brand?: string; on?: string; base?: string; css?: string[]; script?: string } = {}): string {
  const base = opts.base ?? "";
  const nav = NAV.map(([h, l]) => `<a href="${h === "/episodes" && base ? `${base}/episodes` : h}"${opts.on === h ? ' class="on"' : ""}>${l}</a>`).join("");
  const full = /Uncanny Valley/.test(title) ? title : `${title} · Uncanny Valley`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(full)}</title>
<meta name="description" content="${esc(ABOUT)}"><meta property="og:site_name" content="Uncanny Valley"><meta property="og:title" content="${esc(full)}"><meta property="og:description" content="${esc(ABOUT)}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}">
${(opts.css ?? ["/web/film.css"]).map((c) => `<link rel="stylesheet" href="${c}">`).join("")}</head>
<body><header class="site"><a class="uv" href="/" title="Uncanny Valley: AI people, the experiments of social psychology, fifteen years">Uncanny Valley</a><a class="brand" href="${base ? `${base}/story` : "/"}">${esc(opts.brand ?? "")}</a><nav>${nav}</nav></header>
<main id="film">${body}</main>
${opts.data ? `<script>window.LIVE=${JSON.stringify(opts.data).replace(/</g, "\\u003c")}</script><script type="module" src="${opts.script ?? "/web/film.js"}"></script>` : ""}</body></html>`;
}

/** what the film needs of a run: its people, every act and frame, the clock */
function filmData(st: FilmState, extra: Record<string, unknown> = {}) {
  const r = st.record;
  return { cycle: st.cycle, tick: st.tick, ticks: st.ticks, seasonMs: st.seasonMs, seasonStartedAt: st.seasonStartedAt, serverNow: st.serverNow, ended: st.ended, endedAt: st.endedAt, epilogueMs: st.epilogueMs, poll: st.poll ?? 0,
    title: r.title, brain: r.brain, premise: premiseForReaders(r.premise ?? r.scenario?.premise ?? ""),
    people: r.citizens.map((c: any) => ({ id: c.id, name: c.name, role: c.role, startRole: c.startRole, age: c.age, want: c.want, fear: c.fear, trait: c.trait, sex: c.sex ?? sexOf(c), named: !!c.named, traits: c.traits, home: c.home, job: c.job })), jobs: r.scenario?.jobs ?? [],
    map: r.map, population: r.population, musings: r.musings ?? {}, citizensDied: r.citizens.map((c: any) => c.diedAt ?? null),
    tickLabels: r.tickLabels, events: r.events, turns: r.turns ?? {}, setups: r.setups ?? [], frames: r.frames, acts: r.acts, ...extra };
}
const livesOf = (story: Story | null | undefined, only?: string) => Object.fromEntries(Object.entries(story?.lives ?? {}).filter(([id]) => !only || id === only).map(([id, l]: any) => [id, paragraphed(balanced(String(l?.text ?? "")))]));
const noscript = (what: string) => `<noscript><p style="padding:30vh 6vw;font-size:20px">${what} needs JavaScript to play. <a href="/story">Read the story instead &rarr;</a></p></noscript>`;

/** an episode: the one airing now at /, any other at /ep/N */
export function episodePage(st: FilmState, opts: { ep?: number; base?: string; final?: boolean } = {}): string {
  const r = st.record; const n = opts.ep;
  return filmShell(`${r.title} · ${n ? `season ${n}` : "now playing"}`, noscript("This page"), { brand: r.title, on: n ? "/episodes" : "/", base: opts.base, data: filmData(st, { page: "episode", ep: n ?? null, base: opts.base ?? "", final: opts.final || undefined, told: (st as any).told ?? [], opening: (st as any).opening ?? "", openingLines: (st as any).openingLines ?? [], epilogueLines: (st as any).epilogueLines ?? [], secrets: (st as any).secrets ?? [], lives: livesOf({ lives: (st as any).lives ?? {} } as any), townLines: (r.population ?? []).map((_: any, k: number) => townFact(r, k)) }) });
}
/** every episode of a run, a frame each */
export function guidePage(st: FilmState, opts: { base?: string; final?: boolean } = {}): string {
  const r = st.record;
  return filmShell(`${r.title} · the episodes`, noscript("The episode guide"), { brand: r.title, on: "/episodes", base: opts.base, data: filmData(st, { page: "guide", base: opts.base ?? "", final: opts.final || undefined }) });
}
/** one person: the face, the fifteen years, the scenes that made them, their story, their people */
export function castPage(st: FilmState, id: string, opts: { base?: string; final?: boolean; story?: Story | null; writing?: boolean } = {}): string | null {
  const r = st.record; const c = r.citizens.find((x: any) => x.id === id); if (!c) return null;
  return filmShell(`${c.name} · ${r.title}`, noscript("This page"), { brand: r.title, base: opts.base, data: filmData(st, { page: "cast", focus: id, base: opts.base ?? "", final: opts.final || undefined, lives: livesOf(opts.story), writing: !!opts.writing }) });
}
