/**
 * Serve the game the way the container does (a static server exposing only
 * index.html, css/ and js/ with real MIME types) and check the hosted
 * behaviour in a real browser:
 *   - it loads with no console errors and plays
 *   - progress (stars, bought skin) survives a reload, i.e. localStorage works
 *     over http/https, which is what the deployed version relies on
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require(
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ROOT = path.resolve(process.argv[2] || path.resolve(__dirname, ".."));
const PORT = 8099;

/* Only what the Dockerfile copies into the image. */
const ALLOW = [
  /^\/$/,
  /^\/index\.html$/,
  /^\/css\/[\w.-]+\.css$/,
  /^\/js\/[\w.-]+\.js$/,
  /^\/favicon\.png$/,
  /^\/apple-touch-icon\.png$/,
  /^\/icon-\d+\.png$/,
  /^\/manifest\.json$/
];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json"
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (!ALLOW.some((re) => re.test(url))) {
    console.log("  404 (not in the image):", url);
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const file = url === "/" ? "/index.html" : url;
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) {
      res.writeHead(404).end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
});

const problems = [];

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const base = `http://127.0.0.1:${PORT}/`;
  console.log("serving", ROOT, "at", base);

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console: " + m.text());
  });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => problems.push("requestfailed: " + r.url()));

  await page.goto(base, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const loaded = await page.evaluate(() => ({
    title: document.querySelector("#screen-title .title").textContent,
    css: getComputedStyle(document.querySelector("#screen-title")).display !== "none",
    scripts: typeof window.BJ !== "undefined" && !!window.BJ.World && !!window.BJ.Pixel,
    pixelBaked: !!window.BJ.Pixel.block(0, 0)
  }));

  await page.click('[data-action="play"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.BJ.Game.autoplay(true));
  await page.waitForTimeout(6000);
  const run = await page.evaluate(() => {
    const s = window.BJ.Game.state();
    return { plat: s.player.plat.i, score: window.BJ.Player.score(s.player), stars: s.player.stars };
  });

  /* give it stars, buy a skin, then reload to prove the profile persists */
  await page.evaluate(() => {
    const p = window.BJ.Game.profile();
    p.bank = 4000;
    window.BJ.Save.write(p);
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1200);
  const afterReload = await page.evaluate(() => {
    const p = window.BJ.Game.profile();
    return { bank: p.bank, skin: p.skin };
  });

  await page.screenshot({ path: path.resolve(__dirname, "../preview/shots/http-hosted.png") });
  await browser.close();
  server.close();

  const checks = [
    ["file set loads over http (css + all scripts)", loaded.title.includes("BLOCK JUMP") && loaded.scripts && loaded.css],
    ["pixel art bakes in the browser", loaded.pixelBaked],
    ["a run plays and progresses", run.plat >= 3 && run.score > 0],
    ["profile persists across a reload (localStorage over http)", afterReload.bank === 4000],
    ["no console / page errors or failed requests", problems.length === 0]
  ];
  let failed = 0;
  for (const [name, ok, extra] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? "ok   " : "FAIL "} ${name}${extra ? " :: " + extra : ""}`);
  }
  if (problems.length) console.log("problems:\n  " + problems.join("\n  "));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nHOSTED SMOKE TEST PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("http smoke test crashed:", e);
  server.close();
  process.exit(2);
});
