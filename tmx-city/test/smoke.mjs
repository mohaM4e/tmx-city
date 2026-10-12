// Headless smoke test: bundles the real app with a stubbed GPU/DOM, loads 65,790 synthetic players,
// then drives every camera mode, filter and weather preset and checks invariants. Run with: npm test
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { installDom } from './stubs/dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stub = (f) => join(root, 'test/stubs', f);
const alias = {
  name: 'alias-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: stub('three.js') }));
    b.onResolve({ filter: /^three\/addons\// }, () => ({ path: stub('addons.js') }));
  },
};
const out = join(root, 'test/.bundle.mjs');
await build({ entryPoints: [join(root, 'public/js/main.js')], bundle: true, format: 'esm', platform: 'node', target: 'esnext', outfile: out, plugins: [alias], logLevel: 'error' });

let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = 65790;
const users = Array.from({ length: N }, (_, i) => {
  const m = rnd() < 0.7 ? 0 : Math.floor(Math.pow(rnd(), 5) * 900);
  return { UserId: i + 1, Name: 'User' + i, MapCount: m, AwardsReceivedCount: Math.floor(Math.pow(rnd(), 6) * m * 0.5), RegisteredAt: new Date(1.5e12 + i * 8e6).toISOString() };
});
installDom(users);

const t0 = performance.now();
await import(pathToFileURL(out).href);
const app = globalThis.tmxCity, { city, modes, world } = app;
const step = async (n = 30) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 1)); globalThis.__loop(); } };
const ok = (name) => console.log('  ok  ' + name);

assert.equal(city.N, N); ok(`built ${N.toLocaleString()} buildings in ${Math.round(performance.now() - t0)} ms`);
assert.ok(city.chunks.length > 50);
const parts = { tall: 0, low: 0, props: 0 }; for (const c of city.chunks) parts[c.type] += c.mesh.geometry.instanceCount;
ok(`${city.chunks.length} draw chunks, ${(parts.tall + parts.low).toLocaleString()} building parts + ${parts.props.toLocaleString()} street props`);
await step(60); assert.ok(world.renderer.calls > 0); ok('rendered frames');
const drawn = city.update(world.camera, 1300, 380); assert.ok(drawn < city.chunks.length); ok(`culling keeps ${drawn} of ${city.chunks.length} chunks`);
assert.ok(city.street(0, 0).length > 0 && city.district(0, 0) === 'Central Business District' && city.address(0).length > 0); ok('street, district and address naming');

for (const m of ['fly', 'walk', 'drive', 'orbit']) { modes.setMode(m); await step(40); assert.equal(modes.mode, m); ok(`mode ${m}`); }
modes.setMode('walk'); const p = world.camera.position;
for (let i = 0; i < 200; i++) { modes.update(0.016); }
assert.ok(Math.abs(p.y - 1.7) < 0.2); ok('walking keeps eye height');
const r = city.resolve(city.IX[0], city.IZ[0], 1, 0); assert.ok(r.hit); ok('buildings block movement');
modes.setMode('orbit'); modes.overview(); await step(40); modes.flyTo(5); await step(40); ok('overview and fly-to');

for (const w of ['rain', 'storm', 'cloudy', 'clear']) { app.env.weather = w; for (const h of [3, 6.5, 12, 18.5, 23]) { app.env.hour = h; await step(4); } }
ok('every weather x time of day');
app.state.order = 'date'; app.state.minMaps = 5; await app.ui.sync(); await app.world.render(0);
for (const L of [0, 6, 3]) { app.gfx.glow = L / 6; app.gfx.cars = L * 300; await step(5); } ok('quality extremes');

const hit = city.pick(world.camera.position, { x: 0, y: -1, z: 0 }); assert.equal(typeof hit, 'number'); ok('picking');
console.log('\nAll smoke tests passed.');
process.exit(0);
