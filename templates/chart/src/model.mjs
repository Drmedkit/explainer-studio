// __TITLE__: the model (SCAFFOLD for archetype "chart recorder": a strip-chart recorder whose pen follows a damped
// mass on a spring, so the paper shows x(t) as the system moves). Replace with the topic's real function or system;
// keep the interface (see the machine template's header). Displacement in mm, time in s.
export const QUANTITY = { key: 'x', label: 'Displacement', unit: 'mm', digits: 1, max: 40 };
export const DEFAULTS = { mass: 0.5, k: 20, b: 0.2, x0: 30, paper: 25 };     // kg, N/m, N·s/m, mm, paper speed mm/s
export const KNOBS = [
  { key: 'mass', label: 'Mass', min: 0.1, max: 2, step: 0.05, unit: 'kg', digits: 2 },
  { key: 'k', label: 'Spring constant', min: 2, max: 60, step: 1, unit: 'N/m', digits: 0 },
  { key: 'b', label: 'Damping', min: 0, max: 2, step: 0.02, unit: 'N·s/m', digits: 2 },
];

/** m x'' + b x' + k x = 0, x(0) = x0, x'(0) = 0 (underdamped): x = x0 e^(−γt)(cos ωd t + (γ/ωd) sin ωd t), γ = b/2m. */
export function simulate(s = DEFAULTS) {
  s = { ...DEFAULTS, ...s };
  const g = s.b / (2 * s.mass), w0 = Math.sqrt(s.k / s.mass), wd = Math.sqrt(Math.max(1e-9, w0 * w0 - g * g));
  const xAt = (t) => s.x0 * Math.exp(-g * t) * (Math.cos(wd * t) + (g / wd) * Math.sin(wd * t));
  const vAt = (t) => -s.x0 * Math.exp(-g * t) * (w0 * w0 / wd) * Math.sin(wd * t);
  const T = 8;
  const series = []; for (let i = 0; i <= 400; i++) { const t = (T * i) / 400; series.push([t, xAt(t)]); }
  const th = (2 * Math.PI) / wd * 2;   // two full periods in: the third peak
  return { s, g, w0, wd, T, loop: true, xAt, vAt, series,
    summary: { headline: { t: th, y: xAt(th), words: 'millimeters' }, lines: [`period ${((2 * Math.PI) / wd).toFixed(3)} s`, `decay time ${(1 / g).toFixed(2)} s`, `Q ${(w0 / (2 * g)).toFixed(1)}`] } };
}
export function stateAt(run, t) {
  const tt = Math.max(0, Math.min(run.T, t));
  return { t: tt, y: run.xAt(tt), v: run.vAt(tt), paper: run.s.paper, history: (dt) => run.xAt(Math.max(0, tt - dt)) };
}

export function selfCheck() {
  const run = simulate(DEFAULTS), s = run.s, out = [];
  // RK4 on the ODE against the closed form
  let x = s.x0 * 1e-3, v = 0; const h = 1e-4, n = 30000;
  const acc = (x, v) => (-s.k * x - s.b * v) / s.mass;
  for (let i = 0; i < n; i++) {
    const k1x = v, k1v = acc(x, v), k2x = v + h / 2 * k1v, k2v = acc(x + h / 2 * k1x, v + h / 2 * k1v);
    const k3x = v + h / 2 * k2v, k3v = acc(x + h / 2 * k2x, v + h / 2 * k2v), k4x = v + h * k3v, k4v = acc(x + h * k3x, v + h * k3v);
    x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  out.push({ name: 'closed form matches an RK4 integration of m x″ + b x′ + k x = 0', ok: Math.abs(x * 1e3 - run.xAt(n * h)) < 1e-6, detail: `${(x * 1e3).toFixed(6)} vs ${run.xAt(n * h).toFixed(6)} mm at ${n * h} s` });
  const E = (t) => 0.5 * s.k * (run.xAt(t) * 1e-3) ** 2 + 0.5 * s.mass * (run.vAt(t) * 1e-3) ** 2;
  let loss = 0; const T = 3, m = 30000; for (let i = 0; i < m; i++) loss += s.b * (run.vAt((i + 0.5) * T / m) * 1e-3) ** 2 * T / m;
  out.push({ name: 'energy lost equals the damping work ∫ b v² dt', ok: Math.abs(E(0) - E(T) - loss) / loss < 1e-5, detail: `${(E(0) - E(T)).toExponential(4)} J vs ${loss.toExponential(4)} J` });
  out.push({ name: 'starts at rest at x0', ok: Math.abs(run.xAt(0) - s.x0) < 1e-12 && Math.abs(run.vAt(0)) < 1e-12, detail: `${run.xAt(0)} mm` });
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
