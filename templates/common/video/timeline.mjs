// The film's shot list for __TITLE__, as a pure function of time over the narration cues (assets/data/words.json).
// Inlined into the film scene after the kit's film/timeline-kit.mjs (span, pw, pwRate, wordAt, subtitleAt, slowLabel).
//   at(t) -> { settings, modelT, rate, shot: { region, zoom, dx, dy, shift, ms }, focus, ui: { title, label, note, readout, pip, end } }
// Direction rules (skill references/film-direction.md): never a static wide shot; the camera moves to what is said;
// wide -> close-up -> slow motion ("20× slower") -> pull back; the key event is POSED on the spoken word (the number the
// viewer hears is the number on screen); full-bleed 16:9; minimal overlays; light theme.
// SCAFFOLD: a one-sentence film; replace with the topic's 6-10 beat shot list (the concept card's shot_list).
import { pw, pwRate } from '__KIT__/film/timeline-kit.mjs';
import { simulate, DEFAULTS } from '../src/model.mjs';

export function buildTimeline(words, ctx = {}) {
  const c = words.cues, D = words.duration;
  const run = simulate(DEFAULTS), H = run.summary.headline;
  const SLOW = 0.05;                                         // 20× slower into the headline moment
  const slowFrom = Math.max(0, H.t - SLOW * (c.peak - c.slow));
  // film time -> model time: run up to the slow-motion approach, 20× slower into the headline, held on the spoken number,
  // then real time again from the pull-back
  const MAP = [[0, 0], [c.run, 0], [c.slow, slowFrom], [c.peak, H.t], [c.back, H.t], [c.back + 4, H.t + 4]];
  return {
    duration: D,
    once: [{ t: c.peak, do: 'sfx', name: 'pose', gain: 0.6 }],
    at(t) {
      const s = { settings: { ...DEFAULTS }, modelT: pw(t, MAP) % run.T, rate: pwRate(t, MAP), shot: { region: 'whole', zoom: 1 }, focus: null,
        ui: { title: t < c.run - 0.2, label: null, note: null, readout: null, pip: null, end: false } };
      const ui = s.ui;
      if (t < c.run) { s.rate = null; s.shot = { region: 'whole', zoom: 0.92 + 0.08 * Math.min(1, t / Math.max(1, c.run)) }; }   // a slow push-in, never static
      if (t >= c.run) { s.shot = { region: 'subject', zoom: 1 }; ui.label = 'Watch it run'; }
      if (t >= c.close) { s.shot = { region: 'detail', zoom: 1 }; s.focus = 'detail'; }
      if (t >= c.slow) { ui.label = null; ui.readout = 'main'; ui.pip = 'trace'; s.shot = { region: 'detail', zoom: 1, shift: 0.17 }; }
      if (t >= c.peak) ui.note = 'Posed on the spoken word';
      if (t >= c.back) { s.shot = { region: 'whole', zoom: 1, ms: 2200 }; s.focus = null; ui.pip = null; ui.note = null; ui.readout = null; }
      if (t >= c.end) ui.end = true;
      return s;
    },
  };
}
