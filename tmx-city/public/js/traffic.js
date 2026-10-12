// Ambient traffic. Each car is one instance with 4 random numbers; the vertex shader places it on a street
// lattice around the camera, so cost is independent of city size and cars never "run out".
import * as THREE from 'three';
import { MAX_CARS } from './config.js';
import { SH } from './world.js';
import { TRAFFIC_VS, TRAFFIC_FS } from './shaders.js';

export function createTraffic(world) {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const idx = Array.from(box.index.array); idx.splice(18, 6);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
  geo.setAttribute('position', box.attributes.position); geo.setAttribute('normal', box.attributes.normal);
  const A = new Float32Array(MAX_CARS * 4);
  for (let i = 0; i < MAX_CARS; i++) {
    A[i * 4] = Math.random(); A[i * 4 + 1] = Math.random();
    A[i * 4 + 2] = (6 + Math.random() * 10) * (Math.random() < 0.5 ? -1 : 1); A[i * 4 + 3] = Math.random();
  }
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: SH, vertexShader: TRAFFIC_VS, fragmentShader: TRAFFIC_FS }));
  mesh.frustumCulled = false; mesh.visible = false; world.scene.add(mesh);
  return {
    mesh,
    setCount(n) { geo.instanceCount = Math.max(0, Math.min(MAX_CARS, n | 0)); mesh.visible = geo.instanceCount > 0; },
  };
}
