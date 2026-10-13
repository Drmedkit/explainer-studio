"""narrate.py: explainer narration (one voice or a dialogue) -> assets/audio/narration.wav + assets/data/words.json.

Input: assets/data/narration.json
{
  "voices": {                                      # optional; speakers by id. An entry is a NAME from the library's
    "narrator": "narrator",                        #   voices.json ("narrator", "pip", ...) or a full object
    "pip": "pip"                                   #   {"voice_id", "model_id", "voice_settings"} (or {"voice": "pip", ...
  },                                               #   overrides}). Missing speakers are looked up in voices.json.
  "voice_id": "cgSgspJ2msm6clMCkdW9",              # old single-voice form = the default "narrator" (still works)
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "speed": 0.92},
  "lead_in": 1.0,                                  # silence before the first line (s)
  "default_gap": 0.45,                             # pause after each line (s)
  "tail": 2.0,                                     # silence after the last line (s)
  "lines": [
    {"section": "intro", "text": "This is the pump. It moves {cookies}twelve liters a minute.", "gap": 0.8},
    {"section": "intro", "speaker": "pip", "text": "Can I have some?"},
    ...
  ]
}
- "speaker" (default "narrator") picks the voice. previous/next-text context only comes from neighbouring lines of the
  SAME speaker. words.json lines record their "speaker" (scenes: speakingAt(t), talking(t, 'pip'), talkMouth(t, 'pip')).
- `{name}` markers are not spoken; they become cues: words.json "cues": {"cookies": <time of the next word>}.
  Chapters use cueT('cookies') to land an animation exactly on that spoken word.
- A long "gap" after a line gives the picture time to show something (a thinking pause for the viewer).
- CACHE: each line is cached by sha1([text + model + settings, voice_id]) (16 hex), NOT by its neighbours, so editing one
  line only re-pays for that line. With a shared library (el.LIB) the cache is library/voice/: any line any video already
  spoke with the same voice + settings is free, new lines are written there and listed in library/voice/phrases.json
  ({hash: {text, voice_id, used_in}}). Without a library: assets/audio/narration_cache/.
- Credits are only checked (and the API key only needed) when a line actually has to be generated.

Usage (explainer-studio: node <kit>/audio.mjs <topic> narrate [--dry|--placeholder] runs this with the topic's video root):
       python tools/narrate.py            (generate / reuse cache, assemble, write words.json)
       python tools/narrate.py --placeholder  (no API: silent narration.wav + words.json timed at ~155 words/min, so the
                                          shot list and the film can be built before the voice is paid for; re-run
                                          without the flag for the real voice: every cue keeps its name)
       python tools/narrate.py --dry      (show which lines are cached / would be generated, spend nothing)
       python tools/narrate.py --voices   (list the account's voices)
"""
import sys, re, json, base64, hashlib, pathlib, shutil
import numpy as np, soundfile as sf, librosa
import el

ROOT = el.ROOT
CFG = ROOT / "assets/data/narration.json"
LOCAL_CACHE = ROOT / "assets/audio/narration_cache"
CACHE = (el.LIB / "voice") if el.LIB else LOCAL_CACHE
PHRASES = (el.LIB / "voice/phrases.json") if el.LIB else None
SR = 48000


def voices():
    import requests
    d = requests.get(f"{el.API}/v2/voices?page_size=100", headers={"xi-api-key": el.key()}, timeout=30).json()
    for v in d["voices"]:
        lab = v.get("labels") or {}
        print(f"{v['voice_id']}  {v['name']:<45} {lab.get('gender','')} {lab.get('age','')} {lab.get('accent','')} {lab.get('descriptive','')} {lab.get('use_case','')}")


def library_voices():
    p = el.LIB / "voices.json" if el.LIB else None
    return el.load_json(p) if p and p.exists() else {}


def resolve_speakers(cfg, needed):
    """speaker id -> {voice_id, model_id, voice_settings}. Precedence: narration.json "voices" entry (a library name or
    an object, optionally {"voice": name} + overrides) > for "narrator": the old top-level voice_id/settings >
    the library voices.json entry with the same id."""
    lib, table, out = library_voices(), cfg.get("voices", {}), {}
    top = {k: cfg[k] for k in ("voice_id", "model_id", "voice_settings") if k in cfg}
    for sp in needed:
        e = table.get(sp)
        if isinstance(e, str):
            if e not in lib: raise SystemExit(f"narration.json voices.{sp} = '{e}': no such voice in library/voices.json ({', '.join(lib) or 'no library'})")
            v = dict(lib[e])
        elif isinstance(e, dict):                           # {"voice": "pip", "voice_settings": {...}} = pip with overrides
            name = e.get("voice")
            if name is not None and name not in lib: raise SystemExit(f"narration.json voices.{sp}.voice = '{name}': not in library/voices.json")
            base = lib[name] if name is not None else ({} if "voice_id" in e else lib.get(sp, {}))
            v = {**base, **{k: x for k, x in e.items() if k != "voice"}}
            if base.get("voice_settings") and "voice_settings" in e:   # override single settings (e.g. just speed)
                v["voice_settings"] = {**base["voice_settings"], **e["voice_settings"]}
        elif sp == "narrator" and "voice_id" in top:
            v = dict(top)
        elif sp in lib:
            v = dict(lib[sp])
        else:
            raise SystemExit(f"speaker '{sp}' has no voice: add it to narration.json \"voices\" or library/voices.json")
        for k in ("model_id", "voice_settings"):          # fill gaps from the top level / sensible defaults
            if k not in v and k in top: v[k] = top[k]
        v.setdefault("model_id", "eleven_multilingual_v2"); v.setdefault("voice_settings", {})
        if not v.get("voice_id"): raise SystemExit(f"speaker '{sp}': no voice_id")
        out[sp] = {k: v[k] for k in ("voice_id", "model_id", "voice_settings")}
    return out


