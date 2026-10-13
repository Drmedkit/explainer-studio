// explainer-studio page runtime: tabs, film chapters and captions, the explainer (steps that open on a misconception),
// the open lab and its challenges, theme sync. Inlined by ship.mjs/build_page after the topic bundle, which provides:
//   STEPS       [{ title, setup, question, options: [{ text, correct, misconception, catalog }], reveal,
//                  settings, view, focus, ins: [instrument names], after: { settings, view, focus } }]
//   CHALLENGES  [{ id, title, text }]
//   APP         { defaults, instruments: { name: { caption, create(host) -> { update(st, ctx) } } }, labInstruments: [...],
//                 apply?(fig, settings, ctx), state?(fig, settings), initLab?(ctx), refreshLab?(ctx, st),
//                 challengeDone?(id, st, ctx) -> bool, status?(st) -> string }
//   WIDGET_CSS  (optional) instrument CSS;  CAPTIONS_VTT, CHAPTERS, FIG_API, SLUG come from the build.
{
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  function syncTheme() {
    const explicit = root.getAttribute('data-theme');
    const dark = explicit ? explicit === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    for (const n of document.querySelectorAll('.iso')) n.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (typeof WIDGET_CSS === 'string') { const css = document.createElement('style'); css.textContent = WIDGET_CSS; document.head.appendChild(css); }

  // ---- instruments: one set for the explainer (shown per step), one for the lab
  const makeIns = (host, names) => {
    const out = {};
    for (const name of names) {
      const def = APP.instruments[name]; if (!def) continue;
      const box = document.createElement('div'); box.className = 'ins'; box.dataset.ins = name;
      if (def.caption) { const c = document.createElement('span'); c.className = 'cap'; c.textContent = def.caption; box.appendChild(c); }
      const inner = document.createElement('div'); inner.className = 'iso'; box.appendChild(inner); host.appendChild(box);
      out[name] = { box, inst: def.create(inner) || {} };
    }
    return out;
  };
  const EXP = makeIns($('#explainIns'), Object.keys(APP.instruments));
  const LAB = makeIns($('#labIns'), APP.labInstruments || Object.keys(APP.instruments));
  syncTheme();
  try { const tr = $('#capTrack'); tr.src = URL.createObjectURL(new Blob([CAPTIONS_VTT], { type: 'text/vtt' })); } catch (e) {}

  const whenFig = (fn) => { const f = window[FIG_API]; if (f) fn(f); else setTimeout(() => whenFig(fn), 50); };
  let settings = { ...APP.defaults };
  const ctx = { $, get settings() { return settings; }, set: (s, o) => apply(s, o), fig: () => window[FIG_API], refresh: () => refresh() };
  const stateOf = () => { const f = window[FIG_API]; return APP.state ? APP.state(f, settings) : { settings, ...(f ? f.get() : {}) }; };
  let shown = [];
  function refresh() {
    const st = stateOf(), tab = $('#stage').dataset.tab;
    if (tab === 'explain') for (const n of shown) EXP[n] && EXP[n].inst.update && EXP[n].inst.update(st, ctx);
    if (tab === 'lab') { for (const v of Object.values(LAB)) v.inst.update && v.inst.update(st, ctx); if (APP.refreshLab) APP.refreshLab(ctx, st); checkChallenges(st); }
    if (APP.status) $('#stateName').textContent = APP.status(st);
  }
  function apply(s = {}, { view, focus } = {}) {
    settings = { ...settings, ...s };
    whenFig((f) => {
      if (f.tour) f.tour(false);
      if (APP.apply) APP.apply(f, settings, ctx); else f.set(settings);
      if (view !== undefined) f.view(typeof view === 'string' || view === null ? { region: view || 'whole' } : view, { ms: 1100 });
      if (focus !== undefined) f.focus(focus, { ms: 700 });
      refresh();
    });
  }

  // ---- tabs
  const tabs = [...document.querySelectorAll('.tabs button')];
  function showTab(name) {
    for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const n of ['watch', 'explain', 'lab']) document.getElementById('p-' + n).hidden = n !== name;
    $('#stage').dataset.tab = name;
    if (name !== 'watch') $('#film').pause();
    if (name === 'explain') renderStep();
    if (name === 'lab') enterLab();
    if (name === 'watch') whenFig((f) => { f.focus(null, { ms: 0 }); f.view({ region: 'whole' }, { ms: 0 }); if (f.tour) f.tour(true); });
    try { localStorage.setItem(SLUG + '-tab', name); } catch (e) {}
  }
  for (const b of tabs) b.addEventListener('click', () => showTab(b.dataset.tab));
  for (const [n, t] of CHAPTERS) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = n; b.addEventListener('click', () => { const v = $('#film'); v.currentTime = t; v.play().catch(() => {}); }); $('#chapters').appendChild(b); }

  // ---- explainer: every step opens on a prediction; the wrong options are catalog misconceptions
  let stepIdx = 0; const done = new Set();
  const dots = $('#dots'); STEPS.forEach(() => dots.appendChild(document.createElement('i')));
  function showIns(list) { shown = list || []; for (const [n, v] of Object.entries(EXP)) v.box.hidden = !shown.includes(n); }
  function renderStep() {
    const st = STEPS[stepIdx], card = $('#stepCard');
    card.innerHTML = '';
    const add = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; card.appendChild(n); return n; };
    add('span', 'kicker', `Step ${stepIdx + 1} of ${STEPS.length}`); add('h2', null, st.title); if (st.setup) add('p', null, st.setup); add('p', 'q', st.question);
    const opts = add('div', 'opts'), fb = add('div', 'feedback'); fb.hidden = true;
    showIns(st.ins);
    apply({ ...APP.defaults, ...(st.settings || {}) }, { view: st.view ?? 'whole', focus: st.focus ?? null });
    st.options.forEach((o) => {
      const b = document.createElement('button'); b.className = 'opt'; b.textContent = o.text; opts.appendChild(b);
      b.addEventListener('click', () => {
        for (const x of opts.querySelectorAll('.opt')) x.disabled = true;
        b.dataset.state = o.correct ? 'right' : 'wrong';
        if (!o.correct) opts.children[st.options.findIndex((x) => x.correct)].dataset.state = 'right';
        fb.hidden = false; fb.innerHTML = '';
        const h = document.createElement('p'); h.className = o.correct ? 'ok' : 'mis';
        h.textContent = o.correct ? 'Right.' : (o.misconception ? `A common idea, but no: ${o.misconception}` : 'Not quite.');
        const r = document.createElement('p'); r.textContent = st.reveal; fb.append(h, r);
        done.add(stepIdx); paintDots();
        const a = st.after || {};
        if (a.ins) showIns(a.ins);
        apply({ ...APP.defaults, ...(st.settings || {}), ...(a.settings || {}) }, { view: a.view, focus: a.focus });
      });
    });
    $('#prev').disabled = stepIdx === 0; $('#next').textContent = stepIdx === STEPS.length - 1 ? 'Open the lab' : 'Next step';
    paintDots();
  }
  function paintDots() { [...dots.children].forEach((d, i) => { d.toggleAttribute('data-on', i === stepIdx); d.toggleAttribute('data-done', done.has(i) && i !== stepIdx); }); }
  $('#prev').addEventListener('click', () => { if (stepIdx > 0) { stepIdx--; renderStep(); } });
  $('#next').addEventListener('click', () => { if (stepIdx < STEPS.length - 1) { stepIdx++; renderStep(); window.scrollTo({ top: $('#stage').offsetTop - 8, behavior: 'smooth' }); } else showTab('lab'); });

  // ---- open lab + challenges
  let labInit = false;
  const chDone = new Set();
  function checkChallenges(st) {
    if (!APP.challengeDone) return;
    let changed = false;
    for (const c of CHALLENGES) if (!chDone.has(c.id) && APP.challengeDone(c.id, st, ctx)) { chDone.add(c.id); changed = true; }
    if (changed) renderChallenges();
  }
  function renderChallenges() {
    const box = $('#challenges'); box.replaceChildren();
    const h = document.createElement('h2'); h.textContent = 'Challenges'; box.appendChild(h);
    for (const c of CHALLENGES) { const d = document.createElement('div'); d.className = 'challenge'; d.toggleAttribute('data-done', chDone.has(c.id)); const t = document.createElement('h3'); t.textContent = c.title; const p = document.createElement('p'); p.textContent = c.text; d.append(t, p); box.appendChild(d); }
  }
  function enterLab() {
    if (!labInit) { labInit = true; settings = { ...APP.defaults }; if (APP.initLab) APP.initLab(ctx); renderChallenges(); }
    apply({}, { view: 'whole', focus: null });
  }
  whenFig((f) => f.onChange(() => refresh()));

  let start = 'watch'; try { start = localStorage.getItem(SLUG + '-tab') || 'watch'; } catch (e) {}
  apply({});
  showTab(start);
}
