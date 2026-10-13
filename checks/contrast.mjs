// Light-theme contrast check: flag frames that are near white-on-white (the first crumple-zone render; four-stroke's
// white engine; pendulum-clock's fogged weight shot). Each frame is reduced to 192×108 grey; the subtitle band (bottom
// 22%) is ignored. "ink" = share of pixels darker than 200/255 (the paper is ~240): the real material colours, four-tone
// shading and a mid-grey focus fog all put ink on the frame; white parts on white paper do not.
//   washed:  ink < 1.0 % and the darkest 5 % of pixels lighter than 205      -> FAIL
//   pale:    ink < 2.0 %                                                      -> warning (more than a quarter of frames fails)
// Calibration on the finished films (sampled every 4 s): crumple-zone after its look pass ≥ 5.6 % everywhere; generator ≥ 1.7 %;
// four-stroke 0-0.1 % and pendulum-clock 0.4 % on the shots the review called washed out.
//   node checks/contrast.mjs <film.mp4> [--every 2]       (any film, e.g. an older topic's)
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpeg } from '../lib/ffmpeg.mjs';

export const W = 192, H = 108, BAND = Math.round(H * 0.22);
export const LIMITS = { washedInk: 1.0, washedP05: 205, paleInk: 2.0, paleShare: 0.25 };

export function statsOf(gray) {
  const px = gray.subarray(0, W * (H - BAND)), M = px.length, h = new Uint32Array(256);
  let s = 0, s2 = 0;
  for (const v of px) { s += v; s2 += v * v; h[v]++; }
  const mean = s / M, std = Math.sqrt(Math.max(0, s2 / M - mean * mean));
  let c = 0, p05 = 0; for (let i = 0; i < 256; i++) { c += h[i]; if (c >= 0.05 * M) { p05 = i; break; } }
  let ink = 0; for (let i = 0; i < 200; i++) ink += h[i];
  ink = (ink / M) * 100;
  const verdict = ink < LIMITS.washedInk && p05 > LIMITS.washedP05 ? 'washed' : ink < LIMITS.paleInk ? 'pale' : 'ok';
  return { mean: +mean.toFixed(1), std: +std.toFixed(1), p05, ink: +ink.toFixed(2), verdict };
}

/** Decode one image (PNG/JPEG buffer) to 192×108 grey. */
export function grayOf(buf, FF = ffmpeg()) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { input: buf, maxBuffer: 1 << 26 });
  if (r.status) throw new Error('ffmpeg could not decode a frame');
  return r.stdout;
}

/** Sample a film every `every` seconds. -> [{ t, ...stats }] */
export function filmStats(file, every = 2, FF = ffmpeg()) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `fps=1/${every},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const N = W * H, n = Math.floor(r.stdout.length / N), out = [];
  for (let k = 0; k < n; k++) out.push({ t: k * every, ...statsOf(r.stdout.subarray(k * N, (k + 1) * N)) });
  return out;
}

export function summarize(rows) {
  const washed = rows.filter((r) => r.verdict === 'washed'), pale = rows.filter((r) => r.verdict === 'pale');
  const fail = washed.length > 0 || pale.length + washed.length > rows.length * LIMITS.paleShare;
  return { frames: rows.length, washed, pale, fail, minInk: Math.min(...rows.map((r) => r.ink)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const i = process.argv.indexOf('--every'), every = i > 0 ? Number(process.argv[i + 1]) : 2;
  if (!file || !fs.existsSync(file)) { console.error('usage: node checks/contrast.mjs <film.mp4> [--every 2]'); process.exit(1); }
  const s = summarize(filmStats(file, every));
  console.log(`${s.frames} frames, min ink ${s.minInk}%: ${s.washed.length} washed, ${s.pale.length} pale -> ${s.fail ? 'FAIL' : 'pass'}`);
  for (const r of [...s.washed, ...s.pale].sort((a, b) => a.t - b.t).slice(0, 40)) console.log(`  ${r.t}s ${r.verdict} ink ${r.ink}% p05 ${r.p05} std ${r.std}`);
  process.exit(s.fail ? 1 : 0);
}
