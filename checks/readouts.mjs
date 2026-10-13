// Readout vs narration: every measurement the narrator speaks ("eight point oh volts", "thirty g") must be on screen
// (readout, note, label, instrument panel, or a readout drawn in the figure; never counted: the subtitles) at some
// moment between half a second before the word and two seconds after its line ends. The lesson from physics-five:
// pose the model on the spoken word, so the number the viewer hears is the number they see.
// Per line in narration.json: "readouts": ["8.0", "16.1"] adds strict values; "readouts": false skips the line.
//   node checks/readouts.mjs <topic>      (needs the figure and words.json; builds the scene itself)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTopic, topicArg } from '../lib/topic.mjs';
import { buildScene, sceneOpener, advanceTo } from '../lib/scene.mjs';
import { closeAll } from '../lib/chrome.mjs';
import { spokenNumbers, printedNumbers, matches, UNITS } from './numbers.mjs';

/** The spoken measurements with their windows, and the sample times the walk must visit. */
export function readoutPlan(T, words, step = 0.25) {
  const narr = JSON.parse(T.read('video/assets/data/narration.json'));
  const skip = new Set(narr.lines.map((l, i) => (l.readouts === false ? i : -1)).filter((i) => i >= 0));
  const items = spokenNumbers(words, [...UNITS, ...(T.cfg.film.units || [])]).filter((x) => !skip.has(x.line));
  narr.lines.forEach((l, i) => {
    if (!Array.isArray(l.readouts)) return;
    const wl = words.lines[i]; if (!wl) return;
    for (const v of l.readouts) { const s = String(v); items.push({ value: Number(s), decimals: (s.split('.')[1] || '').length, text: `"${s}" (narration.json readouts)`, t: wl.start, line: i, end: wl.end, strict: true }); }
  });
  for (const x of items) x.win = [Math.max(0, x.t - 0.5), Math.min(words.duration, x.end + 2)];
  const times = [...new Set(items.flatMap(({ win: [a, b] }) => { const out = []; for (let t = a; t <= b + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000); return out; }))];
  return { items, times };
}

/** In the page: the text a viewer reads as data (overlays, instrument panel, figure readouts), without the subtitles. */
export const grabScreen = () => {
  const vis = (el) => { let n = el; while (n && n !== document) { if (n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2) return false; } n = n.parentNode; } return true; };
  const parts = [];
  for (const id of ['label', 'readout', 'note', 'pip']) { const n = document.getElementById(id); if (n && vis(n)) parts.push(n.innerText || n.textContent); }
  // a machine display drawn glyph by glyph (odometer drums, nixie tubes) carries its whole value in data-value
  for (const n of document.querySelectorAll('#figBox [data-value]')) if (vis(n)) parts.push(n.getAttribute('data-value'));
  for (const n of document.querySelectorAll('#figBox text, #figBox [data-readout]')) if (n.textContent.trim() && vis(n) && !n.closest('[data-value]')) parts.push(n.textContent);
  return parts.join(' | ');
};

export function judge(items, screenAt) {
  const times = [...screenAt.keys()];
  const missing = [];
  for (const x of items) {
    const [a, b] = x.win;
    x.seen = times.filter((t) => t >= a - 1e-9 && t <= b + 1e-9).some((t) => matches(x, printedNumbers(screenAt.get(t) || '')));
    if (!x.seen) missing.push(x);
  }
  return { checked: items.length, missing, items };
}

export async function readoutCheck(T, { log = console.log } = {}) {
  const { words } = buildScene(T);
  const { items, times } = readoutPlan(T, words);
  if (!items.length) { log('readouts: no spoken measurements'); return { checked: 0, missing: [], items }; }
  const fps = T.cfg.film.fps || 30, dt = 1000 / fps;
  const S = await sceneOpener(T);
  const page = await S.open();
  const screenAt = new Map(); let f = 0;
  for (const t of times.sort((a, b) => a - b)) { f = await advanceTo(page, Math.round(t * fps), f, dt); screenAt.set(t, await page.evaluate(grabScreen)); }
  await page.browser().close(); S.close();
  const r = judge(items, screenAt);
  report(r, log);
  return r;
}
export function report(r, log = console.log) {
  log(`readouts: ${r.checked} spoken measurements, ${r.checked - r.missing.length} on screen in their window, ${r.missing.length} missing`);
  for (const x of r.missing) log(`  ${x.t.toFixed(1)} s, line ${x.line + 1}: ${x.text} (${x.value}) not on screen`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const T = loadTopic(topicArg());
  const r = await readoutCheck(T);
  await closeAll();
  process.exit(r.missing.length ? 1 : 0);
}
