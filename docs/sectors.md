# Sector table

Measured by `npm run check:sweep`, which flies every launch on a 0.5° × 6 px/s grid (57,600 launches per sector). Regenerate with `npm run docs:sectors`.

- **Win %**: share of all launches that clear the sector. Lower is harder.
- **Seen**: share of those wins the on-screen predictor shows to the end (it looks 310 frames ahead).
- **Forgives**: aiming error the recorded solution tolerates, as an unbroken range of azimuth and of launch speed.
- **Turn**: how far the recorded solution's heading turns before the last relay.
- **Difficulty**: `-log10(win share × (0.35 + 0.65 × seen))`. One point is ten times harder.

## THE ORIGINAL EIGHT

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 001 | KEPLER BEND | 1 | 1 | 1.66 | 79% | 3.1° / 2.21 km/s | 30° | 1.84 |
| 002 | OBERTH SLINGSHOT | 1 | 2 | 0.23 | 100% | 2.1° / 0.82 km/s | 61° | 2.63 |
| 003 | LAGRANGE CORRIDOR | 3 | 2 | 1.07 | 68% | 1.5° / 5.76 km/s | 42° | 2.07 |
| 004 | FIGURE-EIGHT TRANSFER | 2 | 2 | 0.68 | 51% | 14.9° / 0.48 km/s | 258° | 2.33 |
| 005 | ROCHE LIMIT | 2 | 2 | 0.25 | 36% | 9.0° / 0.43 km/s | 530° | 2.84 |
| 006 | TRIPLE RESONANCE | 3 | 3 | 0.08 | 83% | 0.4° / 0.14 km/s | 97° | 3.15 |
| 007 | BINARY REBOUND | 2 | 2 | 0.71 | 31% | 16.0° / 0.58 km/s | 182° | 2.41 |
| 008 | VOYAGER GRAND TOUR | 4 | 3 | 0.13 | 65% | 2.4° / 0.00 km/s | 200° | 2.99 |

## SINGLE WELL

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 009 | ZWICKY BOOMERANG | 1 | 2 | 1.47 | 97% | 16.0° / 1.15 km/s | 190° | 1.84 |
| 010 | APOLLONIUS TRANSFER | 1 | 2 | 1.58 | 75% | 12.3° / 1.58 km/s | 93° | 1.88 |
| 011 | JOHNSON RETURN | 1 | 2 | 1.15 | 88% | 16.0° / 1.30 km/s | 302° | 1.98 |
| 012 | HIPPARCHUS HOOK | 1 | 2 | 1.33 | 66% | 10.6° / 1.10 km/s | 145° | 1.98 |
| 013 | KOROLEV BEND | 1 | 2 | 0.92 | 87% | 6.5° / 1.44 km/s | 102° | 2.07 |
| 014 | ENCKE SWINGBY | 1 | 2 | 0.83 | 100% | 3.5° / 5.14 km/s | 52° | 2.08 |
| 015 | KELDYSH ASSIST | 1 | 2 | 0.74 | 93% | 6.1° / 1.44 km/s | 106° | 2.15 |
| 016 | MITCHELL ARC | 1 | 2 | 0.57 | 100% | 2.9° / 4.13 km/s | 51° | 2.24 |
| 017 | BURNELL DEFLECTION | 1 | 2 | 0.66 | 75% | 5.8° / 0.91 km/s | 130° | 2.26 |
| 018 | NEWTON SWINGBY | 1 | 2 | 0.43 | 100% | 2.6° / 2.78 km/s | 62° | 2.36 |
| 019 | SCHMITT ARC | 1 | 2 | 0.46 | 85% | 4.0° / 1.06 km/s | 119° | 2.38 |
| 020 | HADFIELD ASSIST | 1 | 2 | 0.41 | 99% | 6.1° / 1.01 km/s | 106° | 2.39 |

