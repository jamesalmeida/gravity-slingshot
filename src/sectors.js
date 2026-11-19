// Eight handcrafted star systems. World is 1200 x 720; hintAngle is in screen degrees (0 = right, 90 = down).
// `npm run check` brute-forces every launch to prove each sector can be cleared in one shot.
(function (root) {
  'use strict';

  const SECTORS = [
    {
      id: 1,
      name: 'KEPLER BEND',
      brief: 'GRAVITY ASSIST AROUND SOL-1 TO LOCK DEEP RELAY',
      probe: { x: 170, y: 430 },
      hintAngle: -48,
      hintSpeed: 280,
      bodies: [
        { x: 600, y: 340, r: 44, mass: 130, type: 'star', label: 'SOL-A' }
      ],
      relays: [
        { x: 960, y: 410, r: 24, code: 'RLY-01' }
      ]
    },
    {
      id: 2,
      name: 'OBERTH SLINGSHOT',
      brief: 'DIVE INTO GAS GIANT WELL TO WHIP ACROSS DUAL RELAYS',
      probe: { x: 175, y: 520 },
      hintAngle: -58,
      hintSpeed: 330,
      bodies: [
        { x: 580, y: 310, r: 46, mass: 175, type: 'giant', ring: true, tilt: -0.32, label: 'JOVE-IV' }
      ],
      relays: [
        { x: 675, y: 160, r: 24, code: 'RLY-01' },
        { x: 1015, y: 165, r: 24, code: 'RLY-02' }
      ]
    },
    {
      id: 3,
      name: 'LAGRANGE CORRIDOR',
      brief: 'THREAD THE L1 SADDLE BETWEEN TWIN STARS',
      probe: { x: 150, y: 360 },
      hintAngle: -6,
      hintSpeed: 315,
      bodies: [
        { x: 510, y: 185, r: 36, mass: 120, type: 'star', label: 'ALPHA-N' },
        { x: 510, y: 535, r: 36, mass: 120, type: 'star', label: 'ALPHA-S' },
        { x: 870, y: 390, r: 36, mass: 135, type: 'giant', label: 'KRONOS' }
      ],
      relays: [
        { x: 510, y: 340, r: 24, code: 'L1-NODE' },
        { x: 1030, y: 335, r: 24, code: 'RLY-02' }
      ]
    },
    {
      id: 4,
      name: 'FIGURE-EIGHT TRANSFER',
      brief: 'CROSS THE BINARY SADDLE FOR A FREE-RETURN S-CURVE',
      probe: { x: 150, y: 505 },
      hintAngle: -52,
      hintSpeed: 295,
      bodies: [
        { x: 435, y: 360, r: 38, mass: 135, type: 'giant', ring: true, tilt: 0.28, label: 'HELIOS-B' },
        { x: 800, y: 360, r: 40, mass: 145, type: 'star', label: 'HELIOS-A' }
      ],
      relays: [
        { x: 455, y: 215, r: 24, code: 'RLY-N' },
        { x: 830, y: 510, r: 24, code: 'RLY-S' }
      ]
    },
    {
      id: 5,
      name: 'ROCHE LIMIT',
      brief: 'SKIM PAST THE SINGULARITY USING THE OUTER GAS GIANT',
      probe: { x: 150, y: 410 },
      hintAngle: -47,
      hintSpeed: 375,
      bodies: [
        { x: 540, y: 375, r: 26, mass: 150, type: 'hazard', label: 'PSR-X9' },
        { x: 650, y: 175, r: 34, mass: 115, type: 'giant', label: 'VESTA' }
      ],
      relays: [
        { x: 835, y: 285, r: 24, code: 'RLY-01' },
        { x: 960, y: 525, r: 24, code: 'RLY-02' }
      ]
    },
    {
      id: 6,
      name: 'TRIPLE RESONANCE',
      brief: 'CHAIN THREE GRAVITY WELLS IN ONE CONTINUOUS ARC',
      probe: { x: 140, y: 495 },
      hintAngle: -59,
      hintSpeed: 365,
      bodies: [
        { x: 405, y: 275, r: 34, mass: 115, type: 'giant', label: 'TRITON' },
        { x: 660, y: 470, r: 36, mass: 130, type: 'star', label: 'CYGNUS' },
        { x: 910, y: 255, r: 34, mass: 120, type: 'giant', ring: true, tilt: -0.25, label: 'ORION' }
      ],
      relays: [
        { x: 462, y: 225, r: 24, code: 'RLY-01' },
        { x: 805, y: 402, r: 24, code: 'RLY-02' },
        { x: 1034, y: 573, r: 24, code: 'RLY-03' }
      ]
    },
    {
      id: 7,
      name: 'BINARY REBOUND',
      brief: 'EXECUTE A 180° BINARY BOOMERANG RETURN TRANSFER',
      probe: { x: 240, y: 220 },
      hintAngle: -20,
      hintSpeed: 290,
      bodies: [
        { x: 730, y: 290, r: 34, mass: 145, type: 'star', label: 'CASTOR' },
        { x: 730, y: 450, r: 34, mass: 145, type: 'star', label: 'POLLUX' }
      ],
      relays: [
        { x: 910, y: 370, r: 24, code: 'APO-01' },
        { x: 350, y: 530, r: 24, code: 'RET-02' }
      ]
    },
    {
      id: 8,
      name: 'VOYAGER GRAND TOUR',
      brief: 'FOUR-BODY DEEP SPACE ALIGNMENT ACROSS THE OUTER SYSTEM',
      probe: { x: 125, y: 520 },
      hintAngle: -63,
      hintSpeed: 290,
      bodies: [
        { x: 350, y: 365, r: 34, mass: 120, type: 'star', label: 'SOL-PRIME' },
        { x: 605, y: 215, r: 36, mass: 130, type: 'giant', ring: true, tilt: 0.24, label: 'SATURNUS' },
        { x: 750, y: 500, r: 32, mass: 120, type: 'planet', label: 'NEPTUNIS' },
        { x: 970, y: 295, r: 24, mass: 130, type: 'hazard', label: 'KUIPER-X' }
      ],
      relays: [
        { x: 431, y: 318, r: 24, code: 'GT-01' },
        { x: 801, y: 419, r: 24, code: 'GT-02' },
        { x: 1055, y: 553, r: 24, code: 'GT-03' }
      ]
    }
  ];


  if (typeof module !== 'undefined' && module.exports) module.exports = SECTORS;
  else root.SECTORS = SECTORS;
})(typeof self !== 'undefined' ? self : this);
