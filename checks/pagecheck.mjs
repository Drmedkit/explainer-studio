// Page check (merged from the five topics' pagecheck/pagetext/check-page/overflow scripts): the built page
// (out/page/preview.html) in muted headless Chrome at each width: every tab, every explainer step before and after
// answering, the lab at defaults, then every lab range at its min and max and every lab chip/button pressed; the
// text-collision check at every stop, console errors, sideways scroll. Screenshots -> out/check/.
//   node checks/pagecheck.mjs <topic> [--widths 390,1400] [--dark]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTopic, topicArg, arg } from '../lib/topic.mjs';
import { openPage, serve, closeAll, sleep } from '../lib/chrome.mjs';

export async function pageCheck(T, { widths = [390, 1400], dark = false, log = console.log } = {}) {
  const pageDir = T.path('out', 'page');
  if (!fs.existsSync(path.join(pageDir, 'preview.html'))) throw new Error('no out/page/preview.html: run node ship.mjs <topic> first');
  const SHOTS = T.path('out', 'check'); fs.mkdirSync(SHOTS, { recursive: true });
  const src = T.kitRead('checks/textcheck.js');
  const srv = await serve(pageDir);
  const results = [];
  for (const W of widths) {
    const page = await openPage({ width: W, height: 900, dark });
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(srv.url('preview.html'), { waitUntil: 'networkidle0', timeout: 120000 });
    const res = { width: W, moments: 0, problems: [], errors: page.__errors, sideways: 0 };
    const tag = `${dark ? 'dark' : 'light'}-${W}`;
    const probe = async (where, shot = false) => {
      res.moments++;
      const p = await page.evaluate(`(${src})(${JSON.stringify(T.cfg.instruments)})`);
      for (const x of p) { res.problems.push(`${where}: ${x}`); if (x.startsWith('page scrolls sideways')) res.sideways++; }
      if (shot || p.length) await page.screenshot({ path: path.join(SHOTS, `${tag}-${where.replace(/[^\w-]+/g, '_')}.png`), fullPage: true });
    };
    await sleep(1500); await probe('watch', true);
    await page.click('#t-explain'); await sleep(1200);
    const n = await page.evaluate(() => document.querySelectorAll('#dots i').length);
    for (let i = 0; i < n; i++) {
      await probe(`step${i + 1}`);
      await page.evaluate(() => { const o = document.querySelector('#stepCard .opt'); if (o) o.click(); });
      await sleep(1300);
      await probe(`step${i + 1}-after`, i === 0 || i === n - 1);
      await page.evaluate(() => document.querySelector('#next').click()); await sleep(700);
    }
    // the last "next" opens the lab
    await sleep(1200);
    if (await page.evaluate(() => document.querySelector('#p-lab').hidden)) { await page.click('#t-lab'); await sleep(1200); }
    await probe('lab', true);
    const ranges = await page.evaluate(() => [...document.querySelectorAll('#p-lab input[type=range]')].map((e) => ({ id: e.id, min: e.min, max: e.max, value: e.value })));
    for (const r of ranges) {
      for (const v of [r.min, r.max]) {
        await page.evaluate((id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, r.id, v);
        await sleep(700); await probe(`lab-${r.id}=${v}`);
      }
      await page.evaluate((id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, r.id, r.value);
    }
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#labPanel button')].length);
    for (let i = 0; i < buttons; i++) {
      const label = await page.evaluate((i) => { const b = [...document.querySelectorAll('#labPanel button')][i]; if (!b) return null; b.click(); return b.id || b.textContent.trim().slice(0, 24); }, i);
      if (label == null) continue;
      await sleep(800); await probe(`lab-button-${label}`);
    }
    for (const [label, js] of Object.entries(T.cfg.page.labPoses || {})) { await page.evaluate(js); await sleep(900); await probe(`lab-${label}`, true); }
    for (const tab of ['watch', 'explain', 'lab']) {
      await page.click('#t-' + tab); await sleep(500);
      const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw > iw + 1) { res.sideways++; res.problems.push(`${tab}: page scrolls sideways (${sw} > ${iw})`); }
    }
    log(`page ${W}px: ${res.moments} moments, ${res.problems.length} text problems, ${res.errors.length} console errors, sideways ${res.sideways}`);
    for (const p of res.problems.slice(0, 30)) log('  ' + p);
    for (const e of res.errors.slice(0, 10)) log('  ' + e);
    results.push(res);
    await page.browser().close();
  }
  srv.close();
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const T = loadTopic(topicArg());
  const widths = String(arg('widths', '390,1400')).split(',').map(Number);
  const r = await pageCheck(T, { widths, dark: !!arg('dark') });
  await closeAll();
  process.exit(r.some((x) => x.problems.length || x.errors.length) ? 1 : 0);
}
