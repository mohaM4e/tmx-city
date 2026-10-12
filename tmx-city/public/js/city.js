// City generator: lays players out in a spiral of 70 m blocks (best builders downtown), turns each into a
// building from instanced boxes, plants street props, and provides picking, collision and street naming.
import * as THREE from 'three';
import { LOT, STREET_EVERY as SE, CHUNK, DISTRICTS } from './config.js';
import { ageNorm } from './data.js';

const mod = (n, m) => ((n % m) + m) % m;
const hash = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const isStreet = (g) => mod(g, SE) === SE - 1;
const pal = (list) => list.map((c) => new THREE.Color(c));
// per style: brick/apartment, glass tower, art deco stone, modern ribbon, industrial
const PALETTE = [
  pal(['#6b4a3d', '#7a5545', '#5d4339', '#8a6a58', '#4f4a47', '#756a60']),
  pal(['#2a4a66', '#27455c', '#305066', '#233f55', '#3b5a70']),
  pal(['#b9ae9a', '#a89d8a', '#c4bba8', '#9d9484', '#8f8a80']),
  pal(['#c9ccd0', '#b3b8bd', '#d3d0c8', '#9aa0a6']),
  pal(['#7c8590', '#6f7a82', '#8a8f8d', '#a0968a']),
];
const STRIDE = 13; // pos3 size3 col3 meta4
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10 < 4 ? n % 10 : 0]);
const avenue = (k) => (k === 0 ? 'Central Ave' : `${k > 0 ? 'E' : 'W'} ${ordinal(Math.abs(k))} Ave`);
const streetName = (k) => (k === 0 ? 'Main St' : `${k > 0 ? 'S' : 'N'} ${ordinal(Math.abs(k))} St`);

const boxIdx = (() => { const g = new THREE.BoxGeometry(1, 1, 1); const a = Array.from(g.index.array); a.splice(18, 6); return a; })();
const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

