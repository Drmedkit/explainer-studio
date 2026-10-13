// __TITLE__: the model (SCAFFOLD for archetype "field table": a bar magnet sliding on a tray of small compasses; each
// needle turns to the local field of the magnet (two poles) plus the Earth's horizontal field). Replace with the topic's
// real field model; keep the interface (see the machine template's header). Lengths in mm, fields in mT.
export const QUANTITY = { key: 'B', label: 'Field at the probe', unit: 'mT', digits: 2, max: 3 };
export const DEFAULTS = { moment: 1.0, earth: 0.018, travel: 60, period: 6 };   // A·m², mT (horizontal, toward +y), mm, s
export const KNOBS = [
  { key: 'moment', label: 'Magnet strength (moment)', min: 0.1, max: 3, step: 0.05, unit: 'A·m²', digits: 2 },
  { key: 'earth', label: "Earth's field", min: 0, max: 0.06, step: 0.002, unit: 'mT', digits: 3 },
  { key: 'travel', label: 'Magnet travel', min: 0, max: 80, step: 1, unit: 'mm', digits: 0 },
];
export const POLE = 25, PROBE = [0, 40];          // pole half-spacing, probe point (mm)
const MU0_4PI = 1e-7;                              // μ0 / 4π, T·m/A
export const GRID = (() => { const g = []; for (const y of [-50, -28, 28, 50]) for (let x = -100; x <= 100; x += 20) g.push([x, y]); return g; })();

/** B (mT) at (x, y) mm from a magnet centred at mx along x: two poles ±q at mx ± POLE, q = moment / (2·POLE). */
export function fieldAt(s, mx, x, y) {
  const q = s.moment / (2 * POLE * 1e-3);
  let bx = 0, by = s.earth;
  for (const [px, sign] of [[mx + POLE, 1], [mx - POLE, -1]]) {
    const dx = (x - px) * 1e-3, dy = y * 1e-3, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
    const k = (MU0_4PI * sign * q) / (r2 * r) * 1e3;    // mT per m
    bx += k * dx; by += k * dy;
  }
  return [bx, by];
}
export function simulate(s = DEFAULTS) {
  s = { ...DEFAULTS, ...s };
  const T = s.period, mxAt = (t) => s.travel * Math.sin((2 * Math.PI * t) / T);
  const series = []; for (let i = 0; i <= 200; i++) { const t = (T * i) / 200; const [bx, by] = fieldAt(s, mxAt(t), ...PROBE); series.push([t, Math.hypot(bx, by)]); }
  const th = T / 2;
  const [hx, hy] = fieldAt(s, mxAt(th), ...PROBE);
  return { s, T, loop: true, mxAt, series, summary: { headline: { t: th, y: Math.hypot(hx, hy), words: 'millitesla' }, lines: [`probe at ${PROBE.join(', ')} mm`, `${GRID.length} compasses`] } };
}
export function stateAt(run, t) {
  const tt = Math.max(0, Math.min(run.T, t)), mx = run.mxAt(tt);
  const needles = GRID.map(([x, y]) => { const [bx, by] = fieldAt(run.s, mx, x, y); return Math.atan2(by, bx); });
  const [bx, by] = fieldAt(run.s, mx, ...PROBE);
  return { t: tt, y: Math.hypot(bx, by), mx, needles };
}

export function selfCheck() {
  const s = { ...DEFAULTS, earth: 0 }, out = [];
  const r = 20 * POLE, [bx] = fieldAt(s, 0, r, 0), dip = (2 * MU0_4PI * s.moment) / Math.pow(r * 1e-3, 3) * 1e3;
  out.push({ name: 'far field on the axis is the dipole field μ0 m / 2π r³', ok: Math.abs(bx / dip - 1) < 0.01, detail: `${bx.toExponential(3)} vs ${dip.toExponential(3)} mT at ${r} mm` });
  const a = fieldAt(s, 0, 30, 20), b = fieldAt(s, 0, -30, 20);
  out.push({ name: 'mirror symmetry about the magnet centre', ok: Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] + b[1]) < 1e-12, detail: `(${a.map((v) => v.toFixed(4))}) vs (${b.map((v) => v.toFixed(4))})` });
  const e = fieldAt({ ...DEFAULTS, moment: 0 }, 0, 10, 10);
  out.push({ name: "without the magnet the needles follow the Earth's field", ok: Math.abs(e[0]) < 1e-15 && Math.abs(e[1] - DEFAULTS.earth) < 1e-15, detail: `${e[1]} mT` });
  return out;
}

// @cli
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/src/model.mjs')) {
  const checks = selfCheck();
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  console.log(simulate(DEFAULTS).summary.lines.join(' · '));
  console.log(`${checks.filter((c) => c.ok).length}/${checks.length} self-checks pass`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
