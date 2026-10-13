// Audio tools for a topic, run with the topic's video folder as root (narration with a voice cache, sound
// effects and music beds from your library first when you have one, ElevenLabs only for what is new).
//   node audio.mjs <topic> narrate [--dry | --placeholder]     assets/data/narration.json -> narration.wav + words.json
//   node audio.mjs <topic> sfx [--dry] [name ...]               assets/data/sfx.json -> assets/audio/sfx/*.mp3
//   node audio.mjs <topic> music --from-lib <bed> | --list | A B | --keep B --as <name>
//   node audio.mjs <topic> mix                                  out/events.json -> out/mix.wav (render.mjs does this)
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadTopic, KIT } from './lib/topic.mjs';

const [, , dir, tool, ...rest] = process.argv;
const T = loadTopic(dir);
const script = { narrate: 'narrate.py', sfx: 'gen_sfx.py', music: 'gen_music.py', mix: 'mix.py' }[tool];
if (!script) { console.error('usage: node audio.mjs <topic> narrate|sfx|music|mix [args]'); process.exit(1); }
const root = path.join(T.dir, 'video');
const r = spawnSync('python', [path.join(KIT, 'audio', script), ...rest], { stdio: 'inherit', cwd: root, env: { ...process.env, EXPLAINER_VIDEO_ROOT: root, PYTHONIOENCODING: 'utf-8' } });
process.exit(r.status ?? 1);
