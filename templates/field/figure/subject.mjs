// SCAFFOLD subject, archetype "field table": a shallow tray with a lattice of small compasses and a bar magnet that
// slides along its middle groove. Replace with the real field table (iron-filings tray, rubber sheet, arrow lattice;
// anatomy skill). Contract: see the machine template's subject.mjs header.
import { GRID } from "../src/model.mjs";
export const SYS = { base: /^stand\./, subject: /^subject\./, needles: /^subject\.(needles|pivots)/, magnet: /^subject\.magnet/, detail: /^subject\.(needles|magnet)/ };
const TRAY = { x: -118, y: -66, w: 236, d: 132, r: 5 }, TZ = 6, NL = 7;
export const REGIONS = { subject: [TRAY.x, TRAY.y, 0, TRAY.x + TRAY.w, TRAY.y + TRAY.d, 20], magnet: [-70, -24, 0, 70, 24, 20], detail: [-12, 18, 0, 34, 62, 12] };
export const FIT = [[TRAY.x, TRAY.y, 24], [TRAY.x + TRAY.w, TRAY.y + TRAY.d, 24]];
const MAG = { w: 60, d: 14, h: 8 };

// ---- node-only
export function buildSubject({ k, A, P, put }) {
  put('subject.tray', [0, 0, TZ / 2], k.solidSvg(k.slabOf(TRAY, 0, TZ, P, 6, 1)) + k.lineSvg(k.planOutline(k.insetPlan(TRAY, 4), TZ, P, 6), { tone: 'lo' }),
    [A.slab(TRAY, 0, TZ, { name: 'subject.tray' })], { mat: 'steel' });
  const pivots = GRID.map(([x, y]) => k.solidSvg(k.cylinder(x, y, 2.4, TZ, 1.2, P, 16), { tone: 'mid', crease: 'none' })).join('');
  put('subject.pivots', [0, 0, TZ + 0.6], pivots, GRID.map(([x, y]) => A.cylinder(x, y, 2.4, TZ, 1.2, { name: 'subject.pivots' })), { bias: 0.3 });
  const rest = { mx: 0, needles: GRID.map(() => Math.PI / 2) };
  put('subject.needles', [0, 0, TZ + 1.6], `<g data-live="needles">${liveSvg(k, P, {}, 'needles', rest)}</g>`,
    GRID.map(([x, y]) => A.cylinder(x, y, NL / 2 + 0.6, TZ + 1.2, 0.8, { name: 'subject.needles' })), { slot: 'needles', bias: 0.6 });
  put('subject.magnet', [0, 0, TZ + MAG.h / 2], `<g data-live="magnet">${liveSvg(k, P, {}, 'magnet', rest)}</g>`,
    [A.slab({ x: -MAG.w / 2, y: -MAG.d / 2, w: MAG.w, d: MAG.d, r: 1 }, TZ, MAG.h, { name: 'subject.magnet' })], { slot: 'magnet', bias: 1 });
  return {
    label: 'A shallow steel tray on a bench plate with forty-four small compasses on pivots and a bar magnet that slides along its middle; every needle turns to the field where it stands.',
    hint: 'space to play · lab sliders change the magnet', readout: 'field at the probe 0.00 mT',
    caption: 'SCAFFOLD figure (field table): replace with the real field table, built with the anatomy skill.',
    keys: [{ mark: 'lit', label: 'North ends of the compass needles' }],
    cover: ['subject.needles'],
  };
}
// ---- end node-only

export function liveSvg(k, P, L, slot, st) {
  if (slot === 'needles') {
    const z = TZ + 1.8, lines = [], tips = [], tails = [];
    GRID.forEach(([x, y], i) => {
      const a = st.needles ? st.needles[i] : 0, dx = (NL / 2) * Math.cos(a), dy = (NL / 2) * Math.sin(a);
      lines.push(k.lineOnTop([x - dx, y - dy], [x + dx, y + dy], z, P));
      tips.push(k.iso([x + dx, y + dy, z], P)); tails.push(k.iso([x - dx, y - dy, z], P));
    });
    return k.lineSvg(lines.join(''), { tone: 'mid' }) + k.dotsSvg(tails, { size: 0.6, tone: 'lo' }) + k.dotsSvg(tips, { size: 0.9, tone: 'hi' });
  }
  if (slot === 'magnet') {
    const x = st.mx || 0, n = { x, y: -MAG.d / 2, w: MAG.w / 2, d: MAG.d, r: 1 }, s = { x: x - MAG.w / 2, y: -MAG.d / 2, w: MAG.w / 2, d: MAG.d, r: 1 };
    return k.solidSvg(k.slabOf(s, TZ, MAG.h, P, 3, 0.5), { tone: 'mid' }) + k.solidSvg(k.slabOf(n, TZ, MAG.h, P, 3, 0.5), { tone: 'hi', lit: true }) +
      k.dotsSvg([k.iso([x + MAG.w / 4, 0, TZ + MAG.h], P)], { size: 0.8, tone: 'hi' });
  }
  return '';
}