## BINARY SYSTEMS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 021 | HERSCHEL BEND | 2 | 2 | 1.02 | 66% | 3.0° / 0.96 km/s | 79° | 2.10 |
| 022 | LEONOV DEFLECTION | 2 | 2 | 0.87 | 47% | 1.9° / 1.34 km/s | 84° | 2.24 |
| 023 | CLARKE TRANSFER | 2 | 2 | 0.49 | 92% | 2.5° / 1.34 km/s | 79° | 2.33 |
| 024 | GAMOW DEFLECTION | 2 | 2 | 0.43 | 95% | 3.0° / 0.77 km/s | 69° | 2.38 |
| 025 | SHEPARD SWINGBY | 2 | 2 | 0.54 | 62% | 3.5° / 0.82 km/s | 87° | 2.39 |
| 026 | TYCHO CRESCENT | 2 | 2 | 0.71 | 34% | 16.0° / 0.86 km/s | 149° | 2.40 |
| 027 | HAMILTON RECALL | 2 | 2 | 0.69 | 34% | 3.0° / 2.26 km/s | 238° | 2.41 |
| 028 | LISSAJOUS ASSIST | 2 | 2 | 0.42 | 89% | 4.4° / 0.82 km/s | 88° | 2.41 |
| 029 | FLAMSTEED TRANSFER | 2 | 2 | 0.29 | 95% | 3.0° / 0.91 km/s | 107° | 2.55 |
| 030 | VAUGHAN REBOUND | 2 | 2 | 0.38 | 39% | 5.3° / 0.96 km/s | 252° | 2.64 |

## EVENT HORIZONS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 031 | AL-SUFI PLUNGE | 2 | 2 | 0.75 | 97% | 10.3° / 0.82 km/s | 96° | 2.13 |
| 032 | TUNDRA SKIM | 2 | 2 | 0.60 | 93% | 4.0° / 1.10 km/s | 80° | 2.24 |
| 033 | FERMI HORIZON | 2 | 2 | 0.56 | 77% | 5.5° / 0.67 km/s | 132° | 2.33 |
| 034 | KOVALEVSKAYA KNIFE-EDGE | 3 | 2 | 0.47 | 97% | 3.9° / 0.86 km/s | 91° | 2.33 |
| 035 | DYSON GRAZE | 2 | 2 | 0.45 | 89% | 3.4° / 0.77 km/s | 74° | 2.38 |
| 036 | JACKSON KNIFE-EDGE | 2 | 2 | 0.52 | 66% | 7.1° / 0.77 km/s | 95° | 2.39 |
| 037 | BOK PLUNGE | 2 | 2 | 0.48 | 76% | 6.3° / 0.82 km/s | 84° | 2.40 |
| 038 | PEAKE SKIM | 2 | 2 | 0.66 | 25% | 11.9° / 1.01 km/s | 150° | 2.47 |
| 039 | KRANZ GRAZE | 2 | 2 | 0.36 | 89% | 2.9° / 0.72 km/s | 86° | 2.47 |
| 040 | THORNE HORIZON | 2 | 2 | 0.44 | 53% | 6.3° / 0.67 km/s | 377° | 2.51 |

## TRIPLE CHAINS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 041 | DRAKE SLALOM | 3 | 3 | 0.60 | 44% | 3.1° / 0.53 km/s | 125° | 2.41 |
| 042 | TOMBAUGH RELAY RUN | 3 | 3 | 0.48 | 56% | 5.9° / 0.77 km/s | 150° | 2.46 |
| 043 | VERNE REBOUND | 3 | 3 | 0.35 | 74% | 4.9° / 0.77 km/s | 294° | 2.53 |
| 044 | BRAHE CASCADE | 3 | 3 | 0.25 | 93% | 3.6° / 0.58 km/s | 88° | 2.63 |
| 045 | HYPATIA LADDER | 3 | 3 | 0.34 | 41% | 4.4° / 1.25 km/s | 123° | 2.67 |
| 046 | NOETHER TRAVERSE | 3 | 3 | 0.19 | 100% | 2.6° / 0.58 km/s | 88° | 2.73 |
| 047 | HUYGENS BOOMERANG | 3 | 3 | 0.25 | 50% | 3.1° / 1.39 km/s | 240° | 2.77 |
| 048 | LOWELL RETURN | 3 | 3 | 0.26 | 43% | 5.1° / 1.01 km/s | 254° | 2.79 |
| 049 | BRADLEY CHAIN | 3 | 3 | 0.15 | 49% | 2.4° / 1.10 km/s | 156° | 3.00 |
| 050 | BANNEKER RECALL | 3 | 3 | 0.14 | 46% | 2.4° / 0.72 km/s | 244° | 3.05 |

