// SCAFFOLD subject, archetype "machine": a brass flywheel on a pedestal, spun by the model. Replace it with the real
// machine (anatomy skill). Contract kept by build.mjs and live.js:
//   SYS      focus regions -> item-name patterns (an item belongs to every region whose pattern matches its name)
//   REGIONS  camera regions as world boxes [x0, y0, z0, x1, y1, z1] ('whole' is automatic)
//   FIT      world points that must be in the full frame
//   buildSubject({ k, A, P, put }) (node only): put every static part with its recorded shapes; live slots carry slot names
//   liveSvg(k, P, L, slot, st): the SVG of one live slot for model state st (runs in Node for the rest pose and in the page)
export const SYS = { base: /^stand\./, subject: /^subject\./, wheel: /^subject\.(wheel|marks|pin)/, detail: /^subject\.(marks|pin|hub)/ };
const C = [20, 0], R = 70, Z0 = 66, ZT = 80;
export const REGIONS = { subject: [C[0] - 76, -76, 0, C[0] + 76, 76, 96], wheel: [C[0] - 74, -74, Z0, C[0] + 74, 74, ZT + 10], detail: [C[0] - 72, -72, ZT - 4, C[0] + 72, 72, ZT + 10] };
export const FIT = [[C[0] - R, -R, ZT + 12], [C[0] + R, R, ZT + 12], [C[0] - R, R, 0], [C[0] + R, -R, 0]];

// ---- node-only
export function buildSubject({ k, A, P, put }) {
  const [x, y] = C;
  const S = (paths, o) => k.solidSvg(paths, o);
  put('subject.base', [x, y, 5], S(k.cylinder(x, y, 30, 0, 10, P, 48, 0.8), { tone: 'mid' }) + k.lineSvg(k.ring(x, y, 24, 10, P, 40), { tone: 'lo' }) +
    k.dotsSvg([0, 1, 2, 3].map((i) => k.iso([x + 27 * Math.cos(i * Math.PI / 2 + 0.6), y + 27 * Math.sin(i * Math.PI / 2 + 0.6), 10], P)), { size: 0.5 }),
    [A.cylinder(x, y, 30, 0, 10, { name: 'subject.base' })], { mat: 'steel' });
  put('subject.column', [x, y, 36], S(k.cylinder(x, y, 7, 10, Z0 - 6 - 10, P, 28), { tone: 'mid', crease: 'none' }) + k.lineSvg(k.sideArc(x, y, 7, 30, P, 16), { tone: 'lo' }),
    [A.cylinder(x, y, 7, 10, Z0 - 6 - 10, { name: 'subject.column' })], { mat: 'steel' });
  put('subject.hub', [x, y, Z0 - 3], S(k.cylinder(x, y, 12, Z0 - 6, 6, P, 32, 0.4), { tone: 'mid' }),
    [A.cylinder(x, y, 12, Z0 - 6, 6, { name: 'subject.hub' })], { mat: 'steel' });
  put('subject.wheel', [x, y, (Z0 + ZT) / 2], S(k.cylinder(x, y, R, Z0, ZT - Z0, P, 96, 1.2), { tone: 'hi', crease: 'lo' }) + k.lineSvg(k.sideArc(x, y, R, Z0 + 4, P, 64), { tone: 'faint' }),
    [A.cylinder(x, y, R, Z0, ZT - Z0, { name: 'subject.wheel' })], { mat: 'brass' });
  const rest = { theta: 0 };
  put('subject.marks', [x, y, ZT + 0.1], `<g data-live="marks">${liveSvg(k, P, {}, 'marks', rest)}</g>`,
    [A.cylinder(x, y, R - 6, ZT, 0.2, { name: 'subject.marks' })], { slot: 'marks', bias: 0.5 });
  put('subject.pin', [x + 50, y, ZT + 4], `<g data-live="pin">${liveSvg(k, P, {}, 'pin', rest)}</g>`,
    [A.cylinder(x + 50, y, 4.5, ZT, 9, { name: 'subject.pin' })], { slot: 'pin', mat: 'accent', bias: 1 });
  return {
    label: 'A brass flywheel on a steel pedestal on a bench plate. A constant torque spins it up against the friction of its bearing; the spokes and the crank pin turn with it.',
    hint: 'space to play · drag the lab sliders', readout: 'wheel 0 rpm',
    caption: 'SCAFFOLD figure (machine): replace with the real machine, built with the anatomy skill.',
    keys: [{ mark: 'lit', label: 'The crank pin: one turn of the wheel' }],
  };
}
// ---- end node-only

export function liveSvg(k, P, L, slot, st) {
  const [x, y] = C, th = st.theta || 0;
  if (slot === 'marks') {
    const spokes = [];
    for (let i = 0; i < 6; i++) { const a = th + (i * Math.PI) / 3; spokes.push(k.lineOnTop([x + 14 * Math.cos(a), y + 14 * Math.sin(a)], [x + (R - 9) * Math.cos(a), y + (R - 9) * Math.sin(a)], ZT, P)); }
    return k.lineSvg(k.ring(x, y, 14, ZT, P, 40) + k.ring(x, y, R - 9, ZT, P, 96), { tone: 'mid' }) + k.lineSvg(spokes.join(''), { tone: 'lo' }) +
      k.dotsSvg([k.iso([x, y, ZT], P)], { size: 0.9, tone: 'hi' });
  }
  if (slot === 'pin') {
    const px = x + 50 * Math.cos(th), py = y + 50 * Math.sin(th);
    return k.solidSvg(k.cylinder(px, py, 4.5, ZT, 9, P, 24), { tone: 'hi', lit: true }) + k.dotsSvg([k.iso([px, py, ZT + 9], P)], { size: 0.6, tone: 'hi' });
  }
  return '';
}
