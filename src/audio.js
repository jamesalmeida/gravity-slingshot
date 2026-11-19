// Tiny WebAudio synth. Off until the player turns it on.
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, start, dur, type, peak, glideTo) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak || 0.5, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function play(fn) {
    if (!enabled || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    fn(ctx.currentTime);
  }

  const PENTA = [392, 440, 523.25, 587.33, 659.25, 783.99];

  const Sound = {
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = on;
      if (on && ensure() && ctx.state === 'suspended') ctx.resume();
    },
    tick() { play((t) => tone(880, t, 0.04, 'square', 0.12)); },
    launch(power) { play((t) => tone(140 + power * 160, t, 0.32, 'triangle', 0.6, 520 + power * 300)); },
    beacon(i) {
      play((t) => {
        const f = PENTA[Math.min(i, PENTA.length - 1)];
        tone(f, t, 0.35, 'sine', 0.6);
        tone(f * 2, t + 0.05, 0.25, 'sine', 0.2);
      });
    },
    crash() { play((t) => tone(180, t, 0.5, 'sawtooth', 0.5, 40)); },
    lost() { play((t) => tone(330, t, 0.45, 'sine', 0.3, 160)); },
    win() {
      play((t) => [0, 2, 4, 5].forEach((n, k) => tone(PENTA[n], t + k * 0.09, 0.5, 'triangle', 0.45)));
    }
  };

  root.Sound = Sound;
})(typeof self !== 'undefined' ? self : this);