## REPULSOR FIELDS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 051 | LAPLACE DEFLECTOR | 3 | 2 | 0.71 | 75% | 1.8° / 0.67 km/s | 135° | 2.22 |
| 052 | ULUGH-BEG BANK SHOT | 2 | 2 | 0.58 | 98% | 2.4° / 2.16 km/s | 67° | 2.24 |
| 053 | HAWKING MIRROR | 2 | 2 | 0.43 | 100% | 3.5° / 2.16 km/s | 115° | 2.36 |
| 054 | KHAYYAM CAROM | 2 | 2 | 0.48 | 81% | 3.3° / 0.96 km/s | 264° | 2.37 |
| 055 | LEAVITT BUMPER | 2 | 2 | 0.41 | 97% | 8.4° / 1.01 km/s | 190° | 2.40 |
| 056 | CONRAD RICOCHET | 2 | 2 | 0.31 | 100% | 3.1° / 2.02 km/s | 60° | 2.51 |
| 057 | BAADE MIRROR | 3 | 2 | 0.26 | 100% | 2.5° / 2.88 km/s | 136° | 2.59 |
| 058 | BESSEL CAROM | 2 | 2 | 0.19 | 91% | 2.0° / 0.86 km/s | 99° | 2.75 |
| 059 | PTOLEMY BANK SHOT | 2 | 2 | 0.18 | 94% | 1.8° / 1.58 km/s | 134° | 2.77 |
| 060 | MOLNIYA DEFLECTOR | 2 | 2 | 0.24 | 42% | 5.0° / 0.67 km/s | 137° | 2.83 |

## NARROW BEACONS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 061 | COLLINS KEYHOLE | 2 | 3 | 0.35 | 80% | 16.0° / 0.53 km/s | 307° | 2.51 |
| 062 | RUBIN PINHOLE | 3 | 2 | 0.31 | 76% | 1.5° / 0.58 km/s | 97° | 2.59 |
| 063 | LOVELL THREAD | 2 | 2 | 0.23 | 83% | 2.3° / 0.53 km/s | 82° | 2.69 |
| 064 | HOHMANN APERTURE | 2 | 2 | 0.29 | 38% | 14.5° / 0.43 km/s | 152° | 2.76 |
| 065 | CASSINI NEEDLE | 3 | 3 | 0.17 | 100% | 3.1° / 0.62 km/s | 150° | 2.77 |
| 066 | MARIUS KEYHOLE | 2 | 3 | 0.15 | 100% | 4.8° / 0.53 km/s | 77° | 2.83 |
| 067 | TSIEN THREAD | 2 | 3 | 0.14 | 100% | 1.6° / 0.48 km/s | 95° | 2.84 |
| 068 | LEMAITRE APERTURE | 2 | 3 | 0.14 | 100% | 1.3° / 0.67 km/s | 79° | 2.87 |
| 069 | SOMERVILLE NEEDLE | 2 | 2 | 0.16 | 70% | 2.1° / 0.43 km/s | 83° | 2.89 |
| 070 | ZHANG-HENG PINHOLE | 2 | 2 | 0.17 | 39% | 4.8° / 0.86 km/s | 236° | 3.00 |

