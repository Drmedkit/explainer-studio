// Build a topic's page (out/page/index.html for the artifact, preview.html for local viewing) and its static site
// (out/site/index.html with head, social preview and favicon, plus the 720p film and the poster).
import fs from 'node:fs';
import path from 'node:path';
import { bundle, scriptSafe } from './bundle.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = (t % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`; };

export function buildPage(T) {
  const c = T.cfg, OUT = T.path('out', 'page');
  fs.mkdirSync(OUT, { recursive: true });
  const words = T.exists('video/assets/data/words.json') ? T.words() : { lines: [], cues: {}, duration: 0 };
  // captions inline (artifacts don't serve .vtt) and chapters from the narration cues
  const vtt = ['WEBVTT', ''].concat(words.lines.flatMap((l, i) => [String(i + 1), `${ts(l.start)} --> ${ts(l.end + 0.2)}`, l.text.replace(/\{[^}]+\}/g, ''), ''])).join('\n');
  const chapters = (c.film.chapters || []).filter(([, cue]) => words.cues[cue] != null).map(([n, cue]) => [n, Math.max(0, Math.round((words.cues[cue] - 0.6) * 10) / 10)]);
  const D = words.duration, filmLen = `${Math.floor(D / 60)}:${String(Math.round(D % 60)).padStart(2, '0')}`;
  const figFile = T.fragment('light');
  if (!fs.existsSync(figFile)) throw new Error(`figure fragment missing: ${path.relative(T.dir, figFile)} (run node figure/build.mjs)`);
  // the topic must define STEPS / CHALLENGES / APP; count steps for the tab label
  const steps = (T.read('src/content.mjs').match(/^\s{2,4}\{\s*title:/gm) || []).length || 8;
  const body = bundle(T, c.bundle) + '\nconst CAPTIONS_VTT = ' + JSON.stringify(vtt) + ';';
  const html = T.kitRead('page/page.template.html')
    .replace('{{TITLE}}', esc(c.title))
    .replace('{{TITLE_HTML}}', () => c.titleHtml || esc(c.title))
    .replace('{{EYEBROW}}', () => esc(c.eyebrow))
    .replace('{{LEDE}}', () => c.lede)
    .replace('{{FILM_LEN}}', filmLen)
    .replace('{{STEPS_N}}', String(c.page.steps || steps))
    .replace('{{CHALLENGES_LABEL}}', esc(c.page.challengesLabel))
    .replace('{{FIG_LABEL}}', esc(c.page.figLabel || `The ${c.title} figure`))
    .replace('{{FIGURE}}', () => fs.readFileSync(figFile, 'utf8'))
    .replace('{{FILM_FILE}}', `${c.film.name}.mp4`)
    .replace('{{WATCH_NOTE}}', () => c.page.watchNote || 'The film is recorded from the same figure and model you can run in the lab: every number on screen is reproducible.')
    .replace('{{LAB}}', () => (T.exists('src/lab.html') ? T.read('src/lab.html') : ''))
    .replace('{{FOOTER}}', () => c.footer)
    .replaceAll('{{ACCENT}}', c.colors.accent).replaceAll('{{ACCENT_DARK}}', c.colors.accentDark)
    .replace('{{EXTRA_CSS}}', () => (T.exists('src/page.css') ? T.read('src/page.css') : ''))
    .replace('{{BUNDLE}}', () => scriptSafe(body))
    .replace('{{FIG_API}}', JSON.stringify(c.figure.api))
    .replace('{{SLUG}}', JSON.stringify(c.slug))
    .replace('{{CHAPTERS}}', () => JSON.stringify(chapters))
    .replace('{{RUNTIME}}', () => scriptSafe(T.kitRead('page/page-runtime.js')));
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  // local preview with the same skeleton the Artifact tool adds at publish time
  fs.writeFileSync(path.join(OUT, 'preview.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>');
  for (const f of [`${c.film.name}.mp4`, 'poster.jpg']) { const src = path.join(T.videoOut, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f)); }
  console.log(`page: ${(html.length / 1024).toFixed(0)} KB -> out/page/index.html (film ${filmLen}, ${chapters.length} chapters)`);
  return { html, filmLen };
}

export function buildSite(T) {
  const c = T.cfg, PAGE = T.path('out', 'page'), SITE = T.path('out', 'site');
  fs.mkdirSync(SITE, { recursive: true });
  let body = fs.readFileSync(path.join(PAGE, 'index.html'), 'utf8');
  const title = (body.match(/<title>([^<]*)<\/title>/) || [, c.title])[1];
  body = body.replace(/<title>[^<]*<\/title>\s*/, '');
  const desc = esc(c.description || c.lede.replace(/<[^>]+>/g, ''));
  const icon = `data:image/svg+xml,${encodeURIComponent(c.iconSvg || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b0c"/><circle cx="32" cy="32" r="17" fill="none" stroke="#ececec" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="${c.colors.icon}"/></svg>`)}`;
  const head = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${esc(c.ogTitle || title)}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="poster.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${icon}">
</head><body>
`;
  fs.writeFileSync(path.join(SITE, 'index.html'), head + body + '\n</body></html>\n');
  for (const f of [`${c.film.name}.mp4`, 'poster.jpg']) {
    const p = path.join(PAGE, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(SITE, f)); else console.warn(`note: out/page/${f} not found; the site has no ${f} yet`);
  }
  // wrangler config from topic.config (worker name), written fresh so it never drifts
  fs.writeFileSync(T.path('wrangler.jsonc'), `{\n  // Static site: ${c.title} (built by explainer-studio ship.mjs from topic.config.json)\n  "name": "${c.worker}",\n  "compatibility_date": "2026-10-01",\n  "assets": { "directory": "./out/site" }\n}\n`);
  console.log('site -> out/site:', fs.readdirSync(SITE).join(', '));
}
