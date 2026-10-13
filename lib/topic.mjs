// Load a topic folder: topic.config.json with defaults, and the paths every kit script uses.
//   const T = loadTopic(process.argv[2]);   T.dir, T.cfg, T.read('src/model.mjs'), T.path('video/out')
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The anatomy skill (https://github.com/wheresryan22/anatomy): $ANATOMY_SKILL, else ~/.claude/skills/anatomy.
export const ANATOMY = process.env.ANATOMY_SKILL || path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'skills', 'anatomy');
// Your own asset library (voices.json, voice/, sfx/, music/; see README "Your own audio library"): $EXPLAINER_LIBRARY,
// else <kit>/library when it exists, else none (every audio tool then works project-local).
export const LIBRARY = process.env.EXPLAINER_LIBRARY || (fs.existsSync(path.join(KIT, 'library')) ? path.join(KIT, 'library') : null);

const DEFAULTS = {
  archetype: 'machine',
  eyebrow: 'Physics',
  lede: '',
  description: '',
  footer: '',
  colors: { accent: '#c2410c', accentDark: '#ff7a3c', icon: '#ffb35c' },
  model: { file: 'src/model.mjs', check: 'node src/model.mjs' },
  bundle: ['src/model.mjs', 'src/widgets.mjs', 'src/content.mjs', 'src/app.mjs'],
  instruments: '.xw svg',
  film: { workers: 3, fps: 30, poster: 4, units: [] },
  page: { stepsLabel: null, challengesLabel: '3 challenges' },
};

/** Command-line flag: --k value | --k (true) | default. */
export const arg = (k, d, argv = process.argv) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};

/** The first argument that is not a flag (or a flag's value): the topic folder. */
export function topicArg(argv = process.argv) {
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') && !BOOL.has(rest[i])) i++; continue; }
    return rest[i];
  }
  return null;
}
// flags that never take a value (so the topic path after them is not swallowed)
const BOOL = new Set(['--deploy', '--stub', '--quick', '--dark', '--placeholder', '--dry', '--audio-only', '--skip-film', '--no-render', '--force', '--json', '--build']);

export function loadTopic(dirArg) {
  if (!dirArg) throw new Error('usage: node <kit>/<script>.mjs <topic-folder> [flags]');
  const dir = path.resolve(dirArg);
  const file = path.join(dir, 'topic.config.json');
  if (!fs.existsSync(file)) throw new Error(`no topic.config.json in ${dir}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = {
    ...DEFAULTS, ...raw,
    colors: { ...DEFAULTS.colors, ...(raw.colors || {}) },
    model: { ...DEFAULTS.model, ...(raw.model || {}) },
    film: { ...DEFAULTS.film, ...(raw.film || {}) },
    page: { ...DEFAULTS.page, ...(raw.page || {}) },
  };
  for (const k of ['slug', 'title', 'figure']) if (!cfg[k]) throw new Error(`topic.config.json: "${k}" is required`);
  cfg.worker ??= `${cfg.slug}-lab`;
  cfg.film.name ??= cfg.slug;
  cfg.figure = { id: `${cfg.figure.api}-figure`, name: cfg.slug, audit: 'node figure/build.mjs --audit', ...cfg.figure };
  const T = {
    dir, cfg, kit: KIT,
    path: (...p) => path.join(dir, ...p),
    exists: (p) => fs.existsSync(path.join(dir, p)),
    read: (p) => fs.readFileSync(path.join(dir, p), 'utf8'),
    kitPath: (...p) => path.join(KIT, ...p),
    kitRead: (p) => fs.readFileSync(path.join(KIT, p), 'utf8'),
  };
  T.fragment = (theme = 'light') => path.join(dir, `figure/${cfg.figure.name}${theme === 'light' ? '-light' : ''}.fragment.html`);
  T.page = (theme = 'light') => path.join(dir, `figure/${cfg.figure.name}${theme === 'light' ? '-light' : ''}.html`);
  T.videoOut = path.join(dir, 'video', 'out');
  T.film720 = path.join(T.videoOut, `${cfg.film.name}.mp4`);
  T.film1080 = path.join(T.videoOut, `${cfg.film.name}-1080p.mp4`);
  T.words = () => JSON.parse(T.read('video/assets/data/words.json'));
  return T;
}
