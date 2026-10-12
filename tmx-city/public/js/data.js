// Loading, annotating, filtering and sorting the TMX user list.
export let dateMin = 0;
export let dateMax = 1;

export async function loadUsers(url = 'users.json') {
  let users, demo = false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    users = await res.json();
    if (!Array.isArray(users) || !users.length) throw new Error('empty');
  } catch {
    users = demoUsers(); demo = true;
  }
  annotate(users);
  return { users, demo };
}

function demoUsers() {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 30000 }, (_, i) => {
    const maps = rnd() < 0.7 ? 0 : Math.floor(Math.pow(rnd(), 6) * 900);
    return { UserId: i + 1, Name: 'Demo' + (i + 1), MapCount: maps,
      AwardsReceivedCount: Math.floor(Math.pow(rnd(), 8) * maps * 0.6), RegisteredAt: new Date(1.5e12 + i * 8e6).toISOString() };
  });
}

function annotate(list) {
  let lo = Infinity, hi = -Infinity;
  for (const u of list) {
    const t = Date.parse(u.RegisteredAt) || 0; u._t = t;
    if (t && t < lo) lo = t; if (t > hi) hi = t;
  }
  dateMin = lo === Infinity ? 0 : lo; dateMax = hi > dateMin ? hi : dateMin + 1;
}
/** 0 = oldest account, 1 = newest. */
export const ageNorm = (u) => Math.min(1, Math.max(0, ((u._t || dateMin) - dateMin) / (dateMax - dateMin)));

const maps = (u) => u.MapCount || 0, awards = (u) => u.AwardsReceivedCount || 0;
export const sorters = {
  maps:   (a, b) => maps(b) - maps(a) || awards(b) - awards(a) || a.UserId - b.UserId,
  awards: (a, b) => awards(b) - awards(a) || maps(b) - maps(a) || a.UserId - b.UserId,
  date:   (a, b) => (a._t - b._t) || a.UserId - b.UserId,
};

export function selectUsers(all, s) {
  const list = all.filter((u) => maps(u) >= s.minMaps && awards(u) >= s.minAwards).sort(sorters[s.order] || sorters.maps);
  return s.topN > 0 && s.topN < list.length ? list.slice(0, s.topN) : list;
}
