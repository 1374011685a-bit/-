/**
 * End-to-end check of the real page, in a real browser (Microsoft Edge via
 * Playwright). Verifies there are no console/page errors, that the title
 * screen renders, that a run can be played with keyboard input, and that the
 * menus and shop work.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PAGE = "file:///" + path.resolve(__dirname, "../index.html").replace(/\\/g, "/");
const OUT = path.resolve(__dirname, "../preview/shots");
fs.mkdirSync(OUT, { recursive: true });

/** Make sure a live run is on screen before driving it further. */
async function ensurePlaying(page) {
  const mode = await page.evaluate(() => window.BJ.Game.state().mode);
  if (mode === "play") return true;
  if (mode === "over") await page.click('#screen-over [data-action="restart"]');
  else await page.click('#screen-title [data-action="play"]');
  await page.waitForTimeout(700);
  return true;
}

const problems = [];

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console: " + m.text());
  });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

  await page.goto(PAGE, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "01-title.png") });

  const title = await page.textContent("#screen-title .title");
  console.log("title text:", JSON.stringify(title));

  /* the studio credit has to be there, and its badge has to be painted with
     the MSU tower sprite rather than left as an empty canvas */
  const credit = await page.evaluate(() => {
    const main = document.querySelector("#screen-title .credit-main");
    const cv = document.getElementById("credit-tower");
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let drawn = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) drawn++;
    const art = window.BJ.Pixel.msu();
    const ap = art.getContext("2d").getImageData(0, 0, art.width, art.height).data;
    let goldTop = 0;
    let bodyLow = 0;
    for (let y = 0; y < art.height; y++) {
      for (let x = 0; x < art.width; x++) {
        const i = (y * art.width + x) * 4;
        const gold = ap[i] > 200 && ap[i + 1] > 140 && ap[i + 2] < 130 && ap[i + 3] > 0;
        if (gold && y < 8) goldTop++;
        if (ap[i + 3] > 0 && y > art.height * 0.75) bodyLow++;
      }
    }
    return {
      text: main ? main.textContent.trim() : "",
      drawn,
      size: cv.width + "x" + cv.height,
      artSize: art.width + "x" + art.height,
      goldTop,
      bodyLow
    };
  });
  console.log("credit:", JSON.stringify(credit));

  /* attract mode must be running behind the menu */
  const attract = await page.evaluate(() => {
    const s = window.BJ.Game.state();
    return { plats: s.world.plats.length, mode: s.mode, blocks: s.player.blocks() };
  });
  console.log("attract after 2.5s:", JSON.stringify(attract));

  /* menus */
  await page.click('[data-action="howto"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "02-howto.png") });
  const howtoVisible = await page.isVisible("#screen-howto .steps");

  await page.click('#screen-howto [data-action="back"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="shop"]');
  await page.waitForTimeout(300);
  const skins = await page.$$eval("#shop-grid .skin", (n) => n.length);
  await page.screenshot({ path: path.join(OUT, "03-shop.png") });

  /* give the player some stars and buy a skin, to exercise persistence */
  await page.evaluate(() => {
    const p = window.BJ.Game.profile();
    p.bank = 5000;
    window.BJ.Save.write(p);
  });
  await page.click("#screen-shop [data-action='back']");
  await page.waitForTimeout(150);
  await page.click('[data-action="shop"]');
  await page.waitForTimeout(250);
  await page.click("#shop-grid .skin:nth-child(5) button");
  await page.waitForTimeout(250);
  const afterBuy = await page.evaluate(() => {
    const p = window.BJ.Game.profile();
    return { bank: p.bank, owned: p.owned.length, skin: p.skin };
  });
  console.log("after purchase:", JSON.stringify(afterBuy));
  await page.screenshot({ path: path.join(OUT, "04-shop-bought.png") });

  await page.click("#screen-shop [data-action='back']");
  await page.waitForTimeout(150);
  await page.click('[data-action="ranks"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, "05-ranks.png") });
  await page.click("#screen-ranks [data-action='back']");
  await page.waitForTimeout(150);

  /* play with the keyboard: hold to charge, release to jump */
  await page.click('[data-action="play"]');
  await page.waitForTimeout(400);
  const start = await page.evaluate(() => {
    const s = window.BJ.Game.state();
    return { mode: s.mode, plat: s.player.plat.i };
  });
  console.log("run started:", JSON.stringify(start));

  /* Hold and release the way a player would: watch the power meter, let go
     inside the green window the aim aid marks. */
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down("Space");
    await page
      .waitForFunction(
        () => {
          const s = window.BJ.Game.state();
          if (s.player.state !== "charge") return false;
          const plan = s.plan;
          if (!plan || !plan.feasible) return s.player.charge >= 1;
          const aim = Math.min((plan.cMin + plan.cMax) / 2, plan.cMax - 1 / 45);
          return s.player.charge >= aim;
        },
        { timeout: 4000 }
      )
      .catch(() => null);
    await page.keyboard.up("Space");
    await page.waitForTimeout(450);
  }
  const afterKeys = await page.evaluate(() => {
    const s = window.BJ.Game.state();
    return { plat: s.player.plat.i, score: window.BJ.Player.score(s.player), state: s.player.state };
  });
  console.log("after 6 manual jumps:", JSON.stringify(afterKeys));
  await page.screenshot({ path: path.join(OUT, "06-playing.png") });

  /* now let the bot play for a while: exercises hazards, movers, crumbles */
  await ensurePlaying(page);
  await page.evaluate(() => window.BJ.Game.autoplay(true));
  const autoT0 = Date.now();
  const timeBefore = await page.evaluate(() => window.BJ.Game.state().time);
  await page.waitForTimeout(10000);
  const wall = (Date.now() - autoT0) / 1000;
  const auto = await page.evaluate(() => {
    const s = window.BJ.Game.state();
    return {
      plat: s.player.plat.i,
      score: window.BJ.Player.score(s.player),
      stars: s.player.stars,
      state: s.player.state,
      biome: s.biomeA,
      biomeT: +s.biomeT.toFixed(2),
      particles: s.particles.length,
      gameTime: +s.time.toFixed(1),
      hud: document.getElementById("hud-score").textContent
    };
  });
  console.log(`after ${wall.toFixed(1)}s of autoplay:`, JSON.stringify(auto));
  await page.screenshot({ path: path.join(OUT, "07-autoplay.png") });

  /* pause + resume */
  await ensurePlaying(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const paused = await page.isVisible("#screen-pause");
  await page.screenshot({ path: path.join(OUT, "08-pause.png") });
  await page.click('[data-action="resume"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.BJ.Game.autoplay(false));

  await ensurePlaying(page);
  /* the reported bug: after landing the block used to slide to the far edge */
  const stayPut = await page.evaluate(async () => {
    const s = window.BJ.Game.state();
    s.auto = false;
    const solid = s.world.plats.filter((p) => p.type === "solid" && !p.gone).pop();
    if (!solid) return null;
    s.player.plat = solid;
    s.player.offset = solid.w / 2; /* drop it in the middle of the platform */
    s.player.x = solid.x + solid.w / 2;
    s.player.y = solid.y;
    s.player.vx = 0;
    s.player.vy = 0;
    s.player.state = "idle";
    const x0 = s.player.x;
    await new Promise((r) => setTimeout(r, 600));
    return { moved: Math.abs(s.player.x - x0), offset: s.player.offset, w: solid.w, state: s.player.state };
  });
  console.log("standing still:", JSON.stringify(stayPut));

  /* a held Shield must catch a fall and put the player back on the ledge */
  const shieldSave = await page.evaluate(async () => {
    const s = window.BJ.Game.state();
    s.auto = false;
    s.player.shield = 1;
    s.player.invulnT = 0;
    const wasOn = s.player.plat ? s.player.plat.i : -1;
    s.player.y = 900;
    s.player.state = "air";
    s.player.vx = 0;
    s.player.vy = 6;
    await new Promise((r) => setTimeout(r, 900));
    return {
      shieldLeft: s.player.shield,
      backOnPlat: s.player.plat ? s.player.plat.i : -1,
      state: s.player.state,
      wasOn
    };
  });
  console.log("shield save:", JSON.stringify(shieldSave));

  /* force a death to check the results screen and the ladder write */
  const forceDeath = () =>
    page.evaluate(() => {
      const s = window.BJ.Game.state();
      s.auto = false;
      /* a held Shield is supposed to absorb exactly this kind of fall, so the
         test clears it first - that behaviour is covered by the sim tests */
      s.player.shield = 0;
      s.player.invulnT = 0;
      s.player.y = 900;
      s.player.state = "air";
      s.player.vx = 0;
      s.player.vy = 6;
    });

  let overVisible = false;
  for (let attempt = 0; attempt < 3 && !overVisible; attempt++) {
    const before = await page.evaluate(() => {
      const s = window.BJ.Game.state();
      return { mode: s.mode, auto: !!s.auto, pstate: s.player.state, finished: s.finished };
    });
    console.log(`  death attempt ${attempt + 1}:`, JSON.stringify(before));
    if (before.mode === "play") {
      await forceDeath();
      try {
        await page.waitForSelector("#screen-over.show", { timeout: 6000 });
        overVisible = await page.isVisible("#screen-over .result");
      } catch (e) {
        overVisible = false;
      }
    }
    if (!overVisible) {
      /* put the game back into a known state and try once more */
      const shown = await page.evaluate(() => document.getElementById("screen-over").classList.contains("show"));
      await page.click(shown ? '#screen-over [data-action="restart"]' : '#screen-title [data-action="play"]');
      await page.waitForTimeout(600);
    }
  }
  const ladder = await page.evaluate(() => {
    const p = window.BJ.Game.profile();
    return { scores: p.scores.length, best: p.best.score, bank: p.bank };
  });
  await page.screenshot({ path: path.join(OUT, "09-gameover.png") });
  console.log("results screen visible:", overVisible, "ladder:", JSON.stringify(ladder));

  /* jump a fresh run forward to see the other two biomes render */
  const biomes = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  biomes.on("pageerror", (e) => problems.push("biome pageerror: " + e.message));
  await biomes.goto(PAGE, { waitUntil: "load" });
  await biomes.click('[data-action="play"]');
  await biomes.waitForTimeout(500);
  for (const [plat, name] of [
    [44, "12-biome-dusk"],
    [84, "13-biome-cave"]
  ]) {
    await biomes.evaluate((n) => {
      const s = window.BJ.Game.state();
      s.world.ensure(n + 6);
      const pl = s.world.at(n);
      s.player.plat = pl;
      s.player.x = pl.x + pl.w - 8;
      s.player.y = pl.y;
      s.player.vx = 0;
      s.player.vy = 0;
      s.player.state = "idle";
      s.player.bestX = s.player.x;
      s.camX = s.player.x - 132;
    }, plat);
    await biomes.waitForTimeout(2400);
    await biomes.screenshot({ path: path.join(OUT, name + ".png") });
  }
  await biomes.close();

  /* ---------------------------------------------------------------- phones */
  async function phone(size, shot, shotPlay) {
    const p = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
    p.on("pageerror", (e) => problems.push(`${shot} pageerror: ` + e.message));
    await p.goto(PAGE, { waitUntil: "load" });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(OUT, shot) });
    await p.click('[data-action="play"]');
    await p.waitForTimeout(300);
    await p.evaluate(() => window.BJ.Game.autoplay(true));
    await p.waitForTimeout(4500);
    const state = await p.evaluate(() => {
      const c = document.getElementById("game");
      const r = c.getBoundingClientRect();
      const s = window.BJ.Game.state();
      /* Look at the actual pixels: the platforms are green-topped, so if the
         world has been pushed off the frame this count collapses to zero.
         (This is the check that caught the portrait camera being inverted.) */
      const ctx = c.getContext("2d");
      const y0 = Math.floor(c.height * 0.4);
      const px = ctx.getImageData(0, y0, c.width, c.height - y0).data;
      let green = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 1] > px[i] + 20 && px[i + 1] > 90) green++;
      }
      return {
        bufferW: c.width,
        bufferH: c.height,
        boxW: Math.round(r.width),
        boxH: Math.round(r.height),
        portrait: !!window.BJ.CONFIG.view.portrait,
        plat: s.player.plat.i,
        score: window.BJ.Player.score(s.player),
        camY: Math.round(s.camY),
        playerScreenY: Math.round(s.player.y + s.camY),
        grassPixels: green
      };
    });
    await p.screenshot({ path: path.join(OUT, shotPlay) });
    await p.close();
    console.log(`  ${shot}:`, JSON.stringify(state), `viewport ${size.width}x${size.height}`);
    return { ...state, vw: size.width, vh: size.height };
  }

  const portrait = await phone({ width: 390, height: 844 }, "10-phone.png", "11-phone-play.png");
  const landscape = await phone({ width: 844, height: 390 }, "16-phone-landscape.png", "17-phone-landscape-play.png");

  const fills = (s) => s.boxW >= s.vw * 0.98 && s.boxH >= s.vh * 0.98;
  const aspectOk = (s) => Math.abs(s.bufferW / s.bufferH - s.vw / s.vh) < 0.03;
  /* platforms must sit in the lower part of the frame and actually be drawn */
  const framed = (s) =>
    s.grassPixels > 150 && s.playerScreenY > s.bufferH * 0.45 && s.playerScreenY < s.bufferH * 0.95;

  await browser.close();

  console.log("\nchecks:");
  const results = [
    ["no console/page errors", problems.length === 0, problems.join(" | ")],
    ["title renders", title && title.includes("BLOCK JUMP")],
    [
      'credit "Made by MSU English Group 1" is on the title screen',
      credit.text.includes("MSU English Group 1"),
      credit.text
    ],
    [
      "credit badge shows the MSU tower pixel art (star on top, building below)",
      credit.drawn > 400 && credit.goldTop >= 6 && credit.bodyLow > 400,
      `drawn ${credit.drawn}px in a ${credit.size} badge, sprite ${credit.artSize}, gold top ${credit.goldTop}px`
    ],
    ["attract mode is playing behind the menu", attract.mode === "title" && attract.blocks > 4],
    ["how-to screen renders", howtoVisible],
    ["shop lists every skin", skins === 8],
    ["purchase works", afterBuy.bank === 5000 - 900 && afterBuy.owned === 2],
    ["keyboard jumps advance the run", afterKeys.plat >= 2],
    ["autoplay keeps clearing platforms", auto.plat >= 8],
    ["sim time tracks wall time (1x pacing)", Math.abs(auto.gameTime - timeBefore - wall) < wall * 0.2, `${(auto.gameTime - timeBefore).toFixed(1)}s sim vs ${wall.toFixed(1)}s wall`],
    ["hud reflects the score", Number(auto.hud) > 0],
    ["pause screen works", paused],
    [
      "block stays where it landed (no slide to the ledge)",
      stayPut && stayPut.moved < 0.6 && Math.abs(stayPut.offset - stayPut.w / 2) < 1,
      JSON.stringify(stayPut)
    ],
    [
      "shield catches a fall",
      shieldSave.shieldLeft === 0 && shieldSave.state === "idle" && shieldSave.backOnPlat === shieldSave.wasOn
    ],
    ["results screen + ladder write", overVisible && ladder.scores >= 1 && ladder.bank >= 0]
    ,
    [
      "portrait phone: tall buffer filling the screen (no desktop-style letterbox)",
      portrait.portrait && portrait.bufferH > portrait.bufferW && fills(portrait) && aspectOk(portrait) && framed(portrait),
      `buffer ${portrait.bufferW}x${portrait.bufferH}, box ${portrait.boxW}x${portrait.boxH}`
    ],
    ["portrait phone: playable", portrait.plat >= 2 && portrait.score > 0, JSON.stringify({ plat: portrait.plat })],
    [
      "landscape phone: 16:9-class view, filling the screen",
      !landscape.portrait && landscape.bufferH === 270 && fills(landscape) && aspectOk(landscape) && framed(landscape),
      `buffer ${landscape.bufferW}x${landscape.bufferH}, box ${landscape.boxW}x${landscape.boxH}`
    ],
    ["landscape phone: playable", landscape.plat >= 2 && landscape.score > 0, JSON.stringify({ plat: landscape.plat })]
  ];
  let failed = 0;
  for (const [name, ok, extra] of results) {
    if (!ok) failed++;
    console.log(`${ok ? "ok   " : "FAIL "} ${name}${extra ? " :: " + extra : ""}`);
  }
  console.log(failed ? `\n${failed} BROWSER CHECK(S) FAILED` : "\nALL BROWSER CHECKS PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("browser test crashed:", e);
  process.exit(2);
});
