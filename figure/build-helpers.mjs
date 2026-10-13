// Node helpers for a topic's figure/build.mjs, on top of the anatomy skill (~/.claude/skills/anatomy, MIT, not modified).
//   import { anatomy, scopeCss, focusCss, materialCss, stageScript, writeFigure } from '<kit>/figure/build-helpers.mjs';
//   const { k, G, A, T, gl, inline } = await anatomy();
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KIT, ANATOMY } from '../lib/topic.mjs';

export { ANATOMY };
/** The anatomy kit modules: iso-kit (k), lathe (G), audit (A), tube (T), gl, inline-kit (inline). */
export async function anatomy() {
  const imp = (p) => import(pathToFileURL(path.join(ANATOMY, p)).href);
  const [k, G, A, T, gl, inline] = await Promise.all(['kit/iso-kit.mjs', 'kit/lathe.mjs', 'kit/audit.mjs', 'kit/tube.mjs', 'kit/gl.mjs', 'scripts/inline-kit.mjs'].map(imp));
  return { k, G, A, T, gl, inline };
}

/** The kit's CSS scoped to the figure root, so the fragment leaks nothing into the page or film that hosts it. */
export function scopeCss(css, root) {
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const sel = css.slice(i, open).trim();
    if (sel.startsWith('@media') || sel.startsWith('@supports') || sel.startsWith('@keyframes')) {
      let depth = 1, j = open + 1;
      while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      out += sel + '{' + (sel.startsWith('@keyframes') ? css.slice(open + 1, j - 1) : scopeCss(css.slice(open + 1, j - 1), root)) + '}';
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    out += sel.split(',').map((x) => { x = x.trim(); return x === '.iso' || x.startsWith('.iso[') || x.startsWith('.iso:') ? root + x : `${root} ${x}`; }).join(',') + css.slice(open, close + 1);
    i = close + 1;
  }
  return out;
}

const TOKENS = ['paper', 'face', 'top', 'shade-0', 'shade-1', 'shade-2', 'shade-3', 'lit-top', 'lit-shade', 'hi', 'mid', 'lo', 'faint', 'lit', 'dot'];
/** Focus that fogs toward a mid grey (desaturated, lower contrast), never toward the paper: the crumple-zone look-pass rule.
 *  Every item (.it) reads its tones from --d-*; under [data-focus] an item mixes them with the fog by its --fk (1 → 0.45).
 *  extra: the topic's own colour variables that should fog too (names without the leading --). */
export function focusCss(root, { extra = [], fog = { dark: '#2b2b2d', light: '#d3d2ce' } } = {}) {
  const mixOf = (t) => `color-mix(in srgb, var(--d-${t}) calc(var(--fk, 1) * 100%), var(--xs-fog))`;
  return `
${root} { --xs-fog: ${fog.dark}; }
${root}[data-theme="light"], :root[data-theme="light"] ${root}:not([data-theme]) { --xs-fog: ${fog.light}; }
${root} [data-stage] { ${TOKENS.map((t) => `--d-${t}: var(--anatomy-${t});`).join(' ')} ${extra.map((t) => `--d-${t}: var(--${t});`).join(' ')} }
${root} .it { ${TOKENS.map((t) => `--anatomy-${t}: var(--d-${t});`).join(' ')} }
${root}[data-focus] .it { ${TOKENS.map((t) => `--anatomy-${t}: ${mixOf(t)};`).join(' ')} ${extra.map((t) => `--${t}: ${mixOf(t)};`).join(' ')} }
`;
}

/** Real material colours with their own four tones (light theme first; the crumple-zone look pass): items carry data-mat,
 *  and a sub-group inside any item may carry class="xm-<name>" (several materials in one item; it fogs with its item).
 *  mats: { steel: { light: { paper, face, top, shade: [s0, s1, s2, s3], litTop?, litShade?, line? }, dark: {...} } } */
