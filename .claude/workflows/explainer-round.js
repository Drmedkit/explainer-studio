export const meta = {
  name: 'explainer-round',
  description: 'Build a round of explainer-studio topics in parallel: build, review stills + gates, one fix round, optional ship, fold kit notes',
  whenToUse: 'You have approved concept cards for a few topics (typically five) and want each built end to end with the explainer-studio skill.',
  phases: [
    { title: 'Build', detail: 'one agent per topic: card -> scaffold -> model, figure, explainer, lab, film, gates' },
    { title: 'Review', detail: 'a fresh reviewer per topic looks at the stills, gate table and STATUS' },
    { title: 'Fix', detail: 'at most one fix round per topic, only when the review asks for it' },
    { title: 'Ship', detail: 'deploy + artifact, only with args.deploy and a passing review' },
    { title: 'Kit', detail: 'fold every topic\'s KIT-NOTES.md into the kit once all topics are done' },
  ],
}

// args = {
//   kit: "/abs/path/explainer-studio",            // this repo
//   workspace: "/abs/path/where/topics/go",       // topic folders are created here (default: the kit's parent)
//   topics: [ { folder: "gas-piston", card: "/abs/path/cards/physics.thermal.gas-laws.json",
//               archetype: "machine", port: 5282 }, ... ],
//   deploy: false,           // true = ship.mjs --deploy + publish the page as a claude.ai Artifact after a passing review
//   foldKitNotes: true,      // fold KIT-NOTES.md into the kit after the round
//   workers: 3,              // render workers per topic (lower it when many topics render at once)
//   rules: "..."             // optional extra house rules appended to every prompt (models, voices, ...)
// }
const A = args || {}
if (!A.kit || !Array.isArray(A.topics) || !A.topics.length) throw new Error('args.kit and args.topics[] are required')
const KIT = A.kit
const WS = A.workspace || `${KIT}/..`
const WORKERS = A.workers || 3
const EXTRA = A.rules ? `\nHouse rules for this round:\n${A.rules}\n` : ''