def split_markers(text):
    """'a {x}b' -> ('a b', [('x', char_index_in_clean_text)])"""
    out, marks, i = "", [], 0
    for m in re.finditer(r"\{(\w+)\}", text):
        out += text[i:m.start()]
        marks.append((m.group(1), len(out)))
        i = m.end()
    out += text[i:]
    lead = len(out) - len(out.lstrip())          # keep indices valid: only trim the ends
    return out.strip(), [(n, max(0, c - lead)) for n, c in marks]


def line_key(voice, clean):
    # cache key ignores previous/next text so editing one line doesn't re-bill its neighbours (same scheme as ever)
    key_body = {"text": clean, "model_id": voice["model_id"], "voice_settings": voice["voice_settings"]}
    return hashlib.sha1(json.dumps([key_body, voice["voice_id"]], sort_keys=True).encode()).hexdigest()[:16]


def cached(h):
    """-> (mp3, json) paths if this line exists in the cache (library first, then the old project-local cache)."""
    for d in [CACHE, LOCAL_CACHE]:
        mp3, js = d / f"{h}.mp3", d / f"{h}.json"
        if mp3.exists() and js.exists():
            if d != CACHE:                                   # promote an old local line into the shared cache
                CACHE.mkdir(parents=True, exist_ok=True)
                shutil.copy2(mp3, CACHE / mp3.name); shutil.copy2(js, CACHE / js.name)
                return CACHE / mp3.name, CACHE / js.name, "local"
            return mp3, js, "hit"
    return None


def tts_line(job):
    voice, clean, prev_text, next_text, h = job["voice"], job["clean"], job["prev"], job["next"], job["hash"]
    hit = cached(h)
    if hit:
        return hit[0], json.loads(hit[1].read_text(encoding="utf-8")), hit[2]
    body = {"text": clean, "model_id": voice["model_id"], "voice_settings": voice["voice_settings"]}
    if prev_text: body["previous_text"] = prev_text
    if next_text: body["next_text"] = next_text
    r = el.post(f"/v1/text-to-speech/{voice['voice_id']}/with-timestamps?output_format=mp3_44100_128",
                json=body, headers={"Content-Type": "application/json"})
    d = r.json()
    CACHE.mkdir(parents=True, exist_ok=True)
    mp3, js = CACHE / f"{h}.mp3", CACHE / f"{h}.json"
    mp3.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d.get("alignment") or d.get("normalized_alignment")
    js.write_text(json.dumps(al), encoding="utf-8")
    print(f"  generated [{job['speaker']}]: {clean[:60]}")
    return mp3, al, "new"


def is_tag(w):
    """SSML-ish pause tags like <break time="0.6s" /> are sent to the TTS but are not words."""
    return w.startswith("<") or w.startswith("time=") or w == "/>" or w.endswith("/>")


def words_from_alignment(al, clean):
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur = [], None
    for idx, (c, a, b) in enumerate(zip(chars, st, en)):
        if c.isspace():
            if cur: words.append(cur); cur = None
            continue
        if cur is None: cur = {"w": "", "start": a, "end": b, "ci": idx}
        cur["w"] += c; cur["end"] = b
    if cur: words.append(cur)
    return [w for w in words if not is_tag(w["w"])]


def record_phrases(jobs):
    """library/voice/phrases.json: every line this project uses, with the project in used_in (sorted by text)."""
    if not PHRASES: return
    ph = el.load_json(PHRASES) if PHRASES.exists() else {}
    for j in jobs:
        e = ph.setdefault(j["hash"], {"text": j["clean"], "voice_id": j["voice"]["voice_id"], "used_in": []})
        el.add_used_in(e)
    el.save_json(PHRASES, dict(sorted(ph.items(), key=lambda kv: kv[1]["text"])))


