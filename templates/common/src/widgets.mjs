// Instruments for __TITLE__ (the page, the lab and the film's right-hand panel). Lessons built in:
// - the live readout sits in a header band above the plot, never inside it (pendulum-clock, crumple-zone)
// - axis labels and tick labels sit outside the plot; anything that must sit inside gets a paper backing (data-backing)
// - the trace is clipped to its plot (no line through a label), labels are laid out from the font size
// Every instrument root carries class "xw" (topic.config "instruments": ".xw svg" is what the text check scans).
export const WIDGET_CSS = `
.xw { width: 100%; }
.xw svg { display: block; width: 100%; height: auto; overflow: hidden; font-family: var(--f-mono, ui-monospace, monospace); }
.xw .ax { stroke: var(--xw-axis); stroke-width: 1; fill: none; }
.xw .grid { stroke: var(--xw-grid); stroke-width: 1; fill: none; }
.xw .tl { fill: var(--xw-muted); }
.xw .hd { fill: var(--xw-ink); font-weight: 600; }
.xw .hv { fill: var(--xw-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.xw .live { stroke: var(--xw-accent); stroke-width: 2.4; fill: none; stroke-linejoin: round; }
.xw .ghost { stroke: var(--xw-muted); stroke-width: 1.2; fill: none; stroke-dasharray: 4 4; opacity: .7; }
.xw .dot { fill: var(--xw-accent); }
.xw .bk { fill: var(--xw-paper); }
.iso .xw, .xw { --xw-ink: #1a1a1c; --xw-muted: #6d6d73; --xw-axis: #9a9aa0; --xw-grid: #e4e3df; --xw-accent: __ACCENT__; --xw-paper: #fbfbf9; }
.iso[data-theme="dark"] .xw { --xw-ink: #ececec; --xw-muted: #9a9aa2; --xw-axis: #5a5a60; --xw-grid: #232326; --xw-accent: __ACCENT_DARK__; --xw-paper: #141415; }
`;

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };
const niceStep = (span, n) => { const r = span / n, p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
const fmtN = (v, d) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(d));

/** A time chart of the model's headline quantity: header band (title, live value), plot with the run's series traced
 *  up to the current time, a dot at now. update(st) reads st.run.series, st.t and st.state.y. */
export function createTrace(host, { width = 520, height = 300, fs = 13, title = `${QUANTITY.label} against time` } = {}) {
  host.classList.add('xw');
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title }, host);
  const head = fs * 3.1, padL = fs * 3.6, padR = fs * 1.2, padB = fs * 2.6;
  const X0 = padL, X1 = width - padR, Y0 = head + fs * 0.6, Y1 = height - padB;
  el('text', { x: 0, y: fs * 1.2, class: 'hd', 'font-size': fs }, svg).textContent = title;
  const val = el('text', { x: width, y: fs * 1.2, class: 'hv', 'font-size': fs * 1.15, 'text-anchor': 'end' }, svg);
  const unitT = el('text', { x: 0, y: fs * 2.75, class: 'tl', 'font-size': fs * 0.85 }, svg);
  unitT.textContent = `${QUANTITY.unit} · time in ${QUANTITY.timeUnit || 's'}`;
  const gridG = el('g', {}, svg), axG = el('g', {}, svg);
  const clipId = 'xwc' + Math.random().toString(36).slice(2, 8);
  el('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0 }, el('clipPath', { id: clipId }, el('defs', {}, svg)));
  const plot = el('g', { 'clip-path': `url(#${clipId})` }, svg);
  const line = el('path', { class: 'live' }, plot), dot = el('circle', { r: fs * 0.32, class: 'dot' }, plot);
  let range = null, key = '';
  function axes(T, yMin, yMax) {
    gridG.replaceChildren(); axG.replaceChildren();
    const sx = (t) => X0 + ((X1 - X0) * t) / T, sy = (y) => Y1 - ((Y1 - Y0) * (y - yMin)) / (yMax - yMin);
    const ys = niceStep(yMax - yMin, 4), ts = niceStep(T, 5);
    for (let y = Math.ceil(yMin / ys) * ys; y <= yMax + 1e-9; y += ys) {
      el('line', { x1: X0, x2: X1, y1: sy(y), y2: sy(y), class: 'grid' }, gridG);
      el('text', { x: X0 - fs * 0.5, y: sy(y) + fs * 0.35, class: 'tl', 'font-size': fs * 0.85, 'text-anchor': 'end' }, axG).textContent = fmtN(y, ys < 1 ? Math.min(3, Math.ceil(-Math.log10(ys))) : 0);
    }
    for (let t = ts; t <= T + 1e-9; t += ts) el('text', { x: sx(t), y: Y1 + fs * 1.3, class: 'tl', 'font-size': fs * 0.85, 'text-anchor': 'middle' }, axG).textContent = fmtN(t, ts < 1 ? 1 : 0);
    el('path', { d: `M${X0} ${Y0}V${Y1}H${X1}`, class: 'ax' }, axG);   // (the t = 0 label is left out: it would sit on the y axis's bottom label)
    range = { sx, sy };
  }
  return {
    update(st) {
      const run = st.run; if (!run) return;
      const ys = run.series.map((p) => p[1]);
      let yMin = Math.min(0, ...ys), yMax = Math.max(...ys, 1e-9);
      const pad = (yMax - yMin) * 0.08; yMax += pad; if (yMin < 0) yMin -= pad;
      const k = `${run.T}|${yMin.toFixed(4)}|${yMax.toFixed(4)}`;
      if (k !== key) { axes(run.T, yMin, yMax); key = k; }
      const t = st.t ?? 0, pts = run.series.filter((p) => p[0] <= t);
      const y = st.state ? st.state.y : 0;
      pts.push([t, y]);
      line.setAttribute('d', 'M' + pts.map(([a, b]) => `${range.sx(a).toFixed(1)} ${range.sy(b).toFixed(1)}`).join('L'));
      dot.setAttribute('cx', range.sx(t).toFixed(1)); dot.setAttribute('cy', range.sy(y).toFixed(1));
      val.textContent = `${fmtN(y, QUANTITY.digits)} ${QUANTITY.unit}`;
    },
  };
}
