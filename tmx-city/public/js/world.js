// Renderer, scene, sky, ground, rain, optional bloom, and the per-frame environment step.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RAIN_MAX, WEATHER } from './config.js';
import { applyEnvironment } from './env.js';
import { BODY_VS, BODY_FS, GROUND_VS, GROUND_FS, SKY_VS, SKY_FS, RAIN_VS, RAIN_FS, PART_VS, PART_FS } from './shaders.js';

const C = () => new THREE.Color(), V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** Uniforms shared by every material, so one write per frame updates the whole scene. */
export const SH = {
  uTime: { value: 0 }, uFlash: { value: 0 }, uFogD: { value: 0.0014 },
  uFog: { value: C() }, uZenith: { value: C() }, uKeyDir: { value: V3(0, 1, 0) }, uKeyCol: { value: C() },
  uHemiSky: { value: C() }, uHemiGround: { value: C() }, uFillCol: { value: C() },
  uSunGlow: { value: C() }, uSunCol: { value: C() }, uSunDir: { value: V3(0, 1, 0) }, uMoonDir: { value: V3(0, -1, 0) },
  uNight: { value: 0 }, uWet: { value: 0 }, uCloud: { value: 0.2 }, uDark: { value: 0 },
  uWinDist: { value: 520 }, uDetail: { value: 1 }, uMode: { value: 0 },
  uCam: { value: null }, uBound: { value: 1000 }, uCarDist: { value: 320 },
  uHeadPos: { value: V3() }, uHeadDir: { value: V3(0, 0, 1) }, uHeadOn: { value: 0 },
};

export function partMaterial(color, emit = [0, 0, 0]) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SH, uColor: { value: new THREE.Color(color) }, uEmit: { value: new THREE.Color(emit[0], emit[1], emit[2]) } },
    vertexShader: PART_VS, fragmentShader: PART_FS,
  });
}

export function createWorld(gfx, envState) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.domElement.id = 'gl';
  document.getElementById('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 9000);
  SH.uCam.value = camera.position;

  const bodyMat = new THREE.ShaderMaterial({ uniforms: SH, vertexShader: BODY_VS, fragmentShader: BODY_FS });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000),
    new THREE.ShaderMaterial({ uniforms: SH, vertexShader: GROUND_VS, fragmentShader: GROUND_FS }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // The sky is drawn last: pixels already covered by buildings fail the depth test before the cloud shader runs.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: SH, vertexShader: SKY_VS, fragmentShader: SKY_FS }));
  sky.renderOrder = 999; sky.frustumCulled = false; scene.add(sky);

  const rp = new Float32Array(RAIN_MAX * 6), re = new Float32Array(RAIN_MAX * 2);
  for (let i = 0; i < RAIN_MAX; i++) {
    const x = Math.random() * 160, y = Math.random() * 60, z = Math.random() * 160;
    rp.set([x, y, z, x, y, z], i * 6); re[i * 2 + 1] = 1;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
  const rain = new THREE.LineSegments(rainGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: SH, vertexShader: RAIN_VS, fragmentShader: RAIN_FS }));
  rain.frustumCulled = false; scene.add(rain);

  // ---- optional glow (bloom): created lazily, so it costs nothing while off
  let composer = null, bloom = null;
  function ensureComposer() {
    if (composer) return;
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.6);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    composer.setPixelRatio(gfx.res); composer.setSize(innerWidth, innerHeight);
  }
  function setRes(r) {
    renderer.setPixelRatio(r); renderer.setSize(innerWidth, innerHeight);
    if (composer) { composer.setPixelRatio(r); composer.setSize(innerWidth, innerHeight); }
  }
  function render(dt) {
    if (gfx.glow > 0.01) { ensureComposer(); bloom.strength = gfx.glow; composer.render(dt); } else renderer.render(scene, camera);
  }

  // ---- environment: eased weather, wet streets, lightning, time of day
  const W = { cloud: 0.22, dark: 0, fog: 1, rain: 0 };
  const result = { sunY: 1, day: 1, night: 0, flash: 0, rain: 0, fog: 1 };
  let flash = 0, nextFlash = 8 + Math.random() * 8, wet = 0;
  const world = { renderer, scene, camera, bodyMat, ground, sky, rain, rainGeo, setRes, render, onThunder: null };
  world.stepEnvironment = (dt, t, reduced) => {
    if (envState.auto) envState.hour = (envState.hour + (dt * 24) / (Math.max(1, envState.dayMinutes) * 60)) % 24;
    const target = WEATHER[envState.weather] || WEATHER.clear;
    const k = 1 - Math.exp(-dt * 0.7);
    for (const key of ['cloud', 'dark', 'fog', 'rain']) W[key] += (target[key] - W[key]) * k;
    wet += ((target.rain > 0.05 ? 1 : 0) - wet) * (1 - Math.exp(-dt * 0.25));
    if (target.lightning && gfx.lightning && !reduced && t > nextFlash) {
      flash = 1; nextFlash = t + 4 + Math.random() * 10; if (world.onThunder) world.onThunder();
    }
    flash *= Math.exp(-dt * 5);
    const e = applyEnvironment(SH, envState.hour, W, flash);
    SH.uWet.value = wet; SH.uCloud.value = W.cloud; SH.uDark.value = W.dark; SH.uFlash.value = flash; SH.uTime.value = t;
    result.sunY = e.sunY; result.day = e.day; result.night = e.night; result.flash = flash; result.rain = W.rain; result.fog = W.fog;
    return result;
  };
  return world;
}
