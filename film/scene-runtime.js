// explainer-studio film runtime: inlined by render.mjs after the topic bundle (model, widgets, content), the timeline kit,
// the topic's video/timeline.mjs and video/scene.mjs. It drives the figure and the overlays one frame at a time from the
// shot list, and records the sound events the mixer places on their frames.
//
// Topic side (video/scene.mjs, optional): export function filmHooks({ words }) returning any of
//   css                         extra CSS for the film
//   context                     passed to buildTimeline(words, context)
//   panes: { name: { label, create(host, theme) -> { update(st, s, t) } } }   instruments shown in the right-hand panel (ui.pip)
//   apply(settings, fig, s)     pose the model when the timeline's settings change (default fig.set(settings, { snap: true }))
//   frame(t, s, dtMs, fig)      per frame, before the camera (pose model time: fig.time(ms), fig.pose(...))
//   state(fig, s)               what readouts and sounds read (default fig.get())
//   readout(kind, st, s)        -> [[value, unit], ...] for the top-right readout (ui.readout = kind)
//   sfx({ t, s, prev, st, push, dtMs })   push(name, gain) on the frame where the figure did something
//   loops({ t, s, st })         -> { name: level 0..1 } continuous sounds (hum, hiss) the mixer loops at that level
//   once(ev, fig, s)            timeline one-shot cues other than { do: 'sfx' }
{
  const E = () => window[FIG_API];
  const H = typeof filmHooks === 'function' ? filmHooks({ words: WORDS }) : {};
  const tl = buildTimeline(WORDS, H.context || {});
  const FILM = document.documentElement.dataset.film || 'light';
  document.querySelectorAll('.iso').forEach((n) => n.setAttribute('data-theme', FILM));
  const css = document.createElement('style');
  css.textContent = (typeof WIDGET_CSS === 'string' ? WIDGET_CSS : '') + (H.css || '');
  document.head.appendChild(css);
  const $ = (id) => document.getElementById(id);
  const panes = {};
  for (const [name, p] of Object.entries(H.panes || {})) {
    const d = document.createElement('div'); d.className = 'pane'; d.dataset.pane = name;
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = p.label || '';
    const box = document.createElement('div'); box.className = 'iso'; box.setAttribute('data-theme', FILM);
    d.append(l, box); $('pip').appendChild(d);
    panes[name] = { el: d, inst: p.create(box, FILM) || {} };
  }
  const fades = {};
  function fadeTo(id, on, dt, ms = 260) {
    const k = 1 - Math.exp(-dt / ms);
    fades[id] = (fades[id] ?? 0) + ((on ? 1 : 0) - (fades[id] ?? 0)) * k;
    if (fades[id] < 0.002) fades[id] = 0;
    const n = $(id); n.style.opacity = fades[id].toFixed(3); return n;
  }
  const once = (tl.once || []).slice().sort((a, b) => a.t - b.t);
  let t = 0, oi = 0, lastShot = null, lastFocus = 'none', lastSettings = '', prev = null, lastPip = null;
  window.sfx = [];            // [{ t, name, gain }] -> out/events.json -> mix.py
  window.loops = {};          // { name: [[t, level], ...] } (stored on change)
  const push = (name, gain = 1, at = t) => window.sfx.push({ t: +at.toFixed(3), name, gain });
  window.__film = { time: () => t, at: (x) => tl.at(x), duration: tl.duration ?? WORDS.duration };

  window.renderFrame = function (dtMs) {
    t += dtMs / 1000;
    const fig = E(), s = tl.at(t), ui = s.ui || {};
    // ---- the model's settings, posed exactly when they change
    const sk = JSON.stringify(s.settings ?? null);
    if (sk !== lastSettings) { if (H.apply) H.apply(s.settings, fig, s); else if (s.settings) fig.set({ ...s.settings }, { snap: true }); lastSettings = sk; }
    while (oi < once.length && once[oi].t <= t) { const ev = once[oi++]; if (ev.do === 'sfx') push(ev.name, ev.gain ?? 1, ev.t); else if (H.once) H.once(ev, fig, s); }
    if (H.frame) H.frame(t, s, dtMs, fig);
    // ---- the camera: a new region or a big zoom change moves over ms (default 1500); a spanned zoom follows frame by frame
    if (s.shot) {
      const shift = s.shot.shift ?? (ui.pip ? 0.17 : 0);
      const cur = { region: s.shot.region || 'whole', zoom: s.shot.zoom ?? 1, dx: s.shot.dx || 0, dy: s.shot.dy || 0, shift };
      const key = JSON.stringify(cur);
      if (!lastShot || key !== lastShot.key) {
        const small = lastShot && lastShot.region === cur.region && lastShot.shift === cur.shift && Math.abs(Math.log(cur.zoom / lastShot.zoom)) < 0.03 && Math.abs(cur.dx - lastShot.dx) < 4 && Math.abs(cur.dy - lastShot.dy) < 4;
        fig.view(cur, { ms: !lastShot || small ? 0 : s.shot.ms ?? 1500, ease: s.shot.ease });
        lastShot = { ...cur, key };
      }
    }
    if ((s.focus ?? 'none') !== lastFocus) { fig.focus(s.focus ?? null, { ms: s.focusMs ?? 700 }); lastFocus = s.focus ?? 'none'; }
    fig.advance(dtMs);
    const st = H.state ? H.state(fig, s) : fig.get();
    // ---- sounds from what the figure did on this frame
    if (H.sfx) H.sfx({ t, s, prev, st, push, dtMs });
    if (H.loops) {
      for (const [name, v] of Object.entries(H.loops({ t, s, st }) || {})) {
        const a = window.loops[name] || (window.loops[name] = []);
        const [l0, r0] = Array.isArray(v) ? v : [v, null];          // level, or [level, playback rate]
        const lv = Math.max(0, Math.min(1, +l0 || 0)), rt = r0 == null ? null : Math.max(0.05, +r0);
        const p = a[a.length - 1];
        if (!p || Math.abs(p[1] - lv) > 0.01 || (rt != null && Math.abs(p[2] - rt) > 0.01)) a.push(rt == null ? [+t.toFixed(3), +lv.toFixed(3)] : [+t.toFixed(3), +lv.toFixed(3), +rt.toFixed(3)]);
      }
    }
    // ---- overlays: chapter label + slow-motion rate, readout, note, instrument panel, title, end, subtitles
    const rate = s.rate;
    const slow = rate != null && ui.slow !== false && (Math.abs(rate) < 0.75 || Math.abs(rate) > 1.4) ? slowLabel(rate) : '';   // slow motion and time-lapse both carry their true rate
    const lab = fadeTo('label', !!(ui.label || slow), dtMs);
    if (ui.label || slow) {
      const head = ui.label || slow, small = ui.label ? (ui.labelSmall ?? slow) : (ui.labelSmall ?? '');
      if (lab.firstChild.textContent !== head) lab.firstChild.textContent = head;
      if (lab.lastChild.textContent !== small) lab.lastChild.textContent = small;
    }
    const ro = fadeTo('readout', !!ui.readout, dtMs);
    if (ui.readout && H.readout) {
      const cells = H.readout(ui.readout, st, s) || [];
      const html = cells.map(([v, u]) => `<div><b>${v}</b><span>${u}</span></div>`).join('');
      if (ro.innerHTML !== html) ro.innerHTML = html;
    }
    const note = fadeTo('note', !!ui.note, dtMs); if (ui.note && note.textContent !== ui.note) note.textContent = ui.note;
    const pip = fadeTo('pip', !!ui.pip, dtMs, 320);
    if (ui.pip && ui.pip !== lastPip) { for (const [n, p] of Object.entries(panes)) p.el.toggleAttribute('data-on', n === ui.pip); lastPip = ui.pip; }
    if (ui.pip && panes[ui.pip] && panes[ui.pip].inst.update) panes[ui.pip].inst.update(st, s, t, dtMs);
    pip.style.transform = `translateX(${((1 - (fades.pip || 0)) * 60).toFixed(1)}px)`;
    fadeTo('title', !!ui.title, dtMs, 400); fadeTo('end', !!ui.end, dtMs, 500);
    const sub = ui.end ? '' : subtitleAt(WORDS, t);
    if ($('sub').textContent !== sub) $('sub').textContent = sub;
    prev = { s, st, t };
    return t;
  };
  window.sceneReady = new Promise((res) => {
    const go = () => { const f = E(); if (f) { f.clock({ manual: true }); if (f.tour) f.tour(false); f.frame({ aspect: 16 / 9 }); res(true); } else setTimeout(go, 30); };
    go();
  });
}
