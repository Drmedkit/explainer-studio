// Helpers for a topic's shot list (video/timeline.mjs). Pure functions of time; inlined into the film scene before the
// topic's timeline (render.mjs), and importable from Node (gate checks) by relative path.
//
// A timeline is buildTimeline(words, ctx) -> { at(t), duration, once? } where at(t) returns
//   { settings, shot: { region, zoom, dx, dy, shift, ms }, focus, rate, ui: { title, label, note, readout, pip, end }, ...topic }
// - settings: the model's settings, POSED exactly (the scene snaps the figure every time they change)
// - shot: the figure's camera (view); focus: the region that stays in full colour, the rest fogs toward grey
// - rate: model seconds per film second (1 real time, 0.05 = "20× slower"); the label shows it when below 0.75
// - once: [{ t, do: 'sfx', name, gain }] one-shot sound cues (anything else goes to the scene hook's once())

export const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const ease = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
export const linear = (u) => clamp01(u);
/** a -> b across [t0, t1] (eased by default). */
export const span = (t, t0, t1, a, b, e = ease) => a + (b - a) * e(clamp01((t - t0) / (t1 - t0)));
/** Geometric span (f-numbers, speeds, slow-motion rates). */
export const logspan = (t, t0, t1, a, b, e = ease) => Math.exp(span(t, t0, t1, Math.log(a), Math.log(b), e));
/** Piecewise-linear map from film time to model time: pts = [[filmT, modelT], ...] (monotone; extrapolates the last leg). */
export function pw(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) return span(t, pts[i - 1][0], pts[i][0], pts[i - 1][1], pts[i][1], linear);
  const [a, b] = pts.slice(-2);
  return b[1] + (t - b[0]) * (b[1] - a[1]) / (b[0] - a[0]);
}
/** The slope of pw at t: model seconds per film second (feed it to `rate`). */
export function pwRate(t, pts) {
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) return (pts[i][1] - pts[i - 1][1]) / (pts[i][0] - pts[i - 1][0]);
  const [a, b] = pts.slice(-2);
  return (b[1] - a[1]) / (b[0] - a[0]);
}
/** Start time of the first spoken word `w` (case and punctuation ignored) at or after `after`; null if never said.
 *  Pose key events on these: the figure lands on the word that names it. */
export function wordAt(words, w, after = 0) {
  const want = w.toLowerCase();
  for (const l of words.lines) for (const x of l.words) if (x.start >= after && x.w.replace(/[^\w'-]/g, '').toLowerCase() === want) return x.start;
  return null;
}
/** A cue by name, with a clear error when the narration lacks it. */
export const cueOf = (words, name) => { const v = words.cues[name]; if (v == null) throw new Error(`narration has no {${name}} cue`); return v; };

/** "real time", "20× slower", "held": the slow-motion label for a rate (model s per film s). */
export function slowLabel(rate) {
  const r = Math.abs(rate);
  if (r > 0.75) return r > 1.4 ? `${nice(r).toLocaleString('en-US')}× faster` : 'real time';
  if (r < 1 / 20000) return 'held';
  return `${nice(1 / r).toLocaleString('en-US')}× slower`;
}
const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; const s = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10; return s * p; };

/** The subtitle phrase spoken at t, or '': each narration line is cut into phrases at sentence punctuation (at most
 *  about two lines on screen), each shown from its first word until just before the next phrase. */
export function subtitleAt(words, t) {
  if (!words._chunks) {
    words._chunks = [];
    for (const l of words.lines) {
      let cur = [];
      const flush = () => { if (cur.length) words._chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.w).join(' ') }); cur = []; };
      l.words.forEach((w, i) => {
        cur.push(w);
        const len = cur.map((x) => x.w).join(' ').length;
        const next = l.words[i + 1];
        if (/[.?!]$/.test(w.w) && len > 30) flush();
        else if (/[:;,]$/.test(w.w) && len > 60 && next) flush();
        else if (len > 105 && next && !/^(a|an|the|of|to|and|on|in|at|by)$/i.test(w.w)) flush();
      });
      flush();
    }
    for (let i = 0; i < words._chunks.length; i++) { const c = words._chunks[i], n = words._chunks[i + 1]; c.until = n ? Math.min(c.end + 0.6, n.start - 0.05) : c.end + 0.6; }
  }
  const c = words._chunks.find((x) => t >= x.start - 0.05 && t <= x.until);
  return c ? c.text : '';
}