def placeholder(cfg):
    """Timing without a voice: each word gets a duration from its length (about 155 words a minute), pauses at commas
    and full stops; the narration is silence. Writes the same words.json the real run writes."""
    lines = cfg["lines"]
    t = cfg.get("lead_in", 1.0)
    out_lines, cues = [], {}
    for i, l in enumerate(lines):
        clean, marks = split_markers(l["text"])
        if "at" in l: t = max(t, l["at"])
        words, pos, x = [], 0, t
        for tok in clean.split():
            ci = clean.index(tok, pos); pos = ci + len(tok)
            d = 0.16 + 0.055 * len(tok.strip(",.;:!?\"'"))
            words.append({"w": tok, "start": round(x, 3), "end": round(x + d, 3), "ci": ci})
            x += d + (0.22 if tok[-1] in ",;:" else 0.32 if tok[-1] in ".!?" else 0.05)
        for name, ci in marks:
            nxt = next((w for w in words if w["ci"] >= ci), words[-1])
            cues[name] = nxt["start"]
        for w in words: w.pop("ci")
        out_lines.append({"i": i, "section": l.get("section", "main"), "speaker": l.get("speaker", "narrator"), "text": clean,
                          "start": words[0]["start"], "end": words[-1]["end"], "words": words, "placeholder": True})
        t = words[-1]["end"] + l.get("gap", cfg.get("default_gap", .45))
    total = t + cfg.get("tail", 2.0)
    (ROOT / "assets/audio").mkdir(parents=True, exist_ok=True)
    sf.write(ROOT / "assets/audio/narration.wav", np.zeros(int(total * SR) + 1, dtype=np.float32), SR)
    el.save_json(ROOT / "assets/data/words.json", {"lines": out_lines, "cues": cues, "duration": round(total, 3), "placeholder": True})
    print(f"PLACEHOLDER narration {total:.2f}s (silent), {len(out_lines)} lines, {len(cues)} cues -> assets/data/words.json")


def main():
    if "--voices" in sys.argv:
        voices(); return
    cfg = el.load_json(CFG)
    if "--placeholder" in sys.argv:
        placeholder(cfg); return
    lines = cfg["lines"]
    spk = [l.get("speaker", "narrator") for l in lines]
    V = resolve_speakers(cfg, sorted(set(spk)))
    cleaned = [split_markers(l["text"]) for l in lines]

    def neighbour(i, step):                                    # nearest line of the SAME speaker (context for prosody)
        k = i + step
        while 0 <= k < len(lines):
            if spk[k] == spk[i]: return cleaned[k][0]
            k += step
        return None
    jobs = [{"i": i, "speaker": spk[i], "voice": V[spk[i]], "clean": cleaned[i][0], "prev": neighbour(i, -1),
             "next": neighbour(i, 1), "hash": line_key(V[spk[i]], cleaned[i][0])} for i in range(len(lines))]
    todo = [j for j in jobs if not cached(j["hash"])]
    print(f"{len(lines)} lines, {len(V)} voice(s) ({', '.join(V)}), cache: {CACHE}  ->  {len(jobs) - len(todo)} cached, {len(todo)} to generate")
    if "--dry" in sys.argv:
        for j in todo: print(f"  would generate [{j['speaker']}] ({len(j['clean'])} chars): {j['clean']}")
        return
    if todo:
        print(f"credits before: {el.credits()}")
    results = el.pmap(tts_line, jobs)
    t = cfg.get("lead_in", 1.0)
    out_lines, cues, pieces = [], {}, []
    for i, (l, (clean, marks), (mp3, al, _)) in enumerate(zip(lines, cleaned, results)):
        y, _ = librosa.load(mp3, sr=SR, mono=True)
        fade = min(len(y), int(0.025 * SR))           # ElevenLabs clips can end on a click or a clipped breath
        y[len(y) - fade:] *= np.linspace(1, 0, fade)
        if "at" in l: t = max(t, l["at"])          # optional absolute start
        ws = words_from_alignment(al, clean)
        words = [{"w": w["w"], "start": round(t + w["start"], 3), "end": round(t + w["end"], 3)} for w in ws]
        for name, ci in marks:
            nxt = next((w for w, raw in zip(words, ws) if raw["ci"] >= ci), words[-1])
            cues[name] = nxt["start"]
        out_lines.append({"i": i, "section": l.get("section", "main"), "speaker": spk[i], "text": clean,
                          "start": words[0]["start"], "end": words[-1]["end"], "words": words})
        pieces.append((t, y))
        t += len(y) / SR + l.get("gap", cfg.get("default_gap", .45))
    total = t + cfg.get("tail", 2.0)
    buf = np.zeros(int(total * SR) + 1, dtype=np.float32)
    for st, y in pieces:
        a = int(st * SR); buf[a:a + len(y)] += y
    (ROOT / "assets/audio").mkdir(parents=True, exist_ok=True)
    sf.write(ROOT / "assets/audio/narration.wav", buf, SR)
    el.save_json(ROOT / "assets/data/words.json", {"lines": out_lines, "cues": cues, "duration": round(total, 3)})
    record_phrases(jobs)
    print(f"narration {total:.2f}s, {len(out_lines)} lines, {len(cues)} cues -> assets/audio/narration.wav, assets/data/words.json")
    if todo:
        print(f"credits after: {el.credits()}")
    for l in out_lines:
        print(f"  {l['start']:6.2f}-{l['end']:6.2f} [{l['section']}{'' if l['speaker'] == 'narrator' else ' ' + l['speaker']}] {l['text']}")


if __name__ == "__main__":
    main()
