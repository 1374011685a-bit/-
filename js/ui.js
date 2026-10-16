/**
 * Block Jump - DOM shell: menus, HUD, shop, ladder.
 *
 * The canvas only draws the world; everything textual is DOM so it stays
 * crisp at any scale and stays accessible to keyboards.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;
  var doc = global.document;

  function el(id) {
    return doc.getElementById(id);
  }

  function create(handlers) {
    var screens = {
      title: el("screen-title"),
      howto: el("screen-howto"),
      shop: el("screen-shop"),
      ranks: el("screen-ranks"),
      pause: el("screen-pause"),
      over: el("screen-over")
    };
    var hud = el("hud");
    var current = "title";
    var toastTimer = null;

    var ui = {
      current: function () {
        return current;
      },
      isOpen: function () {
        return current !== null;
      },
      screen: function (name) {
        var key;
        for (key in screens) if (screens[key]) screens[key].classList.toggle("show", key === name);
        current = name || null;
        /* keep the HUD visible while paused, hide it behind full-screen menus */
        hud.classList.toggle("hidden", name !== null && name !== "pause");
        if (name === "shop") ui.refreshShop();
        if (name === "ranks") ui.refreshRanks();
      },
      setHUD: function (data) {
        el("hud-score").textContent = data.score;
        el("hud-best").textContent = data.best;
        el("hud-blocks").textContent = data.blocks;
        el("hud-stars").textContent = data.stars;
        el("hud-bank").textContent = data.bank;
        var chips = el("hud-chips");
        var want = data.chips.join("|");
        if (chips.dataset.want !== want) {
          chips.dataset.want = want;
          chips.innerHTML = data.chips
            .map(function (c) {
              return '<span class="chip ' + c.kind + '">' + c.label + "</span>";
            })
            .join("");
        }
      },
      meter: function (m) {
        var meter = el("hud-meter");
        meter.classList.toggle("show", !!m.visible);
        if (!m.visible) return;
        el("meter-fill").style.width = (m.charge * 100).toFixed(1) + "%";
        el("meter-marker").style.left = (m.charge * 100).toFixed(1) + "%";
        var win = el("meter-window");
        if (m.window) {
          win.style.display = "";
          win.style.left = (m.cMin * 100).toFixed(1) + "%";
          win.style.width = ((m.cMax - m.cMin) * 100).toFixed(1) + "%";
          win.style.background = m.safe ? "rgba(126,224,129,0.42)" : "rgba(126,224,129,0.22)";
        } else {
          win.style.display = "none";
        }
        var hint = el("meter-hint");
        if (m.hint !== undefined && hint.dataset.state !== m.hint) {
          hint.dataset.state = m.hint;
          hint.textContent = m.hintText || hint.textContent;
        }
        if (m.fadeHint) hint.classList.add("fade");
      },
      toast: function (text, ms) {
        var t = el("hud-toast");
        t.textContent = text;
        t.classList.add("show");
        if (toastTimer) global.clearTimeout(toastTimer);
        toastTimer = global.setTimeout(function () {
          t.classList.remove("show");
        }, ms || 1100);
      },
      floater: function (text, x, y, cls) {
        var box = el("hud-floaters");
        if (!box) return;
        var d = doc.createElement("div");
        d.className = "floater " + (cls || "");
        d.textContent = text;
        d.style.left = x + "px";
        d.style.top = y + "px";
        box.appendChild(d);
        global.setTimeout(function () {
          if (d.parentNode) d.parentNode.removeChild(d);
        }, 950);
      },
      refreshShop: function () {
        var profile = handlers.profile();
        el("shop-bank").textContent = profile.bank;
        var grid = el("shop-grid");
        grid.innerHTML = "";
        BJ.CONFIG.skins.forEach(function (skin, idx) {
          var owned = profile.owned.indexOf(skin.id) >= 0;
          var equipped = profile.skin === skin.id;
          var card = doc.createElement("div");
          card.className = "skin" + (owned ? " owned" : "") + (equipped ? " equipped" : "");

          var cv = doc.createElement("canvas");
          cv.width = 64;
          cv.height = 64;
          cv.getContext("2d").drawImage(BJ.Pixel.previewBlock(idx, 64), 0, 0);
          card.appendChild(cv);

          var name = doc.createElement("div");
          name.className = "name";
          name.textContent = skin.name;
          card.appendChild(name);

          var price = doc.createElement("div");
          price.className = "price";
          price.innerHTML = owned ? "已拥有 OWNED" : "★ <b>" + skin.price + "</b>";
          card.appendChild(price);

          var btn = doc.createElement("button");
          if (equipped) {
            btn.textContent = "使用中 EQUIPPED";
            btn.disabled = true;
          } else if (owned) {
            btn.textContent = "装备 EQUIP";
            btn.addEventListener("click", function () {
              handlers.equip(skin.id);
            });
          } else {
            btn.textContent = "购买 BUY";
            btn.addEventListener("click", function () {
              handlers.buy(skin.id, skin.price);
            });
          }
          card.appendChild(btn);
          grid.appendChild(card);
        });
      },
      refreshRanks: function () {
        var profile = handlers.profile();
        var body = el("ranks-table").querySelector("tbody");
        body.innerHTML = "";
        if (!profile.scores.length) {
          var tr = doc.createElement("tr");
          tr.innerHTML = '<td colspan="5" class="empty">还没有记录 · No runs yet — go jump!</td>';
          body.appendChild(tr);
        }
        profile.scores.forEach(function (s, i) {
          var tr = doc.createElement("tr");
          if (s.name === profile.name) tr.className = "me";
          tr.innerHTML =
            "<td>" +
            (i + 1) +
            "</td><td>" +
            s.name +
            "</td><td>" +
            s.score +
            "</td><td>" +
            s.blocks +
            "</td><td>" +
            s.stars +
            "</td>";
          body.appendChild(tr);
        });
        el("input-name").value = profile.name;
      },
      setName: function (name) {
        el("input-name").value = name;
      },
      toggles: function (profile) {
        ["toggles-title", "toggles-pause"].forEach(function (id) {
          var box = el(id);
          box.innerHTML = "";
          [
            { key: "sfx", label: "音效 SFX" },
            { key: "music", label: "音乐 MUSIC" },
            { key: "aid", label: "辅助线 AIM AID" }
          ].forEach(function (item) {
            var b = doc.createElement("button");
            b.className = "toggle" + (profile.settings[item.key] ? " on" : "");
            b.textContent = item.label;
            b.addEventListener("click", function () {
              handlers.toggle(item.key);
            });
            box.appendChild(b);
          });
        });
      },
      result: function (data) {
        el("over-eyebrow").textContent = data.record ? "NEW RECORD" : "RUN OVER";
        el("over-eyebrow").classList.toggle("new", !!data.record);
        el("over-title").textContent = data.record ? "新纪录！" : "跳完了";
        el("over-score").textContent = data.score;
        el("over-blocks").textContent = data.blocks + " BLK";
        el("over-stars").textContent = data.stars;
        el("over-perfect").textContent = data.perfect;
        el("over-best").textContent = data.best;
        el("over-rank").textContent = "#" + data.rank;
      },
      hudVisible: function (on) {
        hud.classList.toggle("hidden", !on);
      },
      pauseButton: function (on) {
        el("btn-pause").classList.toggle("show", !!on);
      }
    };

    /* menu buttons */
    doc.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        handlers.action(btn.dataset.action, btn);
      });
    });
    el("input-name").addEventListener("change", function () {
      handlers.rename(this.value);
    });

    return ui;
  }

  BJ.UI = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
