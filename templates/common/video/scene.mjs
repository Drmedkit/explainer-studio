// Film hooks for __TITLE__ (the kit's film/scene-runtime.js calls these every frame; see its header for the full list).
export function filmHooks() {
  const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(QUANTITY.digits));
  return {
    // instruments in the right-hand panel (ui.pip = name)
    panes: {
      trace: { label: `${QUANTITY.label} against time`, create: (host) => { const w = createTrace(host, { width: 584, height: 340, fs: 16, title: QUANTITY.label }); return { update: (st) => w.update(st) }; } },
    },
    // pose the model on the timeline's model time (frame-exact; the figure never runs on its own clock in the film)
    frame(t, s, dtMs, fig) { if (s.modelT != null) fig.time(s.modelT); },
    // top-right readout cells: [[value, unit], ...]
    readout(kind, st) { return kind === 'main' ? [[fmt(st.state.y), QUANTITY.unit]] : []; },
    // event-placed sounds: push(name, gain) on the frame where the figure did something (names from assets/data/sfx.json)
    sfx() {},
  };
}
