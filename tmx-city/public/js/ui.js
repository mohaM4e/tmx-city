// All DOM: search, leaderboard, minimap, street sign, info card, settings drawer, hotkeys, toasts.
import * as THREE from 'three';
import { LEVELS, LEVEL_NAMES, WEATHER, TIME_PRESETS, RAIN_MAX, MAX_CARS, LOT } from './config.js';
import { formatHour } from './env.js';
import { SH } from './world.js';
import { MODES } from './modes.js';
import { ageNorm } from './data.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n || 0).toLocaleString();
const trimOf = (aw) => Math.min(1, Math.log10(1 + (aw || 0)) / 2.2);
const ramp = (t) => {
  t = Math.max(0, Math.min(1, t));
  const a = [26, 38, 107], b = [20, 153, 158], c = [255, 199, 51];
  const [p, q, k] = t < 0.5 ? [a, b, t * 2] : [b, c, t * 2 - 1];
  return p.map((v, i) => v + (q[i] - v) * k);
};
const COLOR_MODES = [
  ['Standard', 'Real-looking facades. Gold trim means awards received.'],
  ['Awards received', 'Dark blue = no awards, yellow = the most awards.'],
  ['Account age', 'Blue = oldest accounts, yellow = newest.'],
  ['Height', 'Colour follows altitude: blue at street level, yellow above 140 m.'],
];
const KEYS = [
  ['<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>', 'Orbit, Fly, Walk, Drive'],
  ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move (drive: throttle and steer)'],
  ['<kbd>Q</kbd> <kbd>E</kbd>', 'Down / up (orbit and fly)'],
  ['<kbd>Shift</kbd>', 'Faster / run / nitro'],
  ['<kbd>Space</kbd>', 'Jump (walk) · handbrake (drive)'],
  ['Mouse', 'Orbit: drag to rotate, scroll to zoom. Walk and fly: click the scene to look around, Esc to release'],
  ['<kbd>/</kbd>', 'Search for a mapper'],
  ['<kbd>T</kbd>', 'Start / stop the day-night cycle'],
  ['<kbd>L</kbd> <kbd>P</kbd> <kbd>M</kbd>', 'Copy link, screenshot, sound'],
  ['<kbd>G</kbd> <kbd>H</kbd>', 'Settings, this help'],
];
const keyTable = () => `<table class="keys">${KEYS.map(([k, d]) => `<tr><td>${k}</td><td>${d}</td></tr>`).join('')}</table>`;

