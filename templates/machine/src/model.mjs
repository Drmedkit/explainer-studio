// __TITLE__: the model (SCAFFOLD for archetype "machine": a flywheel spun up by a constant torque against bearing
// friction). Replace with the topic's real model; keep the interface, because the figure, the page, the lab and the film
// all read it:
//   QUANTITY   the headline quantity the instruments trace { key, label, unit, digits, max }
//   DEFAULTS   settings;  KNOBS  the lab's sliders [{ key, label, min, max, step, unit, digits }]
//   simulate(settings) -> run { T, loop, series [[t, y]], summary { headline: { t, y, words }, lines } }
//   stateAt(run, t)    -> { t, y, ...whatever the figure needs to pose its moving parts }
//   selfCheck()        -> [{ name, ok, detail }]   (`node src/model.mjs` prints them and exits 1 on a failure)
// Real numbers, cited constants, checks that close (energy, momentum, a known limit).
export const QUANTITY = { key: 'rpm', label: 'Wheel speed', unit: 'rpm', digits: 0, max: 140 };
export const DEFAULTS = { torque: 0.12, friction: 0.018, mass: 2.4, radius: 0.07 };   // N·m, N·m·s, kg (brass disc), m
export const KNOBS = [
  { key: 'torque', label: 'Drive torque', min: 0.02, max: 0.3, step: 0.01, unit: 'N·m', digits: 2 },
  { key: 'friction', label: 'Bearing friction', min: 0.005, max: 0.05, step: 0.001, unit: 'N·m·s', digits: 3 },
  { key: 'mass', label: 'Flywheel mass', min: 0.5, max: 6, step: 0.1, unit: 'kg', digits: 1 },
];
const RPM = 60 / (2 * Math.PI);

/** I dω/dt = τ − bω: ω(t) = (τ/b)(1 − e^(−t/τc)), τc = I/b; θ(t) = (τ/b)(t − τc(1 − e^(−t/τc))). */
export function simulate(s = DEFAULTS) {
  s = { ...DEFAULTS, ...s };
  const I = 0.5 * s.mass * s.radius * s.radius, wInf = s.torque / s.friction, tc = I / s.friction;
  const T = Math.min(60, Math.max(4, 5 * tc));
  const at = (t) => { const e = Math.exp(-t / tc); return { w: wInf * (1 - e), theta: wInf * (t - tc * (1 - e)) }; };
  const series = []; for (let i = 0; i <= 200; i++) { const t = (T * i) / 200; series.push([t, at(t).w * RPM]); }
  const th = 3 * tc;   // the headline moment: three time constants in, 95% of full speed
  return { s, I, wInf, tc, T, loop: true, at, series,
    summary: { headline: { t: th, y: at(th).w * RPM, words: 'rpm' },
      lines: [`I = ${I.toExponential(3)} kg·m²`, `full speed ${(wInf * RPM).toFixed(1)} rpm`, `time constant ${tc.toFixed(2)} s`] } };
}
export function stateAt(run, t) {
  const tt = Math.max(0, Math.min(run.T, t)), { w, theta } = run.at(tt);
  return { t: tt, y: w * RPM, w, theta, energy: 0.5 * run.I * w * w };
}

export function selfCheck() {
  const run = simulate(DEFAULTS), out = [];
  // energy books: work in τθ = kinetic energy + friction loss ∫bω² dt (integrated numerically)
  let loss = 0; const n = 20000, T = run.T;
  for (let i = 0; i < n; i++) { const w = run.at((i + 0.5) * T / n).w; loss += DEFAULTS.friction * w * w * T / n; }
  const end = stateAt(run, T), work = DEFAULTS.torque * end.theta;
  out.push({ name: 'energy books close (τθ = ½Iω² + ∫bω²dt)', ok: Math.abs(work - end.energy - loss) / work < 1e-4, detail: `${work.toFixed(4)} J = ${end.energy.toFixed(4)} + ${loss.toFixed(4)} J` });
  out.push({ name: 'full speed is τ/b', ok: Math.abs(run.at(50 * run.tc).w - run.wInf) / run.wInf < 1e-9, detail: `${(run.wInf * RPM).toFixed(2)} rpm` });
  out.push({ name: '95% of full speed after 3 time constants', ok: Math.abs(run.summary.headline.y / (run.wInf * RPM) - (1 - Math.exp(-3))) < 1e-9, detail: `${run.summary.headline.y.toFixed(1)} rpm at ${run.summary.headline.t.toFixed(2)} s` });
  return out;
}

// @cli
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/src/model.mjs')) {
  const checks = selfCheck();
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  const r = simulate(DEFAULTS); console.log(r.summary.lines.join(' · '));
  console.log(`${checks.filter((c) => c.ok).length}/${checks.length} self-checks pass`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
