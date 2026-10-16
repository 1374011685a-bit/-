/**
 * Build a single self-contained HTML file: CSS, every script and the favicon
 * are inlined, so there is nothing to upload except this one file and nothing
 * to fetch at runtime (no css/, no js/, no images).
 *
 *   node deploy/build-single-file.js
 *   -> dist/block-jump.html
 *
 * Handy when "deploy" should mean "drop one file somewhere": any static host,
 * an object store, a Devbox running `python3 -m http.server`, or just sending
 * the file to a friend so they can open it.
 *
 * The multi-file version stays the canonical one (it can be installed to a
 * phone's home screen and has a real icon set); this is the convenience build.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "block-jump.html");

/* Same order as the <script> tags in index.html. */
const SCRIPTS = [
  "config.js",
  "world.js",
  "player.js",
  "pixel.js",
  "render.js",
  "audio.js",
  "save.js",
  "input.js",
  "ui.js",
  "game.js"
];

/* A literal "</script" inside a script would end the block early. Escaping the
   slash is valid JavaScript and keeps the parser happy. */
function safeJs(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}
function safeCss(code) {
  return code.replace(/<\/style/gi, "<\\/style");
}

function main() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const before = Buffer.byteLength(html);

  const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const cssTag = '<link rel="stylesheet" href="css/style.css" />';
  if (!html.includes(cssTag)) throw new Error("stylesheet tag not found - did index.html change?");
  html = html.replace(cssTag, "<style>\n" + safeCss(css) + "\n</style>");

  for (const name of SCRIPTS) {
    const tag = `<script src="js/${name}"></script>`;
    if (!html.includes(tag)) throw new Error(`script tag not found: ${tag}`);
    const code = fs.readFileSync(path.join(ROOT, "js", name), "utf8");
    html = html.replace(tag, "<script>\n" + safeJs(code) + "\n</script>");
  }

  /* The favicon becomes a data URI. The apple-touch-icon and the manifest are
     dropped: a home-screen install needs real sibling files, which is what the
     normal multi-file build is for. */
  const icon = fs.readFileSync(path.join(ROOT, "favicon.png")).toString("base64");
  html = html.replace(/<link rel="icon"[^>]*\/>/, `<link rel="icon" type="image/png" href="data:image/png;base64,${icon}" />`);
  html = html.replace(/[ \t]*<link rel="apple-touch-icon"[^>]*\/>\r?\n/, "");
  html = html.replace(/[ \t]*<link rel="manifest"[^>]*\/>\r?\n/, "");

  /* Fail the build rather than ship a file that still needs the network. */
  const leftovers = [
    [/src="js\//, "a script still points at js/"],
    [/href="css\//, "a stylesheet still points at css/"],
    [/href="favicon\.png"/, "the favicon is still a file reference"],
    [/href="manifest\.json"/, "the manifest is still a file reference"],
    [/href="apple-touch-icon\.png"/, "the touch icon is still a file reference"]
  ];
  for (const [re, msg] of leftovers) {
    if (re.test(html)) throw new Error("single-file build incomplete: " + msg);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html);
  const after = Buffer.byteLength(html);
  console.log(`inlined ${SCRIPTS.length} scripts + css + favicon`);
  console.log(`index.html ${(before / 1024).toFixed(1)} KB  ->  dist/block-jump.html ${(after / 1024).toFixed(1)} KB`);
  console.log("upload this one file anywhere, or open it directly");
}

main();
