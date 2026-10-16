/**
 * Block Jump - the shell: fixed-step loop, run lifecycle, camera, juice and
 * the wiring between the simulation, the renderer, the menus and the audio.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;
  var C = BJ.CONFIG;
  var P = BJ.Player;
  var doc = global.document;

  var canvas, stage, renderer, audio, ui, input;
  var profile;
  var g;
  var acc = 0;
  var lastFrame = 0;
  var hudCache = "";

  /* ------------------------------------------------------------------ setup */

  /* The landscape buffer the art is designed around. Portrait mode derives its
     own buffer from this one (see fit), so this must stay constant. */
  var BASE_VIEW = { w: 480, h: 270 };

  function fit() {
    var vw = global.innerWidth;
    var vh = global.innerHeight;
    var portrait = vh > vw * 1.05;
    var v;

    if (portrait) {
      /* A tall buffer that matches the screen's shape: the world shows less
         width but the pixels get bigger, and the picture fills the phone. */
      var pw = BJ.clamp(Math.round(BASE_VIEW.w * (vw / vh)), C.portrait.minWidth, C.portrait.maxWidth);
      v = { w: pw, h: Math.round(pw * (vh / vw)) };
    } else {
      /* Landscape: keep the design height and let the width follow the screen,
         so wide phones and ultrawide monitors fill the display too (16:9 lands
         exactly on the designed 480x270). */
      v = { w: BJ.clamp(Math.round(BASE_VIEW.h * (vw / vh)), 400, 700), h: BASE_VIEW.h };
    }

    C.view.w = v.w;
    C.view.h = v.h;
    C.view.portrait = portrait;
    canvas.width = v.w;
    canvas.height = v.h;

    var s = Math.min(vw / v.w, vh / v.h);
    /* On a big landscape screen an integer scale keeps the pixels perfectly
       square; on a phone filling the display matters more than that. */
    if (s >= 2 && !portrait) s = Math.floor(s);

    var w = Math.round(v.w * s);
    var h = Math.round(v.h * s);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    stage.style.setProperty("--hud-scale", String(s));
    stage.style.setProperty("--hud-w", v.w + "px");
    stage.style.setProperty("--hud-h", v.h + "px");

    if (g) {
      /* Keep the platform line at the same place on screen whatever the view. */
      g.camY = C.view.h * C.portrait.anchor - C.world.groundY;
    }
  }

  function randomSeed() {
    return 1 + Math.floor(Math.random() * 1e9);
  }

  /* --------------------------------------------------------------- particles */

  function burst(x, y, count, colors, opts) {
    opts = opts || {};
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (opts.speed || 1.4) * (0.4 + Math.random());
      g.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.lift || 0.4),
        life: opts.life || 0.55,
        maxLife: opts.life || 0.55,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: opts.size || (Math.random() < 0.3 ? 2 : 1),
        grav: opts.grav === undefined ? 0.06 : opts.grav
      });
    }
  }

  function dust(x, y) {
    burst(x, y, 5, ["#cbb08a", "#9a7c58", "#e2d0b4"], { speed: 1.1, life: 0.35, grav: 0.05, lift: 0.2 });
  }

  function floaterAt(text, wx, wy, cls) {
    /* The HUD is a box the size of the view, scaled to the stage, so game
       pixels are its units - minus wherever the camera is looking. */
    ui.floater(text, wx - g.camX, wy + g.camY, cls);
  }

  /* -------------------------------------------------------------------- runs */

  function beginRun(seed, attract) {
    var world = BJ.World.create(seed, {
      onCrumble: function (pl) {
        audio.sfx("crumble");
        burst(pl.x + pl.w / 2, pl.y + 20, 14, ["#7a5a38", "#4d3a24", "#a9865c"], { speed: 1.2, life: 0.7, grav: 0.14 });
      }
    });
    world.ensure(3);
    var player = P.create({ plat: world.plats[0] });

    g.world = world;
    g.player = player;
    g.plan = null;
    g.planKey = "";
    g.camX = player.x - C.view.w * 0.28;
    g.time = 0;
    g.particles = [];
    g.trail = [];
    g.shake = 0;
    g.biomeA = 0;
    g.biomeB = 0;
    g.biomeT = 0;
    g.attract = !!attract;
    g.deadAt = 0;
    g.runTime = 0;
    g.finished = false;
    g.runStars = 0;
    g.startBank = profile.bank;
    g.mode = attract ? "title" : "play";
    g.bankBefore = profile.bank;
  }

  function startRun() {
    beginRun(randomSeed(), false);
    ui.screen(null);
    ui.hudVisible(true);
    ui.pauseButton(true);
  }

  function startAttract() {
    beginRun(randomSeed(), true);
    ui.screen("title");
    ui.pauseButton(false);
  }

  function finishRun() {
    var p = g.player;
    var score = P.score(p);
    var record = score > profile.best.score;
    var entry = { score: score, blocks: p.blocks(), stars: p.stars, ts: Date.now() };
    var rank = BJ.Save.rank(profile, entry);
    profile = BJ.Save.insertScore(profile, entry);
    profile.bank = g.startBank + p.stars;
    profile.totalStars += p.stars;
    BJ.Save.write(profile);
    if (p.stars > 0) ui.toast("+" + p.stars + " ★ saved to the bank", 1600);
    ui.result({
      score: score,
      blocks: p.blocks(),
      stars: p.stars,
      perfect: p.perfects,
      best: profile.best.score,
      rank: rank,
      record: record
    });
    ui.screen("over");
    ui.pauseButton(false);
    g.mode = "over";
    g.finished = true;
    audio.sfx("over");
  }

  function pause(on) {
    if (on && g.mode === "play") {
      g.mode = "pause";
      ui.screen("pause");
      ui.toggles(profile);
      input.forceRelease();
      audio.sfx("ui");
    } else if (!on && g.mode === "pause") {
      g.mode = "play";
      ui.screen(null);
      audio.sfx("ui");
    }
  }

  /* ----------------------------------------------------------------- callbacks */

  function playerCallbacks() {
    return {
      onJump: function (charge) {
        if (g.attract) return;
        audio.sfx("jump", charge);
        dust(g.player.x, g.player.y);
        burst(g.player.x, g.player.y, 3, ["#e6d3b4", "#b99a72"], { speed: 0.9, life: 0.3, grav: 0.05, lift: 0.1 });
      },
      onLand: function (pl, off) {
        if (g.attract) return;
        audio.sfx("land");
        dust(g.player.x, g.player.y);
        g.shake = Math.min(3, (pl.off || 0) + 1.2);
        if (off > 40) ui.toast("Saved it!", 700);
      },
      onPerfect: function (pl) {
        if (g.attract) return;
        audio.sfx("perfect");
        g.shake = 2.4;
        burst(g.player.x, g.player.y, 12, ["#7ee081", "#d8ffd9", "#39b25a"], { speed: 1.8, life: 0.6 });
        floaterAt("PERFECT +50", g.player.x, g.player.y - 34, "perfect");
      },
      onStar: function (st) {
        if (g.attract) return;
        audio.sfx("star");
        g.runStars++;
        burst(st.x, st.y, 8, ["#ffe066", "#fff3b0", "#ffb03a"], { speed: 1.5, life: 0.5 });
        floaterAt("+1", st.x, st.y - 10, "star");
      },
      onPower: function (kind) {
        if (g.attract) return;
        audio.sfx(kind === "shield" ? "shield" : "power");
        g.shake = 2;
        var p = g.player;
        burst(p.x, p.y - 8, 16, ["#ffffff", kind === "shield" ? "#8ec2ff" : kind === "magnet" ? "#8ce8aa" : "#ffb08a"], {
          speed: 2,
          life: 0.6,
          grav: 0.02
        });
        var label = { shield: "SHIELD", boost: "BOOST", magnet: "MAGNET" }[kind];
        floaterAt(label, p.x, p.y - 34, "power");
        ui.toast(label, 1100);
      },
      onShieldSave: function (why) {
        if (g.attract) return;
        audio.sfx("shield");
        g.shake = 3.4;
        ui.toast(why === "fall" ? "SHIELD SAVED YOU" : "SHIELD BLOCKED IT", 1400);
        burst(g.player.x, g.player.y - 8, 18, ["#8ec2ff", "#ffffff", "#4a86e8"], { speed: 2.2, life: 0.7, grav: 0.02 });
      },
      onCrumbleStart: function () {
        if (!g.attract) audio.sfx("crumble");
      },
      onLedgeGone: function () {
        if (!g.attract) ui.toast("LEDGE GONE!", 900);
      },
      onDeath: function (cause) {
        g.deadAt = g.time;
        if (g.attract) return;
        g.shake = 6;
        audio.sfx(cause === "hazard" ? "hit" : "fall");
        var p = g.player;
        burst(p.x, p.y - 8, 26, [C.skins[g.skinIdx].body, C.skins[g.skinIdx].shade, "#ffffff"], {
          speed: 2.6,
          life: 0.9,
          grav: 0.16
        });
      }
    };
  }

  /* --------------------------------------------------------------------- step */

  function step(dt) {
    var p = g.player;
    if (!p) return;
    g.time += dt;
    g.runTime += dt;

    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 12);

    g.world.update(dt, p);

    /* The button is read after the world has ticked, so a release decided here
       takes off at exactly the clock the plan was solved for - the same
       ordering the simulation tests use. */
    var held = false;
    if (g.mode === "play") held = g.auto ? P.botInput(p, g.world, { time: g.world.time }) : input.state.held;
    else if (g.mode === "title" && !g.finished) held = P.botInput(p, g.world, { time: g.world.time });

    P.update(p, dt, g.world, { held: held, pressed: false, released: false }, playerCallbacks());

    /* trail behind an airborne block */
    if (p.state === "air") {
      g.trail.push({ x: p.x, y: p.y });
      if (g.trail.length > 7) g.trail.shift();
    } else if (g.trail.length) {
      g.trail.shift();
    }

    /* particles */
    for (var i = g.particles.length - 1; i >= 0; i--) {
      var pt = g.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        g.particles.splice(i, 1);
        continue;
      }
      pt.vy += pt.grav;
      pt.x += pt.vx;
      pt.y += pt.vy;
    }

    /* camera: lead the player a little, settle fast */
    var lead = p.state === "air" ? Math.max(0, p.vx) * 3 : 0;
    var target = p.x - C.view.w * 0.28 + lead;
    g.camX += (target - g.camX) * Math.min(1, dt * 9);

    /* World streaming: one platform at a time, a few times a second. Level
       generation costs a couple of ms, so it never belongs in every frame. */
    g.genTick = (g.genTick || 0) + 1;
    var lastIdx = g.world.last().i;
    var wantIdx = (p.plat ? p.plat.i : 0) + 3;
    if (lastIdx < wantIdx && g.genTick % 6 === 0) g.world.ensure(lastIdx + 1);
    if (p.plat && p.plat.i % 8 === 0) g.world.prune(g.camX);

    /* biome blend every 40 platforms */
    var bi = p.plat ? Math.floor(p.plat.i / 40) % C.biomes.length : 0;
    if (g.biomeT === 0 && bi !== g.biomeA) {
      g.biomeB = bi;
      g.biomeT = 0.0001;
      if (g.mode === "play") ui.toast(C.biomes[bi].name + " · NEW AREA", 1200);
    }
    if (g.biomeT > 0) {
      g.biomeT = Math.min(1, g.biomeT + dt / 1.6);
      if (g.biomeT >= 1) {
        g.biomeA = g.biomeB;
        g.biomeT = 0;
      }
    }

    /* aim plan for the meter + arc */
    var grounded = p.state === "idle" || p.state === "charge";
    if (grounded && p.plat) {
      var next = g.world.at(p.plat.i + 1);
      var dynamic = p.plat.type === "mover" || (next && next.type === "mover");
      var key = p.plat.i + ":" + p.plat.type + ":" + (dynamic ? g.world.time.toFixed(2) : "");
      if (!g.plan || g.planKey !== key) {
        g.plan = P.plan(p, g.world);
        g.planKey = key;
      }
    } else {
      g.plan = null;
      g.planKey = "";
    }

    /* death -> short beat -> results */
    if (p.state === "dead" && !g.finished && g.time - g.deadAt > (g.attract ? 1.2 : 0.85)) {
      if (g.attract) startAttract();
      else finishRun();
    }
  }

  /* ---------------------------------------------------------------------- hud */

  function hud() {
    var p = g.player;
    if (!p) return;
    var score = P.score(p);
    var chips = [];
    if (p.shield > 0) chips.push({ kind: "shield", label: "SHIELD ×" + p.shield });
    if (p.boostT > 0) chips.push({ kind: "boost", label: "BOOST " + p.boostT.toFixed(1) + "s" });
    if (p.magnetT > 0) chips.push({ kind: "magnet", label: "MAGNET " + p.magnetT.toFixed(1) + "s" });

    var key = [score, p.blocks(), p.stars, g.startBank + p.stars, chips.map((c) => c.label).join()].join("|");
    if (key !== hudCache) {
      hudCache = key;
      ui.setHUD({
        score: score,
        best: Math.max(profile.best.score, score),
        blocks: p.blocks(),
        stars: p.stars,
        bank: g.startBank + p.stars,
        chips: chips
      });
    }

    var grounded = p.state === "idle" || p.state === "charge";
    var showMeter = grounded && g.mode === "play";
    var plan = g.plan;
    var safe = false;
    if (showMeter && plan && plan.feasible && p.state === "charge") {
      safe = p.charge >= plan.cMin && p.charge <= plan.cMax;
    }
    ui.meter({
      visible: showMeter,
      charge: p.state === "charge" ? p.charge : 0,
      window: showMeter && g.aid && plan && plan.feasible,
      cMin: plan ? plan.cMin : 0,
      cMax: plan ? plan.cMax : 0,
      safe: safe,
      fadeHint: g.runTime > 14 || p.jumps > 4
    });
  }

  /* --------------------------------------------------------------------- loop */

  function frame(now) {
    var elapsed = Math.min(0.1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    if (g.mode === "play" || g.mode === "title") {
      acc += elapsed;
      var steps = 0;
      while (acc >= C.step && steps < 6) {
        step(C.step);
        acc -= C.step;
        steps++;
      }
    } else {
      acc = 0;
    }
    renderer.frame(g);
    hud();
    input.endFrame();
    global.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ actions */

  function handleAction(name) {
    audio.unlock();
    audio.sfx("ui");
    if (name === "play" || name === "restart") {
      if (audio.isReady()) audio.startMusic();
      startRun();
    } else if (name === "howto" || name === "shop" || name === "ranks") {
      ui.screen(name);
    } else if (name === "back") {
      ui.screen("title");
    } else if (name === "resume") {
      pause(false);
    } else if (name === "menu") {
      g.mode = "title";
      startAttract();
    }
  }

  function toggle(key) {
    profile.settings[key] = !profile.settings[key];
    if (key === "sfx") audio.setEnabled("sfx", profile.settings.sfx);
    if (key === "music") {
      audio.setEnabled("music", profile.settings.music);
      if (profile.settings.music && audio.isReady()) audio.startMusic();
      if (!profile.settings.music) audio.stopMusic();
    }
    if (key === "aid") {
      g.aid = profile.settings.aid;
      ui.toast(profile.settings.aid ? "AIM AID ON" : "AIM AID OFF", 1200);
    }
    BJ.Save.write(profile);
    ui.toggles(profile);
  }

  function buy(skinId, price) {
    if (profile.owned.indexOf(skinId) >= 0) return;
    if (profile.bank < price) {
      audio.sfx("deny");
      ui.toast("NOT ENOUGH STARS (" + profile.bank + "/" + price + ")", 1500);
      return;
    }
    profile.bank -= price;
    profile.owned.push(skinId);
    profile.skin = skinId;
    BJ.Save.write(profile);
    g.skinIdx = skinIndex();
    audio.sfx("buy");
    ui.refreshShop();
  }

  function equip(skinId) {
    profile.skin = skinId;
    BJ.Save.write(profile);
    g.skinIdx = skinIndex();
    audio.sfx("ui");
    ui.refreshShop();
  }

  function skinIndex() {
    var i = C.skins.findIndex(function (s) {
      return s.id === profile.skin;
    });
    return i < 0 ? 0 : i;
  }

  /* --------------------------------------------------------------------- boot */

  function boot() {
    canvas = doc.getElementById("game");
    stage = doc.getElementById("stage");
    BJ.Pixel.init();
    renderer = BJ.Render.create(canvas);
    audio = BJ.Audio.create();
    profile = BJ.Save.load();

    ui = BJ.UI.create({
      profile: function () {
        return profile;
      },
      action: handleAction,
      toggle: toggle,
      buy: buy,
      equip: equip,
      rename: function (name) {
        profile.name = (name || "PLAYER").toUpperCase().slice(0, 12) || "PLAYER";
        BJ.Save.write(profile);
        ui.refreshRanks();
      }
    });

    input = BJ.Input.create({
      element: stage,
      enabled: function () {
        return g.mode === "play";
      },
      onPress: function () {
        audio.unlock();
        if (g.mode === "play" && audio.isReady()) audio.startMusic();
      }
    });

    g = {
      world: null,
      player: null,
      plan: null,
      planKey: "",
      camX: 0,
      camY: 0,
      time: 0,
      particles: [],
      trail: [],
      shake: 0,
      mode: "title",
      skinIdx: skinIndex(),
      aid: profile.settings.aid,
      biomeA: 0,
      biomeB: 0,
      biomeT: 0,
      attract: true,
      deadAt: 0,
      runTime: 0,
      finished: false,
      runStars: 0,
      startBank: profile.bank
    };

    audio.setEnabled("sfx", profile.settings.sfx);
    audio.setEnabled("music", profile.settings.music);
    g.aid = profile.settings.aid;

    ui.toggles(profile);
    ui.hudVisible(false);
    fit();
    startAttract();
    g.camX = g.player.x - C.view.w * 0.28;
    lastFrame = global.performance.now();
    global.requestAnimationFrame(frame);

    global.addEventListener("resize", fit);
    global.addEventListener("orientationchange", function () {
      global.setTimeout(fit, 120);
    });
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) pause(true);
    });
    global.addEventListener("keydown", function (e) {
      if (e.code === "Escape" || e.code === "KeyP") {
        if (g.mode === "play") pause(true);
        else if (g.mode === "pause") pause(false);
      }
      if (e.code === "Enter" && (g.mode === "title" || g.mode === "over")) handleAction("play");
    });
    doc.getElementById("btn-pause").addEventListener("click", function () {
      pause(true);
    });
  }

  /* Small handle for debugging, automated checks and for driving the game
     from the console (autoplay is also handy for recording footage). */
  BJ.Game = {
    boot: boot,
    state: function () {
      return g;
    },
    profile: function () {
      return profile;
    },
    autoplay: function (on) {
      if (g) g.auto = !!on;
    }
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
