// __TITLE__: the model (SCAFFOLD for archetype "bench": a carriage on a level rail, pulled by a hanging weight over a
// pulley, against rolling friction). Replace with the topic's real experiment; keep the interface (see the machine
// template's header): QUANTITY, DEFAULTS, KNOBS, simulate, stateAt, selfCheck.
export const QUANTITY = { key: 'v', label: 'Carriage speed', unit: 'm/s', digits: 2, max: 2 };
export const DEFAULTS = { cart: 0.5, hanging: 0.05, mu: 0.004, track: 1.2 };     // kg, kg, rolling coefficient, m of travel
export const KNOBS = [
  { key: 'cart', label: 'Carriage mass', min: 0.2, max: 2, step: 0.05, unit: 'kg', digits: 2 },
  { key: 'hanging', label: 'Hanging mass', min: 0.01, max: 0.2, step: 0.005, unit: 'kg', digits: 3 },
  { key: 'mu', label: 'Rolling friction', min: 0, max: 0.05, step: 0.001, unit: '', digits: 3 },
];
const g = 9.80665;   // standard gravity, m/s² (CGPM 1901)

/** (M + m) a = m g − μ M g, constant a; x(t) = ½ a t² until the carriage reaches the end stop at `track`. */
export function simulate(s = DEFAULTS) {
  s = { ...DEFAULTS, ...s };
  const a = Math.max(0, (s.hanging * g - s.mu * s.cart * g) / (s.cart + s.hanging));
  const tEnd = a > 0 ? Math.sqrt((2 * s.track) / a) : Infinity;
  const T = Math.min(12, Number.isFinite(tEnd) ? tEnd + 1 : 12);
  const at = (t) => { const tt = Math.min(t, tEnd); return { x: 0.5 * a * tt * tt, v: t < tEnd ? a * t : 0 }; };
  const series = []; for (let i = 0; i <= 200; i++) { const t = (T * i) / 200; series.push([t, at(t).v]); }
  const th = Number.isFinite(tEnd) ? tEnd * 0.8 : T / 2;
  return { s, a, tEnd, T, loop: true, at, series,
    summary: { headline: { t: th, y: at(th).v, words: 'meters per second' }, lines: [`a = ${a.toFixed(3)} m/s²`, `end stop after ${tEnd.toFixed(2)} s`] } };
}
export function stateAt(run, t) {
  const tt = Math.max(0, Math.min(run.T, t)), { x, v } = run.at(tt);
  return { t: tt, y: v, x, v, frac: x / run.s.track };
}

export function selfCheck() {
  const run = simulate(DEFAULTS), s = run.s, out = [];
  const t = run.tEnd * 0.999, st = run.at(t);
  const work = s.hanging * g * st.x, ke = 0.5 * (s.cart + s.hanging) * st.v * st.v, fr = s.mu * s.cart * g * st.x;
  out.push({ name: 'energy books close (m g x = ½(M+m)v² + μ M g x)', ok: Math.abs(work - ke - fr) / work < 1e-9, detail: `${work.toFixed(4)} J = ${ke.toFixed(4)} + ${fr.toFixed(4)} J` });
  const f0 = simulate({ ...s, mu: 0 });
  out.push({ name: 'frictionless limit a = m g / (M + m)', ok: Math.abs(f0.a - (s.hanging * g) / (s.cart + s.hanging)) < 1e-12, detail: `${f0.a.toFixed(4)} m/s²` });
  out.push({ name: 'carriage reaches the end stop at the track length', ok: Math.abs(run.at(run.tEnd).x - s.track) < 1e-9, detail: `${run.tEnd.toFixed(3)} s` });
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
