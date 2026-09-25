// He or she. Everyone in these towns is a man or a woman, and the story says which: the company records it, and the
// townsfolk of the early runs are known by their names. Shared by the server (the story, the narrator's checks) and
// the browser (the front page).
const F = new Set(["Ada", "Eira", "Greta", "Ines", "Lena", "Nell", "Pia", "Sif", "Una", "Wren", "Yara", "Alva", "Cleo", "Elin", "Hedda", "Juno", "Liv", "Mona", "Saskia", "Mara", "Bea", "Vera", "Ruth", "Wilma", "Dell"]);
const M = new Set(["Bram", "Cato", "Finn", "Hal", "Jory", "Kit", "Milo", "Oskar", "Quill", "Rune", "Teo", "Vidar", "Xan", "Zev", "Bo", "Dag", "Fen", "Gus", "Ivo", "Kai", "Nils", "Otto", "Gil", "Pell", "Mikkel", "Tobin", "Aksel"]);
/** "m" or "f": what the record says, else what the name says */
export function sexOf(c) {
  if (c && (c.sex === "m" || c.sex === "f")) return c.sex;
  const n = String((c && typeof c === "object" ? c.name : c) ?? "").trim().split(/\s+/)[0];
  if (F.has(n)) return "f"; if (M.has(n)) return "m";
  return /a$/i.test(n) ? "f" : "m";
}
/** his pronouns, or hers */
export function pro(c) {
  return sexOf(c) === "f" ? { he: "she", He: "She", him: "her", his: "her", His: "Her", hers: "hers", himself: "herself" } : { he: "he", He: "He", him: "him", his: "his", His: "His", hers: "his", himself: "himself" };
}
/** "they" said of one person, made his or hers: only where the sentence is about that one person and no one else, only
 *  where that person is the one doing it ("Ines told themselves", "Nell crawls out on their own"), and never inside a
 *  quotation: what someone said stays as they said it */
export function regender(text, people) {
  const firsts = (people || []).map((c) => ({ c, n: String(c?.name ?? "").split(" ")[0] })).filter((x) => x.n);
  // the quotations out of the way first, so a quote with a full stop in it is never split or changed
  const held = []; const masked = String(text ?? "").replace(/“[^”]*”|"[^"]*"/g, (q) => { held.push(q); return `\u0000${held.length - 1}\u0000`; });
  const PLURAL = /\b(they|them|people|families|strangers|neighbours|others|both|all|some|a few|several|men|women|children|the rest|the town|the others)\b/i;
  const out = masked.split(/(?<=[.!?])\s+/).map((s) => {
    const who = firsts.filter((x) => new RegExp(`\\b${x.n}\\b`).test(s));
    // "Ines told themselves": the one named right before it, unless two are named together ("Nell and Ines told themselves")
    s = s.replace(/(?<!\band |\bor )\b(\w+) told themselves\b/g, (m, n) => { const x = firsts.find((y) => y.n === n); return x ? `${n} told ${pro(x.c).himself}` : m; });
    if (who.length !== 1) return s;
    const p = pro(who[0].c); const n = who[0].n;
    const at = s.search(new RegExp(`\\b${n}\\b`)); if (PLURAL.test(s.slice(0, at))) return s; /* "A few … Ines … their own": theirs, not hers */
    // only when nothing plural stands between the name and the word
    return s.replace(new RegExp(`\\b${n}\\b([^.;]*?)\\b(themselves|themself|their own)\\b`, "g"), (m, mid, w) => (PLURAL.test(mid) ? m : `${n}${mid}${w === "their own" ? `${p.his} own` : p.himself}`));
  }).join(" ");
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => held[+i]);
}

/** a scene written for "you" and "they" (the other person), said of two named people: the other one's they/them/their
 *  become his or hers, where nothing plural could be meant */
export function theyAs(text, person) {
  if (!person?.name) return String(text ?? "");
  const p = pro(person); const PL = /\b(people|families|strangers|neighbours|others|both|all of|some|a few|several|men|women|children|soldiers|the rest|the town|the others|crowd|queue|line of)\b/i;
  return String(text ?? "").split(/(“[^”]*”|"[^"]*")/).map((part, i) => (i % 2 ? part : part.split(/(?<=[.!?;])\s+/).map((s) => (PL.test(s) ? s : s
    .replace(/\bthey are\b/g, `${p.he} is`).replace(/\bThey are\b/g, `${p.He} is`).replace(/\bthey were\b/g, `${p.he} was`).replace(/\bThey were\b/g, `${p.He} was`)
    .replace(/\bthey have\b/g, `${p.he} has`).replace(/\bthey had\b/g, `${p.he} had`).replace(/\bthey\b/g, p.he).replace(/\bThey\b/g, p.He)
    .replace(/\bthemselves\b/g, p.himself).replace(/\btheir\b/g, p.his).replace(/\bTheir\b/g, p.His).replace(/\bthem\b/g, p.him))).join(" "))).join("");
}
