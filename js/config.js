/**
 * Block Jump - tuning constants, palettes and skins.
 *
 * Pure data + math: loaded as a plain script in the browser and required
 * by the Node simulation tests, so it must never touch the DOM.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ || (global.BJ = {});

  var DEG = Math.PI / 180;

  BJ.CONFIG = {
    /* Internal render resolution (the canvas is letterboxed up from this). */
    view: { w: 480, h: 270 },

    /* Fixed simulation step, in seconds. */
    step: 1 / 60,

    phys: {
      gravity: 0.46, // px / step^2
      angle: 64 * DEG, // launch angle, fixed - only the charge varies
      v0Min: 4.6, // px / step at a tap
      v0Max: 9.9, // px / step at a full 0.75s charge
      chargeTime: 0.75, // seconds from tap to full charge
      chargeEase: 0.8, // c^ease, keeps the low-charge end readable
      /* Holding past a full charge lets the power meter swing back down, so a
         player can wait for a moving platform without being stuck at maximum. */
      chargePingPong: true,
      maxFallSpeed: 8, // terminal velocity, px / step
      landMargin: 2.5, // px of forgiveness at platform edges
      hazardRadius: 6.5,
      playerRadius: 6,
      deathY: 340,
      boostMul: 1.22, // jump speed multiplier while Boost is active
      boostTime: 8, // seconds
      invulnTime: 1.1, // seconds of invulnerability after a shield save
      magnetTime: 8,
      magnetRange: 92,
      magnetPull: 0.55 // px / step^2 toward the player
    },

    world: {
      groundY: 196, // default platform top surface
      heights: [176, 188, 200, 212], // allowed top surfaces
      maxStepUp: 26, // max height change between neighbouring platforms
      platMinTiles: 2,
      platMaxTiles: 6,
      tile: 16,
      gapMinEasy: 30,
      gapMaxEasy: 64,
      gapMinHard: 52,
      gapMaxHard: 128,
      rampFrom: 6, // platforms before difficulty starts to bite
      rampLength: 56, // platforms to reach full difficulty
      windowMin: 0.06, // narrowest acceptable charge window on a hazard jump
      windowPlainMin: 0.045, // ... and on an empty jump
      windowMoverMin: 0.11, // ... and when the landing platform itself moves
      hazardFrom: 10,
      moverFrom: 26,
      crumbleFrom: 18,
      breatherEvery: 16,
      spawnX: 64
    },

    economy: {
      scorePerBlock: 1,
      scorePerStar: 25,
      scorePerPerfect: 50,
      perfectPx: 7 // land within this many px of the ledge
    },

    /* Character skins. Prices are in stars (the in-run currency). */
    skins: [
      { id: "orange", name: "橙子 Orange", price: 0, body: "#e08a3c", shade: "#a85f22", light: "#f6b56b", eye: "#2b1a0d" },
      { id: "ice", name: "蓝冰 Ice", price: 150, body: "#5aa9e8", shade: "#2f6fa8", light: "#9ad4f6", eye: "#0e2130" },
      { id: "leaf", name: "翠绿 Leaf", price: 300, body: "#66bb4a", shade: "#3d8a2c", light: "#a5e37f", eye: "#12240d" },
      { id: "violet", name: "暗紫 Violet", price: 600, body: "#9a6ce0", shade: "#6a45a8", light: "#c6a4f6", eye: "#1c1030" },
      { id: "gold", name: "黄金 Gold", price: 900, body: "#e8c247", shade: "#a8891f", light: "#fbe89a", eye: "#2e2306" },
      { id: "sakura", name: "樱花 Sakura", price: 1400, body: "#f078a8", shade: "#b04a76", light: "#ffb6d0", eye: "#3a0d20" },
      { id: "obsidian", name: "黑曜 Obsidian", price: 2000, body: "#3c3c4c", shade: "#23232e", light: "#5e5e74", eye: "#ff4d4d" },
      { id: "rainbow", name: "彩虹 Rainbow", price: 3000, body: "#ff5a5a", shade: "#8a2a8a", light: "#ffe066", eye: "#101020", rainbow: true }
    ],

    /* Background themes, cycled as the run gets longer. */
    biomes: [
      {
        id: "night",
        name: "NIGHT",
        sky: ["#080c17", "#101728", "#1b2540"],
        star: "#ffe9a8",
        cloud: "#1d2a45",
        cloudLight: "#2a3b5e",
        mountainFar: "#0b1220",
        mountainNear: "#111b2e",
        grass: "#6db32e",
        grassLight: "#93d24d",
        grassDark: "#417a1e",
        dirt: "#8a5a2f",
        dirtDark: "#5c3a1c",
        cobble: "#4b505c",
        cobbleDark: "#282c36"
      },
      {
        id: "dusk",
        name: "DUSK",
        sky: ["#2a1c3c", "#8c3f4a", "#e08a4a"],
        star: "#ffe0b0",
        cloud: "#5a3352",
        cloudLight: "#7d4a63",
        mountainFar: "#3a2340",
        mountainNear: "#241426",
        grass: "#6fae2f",
        grassLight: "#94cc4c",
        grassDark: "#3f761d",
        dirt: "#7d4f2a",
        dirtDark: "#523218",
        cobble: "#4a4550",
        cobbleDark: "#2a2630"
      },
      {
        id: "cave",
        name: "CAVE",
        sky: ["#100a20", "#1d1136", "#301c52"],
        star: "#a9d8ff",
        cloud: "#2b1c48",
        cloudLight: "#3d2a63",
        mountainFar: "#221541",
        mountainNear: "#170e2c",
        grass: "#4fa8a0",
        grassLight: "#78d6cc",
        grassDark: "#2d6f6a",
        dirt: "#6a4a7a",
        dirtDark: "#432e4e",
        cobble: "#474056",
        cobbleDark: "#262231"
      }
    ]
  };

  /**
   * Jump maths. The launch angle is fixed, so every jump is fully described
   * by its charge: charge -> take-off speed -> a single deterministic arc.
   *
   * The formulas below are the *closed form of the fixed-step integrator*
   * used by the player (velocity first, then position, with a terminal
   * velocity clamp), not a continuous-time approximation. That matters: the
   * generator, the aim preview and the bot all have to predict exactly where
   * a real jump lands, to the pixel and the step.
   */
  var Motion = {
    cfg: function () {
      return BJ.CONFIG.phys;
    },

    /* Charge in [0,1] -> take-off speed in px/step. */
    v0For: function (c, mul) {
      var p = BJ.CONFIG.phys;
      c = c < 0 ? 0 : c > 1 ? 1 : c;
      var e = Math.pow(c, p.chargeEase);
      return (p.v0Min + (p.v0Max - p.v0Min) * e) * (mul || 1);
    },

    /* Take-off velocity components for a charge. */
    velocityFor: function (c, mul) {
      var p = BJ.CONFIG.phys;
      var v0 = Motion.v0For(c, mul);
      return { vx: v0 * Math.cos(p.angle), vy: -v0 * Math.sin(p.angle), v0: v0 };
    },

    /* Horizontal distance of a flat jump (exact, in steps). */
    rangeFor: function (c, mul) {
      return Motion.rangeSteps(c, mul) * Motion.velocityFor(c, mul).vx;
    },

    /* Height gained at the apex. */
    peakFor: function (c, mul) {
      var v = Motion.velocityFor(c, mul);
      return Math.abs(Motion.yAt(Motion.arc(c, 0, 0, mul), Math.ceil(-v.vy / Motion.cfg().gravity)));
    },

    /**
     * Build an arc starting at (x0, y0) - y0 is the bottom of the block.
     */
    arc: function (c, x0, y0, mul) {
      var p = BJ.CONFIG.phys;
      var v = Motion.velocityFor(c, mul);
      return { x0: x0, y0: y0, vx: v.vx, vy: v.vy, g: p.gravity, maxFall: p.maxFallSpeed, c: c };
    },

    /* First step index at which the falling velocity starts being clamped. */
    clampStep: function (arc) {
      var m = Math.ceil((arc.maxFall - arc.vy) / arc.g);
      return m < 1 ? 1 : m;
    },

    /* Bottom edge of the block after n steps. */
    yAt: function (arc, n) {
      if (n <= 0) return arc.y0;
      var m = Motion.clampStep(arc);
      if (n < m) return arc.y0 + n * arc.vy + 0.5 * arc.g * n * (n + 1);
      var k = m - 1;
      return arc.y0 + k * arc.vy + 0.5 * arc.g * k * (k + 1) + arc.maxFall * (n - k);
    },

    xAt: function (arc, n) {
      return arc.x0 + arc.vx * n;
    },

    pointAt: function (arc, n) {
      return { x: Motion.xAt(arc, n), y: Motion.yAt(arc, n) };
    },

    /* Step index at which the arc is at its highest point. */
    apexStep: function (arc) {
      var n = Math.ceil(-arc.vy / arc.g);
      return n < 1 ? 1 : n;
    },

    /**
     * First step index n > apexStep at which the arc is at or below surface
     * y = targetY (descending crossing), or -1 if it never gets there.
     */
    stepsToSurface: function (arc, targetY) {
      var dy = targetY - arc.y0;
      var disc = arc.vy * arc.vy + 2 * arc.g * dy;
      if (disc < 0) return -1;
      var est = (-arc.vy + Math.sqrt(disc)) / arc.g;
      var start = Math.max(Motion.apexStep(arc), Math.floor(est) - 4);
      var end = Math.ceil(est) + 6;
      for (var n = start; n <= end; n++) {
        if (Motion.yAt(arc, n) >= targetY - 1e-9) return n;
      }
      return -1;
    },

    /* Steps of a flat jump (same height), for range maths. */
    rangeSteps: function (c, mul) {
      return Motion.stepsToSurface(Motion.arc(c, 0, 0, mul), 0);
    },

    /* Longest / shortest flat jump in px, used to sanity-check the tuning. */
    flatRange: function (c, mul) {
      return Motion.rangeFor(c, mul);
    }
  };

  BJ.Motion = Motion;

  /* Deterministic PRNG so runs and tests are reproducible from a seed. */
  BJ.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  BJ.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  BJ.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
