// The __TITLE__ figure, live (inlined by figure/build.mjs after the anatomy kit, the kit's figure runtime, the model and
// figure/subject.mjs). XFigure (explainer-studio figure/stage.js) supplies the shared half of the API contract: view,
// focus (fog toward grey), frame({ aspect }), clock({ manual }) + advance(ms), play/pause/tour/onChange. This file adds
// the topic's half: settings -> model run, model time -> the live slots, the card readout, time(t) to pose for the film.
const D = __DATA__;
(function () {
  const root = document.getElementById(D.id);
  if (!root) return;
  const stageEl = root.querySelector('[data-stage]'), svg = stageEl.querySelector('svg');
  const K = { iso, slabOf, cylinder, solidSvg, lineSvg, dotsSvg, onTop, lineOnTop, ring, translateAlong, planOutline, insetPlan, corners, radialTicks, topTicks, pathOf, circleRing, segment, sideArc, extrude };
  const slots = {};
  for (const el of stageEl.querySelectorAll('[data-slot]')) slots[el.dataset.slot] = el.querySelector('[data-live]') || el;
  const readoutEl = root.querySelector('[data-readout]');
  const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(QUANTITY.digits));
  let settings = { ...DEFAULTS }, run = simulate(settings), t = 0, rate = 1, posed = null;
  const last = {};
  const state = () => stateAt(run, posed ?? t);
  const fig = XFigure({
    root, stageEl, svgs: [svg], W: D.W, H: D.H, regions: D.regions, project: (p) => iso(p, D.P),
    step(dt, { playing }) {
      if (!playing || posed != null) return;
      t += dt * rate;
      if (t > run.T) t = run.loop ? t % run.T : run.T;
    },
    render() {
      const st = state();
      for (const [name, el] of Object.entries(slots)) { const h = liveSvg(K, D.P, D.live, name, st); if (h !== last[name]) { el.innerHTML = h; last[name] = h; } }
      const text = `${QUANTITY.label.toLowerCase()} ${fmt(st.y)} ${QUANTITY.unit}`;
      if (readoutEl && readoutEl.textContent !== text) readoutEl.textContent = text;
    },
    get() { return { settings: { ...settings }, t: posed ?? t, rate, T: run.T, state: state(), run }; },
    set(s = {}, opts = {}) {
      settings = { ...settings, ...s }; run = simulate(settings);
      if (opts.restart) t = 0;
      if (t > run.T) t = 0;
    },
  });
  // the topic's half of the API
  window.__API__ = Object.assign(fig.api, {
    /** Pose model time exactly (the film): nothing runs until release(). */
    time(x) { posed = Math.max(0, x); fig.api.advance(0); return posed; },
    release() { if (posed != null) t = posed; posed = null; fig.run(); },
    /** Playback rate: model seconds per real second (0.05 = 20× slower). */
    rate(r) { rate = r; return rate; },
    restart() { t = 0; posed = null; fig.run(); },
  });
})();
