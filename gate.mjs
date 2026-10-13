// The quality gates for one topic, as one command. Prints a pass/fail table and writes out/gate.json; exits 1 on any FAIL.
//   node gate.mjs <topic>                 everything
//   node gate.mjs <topic> --quick         film text check every 2 s instead of 0.5 s, page at 1400 px only (for iterating)
//   node gate.mjs <topic> --skip-film     do not require a rendered film (before the full render)
//
// Gates (each is a lesson from the seven hand-built explainers):
//   model       the model's own self-checks (topic.config model.check, default `node src/model.mjs`) exit 0
//   audit       the anatomy audit: `node figure/build.mjs --audit` ends "audit passed"
//   lines       the anatomy line check (scripts/lines.mjs) on the dark and light figure pages: 0 floating line ends
//   film text   text collisions over the whole film, every 0.5 s (instrument labels, lines through labels, overlays)
//   readouts    every spoken measurement is on screen within its cue window (pose the model on the spoken word)
//   contrast    light theme: no near white-on-white frames (sampled every 2 s, title and end cards excluded)
//   page 390 / page 1400   every tab, step and lab control: text clean, no console errors, no sideways scroll
//   voice       the narration is the real voice (not --placeholder timing)
//   720p size   the web copy exists and is under 15 MB (the artifact limit)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadTopic, topicArg, arg, ANATOMY } from './lib/topic.mjs';
import { buildScene, sceneOpener, advanceTo } from './lib/scene.mjs';
import { buildPage } from './lib/page.mjs';
import { closeAll } from './lib/chrome.mjs';
import { ffmpeg, WEB_LIMIT_MB } from './lib/ffmpeg.mjs';
import { pageCheck } from './checks/pagecheck.mjs';
import { readoutPlan, grabScreen, judge } from './checks/readouts.mjs';
import { statsOf, grayOf, summarize, LIMITS } from './checks/contrast.mjs';

const T = loadTopic(topicArg());
const C = T.cfg, quick = !!arg('quick');
const rows = [];
const add = (gate, result, detail) => { rows.push({ gate, result, detail }); console.log(`[${result}] ${gate}: ${detail}`); };
const sh = (cmd, cwd = T.dir) => spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, FORCE_COLOR: '0' } });
const tail = (s, n = 3) => (s || '').trim().split(/\r?\n/).filter(Boolean).slice(-n).join(' / ');
const LOG = T.path('out', 'gate'); fs.mkdirSync(LOG, { recursive: true });
const t0 = Date.now();

