// Scaffold a new topic folder that runs from the first minute: page opens, a stub anatomy figure honouring the figure
// API contract, a stub model with self-checks, a short film (placeholder narration timing) that renders.
//   node new-topic.mjs <slug> --archetype machine|bench|micro|field|chart|investigation
//        [--title "The Second Law"] [--dir <parent folder>] [--api secondLaw] [--port 5281] [--subject physics]
//        [--ids physics.thermal.entropy,...] [--no-git] [--no-build] [--force]
// The folder goes next to the kit (<kit>/../<slug>) unless --dir says otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { KIT, LIBRARY, arg } from './lib/topic.mjs';

const ARCHETYPES = ['machine', 'bench', 'micro', 'field', 'chart', 'investigation'];
const ACCENTS = { machine: ['#c2410c', '#ff7a3c'], bench: ['#b45309', '#f2a33a'], micro: ['#1d4ed8', '#7aa2ff'], field: ['#b91c1c', '#ff6b6b'], chart: ['#0f766e', '#4fd1c5'], investigation: ['#7c3aed', '#b69cff'] };
const UNIT_WORDS = { rpm: 'rpm', 'm/s': 'meters per second', 'mN/m': 'millinewtons per meter', mT: 'millitesla', mm: 'millimeters' };

const slug = process.argv[2];
if (!slug || slug.startsWith('--') || !/^[a-z][a-z0-9-]*$/.test(slug)) { console.error('usage: node new-topic.mjs <slug: lowercase-with-dashes> --archetype <' + ARCHETYPES.join('|') + '>'); process.exit(1); }
const arch = String(arg('archetype', 'machine'));
if (!ARCHETYPES.includes(arch)) { console.error(`archetype must be one of ${ARCHETYPES.join(', ')}`); process.exit(1); }
const parent = path.resolve(String(arg('dir', path.dirname(KIT))));
const dir = path.join(parent, slug);
if (fs.existsSync(dir) && !arg('force')) { console.error(`${dir} exists (use --force to overwrite the scaffold files)`); process.exit(1); }
const title = String(arg('title', slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')));
const api = String(arg('api', slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[^a-zA-Z_$]/, '_')));
const port = Number(arg('port', 5280));
const [accent, accentDark] = ACCENTS[arch];

// ---- copy the templates (common, then the archetype's own files) with the tokens filled in
const relKit = (fromDir) => {
  const r = path.relative(fromDir, KIT);
  if (path.isAbsolute(r)) return pathToFileURL(KIT).href;       // another drive: an absolute file URL
  const p = r.split(path.sep).join('/');
  return p.startsWith('.') ? p : './' + p;
};
const TOK = { __SLUG__: slug, __TITLE__: title, __API__: api, __ID__: `${slug}-figure`, __NAME__: slug, __ACCENT__: accent, __ACCENT_DARK__: accentDark, __ARCH__: arch };
function copyTree(src, dst) {
  if (!fs.existsSync(src)) return;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { copyTree(s, d); continue; }
    fs.mkdirSync(dst, { recursive: true });
    let text = fs.readFileSync(s, 'utf8');
    for (const [k, v] of Object.entries(TOK)) text = text.split(k).join(v);
    text = text.split('__KIT__').join(relKit(dst));
    fs.writeFileSync(d, text);
  }
}
copyTree(path.join(KIT, 'templates', 'common'), dir);
copyTree(path.join(KIT, 'templates', arch), dir);

