// __TITLE__: the model (SCAFFOLD for archetype "micro window": argon atoms in a 20 × 12 nm box, seen through a window;
// a 2D ideal gas whose wall hits are counted to measure the pressure). Replace with the topic's real model; keep the
// interface (see the machine template's header). Model time is in picoseconds.
export const QUANTITY = { key: 'p', label: 'Measured pressure', unit: 'mN/m', digits: 2, max: 2, timeUnit: 'ps' };
export const DEFAULTS = { T: 300, mass: 39.948, N: 36 };          // K, atomic mass units (argon), atoms
export const KNOBS = [
  { key: 'T', label: 'Temperature', min: 50, max: 900, step: 10, unit: 'K', digits: 0 },
  { key: 'mass', label: 'Atom mass', min: 4, max: 132, step: 1, unit: 'u', digits: 0 },
  { key: 'N', label: 'Atoms', min: 6, max: 60, step: 1, unit: '', digits: 0 },
];
export const BOX = { w: 20, h: 12 };               // nm
const kB = 1.380649e-23, u = 1.66053906660e-27;    // J/K (exact, SI 2019), kg

function prng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fold = (q, L) => { const m = ((q % (2 * L)) + 2 * L) % (2 * L); return m <= L ? m : 2 * L - m; };
/** right-wall hits between unfolded positions a and b (walls at multiples of L; the right wall at odd multiples) */
const rightHits = (a, b, L) => { const lo = Math.min(a, b) / L, hi = Math.max(a, b) / L; const odd = (x) => Math.floor((x + 1) / 2); return Math.max(0, odd(hi) - odd(lo)); };

export function simulate(s = DEFAULTS) {
  s = { ...DEFAULTS, ...s };
  const N = Math.round(s.N), m = s.mass * u, rnd = prng(12345);
  const atoms = [];
  for (let i = 0; i < N; i++) {
    const g1 = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()), g2 = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    atoms.push({ x: 0.5 + rnd() * (BOX.w - 1), y: 0.5 + rnd() * (BOX.h - 1), vx: g1, vy: g2 });
  }
  // scale so the total kinetic energy is exactly N k T (2D: kT per atom); velocities in nm/ps (= 1000 m/s)
  const ke = atoms.reduce((a, p) => a + 0.5 * m * (p.vx * p.vx + p.vy * p.vy) * 1e6, 0), f = Math.sqrt((N * kB * s.T) / ke);
  for (const p of atoms) { p.vx *= f; p.vy *= f; }
  const T = 20;   // ps of one demo run
  const pressureAt = (t) => { if (t <= 0) return 0; let J = 0; for (const p of atoms) J += 2 * m * Math.abs(p.vx) * 1e3 * rightHits(p.x, p.x + p.vx * t, BOX.w); return (J / (t * 1e-12) / (BOX.h * 1e-9)) * 1e3; };   // mN/m
  const series = []; for (let i = 0; i <= 200; i++) { const t = (T * i) / 200; series.push([t, pressureAt(t)]); }
  const A = BOX.w * BOX.h * 1e-18, keX = atoms.reduce((a, p) => a + 0.5 * m * p.vx * p.vx * 1e6, 0);
  const theory = ((N * kB * s.T) / A) * 1e3, kinetic = ((2 * keX) / A) * 1e3;
  const th = 16;
  return { s, N, m, atoms, T, loop: true, series, pressureAt, theory, kinetic,
    summary: { headline: { t: th, y: pressureAt(th), words: 'millinewtons per meter' },
      lines: [`ideal gas N k T / A = ${theory.toFixed(3)} mN/m`, `from this sample's x-motion ${kinetic.toFixed(3)} mN/m`, `rms speed ${Math.sqrt((2 * kB * s.T) / m).toFixed(0)} m/s (2D)`] } };
}
export function stateAt(run, t) {
  const tt = Math.max(0, Math.min(run.T, t));
  return { t: tt, y: run.pressureAt(tt), atoms: run.atoms.map((p) => [fold(p.x + p.vx * tt, BOX.w), fold(p.y + p.vy * tt, BOX.h)]), theory: run.theory };
}

export function selfCheck() {
  const run = simulate(DEFAULTS), out = [];
  const ke = run.atoms.reduce((a, p) => a + 0.5 * run.m * (p.vx * p.vx + p.vy * p.vy) * 1e6, 0);
  out.push({ name: 'total kinetic energy is N k T (2D)', ok: Math.abs(ke / (run.N * kB * DEFAULTS.T) - 1) < 1e-12, detail: `${ke.toExponential(4)} J` });
  const long = run.pressureAt(1e5);
  out.push({ name: 'counted wall hits give 2 KE_x / A over a long run', ok: Math.abs(long / run.kinetic - 1) < 0.01, detail: `${long.toFixed(4)} vs ${run.kinetic.toFixed(4)} mN/m` });
  const st = stateAt(run, 7.3);
  out.push({ name: 'every atom stays inside the box', ok: st.atoms.every(([x, y]) => x >= 0 && x <= BOX.w && y >= 0 && y <= BOX.h), detail: `${st.atoms.length} atoms at 7.3 ps` });
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
