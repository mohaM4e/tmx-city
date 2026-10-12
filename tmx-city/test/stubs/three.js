// Test double for 'three': the real library, except WebGLRenderer, which records the animation loop instead of needing a GPU.
export * from '../../node_modules/three/build/three.module.js';
import * as THREE from '../../node_modules/three/build/three.module.js';
import { dom } from './dom.js';
export class WebGLRenderer {
  constructor() { this.domElement = dom(); this.calls = 0; }
  setPixelRatio() {} setSize() {} getPixelRatio() { return 1; }
  setAnimationLoop(fn) { globalThis.__loop = fn; }
  render() { this.calls++; }
}
export { THREE };
