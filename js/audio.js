/**
 * Block Jump - chiptune audio, generated at runtime with WebAudio.
 *
 * No sample files: every sound is a couple of oscillators and an envelope, and
 * the background loop is a small step sequencer with a lookahead scheduler.
 * Audio only starts after a user gesture, per browser autoplay rules.
 */
(function (global) {
  "use strict";

  var BJ = global.BJ;

  function create() {
    var ctx = null;
    var master = null;
    var musicGain = null;
    var sfxGain = null;
    var noiseBuf = null;
    var timer = null;
    var step = 0;
    var nextTime = 0;
    var enabled = { sfx: true, music: true };
    var running = false;

    var BPM = 126;
    var STEP = 60 / BPM / 2; /* eighth notes */
    /* A minor pentatonic-ish loop, 16 eighth notes per bar, 4 bars */
    var BASS = [110, 0, 110, 0, 82.4, 0, 82.4, 0, 130.8, 0, 130.8, 0, 98, 0, 123.5, 0];
    var ARP = [440, 523.25, 659.25, 523.25, 587.33, 440, 523.25, 392, 523.25, 659.25, 783.99, 659.25, 587.33, 493.88, 587.33, 440];

    function init() {
      if (ctx) return ctx;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);

      var len = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    }

    function tone(o) {
      if (!enabled.sfx || !ctx) return;
      var t = ctx.currentTime + (o.delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = o.type || "square";
      osc.frequency.setValueAtTime(o.from, t);
      if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
      var peak = o.gain === undefined ? 0.5 : o.gain;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, o.dur * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t);
      osc.stop(t + o.dur + 0.02);
    }

    function noise(o) {
      if (!enabled.sfx || !ctx) return;
      var t = ctx.currentTime + (o.delay || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      var filt = ctx.createBiquadFilter();
      filt.type = o.filter || "lowpass";
      filt.frequency.setValueAtTime(o.from, t);
      if (o.to) filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + o.dur);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(o.gain === undefined ? 0.4 : o.gain, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(sfxGain);
      src.start(t);
      src.stop(t + o.dur + 0.02);
    }

    var SFX = {
      jump: function (charge) {
        var from = 300 + charge * 260;
        tone({ type: "square", from: from, to: from * 1.9, dur: 0.13, gain: 0.28 });
        tone({ type: "triangle", from: from / 2, to: from, dur: 0.1, gain: 0.2 });
      },
      land: function () {
        noise({ from: 900, to: 180, dur: 0.09, gain: 0.3 });
        tone({ type: "triangle", from: 150, to: 90, dur: 0.08, gain: 0.25 });
      },
      step: function () {
        noise({ from: 1600, to: 900, dur: 0.03, gain: 0.12 });
      },
      star: function () {
        tone({ type: "square", from: 988, dur: 0.06, gain: 0.24 });
        tone({ type: "square", from: 1319, dur: 0.09, gain: 0.22, delay: 0.05 });
      },
      perfect: function () {
        [880, 1109, 1319, 1760].forEach(function (f, i) {
          tone({ type: "square", from: f, dur: 0.11, gain: 0.2, delay: i * 0.045 });
        });
      },
      power: function () {
        [523, 659, 784, 1046].forEach(function (f, i) {
          tone({ type: "triangle", from: f, to: f * 1.01, dur: 0.16, gain: 0.26, delay: i * 0.055 });
        });
      },
      shield: function () {
        tone({ type: "sine", from: 400, to: 1200, dur: 0.25, gain: 0.3 });
        tone({ type: "triangle", from: 200, to: 600, dur: 0.25, gain: 0.2 });
      },
      hit: function () {
        noise({ from: 2400, to: 120, dur: 0.35, gain: 0.5 });
        tone({ type: "sawtooth", from: 320, to: 60, dur: 0.35, gain: 0.32 });
      },
      crumble: function () {
        noise({ from: 500, to: 90, dur: 0.4, gain: 0.32 });
      },
      fall: function () {
        tone({ type: "square", from: 620, to: 110, dur: 0.55, gain: 0.26 });
      },
      over: function () {
        [523, 466, 392, 311].forEach(function (f, i) {
          tone({ type: "square", from: f, dur: 0.24, gain: 0.24, delay: i * 0.15 });
        });
      },
      ui: function () {
        tone({ type: "square", from: 660, dur: 0.05, gain: 0.18 });
      },
      buy: function () {
        [659, 880, 1174].forEach(function (f, i) {
          tone({ type: "square", from: f, dur: 0.14, gain: 0.24, delay: i * 0.07 });
        });
      },
      deny: function () {
        tone({ type: "square", from: 220, to: 150, dur: 0.16, gain: 0.22 });
      }
    };

    function schedule() {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + 0.15) {
        var bar = Math.floor(step / 16) % 4;
        var i = step % 16;
        var b = BASS[i];
        if (b) {
          var osc = ctx.createOscillator();
          var gn = ctx.createGain();
          osc.type = "square";
          osc.frequency.value = b * (bar === 3 ? 1.5 : 1);
          gn.gain.setValueAtTime(0.0001, nextTime);
          gn.gain.exponentialRampToValueAtTime(0.34, nextTime + 0.02);
          gn.gain.exponentialRampToValueAtTime(0.0001, nextTime + STEP * 1.6);
          osc.connect(gn);
          gn.connect(musicGain);
          osc.start(nextTime);
          osc.stop(nextTime + STEP * 1.8);
        }
        if (i % 2 === 0 || bar >= 2) {
          var osc2 = ctx.createOscillator();
          var gn2 = ctx.createGain();
          osc2.type = "triangle";
          osc2.frequency.value = ARP[(i + bar * 3) % 16] * (bar === 3 ? 1.25 : 1);
          gn2.gain.setValueAtTime(0.0001, nextTime);
          gn2.gain.exponentialRampToValueAtTime(bar >= 2 ? 0.16 : 0.1, nextTime + 0.015);
          gn2.gain.exponentialRampToValueAtTime(0.0001, nextTime + STEP * 1.2);
          osc2.connect(gn2);
          gn2.connect(musicGain);
          osc2.start(nextTime);
          osc2.stop(nextTime + STEP * 1.4);
        }
        nextTime += STEP;
        step++;
      }
    }

    return {
      /* Call from a real user gesture. */
      unlock: function () {
        init();
        if (ctx && ctx.state === "suspended") ctx.resume();
      },
      sfx: function (name, arg) {
        if (!ctx || !SFX[name]) return;
        SFX[name](arg);
      },
      setEnabled: function (kind, on) {
        enabled[kind] = !!on;
        if (kind === "music") {
          if (master) musicGain.gain.value = on ? 0.32 : 0;
        }
      },
      startMusic: function () {
        if (!ctx || running) return;
        running = true;
        step = 0;
        nextTime = ctx.currentTime + 0.1;
        timer = global.setInterval(schedule, 40);
        if (enabled.music) musicGain.gain.value = 0.32;
      },
      stopMusic: function () {
        running = false;
        if (timer) global.clearInterval(timer);
        timer = null;
        if (musicGain) musicGain.gain.value = 0;
      },
      isReady: function () {
        return !!ctx;
      }
    };
  }

  BJ.Audio = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