export function createUI({ world, city, modes, audio, gfx, state, env, all, demo, actions }) {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const { camera } = world;
  const refreshers = [];
  const sync = () => refreshers.forEach((f) => f());
  let selected = -1, maxMaps = 1, maxAwards = 1;

  // ---------------------------------------------------------------- toast + loading
  let toastTimer = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
  const loading = (msg, p) => { $('loadMsg').textContent = msg; $('loadBar').style.width = Math.round(p * 100) + '%'; };
  const ready = () => { const l = $('loading'); l.classList.add('done'); setTimeout(() => { l.hidden = true; }, 600); };

  // ---------------------------------------------------------------- selection outline
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    new THREE.LineBasicMaterial({ color: 0xffc933 }));
  outline.visible = false; world.scene.add(outline);

  // ---------------------------------------------------------------- info card
  function select(i) {
    if (i < 0 || i >= city.N) return;
    selected = i;
    const u = city.users[i], aw = u.AwardsReceivedCount || 0, mp = u.MapCount || 0;
    outline.visible = true; outline.position.set(city.IX[i], 0, city.IZ[i]);
    outline.scale.set(city.IFP[i] * 1.04, city.ITOP[i], city.IFP[i] * 1.04);
    const style = aw >= 50 ? 'Beacon tower' : aw >= 10 ? 'Lantern crown' : aw >= 1 ? 'Spire' : 'Plain roof';
    const joined = u.RegisteredAt ? new Date(u.RegisteredAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'unknown';
    const card = $('info');
    card.innerHTML = `<button class="x" aria-label="Close">×</button>
      <h2>${esc(u.Name)}</h2>
      <p class="addr">${esc(city.address(i))} · ${esc(city.district(city.IX[i], city.IZ[i]))}</p>
      <div class="stat"><span>Maps uploaded</span><b>${fmt(mp)}</b><i style="--p:${Math.max(1, (mp / maxMaps) * 100)}%"></i></div>
      <div class="stat"><span>Awards received</span><b>${fmt(aw)}</b><i style="--p:${Math.max(1, (aw / maxAwards) * 100)}%"></i></div>
      <dl><dt>City rank</dt><dd>#${fmt(i + 1)}</dd><dt>Building</dt><dd>${style}, ${Math.round(city.IH[i])} m</dd><dt>Joined</dt><dd>${esc(joined)}</dd></dl>
      <div class="btns"><a class="btn primary" href="https://trackmania.exchange/usershow/${u.UserId}" target="_blank" rel="noopener">Open on TMX</a>
        <button class="btn" data-a="walk">Walk here</button><button class="btn" data-a="drive">Drive here</button><button class="btn" data-a="link">Copy link</button></div>`;
    card.hidden = false;
    card.querySelector('.x').addEventListener('click', clearSelection);
    card.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a, near = { x: city.IX[i], z: city.IZ[i] };
      if (a === 'link') shareLink(); else modes.setMode(a, { near });
    }));
  }
  function clearSelection() { selected = -1; outline.visible = false; $('info').hidden = true; }
  function focusPlayer(i) { select(i); if (modes.mode === 'orbit') modes.flyTo(i); else modes.goTo(city.IX[i], city.IZ[i]); }

  // ---------------------------------------------------------------- settings drawer
  const tabDefs = [['gfx', 'Graphics'], ['world', 'World'], ['city', 'City'], ['help', 'Controls']];
  const panels = {};
  function showTab(id) { for (const b of $('tabs').children) b.setAttribute('aria-selected', String(b.dataset.tab === id)); for (const k in panels) panels[k].hidden = k !== id; }
  tabDefs.forEach(([id, label]) => {
    const b = el('button', null, label); b.dataset.tab = id; b.setAttribute('role', 'tab'); b.addEventListener('click', () => showTab(id)); $('tabs').appendChild(b);
    const p = el('div', 'tabpanel'); p.hidden = true; $('tabBody').appendChild(p); panels[id] = p;
  });
  showTab('gfx');
  const setDrawer = (open) => { $('drawer').hidden = !open; $('bSettings').setAttribute('aria-pressed', String(open)); document.body.classList.toggle('drawer-open', open); };

  function slider(parent, label, min, max, step, get, set, f = String, commit = false) {
    const row = el('label', 'row'), val = el('span', 'v'), inp = el('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    row.appendChild(el('span', null, label)); row.appendChild(val); row.appendChild(inp); parent.appendChild(row);
    const show = () => { inp.value = get(); val.textContent = f(+get()); };
    refreshers.push(show); show();
    inp.addEventListener('input', () => { val.textContent = f(+inp.value); if (!commit) set(+inp.value); });
    if (commit) inp.addEventListener('change', () => set(+inp.value));
  }
  function choice(parent, label, options, get, set) {
    const row = el('label', 'row'), sel = el('select');
    row.appendChild(el('span', null, label)); row.appendChild(el('span', 'v'));
    options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.appendChild(o); });
    row.appendChild(sel); parent.appendChild(row);
    refreshers.push(() => { sel.value = get(); }); sel.value = get();
    sel.addEventListener('change', () => set(sel.value));
  }
  function check(parent, label, get, set) {
    const row = el('label', 'check'), c = el('input'); c.type = 'checkbox';
    row.appendChild(c); row.appendChild(el('span', null, label)); parent.appendChild(row);
    refreshers.push(() => { c.checked = get(); }); c.checked = get();
    c.addEventListener('change', () => set(c.checked));
  }
  const button = (parent, label, fn) => { const b = el('button', 'btn', label); b.addEventListener('click', fn); parent.appendChild(b); return b; };
  const manual = (key) => (v) => { gfx.auto = false; gfx[key] = v; if (key === 'res') world.setRes(v); sync(); actions.save(); };

  {
    const p = panels.gfx;
    check(p, 'Auto quality (recommended)', () => gfx.auto, (v) => { gfx.auto = v; if (v) actions.applyLevel(gfx.level); actions.resetGovernor(); actions.save(); });
    slider(p, 'Quality level', 0, 6, 1, () => gfx.level, (v) => { gfx.auto = false; actions.applyLevel(v); }, (v) => LEVEL_NAMES[v]);
    p.appendChild(el('h3', null, 'Fine tuning'));
    slider(p, 'Resolution', 0.4, 1.75, 0.05, () => gfx.res, manual('res'), (v) => Math.round(v * 100) + '%');
    slider(p, 'View distance', 300, 3000, 50, () => gfx.view, manual('view'), (v) => v + ' m');
    slider(p, 'Fog thickness', 0.5, 1.8, 0.05, () => gfx.fogMul, manual('fogMul'), (v) => v.toFixed(2) + 'x');
    slider(p, 'Window detail range', 0, 1200, 25, () => gfx.win, manual('win'), (v) => (v ? v + ' m' : 'off'));
    slider(p, 'Traffic', 0, MAX_CARS, 50, () => gfx.cars, manual('cars'), (v) => (v ? v + ' cars' : 'off'));
    slider(p, 'Street detail range', 0, 1000, 20, () => gfx.props, manual('props'), (v) => (v ? v + ' m' : 'off'));
    slider(p, 'Glow', 0, 1.5, 0.05, () => gfx.glow, manual('glow'), (v) => (v ? v.toFixed(2) : 'off'));
    check(p, 'Lightning in storms', () => gfx.lightning, (v) => { gfx.lightning = v; actions.save(); });
    p.appendChild(el('p', 'note', 'Auto quality adjusts these every second to hold a smooth frame rate. Moving any of them switches it off.'));
  }
  {
    const p = panels.world;
    p.appendChild(el('h3', null, 'Time of day'));
    const presets = el('div', 'btns');
    Object.entries(TIME_PRESETS).forEach(([n, h]) => button(presets, n, () => { env.hour = h; sync(); actions.save(); }));
    p.appendChild(presets);
    slider(p, 'Time', 0, 24, 0.1, () => env.hour, (v) => { env.hour = v; actions.save(); }, formatHour);
    check(p, 'Day-night cycle', () => env.auto, (v) => { env.auto = v; actions.save(); });
    slider(p, 'Length of a day', 1, 60, 1, () => env.dayMinutes, (v) => { env.dayMinutes = v; actions.save(); }, (v) => v + ' min');
    p.appendChild(el('h3', null, 'Weather'));
    choice(p, 'Conditions', Object.entries(WEATHER).map(([k, w]) => [k, w.label]), () => env.weather, (v) => { env.weather = v; actions.save(); });
    p.appendChild(el('h3', null, 'Map style'));
    choice(p, 'Colour buildings by', COLOR_MODES.map(([n], i) => [String(i), n]), () => String(state.colorMode), (v) => { actions.setColorMode(+v); });
    const note = el('p', 'note'); p.appendChild(note);
    refreshers.push(() => { note.textContent = COLOR_MODES[state.colorMode][1]; });
  }
  {
    const p = panels.city, mx = all.length;
    choice(p, 'Order the city by', [['maps', 'Maps uploaded'], ['awards', 'Awards received'], ['date', 'Join date (oldest downtown)']], () => state.order, (v) => { state.order = v; actions.rebuild(); });
    slider(p, 'Players shown', Math.min(200, mx), mx, Math.max(1, Math.round(mx / 200)), () => state.topN || mx, (v) => { state.topN = v >= mx ? 0 : v; actions.rebuild(); }, fmt, true);
    slider(p, 'Minimum maps', 0, 100, 1, () => state.minMaps, (v) => { state.minMaps = v; actions.rebuild(); }, String, true);
    slider(p, 'Minimum awards', 0, 100, 1, () => state.minAwards, (v) => { state.minAwards = v; actions.rebuild(); }, String, true);
    slider(p, 'Tower height', 0.5, 2, 0.1, () => state.hScale, (v) => { state.hScale = v; actions.rebuild(); }, (v) => v.toFixed(1) + 'x', true);
    p.appendChild(el('p', 'note', 'Downtown is the top of the order you pick. Changing these rebuilds the whole city.'));
  }
  {
    const p = panels.help;
    p.insertAdjacentHTML('beforeend', keyTable());
    slider(p, 'Move speed', 20, 300, 5, () => state.speed, (v) => { state.speed = v; actions.save(); });
    const b = el('div', 'btns'); p.appendChild(b);
    button(b, 'Downtown', () => modes.flyTo(0)); button(b, 'Overview', () => modes.overview());
    button(b, 'Random mapper', () => { if (city.N) focusPlayer(Math.floor(Math.random() * city.N)); });
    button(b, 'Reset all settings', actions.reset);
  }
  $('bSettings').addEventListener('click', () => setDrawer($('drawer').hidden));

  // ---------------------------------------------------------------- search with suggestions
  const input = $('search'), list = $('suggest'); let sugg = [], sel = -1;
  const hideSuggest = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); sel = -1; };
  function renderSuggest() {
    list.innerHTML = sugg.length
      ? sugg.map((i, k) => `<li role="option" data-i="${i}" aria-selected="${k === sel}"><span>${esc(city.users[i].Name)}</span><span class="mono">${fmt(city.users[i].MapCount)} maps</span></li>`).join('')
      : '<li class="none">No mapper found with these filters</li>';
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function updateSuggest() {
    const q = input.value.trim().toLowerCase(); if (!q) { hideSuggest(); return; }
    sugg = []; const names = city.lowerNames;
    for (let i = 0; i < names.length && sugg.length < 8; i++) if (names[i].startsWith(q)) sugg.push(i);
    for (let i = 0; i < names.length && sugg.length < 8; i++) if (!names[i].startsWith(q) && names[i].includes(q)) sugg.push(i);
    sel = -1; renderSuggest();
  }
  const choose = (i) => { hideSuggest(); input.blur(); focusPlayer(i); };
  input.addEventListener('input', updateSuggest);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!sugg.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + sugg.length) % sugg.length; renderSuggest(); }
    else if (e.key === 'Enter') { const i = sel >= 0 ? sugg[sel] : sugg[0]; if (i != null) choose(i); }
    else if (e.key === 'Escape') { input.value = ''; hideSuggest(); input.blur(); }
  });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
  input.addEventListener('blur', () => setTimeout(hideSuggest, 120));

  // ---------------------------------------------------------------- leaderboard
  function renderBoard() {
    const ul = $('boardList'), byAw = state.order === 'awards', top = city.users.slice(0, 10);
    const best = top.length ? (byAw ? top[0].AwardsReceivedCount : top[0].MapCount) || 1 : 1;
    ul.innerHTML = top.map((u, i) => {
      const v = (byAw ? u.AwardsReceivedCount : u.MapCount) || 0;
      return `<li><button data-i="${i}" style="--p:${(v / best) * 100}%"><span class="rank">${i + 1}</span><span class="nm">${esc(u.Name)}</span><span class="val">${fmt(v)}</span></button></li>`;
    }).join('');
    $('board').querySelector('h2').textContent = state.order === 'date' ? 'Founding mappers' : byAw ? 'Most awarded' : 'Top builders';
  }
  $('boardList').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) focusPlayer(+b.dataset.i); });

  // ---------------------------------------------------------------- minimap
  const mini = $('miniCanvas'), mctx = mini.getContext('2d'), S = mini.width;
  const baseCv = document.createElement('canvas'); baseCv.width = baseCv.height = S; const bctx = baseCv.getContext('2d');
  function drawMinimapBase() {
    const img = mctx.createImageData(S, S), d = img.data, hm = new Float32Array(S * S);
    for (let p = 0; p < S * S; p++) { d[p * 4] = 16; d[p * 4 + 1] = 20; d[p * 4 + 2] = 27; d[p * 4 + 3] = 255; }
    const { N, GX, GY, R, G, IH, users } = city, k = S / G, mode = state.colorMode;
    for (let i = 0; i < N; i++) {
      const px = Math.min(S - 1, Math.floor((GX[i] + R + 0.5) * k)), py = Math.min(S - 1, Math.floor((GY[i] + R + 0.5) * k)), p = py * S + px;
      if (IH[i] < hm[p]) continue; hm[p] = IH[i];
      const u = users[i], t = trimOf(u.AwardsReceivedCount); let c;
      if (mode === 1) c = ramp(t); else if (mode === 2) c = ramp(ageNorm(u)); else if (mode === 3) c = ramp(IH[i] / 140);
      else { const v = 60 + Math.min(150, IH[i] * 1.2); c = [v + (255 - v) * t * 0.9, v + (190 - v) * t * 0.9, v + (60 - v) * t * 0.9]; }
      d[p * 4] = c[0]; d[p * 4 + 1] = c[1]; d[p * 4 + 2] = c[2];
    }
    bctx.putImageData(img, 0, 0);
  }
  function drawMinimap() {
    mctx.drawImage(baseCv, 0, 0);
    if (!city.N) return;
    const k = S / city.G;
    const mx = (camera.position.x / LOT + city.R + 0.5) * k, my = (camera.position.z / LOT + city.R + 0.5) * k;
    mctx.save(); mctx.translate(mx, my); mctx.rotate(-modes.yawOf());     // arrow points where the camera looks, north (-z) is up
    mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fillStyle = '#f2b705'; mctx.strokeStyle = '#0e1116'; mctx.lineWidth = 1.5; mctx.stroke(); mctx.fill(); mctx.restore();
    if (selected >= 0) {
      const sx = (city.IX[selected] / LOT + city.R + 0.5) * k, sy = (city.IZ[selected] / LOT + city.R + 0.5) * k;
      mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(sx, sy, 5, 0, Math.PI * 2); mctx.stroke();
    }
  }
  mini.addEventListener('click', (e) => {
    if (!city.N) return;
    const r = mini.getBoundingClientRect(), k = S / city.G;
    const x = (((e.clientX - r.left) / r.width) * S / k - city.R - 0.5) * LOT, z = (((e.clientY - r.top) / r.height) * S / k - city.R - 0.5) * LOT;
    modes.goTo(x, z);
  });

  // ---------------------------------------------------------------- mode switcher + HUD
  const modeBtns = [...document.querySelectorAll('#modes button')];
  modeBtns.forEach((b) => b.addEventListener('click', () => modes.setMode(b.dataset.mode)));
  const HINTS = { orbit: '', fly: 'Click the scene to look around · Esc releases the mouse', walk: 'WASD to walk · Shift to run · Space to jump · click to look around', drive: 'W/S throttle and brake · A/D steer · Space handbrake · Shift nitro' };
  modes.onChange((m) => {
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    const h = $('hint'); h.textContent = HINTS[m]; h.hidden = !HINTS[m]; $('speed').hidden = m !== 'drive';
    if (HINTS[m]) setTimeout(() => { if (modes.mode === m) h.hidden = true; }, 6000);
  });
  let hudTimer = 0;
  function frame(dt) {
    hudTimer += dt;
    if (modes.mode === 'drive') $('speedNum').textContent = Math.round(modes.car.speed * 3.6);
    if (hudTimer < 0.15) return; hudTimer = 0;
    const f = modes.focus(); $('signStreet').textContent = city.street(f.x, f.z); $('signDistrict').textContent = city.district(f.x, f.z);
    drawMinimap();
  }

  // ---------------------------------------------------------------- tools: link, photo, sound, help
  function shareLink() {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const tgt = modes.mode === 'orbit' ? modes.controls.target : camera.position.clone().addScaledVector(dir, 60);
    const q = new URLSearchParams();
    q.set('m', 'orbit'); q.set('p', [camera.position.x, camera.position.y, camera.position.z].map((n) => Math.round(n * 10) / 10).join(','));
    q.set('t', [tgt.x, tgt.y, tgt.z].map((n) => Math.round(n * 10) / 10).join(',')); q.set('h', Math.round(env.hour * 10) / 10); q.set('w', env.weather);
    if (selected >= 0) q.set('s', city.users[selected].Name);
    const url = `${location.origin}${location.pathname}#${q}`;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copied'), () => { prompt('Copy this link', url); });
  }
  function photo() {
    world.render(0);
    world.renderer.domElement.toBlob((blob) => {
      if (!blob) return toast('Screenshot failed');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `tmx-city-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Screenshot saved');
    }, 'image/png');
  }
  const setSound = () => { const on = audio.toggle(); $('bSound').setAttribute('aria-pressed', String(on)); state.sound = on; toast(on ? 'Sound on' : 'Sound off'); };
  const helpOpen = (open) => { $('help').hidden = !open; if (open) $('helpSheet').innerHTML = `<h2>Welcome to TMX City</h2><p>Every Trackmania Exchange mapper is a building. Height is maps uploaded, gold trim is awards received.</p>${keyTable()}<div class="btns"><button class="btn primary" id="helpClose">Start exploring</button></div>`, $('helpClose').addEventListener('click', () => helpOpen(false)); };
  $('bLink').addEventListener('click', shareLink); $('bPhoto').addEventListener('click', photo); $('bSound').addEventListener('click', setSound); $('bHelp').addEventListener('click', () => helpOpen($('help').hidden));
  $('help').addEventListener('click', (e) => { if (e.target === $('help')) helpOpen(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('help').hidden) helpOpen(false); else if (selected >= 0 && document.pointerLockElement == null) clearSelection(); return; }
    if (/INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '4') modes.setMode(MODES[+k - 1]);
    else if (k === '/') { e.preventDefault(); input.focus(); input.select(); }
    else if (k === 'h') helpOpen($('help').hidden); else if (k === 'g') setDrawer($('drawer').hidden);
    else if (k === 'p') photo(); else if (k === 'l') shareLink(); else if (k === 'm') setSound();
    else if (k === 't') { env.auto = !env.auto; sync(); toast(env.auto ? 'Day-night cycle on' : 'Day-night cycle off'); }
  });

  // ---------------------------------------------------------------- click to select in the 3D view
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = el('div', 'tip'); let downAt = null, lastHover = 0;
  Object.assign(tip.style, { position: 'fixed', pointerEvents: 'none', display: 'none', zIndex: 12, padding: '3px 9px', borderRadius: '5px', background: 'rgba(20,24,31,.95)', border: '1px solid #2a313c', whiteSpace: 'nowrap' });
  document.body.appendChild(tip);
  const pickAt = (ev) => {
    mouse.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); return city.pick(ray.ray.origin, ray.ray.direction);
  };
  const cv = world.renderer.domElement;
  cv.addEventListener('pointermove', (ev) => {
    const now = performance.now(); if (now - lastHover < 80 || ev.buttons || modes.mode !== 'orbit') return; lastHover = now;
    const i = pickAt(ev);
    if (i < 0) { tip.style.display = 'none'; cv.style.cursor = 'default'; return; }
    tip.textContent = `${city.users[i].Name} · ${fmt(city.users[i].MapCount)} maps`; tip.style.left = ev.clientX + 14 + 'px'; tip.style.top = ev.clientY + 14 + 'px'; tip.style.display = 'block'; cv.style.cursor = 'pointer';
  });
  cv.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; tip.style.display = 'none'; });
  cv.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5 || modes.mode !== 'orbit') return;
    const i = pickAt(ev); if (i >= 0) select(i);
  });

  // ---------------------------------------------------------------- called after every (re)build
  function onBuilt() {
    clearSelection();
    maxMaps = 1; maxAwards = 1;
    for (const u of city.users) { if ((u.MapCount || 0) > maxMaps) maxMaps = u.MapCount; if ((u.AwardsReceivedCount || 0) > maxAwards) maxAwards = u.AwardsReceivedCount; }
    $('search').placeholder = `Find a mapper among ${fmt(city.N)}   ( / )`;
    renderBoard(); drawMinimapBase(); drawMinimap(); sync();
    if (demo) toast('Showing demo data. Run npm run fetch for the real city.');
  }
  if (!localStorage.getItem('tmxCityHelp')) { setTimeout(() => helpOpen(true), 900); try { localStorage.setItem('tmxCityHelp', '1'); } catch { /* ignore */ } }

  return { toast, loading, ready, onBuilt, frame, select, sync, drawMinimapBase, focusPlayer, shareLink, selectedName: () => (selected >= 0 ? city.users[selected].Name : '') };
}
