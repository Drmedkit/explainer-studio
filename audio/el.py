"""el.py: tiny shared ElevenLabs helper used by all audio tools (explainer-studio kit copy; root = the topic's video folder).

- key from .env (ELEVENLABS_API_KEY), never printed
- credits() -> remaining credits (check before big generations: keys may have a hard spending cap)
- post() with retry on 429 (many plans allow only 2 concurrent requests) and clear errors
- pmap(fn, items): run at most 2 requests in parallel
"""
import os, time, json, pathlib, concurrent.futures as cf
import requests
from dotenv import load_dotenv

# The topic's video folder: $EXPLAINER_VIDEO_ROOT (set by the kit's node wrappers), else the current directory.
# (In the hand-built topics this was the folder above tools/; the kit's audio tools are shared, so the root is passed in.)
ROOT = pathlib.Path(os.environ.get("EXPLAINER_VIDEO_ROOT") or os.getcwd()).resolve()
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")                     # a topic-level .env works too
load_dotenv(pathlib.Path(__file__).resolve().parent.parent / ".env")   # and one in the kit (never committed)
API = "https://api.elevenlabs.io"


def key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k:
        raise SystemExit("ELEVENLABS_API_KEY missing: put it in .env (and keep .env in .gitignore)")
    return k


def credits():
    d = requests.get(f"{API}/v1/user/subscription", headers={"xi-api-key": key()}, timeout=30).json()
    return d["character_limit"] - d["character_count"]


def post(path, retries=6, **kw):
    kw.setdefault("timeout", 600)
    headers = {"xi-api-key": key(), **kw.pop("headers", {})}
    for i in range(retries):
        r = requests.post(f"{API}{path}", headers=headers, **kw)
        if r.status_code == 429:           # concurrency / rate limit: back off and retry
            time.sleep(4 * (i + 1))
            continue
        if r.status_code != 200:
            raise RuntimeError(f"{path}: HTTP {r.status_code} {r.text[:400]}")
        return r
    raise RuntimeError(f"{path}: still rate-limited after {retries} tries")


def pmap(fn, items, workers=2):
    with cf.ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, items))


def ffmpeg():
    import shutil, glob
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    hits = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin\ffmpeg.exe"))
    if hits:
        return hits[0]
    raise SystemExit("ffmpeg not found (winget install Gyan.FFmpeg)")


def load_json(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))


def save_json(p, d):
    pathlib.Path(p).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(p).write_text(json.dumps(d, indent=1, ensure_ascii=False), encoding="utf-8")


# ---------- the shared asset library (voice / sfx / music / painters) ----------
# Found by: $EXPLAINER_LIBRARY, else "library" in assets/data/project.json (a path, relative to the project), else the first
# folder named "library" (with voice/, sfx/, music/ or painters/ inside) walking up from the project. None = no library:
# every tool then works exactly as before, project-local.
PROJECT = ROOT.parent.name if ROOT.name == "video" else ROOT.name   # the topic slug, for used_in


def find_library():
    cand = os.environ.get("EXPLAINER_LIBRARY")
    if not cand:
        pj = ROOT / "assets/data/project.json"
        if pj.exists():
            try:
                lib = json.loads(pj.read_text(encoding="utf-8")).get("library")
                if lib: cand = str((ROOT / lib).resolve())
            except ValueError:
                pass
    if cand:
        p = pathlib.Path(cand)
        return p if p.is_dir() else None
    for d in [ROOT, *ROOT.parents, pathlib.Path(__file__).resolve().parent.parent]:   # ... and <kit>/library
        lib = d / "library"
        if lib.is_dir() and any((lib / s).is_dir() for s in ("voice", "sfx", "music", "painters")):
            return lib
    return None


LIB = find_library()


def add_used_in(entry, project=PROJECT):
    """entry['used_in'] gets the project name once."""
    u = entry.setdefault("used_in", [])
    if project not in u: u.append(project)
    return entry


def md5_8(path):
    import hashlib
    return hashlib.md5(pathlib.Path(path).read_bytes()).hexdigest()[:8]
