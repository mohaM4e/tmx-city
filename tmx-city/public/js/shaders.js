// All GLSL lives here. Lighting is computed per vertex (every face is flat), so fragment shaders stay cheap.
import { LOT, STREET_EVERY } from './config.js';

const LIGHT = /* glsl */ `
uniform vec3 uKeyDir, uKeyCol, uHemiSky, uHemiGround, uFillCol; uniform float uFlash;
vec3 shade(vec3 n){
  vec3 hemi = mix(uHemiGround, uHemiSky, n.y * 0.5 + 0.5) * (1.0 + uFlash * 5.0);
  vec3 fd = normalize(vec3(-uKeyDir.x, 0.25, -uKeyDir.z));
  return hemi + uKeyCol * max(dot(n, uKeyDir), 0.0) + uFillCol * max(dot(n, fd), 0.0);
}`;
const FOG = /* glsl */ `
uniform vec3 uFog, uSunGlow, uKeyDir; uniform float uFogD;
vec3 applyFog(vec3 c, vec3 V, float dist){
  vec3 fc = uFog + uSunGlow * pow(max(dot(V, uKeyDir), 0.0), 6.0);
  return mix(c, fc, 1.0 - exp(-uFogD * uFogD * dist * dist));
}`;
const HASH = /* glsl */ `float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;
const L = LOT.toFixed(1), SE = STREET_EVERY.toFixed(1), SM = (STREET_EVERY - 0.5).toFixed(1);

// ---------------------------------------------------------------- buildings + street props (instanced boxes)
// aMeta = (awards trim 0..1, kind, account age 0..1, architectural style)
// kind: 0 building part, 1 spire, 2 beacon, 3 roof equipment, 4 water tank, 10 lamp, 11 trunk, 12 canopy
// style: 0 brick/apartment, 1 glass tower, 2 art deco stone, 3 modern ribbon, 4 industrial
export const BODY_VS = /* glsl */ `
${LIGHT}
attribute vec3 aPos; attribute vec3 aSize; attribute vec3 aCol; attribute vec4 aMeta;
varying vec3 vWP; varying vec3 vN; varying vec3 vCol; varying vec3 vLight; varying vec4 vMeta;
varying float vH; varying float vLocalY; varying float vSeed;
void main(){
  vec3 wp = aPos + position * aSize;
  vWP = wp; vN = normal; vCol = aCol; vMeta = aMeta; vH = aSize.y; vLocalY = position.y;
  vSeed = fract(sin(dot(aPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vLight = shade(normal) * mix(0.55, 1.0, smoothstep(0.0, 26.0, wp.y));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const BODY_FS = /* glsl */ `
${FOG}
uniform vec3 uZenith, uKeyCol;
uniform float uTime, uWinDist, uDetail, uNight, uMode;
varying vec3 vWP; varying vec3 vN; varying vec3 vCol; varying vec3 vLight; varying vec4 vMeta;
varying float vH; varying float vLocalY; varying float vSeed;
${HASH}
vec3 ramp(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.10, 0.15, 0.42), b = vec3(0.08, 0.60, 0.62), c = vec3(1.0, 0.78, 0.20);
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
}
vec3 skyAt(float y){ return y < 0.0 ? vec3(0.03, 0.035, 0.04) + uFog * 0.15 : mix(uFog, uZenith, smoothstep(0.0, 0.7, y)); }

void main(){
  vec3 V = vWP - cameraPosition; float dist = length(V); V /= dist;
  float fwx = fwidth(vWP.x) + fwidth(vWP.z), fwy = fwidth(vWP.y);
  float kind = vMeta.y, style = vMeta.w, trim = vMeta.x;
  vec3 col = vCol * vLight; vec3 emi = vec3(0.0);

  if (kind > 9.5) {                                   // street props
    if (kind < 10.5) {
      float head = step(0.93, vLocalY);
      col = mix(vec3(0.06, 0.065, 0.07) * vLight * 2.0, vec3(0.0), head);
      emi = vec3(1.0, 0.70, 0.36) * head * 2.4 * uNight;
    } else if (kind < 11.5) {
      col = vec3(0.12, 0.08, 0.05) * vLight * 2.0;
    } else {
      col = vec3(0.045, 0.13, 0.04) * (0.55 + 0.9 * h21(floor(vWP.xz * 1.6) + floor(vWP.y * 1.6))) * vLight * 2.0;
    }
  } else if (kind > 2.5) {                            // roof equipment / water tank
    col = (kind < 3.5 ? vec3(0.30, 0.31, 0.32) : vec3(0.20, 0.12, 0.07)) * vLight * 2.0;
  } else if (kind > 1.5) {                            // beacon (50+ awards)
    col = vec3(0.0);
    emi = vec3(1.7, 1.15, 0.5) * (1.4 + 0.6 * sin(uTime * 2.2 + vSeed * 6.28));
  } else if (kind > 0.5) {                            // spire (1+ awards)
    col = vec3(0.55, 0.58, 0.64) * vLight;
  } else if (abs(vN.y) < 0.5) {                       // facade
    bool fx = abs(vN.x) > 0.5;
    float hc = fx ? vWP.z : vWP.x;
    float y = vWP.y;
    float lh = vLocalY * vH;
    float bandH = min(1.6, vH * 0.5);
    float band = step(vH - bandH, lh);
    float bw = style < 0.5 ? 3.0 : style < 1.5 ? 1.5 : style < 2.5 ? 3.2 : style < 3.5 ? 3.0 : 6.0;
    vec2 g = vec2(hc / bw, y / 3.6);
    vec2 f = fract(g);
    vec2 id = floor(g) + (fx ? vec2(0.0) : vec2(41.0, 13.0));
    float fw = max(fwx / bw, fwy / 3.6);
    float fr = uDetail > 0.5 ? smoothstep(uWinDist * 0.5, uWinDist, dist) : 1.0;
    fr = max(fr, smoothstep(0.30, 0.65, fw));         // sub-pixel cells fade to their average (no shimmer)
    float litP = 0.10 + 0.50 * uNight * (0.35 + 0.65 * vSeed);
    float lit = step(1.0 - litP, h21(id + vSeed * 91.0));
    vec3 warm = mix(vec3(1.0, 0.76, 0.40), vec3(0.75, 0.88, 1.0), step(0.85, h21(id + 7.0)));
    vec3 r = reflect(V, vN);
    vec3 refl = skyAt(r.y) * (0.45 + 0.9 * pow(1.0 - abs(dot(vN, V)), 3.0))
              + uKeyCol * pow(max(dot(r, uKeyDir), 0.0), 48.0) * 0.6;
    float ground = 1.0 - step(4.8, y);
    vec3 dCol = col; vec3 dEmi = vec3(0.0);
    if (fr < 0.999) {
      if (style < 0.5) {                              // brick / apartments
        float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.30, f.y) * step(f.y, 0.84) * step(1.0, y);
        dCol = mix(col * (0.92 + 0.16 * h21(floor(g) + 3.0)), refl * 0.35 + vec3(0.01, 0.015, 0.02), win);
        dEmi = warm * lit * win;
      } else if (style < 1.5) {                       // glass curtain wall
        float mull = step(f.x, 0.07), span = step(f.y, 0.16);
        vec3 glass = mix(vCol * 0.5, refl, 0.78);
        dCol = mix(glass, col * 0.55, max(mull, span));
        dEmi = warm * lit * (1.0 - max(mull, span)) * 1.1;
      } else if (style < 2.5) {                       // art deco stone
        float pil = 1.0 - step(0.22, f.x);
        float win = step(0.36, f.x) * step(f.x, 0.88) * step(0.12, f.y) * step(f.y, 0.86) * step(1.0, y);
        dCol = mix(col * (1.0 + 0.14 * pil), refl * 0.3 + vec3(0.01, 0.012, 0.016), win);
        dEmi = warm * lit * win * 0.95;
      } else if (style < 3.5) {                       // modern ribbon windows
        float rib = step(0.24, f.y) * step(f.y, 0.80), mull = step(f.x, 0.04);
        float flr = h21(vec2(id.y, vSeed * 53.0) + (fx ? 0.0 : 9.0));
        float litB = step(1.0 - litP * 1.4, flr) * (0.5 + 0.5 * step(0.4, h21(id + 5.0)));
        dCol = mix(col, refl * 0.5 + vec3(0.01, 0.015, 0.02), rib * (1.0 - mull));
        dEmi = warm * litB * rib * (1.0 - mull) * 0.9;
      } else {                                        // industrial
        float stripe = 0.86 + 0.14 * step(0.5, fract(hc * 2.2));
        float hi = step(7.0, y) * step(y, 9.0) * step(0.25, f.x) * step(f.x, 0.75);
        float door = ground * step(0.18, f.x) * step(f.x, 0.82);
        dCol = mix(col * stripe, vec3(0.01, 0.012, 0.015), max(hi, door * 0.7));
        dEmi = warm * lit * hi * 0.7;
      }
      float shop = ground * step(f.y, 0.8) * step(0.2, f.y) * step(0.55, h21(id + 3.0)) * (style < 3.5 ? 1.0 : 0.0);
      dEmi += vec3(1.0, 0.72, 0.38) * shop * (0.12 + 0.5 * uNight);
    }
    vec3 aCol = (style > 0.5 && style < 1.5) ? mix(col * 0.7, refl * 0.8, 0.6) : col * 0.95;
    vec3 aEmi = vec3(1.0, 0.74, 0.40) * (0.02 + 0.11 * uNight) * (1.0 - 0.5 * vSeed) * (style > 3.5 ? 0.35 : 1.0);
    col = mix(dCol, aCol, fr); emi = mix(dEmi, aEmi, fr);
    float gold = step(0.02, trim);                    // awards: brass cornices that glow at night
    vec3 brass = mix(vec3(0.30, 0.30, 0.34), vec3(0.95, 0.72, 0.26), trim);
    float brassMix = band * ((style > 1.5 && style < 2.5) ? 1.0 : gold);
    col = mix(col, brass * vLight * 2.0, brassMix);
    col *= 1.0 + 0.18 * band * (1.0 - brassMix);
    emi += brass * trim * band * 0.6 * (0.4 + uNight) * (1.0 - 0.5 * fr);
  } else if (vN.y > 0.5) {                            // roofs
    col = vCol * vLight * (0.45 + 0.25 * h21(floor(vWP.xz * 0.8)));
  }

  if (uMode > 0.5 && kind < 0.5) {                    // data colour modes
    float tv = uMode < 1.5 ? trim : uMode < 2.5 ? vMeta.z : vWP.y / 140.0;
    vec3 tint = ramp(tv);
    col = mix(col, tint * vLight * 1.5, 0.85); emi = emi * 0.25 + tint * 0.3;
  }
  gl_FragColor = vec4(applyFog(col + emi, V, dist), 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- ground: streets, kerbs, crosswalks, wet asphalt, lamp pools
export const GROUND_VS = /* glsl */ `varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const GROUND_FS = /* glsl */ `
${FOG}
uniform vec3 uZenith, uKeyCol, uHemiSky, uHeadPos, uHeadDir;
uniform float uNight, uWet, uHeadOn, uFlash;
varying vec3 vWP;
void main(){
  const float LOT = ${L};
  vec2 gc = vWP.xz / LOT + 0.5; vec2 cell = floor(gc); vec2 fc = fract(gc); vec2 m = fc * LOT;
  float sx = step(${SM}, mod(cell.x, ${SE})), sy = step(${SM}, mod(cell.y, ${SE}));
  float street = max(sx, sy), inter = sx * sy, vert = sx * (1.0 - sy), hori = sy * (1.0 - sx);
  vec3 V = vWP - cameraPosition; float dist = length(V); V /= dist;
  float nr = 1.0 - smoothstep(80.0, 450.0, dist);
  float swX = clamp(step(m.x, 2.5) + step(LOT - 2.5, m.x), 0.0, 1.0);
  float swY = clamp(step(m.y, 2.5) + step(LOT - 2.5, m.y), 0.0, 1.0);
  float sidewalk = vert * swX + hori * swY + inter * swX * swY;
  float pav = step(0.03, fract(vWP.x / 1.5)) * step(0.03, fract(vWP.z / 1.5));
  vec3 walk = vec3(0.20, 0.195, 0.185) * mix(1.0, 0.82 + 0.18 * pav, nr);
  vec3 alb = street > 0.5 ? (sidewalk > 0.5 ? walk : vec3(0.020, 0.022, 0.026)) : walk * 0.55;
  float asph = street * (1.0 - sidewalk);
  float lc = vert * abs(m.x - LOT * 0.5) + hori * abs(m.y - LOT * 0.5);
  float along = vert * vWP.z + hori * vWP.x;
  float dash = step(lc, 0.12) * step(0.5, fract(along / 6.0)) * (vert + hori);
  float edgeL = step(abs(lc - 4.0), 0.07) * (vert + hori);
  float zebraA = inter * step(2.5, m.x) * step(m.x, LOT - 2.5) * (step(m.y, 3.4) + step(LOT - 3.4, m.y)) * step(0.5, fract(m.x / 1.2));
  float zebraB = inter * step(2.5, m.y) * step(m.y, LOT - 2.5) * (step(m.x, 3.4) + step(LOT - 3.4, m.x)) * step(0.5, fract(m.y / 1.2));
  float mark = clamp(dash + edgeL * 0.8 + zebraA + zebraB, 0.0, 1.0) * asph * nr;
  alb = mix(alb, vec3(0.62, 0.60, 0.52), mark);
  alb *= 1.0 - 0.4 * uWet * asph;

  vec3 Lg = (uHemiSky * 0.8 + uKeyCol * max(uKeyDir.y, 0.0) * 0.9) * (1.0 + uFlash * 4.0);
  vec3 col = alb * Lg;
  vec3 r = vec3(V.x, -V.y, V.z);
  float fres = pow(1.0 - clamp(-V.y, 0.0, 1.0), 5.0);
  col += (uKeyCol * pow(max(dot(r, uKeyDir), 0.0), 60.0) * (0.15 + 2.0 * uWet)
        + mix(uFog, uZenith, 0.3) * fres * (0.10 + 0.8 * uWet)) * asph * nr;

  float sideV = mod(cell.y, 2.0) * 2.0 - 1.0, sideH = mod(cell.x, 2.0) * 2.0 - 1.0;
  vec2 lampPos = vec2(LOT * 0.5 + vert * sideV * 5.7, LOT * 0.5 + hori * sideH * 5.7);
  vec2 dl = m - lampPos;
  col += vec3(1.0, 0.70, 0.36) * exp(-dot(dl, dl) / 55.0) * (vert + hori) * uNight * 1.1 * nr;

  vec3 hd = vWP - uHeadPos; float ha = dot(hd.xz, uHeadDir.xz); float hl = length(hd.xz - uHeadDir.xz * ha);
  float cone = smoothstep(0.0, 3.0, ha) * exp(-ha / 20.0) * exp(-hl * hl / (0.06 * ha * ha + 3.0)) * uHeadOn;
  col += vec3(1.0, 0.95, 0.8) * cone * 1.4 * (0.3 + 0.7 * asph) * (0.15 + uNight);

  gl_FragColor = vec4(applyFog(col, V, dist), 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- ambient traffic: positions computed on the GPU, wrapped around the camera
export const TRAFFIC_VS = /* glsl */ `
${LIGHT}
attribute vec4 aA;                                   // street slot, phase, signed speed, seed
uniform vec3 uCam; uniform float uTime, uBound, uCarDist;
varying vec3 vWP; varying vec3 vN; varying vec3 vCol; varying vec3 vLight; varying vec3 vDir; varying float vLat; varying float vLocalY;
const vec3 PAL[7] = vec3[7](vec3(0.62,0.62,0.64), vec3(0.025,0.025,0.03), vec3(0.30,0.31,0.34), vec3(0.45,0.03,0.03),
                            vec3(0.04,0.10,0.34), vec3(0.85,0.60,0.04), vec3(0.03,0.16,0.10));
void main(){
  const float LOT = ${L};
  float axis = step(0.5, fract(aA.w * 13.13));       // 0: drives along z, 1: along x
  float W = 640.0, K = 16.0;
  float camLat = axis < 0.5 ? uCam.x : uCam.z;
  float camAlong = axis < 0.5 ? uCam.z : uCam.x;
  float kBase = floor((camLat / LOT - ${(STREET_EVERY - 1).toFixed(1)}) / ${SE} + 0.5);
  float k = kBase + floor(aA.x * K) - K * 0.5;
  float lat = (${SE} * k + ${(STREET_EVERY - 1).toFixed(1)}) * LOT;
  float dirS = aA.z < 0.0 ? -1.0 : 1.0;
  float along = mod(aA.y * W + dirS * abs(aA.z) * uTime - (camAlong - W * 0.5), W) + (camAlong - W * 0.5);
  float lane = (axis < 0.5 ? -2.6 : 2.6) * dirS;     // drive on the right
  vec3 base = axis < 0.5 ? vec3(lat + lane, 0.0, along) : vec3(along, 0.0, lat + lane);
  vec2 dc = base.xz - uCam.xz;
  if (abs(lat) > uBound || abs(along) > uBound || dot(dc, dc) > uCarDist * uCarDist) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 size = axis < 0.5 ? vec3(1.9, 1.45, 4.5) : vec3(4.5, 1.45, 1.9);
  vec3 local = position * size;
  if (position.y > 0.5) local.xz *= 0.8;             // tapered cabin
  vec3 wp = base + local;
  vWP = wp; vN = normal; vLocalY = position.y;
  vDir = axis < 0.5 ? vec3(0.0, 0.0, dirS) : vec3(dirS, 0.0, 0.0);
  vLat = axis < 0.5 ? position.x : position.z;
  vCol = PAL[int(floor(fract(aA.w * 91.7) * 7.0))];
  vLight = shade(normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
export const TRAFFIC_FS = /* glsl */ `
${FOG}
uniform float uNight;
varying vec3 vWP; varying vec3 vN; varying vec3 vCol; varying vec3 vLight; varying vec3 vDir; varying float vLat; varying float vLocalY;
void main(){
  vec3 V = vWP - cameraPosition; float dist = length(V); V /= dist;
  vec3 col = vCol * vLight * 1.6; vec3 emi = vec3(0.0);
  float facing = dot(vN, vDir);
  if (abs(vN.y) < 0.5) {
    float glass = step(0.52, vLocalY) * step(vLocalY, 0.93);
    col = mix(col, vec3(0.02, 0.03, 0.04), glass);
    float lamps = step(0.22, vLocalY) * step(vLocalY, 0.42) * step(0.16, abs(vLat)) * step(abs(vLat), 0.46);
    if (facing > 0.5) emi = vec3(1.4, 1.3, 1.0) * lamps * (0.25 + 1.6 * uNight);
    else if (facing < -0.5) emi = vec3(1.3, 0.05, 0.03) * lamps * (0.3 + 1.0 * uNight);
  } else if (vN.y > 0.5) col *= 0.9;
  gl_FragColor = vec4(applyFog(col + emi, V, dist), 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- generic lit part (the player's car)
export const PART_VS = /* glsl */ `
${LIGHT}
varying vec3 vWP; varying vec3 vLight;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz;
  vLight = shade(normalize(mat3(modelMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const PART_FS = /* glsl */ `
${FOG}
uniform vec3 uColor, uEmit;
varying vec3 vWP; varying vec3 vLight;
void main(){
  vec3 V = vWP - cameraPosition; float dist = length(V); V /= dist;
  gl_FragColor = vec4(applyFog(uColor * vLight * 1.6 + uEmit, V, dist), 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- sky dome
export const SKY_VS = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const SKY_FS = /* glsl */ `
varying vec3 vDir;
uniform vec3 uFog, uZenith, uSunDir, uSunCol, uMoonDir, uSunGlow;
uniform float uTime, uFlash, uNight, uCloud, uDark;
${HASH}
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uFog, uZenith, pow(h, 0.5));
  float sd = max(dot(d, uSunDir), 0.0), md = max(dot(d, uMoonDir), 0.0);
  col += uSunGlow * (pow(sd, 5.0) * 0.5 + pow(sd, 18.0) * 0.8);
  float cover = 0.0;
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.22) * 1.8 + vec2(uTime * 0.012, uTime * 0.006);
    float n = 0.55 * vn(uv) + 0.30 * vn(uv * 2.03) + 0.15 * vn(uv * 4.1);
    cover = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.35, n) * smoothstep(0.0, 0.18, d.y);
    float st = step(0.997, h21(floor(d.xz / max(d.y, 0.05) * 90.0))) * uNight * (1.0 - uCloud);
    col += vec3(st);
  }
  col += uSunCol * pow(sd, 900.0) * 4.0 * (1.0 - uCloud * 0.8);
  col += vec3(0.8, 0.85, 1.0) * (pow(md, 700.0) * 1.8 + pow(md, 20.0) * 0.12) * uNight * (1.0 - uCloud * 0.8);
  vec3 cloud = (mix(uFog, uZenith, 0.35) * 1.1 + uSunGlow * pow(sd, 3.0) * 1.2) * (1.0 - uDark * 0.55) + vec3(0.02);
  col = mix(col, cloud, cover * 0.92);
  col += uFlash * vec3(0.45, 0.5, 0.7) * (0.25 + cover);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- rain streaks (GPU-animated lines)
export const RAIN_VS = /* glsl */ `
attribute float aEnd; uniform float uTime; uniform vec3 uCam; varying float vA;
void main(){
  float S = 160.0; vec3 p = position;
  p.x = mod(p.x - uCam.x, S) - S * 0.5 + uCam.x; p.z = mod(p.z - uCam.z, S) - S * 0.5 + uCam.z;
  float y = mod(p.y - uTime * 26.0, 60.0); p.y = max(0.0, uCam.y - 25.0 + y);
  p.y += aEnd * 1.4; p.x += aEnd * 0.15;
  vA = (1.0 - clamp(length(p - uCam) / (S * 0.5), 0.0, 1.0)) * 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
export const RAIN_FS = /* glsl */ `uniform vec3 uFog; varying float vA; void main(){ gl_FragColor = vec4(uFog * 1.5 + vec3(0.12), vA); #include <colorspace_fragment> }`;
