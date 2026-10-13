// Headless Chrome for every kit script. ALWAYS muted (test runs should never play on the speakers). One browser per page:
// a page that is not in front gets no animation frames, and the figures draw in requestAnimationFrame.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer';

export const CHROME_ARGS = ['--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=d3d11',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--allow-file-access-from-files', '--autoplay-policy=user-gesture-required'];

const browsers = new Set();
export async function launch() {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 0, args: CHROME_ARGS });
  if (!CHROME_ARGS.includes('--mute-audio')) throw new Error('headless Chrome must run with --mute-audio');
  browsers.add(b);
  return b;
}
/** A fresh browser with one page; errors collected in page.__errors (console errors + page errors). */
export async function openPage({ width = 1920, height = 1080, scale = 1, dark = false, ignore = [/Failed to load resource/, /favicon/] } = {}) {
  const b = await launch();
  const page = (await b.pages())[0] || await b.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !ignore.some((r) => r.test(m.text()))) page.__errors.push('console: ' + m.text()); });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  return page;
}
export async function closeAll() { await Promise.all([...browsers].map((b) => b.close().catch(() => {}))); browsers.clear(); }

/** Tiny static server for one folder (fonts load from Google). Returns { url(file), close() }. */
export function serve(dir, port = 0) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.vtt': 'text/vtt' };
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port);
  return new Promise((ok) => server.on('listening', () => ok({ url: (file) => `http://127.0.0.1:${server.address().port}/${file}`, close: () => server.close() })));
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
