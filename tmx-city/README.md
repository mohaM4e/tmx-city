# TMX City

**Every [Trackmania Exchange](https://trackmania.exchange) mapper as a building in a 3D city you can walk, drive and fly through.**

Height is the number of maps a player has uploaded. Gold trim is awards received. The best builders live downtown.
Runs in the browser with [Three.js](https://threejs.org), no build step, handles all ~65,000 players.

> Not affiliated with Trackmania, Nadeo, Ubisoft or Trackmania Exchange. Player data comes from the public TMX API.

<!-- Add a screenshot or GIF here: docs/screenshot.png -->

## Features

- **Move like you are there.** Orbit, free fly, first-person walk (with collision and jumping) and an arcade driving mode with headlights and a chase camera.
- **A real-feeling city.** Five architectural styles (brick apartments, glass towers with sky reflections, art deco, modern ribbon-window blocks, warehouses), 14 m streets with kerbs and crosswalks, street lamps, trees, rooftop equipment and ambient traffic.
- **Day, night and weather.** Smooth time of day, optional day-night cycle, clear / cloudy / rain / storm with wet streets and lightning. Windows light up as it gets dark.
- **Explore the data.** Search with suggestions, a leaderboard, a minimap you can click to travel, street and district names, and a property-style card per player with a link to their TMX profile.
- **Colour modes.** View the city by awards, account age or height.
- **Control the city.** Order it by maps, awards or join date; filter by minimum maps or awards; scale tower height; show only the top N.
- **Share it.** Copy a link to the exact view (position, time, weather, selected player), or save a screenshot.
- **Fast on modest hardware.** See [Performance](#performance). An auto-quality governor holds the frame rate for you.
- **Optional procedural sound.** City hum, wind, rain, thunder and an engine note, with no audio files.

## Quick start

Requires **Node 18+**.

```bash
git clone https://github.com/<you>/tmx-city.git
cd tmx-city
npm run fetch      # downloads every player from TMX into public/users.json (about a minute)
npm start          # http://localhost:3000
```

No data yet? Skip `npm run fetch`. The app falls back to generated demo data so you can try it immediately.

`npm run fetch` is polite by default (700 ms between requests, backs off on `429`, resumable with Ctrl+C). Options:

| Variable | Default | Meaning |
| --- | --- | --- |
| `COUNT` | `1000` | players per request (auto-halves if the API rejects it) |
| `DELAY_MS` | `700` | pause between requests |
| `MAX_USERS` | all | stop after this many players |
| `FRESH` | unset | `FRESH=1` ignores the saved file and starts over |
| `TMX_USER_AGENT` | built-in | identify yourself to the API, e.g. `"tmx-city (you@example.com)"` |

## Controls

| Input | Action |
| --- | --- |
| `1` `2` `3` `4` | Orbit, Fly, Walk, Drive |
| `W` `A` `S` `D` | Move (drive: throttle and steer) |
| `Q` `E` | Down / up |
| `Shift` | Faster, run, nitro |
| `Space` | Jump (walk), handbrake (drive) |
| Mouse | Orbit: drag and scroll. Walk and fly: click the scene to capture, `Esc` to release |
| `/` | Search |
| `T` | Day-night cycle on / off |
| `L` `P` `M` | Copy link, screenshot, sound |
| `G` `H` | Settings, help |

## How the city is built

- Players are sorted (maps by default) and placed in a **spiral of 70 m blocks**: four 14 m lots plus a 14 m street. Rank decides the district, from *Central Business District* out to *Outskirts*.
- Building **height** is `6 + maps^0.62 * 2.4` metres (sub-linear so the top mappers do not dwarf everyone). Tall buildings get setbacks. Awards add a brass cornice, then a lantern crown (10+), a spire (1+) and a pulsing beacon (50+).
- Everything is **instanced boxes** shaded procedurally: windows, mullions, pilasters and reflections are computed in the fragment shader, not textures.

## Performance

65,790 players is about 150,000 box parts, which is trivial for a GPU to hold but expensive to draw naively. What keeps it smooth:

1. **Real-world scale.** Because buildings are 14 m lots instead of tiny boxes, a given draw distance contains roughly 3x fewer buildings.
2. **Chunked culling.** The city is split into 16x16-lot chunks, each its own draw call with a bounding sphere, so the GPU skips off-screen chunks. Low-rise buildings and street props have shorter range than towers.
3. **Fog-matched draw distance.** Fog density is derived from the draw distance, so culled buildings are already invisible. Distance also stretches with altitude so the overview still works.
4. **Cheap shading.** Lighting is per vertex (every face is flat). Window patterns fade to their average colour at a distance, which also removes shimmering.
5. **GPU traffic.** Cars are placed by the vertex shader on a street lattice around the camera: no per-frame CPU work and no cost that scales with city size.
6. **O(1) picking.** Mouse picking marches a ray over the 2D lot grid instead of testing every building.
7. **Auto quality.** Seven quality levels adjust resolution, draw distance, detail ranges, traffic, rain and glow once a second. A failed level is not retried for 25 seconds, so it does not oscillate.

Slow machine? Open **Settings > Graphics**, untick *Auto quality* and choose *Potato*, or lower *Players shown* in the City tab.

## Project layout

```
public/                 static site (this folder is what gets deployed)
  index.html
  css/style.css
  js/
    main.js             bootstrap, frame loop, quality governor
    config.js           constants, quality levels, weather presets
    data.js             load / sort / filter players
    shaders.js          all GLSL
    env.js              time of day + weather -> lighting uniforms
    world.js            renderer, sky, ground, rain, glow, shared uniforms
    city.js             layout, buildings, props, picking, collision, street names
    traffic.js          GPU-animated ambient cars
    modes.js            orbit / fly / walk / drive
    ui.js               search, minimap, cards, settings, hotkeys
    audio.js            procedural sound
    share.js            shareable view links
scripts/
  fetch-users.js        pages through the TMX API into public/users.json
  serve.js              tiny static server with gzip
test/                   headless smoke test (npm test)
.github/workflows/      test + deploy to GitHub Pages
```

## Deploy to GitHub Pages

1. Push to a GitHub repository (branch `main`).
2. In **Settings > Pages**, set the source to **GitHub Actions**.
3. The included workflow runs the tests, downloads fresh player data, and publishes `public/`. It also refreshes weekly. If the TMX API is unreachable it still deploys, with demo data.

`public/users.json` is git-ignored so you do not commit a large data file.

## Tests

```bash
npm install
npm test
```

The smoke test bundles the real app against a stubbed GPU and DOM, builds the full 65,790-player city, then switches every camera mode, weather and time of day, applies filters and checks that collision, culling, picking and street naming behave. It needs no browser or GPU.

## Browser support

Any current browser with WebGL 2 (Chrome, Edge, Firefox, Safari 15+). Touch devices can orbit and select; walking and driving need a keyboard.

## Data and credits

Player statistics come from the [Trackmania Exchange API](https://api2.mania.exchange). Rendering by [Three.js](https://threejs.org). Fonts: Barlow, Barlow Condensed and IBM Plex Mono via Google Fonts.

## License

[MIT](LICENSE)