const GATE_ROW = { type: 'object', properties: { gate: { type: 'string' }, status: { type: 'string' }, detail: { type: 'string' } }, required: ['gate', 'status'] }
const REPORT = {
  type: 'object',
  properties: {
    folder: { type: 'string' },
    done: { type: 'boolean', description: 'true when the whole workflow ran and every gate is PASS (or WARN explained in STATUS)' },
    film_seconds: { type: 'number' },
    headline_numbers: { type: 'array', items: { type: 'string' } },
    gates: { type: 'array', items: GATE_ROW },
    stills: { type: 'array', items: { type: 'string' }, description: 'absolute paths of the sheet stills you reviewed' },
    kit_notes: { type: 'string', description: 'summary of KIT-NOTES.md, empty if none' },
    known_gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['folder', 'done', 'gates', 'known_gaps'],
}
const REVIEW = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    fixes: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'] } },
  },
  required: ['pass', 'fixes'],
}
const SHIPPED = { type: 'object', properties: { site: { type: 'string' }, artifact: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['ok'] }

const dirOf = (t) => `${WS}/${t.folder}`

const RULES = `
Rules for every agent in this round:
- Use the explainer-studio skill (invoke it with the Skill tool) and follow it, including the anatomy skill it points to.
- Do not edit the kit (${KIT}): several topics run at once. Write anything the kit lacks into KIT-NOTES.md in your
  topic folder (what, why, the exact patch if you have one) and work around it locally.
- Stay in your topic folder; never modify other topics, the anatomy skill or the shared audio library (adding a new bed
  or sound through the kit's audio tools is fine). Use only your assigned port.
- Headless Chrome always --mute-audio (the kit does this; any script of your own must too). Render with --workers ${WORKERS}.
- Check every assumed number against a real source or the model before it goes into narration.
- Run \`node audio.mjs <topic> narrate --dry\` before generating; ElevenLabs keys may have a hard cap.
${EXTRA}`

const buildPrompt = (t) => `You build ONE explainer-studio topic, completely.

Topic folder: ${dirOf(t)} (worker name ${t.folder}-lab, port ${t.port})
Concept card: ${t.card}
Archetype: ${t.archetype || 'as the card says'}
Kit: ${KIT}

1. Read the card. Build what it describes; improve where your judgement says so and note deviations in STATUS.md.
   If the card has a "bundle" (other topics that will reuse this rig later), build the figure and model as a reusable
   rig and document it in a "Rig reuse" section of README.md.
2. Scaffold: node "${KIT}/new-topic.mjs" ${t.folder} --dir "${WS}" --archetype ${t.archetype || '<from the card>'} --port ${t.port}
   (skip if the folder already exists from an earlier attempt; then continue where STATUS.md says it stopped).
3. Work the skill's workflow to the end: model with self-checks, figure (real materials, focus fogs toward grey),
   explainer opening on catalog misconceptions, open lab with 3 challenges, directed full-bleed 16:9 film with real
   narration, sfx and a music bed, stills reviewed by eye at 8-10 moments before AND after the full render,
   \`node "${KIT}/gate.mjs" ${dirOf(t)}\` all PASS, \`node "${KIT}/ship.mjs" ${dirOf(t)}\` (build only, NO --deploy).
4. Finish with README.md, STATUS.md (deviations, known gaps) and a git commit in the topic folder (no remote).
${RULES}
Return the report: gate table, film length, headline numbers, the stills you looked at, KIT-NOTES summary, known gaps.`

const reviewPrompt = (t, r) => `You are the reviewer of an explainer-studio topic built by another agent. Be the
demanding reviewer: find what you would send back. You do NOT edit anything.

Topic folder: ${dirOf(t)}   Concept card: ${t.card}
Builder's report: ${JSON.stringify(r)}

Check, by reading files and LOOKING at images (Read the JPG/PNG files):
- the sheet stills and out/gate/contrast-*.jpg: full bleed 16:9, nothing white-on-white, the subject is the most
  contrasty thing, labels readable, the camera is on what the narration says at that moment;
- the gate table (\`out/gate.json\`): every row PASS, or a WARN explained in STATUS.md;
- the model: \`node src/model.mjs\` exits 0 and the self-checks are real (a balance or a known limit), the headline
  numbers match a real source;
- the explainer steps open on catalog misconceptions from the card; the lab has real knobs and 3 working challenges;
- the film follows references/film-direction.md of the explainer-studio skill (wide -> close-up -> slow motion ->
  pull back, events posed on the spoken word, slow motion labelled).
Set pass=false only for things worth a fix round; give each fix as what / where / why.`

const fixPrompt = (t, review) => `Apply this review to the explainer-studio topic in ${dirOf(t)} (kit ${KIT}).
Fixes:
${review.fixes.map((f, i) => `${i + 1}. ${f.what}${f.where ? ` (${f.where})` : ''}: ${f.why}`).join('\n')}

Re-render only the affected spans (\`render.mjs --ranges a-b,c-d\`) unless a fix touches the whole film, look at the
stills again, re-run gate.mjs to all PASS, re-run ship.mjs (no --deploy), add the fixes under "Fixes after review" in
STATUS.md and commit.
${RULES}
Return the updated report.`

const shipPrompt = (t) => `Ship the explainer-studio topic in ${dirOf(t)} (kit ${KIT}).
1. node "${KIT}/ship.mjs" ${dirOf(t)} --deploy  (wrangler must be logged in; if it is not, stop and say so).
2. Publish out/page/index.html as a claude.ai Artifact if the Artifact tool is available: load the artifact-design
   skill first, a one-word generic icon, the 720p film and poster as files. Artifacts start private; say so in STATUS.
3. Put the URLs in README.md and STATUS.md and commit.
Return the site URL, the artifact URL (empty if none) and ok.`

const results = await pipeline(
  A.topics,
  (t) => agent(buildPrompt(t), { label: `build:${t.folder}`, phase: 'Build', schema: REPORT }),
  async (report, t) => {
    if (!report) return { topic: t.folder, report: null, review: null }
    const review = await agent(reviewPrompt(t, report), { label: `review:${t.folder}`, phase: 'Review', schema: REVIEW })
    return { topic: t.folder, report, review }
  },
  async (s, t) => {
    if (!s.report || !s.review || s.review.pass || !s.review.fixes.length) return s
    log(`${t.folder}: ${s.review.fixes.length} fixes from review, one fix round`)
    const fixed = await agent(fixPrompt(t, s.review), { label: `fix:${t.folder}`, phase: 'Fix', schema: REPORT })
    return { ...s, report: fixed || s.report, fixed: !!fixed }
  },
  async (s, t) => {
    const green = s.report && s.report.done && s.report.gates.every((g) => /^(PASS|WARN)/i.test(g.status))
    if (!A.deploy) return { ...s, shipped: null }
    if (!green) { log(`${t.folder}: not shipped (gates not all green)`); return { ...s, shipped: { ok: false, note: 'gates not green' } } }
    const shipped = await agent(shipPrompt(t), { label: `ship:${t.folder}`, phase: 'Ship', schema: SHIPPED })
    return { ...s, shipped }
  },
)

// Barrier on purpose: the kit notes of ALL topics are folded together, once nobody is building on the kit any more.
let kit = null
if (A.foldKitNotes !== false) {
  const folders = results.filter(Boolean).map((r) => `${WS}/${r.topic}/KIT-NOTES.md`)
  kit = await agent(`Fold the round's kit notes into the explainer-studio kit at ${KIT}.
Notes files (some may not exist): ${folders.join(', ')}
For each note: decide whether it is a real kit gap (several topics hit it, or it is clearly general) or topic-specific.
Apply the general ones to the kit (code, templates, skill/ docs) with the smallest correct change, keep existing topics
working (re-run \`node gate.mjs <topic> --quick\` on one finished topic), and commit in the kit repo. Do not push.
Return a short list: applied (what, which notes), skipped (what, why).`, { label: 'kit:fold-notes', phase: 'Kit' })
}

return {
  topics: results.map((r, i) => r ? {
    topic: r.topic,
    done: !!(r.report && r.report.done),
    film_seconds: r.report && r.report.film_seconds,
    gates: r.report && r.report.gates,
    review: r.review && { pass: r.review.pass, fixes: r.review.fixes.length },
    fixed: !!r.fixed,
    shipped: r.shipped,
    known_gaps: r.report && r.report.known_gaps,
  } : { topic: A.topics[i].folder, done: false, note: 'build agent failed' }),
  kit,
}
