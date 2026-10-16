/**
 * Block Jump - local persistence.
 *
 * The whole profile lives in one localStorage key. normalize() is pure so the
 * shape can be unit-tested without a browser.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;
  var KEY = "blockjump.save.v1";
  var MAX_SCORES = 10;

  function defaults() {
    return {
      v: 1,
      name: "PLAYER",
      bank: 0,
      totalStars: 0,
      owned: ["orange"],
      skin: "orange",
      best: { score: 0, blocks: 0, stars: 0 },
      scores: [],
      settings: { sfx: true, music: true, aid: true }
    };
  }

  /* Coerce whatever is in storage into a valid profile. */
  function normalize(raw) {
    var d = defaults();
    if (!raw || typeof raw !== "object") return d;
    var out = defaults();
    if (typeof raw.name === "string" && raw.name.trim()) out.name = raw.name.trim().slice(0, 12).toUpperCase();
    if (Number.isFinite(raw.bank)) out.bank = Math.max(0, Math.floor(raw.bank));
    if (Number.isFinite(raw.totalStars)) out.totalStars = Math.max(0, Math.floor(raw.totalStars));
    if (Array.isArray(raw.owned)) {
      var valid = BJ.CONFIG.skins.map(function (s) {
        return s.id;
      });
      out.owned = ["orange"];
      raw.owned.forEach(function (id) {
        if (valid.indexOf(id) >= 0 && out.owned.indexOf(id) < 0) out.owned.push(id);
      });
    }
    if (typeof raw.skin === "string" && out.owned.indexOf(raw.skin) >= 0) out.skin = raw.skin;
    if (raw.best && typeof raw.best === "object") {
      out.best = {
        score: Math.max(0, Math.floor(raw.best.score || 0)),
        blocks: Math.max(0, Math.floor(raw.best.blocks || 0)),
        stars: Math.max(0, Math.floor(raw.best.stars || 0))
      };
    }
    if (Array.isArray(raw.scores)) {
      out.scores = raw.scores
        .filter(function (s) {
          return s && Number.isFinite(s.score);
        })
        .map(function (s) {
          return {
            name: (typeof s.name === "string" && s.name.trim() ? s.name.trim() : "PLAYER").slice(0, 12).toUpperCase(),
            score: Math.max(0, Math.floor(s.score)),
            blocks: Math.max(0, Math.floor(s.blocks || 0)),
            stars: Math.max(0, Math.floor(s.stars || 0)),
            ts: Number.isFinite(s.ts) ? s.ts : 0
          };
        })
        .sort(function (a, b) {
          return b.score - a.score || a.ts - b.ts;
        })
        .slice(0, MAX_SCORES);
    }
    if (raw.settings && typeof raw.settings === "object") {
      out.settings = {
        sfx: raw.settings.sfx !== false,
        music: raw.settings.music !== false,
        aid: raw.settings.aid !== false
      };
    }
    return out;
  }

  /* Insert a run into the ladder, returning the new profile. */
  function insertScore(profile, entry) {
    var p = normalize(profile);
    var row = {
      name: p.name,
      score: Math.max(0, Math.floor(entry.score)),
      blocks: Math.max(0, Math.floor(entry.blocks || 0)),
      stars: Math.max(0, Math.floor(entry.stars || 0)),
      ts: entry.ts || 0
    };
    p.scores = p.scores.concat([row]).sort(function (a, b) {
      return b.score - a.score || a.ts - b.ts;
    });
    p.scores = p.scores.slice(0, MAX_SCORES);
    if (row.score > p.best.score) p.best = { score: row.score, blocks: row.blocks, stars: row.stars };
    return p;
  }

  function rank(profile, entry) {
    var p = normalize(profile);
    var better = p.scores.filter(function (s) {
      return s.score > entry.score;
    }).length;
    return better + 1;
  }

  var Save = {
    key: KEY,
    defaults: defaults,
    normalize: normalize,
    insertScore: insertScore,
    rank: rank,
    load: function () {
      try {
        return normalize(JSON.parse(global.localStorage.getItem(KEY) || "null"));
      } catch (e) {
        return defaults();
      }
    },
    write: function (profile) {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(profile));
        return true;
      } catch (e) {
        return false;
      }
    },
    clear: function () {
      try {
        global.localStorage.removeItem(KEY);
      } catch (e) {
        /* ignore */
      }
    }
  };

  BJ.Save = Save;
})(typeof globalThis !== "undefined" ? globalThis : this);
