/**
 * Block Jump - player state machine and physics.
 *
 * The loop is deliberately narrow: land, hold to charge, release to jump. The
 * launch angle is fixed, so the charge is the only decision - and the block
 * jumps from exactly where it landed, which is why the arc preview, the level
 * generator and the attract-mode bot can share one maths model.
 *
 * Pure logic - no DOM.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ || (global.BJ = {});
  var M = BJ.Motion;
  var P = BJ.CONFIG.phys;
  var clamp = BJ.clamp;
  var HALF = 8;
  var BODY_H = 16;

  var Player = {
    create: function (opts) {
      opts = opts || {};
      var p = {
        half: HALF,
        h: BODY_H,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        state: "idle",
        plat: null,
        charge: 0,
        chargeStart: 0,
        shield: 0,
        boostT: 0,
        magnetT: 0,
        invulnT: 0,
        squash: 0,
        lean: 0,
        anim: 0,
        stars: 0,
        perfects: 0,
        startX: 0,
        bestX: 0,
        jumps: 0,

        boostMul: function () {
          return p.boostT > 0 ? P.boostMul : 1;
        },
        blocks: function () {
          return Math.max(0, Math.floor((p.bestX - p.startX) / BJ.CONFIG.world.tile));
        },
        reset: function (plat) {
          p.plat = plat;
          p.offset = plat.w - HALF; /* where it stands, from the platform's left edge */
          p.x = plat.x + p.offset;
          p.y = plat.y;
          p.vx = 0;
          p.vy = 0;
          p.state = "idle";
          p.charge = 0;
          p.shield = 0;
          p.boostT = 0;
          p.magnetT = 0;
          p.invulnT = 0;
          p.squash = 0;
          p.lean = 0;
          p.stars = 0;
          p.perfects = 0;
          p.jumps = 0;
          p.startX = p.x;
          p.bestX = p.x;
        },
        /* Ride the platform: while grounded the block keeps its offset, so a
           moving platform carries it along. */
        settle: function () {
          if (!p.plat) return;
          p.offset = clamp(p.offset, HALF, p.plat.w - HALF);
          p.x = p.plat.x + p.offset;
        },
        /* 0..1 power meter at time t, given the moment charging started. */
        chargeAt: function (t) {
          var cyc = (t - p.chargeStart) / P.chargeTime;
          if (cyc < 0) return 0;
          if (!P.chargePingPong) return clamp(cyc, 0, 1);
          var phase = cyc % 2;
          return phase <= 1 ? phase : 2 - phase;
        },
        /* Arc the player would fly right now, for the aim aid. */
        previewArc: function (c) {
          return M.arc(c === undefined ? (p.state === "charge" ? p.charge : 0) : c, p.x, p.y, p.boostMul());
        }
      };

      p.reset(opts.plat);
      return p;
    },

    /**
     * Advance one fixed step.
     *   input: { held, pressed, released }
     *   cb:    optional hooks for juice and scoring
     */
    update: function (p, dt, world, input, cb) {
      cb = cb || {};
      p.anim += dt;

      if (p.invulnT > 0) p.invulnT = Math.max(0, p.invulnT - dt);
      if (p.boostT > 0) p.boostT = Math.max(0, p.boostT - dt);
      if (p.magnetT > 0) p.magnetT = Math.max(0, p.magnetT - dt);

      if (p.state === "dead") {
        p.vy = Math.min(p.vy + P.gravity, P.maxFallSpeed);
        p.y += p.vy;
        if (cb.onDead && p.y > P.deathY) cb.onDead();
        return;
      }

      /* ---- grounded: charge from wherever the block came down ---- */
      if (p.state === "idle") {
        /* The platform we were standing on just crumbled away. */
        if (p.plat && p.plat.gone) {
          p.state = "air";
          p.vx = 0;
          p.vy = 1;
          p.plat = null;
          if (cb.onLedgeGone) cb.onLedgeGone();
          return;
        }
        p.settle();
        p.squash = Math.max(0, p.squash - dt * 4);
        if (input.held) {
          p.state = "charge";
          p.charge = 0;
          p.chargeStart = world.time;
        }
      }

      /* ---- charging ---- */
      if (p.state === "charge") {
        if (p.plat) {
          if (p.plat.gone) {
            p.plat = null;
            p.state = "air";
            p.vx = 0;
            p.vy = 1;
            if (cb.onLedgeGone) cb.onLedgeGone();
            return;
          }
          p.settle();
        }
        p.charge = p.chargeAt(world.time);
        p.squash = p.charge;
        if (!input.held) {
          var v = M.velocityFor(p.charge, p.boostMul());
          p.vx = v.vx;
          p.vy = v.vy;
          p.state = "air";
          p.jumps++;
          p.squash = 0;
          if (cb.onJump) cb.onJump(p.charge);
        }
        return;
      }

      /* ---- airborne ---- */
      if (p.state !== "air") return;

      var px = p.x;
      var py = p.y;
      p.vy = Math.min(p.vy + P.gravity, P.maxFallSpeed);
      p.x += p.vx;
      p.y += p.vy;
      p.lean = clamp(p.vx / 6, -1, 1);
      if (p.bestX < p.x) p.bestX = p.x;

      for (var s = 1; s <= 3; s++) {
        var ft = s / 3;
        var sx = px + (p.x - px) * ft;
        var sy = py + (p.y - py) * ft - BODY_H / 2;
        collectPickups(p, world, sx, sy, cb);
        if (hazardHit(p, world, sx, sy, cb)) return;
      }

      /* ---- landing ---- */
      if (p.vy > 0) {
        var target = null;
        for (var i = 0; i < world.plats.length; i++) {
          var pl = world.plats[i];
          if (pl.gone) continue;
          if (pl.y < py - 0.001 || pl.y > p.y + 0.001) continue;
          if (p.x < pl.x - P.landMargin || p.x > pl.x + pl.w + P.landMargin) continue;
          if (!target || pl.y < target.y) target = pl;
        }
        if (target) {
          p.plat = target;
          /* stay exactly where it came down; the 2.5px landing margin is
             folded back in so the block never hangs off an edge */
          p.offset = clamp(p.x - target.x, HALF, target.w - HALF);
          p.x = target.x + p.offset;
          p.y = target.y;
          p.vx = 0;
          p.vy = 0;
          p.lean = 0;
          p.squash = 1;
          p.state = "idle";
          var off = target.w - HALF - p.offset;
          if (target.type === "crumble" && target.crumbleT < 0) {
            target.crumbleT = 0;
            if (cb.onCrumbleStart) cb.onCrumbleStart(target);
          }
          if (off <= BJ.CONFIG.economy.perfectPx) {
            p.perfects++;
            if (cb.onPerfect) cb.onPerfect(target);
          }
          if (cb.onLand) cb.onLand(target, off);
          return;
        }
      }

      /* ---- shield saves a fall, once ---- */
      if (p.shield > 0 && p.vy > 0 && p.plat && p.y > p.plat.y + 26) {
        p.shield--;
        p.invulnT = P.invulnTime;
        p.settle();
        p.y = p.plat.y;
        p.vx = 0;
        p.vy = 0;
        p.state = "idle";
        if (cb.onShieldSave) cb.onShieldSave("fall");
        return;
      }

      if (p.y > P.deathY) {
        p.state = "dead";
        p.vy = Math.min(p.vy, 4);
        if (cb.onDeath) cb.onDeath("void");
      }
    },

    /* Charge window for the platform the player is standing on. */
    plan: function (p, world) {
      if (!p.plat) return null;
      return world.planJump(p.plat, { mul: p.boostMul(), fromOffset: p.offset });
    },

    /**
     * One button pressed by a machine: the same decision a player makes.
     * Drives the attract-mode demo on the title screen (and the sim tests).
     *   opts.time  take-off time the decision applies to (defaults to now)
     *   opts.aim   "mid" (default) releases inside the window, "early" at its
     *              low edge
     */
    botInput: function (p, world, opts) {
      opts = opts || {};
      if (p.state === "idle") return true;
      if (p.state !== "charge" || !p.plat) return false;
      var plan = world.planJump(p.plat, {
        mul: p.boostMul(),
        samples: opts.samples || 96,
        atTime: opts.time === undefined ? world.time : opts.time,
        fromOffset: p.offset
      });
      if (!plan.feasible) return true; /* hold and wait for the moment */
      if (opts.aim === "early") return !(p.charge >= plan.cMin && p.charge <= plan.cMax);
      var mid = (plan.cMin + plan.cMax) / 2;
      return !(p.charge >= mid && p.charge <= plan.cMax);
    },

    /* Score = distance + stars + clean landings. */
    score: function (p) {
      var e = BJ.CONFIG.economy;
      return p.blocks() * e.scorePerBlock + p.stars * e.scorePerStar + p.perfects * e.scorePerPerfect;
    }
  };

  function collectPickups(p, world, sx, sy, cb) {
    for (var i = 0; i < world.plats.length; i++) {
      var pl = world.plats[i];
      if (pl.gone) continue;
      for (var s = 0; s < pl.stars.length; s++) {
        var st = pl.stars[s];
        if (st.taken) continue;
        if (Math.abs(st.x - sx) < 10 && Math.abs(st.y - sy) < 11) {
          st.taken = true;
          p.stars++;
          if (cb.onStar) cb.onStar(st);
        }
      }
      var pu = pl.powerup;
      if (pu && !pu.taken && Math.abs(pu.x - sx) < 11 && Math.abs(pu.y - sy) < 12) {
        pu.taken = true;
        if (pu.kind === "shield") p.shield = Math.min(2, p.shield + 1);
        if (pu.kind === "boost") p.boostT = P.boostTime;
        if (pu.kind === "magnet") p.magnetT = P.magnetTime;
        if (cb.onPower) cb.onPower(pu.kind);
      }
    }
  }

  function hazardHit(p, world, sx, sy, cb) {
    if (p.invulnT > 0) return false;
    var reach = P.hazardRadius + P.playerRadius;
    for (var i = 0; i < world.plats.length; i++) {
      var pl = world.plats[i];
      if (pl.gone || !pl.hazards.length) continue;
      for (var h = 0; h < pl.hazards.length; h++) {
        var hz = pl.hazards[h];
        var hx = hz.cx === undefined ? hz.x : hz.cx;
        var hy = hz.cy === undefined ? hz.y : hz.cy;
        if (Math.hypot(hx - sx, hy - sy) < reach) {
          if (p.shield > 0) {
            p.shield--;
            p.invulnT = P.invulnTime;
            if (cb.onShieldSave) cb.onShieldSave("crash");
            return false;
          }
          p.state = "dead";
          p.vy = Math.min(p.vy, 2);
          if (cb.onDeath) cb.onDeath("hazard");
          return true;
        }
      }
    }
    return false;
  }

  BJ.Player = Player;
})(typeof globalThis !== "undefined" ? globalThis : this);
