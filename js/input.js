/**
 * Block Jump - one button, every device.
 *
 * Space / W / ArrowUp / mouse / touch, all funnelled into a single held flag
 * with press and release edges. Nothing here knows about the game rules.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;

  function create(opts) {
    opts = opts || {};
    var el = opts.element || global.document;
    var state = { held: false, pressed: false, released: false };
    var keys = { " ": 1, Spacebar: 1, ArrowUp: 1, KeyW: 1, Enter: 1 };

    function press() {
      if (state.held) return;
      state.held = true;
      state.pressed = true;
      if (opts.onPress) opts.onPress();
    }

    function release() {
      if (!state.held) return;
      state.held = false;
      state.released = true;
      if (opts.onRelease) opts.onRelease();
    }

    function onKeyDown(e) {
      if (keys[e.code] || keys[e.key]) {
        if (e.repeat) return;
        if (opts.enabled && !opts.enabled()) return;
        e.preventDefault();
        press();
      }
    }

    function onKeyUp(e) {
      if (keys[e.code] || keys[e.key]) {
        e.preventDefault();
        release();
      }
    }

    function onPointerDown(e) {
      if (opts.enabled && !opts.enabled()) return;
      if (e.target && e.target.closest && e.target.closest("button, a, input, .no-jump")) return;
      e.preventDefault();
      press();
    }

    function onPointerUp(e) {
      e.preventDefault();
      release();
    }

    global.addEventListener("keydown", onKeyDown, { passive: false });
    global.addEventListener("keyup", onKeyUp, { passive: false });
    el.addEventListener("pointerdown", onPointerDown, { passive: false });
    global.addEventListener("pointerup", onPointerUp, { passive: false });
    global.addEventListener("pointercancel", onPointerUp, { passive: false });
    global.addEventListener("blur", release);
    global.document.addEventListener("visibilitychange", function () {
      release();
    });
    /* a stray context menu on long-press ruins the feel on mobile */
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });

    return {
      state: state,
      /* Call once per rendered frame, after the fixed steps have run. */
      endFrame: function () {
        state.pressed = false;
        state.released = false;
      },
      forceRelease: release
    };
  }

  BJ.Input = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