// ---- topic.config.json
const cfg = {
  slug, title, titleHtml: title.replace(/(\S+)$/, '<em>$1</em>'), archetype: arch,
  eyebrow: `${String(arg('subject', 'physics')).replace(/^./, (c) => c.toUpperCase())} · ${arch}`,
  lede: 'SCAFFOLD: one or two sentences: what the reader will see move, and what that motion means.',
  description: `SCAFFOLD: ${title}: a directed film, an explainer and an open lab on one live model.`,
  footer: 'SCAFFOLD: the model in one paragraph: what is computed, the constants and where they come from, what is left out.',
  worker: `${slug}-lab`, port,
  colors: { accent, accentDark, icon: accentDark },
  figure: { api, id: `${slug}-figure`, name: slug, audit: 'node figure/build.mjs --audit' },
  model: { file: 'src/model.mjs', check: 'node src/model.mjs' },
  bundle: ['src/model.mjs', 'src/widgets.mjs', 'src/content.mjs', 'src/app.mjs'],
  instruments: '.xw svg',
  film: { workers: 3, fps: 30, poster: 4, chapters: [['Watch it run', 'run'], ['Slow motion', 'slow'], ['The whole rig', 'back']],
    units: ['millinewtons', 'millitesla'], end: { eyebrow: 'Your turn', html: 'Open the lab and <em>try it yourself</em>.', mid: 'Open lab: the same model, every dial.' } },
  page: { challengesLabel: '3 challenges' },
  curriculum: { subject: String(arg('subject', 'physics')), ids: arg('ids') ? String(arg('ids')).split(',') : [] },
  kit: relKit(dir),
};
fs.writeFileSync(path.join(dir, 'topic.config.json'), JSON.stringify(cfg, null, 2) + '\n');

// ---- narration (one short film, posed on the model's own headline number), sounds, music, mix
const model = await import(pathToFileURL(path.join(dir, 'src', 'model.mjs')).href + '?v=' + Date.now());
const H = model.simulate(model.DEFAULTS).summary.headline;
const said = `${H.y.toFixed(model.QUANTITY.digits)} ${UNIT_WORDS[model.QUANTITY.unit] || model.QUANTITY.unit}`;
const data = path.join(dir, 'video', 'assets', 'data');
fs.mkdirSync(data, { recursive: true });
const lib = LIBRARY && fs.existsSync(LIBRARY) ? LIBRARY : null;
const libHas = (p) => lib && fs.existsSync(path.join(lib, p));
const libVoices = libHas('voices.json') ? JSON.parse(fs.readFileSync(path.join(lib, 'voices.json'), 'utf8')) : {};
// The narrator: your library's "narrator" voice when you have one, else $EXPLAINER_VOICE_ID, else ElevenLabs' premade
// voice "Chris" (works on any account). Change it in narration.json ("voices") or add "narrator" to <library>/voices.json.
const NARRATOR = libVoices.narrator ? 'narrator' : { voice_id: process.env.EXPLAINER_VOICE_ID || 'iP95p4xoKVk53GoZ742B', model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, speed: 0.95 } };
const narration = {
  voices: { narrator: NARRATOR }, lead_in: 1.2, default_gap: 0.5, tail: 2.5,
  lines: [
    { section: 'open', text: `{open}This is the ${title.replace(/^the /i, "")} rig. {run}Watch it run.`, gap: 0.8 },
    { section: 'pose', text: `{close}Now closer, {slow}and twenty times slower, until it reads {peak}${said}.`, gap: 1.2, readouts: [H.y.toFixed(model.QUANTITY.digits)] },
    { section: 'end', text: `{back}Pull back to the whole rig. {end}Now try it yourself.` },
  ],
};
fs.writeFileSync(path.join(data, 'narration.json'), JSON.stringify(narration, null, 1) + '\n');
fs.writeFileSync(path.join(data, 'sfx.json'), JSON.stringify({ pose: libHas('sfx/beep.mp3') ? 'lib:beep' : ['short soft electronic beep, clean, no echo', 0.4] }, null, 1) + '\n');
fs.writeFileSync(path.join(data, 'mix.json'), JSON.stringify({ levels: { pose: 0.35 }, min_gap: 0.35, repeat_gain: 1.0, bed: { gain: 0.26, duck: 0.15 }, loops: {} }, null, 1) + '\n');
fs.writeFileSync(path.join(data, 'project.json'), JSON.stringify({ ...(lib ? { library: path.relative(path.join(dir, 'video'), lib).split(path.sep).join('/') } : {}), bpm: 88, offset: 0 }, null, 1) + '\n');
fs.writeFileSync(path.join(data, 'music.json'), JSON.stringify({
  bpm: 88, styles: ['calm documentary underscore', '88 BPM', 'warm felt piano and airy pads', 'curious, understated', 'light percussion, no big drums', 'instrumental', 'modern science documentary'],
  negative: ['vocals', 'epic trailer', 'loud drums', 'rock guitar', 'childish', 'dubstep'], variants: { A: [], B: ['gentle celesta motif'] },
  chunks: [{ bars: 8, text: '[Intro]\n{quiet pads}', styles: ['sparse intro'] }, { bars: 24, text: '[Middle]\n{a soft pulse}', styles: ['light motion'] }, { bars: 8, text: '[Outro]\n{settles}', styles: ['gentle resolve'] }],
  instrumental: true,
}, null, 1) + '\n');

