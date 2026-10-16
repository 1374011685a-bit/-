/**
 * Verify the single-file build (dist/block-jump.html):
 *   1. it really is self-contained - loading it must issue *no* subresource
 *      requests at all, so it works from a file, a USB stick or any host
 *   2. it plays, both from file:// and served over http from a folder that
 *      contains nothing else
 *
 *   node tests/single-file.js
 *
 * Rebuilds first, so it always checks the current source.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const { chromium } = require(
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "dist/block-jump.html");
const PORT = 8098;
const problems = [];

/* ------------------------------------------------------------------ build */
execFileSync(process.execPath, [path.join(ROOT, "deploy/build-single-file.js")], { stdio: "inherit" });
const html = fs.readFileSync(FILE, "utf8");

const checks = [];
const check = (name, cond, detail) => {
  checks.push([name, cond, detail]);
  if (!cond) problems.push(name);
};

check("no <script src> left", !/<script[^>]+src=/.test(html));
check("no <link rel=stylesheet> left", !/<link[^>]+stylesheet/.test(html));
check("favicon is inlined as a data URI", /rel="icon"[^>]*href="data:image\/png;base64,/.test(html));
check("no external http(s) reference anywhere", !/(src|href)="https?:\/\//.test(html));
check("one file, 300KB or less", Buffer.byteLength(html) <= 300 * 1024, `${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);

/* ------------------------------------------------------- browser: file:// */
function collect(page, bag) {
  page.on("console", (m) => {
    if (m.type() === "error") bag.push("console: " + m.text());
  });
  page.on("pageerror", (e) => bag.push("pageerror: " + e.message));
  page.on("request", (r) => {
    const url = r.url();
    /* the document itself is expected; anything else means the build is not
       actually self-contained */
    if (r.resourceType() === "document" || url.startsWith("data:")) return;
    bag.push("request: " + url);
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  const fileBag = [];
  const filePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  collect(filePage, fileBag);
  await filePage.goto("file:///" + FILE.replace(/\\/g, "/"), { waitUntil: "load" });
  await filePage.waitForTimeout(1200);
  const loaded = await filePage.evaluate(() => ({
    title: document.querySelector("#screen-title .title").textContent,
    scripts: typeof window.BJ !== "undefined" && !!window.BJ.World && !!window.BJ.Pixel,
    css: getComputedStyle(document.querySelector("#screen-title")).display === "block"
  }));
  await filePage.click('[data-action="play"]');
  await filePage.waitForTimeout(200);
  await filePage.evaluate(() => window.BJ.Game.autoplay(true));
  await filePage.waitForTimeout(5000);
  const run = await filePage.evaluate(() => {
    const s = window.BJ.Game.state();
    return { plat: s.player.plat.i, score: window.BJ.Player.score(s.player) };
  });
  await filePage.screenshot({ path: path.join(ROOT, "preview/shots/15-single-file.png") });
  await filePage.close();

  check("opens straight from disk (file://)", loaded.title.includes("BLOCK JUMP") && loaded.scripts && loaded.css);
  check("plays from disk", run.plat >= 2 && run.score > 0, JSON.stringify(run));
  check("asks the network for nothing at all", fileBag.length === 0, fileBag.join(" | "));

  /* ------------------------------ browser: http, nothing else in the folder */
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "bj-single-"));
  fs.copyFileSync(FILE, path.join(dir, "index.html"));
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(path.join(dir, "index.html")));
    } else {
      res.writeHead(404).end("nothing else is deployed here");
    }
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const httpBag = [];
  const httpPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  collect(httpPage, httpBag);
  await httpPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await httpPage.waitForTimeout(1200);
  await httpPage.click('[data-action="play"]');
  await httpPage.waitForTimeout(200);
  await httpPage.evaluate(() => window.BJ.Game.autoplay(true));
  await httpPage.waitForTimeout(5000);
  const phone = await httpPage.evaluate(() => {
    const s = window.BJ.Game.state();
    return { plat: s.player.plat.i, score: window.BJ.Player.score(s.player) };
  });
  await httpPage.close();
  server.close();

  check("served from a folder with only this file", httpBag.length === 0, httpBag.join(" | "));
  check("plays over http on a phone-sized screen", phone.plat >= 2 && phone.score > 0, JSON.stringify(phone));

  await browser.close();

  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "ok   " : "FAIL "} ${name}${detail ? " :: " + detail : ""}`);
  }
  console.log(problems.length ? `\n${problems.length} CHECK(S) FAILED` : "\nSINGLE-FILE BUILD PASSED");
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error("single-file check crashed:", e);
  process.exit(2);
});
