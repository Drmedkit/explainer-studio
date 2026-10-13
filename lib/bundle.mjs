// One module scope for the browser: drop import lines, `export` keywords and each file's command-line tail.
// A source file marks its command-line part (self-check report, `node src/model.mjs`) with a line `// @cli`:
// everything from that line on stays out of the page and the film.
export const strip = (src) => src
  .replace(/^\/\/ @cli[\s\S]*$/m, '')
  .replace(/^import [^;]+;\s*$/gm, '')
  .replace(/^export (const|function|let|class|async function) /gm, '$1 ')
  .replace(/^export default /gm, 'const __default = ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '');

/** Concatenate topic files (relative to the topic) into one script body, each with a header comment. */
export const bundle = (T, files) => files.filter((f) => T.exists(f)).map((f) => `// ---- ${f}\n` + strip(T.read(f))).join('\n');

/** Make a source safe to sit inside an inline <script>. */
export const scriptSafe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');
