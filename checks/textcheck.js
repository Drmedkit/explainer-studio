// Text-collision check, evaluated in a page (film scene or explainer page) as `(${src})(instrumentSelector)`.
// Merged from camera-lens, generator, heat-pump, crumple-zone and pendulum-clock, plus the check those runs did by eye:
//   clipped       an instrument's <text> runs outside its SVG
//   overlap       two visible <text>s in one instrument overlap
//   line×text     a visible stroke (axis, curve, connector, grid line) runs through a label: the lesson from the p–h chart.
//                 Strokes painted before a [data-backing] element that covers the label are hidden by it and pass; mark a
//                 deliberate crossing with data-tc-ok on the line or the text.
//   overlay       the film's overlay boxes (label, readout, note, pip, sub) overlap each other or leave the frame
//   sideways      the page scrolls sideways
// Returns a list of problem strings (empty = clean).
(sel) => {
  const vis = (el) => { let n = el; while (n && n !== document) { if (n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } n = n.parentNode; } return true; };
  const R = (el) => el.getBoundingClientRect();
  const hit = (a, b, m = 0.5) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;
  const ok = (el) => !!el.closest('[data-tc-ok]');
  const out = [];
  const short = (s) => (s.length > 40 ? s.slice(0, 38) + '…' : s);
  for (const svg of document.querySelectorAll(sel || '.xw svg')) {
    if (!vis(svg)) continue;
    const sb = R(svg);
    if (sb.width < 2 || sb.height < 2) continue;
    const texts = [...svg.querySelectorAll('text')].filter((t) => vis(t) && t.textContent.trim() && +(t.getAttribute('opacity') ?? 1) > 0.05);
    const rs = texts.map(R);
    texts.forEach((t, i) => {
      const r = rs[i];
      if (r.left < sb.left - 1 || r.right > sb.right + 1 || r.top < sb.top - 1 || r.bottom > sb.bottom + 1) out.push(`clipped: "${short(t.textContent)}"`);
      for (let j = i + 1; j < texts.length; j++) if (hit(r, rs[j])) out.push(`overlap: "${short(t.textContent)}" × "${short(texts[j].textContent)}"`);
    });
    // ---- strokes through labels
    const backings = [...svg.querySelectorAll('[data-backing]')].filter(vis);
    const strokes = [...svg.querySelectorAll('line, polyline, path, polygon, circle, ellipse, rect')].filter((el) => {
      if (!vis(el) || ok(el) || el.closest('text, defs, clipPath, mask, pattern, marker')) return false;
      const cs = getComputedStyle(el);
      return cs.stroke && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && +cs.strokeOpacity * +cs.opacity > 0.15;
    });
    if (!strokes.length || !texts.length) continue;
    const boxes = texts.map((t, i) => ({ t, r: rs[i], ok: ok(t) })).filter((b) => !b.ok).map((b) => {
      const padX = Math.min(1.5, b.r.width * 0.1), padY = b.r.height * 0.22;
      return { ...b, l: b.r.left + padX, rt: b.r.right - padX, tp: b.r.top + padY, bt: b.r.bottom - padY };
    });
    const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const reported = new Set();
    for (const el of strokes) {
      const er = R(el);
      const cand = boxes.filter((b) => er.left <= b.rt && er.right >= b.l && er.top <= b.bt && er.bottom >= b.tp);
      if (!cand.length || typeof el.getTotalLength !== 'function') continue;
      let len = 0; try { len = el.getTotalLength(); } catch (e) { continue; }
      const m = el.getScreenCTM(); if (!m || !len) continue;
      const scale = Math.hypot(m.a, m.b) || 1, n = Math.min(4000, Math.max(2, Math.ceil((len * scale) / 1.5)));
      for (const b of cand) {
        if (reported.has(b.t)) continue;
        if (backings.some((k) => before(el, k) && (() => { const kr = R(k); return kr.left <= b.l && kr.right >= b.rt && kr.top <= b.tp && kr.bottom >= b.bt; })())) continue;
        for (let i = 0; i <= n; i++) {
          const p = el.getPointAtLength((len * i) / n);
          const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
          if (x > b.l && x < b.rt && y > b.tp && y < b.bt) { out.push(`line×text: <${el.tagName}${el.getAttribute('class') ? '.' + el.getAttribute('class').split(' ')[0] : ''}> through "${short(b.t.textContent)}"`); reported.add(b.t); break; }
        }
      }
    }
  }
  // ---- film overlays
  const ids = ['label', 'readout', 'note', 'pip', 'sub'];
  const boxes = ids.map((id) => document.getElementById(id)).filter((n) => n && vis(n) && n.textContent.trim());
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(R(boxes[i]), R(boxes[j]), 2)) out.push(`overlay overlap: #${boxes[i].id} × #${boxes[j].id}`);
  if (document.getElementById('figBox')) for (const b of boxes) { const r = R(b); if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`overlay off frame: #${b.id}`); }
  const de = document.documentElement;
  if (getComputedStyle(de).overflowX !== 'hidden' && de.scrollWidth > de.clientWidth + 1) out.push(`page scrolls sideways: ${de.scrollWidth} > ${de.clientWidth}`);
  return out;
}
