// __TITLE__: the model (SCAFFOLD for archetype "investigation": a drop-timing investigation on a workbench: a tennis
// ball is released from a clamp, falls past a ruler through a light gate, and each trial's time goes into the logbook).
// Replace with the topic's real investigation; keep the interface (see the machine template's header).
export const QUANTITY = { key: 'v', label: 'Ball speed', unit: 'm/s', digits: 2, max: 8 };
export const DEFAULTS = { height: 1.8, mass: 0.057, diameter: 0.067, cd: 0.55, trials: 3 };   // m, kg, m (tennis ball), drag coefficient
export const KNOBS = [
  { key: 'height', label: 'Drop height', min: 0.2, max: 1.8, step: 0.05, unit: 'm', digits: 2 },
  { key: 'mass', label: 'Ball mass', min: 0.002, max: 0.2, step: 0.001, unit: 'kg', digits: 3 },
  { key: 'cd', label: 'Drag coefficient', min: 0, max: 1, step: 0.01, unit: '', digits: 2 },
];
const g = 9.80665, rho = 1.204;    // m/s² (standard gravity), kg/m³ (air at 20 °C)

/** m dv/dt = m g − ½ ρ Cd A v² (closed form: v = vt tanh(g t / vt), y = (vt²/g) ln cosh(g t / vt)). Each trial: hang 0.6 s,
 *  fall, rest; the logbook entry is the gate time. */
export function simulate(s = DEFAULTS) {
  s = { ...DEFAULTS, ...s };
  const A = Math.PI * (s.diameter / 2) ** 2, kq = 0.5 * rho * s.cd * A / s.mass;   // 1/m
  const vt = kq > 0 ? Math.sqrt(g / kq) : Infinity;
  const fallAt = (t) => (Number.isFinite(vt) ? { y: (vt * vt / g) * Math.log(Math.cosh((g * t) / vt)), v: vt * Math.tanh((g * t) / vt) } : { y: 0.5 * g * t * t, v: g * t });
  const tFall = Number.isFinite(vt) ? (vt / g) * Math.acosh(Math.exp((s.height * g) / (vt * vt))) : Math.sqrt((2 * s.height) / g);
  const HANG = 0.6, REST = 1.0, TRIAL = HANG + tFall + REST, N = Math.round(s.trials), T = TRIAL * N;
  const at = (t) => {
    const k = Math.min(N - 1, Math.floor(t / TRIAL)), u = t - k * TRIAL - HANG;
    const f = u <= 0 ? { y: 0, v: 0 } : u >= tFall ? { y: s.height, v: 0 } : fallAt(u);
    return { trial: k, drop: f.y, v: f.v, logged: k + (u >= tFall ? 1 : 0) };
  };
  const series = []; for (let i = 0; i <= 300; i++) { const t = (T * i) / 300; series.push([t, at(t).v]); }
  const th = HANG + tFall * 0.999;   // the gate: the first trial's speed just before the pad
  return { s, vt, tFall, TRIAL, N, T, loop: true, at, fallAt, series,
    summary: { headline: { t: th, y: at(th).v, words: 'meters per second' }, lines: [`fall ${tFall.toFixed(3)} s (no air ${Math.sqrt((2 * s.height) / g).toFixed(3)} s)`, `terminal speed ${Number.isFinite(vt) ? vt.toFixed(1) : '∞'} m/s`] } };
}
export function stateAt(run, t) {
  const tt = Math.max(0, Math.min(run.T, t)), a = run.at(tt);
  return { t: tt, y: a.v, drop: a.drop / run.s.height, trial: a.trial, logged: a.logged, tFall: run.tFall, N: run.N };
}

export function selfCheck() {
  const out = [], s = DEFAULTS;
  const vac = simulate({ ...s, cd: 0 });
  out.push({ name: 'without air the fall time is √(2h/g)', ok: Math.abs(vac.tFall - Math.sqrt((2 * s.height) / g)) < 1e-12, detail: `${vac.tFall.toFixed(4)} s` });
  const run = simulate(s), f = run.fallAt(run.tFall);
  // energy books: m g h = ½ m v² + drag work ∫ ½ρCdA v³ dt
  const kq = 0.5 * rho * s.cd * Math.PI * (s.diameter / 2) ** 2;
  let w = 0; const n = 20000; for (let i = 0; i < n; i++) { const v = run.fallAt((i + 0.5) * run.tFall / n).v; w += kq * v ** 3 * run.tFall / n; }
  const pe = s.mass * g * s.height, ke = 0.5 * s.mass * f.v * f.v;
  out.push({ name: 'energy books close (m g h = ½ m v² + drag work)', ok: Math.abs(pe - ke - w) / pe < 1e-5, detail: `${pe.toFixed(5)} J = ${ke.toFixed(5)} + ${w.toFixed(5)} J` });
  out.push({ name: 'the ball reaches the pad after the drop height', ok: Math.abs(f.y - s.height) < 1e-9, detail: `${f.y.toFixed(6)} m` });
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
