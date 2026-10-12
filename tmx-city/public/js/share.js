// Shareable view links: #m=orbit&p=x,y,z&t=x,y,z&h=18.6&w=clear&s=Name
const r1 = (n) => Math.round(n * 10) / 10;
export function encode({ mode, pos, tgt, hour, weather, player }) {
  const q = new URLSearchParams();
  q.set('m', mode); q.set('p', [pos.x, pos.y, pos.z].map(r1).join(',')); q.set('t', [tgt.x, tgt.y, tgt.z].map(r1).join(','));
  q.set('h', r1(hour)); q.set('w', weather); if (player) q.set('s', player);
  return q.toString();
}
export function decode(hash) {
  const q = new URLSearchParams((hash || '').replace(/^#/, ''));
  if (!q.has('p')) return null;
  const v = (k) => (q.get(k) || '').split(',').map(Number);
  const p = v('p'), t = v('t');
  if (p.length !== 3 || p.some(Number.isNaN)) return null;
  return { mode: q.get('m') || 'orbit', pos: p, tgt: t.length === 3 && !t.some(Number.isNaN) ? t : [0, 0, 0],
    hour: Number(q.get('h')), weather: q.get('w'), player: q.get('s') };
}
