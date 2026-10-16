/**
 * Generate the site icons (favicon.png, apple-touch-icon.png, icon-192/512)
 * and manifest.json from the *same* pixel spec the game draws, so the tab icon
 * and the home-screen icon are literally the character.
 *
 * The generated files are already committed next to index.html, so you only
 * need this if you change the skin colours or want another size:
 *
 *   npm i sharp
 *   node deploy/make-icons.js
 *
 * (Adjust the require path below if your sharp lives elsewhere.)
 */
const fs = require("fs");
const path = require("path");
const sharp = require(
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"
);

const OUT = path.resolve(__dirname, "..");
const SKIN = { body: "#e08a3c", shade: "#a85f22", light: "#f6b56b", eye: "#2b1a0d", inner: "#af6c2f" };

function rgba(hex, a = 255) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];
}

/* 16x16 sprite, mirroring buildBlock() frame 0 in js/pixel.js. */
function sprite() {
  const px = Buffer.alloc(16 * 16 * 4, 0);
  const rect = (x, y, w, h, color) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i > 15 || j > 15) continue;
        const o = (j * 16 + i) * 4;
        const c = rgba(color);
        px[o] = c[0];
        px[o + 1] = c[1];
        px[o + 2] = c[2];
        px[o + 3] = c[3];
      }
    }
  };

  /* arms */
  rect(1, 6, 1, 4, SKIN.shade);
  rect(14, 6, 1, 4, SKIN.shade);
  rect(1, 5, 1, 1, SKIN.light);
  rect(14, 5, 1, 1, SKIN.light);
  /* body, 12x12 with clipped corners */
  rect(3, 0, 10, 1, SKIN.shade);
  rect(2, 1, 12, 10, SKIN.shade);
  rect(3, 11, 10, 1, SKIN.shade);
  rect(3, 1, 10, 10, SKIN.body);
  /* bevel */
  rect(3, 1, 10, 1, SKIN.light);
  rect(3, 2, 1, 9, SKIN.light);
  rect(3, 10, 10, 1, SKIN.shade);
  rect(12, 2, 1, 9, SKIN.shade);
  rect(10, 9, 2, 1, SKIN.inner);
  /* face */
  rect(4, 4, 2, 3, SKIN.eye);
  rect(9, 4, 2, 3, SKIN.eye);
  rect(4, 4, 1, 1, "#ffffff");
  rect(9, 4, 1, 1, "#ffffff");
  rect(6, 9, 3, 1, SKIN.eye);
  /* legs */
  for (const [x, y] of [
    [3, 12],
    [10, 12]
  ]) {
    rect(x, y, 3, 4, SKIN.shade);
    rect(x, y, 3, 3, SKIN.body);
    rect(x, y, 1, 2, SKIN.light);
  }
  return px;
}

async function icon(size, scale, background) {
  const art = Math.round(16 * scale);
  const spritePng = await sharp(sprite(), { raw: { width: 16, height: 16, channels: 4 } })
    .resize(art, art, { kernel: "nearest" })
    .png()
    .toBuffer();
  const left = Math.round((size - art) / 2);
  const top = Math.round((size - art) / 2);
  const base = background
    ? sharp({ create: { width: size, height: size, channels: 4, background } })
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([{ input: spritePng, left, top }]).png({ compressionLevel: 9 }).toBuffer();
}

(async () => {
  const jobs = [
    ["favicon.png", 64, 3, null],
    ["icon-192.png", 192, 8, "#101728"],
    ["icon-512.png", 512, 20, "#101728"],
    ["apple-touch-icon.png", 180, 8, "#101728"]
  ];
  for (const [name, size, scale, bg] of jobs) {
    const buf = await icon(size, scale, bg);
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
  }

  const manifest = {
    name: "方块跳跳 Block Jump",
    short_name: "Block Jump",
    description: "一键操作的像素风休闲跳跃游戏 · A one-button pixel-art jumping game",
    start_url: "./",
    scope: "./",
    display: "fullscreen",
    orientation: "any",
    background_color: "#080c17",
    theme_color: "#080c17",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
    ]
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("manifest.json written");
})();
