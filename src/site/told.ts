// What the teller wrote, as the series' pages read it: a year's chapter once the year has closed, the seasons of the year
// still being lived, and each of the four's life. Every passage is checked again against the rules as they stand before it
// is shown, and a sentence that fails is left out — so what reaches the page is only what the record bears.
import { recheck, withDeaths, withSituations, withDecisions, inSeasonOrder, type Telling } from "../chronicle/teller.ts";
import { played, woundOf } from "../chronicle/ledger.ts";
import type { Story } from "../chronicle/chronicler.ts";

type R = any;
const epochsIn = (r: R, y: number) => (r.events ?? []).filter((e: any) => e.at - 1 >= y * 4 && e.at - 1 < y * 4 + 4);
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
/** a thought is only shown beside its own moment: when the check has taken out the sentence that told what they did, the
 *  line quoting what they told themselves about it would hang on nothing, so it goes too */
/** a chapter that ends on a roll call (two or more lines of how people stood, and nothing that happened) ends before it */
function noRollCall(lines: any[][]): any[][] {
  const last = lines[lines.length - 1]; const only = (l: any) => l.c.every((c: string) => c.startsWith("state:") || c.startsWith("change:"));
  return last && lines.length > 1 && last.length >= 2 && last.every(only) ? lines.slice(0, -1) : lines;
}
function orphansOut(lines: any[][]): any[][] {
  const told = new Set(lines.flat().flatMap((l: any) => (l.c ?? []).filter((c: string) => !c.includes("#"))));
  return lines.map((p) => p.filter((l: any) => { const cs: string[] = l.c ?? []; return !(cs.length && cs.every((c) => c.endsWith("#q") || c.endsWith("#r")) && cs.every((c) => !told.has(c.split("#")[0]))); })).filter((p) => p.length);
}

/** the town's story, a chapter a year: the teller's chapter for a closed year, the checked seasons for the year under way */
export function storyOfTelling(r: R, t: Telling | null, cycle: number): Story {
  const k = played(r) - 1; const years = k < 0 ? 0 : Math.floor(k / 4) + 1;
  const chapters: Story["chapters"] = [];
  for (let y = 0; y < years; y++) {
    const ep = epochsIn(r, y)[0]; const ch = t?.chapters?.[y];
    let paras: string[] = []; let lines: any[] = [];
    if (ch?.lines) { lines = orphansOut(withDeaths(r, y, noRollCall(withSituations(r, withDecisions(r, y, inSeasonOrder(recheck(r, ch.lines.map((p: any[]) => p.filter((l) => !l.s)), false, undefined, true).filter((p) => p.length))))) /* situations set in are made fresh each time, in the current words */)); paras = lines.map((p) => p.map((l: any) => l.t).join(" ")).filter(Boolean); }
    const live = !ch?.lines || !!(ch as any).partial;
    if (!ch?.lines) for (let s = 0; s < 4 && y * 4 + s <= k; s++) { const ps = t?.seasons?.[y * 4 + s]; if (!ps?.lines) continue; const txt = recheck(r, ps.lines).flat().map((l) => l.t).join(" "); if (txt) paras.push(`${SEASONS[s]}. ${txt}`); }
    if (!paras.length) continue;
    // a title is never used twice: a hardship that runs over two years names only the first of them
    const head = ep ? String(ep.headline).split(/[.;:]/)[0].split(" ").slice(0, 7).join(" ") : ""; const own = (ch as any)?.title as string | undefined;
    const title = [own, head].find((x) => x && !chapters.some((c: any) => String(c.title).toLowerCase() === x.toLowerCase())) ?? "";
    chapters.push({ n: y + 1, title, era: ep ? String(ep.headline).replace(/\.$/, "") : "", when: `Year ${y + 1}`, kind: ep?.kind ?? "quiet", text: paras.join("\n\n"), lines, live: live && y === years - 1, from: y * 4, to: Math.min(k, y * 4 + 3) } as any);
  }
  // the town as the Architect built it, before anything happened: the opening of the story
  const epilogueLines = t?.epilogue?.lines ? recheck(r, t.epilogue.lines, false, undefined, true).filter((p) => p.length) : [];
  const openingLines = t?.setting?.lines ? recheck(r, t.setting.lines, false, undefined, true).filter((p) => p.length) : [];
  const opening = openingLines.map((p) => p.map((l) => l.t).join(" ")).filter(Boolean).join("\n\n");
  return { cycle, chapters, lives: livesOfTelling(r, t), ...(opening ? { opening, openingLines } : {}), ...(epilogueLines.length ? { epilogueLines } : {}) } as Story;
}

/** each life the teller has written, checked again, as paragraphs */
export function livesOfTelling(r: R, t: Telling | null): Record<string, { at: number; text: string }> {
  const out: Record<string, { at: number; text: string }> = {};
  for (const [i, p] of Object.entries(t?.portraits ?? {})) {
    const c = r.citizens[+i]; if (!c || !(p as any)?.lines) continue;
    const paras = recheck(r, (p as any).lines, true, woundOf(r, +i, (p as any).k)?.id).map((x) => x.map((l) => l.t).join(" ")).filter(Boolean);
    if (paras.join(" ").split(/(?<=[.!?])\s/).length >= 4) out[c.id] = { at: (p as any).k, text: paras.join("\n\n") };
  }
  return out;
}
