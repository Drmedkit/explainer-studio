// ffmpeg (PATH or the winget install) and the encode settings every topic uses.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function ffmpeg(tool = 'ffmpeg') {
  const r = spawnSync('where', [tool], { encoding: 'utf8', shell: true });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.split('\n')[0].trim();
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
    const sub = fs.readdirSync(path.join(base, d)).find((s) => s.startsWith('ffmpeg-'));
    if (sub) return path.join(base, d, sub, 'bin', `${tool}.exe`);
  }
  throw new Error(`${tool} not found (winget install Gyan.FFmpeg)`);
}

// 1080p master: x264 slow crf 19, AAC 192k. 720p web copy (the artifact and the site): crf 29, veryslow, tune animation,
// AAC 96k: a 4-minute light-theme film lands at 10-14 MB, under the 15 MB artifact limit.
export const MASTER = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
export const WEB = (crf = 29) => ['-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart'];
export const WEB_LIMIT_MB = 15;

export function run(FF, args, opts = {}) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', maxBuffer: 1 << 30 });
  if (r.status) throw new Error(`ffmpeg failed (${r.status}): ${args.join(' ')}`);
  return r.stdout;
}
