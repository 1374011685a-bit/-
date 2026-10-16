/**
 * Block Jump - procedural pixel art.
 *
 * Everything is baked once into small offscreen canvases from code, so the
 * game ships as a handful of text files with no binary assets. Sprites are
 * authored on an explicit pixel grid: no smoothing, no sub-pixel drawing.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;
  var C = BJ.CONFIG;

  function make(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return { c: c, g: g };
  }

  function rgb(color) {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  }

  function toHex(arr) {
    return (
      "#" +
      arr
        .map(function (v) {
          return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  /* Positive amount lightens, negative darkens. */
  function shade(color, amount) {
    var a = rgb(color);
    return toHex(
      a.map(function (v) {
        return amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
      })
    );
  }

  /* ------------------------------------------------------------------ block */

  /* The little block. Frames: 0 idle, 1/2 walk, 3 airborne, 4 crashed. */
  function buildBlock(skin) {
    var legsFor = [
      [[3, 12], [10, 12]],
      [[2, 12], [10, 11]],
      [[4, 11], [11, 12]],
      [[3, 11], [10, 11]],
      [[2, 13], [11, 13]]
    ];
    var sprites = [];

    for (var f = 0; f < legsFor.length; f++) {
      var s = make(16, 16);
      var g = s.g;
      var crashed = f === 4;

      /* arms */
      g.fillStyle = skin.shade;
      g.fillRect(1, 6, 1, 4);
      g.fillRect(14, 6, 1, 4);
      g.fillStyle = skin.light;
      g.fillRect(1, 5, 1, 1);
      g.fillRect(14, 5, 1, 1);

      /* body: 12x12 with clipped corners */
      g.fillStyle = skin.shade;
      g.fillRect(3, 0, 10, 1);
      g.fillRect(2, 1, 12, 10);
      g.fillRect(3, 11, 10, 1);
      g.fillStyle = skin.body;
      g.fillRect(3, 1, 10, 10);
      /* bevel */
      g.fillStyle = skin.light;
      g.fillRect(3, 1, 10, 1);
      g.fillRect(3, 2, 1, 9);
      g.fillStyle = skin.shade;
      g.fillRect(3, 10, 10, 1);
      g.fillRect(12, 2, 1, 9);
      g.fillStyle = shade(skin.body, -0.22);
      g.fillRect(10, 9, 2, 1);

      /* face */
      g.fillStyle = skin.eye;
      if (crashed) {
        [[4, 4], [6, 4], [5, 5], [4, 6], [6, 6], [9, 4], [11, 4], [10, 5], [9, 6], [11, 6], [7, 8], [8, 8], [7, 9], [8, 9]].forEach(
          function (p) {
            g.fillRect(p[0], p[1], 1, 1);
          }
        );
      } else {
        g.fillRect(4, 4, 2, 3);
        g.fillRect(9, 4, 2, 3);
        g.fillStyle = "#ffffff";
        g.fillRect(4, 4, 1, 1);
        g.fillRect(9, 4, 1, 1);
        g.fillStyle = skin.eye;
        g.fillRect(6, 9, 3, 1);
      }

      /* legs */
      var legs = legsFor[f];
      g.fillStyle = skin.shade;
      g.fillRect(legs[0][0], legs[0][1], 3, 4);
      g.fillRect(legs[1][0], legs[1][1], 3, 4);
      g.fillStyle = skin.body;
      g.fillRect(legs[0][0], legs[0][1], 3, 3);
      g.fillRect(legs[1][0], legs[1][1], 3, 3);
      g.fillStyle = skin.light;
      g.fillRect(legs[0][0], legs[0][1], 1, 2);
      g.fillRect(legs[1][0], legs[1][1], 1, 2);

      sprites.push(s.c);
    }
    return sprites;
  }

  /* ----------------------------------------------------------------- extras */

  /* 1px darker rim on the bottom and right edges of whatever is opaque. */
  function bevel(s, dark) {
    var g = s.g;
    var w = s.c.width;
    var h = s.c.height;
    var px = g.getImageData(0, 0, w, h).data;
    var out = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] === 0) continue;
        var rightEmpty = x + 1 >= w || px[(y * w + x + 1) * 4 + 3] === 0;
        var downEmpty = y + 1 >= h || px[((y + 1) * w + x) * 4 + 3] === 0;
        if (rightEmpty || downEmpty) out.push(x, y);
      }
    }
    g.fillStyle = dark;
    for (var i = 0; i < out.length; i += 2) g.fillRect(out[i], out[i + 1], 1, 1);
    return s.c;
  }

  function buildStar() {
    var s = make(8, 8);
    var g = s.g;
    var rows = ["...##...", "...##...", ".######.", "########", ".######.", "..####..", "...##...", "...##..."];
    g.fillStyle = "#ffe066";
    rows.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] === "#") g.fillRect(x, y, 1, 1);
    });
    return bevel(s, "#d99a1e");
  }

  /* Spinning spiked ball / saw blade: one mask, four quarter-turn frames. */
  function buildHazard(spin) {
    var s = make(12, 12);
    var g = s.g;
    g.fillStyle = "#98a2b4";
    for (var y = 0; y < 12; y++) {
      for (var x = 0; x < 12; x++) {
        if ((x - 5.5) * (x - 5.5) + (y - 5.5) * (y - 5.5) <= 11.5) g.fillRect(x, y, 1, 1);
      }
    }
    var arms = [
      [[5, 0], [6, 0], [5, 1], [6, 1]],
      [[10, 5], [10, 6], [9, 5], [9, 6]],
      [[5, 10], [6, 10], [5, 9], [6, 9]],
      [[0, 5], [0, 6], [1, 5], [1, 6]]
    ];
    for (var k = 0; k < 4; k++) {
      var a = arms[(k + spin) % 4];
      g.fillStyle = "#c2cbd8";
      for (var i = 0; i < a.length; i++) g.fillRect(a[i][0], a[i][1], 1, 1);
    }
    g.fillStyle = "#e3e9f2";
    g.fillRect(4, 4, 2, 1);
    g.fillRect(4, 4, 1, 2);
    g.fillStyle = "#3d4351";
    g.fillRect(5, 5, 2, 2);
    return s.c;
  }

  function buildPowerup(kind) {
    var s = make(12, 12);
    var g = s.g;
    var cols = {
      shield: ["#3f7fe0", "#1f4a94"],
      boost: ["#e2683c", "#9a3a18"],
      magnet: ["#3fae63", "#1f7040"]
    }[kind];
    g.fillStyle = cols[1];
    g.fillRect(1, 1, 10, 10);
    g.fillStyle = cols[0];
    g.fillRect(1, 1, 9, 9);
    g.fillStyle = shade(cols[0], 0.4);
    g.fillRect(1, 1, 9, 1);
    g.fillRect(1, 1, 1, 9);
    var glyph = {
      shield: ["..####..", ".##..##.", "##....##", "##....##", "##....##", ".##..##.", "..####..", "...##..."],
      boost: ["...##...", "..###...", ".#####..", "###..##.", "...##...", "..##....", ".##.....", "##......"],
      magnet: ["..####..", ".#....#.", "#......#", "#......#", "#......#", "#......#", "#......#", "#......#"]
    }[kind];
    g.fillStyle = "#ffffff";
    glyph.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] === "#") g.fillRect(2 + x, 2 + y, 1, 1);
    });
    return s.c;
  }

  /* ------------------------------------------------------------------ tiles */

  function tileRng(a, b) {
    var x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildGrass(variant, biome) {
    var s = make(16, 16);
    var g = s.g;
    g.fillStyle = biome.dirt;
    g.fillRect(0, 0, 16, 16);
    for (var i = 0; i < 14; i++) {
      var x = Math.floor(tileRng(variant * 37 + i, 3) * 16);
      var y = 5 + Math.floor(tileRng(variant * 91 + i * 7, 11) * 10);
      g.fillStyle = biome.dirtDark;
      g.fillRect(x, y, 1 + (i % 2), 1);
    }
    g.fillStyle = biome.grassDark;
    g.fillRect(0, 4, 16, 1);
    g.fillStyle = biome.grass;
    g.fillRect(0, 2, 16, 2);
    g.fillStyle = biome.grassLight;
    g.fillRect(0, 0, 16, 2);
    for (var k = 0; k < 16; k++) {
      var n = tileRng(variant * 13 + k, 7);
      if (n > 0.74) {
        g.fillStyle = biome.grassLight;
        g.fillRect(k, 0, 1, 3);
      } else if (n < 0.18) {
        g.fillStyle = biome.grassDark;
        g.fillRect(k, 3, 1, 1);
      }
    }
    g.fillStyle = shade(biome.dirtDark, -0.3);
    g.fillRect(0, 15, 16, 1);
    return s.c;
  }

  function buildDirt(variant, biome) {
    var s = make(16, 16);
    var g = s.g;
    g.fillStyle = biome.dirt;
    g.fillRect(0, 0, 16, 16);
    for (var i = 0; i < 18; i++) {
      var x = Math.floor(tileRng(variant * 53 + i * 3, 5) * 16);
      var y = Math.floor(tileRng(variant * 71 + i * 5, 9) * 16);
      g.fillStyle = tileRng(i * 11 + variant, 13) > 0.5 ? biome.dirtDark : shade(biome.dirt, 0.12);
      g.fillRect(x, y, 2, 1);
    }
    g.fillStyle = shade(biome.dirtDark, -0.25);
    g.fillRect(0, 15, 16, 1);
    return s.c;
  }

  function buildCobble(variant, biome) {
    var s = make(16, 16);
    var g = s.g;
    g.fillStyle = biome.cobbleDark;
    g.fillRect(0, 0, 16, 16);
    function stone(x, y, w, h) {
      g.fillStyle = biome.cobble;
      g.fillRect(x, y, w, h);
      g.fillStyle = shade(biome.cobble, 0.22);
      g.fillRect(x, y, w, 1);
      g.fillRect(x, y, 1, h);
      g.fillStyle = shade(biome.cobble, -0.3);
      g.fillRect(x, y + h - 1, w, 1);
      g.fillRect(x + w - 1, y, 1, h);
    }
    var off = variant % 2 ? 0 : 7;
    stone(0, 0, 7, 7);
    stone(8, 0, 8, 7);
    stone(off, 8, 8, 7);
    stone(off + 9 > 16 ? 16 : off + 9, 8, 8, 7);
    if (off === 0) {
      g.fillStyle = biome.cobbleDark;
      g.fillRect(7, 8, 1, 7);
    }
    return s.c;
  }

  function buildCloud(variant, biome) {
    var s = make(28, 12);
    var g = s.g;
    g.fillStyle = biome.cloud;
    [
      [4, 5, 20, 5],
      [7, 3, 12, 3],
      [10 - variant, 1, 6, 3],
      [2, 7, 24, 3]
    ].forEach(function (b) {
      g.fillRect(b[0], b[1], b[2], b[3]);
    });
    g.fillStyle = biome.cloudLight;
    g.fillRect(8 + variant * 3, 2, 6, 1);
    g.fillRect(6 + variant * 2, 6, 10, 1);
    g.fillStyle = shade(biome.cloud, -0.25);
    g.fillRect(2, 9, 24, 1);
    return s.c;
  }

  /* Jagged mountain silhouette, 256 wide, tiled horizontally. */
  function buildMountains(biome, layer) {
    var W = 256;
    var H = 64;
    var s = make(W, H);
    var g = s.g;
    var r = BJ.rng(layer * 7717 + 913);
    var fill = layer === 0 ? biome.mountainFar : biome.mountainNear;
    g.fillStyle = fill;
    var peaks = layer === 0 ? 3 : 2;
    for (var p = 0; p < peaks; p++) {
      var cx = ((p + 0.5) / peaks) * W + (r() * 22 - 11);
      var hgt = (layer === 0 ? 42 : 30) + r() * 16;
      var half = (layer === 0 ? 46 : 62) + r() * 18;
      for (var x = Math.floor(cx - half); x <= cx + half; x++) {
        var t = 1 - Math.abs(x - cx) / half;
        var y = Math.floor(H - hgt * Math.pow(Math.max(0, t), 0.85));
        g.fillRect((x + W) % W, y, 1, H - y);
      }
    }
    /* rim light along the silhouette top */
    var px = g.getImageData(0, 0, W, H).data;
    var edges = [];
    for (var x2 = 0; x2 < W; x2++) {
      for (var y2 = 0; y2 < H; y2++) {
        var i = (y2 * W + x2) * 4 + 3;
        if (px[i] > 0 && (y2 === 0 || px[((y2 - 1) * W + x2) * 4 + 3] === 0)) edges.push(x2, y2);
      }
    }
    g.fillStyle = shade(fill, 0.16);
    for (var e = 0; e < edges.length; e += 2) g.fillRect(edges[e], edges[e + 1], 1, 2);
    return s.c;
  }

  /* ------------------------------------------------------------------ cache */

  var cache = { ready: false, block: [], grass: [], dirt: [], cobble: [], cloud: [], mountains: {} };

  function buildAll() {
    if (cache.ready) return;
    C.skins.forEach(function (skin) {
      cache.block.push(buildBlock(skin));
    });
    C.biomes.forEach(function (biome) {
      var gv = [];
      var dv = [];
      var cv = [];
      var cl = [];
      for (var v = 0; v < 4; v++) {
        gv.push(buildGrass(v, biome));
        dv.push(buildDirt(v, biome));
        cv.push(buildCobble(v, biome));
      }
      for (var c = 0; c < 3; c++) cl.push(buildCloud(c, biome));
      cache.grass.push(gv);
      cache.dirt.push(dv);
      cache.cobble.push(cv);
      cache.cloud.push(cl);
      cache.mountains[biome.id] = [buildMountains(biome, 0), buildMountains(biome, 1)];
    });
    cache.star = buildStar();
    cache.hazard = [0, 1, 2, 3].map(buildHazard);
    cache.powerup = {
      shield: buildPowerup("shield"),
      boost: buildPowerup("boost"),
      magnet: buildPowerup("magnet")
    };
    cache.ready = true;
  }

  var Pixel = {
    init: buildAll,
    shade: shade,
    make: make,
    block: function (skinIdx, frame) {
      buildAll();
      var arr = cache.block[skinIdx % cache.block.length];
      return arr[Math.abs(frame) % arr.length];
    },
    grass: function (biomeIdx, variant) {
      buildAll();
      return cache.grass[biomeIdx % cache.grass.length][variant % 4];
    },
    dirt: function (biomeIdx, variant) {
      buildAll();
      return cache.dirt[biomeIdx % cache.dirt.length][variant % 4];
    },
    cobble: function (biomeIdx, variant) {
      buildAll();
      return cache.cobble[biomeIdx % cache.cobble.length][variant % 4];
    },
    cloud: function (biomeIdx, variant) {
      buildAll();
      return cache.cloud[biomeIdx % cache.cloud.length][variant % 3];
    },
    mountains: function (biomeId, layer) {
      buildAll();
      return cache.mountains[biomeId][layer];
    },
    star: function () {
      buildAll();
      return cache.star;
    },
    hazard: function (frame) {
      buildAll();
      return cache.hazard[frame % 4];
    },
    powerup: function (kind) {
      buildAll();
      return cache.powerup[kind];
    },
    previewBlock: function (skinIdx, size) {
      buildAll();
      var src = Pixel.block(skinIdx, 0);
      var s = make(size, size);
      s.g.drawImage(src, 0, 0, 16, 16, 0, 0, size, size);
      return s.c;
    }
  };

  BJ.Pixel = Pixel;
})(typeof globalThis !== "undefined" ? globalThis : this);
