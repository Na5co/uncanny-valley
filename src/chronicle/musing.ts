// What the four turn over in their heads between decisions. Once a season, after the season is played, each of the four
// still alive is given their own record — the decisions they made and what they told themselves then, what was done to
// them, how they stand now, what they want and fear — and thinks three thoughts in their own idiom: one back on a thing
// they did, one about where they are now, one about what is coming. It is the same model that makes their decisions, so
// these are their own words, like the thought behind every choice; they are kept on the world and go into the record.
import { premiseInside } from "./inside.ts";
import { chat, type LlmConfig, type Meter } from "../llm/client.ts";
import { factsAt, personNow, whenOf, nameOf, townFact, played } from "./ledger.ts";
import { stateFact } from "./teller.ts";
import { idiomOf } from "./brain.ts";

type R = any;
export interface Musing { past?: string; about?: string; now?: string; ahead?: string }

/** what one of the four has to think with: their decisions of the last year and what they told themselves, what was
 *  done to them, how they stand, who they have lost */
function contextOf(r: R, i: number, k: number): { text: string; deeds: { n: number; id: string; text: string }[] } {
  const c = r.citizens[i]; const p = personNow(r, i, k);
  const mine: { n: number; id: string; text: string }[] = []; const theirs: string[] = [];
  for (let kk = k; kk >= Math.max(0, k - 5) && mine.length < 4; kk--) for (const f of factsAt(r, kk)) {
    if (f.who === i && (f.deed || (f.kind === "choice" && f.quote)) && mine.length < 4) mine.push({ n: mine.length + 1, id: f.id, text: `${whenOf(r, f.k)}: ${f.text.split(/(?<=\.)\s/)[0]}${f.quote ? ` You told yourself: "${f.quote}"` : ""}` });
    if (f.deed && f.whom === i && f.who !== i && theirs.length < 3) { const a = r.acts?.[f.k]?.[+String(f.id).split(".")[1]]; const me = String(c.name).split(" ")[0];
      theirs.push(`${whenOf(r, f.k)}: ${a?.unknown ? `someone (you do not know who) ${String(a.text).replace(`${me}'s`, "your").replace(new RegExp(`\\b${me}\\b`), "you")}.` : f.text.split(/(?<=\.)\s/)[0]}`); }
  }
  const text = [`## ${c.name} (${c.id})`, `${c.role}. Wants ${c.want}. Afraid of ${c.fear}.`, `The way your head talks: ${idiomOf(c.id)}`,
    `How you stand now: ${stateFact(r, i, k)}`,
    p.lost.length ? `The dead you carry: ${p.lost.map((j) => nameOf(r, j)).join(", ")}.` : "",
    mine.length ? `What you did lately (numbered):\n${mine.map((m) => `  ${m.n}. ${m.text}`).join("\n")}` : "You have not had to decide anything hard lately.",
    theirs.length ? `What was done to you lately:\n${theirs.map((t) => `  - ${t}`).join("\n")}` : ""].filter(Boolean).join("\n");
  return { text, deeds: mine };
}

const TASK = [
  "You are the inner voices of the people below, in a hard place, in hard years. For each of them, write what goes through their head now, at the end of this season: three thoughts, first person, in the way their head talks.",
  "past — they think back on ONE thing they did (give its number as \"about\"): whether they would do it again, what it cost, who it hurt, what they tell themselves about it now.",
  "now — where they are: the hunger, the sickness, the grief, the money, the people they are close to or at odds with, as it sits with them tonight.",
  "ahead — what they dread or hope for from the next season. They do not know the future; they can only fear it or want it.",
  "Rules: each thought under 24 words. Only what their own record below says happened; name only people in it; no new events, objects or places. No self-summaries (not 'I am a proud person'); think the way a person thinks, in particulars. Grim is fine; this is a cold place.",
  "Reply with JSON only: {\"<id>\": {\"past\": \"...\", \"about\": 1, \"now\": \"...\", \"ahead\": \"...\"}, ...}",
].join("\n");

export async function muse(cfg: LlmConfig, r: R, meter?: Meter): Promise<Record<string, Musing>> {
  const k = played(r) - 1; if (k < 0) return {};
  const who = r.citizens.map((c: any, i: number) => ({ c, i })).filter(({ c, i }: any) => c.named && personNow(r, i, k).alive);
  if (!who.length) return {};
  const ctx = who.map(({ i }: any) => ({ i, ...contextOf(r, i, k) }));
  const ep = (r.events ?? []).find((e: any) => e.seasons && k + 1 >= e.at && k + 1 < e.at + e.seasons);
  const user = [`The place: ${r.title}. ${premiseInside(r.premise, r.scenario ?? { epochs: r.events })}`, `The season just ended: ${whenOf(r, k)}.${ep ? ` ${ep.headline}` : ""}`, `The town: ${townFact(r, k)}`, "", ...ctx.map((x) => x.text + "\n")].join("\n");
  const res = await chat({ model: cfg.citizenModel, system: TASK, user, temperature: 0.9, maxTokens: 700, reasoningEffort: "none", json: true, meter }, cfg);
  let got: any = {}; try { got = JSON.parse(String(res.text).replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return {}; }
  const names = new Set([...r.citizens.map((c: any) => String(c.name).split(" ")[0]), ...[r.title, ...(r.map?.locations ?? []).map((l: any) => l.name)].flatMap((x: any) => String(x ?? "").match(/[A-Z][a-z]+/g) ?? [])]);
  const clean = (t: any) => { const s = String(t ?? "").replace(/^["“]|["”]$/g, "").trim(); if (!s || s.length > 220) return undefined;
    // a thought that names somebody who is not in the town is a thought about somebody who does not exist
    const caps = s.match(/\b[A-Z][a-z]{2,}\b/g) ?? []; if (caps.some((w) => !names.has(w) && /^[A-Z][a-z]+$/.test(w) && !/^(I|The|A|An|If|When|What|Who|Why|How|Maybe|Tomorrow|Tonight|Next|Spring|Summer|Autumn|Winter|God|Mother|Father|Nobody|Someone|Everyone|No|Not|But|And|So|Then|Now|Still|Just|One|Two|Three|My|Our|Their|His|Her|Its|It|They|We|You|He|She|That|This|There|Here|Every|Some|All|Each|Even|Yes|Well|Let|Do|Don|Can|Could|Would|Should|Will|Did|Was|Is|Are|Had|Have|Has|Maybe|Perhaps|Enough|Too|Never|Always|Only|Once|Twice|After|Before|Because|Since|Until|While|At|In|On|Of|For|With|Without|From|To|By|Or|Nor|Yet|Ice|Station|Granary|Dock|Radio|Shack|Ship|Council|Clerk|Lord|Christ)$/.test(w))) return undefined;
    return s; };
  const out: Record<string, Musing> = {};
  for (const x of ctx) { const c = r.citizens[x.i]; const g = got[c.id] ?? got[String(c.name).split(" ")[0]] ?? got[c.name]; if (!g) continue;
    const ref = x.deeds.find((d) => d.n === Number(g.about));
    const m: Musing = { past: ref ? clean(g.past) : undefined, about: ref?.id, now: clean(g.now), ahead: clean(g.ahead) };
    if (m.past || m.now || m.ahead) out[c.id] = m; }
  return out;
}
