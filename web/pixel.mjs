// Portraits as pixels. The portrait is drawn as a vector face (draw.mjs), then printed small onto a canvas — a few dozen
// pixels across, posterized and dithered — and shown large with the pixels left square. A death is the same face losing
// its resolution: fewer, bigger pixels, until there is nothing left to recognise.
import { portrait } from "./draw.mjs";

const imgs = new Map();
function imageOf(c, mood) {
  const key = `${c.id}:${mood}`;
  if (!imgs.has(key)) imgs.set(key, new Promise((res) => {
    // the face without its backdrop: the page behind it is the only background
    const svg = portrait(c, mood, 200).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/<rect width="200" height="200" fill="url\(#pl[^"]*\)"\/>/, "");
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }));
  return imgs.get(key);
}
const INKS = { paper: [[33, 28, 22], [243, 238, 227]], night: [[23, 20, 15], [236, 228, 211]], none: null, red: [[10, 4, 4], [255, 74, 61]], gold: [[12, 9, 3], [255, 201, 94]], green: [[5, 10, 5], [127, 212, 106]], grey: [[6, 6, 7], [150, 150, 150]] };

/** print a face onto a canvas: res pixels across, `levels` shades, an optional two-ink tint. No dithering — clean
 *  flat pixels read as a face; dither at this size reads as noise */
export async function paint(cv, c, { mood = "calm", res = 48, levels = 8, ink = "none", fade = 0 } = {}) {
  const im = await imageOf(c, mood); if (!im) return;
  res = Math.max(3, Math.round(res));
  if (cv.width !== res) { cv.width = res; cv.height = res; }
  const x = cv.getContext("2d", { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.clearRect(0, 0, res, res); x.drawImage(im, 0, 0, res, res);
  const d = x.getImageData(0, 0, res, res); const p = d.data; const tint = INKS[ink] || null; const q = levels - 1;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 110) { p[i + 3] = 0; continue; }
    let l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / (p[i + 3] || 255);
    l = Math.round(Math.min(1, l) * q) / q; l = l * (1 - fade);
    if (tint) { const [a, b] = tint; p[i] = a[0] + (b[0] - a[0]) * l; p[i + 1] = a[1] + (b[1] - a[1]) * l; p[i + 2] = a[2] + (b[2] - a[2]) * l; }
    else { const v = 10 + l * 235; p[i] = v; p[i + 1] = v * 0.985; p[i + 2] = v * 0.95; }
    p[i + 3] = 255 * (1 - fade * 0.6);
  }
  x.putImageData(d, 0, 0);
}
/** every canvas.px on the page that has not been printed yet */
export function hydrate(root, people) {
  for (const cv of root.querySelectorAll("canvas.px:not([data-done])")) {
    const c = people[+cv.dataset.i]; if (!c) continue; cv.dataset.done = "1";
    paint(cv, c, { mood: cv.dataset.mood || "calm", res: Math.max(36, +(cv.dataset.res || 48)), ink: cv.dataset.ink || "none", levels: +(cv.dataset.levels || 8) });
  }
}
/** a pixel face, as markup: printed once hydrate() finds it */
export const px = (i, { mood = "calm", res = 48, ink = "none", cls = "" } = {}) => `<canvas class="px ${cls}" data-i="${i}" data-mood="${mood}" data-res="${res}" data-ink="${ink}" width="${res}" height="${res}"></canvas>`;
