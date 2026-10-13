// Spoken numbers in the narration (words.json) and printed numbers on screen, for the readout-vs-narration gate.
const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
// words that make a spoken number a measurement worth showing (topic.config film.units adds more)
export const UNITS = ['volt', 'volts', 'amp', 'amps', 'ampere', 'amperes', 'milliamps', 'watt', 'watts', 'kilowatt', 'kilowatts', 'ohm', 'ohms',
  'newton', 'newtons', 'kilonewtons', 'meganewtons', 'joule', 'joules', 'kilojoules', 'millijoules', 'microjoules', 'meter', 'meters', 'metre', 'metres',
  'millimeter', 'millimeters', 'centimeter', 'centimeters', 'kilometer', 'kilometers', 'micrometers', 'microns', 'nanometers', 'second', 'seconds',
  'millisecond', 'milliseconds', 'microseconds', 'minute', 'minutes', 'hour', 'hours', 'degree', 'degrees', 'kelvin', 'hertz', 'kilohertz', 'rpm',
  'revolutions', 'bar', 'pascals', 'kilopascals', 'atmospheres', 'kilogram', 'kilograms', 'gram', 'grams', 'g', 'gs', 'percent', 'times', 'stops',
  'kilowatt-hours', 'electronvolts', 'electron-volts', 'ev', 'lux', 'calories', 'liters', 'litres', 'moles', 'teslas', 'tesla', 'webers', 'coulombs', 'farads', 'henries'];

const clean = (w) => w.toLowerCase().replace(/[“”"(),.;:!?]+$/g, '').replace(/^[“”"(]+/, '');

/** Parse number words starting at index i of a token list. Returns { value, decimals, end } or null. */
export function parseAt(toks, i) {
  const w0 = clean(toks[i]);
  // digits: 8.0, 1,400, 56%, −3
  const m = /^[-−]?\d[\d,]*(\.\d+)?%?$/.exec(w0);
  if (m) {
    const v = Number(w0.replace(/[,%]/g, '').replace('−', '-'));
    return { value: v, decimals: m[1] ? m[1].length - 1 : 0, end: i + 1, pct: w0.endsWith('%') };
  }
  let total = 0, cur = 0, j = i, any = false;
  const part = (w) => {
    if (w in ONES) { cur += ONES[w]; return true; }
    if (w in TENS) { cur += TENS[w]; return true; }
    if (w === 'hundred') { cur = (cur || 1) * 100; return true; }
    if (w in SCALE) { total += (cur || 1) * SCALE[w]; cur = 0; return true; }
    return false;
  };
  while (j < toks.length) {
    const w = clean(toks[j]);
    const pieces = w.split('-');
    if (pieces.every((p) => p in ONES || p in TENS || p in SCALE)) { pieces.forEach(part); any = true; j++; continue; }
    if (w === 'and' && any && j + 1 < toks.length && !/^(a|an)$/.test(clean(toks[j + 1])) && (clean(toks[j + 1]).split('-')[0] in ONES || clean(toks[j + 1]).split('-')[0] in TENS)) { j++; continue; }
    break;
  }
  if (!any) return null;
  let value = total + cur, decimals = 0;
  // "point six", "point oh five"
  if (j < toks.length && clean(toks[j]) === 'point') {
    let k = j + 1, digits = '';
    while (k < toks.length && clean(toks[k]) in ONES && ONES[clean(toks[k])] < 10) { digits += ONES[clean(toks[k])]; k++; }
    if (digits) { value = Number(`${value}.${digits}`); decimals = digits.length; j = k; }
  }
  // "two point four million": a scale word after a decimal multiplies it
  if (decimals && j < toks.length && clean(toks[j]) in SCALE) { value *= SCALE[clean(toks[j])]; j++; }
  // "and a half"
  if (j + 2 < toks.length && clean(toks[j]) === 'and' && clean(toks[j + 1]) === 'a' && clean(toks[j + 2]) === 'half') { value += 0.5; decimals = 1; j += 3; }
  return { value, decimals, end: j };
}

/** Spoken measurements: numbers followed (within two words) by a unit word. -> [{ value, decimals, text, t, line }] */
export function spokenNumbers(words, units = UNITS) {
  const U = new Set(units.map((u) => u.toLowerCase()));
  const out = [];
  words.lines.forEach((l, li) => {
    const toks = l.words.map((w) => w.w);
    for (let i = 0; i < toks.length; i++) {
      const p = parseAt(toks, i);
      if (!p) continue;
      const after = toks.slice(p.end, p.end + 2).map(clean);
      const unit = p.pct ? 'percent' : after.find((w) => U.has(w) || U.has(w.replace(/s$/, '')));
      if (unit && !(p.value === 1 && /^(one)$/.test(clean(toks[i])) && after[0] === 'of')) {
        out.push({ value: p.value, decimals: p.decimals, text: toks.slice(i, p.end).join(' ') + ' ' + unit, t: l.words[i].start, line: li, end: l.end });
      }
      i = p.end - 1;
    }
  });
  return out;
}

/** Numbers printed in on-screen text. */
export const printedNumbers = (text) => {
  const t = text.replace(/−/g, '-'), out = [...t.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter((v) => Number.isFinite(v));
  // "2.4 million" on screen also counts as 2,400,000
  for (const m of t.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion)/gi)) out.push(Number(m[1].replace(/,/g, '')) * SCALE[m[2].toLowerCase()]);
  return out;
};

/** A spoken value is on screen when a printed number rounds to it (half a unit of its last spoken digit, or 2%). */
export const matches = (spoken, printed) => {
  const tol = Math.max(0.5 * Math.pow(10, -spoken.decimals), Math.abs(spoken.value) * 0.02);
  return printed.some((x) => Math.abs(Math.abs(x) - Math.abs(spoken.value)) <= tol + 1e-9);
};