// ---- 1. model self-checks
{
  const r = sh(C.model.check);
  fs.writeFileSync(path.join(LOG, 'model.txt'), (r.stdout || '') + (r.stderr || ''));
  add('model', r.status === 0 ? 'PASS' : 'FAIL', r.status === 0 ? tail(r.stdout, 1) : `exit ${r.status}: ${tail(r.stderr || r.stdout)}`);
}
// ---- 2. anatomy audit + line check (also rebuilds the figure files)
{
  const r = sh(C.figure.audit);
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(LOG, 'audit.txt'), out);
  const passed = r.status === 0 && /audit passed/.test(out);
  add('audit', passed ? 'PASS' : 'FAIL', passed ? tail(out.split('\n').filter((l) => /^audit ·/.test(l)).join('\n') || 'audit passed', 1) : tail(out, 4));
  const lines = [];
  for (const theme of ['dark', 'light']) {
    const page = T.page(theme);
    if (!fs.existsSync(page)) { lines.push(`${theme}: no ${path.basename(page)}`); continue; }
    const lr = sh(`node "${path.join(ANATOMY, 'scripts', 'lines.mjs')}" "${page}" --out "${path.join(LOG, `lines-${theme}.png`)}"`);
    const o = (lr.stdout || '') + (lr.stderr || '');
    fs.writeFileSync(path.join(LOG, `lines-${theme}.txt`), o);
    const m = /line ends:\s*(\d+)/.exec(o);
    lines.push(`${theme} ${m ? m[1] : '?'}${lr.status ? ` (exit ${lr.status})` : ''}`);
    if (lr.status || !m || m[1] !== '0') lines.bad = true;
  }
  add('lines', lines.bad ? 'FAIL' : 'PASS', `floating line ends: ${lines.join(', ')}`);
}
// ---- 3. one walk through the film scene: text check, readouts, contrast frames
if (!T.exists('video/assets/data/words.json')) add('film walk', 'FAIL', 'no words.json: node audio.mjs <topic> narrate [--placeholder]');
else {
  const { words } = buildScene(T);
  const fps = C.film.fps || 30, dt = 1000 / fps, D = words.duration;
  const every = quick ? 2 : 0.5;
  const textTimes = Array.from({ length: Math.floor(D / every) + 1 }, (_, i) => +(i * every).toFixed(3)).filter((t) => t <= D);
  const plan = readoutPlan(T, words);
  const shotTimes = Array.from({ length: Math.floor(D / 2) + 1 }, (_, i) => i * 2).filter((t) => t <= D);
  const all = [...new Set([...textTimes, ...plan.times, ...shotTimes])].sort((a, b) => a - b);
  const textSet = new Set(textTimes), shotSet = new Set(shotTimes), readSet = new Set(plan.times);
  const src = T.kitRead('checks/textcheck.js');
  const S = await sceneOpener(T);
  const page = await S.open();
  const FF = ffmpeg();
  let f = 0; const textProblems = [], screenAt = new Map(), frames = [];
  for (const t of all) {
    f = await advanceTo(page, Math.round(t * fps), f, dt);
    if (textSet.has(t)) for (const p of await page.evaluate(`(${src})(${JSON.stringify(C.instruments)})`)) textProblems.push(`${t}s ${p}`);
    if (readSet.has(t)) screenAt.set(t, await page.evaluate(grabScreen));
    if (shotSet.has(t)) {
      const ui = await page.evaluate((t) => { const s = window.__film.at(t); return s.ui || {}; }, t);
      if (ui.title || ui.end) continue;
      const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
      const st = statsOf(grayOf(buf, FF));
      frames.push({ t, ...st });
      if (st.verdict !== 'ok') fs.writeFileSync(path.join(LOG, `contrast-${st.verdict}-${t}s.jpg`), buf);
    }
  }
  await page.browser().close(); S.close();
  fs.writeFileSync(path.join(LOG, 'film-text.txt'), textProblems.join('\n'));
  add('film text', textProblems.length ? 'FAIL' : 'PASS', `${textTimes.length} moments every ${every} s, ${textProblems.length} problems${textProblems.length ? ': ' + textProblems.slice(0, 3).join(' | ') : ''}`);
  const rd = judge(plan.items, screenAt);
  const strictMiss = rd.missing.filter((x) => x.strict);
  const soft = C.gates?.readouts === 'warn';
  add('readouts', rd.missing.length ? (soft && !strictMiss.length ? 'WARN' : 'FAIL') : 'PASS',
    `${rd.checked} spoken measurements, ${rd.checked - rd.missing.length} on screen in their window${rd.missing.length ? '; missing: ' + rd.missing.slice(0, 4).map((x) => `${x.t.toFixed(1)}s "${x.text}"`).join(', ') : ''}`);
  fs.writeFileSync(path.join(LOG, 'readouts.json'), JSON.stringify(rd.items, null, 1));
  const cs = summarize(frames);
  fs.writeFileSync(path.join(LOG, 'contrast.json'), JSON.stringify(frames));
  add('contrast', cs.fail ? 'FAIL' : cs.pale.length ? 'WARN' : 'PASS', `${cs.frames} frames, min ink ${cs.minInk}% (washed < ${LIMITS.washedInk}%: ${cs.washed.length}${cs.washed.length ? ' at ' + cs.washed.slice(0, 5).map((r) => r.t + 's').join(', ') : ''}; pale < ${LIMITS.paleInk}%: ${cs.pale.length})`);
  add('voice', words.placeholder ? 'WARN' : 'PASS', words.placeholder ? 'placeholder timing (silent): run node audio.mjs <topic> narrate for the real voice' : `${words.lines.length} lines, ${D.toFixed(1)} s`);
}
// ---- 4. the page at 390 and 1400 px
try {
  buildPage(T);
  const res = await pageCheck(T, { widths: quick ? [1400] : [390, 1400], log: (s) => fs.appendFileSync(path.join(LOG, 'page.txt'), s + '\n') });
  for (const r of res) {
    const bad = r.problems.length || r.errors.length;
    add(`page ${r.width}`, bad ? 'FAIL' : 'PASS', `${r.moments} moments; text ${r.problems.length}, console errors ${r.errors.length}, sideways ${r.sideways}${bad ? ': ' + [...r.errors, ...r.problems].slice(0, 3).join(' | ') : ''}`);
  }
} catch (e) { add('page', 'FAIL', e.message); }
// ---- 5. the 720p web copy
if (fs.existsSync(T.film720)) {
  const mb = fs.statSync(T.film720).size / 1e6;
  const words = T.exists('video/assets/data/words.json') ? T.words() : null;
  const probe = spawnSync(ffmpeg('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', T.film720], { encoding: 'utf8' });
  let info = ''; try { const j = JSON.parse(probe.stdout); info = `${j.streams[0].width}×${j.streams[0].height}, ${(+j.format.duration).toFixed(1)} s`; if (words && Math.abs(+j.format.duration - words.duration) > 1.5) info += ` (narration ${words.duration.toFixed(1)} s: re-render?)`; } catch (e) {}
  add('720p size', mb < WEB_LIMIT_MB ? 'PASS' : 'FAIL', `${mb.toFixed(1)} MB (limit ${WEB_LIMIT_MB}), ${info}`);
} else add('720p size', arg('skip-film') ? 'SKIP' : 'FAIL', `no ${path.relative(T.dir, T.film720)} (node render.mjs <topic>)`);

await closeAll();
// ---- table
const w = Math.max(...rows.map((r) => r.gate.length));
const line = (a, b, c) => `| ${a.padEnd(w)} | ${b.padEnd(6)} | ${c}`;
console.log(`\nGate: ${C.slug}  (${((Date.now() - t0) / 1000).toFixed(0)} s, logs in out/gate/)`);
console.log(line('gate', 'result', 'detail'));
console.log(`|${'-'.repeat(w + 2)}|--------|${'-'.repeat(40)}`);
for (const r of rows) console.log(line(r.gate, r.result, r.detail.length > 160 ? r.detail.slice(0, 157) + '...' : r.detail));
const fails = rows.filter((r) => r.result === 'FAIL').length;
console.log(fails ? `\n${fails} gate(s) FAILED` : '\nall gates passed' + (rows.some((r) => r.result === 'WARN') ? ' (with warnings)' : ''));
fs.writeFileSync(T.path('out', 'gate.json'), JSON.stringify({ topic: C.slug, at: new Date().toISOString(), rows }, null, 1));
process.exit(fails ? 1 : 0);
