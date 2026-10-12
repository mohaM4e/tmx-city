// Bootstrap: load data, build the world, wire modules together, run the frame loop and the quality governor.
import * as THREE from 'three';
import { DEFAULTS, LEVELS, LOT } from './config.js';
import { loadUsers, selectUsers } from './data.js';
import { createWorld, SH } from './world.js';
import { createCity } from './city.js';
import { createTraffic } from './traffic.js';
import { createModes } from './modes.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { decode } from './share.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gfx = { ...DEFAULTS.gfx }, state = { ...DEFAULTS.state }, env = { ...DEFAULTS.env };
try {
  const s = JSON.parse(localStorage.getItem('tmxCity') || 'null');
  if (s) { Object.assign(gfx, s.gfx); Object.assign(state, s.state); Object.assign(env, s.env); }
} catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem('tmxCity', JSON.stringify({ gfx, state, env })); } catch { /* ignore */ } };

const world = createWorld(gfx, env);
const { camera } = world;
const { users: all, demo } = await loadUsers();
const city = createCity(world), traffic = createTraffic(world);
const modes = createModes({ world, city, state, canvas: world.renderer.domElement });
const audio = createAudio();
world.onThunder = () => audio.thunder();

// ---- quality governor: reacts in ~1 s, never retries a failed level for 25 s
let settle = 3, accMs = 0, nAcc = 0, good = 0, ceiling = LEVELS.length - 1, ceilUntil = 0, fps = 0, t = 0;
function applyLevel(L) {
  gfx.level = Math.max(0, Math.min(LEVELS.length - 1, L)); Object.assign(gfx, LEVELS[gfx.level]);
  world.setRes(gfx.res); ui && ui.sync(); save();
}
function setColorMode(m) { state.colorMode = m; SH.uMode.value = m; ui.drawMinimapBase(); ui.sync(); save(); }
let rebuildTimer = 0, ui;
async function rebuild() {
  const list = selectUsers(all, state);
  await city.build(list, { hScale: state.hScale }, (m, p) => ui && ui.loading(m, p));
  SH.uBound.value = city.bound();
  if (ui) ui.onBuilt();
}
const actions = {
  save, applyLevel, setColorMode, resetGovernor() { ceiling = LEVELS.length - 1; settle = 1; },
  rebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => { rebuild().then(() => modes.flyTo(0)); }, 30); },
  reset() { try { localStorage.removeItem('tmxCity'); } catch { /* ignore */ } location.reload(); },
};
ui = createUI({ world, city, modes, audio, gfx, state, env, all, demo, actions });
ui.loading('Reading players…', 0.1);
world.setRes(gfx.res);
if (gfx.auto) applyLevel(gfx.level);
SH.uMode.value = state.colorMode;
await rebuild();

// ---- starting view: a shared link, or a sweep in over downtown
const shared = decode(location.hash);
if (shared) {
  if (Number.isFinite(shared.hour)) env.hour = shared.hour;
  if (shared.weather) env.weather = shared.weather;
  modes.snap(new THREE.Vector3(...shared.pos), new THREE.Vector3(...shared.tgt));
  const i = shared.player ? city.lowerNames.indexOf(shared.player.toLowerCase()) : -1;
  if (i >= 0) ui.select(i);
} else {
  modes.flyTo(0, 160);
  modes.controls.target.copy(modes.tgtGoal);
  if (reduced) camera.position.copy(modes.camGoal); else camera.position.set(modes.camGoal.x * 2.4, modes.camGoal.y * 2.6 + 160, modes.camGoal.z * 2.4);
}
state.sound = false;   // browsers need a click before audio can start
ui.ready();

// ---- frame loop
let last = performance.now(), frameNo = 0;
function frame() {
  const now = performance.now(), rawDt = (now - last) / 1000; last = now;
  const dt = Math.min(rawDt, 0.1); t += dt; frameNo++;

  modes.update(dt);
  const e = world.stepEnvironment(dt, t, reduced);

  // fog and draw distance scale with altitude so the overview can still see the whole city
  const alt = camera.position.y, mult = Math.min(4, 1 + alt / 400);
  const visDist = Math.max(250, (gfx.view * mult) / (gfx.fogMul * e.fog));
  SH.uFogD.value = 1.8 / visDist;
  SH.uWinDist.value = gfx.win; SH.uDetail.value = gfx.win > 0 ? 1 : 0; SH.uCarDist.value = Math.min(380, visDist * 0.35);
  const near = THREE.MathUtils.clamp(0.25 + alt * 0.012, 0.3, 6);
  if (Math.abs(near - camera.near) > camera.near * 0.05) { camera.near = near; camera.updateProjectionMatrix(); }

  city.update(camera, visDist, alt > 150 ? 0 : gfx.props);
  traffic.setCount(alt > 350 ? 0 : gfx.cars);
  const drops = Math.floor(e.rain * gfx.rain);
  world.rain.visible = drops > 0; world.rainGeo.setDrawRange(0, drops * 2);
  world.sky.position.copy(camera.position);
  audio.update({ alt, rain: e.rain, speed: modes.car.speed, driving: modes.mode === 'drive' });
  ui.frame(dt);
  world.render(dt);

  if (settle > 0) { settle -= dt; return; }
  accMs += rawDt * 1000; nAcc++;
  if (nAcc < 24) return;
  const avg = accMs / nAcc; accMs = 0; nAcc = 0; fps = 1000 / avg;
  globalThis.tmxCity.fps = fps;
  if (!gfx.auto) return;
  if (t > ceilUntil) ceiling = LEVELS.length - 1;
  if (avg > 24 && gfx.level > 0) { ceiling = gfx.level - 1; ceilUntil = t + 25; applyLevel(gfx.level - 1); settle = 0.6; good = 0; }
  else if (avg < 17.5 && gfx.level < ceiling) { if (++good >= 5) { good = 0; applyLevel(gfx.level + 1); settle = 0.6; } }
  else good = 0;
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); world.setRes(gfx.res); });
globalThis.tmxCity = { world, city, modes, ui, gfx, state, env, traffic, frame, fps: 0, LOT };   // debug handle (also used by the smoke test)
world.renderer.setAnimationLoop(frame);
