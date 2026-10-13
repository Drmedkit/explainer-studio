// Film renderer for any topic: build the scene (figure fragment + model/widgets/content + timeline + scene hooks + the
// narration's word timing), step it frame-exact with the manual clock in MUTED headless Chrome (one browser per worker),
// mix the soundtrack from what the figure did, and encode the 1080p master, the 720p web copy and the poster.
//
//   node render.mjs <topic> --still 62                 one frame -> video/out/still_62.png
//   node render.mjs <topic> --sheet 3,12,25,41         contact frames -> video/out/sheet_<t>.jpg (LOOK at them)
//   node render.mjs <topic> --textcheck all|t1,t2      text-collision check (every 0.5 s for all) -> video/out/textcheck.json
//   node render.mjs <topic> [--workers 3] [--fps 30]   full render + mix + encode
//   node render.mjs <topic> --ranges 29-38,62-76       re-render only these spans (seconds), keep the other frames
//   node render.mjs <topic> --from 60 --to 90          the same for one span
//   node render.mjs <topic> --audio-only               audio pass + mix only;  --encode-only: mix + encode the frames on disk
//   flags: --theme dark, --poster <s>, --crf720 29
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadTopic, topicArg, arg, KIT } from './lib/topic.mjs';
import { buildScene, sceneOpener, advanceTo } from './lib/scene.mjs';
import { closeAll } from './lib/chrome.mjs';
import { ffmpeg, run, MASTER, WEB, WEB_LIMIT_MB } from './lib/ffmpeg.mjs';

const T = loadTopic(topicArg());
const C = T.cfg, OUT = T.videoOut, NAME = C.film.name;
const fps = Number(arg('fps', C.film.fps || 30)), workers = Number(arg('workers', C.film.workers || 3));
const { words } = buildScene(T, { theme: arg('theme') === 'dark' ? 'dark' : 'light' });
const DURATION = words.duration, dt = 1000 / fps, total = Math.ceil(DURATION * fps);
const S = await sceneOpener(T);
const finish = async (code = 0) => { await closeAll(); S.close(); process.exit(code); };
const timesOf = (spec) => (spec === true || spec === 'all' ? Array.from({ length: Math.floor(DURATION * 2) }, (_, i) => i / 2) : String(spec).split(',').map(Number)).sort((a, b) => a - b);

if (arg('textcheck')) {
  const src = T.kitRead('checks/textcheck.js');
  const times = timesOf(arg('textcheck'));
  const page = await S.open(); let f = 0;
  const problems = [];
  for (const t of times) {
    const target = Math.round(t * fps); f = await advanceTo(page, target, f, dt);
    const probs = await page.evaluate(`(${src})(${JSON.stringify(C.instruments)})`);
    for (const p of probs) problems.push({ t, p });
    if (probs.length || times.length < 40) console.log(`t ${t}: ${probs.length ? probs.join(' | ') : 'clean'}`);
  }
  fs.writeFileSync(path.join(OUT, 'textcheck.json'), JSON.stringify({ moments: times.length, problems }, null, 1));
  console.log(`textcheck: ${times.length} moments, ${problems.length} problems`);
  await finish(problems.length ? 1 : 0);
}
if (arg('still') || arg('sheet')) {
  const times = timesOf(arg('still') || arg('sheet'));
  const page = await S.open(); let f = 0;
  for (const t of times) {
    f = await advanceTo(page, Math.round(t * fps), f, dt);
    const file = path.join(OUT, arg('still') ? `still_${t}.png` : `sheet_${t}.jpg`);
    await page.screenshot({ path: file, type: arg('still') ? 'png' : 'jpeg', quality: arg('still') ? undefined : 85 });
    console.log('wrote', path.relative(T.dir, file));
  }
  await finish(0);
}

// ---- audio pass: run the whole film once without screenshots, collecting what the figure did (sound events, loop levels)
const FR = path.join(OUT, 'frames'); fs.mkdirSync(FR, { recursive: true });
if (!arg('encode-only')) {
  const page = await S.open(); await advanceTo(page, total, 0, dt);
  const ev = await page.evaluate(() => ({ sfx: window.sfx, loops: window.loops }));
  fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ ...ev, duration: DURATION }));
  console.log('audio pass:', ev.sfx.length, 'sound events,', Object.keys(ev.loops).length, 'loops');
  await page.browser().close();
}
if (!arg('audio-only') && !arg('encode-only')) {
  const per = Math.ceil(total / workers);
  const fFrom = arg('from') ? Math.floor(+arg('from') * fps) : 0, fTo = arg('to') ? Math.ceil(+arg('to') * fps) : total;
  const RANGES = arg('ranges') ? String(arg('ranges')).split(',').map((r) => r.split('-').map(Number)).map(([a, b]) => [Math.floor(a * fps), Math.ceil(b * fps)]) : null;
  const wanted = (f) => f >= fFrom && f < fTo && (!RANGES || RANGES.some(([a, b]) => f >= a && f < b));
  const t0 = Date.now();
  await Promise.all([...Array(workers)].map(async (_, w) => {
    const a = w * per, b = Math.min(total, a + per);
    if (a >= b || b <= fFrom || a >= fTo || (RANGES && !RANGES.some(([x, y]) => x < b && y > a))) return;
    const page = await S.open(); await advanceTo(page, a, 0, dt);   // one browser per worker
    for (let f = a; f < b; f++) {
      await page.evaluate((dt) => window.renderFrame(dt), dt);
      if (!wanted(f)) continue;
      await page.screenshot({ path: path.join(FR, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
      if (f % 300 === 0) console.log(`worker ${w}: frame ${f}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    await page.browser().close();
  }));
}
await closeAll(); S.close();
const missing = [...Array(total).keys()].filter((f) => !fs.existsSync(path.join(FR, `f${String(f).padStart(5, '0')}.jpg`)));
if (arg('audio-only') ) { mix(); process.exit(0); }
if (missing.length) { console.error(`${missing.length} frames missing (first ${missing[0]}): render them before encoding`); process.exit(1); }

// ---- audio: narration + bed + sounds placed on the frames where they happened (audio/mix.py), then encode
mix();
function mix() {
  const py = spawnSync('python', [path.join(KIT, 'audio', 'mix.py')], { stdio: 'inherit', cwd: path.join(T.dir, 'video'), env: { ...process.env, EXPLAINER_VIDEO_ROOT: path.join(T.dir, 'video') } });
  if (py.status) process.exit(py.status);
}
const FF = ffmpeg();
run(FF, ['-y', '-framerate', String(fps), '-i', path.join(FR, 'f%05d.jpg'), '-i', path.join(OUT, 'mix.wav'), '-map', '0:v', '-map', '1:a', ...MASTER, '-shortest', T.film1080]);
run(FF, ['-y', '-i', T.film1080, ...WEB(arg('crf720', 29)), T.film720]);
run(FF, ['-y', '-ss', String(arg('poster', C.film.poster ?? 4)), '-i', T.film1080, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', path.join(OUT, 'poster.jpg')]);
const mb = (f) => fs.statSync(f).size / 1e6;
console.log(`done: ${NAME}-1080p.mp4 ${mb(T.film1080).toFixed(1)} MB, ${NAME}.mp4 ${mb(T.film720).toFixed(1)} MB (limit ${WEB_LIMIT_MB}), poster.jpg; ${DURATION.toFixed(1)} s`);
if (mb(T.film720) >= WEB_LIMIT_MB) console.warn(`720p copy is over ${WEB_LIMIT_MB} MB: re-encode with --encode-only --crf720 30 (or shorten the film)`);
