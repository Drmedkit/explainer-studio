// Page glue for __TITLE__: what the kit's page runtime (explainer-studio page/page-runtime.js) asks of the topic.
//   APP.defaults        the settings every explainer step starts from
//   APP.instruments     { name: { caption, create(host) -> { update(st) } } }  (explainer steps list them in `ins`)
//   APP.labInstruments  the instruments shown in the open lab
//   APP.initLab(ctx)    wire the lab controls (src/lab.html); ctx.set(partialSettings), ctx.settings, ctx.fig()
//   APP.refreshLab(ctx, st), APP.challengeDone(id, st), APP.status(st)
const fmtQ = (v) => `${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(QUANTITY.digits)} ${QUANTITY.unit}`;
export const APP = {
  defaults: { ...DEFAULTS },
  instruments: {
    trace: { caption: `${QUANTITY.label} against time`, create: (host) => createTrace(host, { title: QUANTITY.label }) },
  },
  labInstruments: ['trace'],
  initLab(ctx) {
    const box = ctx.$('#knobs');
    for (const kn of KNOBS) {
      const d = document.createElement('div'); d.className = 'ctl';
      d.innerHTML = `<label for="k-${kn.key}">${kn.label} <output id="k-${kn.key}-out"></output></label><input type="range" id="k-${kn.key}" min="${kn.min}" max="${kn.max}" step="${kn.step}">`;
      box.appendChild(d);
      const inp = d.querySelector('input'), out = d.querySelector('output');
      const show = () => { out.textContent = `${(+inp.value).toFixed(kn.digits)}${kn.unit ? ' ' + kn.unit : ''}`; };
      inp.value = ctx.settings[kn.key]; show();
      inp.addEventListener('input', () => { show(); ctx.set({ [kn.key]: +inp.value }); });
    }
    ctx.$('#restartBtn').addEventListener('click', () => { const f = ctx.fig(); if (f) { f.restart(); f.rate(1); } });
    ctx.$('#slowBtn').addEventListener('click', () => { const f = ctx.fig(); if (f) { f.restart(); f.rate(0.05); } });
  },
  refreshLab(ctx, st) {
    const m = ctx.$('#meters'); if (!m || !st.run) return;
    const cells = [[fmtQ(st.state.y), QUANTITY.label], [`${st.t.toFixed(2)} ${QUANTITY.timeUnit || 's'}`, 'model time'], ...st.run.summary.lines.slice(0, 2).map((l) => { const i = l.search(/[\d−-]/); return i > 0 ? [l.slice(i), l.slice(0, i).replace(/[=:]\s*$/, '').trim()] : [l, '']; })];
    const html = cells.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    if (m.innerHTML !== html) m.innerHTML = html;
  },
  challengeDone: (id, st) => { const c = CHALLENGES.find((x) => x.id === id); return !!(c && c.done && c.done(st)); },
  status: (st) => (st.state ? fmtQ(st.state.y) : ''),
};
