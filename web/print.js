// The read pages carry their faces as a list; this prints each canvas from it.
import { hydrate } from "./pixel.mjs";
const L = window.LIVE; if (L && L.people) hydrate(document, L.people);
// on a narrow screen the nav scrolls sideways: bring the page you are on into view
try { const on = document.querySelector("header.site nav a.on"); const nav = on?.parentElement; if (on && nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2; } catch { /* a nicety */ }
// a link to a decision the chapter did not tell in so many words lands on its year instead
try { const h = decodeURIComponent(location.hash.slice(1)); if (/^d-\d+-\d+$/.test(h) && !document.getElementById(h)) { const k = +h.split("-")[1]; const y = document.getElementById(`year-${Math.floor(k / 4) + 1}`); if (y) setTimeout(() => y.scrollIntoView({ block: "start" }), 50); } } catch { /* a nicety */ }
// the same, for a click on a link to a moment the chapter told in other words
document.addEventListener("click", (e) => { const a = e.target.closest && e.target.closest('a[href^="#d-"]'); if (!a) return; const h = a.getAttribute("href").slice(1);
  if (document.getElementById(h)) return; e.preventDefault(); const k = +h.split("-")[1]; document.getElementById(`year-${Math.floor(k / 4) + 1}`)?.scrollIntoView({ block: "start", behavior: "smooth" }); });