export function materialCss(root, mats) {
  const block = (m) => {
    const s = m.shade;
    return `--d-paper:${m.paper};--d-face:${m.face ?? m.paper};--d-top:${m.top};--d-shade-0:${s[0]};--d-shade-1:${s[1]};--d-shade-2:${s[2]};--d-shade-3:${s[3]};--d-lit-top:${m.litTop ?? m.top};--d-lit-shade:${m.litShade ?? s[2]};${m.line ? `--d-mid:${m.line};--d-lo:${m.line};` : ''}`;
  };
  // .xm-<name>: the same material on a sub-group inside an item (one live slot drawing brass, steel and rubber parts). The
  // sub-group re-reads the anatomy tokens from its own --d-* and fogs with its item's --fk under [data-focus].
  const reread = TOKENS.map((t) => `--anatomy-${t}:var(--d-${t});`).join('');
  const fogged = TOKENS.map((t) => `--anatomy-${t}:color-mix(in srgb, var(--d-${t}) calc(var(--fk, 1) * 100%), var(--xs-fog));`).join('');
  return Object.entries(mats).map(([name, m]) =>
    `${root} .it[data-mat="${name}"]{${block(m.dark ?? m.light)}}\n${root}[data-theme="light"] .it[data-mat="${name}"],:root[data-theme="light"] ${root}:not([data-theme]) .it[data-mat="${name}"]{${block(m.light)}}` +
    `\n${root} .xm-${name}{${block(m.dark ?? m.light)}${reread}}\n${root}[data-theme="light"] .xm-${name},:root[data-theme="light"] ${root}:not([data-theme]) .xm-${name}{${block(m.light)}${reread}}` +
    `\n${root}[data-focus][data-focus] [data-stage] .xm-${name}{${fogged}}`).join('\n');
}

/** The shared figure runtime (XStage, XFigure: camera, focus, frame, clock) as script source. */
export const stageScript = () => fs.readFileSync(path.join(KIT, 'figure', 'stage.js'), 'utf8');

/** Strip a module for inlining into the figure script. */
export const strip = (text) => text.replace(/^\/\/ @cli[\s\S]*$/m, '').replace(/^import [^;]+;\s*$/gm, '').replace(/^export (const|function|let|class) /gm, '$1 ');

/** Write the four figure files: <name>.html, <name>-light.html (standalone pages, for the anatomy line check and review)
 *  and <name>.fragment.html, <name>-light.fragment.html (embedded by the page and the film).
 *  stage: the inner HTML of the [data-stage] element (SVG layers, canvas). css: topic CSS (already scoped to #id). */
export function writeFigure({ k, dir, name, id, stage, stageAttrs = '', css = '', script, plate, title }) {
  const SCOPED = scopeCss(k.ISO_CSS, `#${id}`);
  const stageHtml = `<div class="xs-stage" data-stage tabindex="0" role="group" ${stageAttrs}>${stage}</div>`;
  const out = [];
  for (const theme of ['dark', 'light']) {
    const suffix = theme === 'light' ? '-light' : '';
    const body = k.plateHtml({ ...plate, body: stageHtml });
    const wrapper = (extra) => `<div class="iso" id="${id}"${extra}><style>${SCOPED}${css}</style>${body}</div>`;
    const page = k.pageHtml({ title: title || plate.title, theme, body: wrapper(` data-theme="${theme}"`), script, width: 1100 });
    fs.writeFileSync(path.join(dir, `${name}${suffix}.html`), page);
    const frag = wrapper(` data-theme="${theme}"`) + `<script type="module">${script.replace(/<\/(script)/gi, '<\\/$1')}</script>`;
    fs.writeFileSync(path.join(dir, `${name}${suffix}.fragment.html`), frag);
    out.push(`${name}${suffix}.html ${(page.length / 1024).toFixed(0)} KB + fragment`);
  }
  console.log('wrote', out.join(', '));
}
