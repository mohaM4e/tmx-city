# Contributing

Thanks for helping! The project is plain ES modules with no build step, so a change is: edit, refresh the page.

```bash
npm install     # dev tools only (three + esbuild for the test)
npm start       # http://localhost:3000
npm test        # headless smoke test, no GPU needed
```

## Ground rules

- **Keep the frame budget.** Anything per-frame must be O(visible), never O(players). If you add geometry, add it to the chunked batches in `city.js` so it is culled with the rest.
- **Shaders live in `public/js/shaders.js`.** Lighting is per vertex on purpose. If you add a uniform, add it to `SH` in `world.js` so every material shares one write.
- **World units are metres.** One lot is 14 m, a block is 70 m, a floor is 3.6 m.
- **Be kind to the TMX API.** Do not lower the request delay in `scripts/fetch-users.js`.
- Run `npm test` before opening a PR. Screenshots and a short note on performance impact are very welcome.