// ---- README, STATUS, .gitignore
fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\nvideo/out/\nvideo/assets/audio/variants/\nvideo/assets/audio/narration_cache/\n.env\nnode_modules/\nfigure/shots/\n.wrangler/\n');
fs.writeFileSync(path.join(dir, 'README.md'), `# ${title}

SCAFFOLD (explainer-studio, archetype **${arch}**). A directed film, an explainer and an open lab on one live model.
Kit: \`${cfg.kit}\` (relative to this folder). Workflow and rules: the \`explainer-studio\` skill.

| what | where |
|---|---|
| model + self-checks | \`src/model.mjs\` (\`node src/model.mjs\`) |
| figure (anatomy skill) | \`figure/build.mjs\`, \`figure/subject.mjs\`, \`figure/live.js\` (\`node figure/build.mjs --audit\`) |
| explainer steps + challenges | \`src/content.mjs\` |
| instruments | \`src/widgets.mjs\` |
| page glue + lab | \`src/app.mjs\`, \`src/lab.html\` |
| shot list | \`video/timeline.mjs\`; film hooks \`video/scene.mjs\` |
| narration script | \`video/assets/data/narration.json\` |
| config | \`topic.config.json\` (title, worker \`${cfg.worker}\`, port ${port}, figure API \`window.${api}\`, colours) |

\`\`\`
node ${cfg.kit}/audio.mjs . narrate [--placeholder]   # narration (ElevenLabs; voice in narration.json)
node ${cfg.kit}/render.mjs . --sheet 2,6,10           # look at the stills
node ${cfg.kit}/render.mjs .                          # full render (1080p master, 720p web copy, poster)
node ${cfg.kit}/gate.mjs .                            # the quality gates
node ${cfg.kit}/ship.mjs . [--deploy]                 # page + site (+ wrangler deploy, worker ${cfg.worker})
\`\`\`

## Headline numbers
SCAFFOLD: ${model.simulate(model.DEFAULTS).summary.lines.join(' · ')}
`);
fs.writeFileSync(path.join(dir, 'STATUS.md'), `# Status: ${title}\n\nScaffolded ${new Date().toISOString().slice(0, 10)} with explainer-studio (archetype ${arch}). Nothing topic-specific yet.\n\n## Fixes after review\n(none yet)\n`);

console.log(`scaffolded ${path.relative(process.cwd(), dir) || dir} (archetype ${arch}, window.${api}, worker ${cfg.worker})`);

// ---- bring it to a running state: model checks, figure, placeholder narration, page
const run = (cmd, args, cwd = dir) => { console.log(`> ${[cmd, ...args].join(' ')}`); const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false }); if (r.status) { console.error(`failed: ${cmd} ${args.join(' ')}`); process.exit(r.status); } };
if (!arg('no-build')) {
  run(process.execPath, ['src/model.mjs']);
  run(process.execPath, ['figure/build.mjs']);
  run(process.execPath, [path.join(KIT, 'audio.mjs'), dir, 'narrate', '--placeholder']);
  run(process.execPath, [path.join(KIT, 'ship.mjs'), dir]);
}
if (!arg('no-git')) {
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', `Scaffold ${slug} (explainer-studio, archetype ${arch})`], { cwd: dir });
}
console.log(`\nnext:\n  open ${path.join(dir, 'out', 'page', 'preview.html')}\n  node ${path.relative(process.cwd(), path.join(KIT, 'render.mjs'))} ${path.relative(process.cwd(), dir)} --sheet 1,4,8\n  node ${path.relative(process.cwd(), path.join(KIT, 'gate.mjs'))} ${path.relative(process.cwd(), dir)} --skip-film`);
