// The explainer steps and the lab challenges for __TITLE__.
// SCAFFOLD: two placeholder steps. A finished topic has 6-8 steps, each opening on a PREDICTION whose wrong options are
// misconceptions from your catalog (the concept card, or misconceptions.json of your curriculum data; see the skill's
// references/curriculum.md; put the catalog id in `catalog`), with the camera (view) and the spotlight (focus) on the part
// that matters, and an `after` that shows the answer on the figure.
//   { title, setup, question, options: [{ text, correct, misconception, catalog }], reveal, settings, view, focus, ins, after }
export const STEPS = [
  {
    title: 'Watch it run',
    setup: 'SCAFFOLD: one sentence that sets up what the reader is looking at.',
    question: 'SCAFFOLD: a prediction question?',
    options: [
      { text: 'SCAFFOLD: the right answer', correct: true },
      { text: 'SCAFFOLD: a catalog misconception', misconception: 'SCAFFOLD: the misconception in plain words.', catalog: 'mc.<subject>.<strand>.<id>' },
      { text: 'SCAFFOLD: another catalog misconception', misconception: 'SCAFFOLD: why it is tempting, and why it is wrong.', catalog: 'mc.<subject>.<strand>.<id>' },
    ],
    reveal: 'SCAFFOLD: the answer, shown on the figure and the instrument.',
    settings: {}, view: 'subject', focus: 'subject', ins: ['trace'],
    after: { view: 'detail', focus: 'detail' },
  },
  {
    title: 'Change one thing',
    setup: 'SCAFFOLD: change one knob of the model.',
    question: 'SCAFFOLD: what happens to the headline quantity?',
    options: [
      { text: 'SCAFFOLD: it changes this way', correct: true },
      { text: 'SCAFFOLD: a catalog misconception', misconception: 'SCAFFOLD: the misconception in plain words.', catalog: 'mc.<subject>.<strand>.<id>' },
    ],
    reveal: 'SCAFFOLD: the answer.',
    settings: {}, view: 'whole', focus: null, ins: ['trace'],
    after: { view: 'subject' },
  },
];

// Three challenges with a check on the live state ({ settings, t, state, run }).
export const CHALLENGES = [
  { id: 'reach', title: 'Reach the headline', text: 'SCAFFOLD: set the knobs so the headline quantity reaches a target.', done: (st) => !!st.state && Math.abs(st.state.y) >= QUANTITY.max * 0.5 },
  { id: 'half', title: 'Halve it', text: 'SCAFFOLD: a second target that needs a different knob.', done: (st) => !!st.run && st.run.series.every(([, y]) => Math.abs(y) <= QUANTITY.max * 0.25) },
  { id: 'explain', title: 'Find the limit', text: 'SCAFFOLD: a challenge that needs the model\'s limit or a balance to close.', done: () => false },
];