export function createCity(world) {
  const city = {
    users: [], N: 0, R: 0, G: 1, grid: new Int32Array(1).fill(-1), GX: null, GY: null,
    IX: null, IZ: null, IFP: null, IH: null, ITOP: null, lowerNames: [], chunks: [], drawn: 0,
  };
  let group = null;

  function makeBatch(arr, type) {
    const f = new Float32Array(arr), n = f.length / STRIDE;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y1 = 0;
    for (let o = 0; o < f.length; o += STRIDE) {
      const hx = f[o + 3] / 2, hz = f[o + 5] / 2;
      x0 = Math.min(x0, f[o] - hx); x1 = Math.max(x1, f[o] + hx); z0 = Math.min(z0, f[o + 2] - hz); z1 = Math.max(z1, f[o + 2] + hz);
      y1 = Math.max(y1, f[o + 1] + f[o + 4]);
    }
    const ib = new THREE.InstancedInterleavedBuffer(f, STRIDE, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(boxIdx), 1));
    geo.setAttribute('position', boxGeo.attributes.position); geo.setAttribute('normal', boxGeo.attributes.normal);
    geo.setAttribute('aPos', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('aSize', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    geo.setAttribute('aCol', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    geo.setAttribute('aMeta', new THREE.InterleavedBufferAttribute(ib, 4, 9));
    geo.instanceCount = n;
    const center = new THREE.Vector3((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2);
    const radius = Math.hypot(x1 - x0, y1, z1 - z0) / 2;
    geo.boundingSphere = new THREE.Sphere(center, radius);       // instanced geometry cannot compute its own
    const mesh = new THREE.Mesh(geo, world.bodyMat); mesh.matrixAutoUpdate = false; group.add(mesh);
    return { mesh, center, radius, type };
  }

  /** Build the city for an already filtered+sorted user list. Yields to the browser so progress can paint. */
  city.build = async (list, { hScale = 1 } = {}, progress = () => {}) => {
    if (group) { for (const c of city.chunks) c.mesh.geometry.dispose(); world.scene.remove(group); }
    group = new THREE.Group(); world.scene.add(group); city.chunks = [];
    city.users = list; city.N = list.length; const N = city.N;
    city.lowerNames = list.map((u) => String(u.Name).toLowerCase());
    if (!N) { city.R = 0; city.G = 1; city.grid = new Int32Array(1).fill(-1); return; }

    progress('Laying out streets…', 0.15); await nextFrame();
    const GX = new Int16Array(N), GY = new Int16Array(N), streets = [];
    const cells = (function* () {
      let x = 0, y = 0, dx = 1, dy = 0, seg = 1, run = 0, turns = 0;
      while (true) { yield [x, y]; x += dx; y += dy; if (++run === seg) { run = 0; [dx, dy] = [-dy, dx]; if (++turns % 2 === 0) seg++; } }
    })();
    let R = 0;
    for (let i = 0; i < N; i++) {
      let gx, gy;
      for (;;) {
        [gx, gy] = cells.next().value;
        if (isStreet(gx) || isStreet(gy)) streets.push(gx, gy); else break;
      }
      GX[i] = gx; GY[i] = gy; R = Math.max(R, Math.abs(gx), Math.abs(gy));
    }
    const G = 2 * R + 1, grid = new Int32Array(G * G).fill(-1);
    const IX = new Float32Array(N), IZ = new Float32Array(N), IFP = new Float32Array(N), IH = new Float32Array(N), ITOP = new Float32Array(N);

    progress('Raising buildings…', 0.35); await nextFrame();
    const buckets = new Map(), col = new THREE.Color();
    const bucket = (gx, gy) => {
      const key = Math.floor(gx / CHUNK) + ',' + Math.floor(gy / CHUNK);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { tall: [], low: [], props: [] })); return b;
    };
    for (let i = 0; i < N; i++) {
      const u = list[i], maps = u.MapCount || 0, aw = u.AwardsReceivedCount || 0;
      const gx = GX[i], gy = GY[i], x = gx * LOT, z = gy * LOT;
      const h = Math.min(260, (6 + Math.pow(maps, 0.62) * 2.4) * hScale);
      const r = hash(i * 7.7);
      const style = h < 12 ? (r < 0.2 ? 4 : r < 0.62 ? 0 : 3)
        : h < 45 ? (r < 0.42 ? 0 : r < 0.62 ? 3 : r < 0.8 ? 2 : 1)
        : (r < 0.5 ? 1 : r < 0.75 ? 2 : 3);
      const colors = PALETTE[style];
      col.copy(colors[Math.floor(hash(i * 3.1) * colors.length)]).offsetHSL(0, 0, (hash(i + 5) - 0.5) * 0.05);
      const fp = LOT * (style === 4 ? 0.92 : 0.76 + 0.16 * hash(i));
      const trim = Math.min(1, Math.log10(1 + aw) / 2.2), age = ageNorm(u);
      const tiers = style === 4 ? 0 : h >= 70 ? 2 : h >= 24 ? 1 : 0;
      const b = bucket(gx, gy), a = h >= 30 ? b.tall : b.low;
      const put = (px, py, pz, sx, sy, sz, kind) => a.push(px, py, pz, sx, sy, sz, col.r, col.g, col.b, trim, kind, age, style);

      if (tiers === 0) put(x, 0, z, fp, h, fp, 0);
      else if (tiers === 1) {
        const m = h * 0.68;
        put(x, 0, z, fp, m, fp, 0); put(x, m - 1.4, z, fp * 1.05, 1.4, fp * 1.05, 0); put(x, m, z, fp * 0.72, h - m, fp * 0.72, 0);
      } else {
        const m1 = h * 0.58, m2 = h * 0.84;
        put(x, 0, z, fp, m1, fp, 0); put(x, m1 - 1.4, z, fp * 1.05, 1.4, fp * 1.05, 0);
        put(x, m1, z, fp * 0.74, m2 - m1, fp * 0.74, 0); put(x, m2 - 1.2, z, fp * 0.79, 1.2, fp * 0.79, 0);
        put(x, m2, z, fp * 0.5, h - m2, fp * 0.5, 0);
      }
      const roofW = tiers === 0 ? fp : tiers === 1 ? fp * 0.72 : fp * 0.5;
      if (h < 120 && hash(i * 5.3) < 0.55) {
        const w = roofW * (0.25 + 0.2 * hash(i * 2.1));
        put(x + (hash(i * 8.8) - 0.5) * roofW * 0.4, h, z + (hash(i * 9.9) - 0.5) * roofW * 0.4, w, 2.2 + hash(i * 4.4) * 1.8, w, 3);
      }
      if (style === 0 && h > 10 && h < 45 && hash(i * 6.1) < 0.35) put(x + roofW * 0.25, h, z - roofW * 0.25, 2.8, 3.6, 2.8, 4);
      let top = h;
      if (aw >= 10) { const lh = 5 + Math.log2(1 + aw) * 0.9; put(x, h, z, roofW * 0.3, lh, roofW * 0.3, 0); top += lh; }
      if (aw >= 1) {
        const ah = 5 + Math.log2(1 + aw) * 2.2;
        put(x, top, z, 0.5, ah, 0.5, 1); top += ah;
        if (aw >= 50) put(x, top - 0.6, z, 2.2, 2.2, 2.2, 2);
      }
      IX[i] = x; IZ[i] = z; IFP[i] = fp; IH[i] = h; ITOP[i] = top;
      grid[(gx + R) * G + (gy + R)] = i;
    }

    progress('Planting trees and street lights…', 0.75); await nextFrame();
    const side = LOT / 2 - 1.3;
    for (let s = 0; s < streets.length; s += 2) {
      const gx = streets[s], gy = streets[s + 1], x = gx * LOT, z = gy * LOT, p = bucket(gx, gy).props;
      const sx = isStreet(gx), sy = isStreet(gy);
      const lamp = (px, pz) => p.push(px, 0, pz, 0.3, 8.5, 0.3, 0, 0, 0, 0, 10, 0, 0);
      const tree = (px, pz) => {
        p.push(px, 0, pz, 0.5, 3.2, 0.5, 0, 0, 0, 0, 11, 0, 0);
        p.push(px, 2.6, pz, 4.6, 4.6, 4.6, 0, 0, 0, 0, 12, 0, 0);
      };
      if (sx && sy) { lamp(x - side, z - side); lamp(x + side, z + side); }
      else if (sx) { const sd = mod(gy, 2) * 2 - 1; lamp(x + sd * side, z); if (mod(gy, 3) === 0) tree(x - sd * side, z); }
      else { const sd = mod(gx, 2) * 2 - 1; lamp(x, z + sd * side); if (mod(gx, 3) === 0) tree(x, z - sd * side); }
    }

    progress('Uploading to the GPU…', 0.9); await nextFrame();
    for (const b of buckets.values()) for (const t of ['tall', 'low', 'props']) if (b[t].length) city.chunks.push(makeBatch(b[t], t));
    Object.assign(city, { R, G, grid, GX, GY, IX, IZ, IFP, IH, ITOP });
  };

  /** Show only what is within range. Returns the number of chunks drawn. */
  city.update = (camera, visDist, propDist) => {
    let drawn = 0; const low = visDist * 0.62;
    for (const c of city.chunks) {
      const d = camera.position.distanceTo(c.center) - c.radius;
      const on = c.type === 'tall' ? d < visDist : c.type === 'low' ? d < low : d < propDist;
      c.mesh.visible = on; if (on) drawn++;
    }
    return (city.drawn = drawn);
  };

  /** Walk a ray across the 2D lot grid: a few hundred cheap steps instead of testing every building. */
  city.pick = (o, d) => {
    if (!city.N) return -1;
    const { R, G, grid, IX, IZ, IFP, IH } = city;
    let t = 0;
    for (let s = 0; s < 4000 && t < 6000; s++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < 0) break;
      const gx = Math.round(x / LOT), gy = Math.round(z / LOT);
      if (gx >= -R && gx <= R && gy >= -R && gy <= R) {
        const i = grid[(gx + R) * G + (gy + R)];
        if (i >= 0) { const hf = IFP[i] / 2; if (Math.abs(x - IX[i]) <= hf && Math.abs(z - IZ[i]) <= hf && y <= IH[i]) return i; }
      }
      t += 1.2 + t * 0.0025;
    }
    return -1;
  };

  const out = { x: 0, z: 0, hit: false };
  /** Push a circle (radius r) out of any building it overlaps, if its feet are below the roof. */
  city.resolve = (x, z, r, feet) => {
    let hit = false;
    const { R, G, grid, IX, IZ, IFP, IH } = city;
    const gx0 = Math.round(x / LOT), gy0 = Math.round(z / LOT);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const gx = gx0 + a, gy = gy0 + b;
      if (gx < -R || gx > R || gy < -R || gy > R) continue;
      const i = grid[(gx + R) * G + (gy + R)];
      if (i < 0 || feet >= IH[i]) continue;
      const half = IFP[i] / 2, dx = x - IX[i], dz = z - IZ[i];
      const ox = Math.abs(dx) - half, oz = Math.abs(dz) - half;
      if (ox < r && oz < r) { if (ox > oz) x += (dx < 0 ? -1 : 1) * (r - ox); else z += (dz < 0 ? -1 : 1) * (r - oz); hit = true; }
    }
    out.x = x; out.z = z; out.hit = hit; return out;
  };

  /** Nearest street centre line to a point. axis 'v' runs along z, 'h' along x. */
  city.nearestStreet = (x, z) => {
    const kx = Math.round((x / LOT - (SE - 1)) / SE), kz = Math.round((z / LOT - (SE - 1)) / SE);
    const sx = (SE * kx + SE - 1) * LOT, sz = (SE * kz + SE - 1) * LOT;
    return Math.abs(x - sx) <= Math.abs(z - sz) ? { axis: 'v', cx: sx, cz: z, kx, kz } : { axis: 'h', cx: x, cz: sz, kx, kz };
  };
  city.street = (x, z) => { const s = city.nearestStreet(x, z); return s.axis === 'v' ? avenue(s.kx) : streetName(s.kz); };
  city.district = (x, z) => {
    const d = Math.max(Math.abs(Math.round(x / LOT)), Math.abs(Math.round(z / LOT)));
    const rank = 0.64 * (2 * d + 1) ** 2;
    return DISTRICTS.find(([limit]) => rank < limit)[1];
  };
  city.address = (i) => {
    const gx = city.GX[i], gy = city.GY[i];
    const kz = Math.round((gy - (SE - 1)) / SE);
    return `${Math.abs(gy) * 10 + (mod(gx, SE) + 1) * 2 + (gx & 1)} ${streetName(kz)}`;
  };
  city.bound = () => Math.max(0, (city.R - 0.5) * LOT);
  return city;
}
