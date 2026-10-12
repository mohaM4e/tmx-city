// Test doubles for the three/addons used by the app (they only matter on a real GPU).
import * as THREE from '../../node_modules/three/build/three.module.js';
export class OrbitControls extends THREE.EventDispatcher {
  constructor(camera) { super(); this.camera = camera; this.target = new THREE.Vector3(); this.enabled = true; }
  update() { if (this.enabled) this.camera.lookAt(this.target); }
}
export class EffectComposer { addPass() {} setPixelRatio() {} setSize() {} render() {} }
export class RenderPass {} export class UnrealBloomPass {} export class OutputPass {}
