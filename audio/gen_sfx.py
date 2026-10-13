"""gen_sfx.py: sound effects -> assets/audio/sfx/<name>.mp3, reusing the shared library first.

Input: assets/data/sfx.json, one entry per sound name used in mix.json:
  "whoosh": ["fast cartoon whoosh swipe, short, punchy, clean", 0.8]     prompt + seconds (0.5-30; keep it 0.5-5)
  "whoosh": {"prompt": "...", "dur": 0.8}                                 same, object form
  "pop":    "lib"                                                         take library/sfx/pop.mp3 as is
  "pop":    "lib:chime_04"                                                take library/sfx/chime_04.mp3 (saved as pop.mp3)

With a library (el.LIB, found by walking up from the project; see el.py):
  - "lib" entries are copied from library/sfx/ (an error if missing).
  - a prompt entry is REUSED (copied, no credits) when library/sfx/sfx.json has a sound with the same prompt + duration
    (same name preferred). Same name but a different prompt = a deliberately different sound: generated anew (a hint
    shows the library one: use "lib" to take it instead).
  - every newly generated sound is copied into library/sfx/ (as <name>, or <name>_<project tag> when the name is taken)
    and listed in sfx.json {prompt, dur, md5, used_in}. Every reuse adds the project to used_in.
  Search the library first: ls <library>/sfx (or read <library>/sfx/sfx.json)

Usage: python tools/gen_sfx.py            (all missing sounds: library first, then generate)
       python tools/gen_sfx.py pop ding   (force: generate these anew, even if present)
       python tools/gen_sfx.py --dry      (show what would be reused / generated)
"""
import sys, re, shutil
import el

ROOT = el.ROOT
OUT = ROOT / "assets/audio/sfx"
LIBSFX = el.LIB / "sfx" if el.LIB else None
LIBJSON = LIBSFX / "sfx.json" if LIBSFX else None


def norm(entry):
    """-> ('lib', libname) | ('gen', prompt, dur)"""
    if isinstance(entry, str):
        if entry == "lib": return ("lib", None)
        if entry.startswith("lib:"): return ("lib", entry[4:])
        raise SystemExit(f"sfx.json: string entries must be 'lib' or 'lib:<name>' (got '{entry}')")
    if isinstance(entry, dict): return ("gen", entry["prompt"], float(entry.get("dur", 1.0)))
    return ("gen", entry[0], float(entry[1]))


def lib_index():
    return el.load_json(LIBJSON) if LIBJSON and LIBJSON.exists() else {}


def lib_match(idx, name, prompt, dur):
    same = [n for n, e in idx.items() if e.get("prompt", "").strip().lower() == prompt.strip().lower()
            and abs(float(e.get("dur", 0)) - dur) < 1e-6 and (LIBSFX / f"{n}.mp3").exists()]
    return name if name in same else (same[0] if same else None)


def project_tag():
    m = re.match(r"(\d+)", el.PROJECT)
    return m.group(1) if m else re.sub(r"[^a-z0-9]+", "-", el.PROJECT.lower()).strip("-")


def generate(name, prompt, secs):
    r = el.post("/v1/sound-generation?output_format=mp3_44100_128",
                json={"text": prompt, "duration_seconds": min(30, max(0.5, secs)), "prompt_influence": 0.6},  # API range 0.5-30 s
                headers={"Content-Type": "application/json"}, timeout=120)
    (OUT / f"{name}.mp3").write_bytes(r.content)
    return name


def main():
    cfg = el.load_json(ROOT / "assets/data/sfx.json")
    OUT.mkdir(parents=True, exist_ok=True)
    force = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry" in sys.argv
    for n in force:
        if n not in cfg: raise SystemExit(f"'{n}' is not in sfx.json")
    names = force or [n for n in cfg if not (OUT / f"{n}.mp3").exists()]
    idx, changed, gen = lib_index(), False, []
    for n in names:
        kind = norm(cfg[n])
        if kind[0] == "lib":
            src = kind[1] or n
            if not LIBSFX: raise SystemExit(f"{n}: 'lib' entry but no library found (set EXPLAINER_LIBRARY or project.json 'library')")
            if not (LIBSFX / f"{src}.mp3").exists(): raise SystemExit(f"{n}: library/sfx/{src}.mp3 not found (see <library>/sfx/sfx.json)")
            print(f"{n}: library {src}.mp3")
            if not dry:
                shutil.copy2(LIBSFX / f"{src}.mp3", OUT / f"{n}.mp3")
                if src in idx: el.add_used_in(idx[src]); changed = True
            continue
        _, prompt, dur = kind
        hit = None if (n in force or not LIBSFX) else lib_match(idx, n, prompt, dur)
        if hit:
            print(f"{n}: reused library {hit}.mp3 (same prompt)")
            if not dry:
                shutil.copy2(LIBSFX / f"{hit}.mp3", OUT / f"{n}.mp3"); el.add_used_in(idx[hit]); changed = True
            continue
        if LIBSFX and n in idx and n not in force:
            print(f"{n}: library has a different '{n}' (\"{idx[n].get('prompt')}\"): generating yours; use \"{n}\": \"lib\" to take that one")
        gen.append((n, prompt, dur))
    if gen:
        print(("would generate: " if dry else "generating: ") + ", ".join(g[0] for g in gen))
    if gen and not dry:
        for name in el.pmap(lambda g: generate(*g), gen):
            print(f"{name}: generated")
        if LIBSFX:
            for n, prompt, dur in gen:                         # harvest into the library
                lib_name, k = n, 1
                while lib_name in idx or (LIBSFX / f"{lib_name}.mp3").exists():
                    lib_name = f"{n}_{project_tag()}" + (f"_{k}" if k > 1 else ""); k += 1
                shutil.copy2(OUT / f"{n}.mp3", LIBSFX / f"{lib_name}.mp3")
                idx[lib_name] = {"prompt": prompt, "dur": dur, "md5": el.md5_8(OUT / f"{n}.mp3"), "used_in": [el.PROJECT]}
                print(f"  -> library/sfx/{lib_name}.mp3")
                changed = True
    if changed and not dry:
        el.save_json(LIBJSON, idx)


if __name__ == "__main__":
    main()