## BLIND TRANSFERS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 071 | CERNAN FAR SIDE | 3 | 2 | 0.47 | 1% | 3.6° / 0.86 km/s | 312° | 2.78 |
| 072 | CANNON DEAD RECKONING | 3 | 2 | 0.43 | 0% | 16.0° / 0.96 km/s | 424° | 2.83 |
| 073 | HEVELIUS ODYSSEY | 2 | 2 | 0.34 | 0% | 12.5° / 0.91 km/s | 402° | 2.93 |
| 074 | GAGARIN DARK LEG | 3 | 2 | 0.28 | 0% | 10.3° / 1.01 km/s | 291° | 3.00 |
| 075 | GALILEO DRIFT | 2 | 2 | 0.23 | 0% | 5.8° / 0.58 km/s | 354° | 3.10 |
| 076 | MESSIER LONG HAUL | 2 | 2 | 0.21 | 0% | 1.9° / 0.72 km/s | 374° | 3.14 |
| 077 | ARYABHATA FAR SIDE | 2 | 2 | 0.18 | 2% | 8.5° / 0.53 km/s | 165° | 3.20 |
| 078 | ARMSTRONG DEAD RECKONING | 2 | 2 | 0.15 | 0% | 4.3° / 0.77 km/s | 378° | 3.27 |
| 079 | PAYNE DRIFT | 2 | 2 | 0.12 | 1% | 2.8° / 0.62 km/s | 372° | 3.36 |
| 080 | STRUVE DARK LEG | 2 | 2 | 0.10 | 0% | 3.9° / 0.58 km/s | 390° | 3.48 |

## CROWDED SKIES

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 081 | POINCARE RELAY RUN | 5 | 3 | 0.26 | 70% | 1.9° / 1.01 km/s | 158° | 2.67 |
| 082 | SCHWARZSCHILD RECALL | 4 | 3 | 0.19 | 95% | 16.0° / 0.58 km/s | 191° | 2.73 |
| 083 | KERR LADDER | 4 | 3 | 0.19 | 91% | 4.4° / 0.43 km/s | 128° | 2.75 |
| 084 | OORT SLALOM | 5 | 3 | 0.20 | 76% | 7.0° / 0.38 km/s | 176° | 2.76 |
| 085 | SAGAN CASCADE | 4 | 3 | 0.17 | 93% | 15.9° / 0.43 km/s | 118° | 2.80 |
| 086 | EULER TRAVERSE | 4 | 3 | 0.16 | 96% | 3.3° / 1.06 km/s | 140° | 2.81 |
| 087 | LE VERRIER CHAIN | 4 | 3 | 0.15 | 100% | 5.0° / 1.44 km/s | 152° | 2.82 |
| 088 | SHAPLEY LADDER | 4 | 3 | 0.17 | 23% | 2.0° / 0.53 km/s | 159° | 3.08 |
| 089 | SHEN-KUO TRAVERSE | 4 | 3 | 0.07 | 88% | 1.8° / 0.72 km/s | 118° | 3.20 |
| 090 | GLENN CASCADE | 5 | 3 | 0.09 | 22% | 11.5° / 0.38 km/s | 175° | 3.36 |

## GRAND TOURS

| # | Name | Bodies | Relays | Win % | Seen | Forgives | Turn | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 091 | TERESHKOVA EXPEDITION | 4 | 4 | 0.14 | 74% | 1.5° / 0.34 km/s | 185° | 2.93 |
| 092 | MELVILL CIRCUIT | 5 | 3 | 0.14 | 52% | 2.5° / 0.29 km/s | 258° | 3.00 |
| 093 | HOYLE PILGRIMAGE | 5 | 3 | 0.10 | 56% | 3.3° / 0.77 km/s | 198° | 3.14 |
| 094 | PENROSE ALIGNMENT | 5 | 4 | 0.08 | 52% | 1.8° / 0.77 km/s | 273° | 3.24 |
| 095 | ALDRIN GRAND TOUR | 5 | 4 | 0.09 | 49% | 2.3° / 0.48 km/s | 261° | 3.25 |
| 096 | CHANDRA CROSSING | 4 | 3 | 0.07 | 45% | 2.1° / 0.48 km/s | 275° | 3.37 |
| 097 | JEMISON EXPEDITION | 4 | 4 | 0.05 | 58% | 1.4° / 0.38 km/s | 186° | 3.41 |
| 098 | COPERNICUS GRAND TOUR | 4 | 4 | 0.04 | 64% | 1.8° / 0.43 km/s | 213° | 3.48 |
| 099 | OLBERS CIRCUIT | 5 | 4 | 0.04 | 55% | 1.0° / 0.67 km/s | 268° | 3.57 |
| 100 | HALLEY PILGRIMAGE | 5 | 4 | 0.04 | 45% | 1.8° / 0.72 km/s | 214° | 3.61 |
