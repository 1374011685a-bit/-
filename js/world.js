/**
 * Block Jump - procedural level generation.
 *
 * Every gap is validated at generation time with the same analytic solver the
 * aim preview and the attract-mode bot use, so a level can never contain a
 * jump that has no solution - "always one step within reach".
 *
 * Pure logic, no DOM, so the Node simulation tests can drive it directly.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ || (global.BJ = {});
  var M = BJ.Motion;
  var lerp = BJ.lerp;
  var clamp = BJ.clamp;

  var HALF = 8; // half of the block sprite
  var DT = 1 / 60;

  /* Distance from a point to a segment - hazards that oscillate are treated
     as their full sweep band, which makes validity phase-independent. */
  function segDist(px, py, x0, y0, x1, y1) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var len2 = dx * dx + dy * dy;
    var t = 0;
    if (len2 > 0) {
      t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  }

  function hazardBand(h) {
    if (h.axis === "y" && h.amp) return { x0: h.x, y0: h.y - h.amp, x1: h.x, y1: h.y + h.amp };
    if (h.axis === "x" && h.amp) return { x0: h.x - h.amp, y0: h.y, x1: h.x + h.amp, y1: h.y };
    return { x0: h.x, y0: h.y, x1: h.x, y1: h.y };
  }

  /**
   * The places on a platform the block can be standing when it takes off.
   * Since it lands wherever it likes and then stays put, a jump is only fair
   * if every one of these positions has a usable solution - so the generator
   * and the tests both sweep this exact list.
   */
  function jumpOffsets(plat, step) {
    step = step || 4;
    var out = [];
    var last = plat.w - HALF;
    for (var o = HALF; o < last; o += step) out.push(o);
    out.push(last);
    return out;
  }

  /**
   * Is a jump fair from *every* place the block could be standing on `from`?
   *
   * The block lands wherever it likes and then stays put, so a level is only
   * honest if each of those positions has a comfortable solution. Returns the
   * solve for the far-left position (the hardest one) and for the middle
   * position, which the generator uses to place pickups.
   */
  function validateJump(from, to, hazards, opts) {
    opts = opts || {};
    var cfg = BJ.CONFIG.world;
    var isMover = to.type === "mover" && to.amp > 0;
    var offs = opts.offsets || jumpOffsets(from, opts.offsetStep || (isMover ? 8 : 4));
    /* The hardest standing spot keeps the comfy bar; every other spot only has
       to be honestly playable, which is what keeps traps and moving platforms
       common enough to matter. */
    var need = hazards && hazards.length ? cfg.windowMin : cfg.windowPlainMin;
    if (isMover) need = Math.max(need, cfg.windowMoverMin);
    var restNeed = cfg.windowPlainMin;
    var samples = opts.samples || 64;
    var time = opts.time || 0;

    function solveAt(offset, atTime) {
      return Jump.solve(from, to, {
        time: time,
        atTime: atTime,
        hazards: hazards || [],
        needTime: 0.3,
        samples: samples,
        fromOffset: offset
      });
    }

    /* Far-left standing spot, with a full phase sweep for moving targets. */
    var worst = solveAt(offs[0]);
    if (!worst.feasible || worst.window < need) return { ok: false, at: offs[0], reason: "window" };
    if (isMover && worst.usable < 0.2) return { ok: false, at: offs[0], reason: "catch-time" };

    var mid = offs[Math.floor((offs.length - 1) / 2)];
    var ref = worst;
    var phases = null;
    if (isMover) {
      var span = (2 * Math.PI) / to.omega;
      phases = [0.25, 0.5, 0.75].map(function (f) {
        return time + span * f;
      });
    }

    /* Check the two extremes first: a layout that cannot work fails there, and
       failing fast is what makes it affordable to try many trap placements. */
    var order = [];
    if (offs.length > 1) order.push(offs.length - 1);
    for (var k = 1; k < offs.length - 1; k++) order.push(k);

    for (var oi = 0; oi < order.length; oi++) {
      var i = order[oi];
      var list = phases || [null];
      for (var j = 0; j < list.length; j++) {
        var s = solveAt(offs[i], list[j] === null ? undefined : list[j]);
        if (!s.feasible || s.window < restNeed) return { ok: false, at: offs[i], reason: "offset" };
        if (offs[i] === mid && j === 0) ref = s;
      }
    }
    return { ok: true, worst: worst, ref: ref, offsets: offs.length };
  }

  var Jump = {
    half: HALF,
    hazardBand: hazardBand,
    offsets: jumpOffsets,
    validate: function (from, to, hazards, opts) {
      return validateJump(from, to, hazards, opts);
    },

    /**
     * Solve the jump from platform `from` onto platform `to`.
     *
     * opts:
     *   mul       boost multiplier on the take-off speed
     *   samples   charge samples
     *   time      world clock (seconds), used for moving platforms
     *   hazards   obstacles that must be avoided
     *   needTime  minimum duration of a usable take-off window for movers
     *   atTime    solve for this exact take-off time only
     *   fromOffset  where on the source platform the block is standing,
     *               measured from its left edge (defaults to the far ledge)
     */
    solve: function (from, to, opts) {
      opts = opts || {};
      var p = BJ.CONFIG.phys;
      var mul = opts.mul || 1;
      var samples = opts.samples || 120;
      var needTime = opts.needTime || 0;
      var hazards = opts.hazards || [];
      var time = opts.time || 0;
      var fromOffset = opts.fromOffset === undefined ? from.w - HALF : clamp(opts.fromOffset, HALF, from.w - HALF);

      var x0 = from.x + fromOffset;
      var y0 = from.y;
      var moving = to.type === "mover" && to.amp > 0;

      /* Take-off times worth testing: a static target needs only one. */
      var times = [0];
      var phaseDt = 0.05;
      if (opts.atTime !== undefined && opts.atTime !== null) {
        times = [opts.atTime];
        phaseDt = 1 / 60;
      } else if (moving) {
        times = [];
        var span = (2 * Math.PI) / to.omega;
        var nPhase = clamp(Math.round(span / phaseDt), 12, 56);
        phaseDt = span / nPhase;
        for (var i = 0; i <= nPhase; i++) times.push(time + i * phaseDt);
      }

      /* A moving platform under the player's feet shifts the take-off point,
         so the launch x has to be recomputed for every take-off time. */
      var srcMoving = from.type === "mover" && from.amp > 0;
      function sourceXAt(t) {
        return srcMoving ? from.baseX + from.amp * Math.sin(from.omega * t + from.phase) + fromOffset : x0;
      }

      var windows = []; // {t0, cMin, cMax, len}

      for (var ti = 0; ti < times.length; ti++) {
        var t0 = times[ti];
        var runStart = -1;
        var xs = sourceXAt(t0);

        for (var s = 0; s <= samples; s++) {
          var c = s / samples;
          var arc = M.arc(c, xs, y0, mul);
          var nLand = M.stepsToSurface(arc, to.y);
          var ok = nLand > 0;

          if (ok) {
            var landX = M.xAt(arc, nLand);
            var toX = to.baseX + (moving ? to.amp * Math.sin(to.omega * (t0 + nLand * DT) + to.phase) : 0);
            ok = landX >= toX + p.landMargin && landX <= toX + to.w - p.landMargin;

            /* Never launch into the side wall of a taller platform. */
            if (ok && to.y < y0) {
              var nEdge = Math.ceil((toX - arc.x0) / arc.vx);
              if (nEdge > 0 && nEdge < nLand && M.yAt(arc, nEdge) > to.y + p.landMargin) ok = false;
            }

            /* Obstacles must leave a way through. */
            if (ok && hazards.length) {
              /* Slack covers both the sampling spacing and the fact that a
                 moving platform's take-off point can shift by a frame. */
              var clear = p.hazardRadius + p.playerRadius + 4;
              for (var h = 0; h < hazards.length && ok; h++) {
                var band = hazardBand(hazards[h]);
                for (var k = 1; k <= 26; k++) {
                  var pt = M.pointAt(arc, Math.max(1, Math.round((nLand * k) / 26)));
                  /* pt is the bottom of the block; collisions are tested
                     against its centre. */
                  if (segDist(pt.x, pt.y - HALF, band.x0, band.y0, band.x1, band.y1) < clear) {
                    ok = false;
                    break;
                  }
                }
              }
            }
          }

          if (ok) {
            if (runStart < 0) runStart = c;
          } else if (runStart >= 0) {
            windows.push({ t0: t0, cMin: runStart, cMax: (s - 1) / samples, len: (s - 1) / samples - runStart });
            runStart = -1;
          }
        }
        if (runStart >= 0) windows.push({ t0: t0, cMin: runStart, cMax: 1, len: 1 - runStart });
      }

      if (!windows.length) return { feasible: false, window: 0 };

      var bestWin = windows[0];
      for (var v = 1; v < windows.length; v++) {
        if (windows[v].len > bestWin.len + 1e-6) bestWin = windows[v];
      }

      var t0Chosen = bestWin.t0;
      var usable = 0;
      if (moving) {
        /* A moving platform is catchable only during part of its cycle. Keep
           the take-off times inside a stretch that lasts long enough to be
           playable, and among those pick the one with the widest charge
           window - the easiest moment, reached by simply waiting. */
        var hasAt = {};
        for (var b = 0; b < windows.length; b++) hasAt[windows[b].t0.toFixed(4)] = true;

        var runMin = Math.max(needTime, 0.2);
        var runs = [];
        var run = 0;
        var runStartT = times[0];
        for (var q = 0; q < times.length; q++) {
          if (hasAt[times[q].toFixed(4)]) {
            if (run === 0) runStartT = times[q];
            run += phaseDt;
          } else {
            if (run > 0) runs.push({ start: runStartT, len: run });
            run = 0;
          }
        }
        if (run > 0) runs.push({ start: runStartT, len: run });

        var pick = null;
        for (var r = 0; r < runs.length; r++) {
          if (runs[r].len < runMin) continue;
          for (var wi = 0; wi < windows.length; wi++) {
            var ww = windows[wi];
            if (ww.t0 < runs[r].start - 1e-6 || ww.t0 > runs[r].start + runs[r].len + 1e-6) continue;
            if (!pick || ww.len > pick.win.len + 1e-6) {
              pick = { win: ww, run: runs[r], t0: ww.t0 };
            }
          }
        }
        if (pick) {
          t0Chosen = pick.t0;
          usable = pick.run.len;
        } else {
          /* Nothing comfortable exists: report the best we have so the
             generator can reject this layout. */
          var widest = 0;
          for (var wq = 0; wq < runs.length; wq++) widest = Math.max(widest, runs[wq].len);
          usable = widest;
          t0Chosen = bestWin.t0;
        }
      }

      var at = null;
      for (var w = 0; w < windows.length; w++) {
        if (Math.abs(windows[w].t0 - t0Chosen) < 1e-6 && (!at || windows[w].len > at.len)) at = windows[w];
      }
      if (!at) at = bestWin;

      /* The comfortable charge is the middle of the window. */
      var cMid = (at.cMin + at.cMax) / 2;
      var xMid = sourceXAt(t0Chosen);
      var arcMid = M.arc(cMid, xMid, y0, mul);
      var nMid = M.stepsToSurface(arcMid, to.y);

      return {
        feasible: true,
        window: at.len,
        cMin: at.cMin,
        cMax: at.cMax,
        charge: cMid,
        nLand: nMid,
        steps: nMid,
        landX: M.xAt(arcMid, nMid),
        wait: moving ? t0Chosen - time : 0,
        usable: usable,
        takeoffX: xMid,
        takeoffY: y0,
        fromOffset: fromOffset,
        takeoffTime: moving ? t0Chosen : time
      };
    },

    /* Arc for a given charge from a platform's ledge. */
    arcFrom: function (from, c, mul) {
      return M.arc(c, from.x + from.w - HALF, from.y, mul);
    }
  };

  var World = {
    Jump: Jump,
    validateJump: validateJump,

    /**
     * Create a world. `seed` makes a run reproducible, which is what the
     * simulation tests rely on.
     */
    create: function (seed, opts) {
      opts = opts || {};
      var w = BJ.CONFIG.world;
      var rnd = BJ.rng(seed || 1);

      var world = {
        seed: seed,
        rng: rnd,
        time: 0,
        plats: [],
        base: 0, /* index (i) of plats[0] */
        stats: { hazards: 0, movers: 0, crumbles: 0, stars: 0, powerups: 0, fallbacks: 0 },
        onCrumble: opts.onCrumble || null
      };

      world.difficulty = function (i) {
        return clamp((i - w.rampFrom) / w.rampLength, 0, 1);
      };

      world.plats.push({
        i: 0,
        x: w.spawnX,
        baseX: w.spawnX,
        y: w.groundY,
        w: 5 * w.tile,
        gap: 0,
        type: "solid",
        amp: 0,
        omega: 0,
        phase: 0,
        crumbleTime: 1,
        crumbleT: -1,
        gone: false,
        stars: [],
        powerup: null,
        hazards: [],
        solved: null
      });

      world.last = function () {
        return world.plats[world.plats.length - 1];
      };

      /* Platform by absolute index - safe across pruning. */
      world.at = function (i) {
        var k = i - world.base;
        return k >= 0 && k < world.plats.length ? world.plats[k] : null;
      };

      /* Make sure platform `i` exists. */
      world.ensure = function (i) {
        var guard = 0;
        while (world.last().i < i && guard++ < 2000) {
          world.plats.push(world.makeNext());
        }
      };

      world.makeNext = function () {
        var prev = world.last();
        var i = prev.i + 1;
        var d = world.difficulty(i);
        var breather = i % w.breatherEvery === 0;

        var allowHazard = !breather && i >= w.hazardFrom;
        var allowMover = !breather && i >= w.moverFrom;
        var allowCrumble = !breather && i >= w.crumbleFrom;

        /* A crumbling ledge leaves no room to wait, so the jump after it is
           always a short, empty, solid one. */
        var afterCrumble = prev.type === "crumble";
        if (afterCrumble) {
          allowHazard = false;
          allowMover = false;
          allowCrumble = false;
        }

        var cand = null;
        var solved = null;
        var refSolve = null;

        /* The block jumps from wherever it landed, so the level has to be
           solvable from every spot it could be standing on this platform. */
        var validate = function (to, hazards, opts) {
          opts = opts || {};
          var res = validateJump(prev, to, hazards || [], {
            time: world.time,
            samples: opts.samples || 64,
            offsetStep: opts.offsetStep
          });
          if (res.ok) {
            solved = res.worst;
            refSolve = res.ref;
          }
          return res.ok;
        };

        /* Screening pass: a coarser sweep over standing positions, used inside
           the retry loops. Anything that survives it is confirmed at full
           resolution before it is kept. */
        var screen = function (to, hazards) {
          /* three spots only: the far left, the middle and the far right, which
             is where these jumps break */
          var spots = [HALF, prev.w / 2, prev.w - HALF];
          return validate(to, hazards, { samples: 36, offsets: spots });
        };
        var confirm = function (to, hazards) {
          return validate(to, hazards, { samples: 72, offsetStep: 4 });
        };
        /* Longest horizontal reach of a full charge, minus the distance the
           block already has to cover to its own right edge. */
        var gapCap = Math.max(26, BJ.Motion.rangeFor(1, 1) - 12 - (prev.w - HALF));

        /* Step 1: place the platform itself, with no obstacles in the way.
           Reroll the layout if it cannot be jumped at all. */
        for (var attempt = 0; attempt < 12 && !(solved && solved.feasible); attempt++) {
          var ease = attempt / 12; /* progressively retreat to a kind jump */
          var tiles = Math.round(lerp(5, 2.4, d) + (rnd() * 1.5 - 0.6));
          var gap = lerp(lerp(w.gapMinEasy, w.gapMinHard, d), lerp(w.gapMaxEasy, w.gapMaxHard, d), rnd());

          /* Rhythm: follow a long jump with a shorter one. */
          if (prev.gap > lerp(w.gapMaxEasy, w.gapMaxHard, world.difficulty(i - 1)) * 0.82) gap *= 0.72;
          if (afterCrumble) gap *= 0.62;
          if (breather) {
            tiles = 6;
            gap *= 0.6;
          }
          gap *= 1 - ease * 0.5;
          tiles = Math.min(6, Math.round(tiles + ease * 2));
          /* a wider platform gives the block a longer run-up, so it can only
             afford a shorter gap */
          gap = Math.min(gap, gapCap);

          var y = prev.y;
          if (rnd() < 0.5) {
            var options = w.heights.filter(function (h) {
              return Math.abs(h - prev.y) <= w.maxStepUp;
            });
            y = options[Math.floor(rnd() * options.length) % options.length];
          }

          var type = "solid";
          if (allowMover && rnd() < lerp(0, 0.22, d)) type = "mover";
          else if (allowCrumble && rnd() < lerp(0.04, 0.2, d)) type = "crumble";
          if (ease > 0.45) type = "solid";

          cand = {
            i: i,
            x: prev.x + prev.w + gap,
            baseX: prev.x + prev.w + gap,
            y: y,
            w: clamp(tiles, w.platMinTiles, w.platMaxTiles) * w.tile,
            gap: gap,
            type: type,
            amp: 0,
            omega: 0,
            phase: rnd() * Math.PI * 2,
            crumbleTime: lerp(1.15, 0.85, d),
            crumbleT: -1,
            gone: false,
            stars: [],
            powerup: null,
            hazards: [],
            solved: null
          };

          if (type === "mover") {
            cand.amp = lerp(14, 26, d);
            cand.omega = 1.5 + rnd() * 0.5;
          }

          if (!screen(cand, [])) {
            solved = { feasible: false };
          }
        }

        /* The layout survived a coarse pass; confirm it at full resolution
           before anything is placed on it. */
        if (solved && solved.feasible && !confirm(cand, [])) {
          solved = { feasible: false };
        }

        /* Step 2: drop obstacles into the gap and keep only placements that
           still leave a fair way through from every standing position. */
        if (solved && solved.feasible && allowHazard && rnd() < lerp(0.16, 0.62, d)) {
          var gapStart = prev.x + prev.w;
          var gapLen = cand.baseX - gapStart;
          if (gapLen >= 46) {
            var tries = 0;
            var kept = null;
            while (tries++ < 18 && !kept) {
              var set = [];
              var count = rnd() < lerp(0.12, 0.32, d) ? 2 : 1;
              for (var hi = 0; hi < count; hi++) {
                var lane = (gapLen - 34) / count;
                /* walk the placement across the gap instead of re-rolling it:
                   each try is a genuinely different geometry */
                var across = ((tries - 1) % 6) / 5;
                var hx = gapStart + 18 + (gapLen - 34) * (0.16 + 0.68 * across) + rnd() * 6;
                hx += lane * hi;
                hx = clamp(hx, gapStart + 18, gapStart + gapLen - 16);
                var axis = rnd() < 0.55 ? "y" : "x";
                var amp = axis === "y" ? lerp(9, 18, rnd()) : lerp(8, 15, rnd());
                set.push({
                  x: hx,
                  /* Heights sweep upward as well: a low obstacle blocks the
                     flat arcs used from a standing spot near the right edge,
                     a high one blocks the long arcs from the far left. Some
                     height in between leaves room to thread past. */
                  y: Math.min(prev.y, cand.y) - (22 + ((tries - 1) % 5) * 9 + rnd() * 8),
                  axis: axis,
                  amp: amp,
                  omega: 0.9 + rnd() * 0.7,
                  phase: rnd() * Math.PI * 2,
                  spin: rnd() < 0.5 ? 1 : -1,
                  kind: rnd() < 0.5 ? "ball" : "saw"
                });
              }
              if (screen(cand, set) && confirm(cand, set)) {
                /* ... and it must not spoil the jump that lands on `prev`. */
                var back = prev.i > 0 ? world.at(prev.i - 1) : null;
                var okBack = true;
                if (back) {
                  okBack =
                    validateJump(back, prev, set, {
                      time: world.time,
                      samples: 36,
                      offsets: [HALF, back.w / 2, back.w - HALF]
                    }).ok && validateJump(back, prev, set, { time: world.time, samples: 72 }).ok;
                }
                if (okBack) kept = set;
              }
            }
            if (kept) {
              cand.hazards = kept;
              validate(cand, kept, { samples: 88 }); /* re-solve with the obstacles in place */
            }
          }
        }

        if (!solved || !solved.feasible) {
          /* Guaranteed fallback: short, wide, empty jump. */
          cand.x = cand.baseX = prev.x + prev.w + lerp(30, 44, d);
          cand.gap = cand.x - (prev.x + prev.w);
          cand.y = prev.y;
          cand.w = 6 * w.tile;
          cand.type = "solid";
          cand.amp = 0;
          cand.hazards = [];
          if (!validate(cand, [], { samples: 96 })) {
            solved = Jump.solve(prev, cand, { time: world.time, samples: 96, fromOffset: HALF });
            world.stats.fallbacks++;
          }
        }

        cand.solved = solved;
        if (cand.type === "mover") world.stats.movers++;
        if (cand.type === "crumble") world.stats.crumbles++;
        world.stats.hazards += cand.hazards.length;

        /* Stars ride a comfortable arc from the middle of the platform, which
           is where the block most often comes down. */
        var ref = refSolve;
        if (!ref.feasible) ref = solved;
        var arc = M.arc(ref.charge, ref.takeoffX, ref.takeoffY, 1);
        var nLand = ref.nLand;
        var nStars = cand.hazards.length ? (rnd() < 0.5 ? 1 : 2) : rnd() < 0.35 ? 3 : rnd() < 0.75 ? 2 : 1;
        if (breather) nStars = 3;
        var fracs = nStars === 1 ? [0.55] : nStars === 2 ? [0.4, 0.68] : [0.32, 0.52, 0.72];
        for (var si = 0; si < nStars; si++) {
          var pt = M.pointAt(arc, Math.max(1, Math.round(nLand * fracs[si])));
          cand.stars.push({ x: pt.x, y: pt.y - 5, taken: false, bob: rnd() * Math.PI * 2 });
          world.stats.stars++;
        }

        /* Power-ups: rare, always sitting on a reachable arc. */
        if (i >= 8 && rnd() < 0.09) {
          var roll = rnd();
          var kind = roll < 0.42 ? "shield" : roll < 0.72 ? "magnet" : "boost";
          var pu = M.pointAt(arc, Math.max(1, Math.round(nLand * 0.5)));
          cand.powerup = { x: pu.x, y: pu.y - 6, kind: kind, taken: false, bob: rnd() * Math.PI * 2 };
          world.stats.powerups++;
        }

        return cand;
      };

      /* Advance world objects. `player` is needed for the magnet pull. */
      world.update = function (dt, player) {
        world.time += dt;
        var magnet = player && player.magnetT > 0 && player.state !== "dead";

        for (var i = 0; i < world.plats.length; i++) {
          var pl = world.plats[i];
          if (pl.type === "mover") pl.x = pl.baseX + pl.amp * Math.sin(pl.omega * world.time + pl.phase);

          if (pl.hazards.length) {
            for (var h = 0; h < pl.hazards.length; h++) {
              var hz = pl.hazards[h];
              var o = hz.amp ? hz.amp * Math.sin(hz.omega * world.time + hz.phase) : 0;
              hz.cx = hz.x + (hz.axis === "x" ? o : 0);
              hz.cy = hz.y + (hz.axis === "y" ? o : 0);
            }
          }

          if (pl.type === "crumble" && pl.crumbleT >= 0 && !pl.gone) {
            pl.crumbleT += dt;
            if (pl.crumbleT >= pl.crumbleTime) {
              pl.gone = true;
              if (world.onCrumble) world.onCrumble(pl);
            }
          }

          if (magnet) {
            for (var s = 0; s < pl.stars.length; s++) {
              var st = pl.stars[s];
              if (st.taken) continue;
              pull(st, player, BJ.CONFIG.phys.magnetPull);
            }
            if (pl.powerup && !pl.powerup.taken) pull(pl.powerup, player, BJ.CONFIG.phys.magnetPull * 0.7);
          }
        }
      };

      function pull(obj, player, force) {
        var dx = player.x - obj.x;
        var dy = player.y - 8 - obj.y;
        var dist = Math.hypot(dx, dy);
        if (dist < BJ.CONFIG.phys.magnetRange && dist > 0.001) {
          var f = force * clamp(1 - dist / BJ.CONFIG.phys.magnetRange, 0.15, 1);
          obj.x += (dx / dist) * f;
          obj.y += (dy / dist) * f;
        }
      }

      /* Drop platforms well behind the camera. */
      world.prune = function (cameraX) {
        while (world.plats.length > 24 && world.plats[1].x + world.plats[1].w < cameraX - 160) {
          world.plats.shift();
          world.base = world.plats[0].i;
        }
      };

      world.planJump = function (plat, opts) {
        opts = opts || {};
        world.ensure(plat.i + 1);
        var next = world.at(plat.i + 1);
        if (!next) return { feasible: false };
        return Jump.solve(plat, next, {
          time: world.time,
          atTime: opts.atTime,
          hazards: next.hazards,
          needTime: 0.28,
          samples: opts.samples || 160,
          mul: opts.mul || 1,
          /* caller knows where the block is standing; falling back to the far
             left keeps the answer conservative */
          fromOffset: opts.fromOffset === undefined ? HALF : opts.fromOffset
        });
      };

      return world;
    }
  };

  BJ.World = World;
})(typeof globalThis !== "undefined" ? globalThis : this);
