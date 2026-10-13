"""gen_music.py: songs / music beds with Eleven Music (music_v2_5 composition plans).

Input: assets/data/music.json
{
  "bpm": 126,
  "styles": ["upbeat hype pop-rap for kids", "126 BPM", "punchy drums", ...],     # 6-7 is ideal, English only
  "negative": ["explicit lyrics", "sad", ...],
  "variants": {"A": [], "B": ["EDM festival drop"], ...},                          # extra styles per variant
  "chunks": [                                                                    # durations in BARS keep it on the grid
    {"bars": 4, "text": "[Intro]\n{instrumental build-up, no vocals}", "styles": ["building intro", "no vocals"]},
    {"bars": 8, "text": "[Verse]\nline 1\nline 2 ...", "styles": ["lighter verse groove"]},
    ...
  ],
  "instrumental": false
}
- Put lyrics in chunk text (\n between lines), inline directions in {curly braces}. No artist names (copyright error).
- Costs roughly 420 credits per minute on pay-as-you-go keys (check el.credits()).
- Timestamps in the response follow the PLAN, not the real vocals: align the pick afterwards (analyze_song.py --lyrics).

Usage: python tools/gen_music.py A B C D     -> assets/audio/variants/music_<id>.mp3 (+ .json)
       python tools/gen_music.py --keep B [--as garden_bed]
                                            the human picked variant B: copy it to assets/audio/bed.mp3 and add it to the
                                            library (library/music/<name>.mp3 + music.json {bpm, styles, from, used_in})
       python tools/gen_music.py --from-lib garden_bed
                                            REUSE a library bed instead of generating (no credits): copies it to
                                            assets/audio/bed.mp3, writes its bpm into project.json, adds used_in
       python tools/gen_music.py --list     the library beds (name, bpm, styles)

Library rule: explainer beds are interchangeable within a mood. Look first (gen_music.py --list),
reuse a bed that fits (--from-lib), only generate when none fits; after the pick, --keep adds it to the library.
"""
import sys, json, email, shutil
import el

ROOT = el.ROOT
OUT = ROOT / "assets/audio/variants"


def plan(cfg, variant):
    bar_ms = round(4 * 60000 / cfg["bpm"])
    base = cfg["styles"] + cfg.get("variants", {}).get(variant, [])
    return {"chunks": [{
        "text": c["text"], "duration_ms": max(3000, min(120000, c["bars"] * bar_ms)),
        "context_adherence": c.get("adherence", "high"),
        "positive_styles": base + c.get("styles", []),
        "negative_styles": cfg.get("negative", []) + c.get("negative", []),
    } for c in cfg["chunks"]]}


def generate(cfg, variant):
    # force_instrumental is only accepted with a plain prompt, not with a composition plan: for instrumentals
    # put "no vocals" in styles and "vocals", "singing" in negative styles (done automatically below)
    p = plan(cfg, variant)
    if cfg.get("instrumental"):
        for c in p["chunks"]:
            c["positive_styles"] = list(dict.fromkeys(c["positive_styles"] + ["instrumental", "no vocals"]))
            c["negative_styles"] = list(dict.fromkeys(c["negative_styles"] + ["vocals", "singing", "voice"]))
    body = {"composition_plan": p, "model_id": "music_v2_5", "with_timestamps": True}
    r = el.post("/v1/music/detailed?output_format=mp3_44100_192", json=body, headers={"Content-Type": "application/json"})
    msg = email.message_from_bytes(b"Content-Type: " + r.headers.get("Content-Type", "").encode() + b"\r\n\r\n" + r.content)
    meta, audio = {}, None
    for part in msg.walk():
        if part.is_multipart():
            continue
        payload = part.get_payload(decode=True)
        if "json" in part.get_content_type(): meta = json.loads(payload)
        elif part.get_content_type().startswith("audio") or "octet" in part.get_content_type(): audio = payload
    if audio is None:
        (OUT / f"music_{variant}.raw").write_bytes(r.content)
        return f"{variant}: no audio part (raw saved)"
    (OUT / f"music_{variant}.mp3").write_bytes(audio)
    el.save_json(OUT / f"music_{variant}.json", {"plan": body["composition_plan"], "meta": meta})
    return f"{variant}: ok"


LIBM = el.LIB / "music" if el.LIB else None


def arg(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv and sys.argv.index(flag) + 1 < len(sys.argv) else None


def lib_music():
    p = LIBM / "music.json" if LIBM else None
    return el.load_json(p) if p and p.exists() else {}


def set_project_bpm(bpm):
    pj = ROOT / "assets/data/project.json"
    d = el.load_json(pj) if pj.exists() else {}
    d["bpm"] = bpm; d.setdefault("offset", 0)
    el.save_json(pj, d)


def library_cmd():
    if not LIBM: raise SystemExit("no library found (EXPLAINER_LIBRARY / project.json 'library' / a library/ folder above the project)")
    idx = lib_music()
    if "--list" in sys.argv:
        for n, e in idx.items(): print(f"{n:24s} {e.get('bpm', '?'):>5} bpm  from {e.get('from', '?'):18s} {', '.join(e.get('styles', []))}")
        return
    if "--from-lib" in sys.argv:
        n = arg("--from-lib")
        if n not in idx or not (LIBM / f"{n}.mp3").exists(): raise SystemExit(f"library/music/{n}.mp3 not found (--list)")
        shutil.copy2(LIBM / f"{n}.mp3", ROOT / "assets/audio/bed.mp3")
        if idx[n].get("bpm"): set_project_bpm(idx[n]["bpm"])
        el.add_used_in(idx[n]); el.save_json(LIBM / "music.json", idx)
        print(f"bed = library {n}.mp3 ({idx[n].get('bpm')} bpm) -> assets/audio/bed.mp3; bpm written to project.json")
        return
    v = arg("--keep")
    src = OUT / f"music_{v}.mp3"
    if not src.exists(): raise SystemExit(f"{src} not found")
    cfg = el.load_json(ROOT / "assets/data/music.json")
    name = arg("--as") or f"{el.PROJECT.split('-', 1)[-1]}_bed"
    if name in idx or (LIBM / f"{name}.mp3").exists(): raise SystemExit(f"library already has '{name}': pick another --as name")
    shutil.copy2(src, ROOT / "assets/audio/bed.mp3")
    shutil.copy2(src, LIBM / f"{name}.mp3")
    idx[name] = {"bpm": cfg.get("bpm"), "styles": cfg.get("styles", []) + cfg.get("variants", {}).get(v, []), "from": el.PROJECT, "used_in": [el.PROJECT]}
    el.save_json(LIBM / "music.json", idx)
    if cfg.get("bpm"): set_project_bpm(cfg["bpm"])
    print(f"kept variant {v} -> assets/audio/bed.mp3 and library/music/{name}.mp3")


if __name__ == "__main__":
    if any(f in sys.argv for f in ("--keep", "--from-lib", "--list")):
        library_cmd(); sys.exit()
    cfg = el.load_json(ROOT / "assets/data/music.json")
    OUT.mkdir(parents=True, exist_ok=True)
    print("credits before:", el.credits())
    for res in el.pmap(lambda v: generate(cfg, v), sys.argv[1:] or ["A"]):
        print(res)
    print("credits after:", el.credits())
