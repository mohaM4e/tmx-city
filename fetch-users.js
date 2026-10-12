// Pages through https://trackmania.exchange/api/users using the `after` cursor
// and saves everything to public/users.json. Resumable: re-run to continue.
//
// Env options:  COUNT=1000  DELAY_MS=700  MAX_USERS=50000  FRESH=1
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://trackmania.exchange/api/users';
const FIELDS = ['UserId', 'Name', 'MapCount', 'AwardsReceivedCount', 'RegisteredAt'];
const UA = 'tmx-city/1.0 (hobby project; contact: your-moh.elsherif2011@gmail.com)'; // <- edit me

let count = Number(process.env.COUNT || 1000);
const DELAY_MS = Number(process.env.DELAY_MS || 700);
const MAX_USERS = Number(process.env.MAX_USERS || Infinity);
const MAX_RETRIES = 6;
const SAVE_EVERY_PAGES = 10;

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'public', 'users.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(after, pageSize) {
  const qs = new URLSearchParams(); // encodes the commas as %2C, as the docs require
  qs.set('fields', FIELDS.join(','));
  qs.set('count', String(pageSize));
  if (after != null) qs.set('after', String(after));

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}?${qs}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      console.warn(`Network error (${err.message}), retry ${attempt}/${MAX_RETRIES}`);
      await sleep(Math.min(60000, 2000 * 2 ** attempt));
      continue;
    }
    if (res.ok) return res.json();

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRIES) throw new Error(`Giving up after HTTP ${res.status}`);
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 2000 * 2 ** attempt);
      console.warn(`HTTP ${res.status}, waiting ${Math.round(wait / 1000)}s (retry ${attempt}/${MAX_RETRIES})`);
      await sleep(wait);
      continue;
    }
    if (res.status === 400 && pageSize > 40) return { shrink: true }; // page size probably too big
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function save(users) {
  await mkdir(dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp';
  await writeFile(tmp, JSON.stringify(users));
  await rename(tmp, OUT); // atomic, so a crash never leaves a half-written file
}

async function main() {
  let users = [];
  if (!process.env.FRESH) {
    try {
      users = JSON.parse(await readFile(OUT, 'utf8'));
      if (users.length) console.log(`Resuming from ${users.length} saved users`);
    } catch { /* first run */ }
  }

  let after = users.length ? users[users.length - 1].UserId : null;
  let pages = 0;
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.log('\nStopping after this page...'); });

  while (!stopping && users.length < MAX_USERS) {
    const data = await fetchPage(after, count);
    if (data.shrink) {
      count = Math.max(40, Math.floor(count / 2));
      console.warn(`Page size rejected, trying count=${count}`);
      continue;
    }
    const batch = data.Results || [];
    if (!batch.length) break;

    users.push(...batch);
    after = batch[batch.length - 1].UserId; // cursor for the next page
    pages++;
    console.log(`Page ${pages}: +${batch.length} (total ${users.length}, last UserId ${after})`);

    if (pages % SAVE_EVERY_PAGES === 0) await save(users);
    if (!data.More) { console.log('Reached the end of the user list.'); break; }
    await sleep(DELAY_MS); // polite pacing
  }

  await save(users);
  console.log(`Saved ${users.length} users to ${OUT}`);
}

main().catch(async (err) => { console.error('Failed:', err.message); process.exit(1); });
