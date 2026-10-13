// SCAFFOLD subject, archetype "micro window": a sample cell on a bench plate with a magnifier window over its floor; the
// atoms inside move as the model says. Replace with the real container and its particle window (anatomy skill).
// Contract: see the machine template's subject.mjs header.
export const SYS = { base: /^stand\./, subject: /^subject\./, window: /^subject\.(floor|atoms)/, wall: /^subject\.(post|tray)/, detail: /^subject\.(atoms|floor)/ };
const TRAY = { x: -110, y: -66, w: 220, d: 132, r: 6 }, TZ = 12, WIN = { x: -100, y: -60, w: 200, d: 120 }, SC = WIN.w / 20;   // 10 units per nm
export const REGIONS = { subject: [TRAY.x, TRAY.y, 0, TRAY.x + TRAY.w, TRAY.y + TRAY.d, 60], window: [WIN.x, WIN.y, TZ, WIN.x + WIN.w, WIN.y + WIN.d, TZ + 2], detail: [WIN.x + WIN.w - 60, WIN.y, TZ, WIN.x + WIN.w, WIN.y + 60, TZ + 2] };
export const FIT = [[TRAY.x, TRAY.y, 60], [TRAY.x + TRAY.w, TRAY.y + TRAY.d, 60]];

// ---- node-only
export function buildSubject({ k, A, P, put }) {
  put('subject.tray', [0, 0, TZ / 2], k.solidSvg(k.slabOf(TRAY, 0, TZ, P, 8, 1.2), { tone: 'mid' }) + k.dotsSvg(k.corners(TRAY, 6).map(([x, y]) => k.iso([x, y, TZ], P)), { size: 0.5 }),
    [A.slab(TRAY, 0, TZ, { name: 'subject.tray' })], { mat: 'steel' });
  const floor = { ...WIN, r: 1 };
  put('subject.floor', [0, 0, TZ + 0.3], k.solidSvg(k.slabOf(floor, TZ, 0.6, P, 3), { tone: 'hi', crease: 'none' }) + k.lineSvg(k.planOutline(k.insetPlan(floor, -1.5), TZ + 0.6, P, 3), { tone: 'mid' }),
    [A.slab(floor, TZ, 0.6, { name: 'subject.floor' })], { bias: 0.5 });
  for (const [x, y] of k.corners(TRAY, 4)) {
    put(`subject.post.${x}.${y}`, [x, y, TZ + 24], k.solidSvg(k.cylinder(x, y, 2.6, TZ, 48, P, 16), { tone: 'mid', crease: 'none' }) + k.dotsSvg([k.iso([x, y, TZ + 48], P)], { size: 0.5 }),
      [A.cylinder(x, y, 2.6, TZ, 48, { name: 'subject.post' })], { mat: 'steel' });
  }
  put('subject.atoms', [0, 0, TZ + 1], `<g data-live="atoms">${liveSvg(k, P, {}, 'atoms', { atoms: [] })}</g>`,
    [A.slab({ ...WIN, r: 0 }, TZ + 0.6, 0.4, { name: 'subject.atoms' })], { slot: 'atoms', bias: 1 });
  return {
    label: 'A sample cell on a bench plate: a steel tray with four corner posts and a window over its floor, where the atoms of the gas fly and bounce off the walls as the model says.',
    hint: 'space to play · lab sliders change the gas', readout: 'measured pressure 0.00 mN/m',
    caption: 'SCAFFOLD figure (micro window): replace with the real container and its particle window, built with the anatomy skill.',
    keys: [{ mark: 'lit', label: 'Argon atoms, 20 × 12 nm window' }],
    cover: ['subject.atoms'],
  };
}
// ---- end node-only

export function liveSvg(k, P, L, slot, st) {
  if (slot !== 'atoms') return '';
  const pts = (st.atoms || []).map(([x, y]) => k.iso([WIN.x + x * SC, WIN.y + y * SC, TZ + 0.8], P));
  return k.dotsSvg(pts, { size: 2.2, tone: 'hi' });
}
