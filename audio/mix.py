"""mix.py (explainer-studio): the film's soundtrack from what the figure actually did. Run by render.mjs with
EXPLAINER_VIDEO_ROOT = the topic's video folder.

Inputs: assets/audio/narration.wav, assets/audio/bed.mp3 (optional), assets/audio/sfx/*.mp3, out/events.json from the
render's audio pass: {"sfx": [{t, name, gain}], "loops": {name: [[t, level] or [t, level, rate], ...]}, "duration": s},
and optional assets/data/mix.json:
  {"levels": {"shutter": 0.75, ...},        per-sound level (default 0.5) after every sound is normalised to one peak
   "min_gap": 0.35,                          a sound repeated sooner than this is dropped (no machine-gun repeats)
   "repeat_gain": 1.0,                       later repeats of a sound at this factor (crumple-zone used 0.6 for replays)
   "loops": {"hum": {"gain": 0.16, "duck": 0.45, "smooth": 0.35}},   continuous sounds at the level the scene recorded
   "bed": {"gain": 0.26, "duck": 0.15}}      music bed (normalised), ducked under the voice
Merged from the five physics-five mixers: sound effects sit on the frame where they happened (event-placed), are trimmed of
leading silence, normalised, faded in over 10 ms (no click) and spaced; loops follow the figure (a level per frame, and
optionally a playback rate, e.g. a hum read at the speed you SEE); the bed ducks under the narration and fades in and out.
Output: out/mix.wav (48 kHz mono), peak normalised to -1 dBFS.
"""
import json, os, pathlib
import numpy as np, librosa, soundfile as sf

ROOT = pathlib.Path(os.environ.get("EXPLAINER_VIDEO_ROOT") or os.getcwd()).resolve()
SR = 48000
load = lambda p: librosa.load(str(p), sr=SR, mono=True)[0].astype(np.float32)
cfg_path = ROOT / 'assets/data/mix.json'
CFG = json.loads(cfg_path.read_text(encoding='utf-8')) if cfg_path.exists() else {}
LEVEL = CFG.get('levels', {})
MIN_GAP = CFG.get('min_gap', 0.35)
REPEAT = CFG.get('repeat_gain', 1.0)

def trim(y, thr=0.02):
    a = np.abs(y)
    if a.max() <= 0: return y
    i = int(np.argmax(a > thr * a.max()))
    return y[max(0, i - int(0.003 * SR)):]

narr = load(ROOT / 'assets/audio/narration.wav')
ev = json.loads((ROOT / 'out/events.json').read_text(encoding='utf-8'))
dur = max(len(narr) / SR, ev.get('duration', 0))
N = int(dur * SR) + SR
out = np.zeros(N, np.float32)
out[:len(narr)] += narr

sfx = {}
for p in (ROOT / 'assets/audio/sfx').glob('*.mp3'):
    y = trim(load(p)); pk = float(np.max(np.abs(y))) or 1.0
    sfx[p.stem] = y * (0.5 / pk)                       # every effect to one peak: the levels mean the same thing

# 1) event-placed sound effects
placed, last, seen, missing = {}, {}, {}, set()
for e in sorted(ev.get('sfx', []), key=lambda e: e['t']):
    name = e['name']
    if name not in sfx: missing.add(name); continue
    if e['t'] - last.get(name, -9) < MIN_GAP: continue
    last[name] = e['t']
    s = sfx[name]; i = int(max(0, e['t']) * SR)
    if i >= N: continue
    n = min(len(s), N - i); env = np.ones(n, np.float32)
    f = min(n, int(0.01 * SR)); env[:f] = np.linspace(0, 1, f)
    rep = REPEAT if seen.get(name) else 1.0
    seen[name] = seen.get(name, 0) + 1
    out[i:i + n] += s[:n] * env * LEVEL.get(name, 0.5) * e.get('gain', 1) * rep
    placed[name] = placed.get(name, 0) + 1

# voice envelope (for ducking)
env = np.abs(np.pad(narr, (0, max(0, N - len(narr)))))[:N]
k = int(0.25 * SR); env = np.convolve(env, np.ones(k, np.float32) / k, mode='same')
talking = np.clip(env / 0.02, 0, 1)
tt = np.arange(N) / SR

def smooth(x, sec):
    k = max(1, int(sec * SR)); return np.convolve(x, np.ones(k, np.float32) / k, mode='same')

def loop_at(sig, rate):
    pos = np.cumsum(rate); idx = pos % (len(sig) - 1)
    i0 = idx.astype(np.int64); fr = (idx - i0).astype(np.float32)
    return sig[i0] * (1 - fr) + sig[i0 + 1] * fr

# 2) continuous loops at the level (and rate) the scene recorded
for name, pts in (ev.get('loops') or {}).items():
    if name not in sfx: missing.add(name); continue
    a = np.array(pts, dtype=np.float64)
    if not len(a): continue
    lc = CFG.get('loops', {}).get(name, {})
    idx = np.clip(np.searchsorted(a[:, 0], tt, side='right') - 1, 0, len(a) - 1)
    level = np.where(tt < a[0, 0], 0, a[idx, 1]).astype(np.float32)
    level = smooth(level, lc.get('smooth', 0.35))
    rate = np.interp(tt, a[:, 0], a[:, 2]).astype(np.float32) if a.shape[1] > 2 else np.ones(N, np.float32)
    out += lc.get('gain', 0.16) * loop_at(sfx[name], rate) * level * (1 - lc.get('duck', 0.45) * talking)

# 3) music bed, ducked under the voice
bed_p = ROOT / 'assets/audio/bed.mp3'
if bed_p.exists():
    bed = load(bed_p)
    bed = bed * (0.5 / (np.percentile(np.abs(bed), 99.5) or 1))
    bed = np.pad(bed, (0, max(0, N - len(bed))))[:N]
    bc = CFG.get('bed', {})
    gain = bc.get('gain', 0.26) - bc.get('duck', 0.15) * talking
    fade = np.ones(N, np.float32); fl = int(3 * SR)
    fade[:SR] = np.linspace(0, 1, SR); end = int(dur * SR); fade[max(0, end - fl):end] = np.linspace(1, 0, min(fl, end)); fade[end:] = 0
    out += bed * gain * fade
else:
    print('mix: no assets/audio/bed.mp3 (python gen_music.py --from-lib <bed> to reuse a library bed)')

out = out[:int(dur * SR)]
peak = np.max(np.abs(out))
if peak > 1e-6: out *= (10 ** (-1 / 20)) / peak
(ROOT / 'out').mkdir(exist_ok=True)
sf.write(str(ROOT / 'out/mix.wav'), out, SR)
print(f'mix.wav: {dur:.1f} s, placed {placed}, loops {list((ev.get("loops") or {}).keys())}, peak -1 dBFS')
if missing: print(f'mix: WARNING no sound file for {sorted(missing)} (add them to sfx.json and run gen_sfx)')
