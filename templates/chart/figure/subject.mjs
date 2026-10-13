// SCAFFOLD subject, archetype "chart recorder": a strip-chart recorder; the paper runs under a pen that follows the
// model, so the graph is drawn as the system moves. Replace with the real recorder/plotter and the real system beside
// it (anatomy skill). Contract: see the machine template's subject.mjs header.
export const SYS = { base: /^stand\./, subject: /^subject\./, paper: /^subject\.(paper|trace)/, pen: /^subject\.(pen|rail|post)/, detail: /^subject\.(pen|trace)/ };
const HOUSE = { x: -112, y: -56, w: 210, d: 112, r: 6 }, HZ = 18, PAPER = { x: -96, y: -38, w: 170, d: 76, r: 0.5 }, PZ = HZ + 0.6, PEN_X = 50;
export const REGIONS = { subject: [HOUSE.x, HOUSE.y, 0, HOUSE.x + HOUSE.w, HOUSE.y + HOUSE.d, 40], paper: [PAPER.x, PAPER.y, HZ, PAPER.x + PAPER.w, PAPER.y + PAPER.d, HZ + 2], detail: [PEN_X - 40, -44, HZ, PEN_X + 14, 44, 40] };
export const FIT = [[HOUSE.x, HOUSE.y, 40], [HOUSE.x + HOUSE.w, HOUSE.y + HOUSE.d, 40]];

// ---- node-only
export function buildSubject({ k, A, P, put }) {
  put('subject.housing', [-7, 0, HZ / 2], k.solidSvg(k.slabOf(HOUSE, 0, HZ, P, 6, 1.2), { tone: 'mid' }) + k.dotsSvg(k.corners(HOUSE, 6).map(([x, y]) => k.iso([x, y, HZ], P)), { size: 0.5 }),
    [A.slab(HOUSE, 0, HZ, { name: 'subject.housing' })], { mat: 'steel' });
  put('subject.paper', [-11, 0, HZ + 0.3], k.solidSvg(k.slabOf(PAPER, HZ, 0.6, P, 2), { tone: 'hi', crease: 'none' }),
    [A.slab(PAPER, HZ, 0.6, { name: 'subject.paper' })], { bias: 0.2 });
  for (const [x0, name] of [[PAPER.x - 10, 'subject.roller.feed'], [PAPER.x + PAPER.w, 'subject.roller.take']]) {
    const plan = { x: x0, y: -42, w: 10, d: 84, r: 2 };
    put(name, [x0 + 5, 0, HZ + 4], k.solidSvg(k.slabOf(plan, HZ, 8, P, 4, 0.6), { tone: 'mid' }) + k.dotsSvg([k.iso([x0 + 5, -36, HZ + 8], P), k.iso([x0 + 5, 36, HZ + 8], P)], { size: 0.45 }),
      [A.slab(plan, HZ, 8, { name })], { mat: 'steel' });
  }
  for (const y of [-48, 48]) put(`subject.post.${y}`, [PEN_X, y, HZ + 7], k.solidSvg(k.cylinder(PEN_X, y, 3, HZ, 14, P, 16), { tone: 'mid', crease: 'none' }),
    [A.cylinder(PEN_X, y, 3, HZ, 14, { name: 'subject.post' })], { mat: 'steel' });
  const rail = { x: PEN_X - 3, y: -51, w: 6, d: 102, r: 1 };
  put('subject.rail', [PEN_X, 0, HZ + 16], k.solidSvg(k.slabOf(rail, HZ + 14, 4, P, 3, 0.4), { tone: 'mid' }) + k.dotsSvg([k.iso([PEN_X, -48, HZ + 18], P), k.iso([PEN_X, 48, HZ + 18], P)], { size: 0.45 }),
    [A.slab(rail, HZ + 14, 4, { name: 'subject.rail' })], { mat: 'steel', bias: 2 });
  const rest = { t: 0, y: 30, history: () => 30, paper: 25 };
  put('subject.trace', [-11, 0, PZ + 0.1], `<g data-live="trace">${liveSvg(k, P, {}, 'trace', rest)}</g>`, [A.slab({ ...PAPER, r: 0 }, PZ, 0.2, { name: 'subject.trace' })], { slot: 'trace', bias: 0.4 });
  put('subject.pen', [PEN_X, 0, HZ + 10], `<g data-live="pen">${liveSvg(k, P, {}, 'pen', rest)}</g>`,
    [A.slab({ x: PEN_X - 6, y: 25, w: 12, d: 10, r: 1 }, HZ + 6, 8, { name: 'subject.pen' }), A.cylinder(PEN_X, 30, 1, PZ, HZ + 6 - PZ, { name: 'subject.pen.tip' })], { slot: 'pen', bias: 1.5 });
  return {
    label: 'A strip-chart recorder on a bench plate: paper runs from the feed roller to the take-up roller under a pen on a cross rail; the pen follows the model, so the paper shows its graph against time.',
    hint: 'space to play · lab sliders change the system', readout: 'displacement 0.0 mm',
    caption: 'SCAFFOLD figure (chart recorder): replace with the real recorder and the system it records, built with the anatomy skill.',
    keys: [{ mark: 'lit', label: 'The pen and its trace' }],
    cover: ['subject.trace'],
  };
}
// ---- end node-only

export function liveSvg(k, P, L, slot, st) {
  const y = Math.max(-34, Math.min(34, st.y || 0));
  if (slot === 'pen') {
    const car = { x: PEN_X - 6, y: y - 5, w: 12, d: 10, r: 1 };
    return k.solidSvg(k.cylinder(PEN_X, y, 1, PZ, HZ + 6 - PZ, P, 12), { tone: 'hi', crease: 'none', lit: true }) +
      k.solidSvg(k.slabOf(car, HZ + 6, 8, P, 3, 0.5), { tone: 'mid' }) + k.dotsSvg([k.iso([PEN_X, y, PZ], P)], { size: 0.9, tone: 'hi' });
  }
  if (slot === 'trace') {
    const v = st.paper || 25, span = Math.min(st.t || 0, (PEN_X - PAPER.x) / v), n = Math.max(2, Math.ceil(span * 40));
    if (span <= 0.01) return '';
    const pts = [];
    for (let i = 0; i <= n; i++) { const dt = (span * i) / n; pts.push(k.iso([PEN_X - v * dt, Math.max(-34, Math.min(34, st.history(dt))), PZ + 0.1], P)); }
    return k.lineSvg(k.pathOf(pts), { tone: 'hi' }) + k.dotsSvg([pts[pts.length - 1]], { size: 0.6, tone: 'mid' });
  }
  return '';
}
