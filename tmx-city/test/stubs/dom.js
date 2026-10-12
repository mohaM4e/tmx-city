// A forgiving DOM double: any property access/call returns another double, so UI code runs headlessly.
export function dom() {
  const store = { style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, children: [], width: 220, height: 220, hidden: false, value: '' };
  const fn = function () {};
  return new Proxy(fn, {
    get(_, p) {
      if (p === Symbol.toPrimitive) return () => '1';
      if (p in store) return store[p];
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 220, height: 220 });
      if (p === 'querySelectorAll') return () => [];
      if (p === 'toBlob') return (cb) => cb(null);
      return dom();
    },
    set(_, p, v) { store[p] = v; return true; },
    apply() { return dom(); },
  });
}
export function installDom(users) {
  const g = globalThis;
  g.document = { getElementById: () => dom(), createElement: () => dom(), querySelectorAll: () => [], addEventListener() {}, body: dom(), pointerLockElement: null };
  g.innerWidth = 1280; g.innerHeight = 720; g.devicePixelRatio = 1;
  g.matchMedia = () => ({ matches: false });
  g.requestAnimationFrame = (f) => setTimeout(f, 0);
  g.addEventListener = () => {};
  g.location = { hash: '', origin: 'http://localhost', pathname: '/' };
  g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  Object.defineProperty(g, 'navigator', { value: { clipboard: null }, configurable: true });
  g.prompt = () => {};
  g.fetch = async () => ({ ok: true, json: async () => users });
}
