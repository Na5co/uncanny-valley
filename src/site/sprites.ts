// Pixel sprites: 8×8 bitmaps drawn as squares, so every small picture on the page is made of the same pixels as the faces.
const S: Record<string, string[]> = {
  heart: ["........", ".XX..XX.", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.", "..XXXX..", "...XX...", "........"],
  grave: ["...XX...", "...XX...", ".XXXXXX.", ".XXXXXX.", "...XX...", "...XX...", "...XX...", ".XXXXXX."],
  bread: ["........", "..XXXX..", ".XXXXXX.", "XX.XX.XX", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.", "........"],
  drop: ["...X....", "...XX...", "..XXX...", ".XXXXX..", ".XXXXX..", ".XXXXX..", "..XXX...", "........"],
  cloud: ["........", "...XX...", ".XXXXXX.", "XXXXXXXX", "XXXXXXXX", ".X.X.X..", "X.X.X...", "........"],
  sun: ["...X....", ".X.X.X..", "..XXX...", "XXXXXXX.", "..XXX...", ".X.X.X..", "...X....", "........"],
  dagger: [".......X", "......XX", ".....XX.", "....XX..", "X..XX...", ".XXX....", "..XX....", ".X..X..."],
  hand: ["..X.X...", ".XX.XX..", ".XXXXX.X", ".XXXXXXX", ".XXXXXX.", "..XXXXX.", "..XXXX..", "........"],
  ring: ["..XXX...", ".X...X..", "X.....X.", "X.....X.", "X.....X.", ".X...X..", "..XXX...", "........"],
  house: ["...XX...", "..XXXX..", ".XXXXXX.", "XXXXXXXX", ".X....X.", ".X.XX.X.", ".X.XX.X.", ".XXXXXX."],
  flame: ["...X....", "..XX....", "..XXX...", ".XXXX.X.", ".XXXXXX.", "XXX.XXXX", "XX...XXX", ".XXXXXX."],
  snow: ["X..X..X.", ".X.X.X..", "..XXX...", "XXXXXXX.", "..XXX...", ".X.X.X..", "X..X..X.", "........"],
  wheat: ["...X....", "..XXX...", "...X....", "..XXX...", "...X....", "..XXX...", "...X....", "...X...."],
  skull: [".XXXXX..", "XXXXXXX.", "X..X..X.", "X..X..X.", "XXXXXXX.", ".XX.XX..", ".X.X.X..", "........"],
  coin: ["..XXXX..", ".XXXXXX.", "XX.XX.XX", "XX.XXXXX", "XX.XX.XX", ".XXXXXX.", "..XXXX..", "........"],
  fist: ["........", ".XXXX...", "XXXXXX..", "XXXXXXX.", "XXXXXXX.", ".XXXXXX.", "..XXXX..", "........"],
  door: [".XXXXXX.", ".X....X.", ".X....X.", ".X...XX.", ".X....X.", ".X....X.", ".X....X.", "XXXXXXXX"],
  eye: ["........", "..XXXX..", ".X....X.", "X..XX..X", "X..XX..X", ".X....X.", "..XXXX..", "........"],
  scales: ["...X....", "XXXXXXX.", "X..X..X.", "X..X..X.", "XX.X.XX.", "...X....", "...X....", ".XXXXX.."],
  sword: [".......X", "......X.", ".....X..", "....X...", "X..X....", ".XX.....", ".XX.....", "X..X...."],
  dot: ["........", "........", "...XX...", "..XXXX..", "..XXXX..", "...XX...", "........", "........"],
};
export function sprite(name: string, color = "currentColor", size = 16, title = ""): string {
  const rows = S[name] ?? S.dot; let rects = "";
  rows.forEach((row, y) => { for (let x = 0; x < 8; x++) if (row[x] === "X") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; });
  return `<svg class="spr" viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" fill="${color}"${title ? ` role="img" aria-label="${title.replace(/"/g, "&quot;")}"` : ' aria-hidden="true"'}>${title ? `<title>${title.replace(/</g, "&lt;")}</title>` : ""}${rects}</svg>`;
}
export const spriteFor = (kind: string, tone: string) =>
  kind === "death" ? "grave" : kind === "marry" ? "ring" : kind === "homeless" ? "house" : kind === "sick" ? "drop" : kind === "hungry" ? "bread" : kind === "turned" ? "skull"
  : kind === "theft" ? "coin" : kind === "violence" ? "fist" : kind === "betrayal" ? "dagger" : kind === "abandonment" ? "door" : kind === "justice" ? "scales"
  : kind === "grief" ? "grave" : tone === "help" ? "hand" : tone === "harm" ? "dagger" : "dot";
