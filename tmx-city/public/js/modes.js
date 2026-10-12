// Camera modes: orbit (inspect), fly (free camera), walk (first person) and drive (arcade car).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LOT } from './config.js';
import { SH, partMaterial } from './world.js';

const clamp = THREE.MathUtils.clamp;
export const MODES = ['orbit', 'fly', 'walk', 'drive'];

export function createModes({ world, city, state, canvas }) {
  const { camera } = world;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 6; controls.maxDistance = 6000;

  let mode = 'orbit';
  const listeners = [];
  const camGoal = new THREE.Vector3(), tgtGoal = new THREE.Vector3();
  const keys = new Set();
  const dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  let yaw = 0, pitch = 0;
  const walk = { x: 0, z: 0, feet: 0, vy: 0, vx: 0, vz: 0, ground: true };
  const car = { x: 0, z: 0, h: 0, vx: 0, vz: 0, speed: 0, camH: 0 };

  // ---- the player's car (a few lit boxes)
  const carGroup = new THREE.Group(); carGroup.visible = false; world.scene.add(carGroup);
  const part = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); carGroup.add(m); };
  const body = partMaterial('#c8431b'), glass = partMaterial('#0b1118'), tyre = partMaterial('#08090a');
  part(1.9, 0.7, 4.4, 0, 0.7, 0, body); part(1.65, 0.62, 2.2, 0, 1.3, -0.25, glass); part(1.7, 0.1, 1.6, 0, 1.64, -0.25, body);
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.35, 1.35]) part(0.3, 0.7, 0.7, sx, 0.35, sz, tyre);
  for (const sx of [-0.65, 0.65]) { part(0.4, 0.2, 0.1, sx, 0.8, 2.2, partMaterial('#ffffff', [1.8, 1.7, 1.4])); part(0.4, 0.2, 0.1, sx, 0.8, -2.2, partMaterial('#330000', [1.4, 0.05, 0.03])); }

  // ---- input
  const typing = (e) => /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '');
  addEventListener('keydown', (e) => { if (typing(e)) return; keys.add(e.code); if (e.code === 'Space' && mode !== 'orbit') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  let dragLook = false;
  canvas.addEventListener('pointerdown', () => { dragLook = true; });
  addEventListener('pointerup', () => { dragLook = false; });
  document.addEventListener('mousemove', (e) => {
    if ((mode !== 'walk' && mode !== 'fly') || !(document.pointerLockElement === canvas || dragLook)) return;
    yaw -= (e.movementX || 0) * 0.0022; pitch = clamp(pitch - (e.movementY || 0) * 0.0022, -1.5, 1.5);
  });
  canvas.addEventListener('click', () => {
    if ((mode === 'walk' || mode === 'fly') && document.pointerLockElement !== canvas && canvas.requestPointerLock) canvas.requestPointerLock();
  });
  const down = (...c) => c.some((k) => keys.has(k));

  const lookFromCamera = () => {
    camera.getWorldDirection(dir); yaw = Math.atan2(-dir.x, -dir.z); pitch = Math.asin(clamp(dir.y, -1, 1));
  };
  const applyLook = () => camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const emit = () => listeners.forEach((f) => f(mode));
  const setFov = (f) => { if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); } };

  function focus() { return mode === 'orbit' ? controls.target : mode === 'drive' ? tmp.set(car.x, 0, car.z) : camera.position; }

  function spawn(x, z, hintYaw) {
    const s = city.nearestStreet(x, z), bound = city.bound() + LOT;
    if (mode === 'walk') {
      walk.x = clamp(s.axis === 'v' ? s.cx + 5.7 : s.cx, -bound, bound); walk.z = clamp(s.axis === 'v' ? s.cz : s.cz + 5.7, -bound, bound);
      walk.feet = 0; walk.vy = 0; walk.vx = walk.vz = 0;
    } else if (mode === 'drive') {
      const fx = -Math.sin(hintYaw), fz = -Math.cos(hintYaw);
      car.h = s.axis === 'v' ? (fz >= 0 ? 0 : Math.PI) : (fx >= 0 ? Math.PI / 2 : -Math.PI / 2);
      const rx = -Math.cos(car.h) * 2.6, rz = Math.sin(car.h) * 2.6;        // right-hand lane
      car.x = clamp(s.cx + rx, -bound, bound); car.z = clamp(s.cz + rz, -bound, bound);
      car.vx = car.vz = 0; car.speed = 0; car.camH = car.h;
    }
  }

  function setMode(next, opts = {}) {
    if (!MODES.includes(next) || (next === mode && !opts.near)) return;
    const prev = mode;
    const anchor = opts.near ? { x: opts.near.x, z: opts.near.z } : prev === 'orbit' ? { x: controls.target.x, z: controls.target.z } : { x: camera.position.x, z: camera.position.z };
    if (prev === 'orbit') lookFromCamera();
    mode = next; controls.enabled = next === 'orbit';
    carGroup.visible = next === 'drive'; SH.uHeadOn.value = next === 'drive' ? 1 : 0;
    if (document.pointerLockElement && document.exitPointerLock && next !== 'walk' && next !== 'fly') document.exitPointerLock();
    if (next === 'orbit') {
      camera.getWorldDirection(dir);
      const far = clamp(camera.position.y * 1.5 + 30, 40, 200);
      tgtGoal.copy(camera.position).addScaledVector(dir, far); tgtGoal.y = Math.max(0, tgtGoal.y);
      camGoal.copy(camera.position); controls.target.copy(tgtGoal); controls.update(); setFov(55);
    } else if (next === 'fly') {
      if (opts.near) { camera.position.set(opts.near.x, 60, opts.near.z); }
      else if (camera.position.y < 4) camera.position.y = 30;
      setFov(60);
    } else if (next === 'walk') { spawn(anchor.x, anchor.z, yaw); pitch = 0; setFov(70); }
    else if (next === 'drive') { spawn(anchor.x, anchor.z, yaw); setFov(65); }
    emit();
  }

  function flyTo(i, dist) {
    if (i < 0 || i >= city.N) return;
    if (mode !== 'orbit') { setMode('orbit'); }
    const d = dist ?? Math.max(60, city.ITOP[i] * 1.4), fy = city.IH[i] * 0.45;
    tgtGoal.set(city.IX[i], fy, city.IZ[i]); camGoal.set(city.IX[i] + d * 0.8, fy + d * 0.5, city.IZ[i] + d * 0.8);
  }
  function overview() {
    if (mode !== 'orbit') setMode('orbit');
    const s = Math.max(300, city.R * LOT);
    tgtGoal.set(0, 0, 0); camGoal.set(0, Math.min(3200, s * 1.3), s * 0.5);
  }
  function goTo(x, z) {
    if (mode === 'orbit') {
      tgtGoal.set(x, 0, z); const off = tmp.copy(camera.position).sub(controls.target);
      camGoal.copy(tgtGoal).add(off); camGoal.y = Math.max(camGoal.y, 80);
    } else if (mode === 'fly') camera.position.set(x, Math.max(camera.position.y, 40), z);
    else { spawn(x, z, yaw); }
  }

  // ---- per-mode updates
  function updateFly(dt) {
    camera.getWorldDirection(dir);
    const f = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
    const r = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
    const u = (down('KeyE') ? 1 : 0) - (down('KeyQ') ? 1 : 0);
    const sp = state.speed * 2.2 * (1 + camera.position.y / 160) * (down('ShiftLeft') ? 3 : 1) * dt;
    camera.position.addScaledVector(dir, f * sp);
    tmp.set(-dir.z, 0, dir.x).normalize(); camera.position.addScaledVector(tmp, r * sp); camera.position.y += u * sp;
    camera.position.y = Math.max(2, camera.position.y); applyLook();
  }
  function updateWalk(dt) {
    const sp = down('ShiftLeft') ? 8 : 4.4;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = 0, mz = 0;
    if (down('KeyW', 'ArrowUp')) { mx += fx; mz += fz; } if (down('KeyS', 'ArrowDown')) { mx -= fx; mz -= fz; }
    if (down('KeyD', 'ArrowRight')) { mx += rx; mz += rz; } if (down('KeyA', 'ArrowLeft')) { mx -= rx; mz -= rz; }
    const l = Math.hypot(mx, mz) || 1, k = Math.min(1, dt * 10);
    walk.vx += (mx / l * sp * (mx || mz ? 1 : 0) - walk.vx) * k; walk.vz += (mz / l * sp * (mx || mz ? 1 : 0) - walk.vz) * k;
    if (down('Space') && walk.ground) { walk.vy = 5.6; walk.ground = false; }
    walk.vy -= 16 * dt; walk.feet += walk.vy * dt;
    if (walk.feet <= 0) { walk.feet = 0; walk.vy = 0; walk.ground = true; }
    const r = city.resolve(walk.x + walk.vx * dt, walk.z + walk.vz * dt, 0.45, walk.feet);
    const b = city.bound() + LOT;
    walk.x = clamp(r.x, -b, b); walk.z = clamp(r.z, -b, b);
    camera.position.set(walk.x, walk.feet + 1.7, walk.z); applyLook();
  }
  function updateDrive(dt) {
    const th = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
    const st = (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0);
    const boost = down('ShiftLeft') ? 1.6 : 1, hb = down('Space');
    let fX = Math.sin(car.h), fZ = Math.cos(car.h), lX = Math.cos(car.h), lZ = -Math.sin(car.h);
    let vf = car.vx * fX + car.vz * fZ, vl = car.vx * lX + car.vz * lZ;
    if (th > 0) vf += 22 * boost * dt; else if (th < 0) vf -= (vf > 1 ? 38 : 12) * dt;
    vf -= vf * Math.min(1, dt * (0.35 + Math.abs(vf) * 0.012));
    if (th === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4 * dt);
    if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 18 * dt);
    vl *= Math.exp(-dt * (hb ? 1.2 : 9));
    vf = clamp(vf, -14, 48 * boost);
    car.h += st * 1.9 * clamp(vf / 7, -1, 1) / (1 + Math.abs(vf) * 0.025) * (hb ? 1.35 : 1) * dt;
    fX = Math.sin(car.h); fZ = Math.cos(car.h); lX = Math.cos(car.h); lZ = -Math.sin(car.h);
    car.vx = fX * vf + lX * vl; car.vz = fZ * vf + lZ * vl;
    const r = city.resolve(car.x + car.vx * dt, car.z + car.vz * dt, 1.6, 0), b = city.bound() + LOT;
    if (r.hit) { car.vx *= 0.3; car.vz *= 0.3; }
    car.x = clamp(r.x, -b, b); car.z = clamp(r.z, -b, b);
    car.speed = Math.hypot(car.vx, car.vz);
    carGroup.position.set(car.x, 0, car.z); carGroup.rotation.y = car.h;
    SH.uHeadPos.value.set(car.x + fX * 2.2, 0.8, car.z + fZ * 2.2); SH.uHeadDir.value.set(fX, 0, fZ);
    car.camH += (Math.atan2(Math.sin(car.h - car.camH), Math.cos(car.h - car.camH))) * Math.min(1, dt * 4);
    const cx = Math.sin(car.camH), cz = Math.cos(car.camH), k = 1 - Math.exp(-dt * 6);
    tmp.set(car.x - cx * 10, 4.2, car.z - cz * 10);
    camera.position.lerp(tmp, k); camera.lookAt(car.x + fX * 8, 1.6, car.z + fZ * 8);
    setFov(62 + Math.min(car.speed, 45) * 0.45);
  }

  function update(dt) {
    SH.uHeadOn.value = mode === 'drive' ? 1 : 0;
    if (mode === 'orbit') {
      if (down('KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight')) {
        camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
        const f = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
        const r = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
        const sp = state.speed * (1 + camera.position.y / 90) * (down('ShiftLeft') ? 3 : 1) * dt;
        tmp.set(dir.x * f - dir.z * r, (down('KeyE') ? 1 : 0) - (down('KeyQ') ? 1 : 0), dir.z * f + dir.x * r).multiplyScalar(sp);
        if (camera.position.y + tmp.y < 3) tmp.y = 3 - camera.position.y;
        camera.position.add(tmp); controls.target.add(tmp); camGoal.copy(camera.position); tgtGoal.copy(controls.target);
      } else {
        const k = 1 - Math.exp(-dt * 2.2);
        camera.position.lerp(camGoal, k); controls.target.lerp(tgtGoal, k);
      }
      controls.update();
    } else if (mode === 'fly') updateFly(dt);
    else if (mode === 'walk') updateWalk(dt);
    else updateDrive(dt);
  }

  controls.addEventListener('start', () => { camGoal.copy(camera.position); tgtGoal.copy(controls.target); });
  return {
    controls, car, camGoal, tgtGoal, update, setMode, flyTo, overview, goTo, focus,
    get mode() { return mode; }, locked: () => document.pointerLockElement === canvas,
    onChange: (f) => listeners.push(f),
    /** Snap goals to the current camera (used after restoring a shared link). */
    snap(pos, tgt) { camera.position.copy(pos); controls.target.copy(tgt); camGoal.copy(pos); tgtGoal.copy(tgt); controls.update(); },
    yawOf: () => { camera.getWorldDirection(dir); return Math.atan2(-dir.x, -dir.z); },
  };
}
