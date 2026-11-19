// Procedural WebAudio synthesizer, off until the player turns it on.
(function (root) {
  'use strict';

  const SoundEngine = (() => {
    let ctx = null;
    let enabled = false;

    function ensureContext() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }

    function setEnabled(val) {
      enabled = val;
      if (enabled) {
        ensureContext();
        playClick(520, 0.04);
      }
    }

    function isEnabled() {
      return enabled;
    }

    function playClick(freq = 440, dur = 0.035) {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    }

    function playLaunch(speedRatio) {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const base = 180 + speedRatio * 140;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 2.1, now + 0.24);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }

    function playRelayLock(index) {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const scale = [523.25, 659.25, 783.99, 1046.5];
      const freq = scale[Math.min(index, scale.length - 1)];
      [1, 1.5].forEach((mult, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq * mult, now + idx * 0.04);
        gain.gain.setValueAtTime(idx === 0 ? 0.12 : 0.05, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + 0.58);
      });
    }

    function playSectorComplete() {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 987.77, 1046.5];
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + i * 0.075;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.68);
      });
    }

    function playImpact() {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.32);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }

    return { setEnabled, isEnabled, playClick, playLaunch, playRelayLock, playSectorComplete, playImpact };
  })();

  root.SoundEngine = SoundEngine;
})(window);
