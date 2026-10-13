// Builds the __TITLE__ figure with the anatomy skill (~/.claude/skills/anatomy) and the explainer-studio helpers:
// figure/__NAME__.html, __NAME__-light.html (standalone pages: review and the anatomy line check) and the embeddable
// __NAME__(-light).fragment.html (the page and the film).
//   node figure/build.mjs            build both themes
//   node figure/build.mjs --audit    build, then prove the geometry (exits non-zero on any problem)
//
// SCAFFOLD: this is the running skeleton (a bench plate with feet, a ruler strip and the archetype's stand-in subject in
// figure/subject.mjs). Replace the subject with the real object (read the anatomy SKILL.md and references/craft.md first):
// many small precise parts, the moving parts ARE the concept, real material colours (materialCss), every item recorded.
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { anatomy, focusCss, materialCss, stageScript, strip, writeFigure } from "__KIT__/figure/build-helpers.mjs";
import { buildSubject, REGIONS, FIT, SYS } from "./subject.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const { k, A, inline } = await anatomy();
const ID = "__ID__", NAME = "__NAME__";
const W = 960, H = 640;

// ---- camera and recorder
const PLATE = { x: -150, y: -80, w: 300, d: 160, r: 8 }, PLATE_H = 12, FOOT_H = 6;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...FIT], W, H, { pad: 40, azimuth: 40 });
const R = A.recorder(P);
const at = (p) => k.iso(p, P);
// every shape is recorded twice: on its item (depth order, coverage) and as a solid (clearance, support, wobble)
const put = (name, ref, svg, shapes, extra = {}) => R.put({ name, at: ref, svg, shapes: shapes.map(R.solid), piece: "rig", ...extra });

// ---- the bench plate: feet, plate, groove, corner screws, ruler strip with ticks, label plate
{
  const feet = k.corners(PLATE, 22).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    put(`stand.foot.${x}.${y}`, [x, y, -PLATE_H - FOOT_H / 2],
      k.solidSvg(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, FOOT_H, P, 28), { tone: "mid" }),
      [A.cylinder(x, y, 8, -PLATE_H - FOOT_H, FOOT_H, { name: "stand.foot", ground: true })], { mat: "rubber", bias: -50 });
  }
  const strip = { x: PLATE.x + 14, y: PLATE.y + PLATE.d - 16, w: PLATE.w - 28, d: 8, r: 1 };
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y, 0.6, [2.2, strip.d + 0.7], P);
  const screws = k.corners(PLATE, 9);
  const label = { x: PLATE.x + 14, y: PLATE.y + 10, w: 46, d: 22, r: 1.5 };
  const svg = `<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>` +
    k.solidSvg(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }) +
    k.lineSvg(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }) +
    k.lineSvg(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }) +
    k.dotsSvg(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }) +
    k.solidSvg(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }) +
    k.lineSvg(ticks.minor, { tone: "lo" }) + k.lineSvg(ticks.major, { tone: "mid" }) +
    k.dotsSvg([at([strip.x + 2, strip.y + 4, 0.6]), at([strip.x + strip.w - 2, strip.y + 4, 0.6])], { size: 0.45 }) +
    k.solidSvg(k.slabOf(label, 0, 0.8, P, 3), { tone: "hi", crease: "none" }) +
    k.dotsSvg(k.corners(label, 2.5).map(([x, y]) => at([x, y, 0.8])), { size: 0.4 });
  put("stand.plate", [0, 0, -PLATE_H / 2], svg, [A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true })], { mat: "plate", bias: -40 });
}

// ---- the subject (figure/subject.mjs): static parts recorded here, live slots redrawn by the page every frame
const subject = buildSubject({ k, A, P, put });
A.settle(R, P);
const items = R.items.slice().sort((a, b) => a.key - b.key);
const sysOf = (name) => Object.entries(SYS).filter(([, re]) => re.test(name)).map(([n]) => n).join(" ");
const wrap = (i) => `<g class="it" data-name="${i.name}" data-sys="${sysOf(i.name)}"${i.mat ? ` data-mat="${i.mat}"` : ""}${i.slot ? ` data-slot="${i.slot}"` : ""}>${i.svg}</g>`;
const body = items.map(wrap).join("");

// ---- page script: the anatomy kit, the shared figure runtime, the model, the subject's live drawing, the glue
const read = (f) => fs.readFileSync(join(HERE, f), "utf8");
const DATA = { id: ID, W, H, P, regions: REGIONS, live: subject.live || {} };
const SCRIPT = [
  inline.kitScript(),
  stageScript(),
  strip(read("../src/model.mjs")),
  strip(read("subject.mjs")).replace(/^\/\/ ---- node-only[\s\S]*?\/\/ ---- end node-only$/m, ""),
  read("live.js").replace("__DATA__", () => JSON.stringify(DATA, (key, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))),
].join("\n");

// ---- materials (light first) and focus fog
const MATS = {
  plate: { light: { paper: "#cfd2d4", top: "#e3e5e6", shade: ["#a9adb0", "#b5b9bc", "#c1c4c7", "#cbced0"] }, dark: { paper: "#2c2f32", top: "#3a3e42", shade: ["#1a1c1e", "#202326", "#26292c", "#2c2f32"] } },
  rubber: { light: { paper: "#3a3a3c", top: "#4a4a4d", shade: ["#1e1e20", "#262628", "#2e2e30", "#363638"], line: "#77777a" }, dark: { paper: "#161617", top: "#252527", shade: ["#0a0a0b", "#0e0e0f", "#121213", "#161617"] } },
  steel: { light: { paper: "#a9b0b6", top: "#c4c9cd", shade: ["#7d858c", "#8a9198", "#979ea4", "#a3aab0"], line: "#5d646a" }, dark: { paper: "#33373b", top: "#454a4f", shade: ["#1d2023", "#23272a", "#2a2d31", "#303438"] } },
  brass: { light: { paper: "#d8b25a", top: "#ecd08a", shade: ["#a87f2c", "#b88e36", "#c69c42", "#d2a84e"], line: "#7d5d1c" }, dark: { paper: "#6b5520", top: "#8a6e2c", shade: ["#3f3212", "#4a3b16", "#56451a", "#61501e"] } },
  accent: { light: { paper: "__ACCENT__", top: "__ACCENT__", shade: ["__ACCENT__", "__ACCENT__", "__ACCENT__", "__ACCENT__"] }, dark: { paper: "__ACCENT_DARK__", top: "__ACCENT_DARK__", shade: ["__ACCENT_DARK__", "__ACCENT_DARK__", "__ACCENT_DARK__", "__ACCENT_DARK__"] } },
};
const CSS = materialCss(`#${ID}`, MATS) + focusCss(`#${ID}`) + `
#${ID} .xs-stage { position: relative; outline: none; }
#${ID} .xs-stage svg { display: block; width: 100%; height: auto; }
`;
writeFigure({
  k, dir: HERE, name: NAME, id: ID, css: CSS, script: SCRIPT, title: "__TITLE__",
  stage: k.figureSvg({ width: W, height: H, label: subject.label, body, className: "xs-svg" }),
  stageAttrs: `aria-roledescription="figure" aria-label="${subject.label.replace(/"/g, "&quot;")}"`,
  plate: { fig: "Fig 1", title: "__TITLE__", hint: subject.hint, readout: subject.readout, keys: subject.keys || [], caption: subject.caption },
});
console.log(`${R.items.length} items · ${R.solids.length} solids`);
A.auditOrExit(R, P, { allow: subject.allow || [], cover: subject.cover || [] });
