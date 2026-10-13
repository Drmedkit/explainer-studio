// SCAFFOLD subject, archetype "bench": a carriage on two rails, pulled by a thread over a pulley block at the far end.
// Replace it with the real bench experiment (anatomy skill). Contract: see the machine template's subject.mjs header.
export const SYS = { base: /^stand\./, subject: /^subject\./, rail: /^subject\.(rail|stop)/, carriage: /^subject\.carriage/, detail: /^subject\.(carriage|pulley)/ };
const X0 = -112, X1 = 78, RAIL = [-132, 112], CW = 40, CD = 36, CZ = 3, CH = 9;
export const REGIONS = { subject: [RAIL[0] - 6, -30, 0, RAIL[1] + 26, 30, 40], carriage: [X0 - 6, -24, 0, X0 + CW + 10, 24, 36], detail: [RAIL[1] - 12, -20, 0, RAIL[1] + 24, 20, 40] };
export const FIT = [[RAIL[0], -30, 40], [RAIL[1] + 24, 30, 40]];
const xOf = (frac) => X0 + (X1 - X0) * Math.max(0, Math.min(1, frac || 0));

// ---- node-only
export function buildSubject({ k, A, P, put }) {
  for (const y of [-14, 10]) {
    const plan = { x: RAIL[0], y, w: RAIL[1] - RAIL[0], d: 4, r: 1 };
    put(`subject.rail.${y}`, [0, y + 2, 1.5], k.solidSvg(k.slabOf(plan, 0, 3, P, 3, 0.4), { tone: 'mid' }) + k.dotsSvg([RAIL[0] + 6, 0, RAIL[1] - 6].map((x) => k.iso([x, y + 2, 3], P)), { size: 0.4 }),
      [A.slab(plan, 0, 3, { name: 'subject.rail' })], { mat: 'steel' });
  }
  const stop = { x: RAIL[0] - 6, y: -18, w: 6, d: 36, r: 1.2 };
  put('subject.stop.near', [stop.x + 3, 0, 4], k.solidSvg(k.slabOf(stop, 0, 8, P, 3, 0.5), { tone: 'mid' }) + k.dotsSvg([k.iso([stop.x + 3, -12, 8], P), k.iso([stop.x + 3, 12, 8], P)], { size: 0.45 }),
    [A.slab(stop, 0, 8, { name: 'subject.stop' })], { mat: 'steel' });
  const block = { x: RAIL[1], y: -12, w: 18, d: 24, r: 2 };
  put('subject.pulley', [RAIL[1] + 9, 0, 13], k.solidSvg(k.slabOf(block, 0, 26, P, 4, 0.6), { tone: 'mid' }) + k.lineSvg(k.ring(RAIL[1] + 9, 0, 6, 26, P, 28), { tone: 'lo' }) + k.dotsSvg([k.iso([RAIL[1] + 9, 0, 26], P)], { size: 0.6 }),
    [A.slab(block, 0, 26, { name: 'subject.pulley' })], { mat: 'steel' });
  const rest = { frac: 0 };
  put('subject.carriage', [X0 + CW / 2, 0, CZ + CH / 2], `<g data-live="carriage">${liveSvg(k, P, {}, 'carriage', rest)}</g>`,
    [A.slab({ x: X0, y: -CD / 2, w: CW, d: CD, r: 3 }, CZ, CH, { name: 'subject.carriage' }), A.slab({ x: X0 + 12, y: -8, w: 16, d: 16, r: 1 }, CZ + CH, 8, { name: 'subject.carriage.block' })],
    { slot: 'carriage', bias: 2 });
  return {
    label: 'A carriage on two steel rails on a bench plate, pulled toward a pulley block by a thread; the model sets its position and speed.',
    hint: 'space to play · lab sliders change the masses', readout: 'carriage speed 0.00 m/s',
    caption: 'SCAFFOLD figure (bench): replace with the real bench experiment, built with the anatomy skill.',
    keys: [{ mark: 'lit', label: 'The rider block: where the carriage is' }],
    cover: ['subject.carriage'],   // the thread to the pulley is part of the carriage's drawing
  };
}
// ---- end node-only

export function liveSvg(k, P, L, slot, st) {
  if (slot !== 'carriage') return '';
  const x = xOf(st.frac), plan = { x, y: -CD / 2, w: CW, d: CD, r: 3 }, rider = { x: x + 12, y: -8, w: 16, d: 16, r: 1 };
  const hook = [x + CW, 0, CZ + CH - 2], pul = [RAIL[1], 0, 20];
  return k.solidSvg(k.slabOf(plan, CZ, CH, P, 4, 0.6), { tone: 'mid' }) +
    k.dotsSvg([[x + 4, -CD / 2 + 4], [x + CW - 4, -CD / 2 + 4], [x + 4, CD / 2 - 4], [x + CW - 4, CD / 2 - 4]].map(([a, b]) => k.iso([a, b, CZ + CH], P)), { size: 0.45 }) +
    k.solidSvg(k.slabOf(rider, CZ + CH, 8, P, 3, 0.4), { tone: 'hi', lit: true }) +
    k.lineSvg(k.pathOf([k.iso(hook, P), k.iso(pul, P)]), { tone: 'mid' }) + k.dotsSvg([k.iso(hook, P), k.iso(pul, P)], { size: 0.7, tone: 'hi' });
}
