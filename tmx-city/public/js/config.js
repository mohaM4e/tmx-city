// Shared constants. World units are metres.
export const LOT = 14;            // one building lot (m)
export const STREET_EVERY = 5;    // every 5th lot line is a street (4 lots + 1 street = one 70 m block)
export const CHUNK = 16;          // lots per chunk side: the unit of draw-call culling
export const RAIN_MAX = 9000;
export const MAX_CARS = 2400;

export const LEVEL_NAMES = ['Potato', 'Very low', 'Low', 'Medium', 'High', 'Very high', 'Ultra'];
// res = pixel ratio, view = draw distance (m), win = window-detail range (m), props = street furniture range (m)
export const LEVELS = [
  { res: 0.50, view:  600, rain:    0, glow: 0,    win:    0, cars:    0, props:   0 },
  { res: 0.60, view:  800, rain:    0, glow: 0,    win:  250, cars:  150, props: 120 },
  { res: 0.75, view: 1000, rain:    0, glow: 0,    win:  380, cars:  350, props: 220 },
  { res: 0.90, view: 1300, rain: 3000, glow: 0,    win:  520, cars:  700, props: 380 },
  { res: 1.00, view: 1650, rain: 5000, glow: 0.45, win:  700, cars: 1000, props: 520 },
  { res: 1.25, view: 2100, rain: 7000, glow: 0.60, win:  900, cars: 1500, props: 700 },
  { res: 1.50, view: 2700, rain: 9000, glow: 0.80, win: 1100, cars: 2200, props: 900 },
];

export const WEATHER = {
  clear:  { label: 'Clear',  cloud: 0.22, dark: 0.00, fog: 1.0, rain: 0,   lightning: false },
  cloudy: { label: 'Cloudy', cloud: 0.72, dark: 0.30, fog: 1.2, rain: 0,   lightning: false },
  rain:   { label: 'Rain',   cloud: 0.88, dark: 0.50, fog: 1.6, rain: 0.6, lightning: false },
  storm:  { label: 'Storm',  cloud: 1.00, dark: 0.75, fog: 2.0, rain: 1.0, lightning: true },
};
export const TIME_PRESETS = { Dawn: 6.4, Day: 13, 'Golden hour': 18.3, Night: 23 };

// Districts by rank (position in the spiral), shown on the street sign.
export const DISTRICTS = [
  [60, 'Central Business District'], [600, 'Downtown'], [3500, 'Midtown'],
  [12000, 'Uptown'], [35000, 'Residential'], [Infinity, 'Outskirts'],
];

export const DEFAULTS = {
  gfx: { auto: true, level: 3, res: 0.9, view: 1300, fogMul: 1, win: 520, cars: 700, props: 380, rain: 3000, glow: 0, lightning: true },
  state: { order: 'maps', topN: 0, minMaps: 0, minAwards: 0, hScale: 1, speed: 60, colorMode: 0, sound: false },
  env: { hour: 18.6, weather: 'clear', auto: false, dayMinutes: 8 },
};
