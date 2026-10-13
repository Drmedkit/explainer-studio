// SCAFFOLD subject, archetype "investigation": a drop tower on a workbench (post, arm, release clamp, landing pad, light
// gate), a stopwatch and a logbook whose rows fill in trial by trial. Replace with the real investigation set-up
// (anatomy skill). Contract: see the machine template's subject.mjs header.
export const SYS = { base: /^stand\./, subject: /^subject\./, tower: /^subject\.(post|arm|clamp|ball|pad|gate)/, logbook: /^subject\.(log|watch)/, detail: /^subject\.(ball|clamp|gate)/ };
const POST = { x: -88, y: -7, w: 14, d: 14, r: 2 }, TOP = 220, BR = 8, Z_REST = 196, Z_LAND = 12, LOG = { x: 40, y: 8, w: 76, d: 54, r: 1.5 }, WATCH = [86, -44];
export const REGIONS = { subject: [-96, -60, 0, 120, 64, TOP + 6], tower: [-96, -30, 0, 30, 30, TOP + 6], logbook: [36, -60, 0, 120, 64, 10], detail: [-20, -30, 0, 20, 30, 50] };
export const FIT = [[-96, -60, TOP + 6], [120, 64, 0], [-96, 64, 0], [120, -60, 0]];
const ballZ = (drop) => Z_REST - (Z_REST - Z_LAND) * Math.max(0, Math.min(1, drop || 0));

