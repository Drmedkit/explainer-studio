// Build a topic's film scene (video/out/scene.html) and open it in muted headless Chrome with the manual clock.
import fs from 'node:fs';
import path from 'node:path';
import { strip, bundle } from './bundle.mjs';
import { openPage, serve } from './chrome.mjs';

export function buildScene(T, { theme = 'light' } = {}) {
  const c = T.cfg, OUT = T.videoOut;
  fs.mkdirSync(OUT, { recursive: true });
  const figFile = T.fragment(theme);
  if (!fs.existsSync(figFile)) throw new Error(`figure fragment missing: ${path.relative(T.dir, figFile)} (run node figure/build.mjs)`);
  const parts = [
    bundle(T, c.film.bundle || c.bundle.filter((f) => !/app\.mjs$/.test(f))),
    '// ---- kit: film/timeline-kit.mjs\n' + strip(T.kitRead('film/timeline-kit.mjs')),
    '// ---- video/timeline.mjs\n' + strip(T.read('video/timeline.mjs')),
    T.exists('video/scene.mjs') ? '// ---- video/scene.mjs\n' + strip(T.read('video/scene.mjs')) : '',
  ];
  const words = T.read('video/assets/data/words.json');
  const end = c.film.end || {};
  const html = T.kitRead('film/scene.template.html')
    .replace('{{THEME}}', theme).replace('{{TITLE}}', c.title)
    .replaceAll('{{ACCENT}}', c.colors.accent).replaceAll('{{ACCENT_DARK}}', c.colors.accentDark)
    .replace('{{EYEBROW}}', () => c.film.eyebrow || c.eyebrow)
    .replace('{{TITLE_HTML}}', () => c.titleHtml || c.title)
    .replace('{{END_EYEBROW}}', () => end.eyebrow || 'Your turn')
    .replace('{{END_HTML}}', () => end.html || 'Open the lab and try it yourself.')
    .replace('{{END_MID}}', () => end.mid || 'Open lab: the same model, every dial.')
    .replace('{{FIGURE}}', () => fs.readFileSync(figFile, 'utf8'))
    .replace('{{BUNDLE}}', () => parts.join('\n'))
    .replace('{{WORDS}}', () => words)
    .replace('{{FIG_API}}', () => JSON.stringify(c.figure.api))
    .replace('{{RUNTIME}}', () => T.kitRead('film/scene-runtime.js'));
  fs.writeFileSync(path.join(OUT, 'scene.html'), html);
  return { file: path.join(OUT, 'scene.html'), words: JSON.parse(words) };
}

/** Serve video/out, open scene.html in a fresh muted browser (one per worker), wait for the figure. */
export async function sceneOpener(T) {
  const srv = await serve(T.videoOut);
  const open = async () => {
    const page = await openPage({ width: 1920, height: 1080 });
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('[console]', m.text()); });
    await page.goto(srv.url('scene.html'), { waitUntil: 'networkidle0', timeout: 180000 });
    await page.evaluate(() => window.sceneReady);
    await page.evaluate(() => document.fonts.ready);
    return page;
  };
  return { open, close: srv.close };
}

/** Step the manual clock frame by frame from `from` to `frame` (state is cumulative), in batches. */
export async function advanceTo(page, frame, from, dt) {
  let f = from;
  while (f < frame) { const n = Math.min(300, frame - f); await page.evaluate((n, dt) => { for (let i = 0; i < n; i++) window.renderFrame(dt); }, n, dt); f += n; }
  return frame;
}
