// Time-of-day + weather -> every lighting/sky/fog uniform. Pure maths, no THREE objects created here.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const grey = (c, k) => { const g = (c[0] + c[1] + c[2]) / 3; return [mix(c[0], g, k), mix(c[1], g, k), mix(c[2], g, k)]; };

const NIGHT_H = [0.028, 0.038, 0.070], NIGHT_Z = [0.004, 0.007, 0.020];
const DAY_H = [0.55, 0.70, 0.90], DAY_Z = [0.07, 0.20, 0.56];
const GOLD_H = [0.95, 0.46, 0.20], GOLD_Z = [0.05, 0.07, 0.20];

const info = { sunY: 1, day: 1, night: 0 };

/** @param {number} hour 0..24  @param {{cloud,dark}} w eased weather  @param {number} flash lightning 0..1 */
export function applyEnvironment(SH, hour, w, flash) {
  const a = ((hour - 6) / 24) * Math.PI * 2;                       // sunrise at 06:00, noon overhead
  const L = Math.hypot(Math.cos(a) * 0.85, Math.sin(a), 0.45);
  const sun = [Math.cos(a) * 0.85 / L, Math.sin(a) / L, 0.45 / L], sunY = sun[1];
  const moon = [-sun[0], -sun[1], -sun[2]];
  const day = sstep(-0.10, 0.28, sunY);
  const night = 1 - sstep(-0.06, 0.24, sunY);
  const golden = Math.exp(-Math.pow((sunY - 0.04) / 0.2, 2));
  const clear = 1 - w.cloud * 0.5;

  let hor = mix3(NIGHT_H, DAY_H, day); hor = mix3(hor, GOLD_H, Math.min(1, golden * 0.75) * clear);
  let zen = mix3(NIGHT_Z, DAY_Z, day); zen = mix3(zen, GOLD_Z, golden * 0.45 * clear);
  const dk = 1 - w.dark * 0.6;
  hor = grey(hor, w.cloud * 0.65).map((v) => v * dk); zen = grey(zen, w.cloud * 0.8).map((v) => v * dk);
  const fl = 1 + flash * 2.5;
  SH.uFog.value.setRGB(hor[0] * fl, hor[1] * fl, hor[2] * fl);
  SH.uZenith.value.setRGB(zen[0], zen[1], zen[2]);

  // The key light is the sun by day and the moon by night; both fade to ~0 at the swap, so nothing pops.
  const kd = sunY > 0 ? sun : moon;
  SH.uKeyDir.value.set(kd[0], kd[1], kd[2]).normalize();
  const warm = mix3([1.0, 0.45, 0.18], [1.0, 0.95, 0.86], sstep(0.04, 0.45, sunY));
  const sunI = sstep(0, 0.22, sunY) * 2.1 * (1 - w.cloud * 0.7);
  const moonI = sstep(0, -0.18, sunY) * 0.85 * (1 - w.cloud * 0.6);
  if (sunY > 0) SH.uKeyCol.value.setRGB(warm[0] * sunI, warm[1] * sunI, warm[2] * sunI);
  else SH.uKeyCol.value.setRGB(0.25 * moonI, 0.34 * moonI, 0.62 * moonI);

  const hs = mix3(zen, hor, 0.45);
  const amb = mix3([0.05, 0.07, 0.13], hs.map((v) => v * 0.95), day);
  SH.uHemiSky.value.setRGB(amb[0] + hor[0] * golden * 0.2, amb[1] + hor[1] * golden * 0.2, amb[2] + hor[2] * golden * 0.2);
  const gnd = mix3([0.025, 0.022, 0.02], [0.16, 0.15, 0.13], day);
  SH.uHemiGround.value.setRGB(gnd[0] + 0.12 * golden * clear, gnd[1] + 0.06 * golden * clear, gnd[2] + 0.02 * golden * clear);
  const fill = mix3([0.16, 0.09, 0.04], [0.10, 0.12, 0.17], day);
  SH.uFillCol.value.setRGB(fill[0], fill[1], fill[2]);

  const gl = golden * 0.35 * (1 - w.cloud * 0.6) * (sunY > -0.1 ? 1 : 0);
  SH.uSunGlow.value.setRGB(1.0 * gl + 0.016 * day, 0.6 * gl + 0.016 * day, 0.3 * gl + 0.014 * day);
  SH.uSunCol.value.setRGB(warm[0], warm[1], warm[2]).multiplyScalar(sstep(-0.05, 0.1, sunY));
  SH.uSunDir.value.set(sun[0], sun[1], sun[2]);
  SH.uMoonDir.value.set(moon[0], moon[1], moon[2]);
  SH.uNight.value = night;
  info.sunY = sunY; info.day = day; info.night = night;
  return info;
}

export const formatHour = (h) => {
  const m = Math.round(((h % 24) + 24) % 24 * 60) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