// ---- node-only
export function buildSubject({ k, A, P, put }) {
  const S = k.solidSvg;
  put('subject.post', [-81, 0, TOP / 2], S(k.slabOf(POST, 0, TOP, P, 3, 0.6), { tone: 'mid' }) + k.dotsSvg([20, 40, 60, 80, 100, 120, 140, 160, 180].map((z) => k.iso([POST.x + POST.w, 0, z], P)), { size: 0.5 }),
    [A.slab(POST, 0, TOP, { name: 'subject.post' })], { mat: 'steel' });
  const arm = { x: POST.x + POST.w, y: -5, w: 88 - POST.w + 6, d: 10, r: 1.5 };
  put('subject.arm', [-40, 0, TOP - 4], S(k.slabOf(arm, TOP - 8, 8, P, 3, 0.5), { tone: 'mid' }) + k.dotsSvg([k.iso([arm.x + 4, 0, TOP], P), k.iso([arm.x + arm.w - 4, 0, TOP], P)], { size: 0.45 }),
    [A.slab(arm, TOP - 8, 8, { name: 'subject.arm' })], { mat: 'steel' });
  put('subject.clamp', [0, 0, TOP - 12], S(k.cylinder(0, 0, 5, Z_REST + BR, TOP - 8 - Z_REST - BR, P, 20), { tone: 'mid' }),
    [A.cylinder(0, 0, 5, Z_REST + BR, TOP - 8 - Z_REST - BR, { name: 'subject.clamp' })], { mat: 'steel' });
  put('subject.pad', [0, 0, 2], S(k.cylinder(0, 0, 22, 0, 4, P, 40, 0.6), { tone: 'mid' }), [A.cylinder(0, 0, 22, 0, 4, { name: 'subject.pad' })], { mat: 'rubber' });
  for (const y of [-26, 26]) put(`subject.gate.${y}`, [0, y, 20], S(k.cylinder(0, y, 2.5, 0, 40, P, 14), { tone: 'mid', crease: 'none' }) + k.dotsSvg([k.iso([0, y, 30], P)], { size: 0.8, tone: 'hi' }),
    [A.cylinder(0, y, 2.5, 0, 40, { name: 'subject.gate' })], { mat: 'steel' });
  const rules = [20, 30, 40, 50].map((y) => k.lineSvg(k.lineOnTop([LOG.x + 6, LOG.y + y - 8], [LOG.x + LOG.w - 6, LOG.y + y - 8], 3, P), { tone: 'faint', free: true })).join('');
  put('subject.log', [LOG.x + LOG.w / 2, LOG.y + LOG.d / 2, 1.5], S(k.slabOf(LOG, 0, 3, P, 3), { tone: 'hi', crease: 'none' }) + rules, [A.slab(LOG, 0, 3, { name: 'subject.log' })], { bias: 0.2 });
  const tk = k.radialTicks(WATCH[0], WATCH[1], 11, 60, 5, 6, [1, 2.2], P);
  put('subject.watch', [WATCH[0], WATCH[1], 3], S(k.cylinder(WATCH[0], WATCH[1], 13, 0, 6, P, 48, 0.6), { tone: 'hi' }) + k.lineSvg(k.ring(WATCH[0], WATCH[1], 11, 6, P, 48), { tone: 'lo' }) + k.lineSvg(tk.minor, { tone: 'lo' }) + k.lineSvg(tk.major, { tone: 'mid' }),
    [A.cylinder(WATCH[0], WATCH[1], 13, 0, 6, { name: 'subject.watch' })], { mat: 'steel' });
  const rest = { drop: 0, logged: 0, t: 0, trial: 0, tFall: 0.6, N: 3 };
  put('subject.watch.hand', [WATCH[0], WATCH[1], 6.2], `<g data-live="hand">${liveSvg(k, P, {}, 'hand', rest)}</g>`, [A.cylinder(WATCH[0], WATCH[1], 9, 6, 0.2, { name: 'subject.watch.hand' })], { slot: 'hand', bias: 0.5 });
  put('subject.log.rows', [LOG.x + LOG.w / 2, LOG.y + LOG.d / 2, 3.1], `<g data-live="rows">${liveSvg(k, P, {}, 'rows', rest)}</g>`, [A.slab({ ...k.insetPlan(LOG, 4), r: 0 }, 3, 0.2, { name: 'subject.log.rows' })], { slot: 'rows', bias: 0.5 });
  put('subject.ball', [0, 0, Z_REST], `<g data-live="ball">${liveSvg(k, P, { ball: k.solidSvg(BALL(k, P), { tone: 'hi', lit: true }) }, 'ball', rest)}</g>`,
    [A.ball([0, 0, Z_REST], BR, { name: 'subject.ball' })], { slot: 'ball', bias: 3 });
  return {
    label: 'A drop tower on a workbench: a steel post with an arm and a release clamp, a tennis ball, a rubber landing pad between the two posts of a light gate, a stopwatch and a logbook whose rows fill in as each trial is timed.',
    hint: 'space to play · lab sliders change the drop', readout: 'ball speed 0.00 m/s',
    caption: 'SCAFFOLD figure (investigation): replace with the real investigation set-up, built with the anatomy skill.',
    keys: [{ mark: 'lit', label: 'The ball, and each trial in the logbook' }],
    live: { ball: k.solidSvg(BALL(k, P), { tone: 'hi', lit: true }) },
    cover: ['subject.log.rows', 'subject.watch.hand'],
  };
}
// the ball is drawn once at the origin (a cylinder stands in for a sphere in the scaffold) and translated by the page
const BALL = (k, P) => k.cylinder(0, 0, BR, -BR, 2 * BR, P, 32, 0.8);
// ---- end node-only

export function liveSvg(k, P, L, slot, st) {
  if (slot === 'ball') return `<g transform="${k.translateAlong(P, [0, 0, ballZ(st.drop)])}">${L.ball || ''}</g>`;
  if (slot === 'hand') {
    const run = st.drop > 0 && st.drop < 1 ? st.drop : st.drop >= 1 ? 1 : 0, a = 2 * Math.PI * (run * (st.tFall || 0.6)), c = WATCH;
    return k.lineSvg(k.lineOnTop(c, [c[0] + 9 * Math.sin(a), c[1] - 9 * Math.cos(a)], 6.2, P), { tone: 'hi', free: 'end' }) + k.dotsSvg([k.iso([c[0], c[1], 6.2], P)], { size: 0.8, tone: 'hi' });
  }
  if (slot === 'rows') {
    let out = '';
    for (let i = 0; i < (st.logged || 0); i++) {
      const y = LOG.y + 12 + i * 10, a = [LOG.x + 8, y], b = [LOG.x + 8 + 30 + 6 * ((i * 7) % 3), y];
      out += k.lineSvg(k.lineOnTop(a, b, 3.1, P), { tone: 'hi', free: true }) + k.dotsSvg([k.iso([a[0], a[1], 3.1], P)], { size: 0.6, tone: 'hi' });
    }
    return out;
  }
  return '';
}
