// explainer-studio figure runtime (browser). Inlined into every topic figure's script by figure/build-helpers.mjs
// (stageScript()). It gives each figure the shared half of the figure API contract, so topic code only writes its model,
// drawing and posing:
//
//   const fig = XFigure({ name: 'wheel', root, stageEl, svgs, canvas, W, H, regions, project, step, render, get, set, tour });
//   window.wheel = fig.api;   // set/get/play/pause/tour/onChange/clock/advance/view/focus/frame/regions/camera
//
// - view({ region, zoom, dx, dy, shift }, { ms, ease }): the virtual camera; every SVG layer's viewBox and the WebGL
//   camera move together (onView). Regions are world boxes [x0,y0,z0,x1,y1,z1] (projected and padded) or screen rects
//   {x,y,w,h}; 'whole' is the full frame. zoom > 1 goes closer; shift moves the subject left (a panel on the right).
// - focus(region, { ms }): items outside the region fade toward a mid-grey fog (--fk from 1 to `dim`, default 0.45), never
//   toward the paper/white: build-helpers.focusCss() writes the colour-mix rules. Items name their regions in data-sys.
// - frame({ aspect }): 16/9 for the film: the full shot widens around the figure (full-bleed, no card), regions reframe.
// - clock({ manual: true }) + advance(ms): frame-exact time for the renderer; nothing moves between advances.
(function () {
  const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, u) => a + (b - a) * u;
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  const EASE = { inOut: (u) => u * u * (3 - 2 * u), linear: (u) => u, out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u };

  function XStage({ root, stageEl, svgs, canvas = null, W, H, regions = {}, project, dim = 0.45, glFull = [], pad = 0.08, onView = () => {} }) {
    let ASPECT = W / H;
    let FULL = { x: 0, y: 0, w: W, h: H };
    const cam = { ...FULL };
    let move = null, viewSpec = null;
    const REG = {};
    const boxRect = (b) => {
      let x0, x1, y0, y1;
      if (Array.isArray(b)) {
        const pts = [];
        for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) pts.push(project([x, y, z]));
        x0 = Math.min(...pts.map((p) => p[0])); x1 = Math.max(...pts.map((p) => p[0]));
        y0 = Math.min(...pts.map((p) => p[1])); y1 = Math.max(...pts.map((p) => p[1]));
      } else { x0 = b.x; y0 = b.y; x1 = b.x + b.w; y1 = b.y + b.h; }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      let w = (x1 - x0) * (1 + pad * 2), h = (y1 - y0) * (1 + pad * 2);
      if (w / h < ASPECT) w = h * ASPECT; else h = w / ASPECT;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    };
    const remake = () => { for (const k of Object.keys(REG)) delete REG[k]; for (const [n, b] of Object.entries(regions)) REG[n] = typeof b === 'function' ? boxRect(b()) : boxRect(b); REG.whole = { ...FULL }; };
    remake();
    const clampRect = (r) => { const w = clampTo(r.w, FULL.w / 14, FULL.w * 1.6), h = w / ASPECT; return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }; };
    const rectOf = (spec = {}) => {
      const live = spec.region && typeof regions[spec.region] === 'function';
      const base = spec.region ? (live ? boxRect(regions[spec.region]()) : REG[spec.region] || FULL) : { ...FULL };
      const z = spec.zoom ?? 1, w = base.w / z, h = base.h / z;
      const cx = base.x + base.w / 2 + (spec.dx || 0), cy = base.y + base.h / 2 + (spec.dy || 0);
      return clampRect({ x: cx - w / 2 + (spec.shift || 0) * w, y: cy - h / 2, w, h });
    };
    function apply() {
      const vb = `${f2(cam.x)} ${f2(cam.y)} ${f2(cam.w)} ${f2(cam.h)}`;
      for (const s of svgs) s.setAttribute('viewBox', vb);
      const zoom = FULL.w / cam.w;
      root.style.setProperty('--xs-zoom', zoom.toFixed(3));
      onView(cam, zoom);
    }
    function stepCamera(dt) {
      if (!move) {
        // a region given as a function follows its subject (a moving carriage, a travelling parcel)
        if (viewSpec && viewSpec.region && typeof regions[viewSpec.region] === 'function') { Object.assign(cam, rectOf(viewSpec)); apply(); return true; }
        return false;
      }
      move.t += dt;
      const u = move.dur <= 0 ? 1 : Math.min(1, move.t / move.dur), e = move.ease(u);
      const a = move.from, b = move.follow ? rectOf(move.spec) : move.to;
      const w = Math.exp(mix(Math.log(a.w), Math.log(b.w), e));
      cam.w = w; cam.h = w / ASPECT;
      cam.x = mix(a.x + a.w / 2, b.x + b.w / 2, e) - cam.w / 2; cam.y = mix(a.y + a.h / 2, b.y + b.h / 2, e) - cam.h / 2;
      if (u >= 1) move = null;
      apply();
      return true;
    }
    // ---- focus: everything outside the region fogs toward grey (never toward white)
    const items = [...stageEl.querySelectorAll('.it')];
    const sysOf = (el) => (el.getAttribute('data-sys') || '').split(/\s+/);
    const fk = items.map(() => ({ x: 1, target: 1 }));
    let focusName = null, focusMs = 600, busy = false, glT = 1, glN = 1;
    function setFocus(name, ms = 600) {
      focusName = name && name !== 'whole' ? name : null;
      focusMs = ms;
      items.forEach((el, i) => { fk[i].target = !focusName || sysOf(el).includes(focusName) ? 1 : dim; });
      glT = !focusName || glFull.includes(focusName) ? 1 : dim;
      busy = true;
      if (focusName) root.setAttribute('data-focus', focusName);
      if (ms <= 0) stepFocus(1e6);
    }
    function stepFocus(dt) {
      if (!busy) return false;
      const k1 = focusMs <= 0 ? 1 : 1 - Math.exp(-dt / Math.max(0.02, focusMs / 3000));
      let moving = false;
      items.forEach((el, i) => {
        const f = fk[i];
        if (f.x === f.target) return;
        f.x += (f.target - f.x) * k1;
        if (Math.abs(f.x - f.target) < 0.004) f.x = f.target; else moving = true;
        el.style.setProperty('--fk', f.x === 1 ? '1' : f.x.toFixed(3));
      });
      if (canvas) {
        if (Math.abs(glN - glT) > 0.004) { glN += (glT - glN) * k1; moving = true; } else glN = glT;
        canvas.style.opacity = glN === 1 ? '' : glN.toFixed(3);
      }
      if (!moving) { busy = false; if (!focusName) root.removeAttribute('data-focus'); }
      return true;
    }
    return {
      camera: cam, regions: REG,
      get busy() { return !!move || busy; },
      step(dt) { const a = stepCamera(dt), b = stepFocus(dt); return a || b; },
      view(spec = {}, opts = {}, calm = false) {
        viewSpec = spec;
        const to = rectOf(spec), ms = opts.ms ?? 1000;
        move = null;
        if (ms <= 0 || calm) { Object.assign(cam, to); apply(); return { ...cam }; }
        move = { from: { ...cam }, to, spec, follow: typeof regions[spec.region] === 'function', t: 0, dur: ms / 1000, ease: EASE[opts.ease] || EASE.inOut };
        return { ...to };
      },
      focus(name = null, opts = {}, calm = false) { setFocus(name, calm ? 0 : opts.ms ?? 600); return focusName; },
      get focused() { return focusName; },
      frame({ aspect } = {}) {
        ASPECT = aspect || W / H;
        const card = W / H;
        FULL = ASPECT >= card ? { x: W / 2 - (H * ASPECT) / 2, y: 0, w: H * ASPECT, h: H } : { x: 0, y: H / 2 - W / ASPECT / 2, w: W, h: W / ASPECT };
        remake();
        for (const sv of svgs) { sv.setAttribute('width', f2(FULL.w)); sv.setAttribute('height', f2(FULL.h)); }
        root.setAttribute('data-frame', aspect ? String(Math.round(aspect * 100) / 100) : '');
        move = null; Object.assign(cam, FULL); apply();
        return { ...FULL };
      },
      apply,
    };
  }

  /** The whole contract around a topic's own model/drawing. Topic callbacks:
   *  step(dt, ctx)  advance the model by dt seconds of film/page time (ctx.playing, ctx.touring, ctx.tourT)
   *  render()       draw the current state (attributes on refs; no re-render of static art)
   *  get()          the readable state ({ settings, ...numbers the page and film read })
   *  set(s, opts)   change settings (opts.snap: no easing)
   *  tour(t)        the idle tour at tour time t (optional) */
  function XFigure(o) {
    const stage = XStage(o);
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const clock = { manual: false, t: 0 };
    const listeners = [];
    let playing = true, touring = !!o.tour, tourT = 0, raf = 0, last = 0, visible = true;
    const calm = () => still.matches && !clock.manual;
    const emit = () => { if (!listeners.length) return; const g = o.get(); for (const f of listeners) f(g); };
    function step(dt) {
      clock.t += dt;
      if (touring && o.tour) { tourT += dt; o.tour(tourT); }
      o.step(dt, { playing, touring, t: clock.t });
      stage.step(dt);
    }
    function tick(now) {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      step(dt); o.render(); emit();
      const alive = playing || touring || stage.busy || (o.busy && o.busy());
      if (alive && !clock.manual && visible && !calm()) raf = requestAnimationFrame(tick);
    }
    const run = () => { if (!raf && !clock.manual && visible) { last = 0; raf = requestAnimationFrame(tick); } };
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: '120px 0px' }).observe(o.stageEl);
    still.addEventListener('change', run);
    const api = {
      set(s = {}, opts = {}) { touring = false; const r = o.set(s, opts); o.render(); emit(); run(); return r ?? api.get(); },
      get() { return o.get(); },
      play() { playing = true; run(); return api; },
      pause() { playing = false; return api; },
      tour(on = true) { touring = !!on && !!o.tour; if (touring) run(); return touring; },
      onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      /** Frame-exact manual clock for video: everything moves only on advance(ms). */
      clock(opts = {}) {
        if (opts.manual !== undefined) { clock.manual = !!opts.manual; if (clock.manual) { cancelAnimationFrame(raf); raf = 0; } else run(); }
        return { manual: clock.manual, t: clock.t };
      },
      advance(ms = 1000 / 60) { let left = ms / 1000; while (left > 1e-9) { const dt = Math.min(left, 1 / 60); step(dt); left -= dt; } o.render(); emit(); return clock.t; },
      view(spec = {}, opts = {}) { const r = stage.view(spec, opts, calm()); o.render(); run(); return r; },
      focus(name = null, opts = {}) { const r = stage.focus(name, opts, calm()); run(); return r; },
      frame(opts = {}) { const r = stage.frame(opts); o.render(); return r; },
      get regions() { return stage.regions; },
      get camera() { return stage.camera; },
      stage,
    };
    stage.apply();
    o.render();
    o.root.setAttribute('data-ready', '');
    run();
    return { api, stage, run, clock };
  }
  window.XStage = XStage;
  window.XFigure = XFigure;
})();
