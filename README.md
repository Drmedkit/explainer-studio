# Explainer Studio

A Claude Code skill, a toolkit and a multi-agent workflow for building **directed science explainers**: one topic at a
time, each with

- a **real quantitative model** with self-checks that close (energy balance, a known limit),
- a crafted **isometric figure** of a real object whose moving parts *are* the concept (built with the
  [anatomy](https://github.com/wheresryan22/anatomy) skill),
- an **explainer** of 6-8 steps that each open on a prediction whose wrong answers are real misconceptions,
- an **open lab** with the model's real knobs, slow motion, live instruments and three challenges,
- a **directed 16:9 film** (narration, camera moves, close-ups, slow motion, events posed on the spoken word),
- **quality gates** that catch what reviews kept rejecting (text collisions, white-on-white shots, on-screen numbers
  that disagree with the narration, page overflow at phone width),
- and one command to ship it all as a static page (Cloudflare Workers) or a claude.ai Artifact.

The kit grew out of seven hand-built explainers (a four-stroke engine, the photoelectric effect, a generator, a heat
pump, a crumple zone, a pendulum clock, a camera lens). Every gate and film rule in it is a lesson from reviewing those.

**What is not in this repo:** audio. There is no voice library, no music and no sound effects here; you generate your
own with ElevenLabs through the kit's tools (see [Your own audio](#your-own-audio)). Nor are there finished topics: you
build them.

## Requirements

| | |
|---|---|
| [Claude Code](https://code.claude.com) | the skill and the workflow run in it |
| Node 20+ | the kit (puppeteer downloads its own Chrome on `npm install`) |
| Python 3.10+ | audio tools: `pip install requests python-dotenv numpy soundfile librosa` |
| ffmpeg | on your PATH (Windows: `winget install Gyan.FFmpeg`, macOS: `brew install ffmpeg`) |
| the anatomy skill | `git clone https://github.com/wheresryan22/anatomy ~/.claude/skills/anatomy` (or set `ANATOMY_SKILL`) |
| an ElevenLabs API key | for narration, sound effects and music; without it you can still build everything on placeholder timing |
| Cloudflare account (optional) | `npx wrangler login` once, for `ship.mjs --deploy` |

## Install

```bash
git clone https://github.com/Drmedkit/explainer-studio
cd explainer-studio
npm install
echo "ELEVENLABS_API_KEY=your-key" > .env      # gitignored; serves every topic
```

Make the skill visible to Claude Code by linking `skill/` into your skills folder:

```bash
# macOS / Linux
ln -s "$PWD/skill" ~/.claude/skills/explainer-studio
# Windows (cmd)
mklink /J "%USERPROFILE%\.claude\skills\explainer-studio" "%CD%\skill"
```

The workflow lives in `.claude/workflows/explainer-round.js`. It is available when you start Claude Code inside this
repo; to have it everywhere, copy (or link) it to `~/.claude/workflows/`.

## Quick start

Ask Claude Code for a topic ("build an explainer for Boyle's law") and the skill takes over. Or run the kit by hand:

```bash
node new-topic.mjs gas-piston --archetype machine --title "Boyle's Law" --port 5281   # a running skeleton
node audio.mjs ../gas-piston narrate --dry          # what the narration would cost
node audio.mjs ../gas-piston narrate                # the real voice (or --placeholder for timing only)
node render.mjs ../gas-piston --sheet 3,12,25       # stills to look at
node render.mjs ../gas-piston --workers 3           # 1080p master + 720p web copy + poster
node gate.mjs ../gas-piston                         # every quality gate, pass/fail table
node ship.mjs ../gas-piston [--deploy]              # page + static site (+ wrangler deploy)
```

The scaffold runs from minute one: a stub model with self-checks, a stub figure honouring the full figure API, a
19-second film on placeholder narration, and gates that pass. You then replace the stubs, in the order the skill
gives: concept card -> model -> figure -> explainer -> lab -> shot list -> narration -> stills -> render -> gates -> ship.

Six archetypes give the scaffold its starting object: `machine` (the device is the concept), `bench` (a classic
experiment), `micro` (a container with a magnifier window on the particles), `field` (a tray that makes a field
visible), `chart` (a pen recorder drawing the graph) and `investigation` (a workbench with a logbook).

## The round workflow

`explainer-round` builds several topics at once, the way the kit is used in practice: rounds of five from approved
concept cards. Per topic, pipelined (one topic never waits for another):

1. **Build**: an agent works the skill end to end in its own folder on its own port and does not touch the kit; any kit
   gap goes into the topic's `KIT-NOTES.md`.
2. **Review**: a fresh agent plays the demanding reviewer: it looks at the stills, the contrast frames, the gate table,
   the model's self-checks and the film against the direction rules.
3. **Fix**: at most one fix round, only when the review asks for one (partial re-renders with `--ranges`).
4. **Ship** (only with `deploy: true` and green gates): `ship.mjs --deploy` and an optional claude.ai Artifact.

When every topic is done, one agent folds all `KIT-NOTES.md` into the kit and commits (no push).

Run it from Claude Code by asking for it ("run the explainer-round workflow with these args") with:

```json
{
  "kit": "/abs/path/explainer-studio",
  "workspace": "/abs/path/topics",
  "topics": [
    { "folder": "gas-piston", "card": "/abs/path/cards/physics.thermal.gas-laws.json", "archetype": "machine", "port": 5281 },
    { "folder": "air-track",  "card": "/abs/path/cards/physics.forces.newton-2.json",  "archetype": "bench",   "port": 5282 }
  ],
  "deploy": false,
  "foldKitNotes": true,
  "workers": 3,
  "rules": "optional extra house rules for every agent (preferred models, a voice, ...)"
}
```

A concept card is a small JSON file written (and approved) before anything is built; the format is in
`skill/references/concept-card.md`. A round of five spends a lot of tokens and real ElevenLabs credits: check the
`narrate --dry` costs on one topic first.

## Your own audio

The audio tools work in two modes.

**Without a library** (the default): every topic keeps its own voice cache (`video/assets/audio/narration_cache/`),
sound effects and bed. The scaffold sets the narrator to ElevenLabs' premade voice "Chris" (works on every account);
pick another one with `EXPLAINER_VOICE_ID=<id>` before scaffolding, or change `voices.narrator` in the topic's
`video/assets/data/narration.json`. `node audio.mjs <topic> narrate --voices` lists the voices on your account.

- **Narration**: write `narration.json` (lines with `{cue}` markers), `narrate --dry`, then `narrate`. Lines are cached
  by text + voice + settings, so editing one line only re-pays for that line.
- **Sound effects**: `sfx.json` maps a name to a prompt and a length, e.g. `"click": ["small brass latch click, dry", 0.4]`,
  then `node audio.mjs <topic> sfx`.
- **Music bed**: describe it in `music.json` (bpm, styles, chunks), generate variants with `music A B`, listen, then
  `music --keep B --as calm_lab_bed`. Music costs roughly 420 credits a minute; generate a few beds and reuse them.

**With a library** (once you have made a few topics): put shared assets in `<kit>/library/` (gitignored) or anywhere
with `EXPLAINER_LIBRARY=/path`. Then every narration line any topic already spoke is free, `"lib:<name>"` sound effects
and `music --from-lib <bed>` reuse what you made before, and new sounds and kept beds are added to it automatically.

```
library/
  voices.json          { "narrator": { "voice_id": "...", "model_id": "eleven_multilingual_v2",
                                       "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.15, "speed": 0.95 } } }
  voice/               the shared narration cache (+ phrases.json), filled by narrate
  sfx/                 <name>.mp3 + sfx.json, filled by gen_sfx
  music/               <name>.mp3 + music.json, filled by music --keep
```

## Deploy

`node ship.mjs <topic>` builds `out/page/index.html` (one self-contained page: Watch / Explain / Open lab) and a static
site in `out/site` with a `wrangler.jsonc` written from `topic.config.json`. `--deploy` runs `npx wrangler deploy`;
set `WORKERS_SUBDOMAIN` to have the live URL printed.

## Layout

| part | files |
|---|---|
| skill | `skill/SKILL.md` + `skill/references/` (figure API, film direction, quality gates, archetypes, concept card, curriculum, agent rules, kit) |
| workflow | `.claude/workflows/explainer-round.js` |
| topic config + paths | `lib/topic.mjs` (`topic.config.json`: title, slug, worker, port, figure API, colours, film, page) |
| film | `render.mjs`, `lib/scene.mjs`, `film/scene.template.html`, `film/scene-runtime.js`, `film/timeline-kit.mjs` |
| page + site + deploy | `ship.mjs`, `lib/page.mjs`, `page/page.template.html`, `page/page-runtime.js` |
| figure runtime + build helpers | `figure/stage.js` (view, focus fog, frame, manual clock), `figure/build-helpers.mjs` |
| audio | `audio.mjs`, `audio/{el,narrate,gen_sfx,gen_music,mix}.py` |
| quality gates | `gate.mjs`, `checks/{textcheck.js,pagecheck.mjs,readouts.mjs,numbers.mjs,contrast.mjs}` |
| scaffolder + templates | `new-topic.mjs`, `templates/common`, `templates/{machine,bench,micro,field,chart,investigation}` |
| shared | `lib/{bundle,chrome,ffmpeg}.mjs` (always-muted headless Chrome, encode settings) |

Every flag and interface: `skill/references/kit.md`. Every gate and how to fix it: `skill/references/quality-gates.md`.

## Environment variables

| variable | default | |
|---|---|---|
| `ELEVENLABS_API_KEY` | from `.env` (topic `video/`, topic, then kit) | never committed, never printed |
| `ANATOMY_SKILL` | `~/.claude/skills/anatomy` | where the anatomy skill lives |
| `EXPLAINER_LIBRARY` | `<kit>/library` if it exists | your shared audio library |
| `EXPLAINER_VOICE_ID` | ElevenLabs premade "Chris" | narrator for new scaffolds when there is no library |
| `WORKERS_SUBDOMAIN` | none | only to print the live URL after `--deploy` |

## License

MIT. The figures are drawn with [anatomy](https://github.com/wheresryan22/anatomy) by Ryan (MIT), which is a separate
install and not modified or redistributed here.
