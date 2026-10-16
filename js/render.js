/**
 * Block Jump - canvas renderer.
 *
 * Draws the world into a fixed 480x270 buffer (the canvas element scales that
 * up with nearest-neighbour filtering). The HUD and menus are DOM, so this
 * file is only about the game picture: parallax backdrops, islands, obstacles,
 * the block, particles and the aim arc.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;
  var C = BJ.CONFIG;
  var P = BJ.Pixel;
  var VIEW = C.view;
  var TILE = C.world.tile;

  function rgb(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    var x = rgb(a);
    var y = rgb(b);
    return (
      "#" +
      x
        .map(function (v, i) {
          return Math.round(v + (y[i] - v) * t)
            .toString(16)
            .padStart(2, "0");
        })
        .join("")
    );
  }
  function hash(a, b) {
    var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  var Renderer = {
    create: function (canvas) {
      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;

      /* The backdrop is sized from the current view, which changes on phones
         when the display rotates, so it is rebuilt whenever the view changes. */
      var skyStars = [];
      var cloudSpots = [];
      var backdropFor = "";

      function buildBackdrop() {
        var key = VIEW.w + "x" + VIEW.h;
        if (key === backdropFor) return;
        backdropFor = key;
        var r = BJ.rng(1337);
        skyStars = [];
        var stars = Math.max(40, Math.round((VIEW.w * VIEW.h) / 1400));
        for (var i = 0; i < stars; i++) {
          skyStars.push({ x: r() * 900, y: r() * VIEW.h * 0.62, s: r() < 0.2 ? 2 : 1, p: r() * 6.28 });
        }
        cloudSpots = [];
        /* keep roughly the same number of clouds *visible* whatever the view
           is, so a tall phone frame does not end up with a bare sky */
        var clouds = Math.max(10, Math.round((1400 / VIEW.w) * 8));
        for (var c = 0; c < clouds; c++) {
          cloudSpots.push({ x: r() * 1400, y: (0.03 + r() * 0.45) * VIEW.h, v: Math.floor(r() * 3), s: 0.6 + r() * 0.8 });
        }
      }

      function drawSky(g) {
        var biomes = C.biomes;
        var a = biomes[g.biomeA % biomes.length];
        var b = biomes[g.biomeB % biomes.length];
        var t = g.biomeT;
        var bands = 14;
        for (var i2 = 0; i2 < bands; i2++) {
          var f = i2 / (bands - 1);
          var top = Math.round(f * VIEW.h);
          var h = Math.ceil(VIEW.h / bands) + 1;
          /* three-stop gradient, quantised into bands for the retro look */
          var colA = f < 0.5 ? mix(a.sky[0], a.sky[1], f * 2) : mix(a.sky[1], a.sky[2], (f - 0.5) * 2);
          var colB = f < 0.5 ? mix(b.sky[0], b.sky[1], f * 2) : mix(b.sky[1], b.sky[2], (f - 0.5) * 2);
          ctx.fillStyle = mix(colA, colB, t);
          ctx.fillRect(0, top, VIEW.w, h);
        }

        /* stars */
        var starCol = mix(a.star, b.star, t);
        for (var s = 0; s < skyStars.length; s++) {
          var st = skyStars[s];
          var x = st.x - g.camX * 0.06;
          x = ((x % 900) + 900) % 900;
          if (x > VIEW.w + 4) continue;
          var tw = 0.45 + 0.55 * Math.abs(Math.sin(g.time * 1.5 + st.p));
          ctx.globalAlpha = tw;
          ctx.fillStyle = starCol;
          ctx.fillRect(Math.round(x), Math.round(st.y), st.s, st.s);
        }
        ctx.globalAlpha = 1;
      }

      function drawParallax(g) {
        var biomes = C.biomes;
        var a = biomes[g.biomeA % biomes.length].id;
        var b = biomes[g.biomeB % biomes.length].id;
        var t = g.biomeT;

        function layer(biomeId, layerIdx, factor, yBottom, alpha) {
          var img = P.mountains(biomeId, layerIdx);
          var w = img.width;
          var off = ((-g.camX * factor) % w + w) % w;
          ctx.globalAlpha = alpha;
          for (var x = -off; x < VIEW.w; x += w) ctx.drawImage(img, Math.round(x), yBottom - img.height);
          ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = 1;
        /* mountains are anchored to the world, so they follow the camera's
           vertical offset (portrait frames sit lower on the screen) */
        ctx.save();
        ctx.translate(0, Math.round(g.camY || 0));
        layer(a, 0, 0.1, 210, 1);
        if (t > 0) layer(b, 0, 0.1, 210, t);
        ctx.restore();

        /* clouds: pure sky decoration, so they stay in screen space */
        var ci = Math.floor(g.biomeA) % biomes.length;
        for (var i = 0; i < cloudSpots.length; i++) {
          var cs = cloudSpots[i];
          var x = cs.x - g.camX * 0.22 + g.time * 4;
          x = ((x % 1400) + 1400) % 1400;
          if (x > VIEW.w + 30) continue;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(P.cloud(ci, cs.v), Math.round(x), Math.round(cs.y + Math.sin(g.time * 0.4 + cs.x) * 2));
        }
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(0, Math.round(g.camY || 0));
        layer(a, 1, 0.3, 236, 1);
        if (t > 0) layer(b, 1, 0.3, 236, t);
        ctx.restore();
      }

      function drawIsland(g, pl) {
        var biome = Math.floor(g.biomeA) % C.biomes.length;
        var top = Math.round(pl.y);
        var left = Math.round(pl.x);
        var w = pl.w;
        var cols = Math.ceil(w / TILE);
        var shake = 0;
        if (pl.type === "crumble" && pl.crumbleT >= 0 && !pl.gone) {
          shake = Math.sin(pl.crumbleT * 42) * Math.min(2, pl.crumbleT * 3);
        }
        var ox = left + (shake ? Math.round(shake) : 0);
        /* culling is in camera space: the context is already translated */
        var sx = ox - g.camX;
        if (sx > VIEW.w + 48 || sx + w < -48) return;

        /* grass cap */
        for (var i = 0; i < cols; i++) {
          var x = ox + i * TILE;
          var cw = Math.min(TILE, ox + w - x);
          var img = P.grass(biome, Math.floor((x / TILE) * 1.7 + pl.i * 0.37));
          ctx.drawImage(img, 0, 0, cw, TILE, x, top, cw, TILE);
        }
        /* dirt + cobble body */
        for (var row = 0; row < 4; row++) {
          for (var j = 0; j < cols; j++) {
            var xx = ox + j * TILE;
            var ww = Math.min(TILE, ox + w - xx);
            var ragged = row === 3 && hash(Math.floor(xx / TILE), pl.i * 3 + row) < 0.34;
            if (ragged) continue;
            var tile =
              row === 0
                ? P.dirt(biome, Math.floor(hash(j, pl.i) * 4))
                : P.cobble(biome, Math.floor(hash(j * 2.1, pl.i + row) * 4));
            ctx.drawImage(tile, 0, 0, ww, TILE, xx, top + TILE * (row + 1), ww, TILE);
          }
        }
        /* shadow under the island */
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(ox + 2, top + TILE * 5, w - 4, 2);

        /* cracks once it starts to fall */
        if (pl.type === "crumble" && pl.crumbleT >= 0) {
          var k = Math.min(1, pl.crumbleT / pl.crumbleTime);
          ctx.fillStyle = "rgba(20,10,4," + (0.35 + 0.5 * k) + ")";
          for (var m = 0; m < 5; m++) {
            var cx = ox + 6 + m * (w - 12) / 4;
            ctx.fillRect(Math.round(cx), top + 3, 2, 3 + (m % 3) * 2);
            ctx.fillRect(Math.round(cx) - 2, top + 8 + (m % 2) * 3, 2, 3);
          }
        }
        /* moving platforms get little end caps so the motion reads */
        if (pl.type === "mover") {
          ctx.fillStyle = "rgba(255,255,255,0.16)";
          ctx.fillRect(ox - 3, top + 6, 2, 3);
          ctx.fillRect(ox + w + 1, top + 6, 2, 3);
        }
      }

      function drawHazards(g, pl) {
        for (var i = 0; i < pl.hazards.length; i++) {
          var h = pl.hazards[i];
          var x = h.cx === undefined ? h.x : h.cx;
          var y = h.cy === undefined ? h.y : h.cy;
          var hx2 = x - g.camX;
          if (hx2 < -20 || hx2 > VIEW.w + 20) continue;
          var frame = Math.floor((g.time * 9 * h.spin + i) % 4);
          var img = P.hazard(((frame % 4) + 4) % 4);
          ctx.drawImage(img, Math.round(x - 6), Math.round(y - 6));
        }
      }

      function drawPickups(g, pl) {
        for (var i = 0; i < pl.stars.length; i++) {
          var st = pl.stars[i];
          if (st.taken) continue;
          var bob = Math.sin(g.time * 3 + st.bob) * 1.6;
          var x = Math.round(st.x - 4);
          var y = Math.round(st.y - 4 + bob);
          var sx = x - g.camX;
          if (sx < -10 || sx > VIEW.w + 10) continue;
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = "#ffe066";
          ctx.fillRect(x - 1, y - 1, 10, 10);
          ctx.globalAlpha = 1;
          ctx.drawImage(P.star(), x, y);
        }
        var pu = pl.powerup;
        if (pu && !pu.taken) {
          var pb = Math.sin(g.time * 2.4 + pu.bob) * 2;
          var px = Math.round(pu.x - 6);
          var py = Math.round(pu.y - 6 + pb);
          var spx = px - g.camX;
          if (spx > -14 && spx < VIEW.w + 14) {
            ctx.globalAlpha = 0.22 + 0.12 * Math.sin(g.time * 5);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(px - 3, py - 3, 18, 18);
            ctx.globalAlpha = 1;
            ctx.drawImage(P.powerup(pu.kind), px, py);
          }
        }
      }

      function drawTrail(g) {
        var p = g.player;
        if (p.state !== "air" || !g.trail) return;
        for (var i = 0; i < g.trail.length; i++) {
          var t = g.trail[i];
          var a = (i + 1) / g.trail.length;
          ctx.globalAlpha = 0.18 * a;
          ctx.drawImage(P.block(g.skinIdx, 3), Math.round(t.x - 8), Math.round(t.y - 16));
        }
        ctx.globalAlpha = 1;
      }

      function drawPlayer(g) {
        var p = g.player;
        if (!p) return;
        if (p.invulnT > 0 && Math.floor(g.time * 20) % 2 === 0) return;

        var frame = 0;
        if (p.state === "air") frame = 3;
        if (p.state === "dead") frame = 4;
        if (p.state === "charge") frame = 0;

        var img = P.block(g.skinIdx, frame);
        var squash = p.squash || 0;
        var sx = 1 + squash * 0.22;
        var sy = 1 - squash * 0.2;
        if (p.state === "air") {
          var st = Math.min(0.12, Math.abs(p.vy) * 0.014);
          sx = 1 - st;
          sy = 1 + st;
        }
        var w = 16 * sx;
        var h = 16 * sy;
        var x = p.x - w / 2;
        var y = p.y - h;

        /* shadow on the platform below */
        if (p.plat && !p.plat.gone) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#000000";
          var sw = 12;
          ctx.fillRect(Math.round(p.x - sw / 2), Math.round(p.plat.y + 1), sw, 2);
          ctx.globalAlpha = 1;
        }

        ctx.drawImage(img, 0, 0, 16, 16, Math.round(x), Math.round(y), Math.round(w), Math.round(h));

        /* a blink every few seconds, so a standing block still feels alive */
        if ((p.state === "idle" || p.state === "charge") && g.time % 3.2 < 0.09) {
          ctx.fillStyle = C.skins[g.skinIdx % C.skins.length].eye;
          ctx.fillRect(
            Math.round(x + w * 0.25),
            Math.round(y + h * 0.25),
            Math.max(1, Math.round(w * 0.45)),
            Math.max(1, Math.round(h * 0.12))
          );
        }

        /* magnet / boost auras */
        if (p.magnetT > 0) {
          ctx.strokeStyle = "rgba(63,174,99," + (0.35 + 0.2 * Math.sin(g.time * 8)) + ")";
          ctx.lineWidth = 1;
          var rr = 20 + Math.sin(g.time * 4) * 2;
          ctx.beginPath();
          ctx.arc(Math.round(p.x) + 0.5, Math.round(p.y - 8) + 0.5, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (p.boostT > 0) {
          ctx.fillStyle = "rgba(226,104,60,0.5)";
          for (var b = 0; b < 3; b++) {
            var bx = Math.round(p.x - 10 - b * 4 - (g.time * 90) % 12);
            ctx.fillRect(bx, Math.round(p.y - 10 + (b % 2) * 4), 3, 2);
          }
        }
        if (p.shield > 0) {
          ctx.strokeStyle = "rgba(120,190,255,0.85)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(Math.round(p.x) + 0.5, Math.round(p.y - 8) + 0.5, 13, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      /* Dotted preview of where this charge sends you, plus the landing mark. */
      function drawAim(g) {
        if (!g.aid || !g.player || !g.plan) return;
        var p = g.player;
        if (p.state !== "charge" && p.state !== "idle") return;
        var charge = p.state === "charge" ? p.charge : 0;
        var arc = p.previewArc(charge);
        var plan = g.plan;
        var inside = plan.feasible && charge >= plan.cMin && charge <= plan.cMax;
        var col = inside ? "#7ee081" : "#ffd166";
        var nMid = plan.feasible ? plan.nLand : 0;
        var steps = nMid || 34;
        ctx.fillStyle = col;
        for (var n = 4; n <= steps; n += 4) {
          var pt = BJ.Motion.pointAt(arc, n);
          if (pt.x - g.camX > VIEW.w + 6) break; /* the arc is drawn in world space */
          ctx.globalAlpha = 0.75;
          ctx.fillRect(Math.round(pt.x), Math.round(pt.y - 8), 2, 2);
        }
        ctx.globalAlpha = 1;
        /* landing marker */
        var lx = plan.feasible ? plan.landX : BJ.Motion.xAt(arc, steps);
        var next = g.world && g.world.at(p.plat.i + 1);
        if (plan.feasible && next) {
          var ly = next.y;
          ctx.fillStyle = inside ? "#7ee081" : "#ffd166";
          ctx.fillRect(Math.round(lx) - 4, Math.round(ly) - 2, 9, 2);
          ctx.fillRect(Math.round(lx) - 2, Math.round(ly) - 4, 5, 2);
        }
      }

      function drawParticles(g) {
        for (var i = 0; i < g.particles.length; i++) {
          var p = g.particles[i];
          var a = Math.max(0, Math.min(1, p.life / p.maxLife));
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      function frame(g) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, VIEW.w, VIEW.h);
        buildBackdrop();

        var shake = g.shake || 0;
        var ox = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
        var oy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
        ctx.translate(ox, oy);

        /* backdrop: screen space, parallax applied by hand */
        drawSky(g);
        drawParallax(g);

        /* world: scroll with the camera */
        ctx.save();
        ctx.translate(-Math.round(g.camX), 0);
        ctx.translate(0, Math.round(g.camY || 0));

        var plats = g.world.plats;
        for (var i = 0; i < plats.length; i++) {
          if (!plats[i].gone) drawIsland(g, plats[i]);
        }
        for (var h = 0; h < plats.length; h++) {
          if (!plats[h].gone && plats[h].hazards.length) drawHazards(g, plats[h]);
        }
        for (var s = 0; s < plats.length; s++) {
          if (!plats[s].gone && (plats[s].stars.length || plats[s].powerup)) drawPickups(g, plats[s]);
        }
        drawAim(g);
        drawTrail(g);
        drawPlayer(g);
        drawParticles(g);
        ctx.restore();

        ctx.restore();

        /* subtle vignette keeps the pixel edges from feeling flat */
        var grad = ctx.createLinearGradient(0, 0, 0, VIEW.h);
        grad.addColorStop(0, "rgba(0,0,0,0.28)");
        grad.addColorStop(0.25, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.3)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      }

      return { ctx: ctx, frame: frame };
    }
  };

  BJ.Render = Renderer;
})(typeof globalThis !== "undefined" ? globalThis : this);
