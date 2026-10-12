// Procedural ambience (no audio files): city hum, wind, rain, thunder and an engine note. Off until the user opts in.
export function createAudio() {
  let ctx = null, n = null, on = false;
  const noise = (c, kind) => {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s;
  };
  const chain = (c, src, type, freq, q = 0.7) => { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(c.destination); return g; };
  function init() {
    ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 40;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 500; const eg = ctx.createGain(); eg.gain.value = 0;
    osc.connect(ef); ef.connect(eg); eg.connect(ctx.destination); osc.start();
    n = { city: chain(ctx, noise(ctx, 'brown'), 'lowpass', 260), wind: chain(ctx, noise(ctx, 'brown'), 'lowpass', 900), rain: chain(ctx, noise(ctx, 'white'), 'bandpass', 4200, 0.5), osc, eg };
  }
  const ramp = (p, v) => p.setTargetAtTime(v, ctx.currentTime, 0.4);
  return {
    get enabled() { return on; },
    toggle() {
      if (!ctx) init();
      on = !on; if (on && ctx.state === 'suspended') ctx.resume();
      if (!on) Object.values(n).forEach((x) => x.gain && ramp(x.gain, 0));
      return on;
    },
    update({ alt, rain, speed, driving }) {
      if (!on) return;
      const low = 1 / (1 + alt / 60);
      ramp(n.city.gain, 0.10 * low); ramp(n.wind.gain, Math.min(0.2, alt / 900));
      ramp(n.rain.gain, rain * 0.07 * (0.4 + 0.6 * low));
      ramp(n.eg.gain, driving ? 0.04 + Math.min(speed, 40) * 0.0008 : 0);
      n.osc.frequency.setTargetAtTime(38 + speed * 3.2, ctx.currentTime, 0.1);
    },
    thunder() {
      if (!on) return;
      setTimeout(() => {
        const s = noise(ctx, 'brown'), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'lowpass'; f.frequency.value = 160; g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.2);
        s.connect(f); f.connect(g); g.connect(ctx.destination); setTimeout(() => s.stop(), 3400);
      }, 400 + Math.random() * 1800);
    },
  };
}
