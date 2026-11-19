// Level data. World is 1200 x 720, y points down, angles are in screen degrees (0 = right, 90 = down).
// Kinds: rock, gas, star, hole (black hole), repulsor (negative mass pushes the probe away).
// `hint` is a known one-launch solution; `npm run check` proves it still clears the level.
(function (root) {
  'use strict';

  const LEVELS = [
    {
      name: 'First Light',
      brief: 'Drag back from the probe and let go. Curve round the planet to reach the beacon.',
      start: { x: 150, y: 470 },
      preview: 240,
      bodies: [
        { x: 600, y: 380, r: 46, mass: 130, kind: 'rock', label: 'Ilo' }
      ],
      beacons: [{ x: 729, y: 254, r: 20 }],
      hint: { angle: 37.34, speed: 146.7 }
    },
    {
      name: 'Hairpin',
      brief: 'The beacon is behind you. Swing all the way round the giant.',
      start: { x: 200, y: 590 },
      preview: 220,
      bodies: [
        { x: 640, y: 360, r: 44, mass: 150, kind: 'gas', ring: 0.35, label: 'Brannoc' }
      ],
      beacons: [{ x: 78, y: 419, r: 20 }],
      hint: { angle: 34.57, speed: 130.8 }
    },
    {
      name: 'Two Moons',
      brief: 'Two beacons, one launch. Pick them up in either order.',
      start: { x: 140, y: 360 },
      bodies: [
        { x: 560, y: 360, r: 42, mass: 140, kind: 'rock', label: 'Pell' }
      ],
      beacons: [
        { x: 704, y: 291, r: 20 },
        { x: 257, y: 570, r: 20 }
      ],
      hint: { angle: 91.31, speed: 127.2 }
    },
    {
      name: 'Event Horizon',
      brief: 'Small, dark and very heavy. Skim it; do not touch it.',
      start: { x: 140, y: 600 },
      bodies: [
        { x: 600, y: 400, r: 18, mass: 230, kind: 'hole', label: 'Maw' }
      ],
      beacons: [
        { x: 631, y: 519, r: 20 },
        { x: 125, y: 370, r: 20 }
      ],
      hint: { angle: 214.47, speed: 120 }
    },
    {
      name: 'Binary',
      brief: 'Two stars pull from both sides. Find the seam between them.',
      start: { x: 140, y: 560 },
      bodies: [
        { x: 520, y: 220, r: 38, mass: 125, kind: 'star', label: 'Ara' },
        { x: 760, y: 500, r: 38, mass: 125, kind: 'star', label: 'Bex' }
      ],
      beacons: [
        { x: 724, y: 179, r: 20 },
        { x: 177, y: 381, r: 20 }
      ],
      hint: { angle: 262.57, speed: 166.2 }
    },
    {
      name: 'Push Back',
      brief: 'Pink bodies push instead of pull. Use them as bumpers.',
      start: { x: 150, y: 360 },
      bodies: [
        { x: 450, y: 200, r: 30, mass: -50, kind: 'repulsor', label: 'Null' },
        { x: 700, y: 420, r: 40, mass: 140, kind: 'gas', ring: -0.3, label: 'Tamsin' },
        { x: 450, y: 560, r: 30, mass: -50, kind: 'repulsor', label: 'Void' }
      ],
      beacons: [
        { x: 361, y: 323, r: 20 },
        { x: 485, y: 404, r: 20 }
      ],
      hint: { angle: 341.56, speed: 151.5 }
    },
    {
      name: 'Gauntlet',
      brief: 'Three wells in a row. Chain them into one long arc.',
      start: { x: 120, y: 360 },
      bodies: [
        { x: 380, y: 240, r: 34, mass: 110, kind: 'rock', label: 'Oro' },
        { x: 640, y: 470, r: 36, mass: 125, kind: 'gas', ring: -0.3, label: 'Fennic' },
        { x: 900, y: 250, r: 34, mass: 110, kind: 'star', label: 'Quill' }
      ],
      beacons: [
        { x: 294, y: 122, r: 20 },
        { x: 973, y: 287, r: 20 },
        { x: 488, y: 293, r: 20 }
      ],
      hint: { angle: 231.34, speed: 156.9 }
    },
    {
      name: 'The Wall',
      brief: 'Three planets stand in a line. Find a gap, then come back for the rest.',
      start: { x: 140, y: 360 },
      bodies: [
        { x: 600, y: 140, r: 36, mass: 110, kind: 'rock', label: 'Wen' },
        { x: 600, y: 360, r: 40, mass: 130, kind: 'gas', ring: 0.25, label: 'Harrow' },
        { x: 600, y: 580, r: 36, mass: 110, kind: 'rock', label: 'Isk' }
      ],
      beacons: [
        { x: 554, y: 240, r: 20 },
        { x: 1065, y: 559, r: 20 }
      ],
      hint: { angle: 202.91, speed: 139.2 }
    },
    {
      name: 'Return to Sender',
      brief: 'Out round the star, off the bumper behind it, and all the way home.',
      start: { x: 160, y: 360 },
      bodies: [
        { x: 680, y: 360, r: 42, mass: 170, kind: 'star', label: 'Lantern' },
        { x: 1010, y: 360, r: 26, mass: -60, kind: 'repulsor', label: 'Ward' }
      ],
      beacons: [
        { x: 704, y: 223, r: 20 },
        { x: 116, y: 530, r: 20 }
      ],
      hint: { angle: 51.75, speed: 139.3 }
    },
    {
      name: 'Grand Loop',
      brief: 'Four beacons, four bodies, one launch to tie them all together.',
      start: { x: 120, y: 620 },
      bodies: [
        { x: 340, y: 400, r: 32, mass: 100, kind: 'rock', label: 'Sol' },
        { x: 640, y: 220, r: 36, mass: 120, kind: 'gas', ring: 0.3, label: 'Corva' },
        { x: 820, y: 560, r: 30, mass: -40, kind: 'repulsor', label: 'Shun' },
        { x: 1000, y: 330, r: 18, mass: 130, kind: 'hole', label: 'Deep' }
      ],
      beacons: [
        { x: 98, y: 460, r: 20 },
        { x: 401, y: 304, r: 20 },
        { x: 943, y: 300, r: 20 },
        { x: 962, y: 598, r: 20 }
      ],
      hint: { angle: 225.57, speed: 120.4 }
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.LEVELS = LEVELS;
})(typeof self !== 'undefined' ? self : this);
