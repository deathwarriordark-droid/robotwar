// RobotWar — modelli 3D dettagliati dei mech, generati da codice (nessun asset esterno).
// Ogni pezzo rigido è composto da decine di primitive (piastre smussate, giunti, pistoni,
// cavi, bulloni, sfiati, luci) fuse in poche mesh per materiale, e messe in cache.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PARTI, RARITA } from './config.js';

// ------------------------------------------------------------------
// Texture procedurali: piastre con giunture, rivetti, usura e graffi
// ------------------------------------------------------------------
function creaTexture() {
  const N = 512;
  const alt = document.createElement('canvas'); alt.width = alt.height = N;
  const col = document.createElement('canvas'); col.width = col.height = N;
  const rug = document.createElement('canvas'); rug.width = rug.height = N;
  const ga = alt.getContext('2d'), gc = col.getContext('2d'), gr = rug.getContext('2d');
  let seme = 7;
  const rnd = () => ((seme = (seme * 16807) % 2147483647) / 2147483647);

  ga.fillStyle = '#808080'; ga.fillRect(0, 0, N, N);
  gc.fillStyle = '#ececec'; gc.fillRect(0, 0, N, N);
  gr.fillStyle = '#8c8c8c'; gr.fillRect(0, 0, N, N);
  // sporco a macchie
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * N, y = rnd() * N, r = 2 + rnd() * 14;
    gc.fillStyle = `rgba(60,55,50,${rnd() * 0.06})`;
    gc.beginPath(); gc.arc(x, y, r, 0, 7); gc.fill();
    gr.fillStyle = `rgba(${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},0.05)`;
    gr.beginPath(); gr.arc(x, y, r, 0, 7); gr.fill();
  }
  // giunture lungo il bordo (ogni faccia è una piastra) e una giuntura interna
  const giuntura = (x0, y0, x1, y1) => {
    ga.strokeStyle = '#2a2a2a'; ga.lineWidth = 7; ga.beginPath(); ga.moveTo(x0, y0); ga.lineTo(x1, y1); ga.stroke();
    gc.strokeStyle = 'rgba(30,30,32,0.75)'; gc.lineWidth = 4; gc.beginPath(); gc.moveTo(x0, y0); gc.lineTo(x1, y1); gc.stroke();
    gc.strokeStyle = 'rgba(255,255,255,0.18)'; gc.lineWidth = 2; gc.beginPath(); gc.moveTo(x0 + 3, y0 + 3); gc.lineTo(x1 + 3, y1 + 3); gc.stroke();
  };
  giuntura(4, 4, N - 4, 4); giuntura(4, N - 4, N - 4, N - 4); giuntura(4, 4, 4, N - 4); giuntura(N - 4, 4, N - 4, N - 4);
  giuntura(4, N * 0.62, N - 4, N * 0.62);
  giuntura(N * 0.38, N * 0.62, N * 0.38, N - 4);
  // rivetti
  const rivetto = (x, y) => {
    ga.fillStyle = '#d8d8d8'; ga.beginPath(); ga.arc(x, y, 6, 0, 7); ga.fill();
    gc.fillStyle = 'rgba(40,40,40,0.55)'; gc.beginPath(); gc.arc(x + 1, y + 1, 6, 0, 7); gc.fill();
    gc.fillStyle = 'rgba(255,255,255,0.55)'; gc.beginPath(); gc.arc(x - 1, y - 1, 3.5, 0, 7); gc.fill();
  };
  for (const t of [0.06, 0.94]) for (let k = 0; k < 6; k++) { rivetto(N * (0.12 + k * 0.152), N * t); rivetto(N * t, N * (0.12 + k * 0.152)); }
  for (let k = 0; k < 6; k++) rivetto(N * (0.12 + k * 0.152), N * 0.58);
  // griglia di sfogo in un angolo
  for (let k = 0; k < 6; k++) {
    ga.fillStyle = '#3a3a3a'; ga.fillRect(N * 0.62, N * 0.7 + k * 16, N * 0.26, 7);
    gc.fillStyle = 'rgba(20,20,22,0.7)'; gc.fillRect(N * 0.62, N * 0.7 + k * 16, N * 0.26, 7);
  }
  // graffi chiari e lucidi
  for (let i = 0; i < 160; i++) {
    const x = rnd() * N, y = rnd() * N, l = 6 + rnd() * 40, a = rnd() * Math.PI;
    gc.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.25})`; gc.lineWidth = 1;
    gc.beginPath(); gc.moveTo(x, y); gc.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gc.stroke();
    gr.strokeStyle = 'rgba(20,20,20,0.6)'; gr.lineWidth = 1.5;
    gr.beginPath(); gr.moveTo(x, y); gr.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gr.stroke();
  }
  // bordi consumati
  for (let i = 0; i < 300; i++) {
    const lato = Math.floor(rnd() * 4), t = rnd() * N, p = 4 + rnd() * 10;
    const [x, y] = lato === 0 ? [t, p] : lato === 1 ? [t, N - p] : lato === 2 ? [p, t] : [N - p, t];
    gc.fillStyle = `rgba(255,255,255,${rnd() * 0.3})`; gc.fillRect(x, y, 2 + rnd() * 6, 1 + rnd() * 2);
  }
  // mappa normale dall'altezza (Sobel)
  const d = ga.getImageData(0, 0, N, N).data;
  const nm = document.createElement('canvas'); nm.width = nm.height = N;
  const gn = nm.getContext('2d'), img = gn.createImageData(N, N);
  const h = (x, y) => d[((((y + N) % N) * N + ((x + N) % N)) * 4)] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 2.5, dy = (h(x, y + 1) - h(x, y - 1)) * 2.5;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  gn.putImageData(img, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(col, true), normal: tex(nm, false), rough: tex(rug, false) };
}
const TEX = creaTexture();

export const MAT = {
  m: new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.map, normalMap: TEX.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: TEX.rough, metalness: 0.45, roughness: 0.58 }),
  e: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  v: new THREE.MeshStandardMaterial({ color: 0x0c1a26, metalness: 0.95, roughness: 0.06, emissive: 0x06121c }),
};
export const MAT_BRUCIATO = {
  m: new THREE.MeshStandardMaterial({ color: 0x2b2725, map: TEX.map, normalMap: TEX.normal, roughness: 1, metalness: 0.3 }),
  e: new THREE.MeshBasicMaterial({ color: 0xff5a1a }),
  v: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }),
};
const matScudo = new THREE.MeshBasicMaterial({ color: 0x3fd6ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const matFiamma = new THREE.MeshBasicMaterial({ color: 0x6fb8ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const matNucleoFiamma = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const GEO_FIAMMA = new THREE.ConeGeometry(1, 1, 12); GEO_FIAMMA.translate(0, 0.5, 0);

// Riflessi metallici: mappa d'ambiente generata una volta sola
let ambienteFatto = false;
export function preparaAmbiente(renderer) {
  if (ambienteFatto) return;
  ambienteFatto = true;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  for (const m of [MAT.m, MAT.v, MAT_BRUCIATO.m, ...matLivree.values()]) { m.envMap = env; m.envMapIntensity = 1.25; m.needsUpdate = true; }
  MAT.v.envMapIntensity = 1.6;
}

// ------------------------------------------------------------------
// Kit di costruzione: accumula primitive colorate e le fonde per materiale
// ------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), SU = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const ATTR = ['position', 'normal', 'uv', 'color'];

export class Kit {
  constructor() { this.g = {}; }

  metti(geo, tipo, colore, pos, quat, scala) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    _m.compose(pos, quat, scala);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    _c.set(colore).convertSRGBToLinear();
    for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!ATTR.includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    (this.g[tipo] ||= []).push(g);
    return this;
  }
  // geometria con posizione/rotazione euler/scala
  agg(geo, tipo, colore, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return this.metti(geo, tipo, colore, _p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  }
  // piastra smussata
  box(w, h, d, x, y, z, colore, rx = 0, ry = 0, rz = 0, tipo = 'm', sm = 0.07) {
    const r = Math.min(sm, w / 2.2, h / 2.2, d / 2.2);
    return this.agg(r > 0.01 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), tipo, colore, x, y, z, rx, ry, rz);
  }
  cil(rt, rb, h, x, y, z, colore, rx = 0, ry = 0, rz = 0, seg = 14, tipo = 'm') {
    return this.agg(new THREE.CylinderGeometry(rt, rb, h, seg), tipo, colore, x, y, z, rx, ry, rz);
  }
  sfera(r, x, y, z, colore, tipo = 'm', sx = 1, sy = 1, sz = 1) {
    return this.agg(new THREE.SphereGeometry(r, 14, 10), tipo, colore, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  toro(R, t, x, y, z, colore, rx = 0, ry = 0, rz = 0, tipo = 'm') {
    return this.agg(new THREE.TorusGeometry(R, t, 6, 20), tipo, colore, x, y, z, rx, ry, rz);
  }
  // trave/cilindro orientati da a a b
  orienta(geo, a, b, tipo, colore) {
    _a.set(...a); _b.set(...b);
    const dir = _b.clone().sub(_a), L = dir.length();
    _q.setFromUnitVectors(SU, dir.normalize());
    return this.metti(geo(L), tipo, colore, _p.copy(_a).add(_b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  }
  trave(a, b, w, d, colore, tipo = 'm') {
    return this.orienta((L) => new RoundedBoxGeometry(w, L, d, 2, Math.min(0.06, w / 2.2, d / 2.2, L / 2.2)), a, b, tipo, colore);
  }
  asta(a, b, r, colore, tipo = 'm', seg = 10) {
    return this.orienta((L) => new THREE.CylinderGeometry(r, r, L, seg), a, b, tipo, colore);
  }
  pistone(a, b, r, C) {
    const m = [a[0] + (b[0] - a[0]) * 0.58, a[1] + (b[1] - a[1]) * 0.58, a[2] + (b[2] - a[2]) * 0.58];
    this.asta(a, m, r, C.d);
    this.asta(m, b, r * 0.5, C.k);
    this.asta([a[0] + (m[0] - a[0]) * 0.85, a[1] + (m[1] - a[1]) * 0.85, a[2] + (m[2] - a[2]) * 0.85], m, r * 1.18, C.j);
    this.sfera(r * 1.05, ...a, C.j);
    this.sfera(r * 0.8, ...b, C.j);
    return this;
  }
  cavo(punti, r, colore) {
    const curva = new THREE.CatmullRomCurve3(punti.map((p) => new THREE.Vector3(...p)));
    return this.agg(new THREE.TubeGeometry(curva, 14, r, 6), 'm', colore);
  }
  bulloni(lista, colore, r = 0.055) {
    for (const p of lista) this.agg(new THREE.CylinderGeometry(r, r, 0.05, 6), 'm', colore, p[0], p[1], p[2], p[3] || 0, p[4] || 0, p[5] || 0);
    return this;
  }
  // sfiato: cornice + lamelle inclinate. Orientato con ry.
  griglia(w, h, n, x, y, z, C, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    this.box(w, h, 0.08, x, y, z, C.d, 0, ry, 0, 'm', 0.02);
    for (let i = 0; i < n; i++) {
      const yy = y - h / 2 + (h / n) * (i + 0.5);
      this.box(w * 0.88, h / n * 0.45, 0.06, x + s * 0.05, yy, z + c * 0.05, C.j, 0.5, ry, 0, 'm', 0);
    }
    return this;
  }
  luce(w, h, x, y, z, colore, ry = 0) { return this.box(w, h, 0.06, x, y, z, colore, 0, ry, 0, 'e', 0); }

  fondi() {
    const out = {};
    for (const k of ['m', 'e', 'v', ...Object.keys(this.g)]) out[k] = this.g[k]?.length ? mergeGeometries(this.g[k], false) : null;
    for (const k of Object.keys(this.g)) for (const g of this.g[k]) g.dispose();
    return out;
  }
}

const cache = new Map();
function pezzo(chiave, costruisci) {
  if (!cache.has(chiave)) { const k = new Kit(); costruisci(k); cache.set(chiave, k.fondi()); }
  return cache.get(chiave);
}
function mesh(geos, mat) {
  const g = new THREE.Group();
  for (const k of ['m', 'e', 'v']) {
    if (!geos[k]) continue;
    const m = new THREE.Mesh(geos[k], mat[k]);
    m.userData.k = k;
    m.castShadow = k === 'm';
    m.receiveShadow = k === 'm';
    g.add(m);
  }
  return g;
}

function colori(fin, r = 0, luci = 0) {
  const f = PARTI.finitura[fin] || PARTI.finitura[0];
  const a = luci && PARTI.luci[luci] ? PARTI.luci[luci].colore : f.accento;
  return { p: f.primario, s: f.secondario, a, d: '#2a2e34', j: '#474d55', k: '#c3cad1', g: '#16181b', y: '#e3b02a', r: RARITA[r]?.colore || '#ffffff', id: f.id + (luci ? 'L' + luci : '') };
}

// ------------------------------------------------------------------
// Pezzi del corpo
// ------------------------------------------------------------------
const DIM_TORSO = [
  { W: 2.36, H: 1.95, D: 1.8, cy: 1.45, cima: 2.5 },
  { W: 2.72, H: 2.2, D: 2.2, cy: 1.55, cima: 2.7 },
  { W: 3.2, H: 2.5, D: 2.7, cy: 1.72, cima: 3.0 },
];
// altezze dello scheletro: gambe lunghe, il robot è alto circa 8,4 m
const ALT_BACINO = 3.95, ALT_TORSO = 4.35;

function costruisciTorso(K, t, C) {
  const T = DIM_TORSO[t], W = T.W, D = T.D, H = T.H, cy = T.cy;
  // vita snodata ad anelli, stretta
  for (let i = 0; i < 3; i++) K.cil(W * 0.2 - i * 0.02, W * 0.22 - i * 0.02, 0.2, 0, 0.05 + i * 0.22, 0, i % 2 ? C.j : C.d, 0, 0, 0, 16);
  K.cil(W * 0.1, W * 0.1, 0.8, 0, 0.3, 0, C.k);
  // addome a bande sovrapposte che si allargano verso l'alto
  for (let i = 0; i < 3; i++) K.box(W * (0.42 + i * 0.07), 0.28, D * (0.6 + i * 0.04), 0, 0.62 + i * 0.27, 0.04 * i, i % 2 ? C.s : C.d, -0.06, 0, 0, 'm', 0.06);
  // petto a V: parte bassa stretta, parte alta larga, fianchi inclinati
  K.box(W * 0.7, H * 0.42, D * 0.85, 0, cy - H * 0.2, 0, C.p, 0, 0, 0, 'm', 0.12);
  K.box(W * 1.12, H * 0.58, D, 0, cy + H * 0.2, 0, C.p, 0, 0, 0, 'm', 0.16);
  for (const l of [-1, 1]) {
    K.trave([l * W * 0.3, cy - H * 0.46, 0], [l * W * 0.56, cy + H * 0.44, 0], 0.26, D * 0.92, C.s);
    K.trave([l * W * 0.37, cy - H * 0.3, D * 0.36], [l * W * 0.55, cy + H * 0.3, D * 0.36], 0.1, 0.3, C.d);
  }
  // pettorali a due strati
  for (const l of [-1, 1]) {
    K.box(W * 0.48, H * 0.36, 0.22, l * W * 0.26, cy + H * 0.22, D / 2 + 0.07, C.p, -0.16, l * -0.2, 0, 'm', 0.09);
    K.box(W * 0.34, H * 0.2, 0.14, l * W * 0.3, cy + H * 0.3, D / 2 + 0.2, C.s, -0.2, l * -0.24, 0, 'm', 0.06);
    K.bulloni([[l * W * 0.42, cy + H * 0.36, D / 2 + 0.22, Math.PI / 2], [l * W * 0.1, cy + H * 0.36, D / 2 + 0.2, Math.PI / 2]], C.k);
  }
  // chiglia centrale con striscia luminosa
  K.trave([0, cy - H * 0.42, D * 0.42], [0, cy + H * 0.05, D / 2 + 0.16], 0.34, 0.3, C.d);
  K.luce(0.08, H * 0.3, 0, cy - H * 0.2, D / 2 + 0.12, C.a);
  // sfiati, pericolo e luci laterali
  for (const l of [-1, 1]) {
    K.griglia(D * 0.45, H * 0.32, 5, l * (W * 0.57 + 0.02), cy + H * 0.18, -D * 0.05, C, l * Math.PI / 2);
    K.box(0.06, 0.12, D * 0.5, l * (W * 0.57), cy + H * 0.44, 0, C.y, 0, 0, 0, 'm', 0);
    K.luce(0.4, 0.07, l * (W * 0.58), cy + H * 0.02, D * 0.2, C.a, l * Math.PI / 2);
    K.cil(0.48, 0.48, 0.4, l * (W * 0.56 + 0.1), T.cima - 0.7, 0, C.j, 0, 0, Math.PI / 2, 16);
    K.cil(0.3, 0.3, 0.5, l * (W * 0.56 + 0.15), T.cima - 0.7, 0, C.k, 0, 0, Math.PI / 2, 12);
  }
  // tubi idraulici verso le spalle
  for (const l of [-1, 1]) {
    K.cavo([[l * W * 0.42, T.cima - 0.25, -D * 0.25], [l * (W * 0.56 + 0.25), T.cima + 0.05, -D * 0.38], [l * (W * 0.56 + 0.45), T.cima - 0.55, -D * 0.3]], 0.08, C.g);
    K.cavo([[l * W * 0.4, T.cima - 0.45, -D * 0.1], [l * (W * 0.56 + 0.2), T.cima - 0.2, -D * 0.2], [l * (W * 0.56 + 0.35), T.cima - 0.85, -D * 0.15]], 0.05, C.y);
  }
  // cockpit
  if (t === 0) {
    K.box(W * 0.56, 0.3, 0.12, 0, cy + H * 0.06, D / 2 + 0.24, '#000', -0.16, 0, 0, 'v', 0.05);
  } else if (t === 1) {
    K.box(0.9, 0.6, 0.14, 0, cy + H * 0.04, D / 2 + 0.26, C.s, -0.14, 0, 0);
    K.box(0.7, 0.4, 0.1, 0, cy + H * 0.04, D / 2 + 0.34, '#000', -0.14, 0, 0, 'v', 0.05);
  } else {
    K.box(W * 0.5, 0.7, 0.3, 0, cy + H * 0.04, D / 2 + 0.24, C.s, -0.12, 0, 0);
    for (const l of [-1, 1]) K.box(0.42, 0.1, 0.08, l * 0.36, cy + H * 0.1, D / 2 + 0.41, '#000', -0.12, 0, 0, 'v', 0.03);
    for (const l of [-1, 1]) {
      K.box(0.7, 0.5, D * 0.95, l * W * 0.38, T.cima + 0.05, 0, C.s, 0, 0, l * -0.22, 'm', 0.1);
      K.box(0.5, 0.3, D * 0.8, l * W * 0.42, T.cima + 0.35, -0.05, C.p, 0, 0, l * -0.3, 'm', 0.08);
    }
  }
  // colletto rialzato
  K.cil(0.62, 0.78, 0.26, 0, T.cima - 0.02, 0.2, C.j, 0, 0, 0, 18);
  K.toro(0.64, 0.06, 0, T.cima + 0.1, 0.2, C.k, Math.PI / 2);
  K.box(W * 0.5, 0.45, 0.25, 0, T.cima + 0.05, -0.55, C.p, 0.3, 0, 0, 'm', 0.08);
  // schiena: gobba corazzata, pinne, scarichi, cavi, antenna
  K.box(W * 0.8, H * 0.55, 0.5, 0, cy + H * 0.15, -D / 2 - 0.12, C.s, 0.1, 0, 0, 'm', 0.12);
  for (let i = 0; i < 3; i++) K.trave([0, cy + H * (0.45 - i * 0.28), -D / 2 - 0.3], [0, cy + H * (0.55 - i * 0.28), -D / 2 - 0.85], 0.1, 0.4, C.p);
  for (const l of [-1, 1]) {
    K.cil(0.17, 0.2, 1.2, l * W * 0.36, cy + H * 0.2, -D / 2 - 0.25, C.d, 0, 0, 0, 12);
    K.cil(0.22, 0.22, 0.12, l * W * 0.36, cy + H * 0.2 + 0.62, -D / 2 - 0.25, C.j);
    K.cavo([[l * W * 0.2, cy - 0.4, -D / 2], [l * W * 0.36, cy - 0.6, -D / 2 - 0.3], [l * W * 0.36, cy, -D / 2 - 0.3]], 0.06, C.g);
  }
  K.asta([W * 0.45, T.cima - 0.1, -D * 0.35], [W * 0.52, T.cima + 1.4, -D * 0.42], 0.03, C.k);
  K.sfera(0.06, W * 0.52, T.cima + 1.42, -D * 0.42, '#ff3b30', 'e');
}

function costruisciTesta(K, t, C) {
  K.cil(0.26, 0.32, 0.45, 0, 0.18, 0, C.j, 0, 0, 0, 12);
  K.cil(0.12, 0.12, 0.6, 0, 0.2, -0.15, C.k);
  if (t === 0) { // visore: cuneo basso e aggressivo
    K.box(1.2, 0.7, 1.4, 0, 0.6, 0, C.s, 0, 0, 0, 'm', 0.14);
    K.box(1.3, 0.28, 1.25, 0, 0.92, -0.08, C.p, 0.12, 0, 0, 'm', 0.08);
    K.trave([0, 0.85, 0.75], [0, 0.55, 0.95], 0.5, 0.3, C.p);
    K.box(1.1, 0.22, 0.14, 0, 0.62, 0.68, '#000', -0.1, 0, 0, 'v', 0.05);
    K.luce(0.85, 0.05, 0, 0.62, 0.76, C.a);
    for (const l of [-1, 1]) {
      K.cil(0.16, 0.16, 0.3, l * 0.7, 0.6, 0.1, C.j, 0, 0, Math.PI / 2);
      K.cil(0.09, 0.09, 0.06, l * 0.86, 0.6, 0.1, C.a, 0, 0, Math.PI / 2, 10, 'e');
      K.trave([l * 0.55, 0.95, -0.3], [l * 0.8, 1.15, -0.85], 0.1, 0.25, C.s);
    }
    K.asta([0.45, 1.05, -0.35], [0.5, 1.95, -0.5], 0.025, C.k);
    K.sfera(0.05, 0.5, 1.97, -0.5, C.a, 'e');
  } else if (t === 1) { // cresta
    K.box(1.05, 0.9, 1.4, 0, 0.62, 0, C.p, 0, 0, 0, 'm', 0.12);
    K.trave([0, 1.0, 0.6], [0, 1.55, -1.0], 0.16, 0.55, C.s);
    K.trave([0, 0.95, 0.4], [0, 1.25, -0.6], 0.06, 0.3, C.a, 'e');
    K.box(1.18, 0.45, 0.85, 0, 0.45, 0.28, C.s, 0, 0, 0, 'm', 0.08);
    for (const l of [-1, 1]) {
      K.cil(0.15, 0.18, 0.2, l * 0.26, 0.74, 0.72, C.d, Math.PI / 2, 0, 0);
      K.cil(0.1, 0.1, 0.06, l * 0.26, 0.74, 0.84, C.a, Math.PI / 2, 0, 0, 12, 'e');
      K.trave([l * 0.55, 0.3, 0.6], [l * 0.7, 0.95, -0.4], 0.12, 0.5, C.p);
    }
    K.griglia(0.5, 0.2, 3, 0, 0.28, 0.72, C);
  } else { // cupola corazzata
    K.agg(new THREE.SphereGeometry(0.85, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'm', C.s, 0, 0.42, 0);
    K.cil(0.88, 0.95, 0.35, 0, 0.3, 0, C.p, 0, 0, 0, 20);
    K.toro(0.9, 0.05, 0, 0.47, 0, C.k, Math.PI / 2);
    K.box(1.5, 0.3, 0.7, 0, 0.55, 0.45, C.p, -0.2, 0, 0, 'm', 0.08);
    K.agg(new THREE.TorusGeometry(0.3, 0.06, 6, 20), 'e', C.a, 0, 0.66, 0.78, -0.3);
    K.sfera(0.22, 0, 0.66, 0.76, '#000', 'v');
    for (const a of [-0.9, 0.9]) K.cil(0.09, 0.09, 0.14, Math.sin(a) * 0.8, 0.62, Math.cos(a) * 0.8, C.a, Math.PI / 2, a, 0, 10, 'e');
    K.asta([-0.4, 1.1, -0.3], [-0.45, 1.85, -0.45], 0.025, C.k);
    K.asta([0.4, 1.1, -0.3], [0.45, 1.65, -0.45], 0.025, C.k);
  }
}

const SPESS_BRACCIA = [0.6, 0.78, 1.0];
const L_BRACCIO = 1.75, L_AVAMB = 2.15;

function costruisciBraccioSup(K, t, lato, C) {
  const sp = SPESS_BRACCIA[t];
  K.sfera(sp * 0.55, 0, 0, 0, C.j);
  // spallaccio a tre strati, inclinato verso l'alto con pinna
  K.box(sp * 1.75, sp * 0.95, sp * 1.85, lato * sp * 0.18, sp * 0.3, 0, C.p, 0, 0, lato * -0.22, 'm', 0.14);
  K.box(sp * 1.5, sp * 0.4, sp * 1.6, lato * sp * 0.32, sp * 0.82, -0.05, C.s, 0, 0, lato * -0.3, 'm', 0.08);
  K.box(sp * 1.1, sp * 0.3, sp * 1.3, lato * sp * 0.48, sp * 1.12, -0.1, C.p, 0, 0, lato * -0.38, 'm', 0.06);
  K.trave([lato * sp * 0.5, sp * 1.1, sp * 0.3], [lato * sp * 0.95, sp * 1.75, -sp * 0.6], 0.1, sp * 0.5, C.s);
  K.box(sp * 0.25, sp * 1.1, sp * 1.7, lato * sp * 0.98, sp * 0.0, 0, C.s, 0, 0, lato * 0.15, 'm', 0.06);
  if (t === 2) K.box(sp * 0.3, sp * 1.0, sp * 1.6, lato * sp * 1.2, -sp * 0.3, 0, C.p, 0, 0, lato * 0.25, 'm', 0.06);
  K.luce(sp * 0.7, 0.06, lato * sp * 0.25, sp * 0.32, sp * 0.94, C.a);
  K.bulloni([[lato * sp * 0.8, sp * 0.6, sp * 0.62, 0, 0, Math.PI / 2], [lato * sp * 0.8, sp * 0.6, -sp * 0.62, 0, 0, Math.PI / 2], [lato * sp * 0.3, sp * 0.82, sp * 0.82, Math.PI / 2]], C.k);
  // braccio superiore lungo: nucleo, due corazze, pistone, cavi
  K.cil(sp * 0.3, sp * 0.34, L_BRACCIO - 0.2, 0, -L_BRACCIO / 2, 0, C.j, 0, 0, 0, 12);
  K.box(sp * 0.42, L_BRACCIO * 0.7, sp * 0.95, lato * sp * 0.38, -L_BRACCIO * 0.5, 0, C.s, 0, 0, 0, 'm', 0.06);
  K.box(sp * 0.3, L_BRACCIO * 0.4, sp * 0.8, lato * sp * 0.55, -L_BRACCIO * 0.42, 0, C.p, 0, 0, 0, 'm', 0.05);
  K.pistone([0, -0.25, sp * 0.45], [0, -L_BRACCIO + 0.15, sp * 0.4], sp * 0.12, C);
  K.cavo([[-lato * sp * 0.2, -0.2, -sp * 0.3], [-lato * sp * 0.35, -L_BRACCIO / 2, -sp * 0.45], [-lato * sp * 0.2, -L_BRACCIO + 0.05, -sp * 0.3]], 0.05, C.g);
  // gomito
  K.cil(sp * 0.42, sp * 0.42, sp * 1.05, 0, -L_BRACCIO, 0, C.j, 0, 0, Math.PI / 2, 16);
  K.cil(sp * 0.22, sp * 0.22, sp * 1.15, 0, -L_BRACCIO, 0, C.k, 0, 0, Math.PI / 2, 10);
  K.box(sp * 0.6, sp * 0.5, sp * 0.3, 0, -L_BRACCIO, -sp * 0.48, C.p, 0.3, 0, 0, 'm', 0.06);
}

function costruisciAvambraccio(K, t, lato, C) {
  const sp = SPESS_BRACCIA[t], L = L_AVAMB;
  K.box(sp * 0.95, sp * 0.95, L * 0.6, 0, 0, L * 0.3, C.d, 0, 0, 0, 'm', 0.08);
  K.box(sp * 1.15, sp * 0.72, L * 0.72, 0, sp * 0.18, L * 0.46, C.p, 0, 0, 0, 'm', 0.12);
  K.box(sp * 0.95, 0.14, L * 0.5, 0, sp * 0.58, L * 0.38, C.s, -0.04, 0, 0, 'm', 0.04);
  K.box(sp * 0.75, 0.12, L * 0.35, 0, sp * 0.7, L * 0.42, C.p, -0.06, 0, 0, 'm', 0.04);
  K.box(0.12, sp * 0.6, L * 0.6, lato * sp * 0.62, 0, L * 0.45, C.s, 0, lato * 0.06, 0, 'm', 0.03);
  K.trave([lato * sp * 0.66, sp * 0.1, L * 0.2], [lato * sp * 0.8, sp * 0.35, L * 0.7], 0.08, 0.2, C.p);
  K.pistone([0, -sp * 0.45, 0.15], [0, -sp * 0.35, L * 0.75], sp * 0.1, C);
  K.bulloni([[-sp * 0.4, sp * 0.56, L * 0.2], [sp * 0.4, sp * 0.56, L * 0.2], [-sp * 0.4, sp * 0.56, L * 0.7], [sp * 0.4, sp * 0.56, L * 0.7]], C.k);
  K.luce(0.05, sp * 0.3, lato * sp * 0.69, 0, L * 0.6, C.a, Math.PI / 2);
  K.cil(sp * 0.5, sp * 0.5, 0.24, 0, 0, L - 0.15, C.j, Math.PI / 2, 0, 0, 16);
  K.toro(sp * 0.5, 0.05, 0, 0, L - 0.03, C.k);
}

function costruisciBacino(K, hw, C) {
  K.box(hw * 1.4, 0.65, 1.2, 0, 0, 0, C.d, 0, 0, 0, 'm', 0.1);
  K.box(hw * 0.8, 0.8, 0.3, 0, -0.12, 0.6, C.p, 0.18, 0, 0, 'm', 0.08);
  K.box(hw * 0.5, 0.45, 0.2, 0, -0.1, 0.78, C.s, 0.2, 0, 0, 'm', 0.05);
  K.box(hw * 0.7, 0.5, 0.25, 0, -0.05, -0.6, C.s, -0.12, 0, 0, 'm', 0.06);
  for (const l of [-1, 1]) {
    K.cil(0.42, 0.42, 0.4, l * hw * 0.62, 0, 0, C.j, 0, 0, Math.PI / 2, 16);
    K.box(0.2, 0.9, 1.0, l * hw * 0.86, -0.1, 0, C.p, 0, 0, l * 0.16, 'm', 0.06);
    K.box(0.14, 0.55, 0.8, l * hw * 0.98, -0.2, 0, C.s, 0, 0, l * 0.24, 'm', 0.04);
  }
  K.luce(hw * 0.3, 0.06, 0, 0.05, 0.77, C.a);
  for (const l of [-1, 1]) {
    K.cavo([[l * hw * 0.25, 0.25, -0.5], [l * hw * 0.55, 0.45, -0.75], [l * hw * 0.7, -0.35, -0.45]], 0.07, C.g);
    K.bulloni([[l * hw * 0.62 + l * 0.21, 0.25, 0.2, 0, 0, Math.PI / 2], [l * hw * 0.62 + l * 0.21, -0.25, 0.2, 0, 0, Math.PI / 2], [l * hw * 0.62 + l * 0.21, 0, -0.3, 0, 0, Math.PI / 2]], C.k);
  }
}

// gamba lunga: anca (coscia) e ginocchio (stinco + piede). tipo 0 digitigrada, 1 bipede, 2 tozza
const FINE_COSCIA = [[0, -1.85, 0.65], [0, -1.95, 0], [0, -1.95, 0]];
const CAVIGLIA = [[0, -1.9, -0.22], [0, -1.82, 0], [0, -1.82, 0]];

function costruisciCoscia(K, t, C) {
  K.sfera(0.42, 0, 0, 0, C.j);
  const fine = FINE_COSCIA[t];
  const w = t === 2 ? 1.2 : t === 0 ? 0.72 : 0.9;
  K.trave([0, -0.1, 0], fine, w * 0.7, w * 0.8, C.j);
  K.trave([0, -0.15, 0.1], [fine[0], fine[1] + 0.3, fine[2] + 0.12], w, w * 0.62, C.p);
  K.trave([0, -0.3, 0.22], [fine[0], fine[1] + 0.6, fine[2] + 0.22], w * 0.7, 0.16, C.s);
  K.trave([w * 0.52, -0.25, 0], [w * 0.52, fine[1] + 0.4, fine[2] * 0.8], 0.14, w * 0.85, C.s);
  K.trave([-w * 0.5, -0.4, 0], [-w * 0.5, fine[1] + 0.6, fine[2] * 0.7], 0.1, w * 0.6, C.p);
  K.pistone([0, -0.25, -w * 0.45], [fine[0], fine[1] + 0.15, fine[2] - w * 0.4], 0.1, C);
  K.luce(0.06, 0.5, w * 0.6, -0.8, 0.1, C.a, Math.PI / 2);
  K.cil(0.38, 0.38, w * 1.05, ...fine, C.j, 0, 0, Math.PI / 2, 16);
  K.cil(0.2, 0.2, w * 1.15, ...fine, C.k, 0, 0, Math.PI / 2, 10);
  // ginocchiera con spuntone
  K.box(w * 0.9, 0.7, 0.28, fine[0], fine[1] + 0.05, fine[2] + 0.4, C.p, t === 0 ? -0.4 : 0.25, 0, 0, 'm', 0.08);
  K.trave([fine[0], fine[1] + 0.2, fine[2] + 0.5], [fine[0], fine[1] + 0.05, fine[2] + 0.95], 0.18, 0.18, C.s);
}

function costruisciStinco(K, t, C) {
  const w = t === 2 ? 1.1 : t === 0 ? 0.62 : 0.8;
  const cav = CAVIGLIA[t];
  const piedeY = cav[1] - 0.08;
  K.trave([0, -0.1, t === 0 ? -0.05 : 0], cav, w * 0.75, w * 0.75, C.j);
  K.trave([0, -0.2, 0.14], [cav[0], cav[1] + 0.45, cav[2] + 0.2], w, w * 0.55, C.s);
  // schiniere a due strati
  K.box(w * 0.75, 1.0, 0.16, 0, -0.75, w * 0.42 + 0.12, C.p, t === 0 ? 0.2 : -0.04, 0, 0, 'm', 0.05);
  K.box(w * 0.55, 0.6, 0.12, 0, -0.55, w * 0.42 + 0.24, C.s, t === 0 ? 0.2 : -0.04, 0, 0, 'm', 0.04);
  K.luce(w * 0.35, 0.06, 0, -0.38, w * 0.42 + 0.31, C.a);
  K.box(w * 0.7, 0.9, 0.3, 0, -0.7, -w * 0.45, C.p, 0.08, 0, 0, 'm', 0.06);
  for (const l of [-1, 1]) K.pistone([l * w * 0.56, -0.2, -0.05], [l * w * 0.56, cav[1] + 0.25, cav[2]], 0.08, C);
  K.cil(0.26, 0.26, w * 1.0, ...cav, C.j, 0, 0, Math.PI / 2, 12);
  // piede artigliato: dita, tallone, sperone, suola
  const pw = t === 2 ? 1.35 : t === 0 ? 0.75 : 0.95, pl = t === 2 ? 1.8 : t === 0 ? 1.45 : 1.55;
  K.box(pw * 0.7, 0.35, pl * 0.5, cav[0], piedeY, cav[2] + 0.05, C.d, 0, 0, 0, 'm', 0.08);
  for (let i = -1; i <= 1; i++) {
    if (t === 0 && i === 0) continue;
    K.box(pw * 0.3, 0.26, pl * 0.45, i * pw * 0.32, piedeY - 0.04, cav[2] + pl * 0.42, C.p, 0.08, i * 0.14, 0, 'm', 0.07);
    K.trave([i * pw * 0.36, piedeY - 0.05, cav[2] + pl * 0.62], [i * pw * 0.42, piedeY - 0.15, cav[2] + pl * 0.82], 0.12, 0.1, C.k);
  }
  K.box(pw * 0.5, 0.25, pl * 0.3, 0, piedeY - 0.05, cav[2] - pl * 0.32, C.s, -0.1, 0, 0, 'm', 0.06);
  K.trave([0, piedeY, cav[2] - pl * 0.4], [0, piedeY - 0.15, cav[2] - pl * 0.65], 0.14, 0.12, C.k);
  K.box(pw * 0.95, 0.08, pl * 0.95, 0, piedeY - 0.2, cav[2] + 0.1, C.g, 0, 0, 0, 'm', 0.03);
}

function costruisciCingoli(K, hw, C) {
  for (const l of [-1, 1]) {
    const x = l * (hw + 0.25);
    K.box(0.8, 1.3, 3.8, x, 1.1, 0, C.d, 0, 0, 0, 'm', 0.1);
    for (let i = 0; i < 4; i++) {
      const z = -1.3 + i * 0.87;
      K.cil(0.42, 0.42, 0.95, x, 0.55, z, C.j, 0, 0, Math.PI / 2, 14);
      K.cil(0.18, 0.18, 1.0, x, 0.55, z, C.k, 0, 0, Math.PI / 2, 8);
    }
    // ruote motrici davanti e dietro, cingolo a maglie lungo un ovale (basso 0.08, alto 2.27)
    const yc = 1.175, R = 1.095;
    K.cil(0.9, 0.9, 0.9, x, yc, 1.75, C.j, 0, 0, Math.PI / 2, 18);
    K.cil(0.9, 0.9, 0.9, x, yc, -1.75, C.j, 0, 0, Math.PI / 2, 18);
    K.cil(0.3, 0.3, 0.95, x, yc, 1.75, C.k, 0, 0, Math.PI / 2, 10);
    K.cil(0.3, 0.3, 0.95, x, yc, -1.75, C.k, 0, 0, Math.PI / 2, 10);
    const punti = [];
    for (let i = 0; i <= 18; i++) punti.push([-1.75 + (3.5 * i) / 18, yc - R]);
    for (let i = 1; i < 10; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 10; punti.push([1.75 + Math.cos(a) * R, yc + Math.sin(a) * R]); }
    for (let i = 0; i <= 18; i++) punti.push([1.75 - (3.5 * i) / 18, yc + R]);
    for (let i = 1; i < 10; i++) { const a = Math.PI / 2 + (Math.PI * i) / 10; punti.push([-1.75 + Math.cos(a) * R, yc + Math.sin(a) * R]); }
    for (const [z, y] of punti) K.box(1.0, 0.16, 0.18, x, y, z, C.g, 0, 0, 0, 'm', 0.02);
    // gonna corazzata
    K.box(0.14, 0.8, 3.9, x + l * 0.55, 1.75, 0, C.p, 0, 0, l * 0.08, 'm', 0.05);
    K.bulloni([0, 1, 2, 3, 4].map((i) => [x + l * 0.63, 2.0, -1.6 + i * 0.8, 0, 0, Math.PI / 2]), C.k);
    K.box(0.08, 0.12, 3.0, x + l * 0.63, 1.5, 0, C.y, 0, 0, 0, 'm', 0);
  }
  K.box(hw * 2.1, 0.9, 2.2, 0, 2.55, 0, C.d, 0, 0, 0, 'm', 0.12);
  K.cil(hw * 0.55, hw * 0.7, 1.4, 0, 3.6, 0, C.j, 0, 0, 0, 20);
  for (const l of [-1, 1]) K.pistone([l * hw * 0.8, 2.9, 0.6], [l * hw * 0.45, 4.2, 0.3], 0.1, C);
  K.cil(hw * 0.75, hw * 0.8, 0.3, 0, 4.25, 0, C.j, 0, 0, 0, 20);
}

function costruisciPropulsori(K, hw, C) {
  for (const l of [-1, 1]) {
    const x = l * (hw * 0.62 + 0.5);
    K.box(0.32, 1.0, 0.4, x, 2.6, -0.45, C.s, 0, 0, 0, 'm', 0.06);
    K.cil(0.13, 0.18, 0.3, x, 2.0, -0.45, C.d, 0, 0, 0, 10);
    K.cil(0.1, 0.1, 0.05, x, 1.84, -0.45, C.a, 0, 0, 0, 10, 'e');
  }
}

// ------------------------------------------------------------------
// Armi e moduli (aggancio all'origine, canna verso +Z)
// ------------------------------------------------------------------
function costruisciArma(K, c, C) {
  switch (c) {
    case 'pugni': {
      K.box(1.0, 0.9, 0.8, 0, 0, 0.3, C.d, 0, 0, 0, 'm', 0.12);
      K.box(1.05, 0.5, 0.75, 0, 0.32, 0.35, C.p, 0, 0, 0, 'm', 0.1);
      for (let i = 0; i < 4; i++) {
        const x = -0.36 + i * 0.24;
        K.box(0.2, 0.22, 0.42, x, 0.1, 0.85, C.j, 0, 0, 0, 'm', 0.06);
        K.box(0.19, 0.2, 0.36, x, 0.02, 1.18, C.s, 0.5, 0, 0, 'm', 0.06);
        K.cil(0.06, 0.06, 0.22, x, 0.1, 1.05, C.k, 0, 0, Math.PI / 2, 8);
      }
      K.box(0.22, 0.24, 0.5, -0.55, -0.1, 0.6, C.s, 0, 0.5, 0, 'm', 0.06);
      K.bulloni([[-0.3, 0.58, 0.2], [0.3, 0.58, 0.2]], C.k);
      for (let i = 0; i < 4; i++) K.agg(new THREE.ConeGeometry(0.07, 0.22, 6), 'm', C.k, -0.36 + i * 0.24, 0.25, 0.95, Math.PI / 2);
      K.box(0.18, 0.2, 0.32, -0.6, -0.1, 0.95, C.j, 0, 0.7, 0, 'm', 0.05);
      break;
    }
    case 'mitra':
      K.box(0.85, 0.8, 1.5, 0, 0, 0.4, C.s, 0, 0, 0, 'm', 0.1);
      K.box(0.9, 0.3, 1.2, 0, 0.42, 0.35, C.p, 0, 0, 0, 'm', 0.08);
      K.cil(0.42, 0.42, 0.55, 0, -0.55, 0.25, C.p, 0, 0, Math.PI / 2, 16);
      K.cil(0.44, 0.44, 0.08, 0.3, -0.55, 0.25, C.k, 0, 0, Math.PI / 2, 16);
      K.cavo([[0.1, -0.35, 0.45], [0.25, -0.15, 0.75], [0.1, -0.05, 1.0]], 0.07, C.y);
      K.cil(0.38, 0.38, 0.3, 0, 0, 1.25, C.d, Math.PI / 2, 0, 0, 16);
      K.luce(0.3, 0.05, 0, 0.58, 0.5, C.r);
      K.box(0.25, 0.22, 0.4, 0.2, 0.68, 0.9, C.d, 0, 0, 0, 'm', 0.04);
      K.cil(0.07, 0.07, 0.04, 0.2, 0.68, 1.11, '#000', Math.PI / 2, 0, 0, 10, 'v');
      K.box(0.12, 0.6, 0.5, -0.5, -0.1, 0.4, C.p, 0, 0, 0, 'm', 0.04);
      break;
    case 'dispersione':
      K.box(1.0, 0.9, 1.4, 0, 0, 0.3, C.s, 0, 0, 0, 'm', 0.1);
      for (const l of [-1, 1]) {
        K.cil(0.26, 0.26, 1.6, l * 0.24, 0.08, 1.6, C.d, Math.PI / 2, 0, 0, 14);
        K.cil(0.3, 0.3, 0.12, l * 0.24, 0.08, 2.36, C.j, Math.PI / 2, 0, 0, 14);
        K.cil(0.14, 0.14, 0.05, l * 0.24, 0.08, 2.43, '#050505', Math.PI / 2, 0, 0, 10);
      }
      K.box(0.7, 0.3, 0.8, 0, -0.38, 1.3, C.k, 0, 0, 0, 'm', 0.06);
      for (let i = 0; i < 4; i++) K.cil(0.07, 0.07, 0.3, -0.45, 0.2 - i * 0.16, 0.3, '#b3301e', 0, 0, Math.PI / 2, 8);
      K.luce(0.3, 0.05, 0, 0.47, 0.2, C.r);
      break;
    case 'cannone':
      K.box(1.0, 1.0, 1.6, 0, 0, 0.2, C.s, 0, 0, 0, 'm', 0.12);
      K.box(1.05, 0.35, 1.0, 0, 0.55, 0.0, C.p, 0, 0, 0, 'm', 0.08);
      K.cil(0.3, 0.34, 3.2, 0, 0.1, 2.5, C.d, Math.PI / 2, 0, 0, 16);
      for (let i = 0; i < 3; i++) K.cil(0.38, 0.38, 0.14, 0, 0.1, 1.4 + i * 0.7, C.j, Math.PI / 2, 0, 0, 16);
      K.box(0.75, 0.6, 0.6, 0, 0.1, 4.1, C.j, 0, 0, 0, 'm', 0.06);
      for (const l of [-1, 1]) K.box(0.08, 0.35, 0.4, l * 0.39, 0.1, 4.1, '#050505', 0, 0, 0, 'm', 0);
      for (const l of [-1, 1]) K.pistone([l * 0.35, 0.6, 0.6], [l * 0.35, 0.5, 1.8], 0.08, C);
      K.cil(0.13, 0.13, 0.8, 0.45, 0.85, 0.7, C.d, Math.PI / 2, 0, 0, 12);
      K.cil(0.1, 0.1, 0.04, 0.45, 0.85, 1.11, '#000', Math.PI / 2, 0, 0, 12, 'v');
      K.box(0.12, 0.22, 0.3, 0.45, 0.66, 0.7, C.j, 0, 0, 0, 'm', 0.03);
      K.box(0.5, 0.7, 0.6, -0.65, -0.1, 0.1, C.p, 0, 0, 0, 'm', 0.06);
      K.cavo([[-0.6, 0.2, 0.3], [-0.4, 0.5, 0.8], [-0.1, 0.3, 1.2]], 0.05, C.g);
      K.luce(0.4, 0.05, 0, 0.74, 0.2, C.r);
      break;
    case 'laser':
      K.box(0.75, 0.85, 1.7, 0, 0, 0.4, C.s, 0, 0, 0, 'm', 0.1);
      K.griglia(1.2, 0.35, 4, 0.4, 0.05, 0.4, C, Math.PI / 2);
      K.cil(0.15, 0.15, 2.4, 0, 0, 2.3, C.d, Math.PI / 2, 0, 0, 12);
      for (let i = 0; i < 4; i++) K.agg(new THREE.TorusGeometry(0.28, 0.06, 6, 18), 'e', C.r, 0, 0, 1.5 + i * 0.45);
      K.agg(new THREE.OctahedronGeometry(0.22, 0), 'e', C.r, 0, 0, 3.55, 0, 0, 0, 1, 1, 1.6);
      K.cil(0.24, 0.24, 0.2, 0, 0, 3.35, C.j, Math.PI / 2, 0, 0, 12);
      break;
    case 'fiamma':
      for (const l of [-1, 1]) {
        K.cil(0.3, 0.3, 1.3, l * 0.33, 0.15, 0.2, C.p, 0, 0, 0, 14);
        K.sfera(0.3, l * 0.33, 0.8, 0.2, C.p);
        K.box(0.62, 0.12, 0.62, l * 0.33, 0.3, 0.2, C.y, 0, 0, 0, 'm', 0.02);
      }
      K.box(0.5, 0.5, 1.0, 0, -0.2, 0.9, C.s, 0, 0, 0, 'm', 0.08);
      K.cavo([[0.33, -0.4, 0.2], [0.2, -0.55, 0.7], [0, -0.3, 1.1]], 0.07, C.g);
      K.agg(new THREE.ConeGeometry(0.32, 1.1, 12), 'm', C.d, 0, -0.1, 1.8, -Math.PI / 2);
      K.cil(0.34, 0.34, 0.1, 0, -0.1, 2.35, C.j, Math.PI / 2, 0, 0, 12);
      K.sfera(0.08, 0, -0.32, 2.35, '#7fd0ff', 'e');
      K.luce(0.25, 0.05, 0, 0.12, 1.41, C.r);
      break;
    case 'lama':
      K.box(0.7, 0.7, 0.9, 0, 0, 0.2, C.s, 0, 0, 0, 'm', 0.1);
      K.box(0.5, 0.8, 0.3, 0, 0, 0.75, C.j, 0, 0, 0, 'm', 0.06);
      K.box(0.12, 0.62, 3.6, 0, 0, 2.6, C.r, 0, 0, 0, 'e', 0.04);
      K.box(0.05, 0.75, 3.4, 0, 0, 2.6, '#ffffff', 0, 0, 0, 'e', 0);
      for (const l of [-1, 1]) K.box(0.1, 0.25, 0.5, l * 0.3, 0, 0.9, C.k, 0, 0, 0, 'm', 0.03);
      break;
    case 'railgun':
      K.box(0.85, 0.95, 1.7, 0, 0, 0.3, C.s, 0, 0, 0, 'm', 0.12);
      for (const l of [-1, 1]) {
        K.box(0.16, 0.36, 4.0, l * 0.28, 0, 2.7, C.d, 0, 0, 0, 'm', 0.04);
        K.box(0.06, 0.2, 3.8, l * 0.2, 0, 2.7, C.k, 0, 0, 0, 'm', 0);
      }
      K.box(0.06, 0.06, 3.8, 0, 0, 2.7, C.r, 0, 0, 0, 'e', 0);
      for (let i = 0; i < 5; i++) K.box(0.8, 0.12, 0.12, 0, 0.22, 1.2 + i * 0.75, C.j, 0, 0, 0, 'm', 0.02);
      for (const l of [-1, 1]) { K.cil(0.22, 0.22, 0.9, l * 0.55, 0.1, 0.3, C.p, Math.PI / 2, 0, 0, 12); K.luce(0.05, 0.3, l * 0.78, 0.1, 0.3, C.r, Math.PI / 2); K.cavo([[l * 0.55, 0.1, 0.75], [l * 0.45, 0.35, 1.2], [l * 0.3, 0.2, 1.6]], 0.05, C.g); }
      K.cil(0.14, 0.14, 1.0, 0, 0.72, 0.6, C.d, Math.PI / 2, 0, 0, 12);
      K.cil(0.11, 0.11, 0.04, 0, 0.72, 1.11, '#000', Math.PI / 2, 0, 0, 12, 'v');
      K.box(0.1, 0.25, 0.3, 0, 0.55, 0.6, C.j, 0, 0, 0, 'm', 0.03);
      break;
    case 'missili':
      K.box(1.45, 1.2, 1.6, 0, 0, 0, C.s, 0, 0, 0, 'm', 0.12);
      K.box(1.5, 0.25, 1.3, 0, 0.66, -0.1, C.p, 0, 0, 0, 'm', 0.06);
      for (let i = 0; i < 6; i++) {
        const x = (i % 3 - 1) * 0.42, y = (Math.floor(i / 3) - 0.5) * 0.45;
        K.cil(0.16, 0.16, 0.12, x, y, 0.8, C.d, Math.PI / 2, 0, 0, 12);
        K.cil(0.1, 0.1, 0.13, x, y, 0.8, '#050505', Math.PI / 2, 0, 0, 10);
      }
      for (const l of [-1, 1]) K.box(0.1, 1.0, 1.4, l * 0.76, 0, 0, C.p, 0, 0, 0, 'm', 0.04);
      K.luce(0.08, 0.08, 0.6, 0.45, 0.82, C.r);
      break;
    case 'mortaio':
      K.box(1.1, 0.45, 1.1, 0, -0.25, 0, C.d, 0, 0, 0, 'm', 0.08);
      K.cil(0.45, 0.5, 0.35, 0, 0.05, 0, C.j, 0, 0, 0, 16);
      K.cil(0.4, 0.42, 2.0, 0, 0.65, 0.35, C.s, Math.PI / 4, 0, 0, 16);
      for (let i = 0; i < 3; i++) K.cil(0.46, 0.46, 0.1, 0, 0.3 + i * 0.4, 0.0 + i * 0.4, C.j, Math.PI / 4, 0, 0, 16);
      K.pistone([0.45, -0.1, -0.3], [0.45, 0.6, 0.45], 0.07, C);
      K.luce(0.3, 0.05, 0, -0.02, 0.56, C.r);
      break;
    case 'torretta':
      K.cil(0.8, 0.9, 0.45, 0, 0, 0, C.j, 0, 0, 0, 18);
      K.box(1.1, 0.55, 0.9, 0, 0.45, 0, C.s, 0, 0, 0, 'm', 0.1);
      for (const l of [-1, 1]) K.cil(0.09, 0.09, 1.9, l * 0.18, 0.5, 1.2, C.d, Math.PI / 2, 0, 0, 8);
      K.box(1.3, 0.7, 0.1, 0, 0.55, 0.5, C.p, -0.2, 0, 0, 'm', 0.04);
      break;
  }
}

function costruisciCanne(K, C) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.cil(0.08, 0.08, 1.9, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.95, C.d, Math.PI / 2, 0, 0, 8);
  }
  K.cil(0.07, 0.07, 1.95, 0, 0, 0.95, C.k, Math.PI / 2, 0, 0, 8);
  for (const z of [0.6, 1.4, 1.85]) K.toro(0.3, 0.05, 0, 0, z, C.j);
}

function costruisciSchiena(K, c, C) {
  if (c === 'jetpack') {
    K.box(1.6, 1.6, 0.6, 0, 0, 0, C.s, 0, 0, 0, 'm', 0.1);
    for (const l of [-1, 1]) {
      K.cil(0.42, 0.42, 1.9, l * 0.62, 0, -0.35, C.p, 0, 0, 0, 16);
      for (let i = 0; i < 3; i++) K.cil(0.45, 0.45, 0.06, l * 0.62, 0.5 - i * 0.45, -0.35, C.j, 0, 0, 0, 16);
      K.cil(0.3, 0.42, 0.45, l * 0.62, -1.15, -0.35, C.d, 0, 0, 0, 14);
      K.cil(0.24, 0.24, 0.04, l * 0.62, -1.38, -0.35, C.a, 0, 0, 0, 12, 'e');
      K.sfera(0.38, l * 0.62, 0.95, -0.35, C.p);
    }
    K.box(0.5, 0.8, 0.3, 0, 0.1, -0.45, C.y, 0, 0, 0, 'm', 0.04);
  } else if (c === 'scudo') {
    K.box(1.5, 1.5, 0.65, 0, 0, 0, C.s, 0, 0, 0, 'm', 0.12);
    K.cil(0.55, 0.6, 0.3, 0, 0, -0.45, C.j, Math.PI / 2, 0, 0, 18);
    K.agg(new THREE.TorusGeometry(0.62, 0.07, 6, 24), 'e', C.r, 0, 0, -0.62);
    K.agg(new THREE.TorusGeometry(0.36, 0.05, 6, 20), 'e', C.r, 0, 0, -0.64);
    K.sfera(0.18, 0, 0, -0.66, C.r, 'e');
    K.griglia(1.0, 0.3, 3, 0, 0.6, -0.34, C, Math.PI);
  } else {
    K.box(1.3, 1.3, 0.6, 0, 0, 0, C.d, 0, 0, 0, 'm', 0.1);
    K.griglia(0.9, 0.7, 5, 0, 0.1, -0.32, C, Math.PI);
    K.cavo([[-0.5, -0.5, -0.2], [-0.7, -0.8, -0.1], [-0.6, -1.0, 0.2]], 0.06, C.g);
  }
}

function costruisciModTesta(K, c, C) {
  if (c === 'radar') {
    K.asta([0.45, 1.0, -0.25], [0.45, 1.6, -0.25], 0.05, C.k);
    K.cil(0.14, 0.14, 0.12, 0.45, 1.6, -0.25, C.j);
  } else if (c === 'ottica') {
    K.cil(0.22, 0.22, 1.0, 0.82, 0.62, 0.2, C.d, Math.PI / 2, 0, 0, 14);
    K.toro(0.24, 0.04, 0.82, 0.62, 0.55, C.k);
    K.toro(0.24, 0.04, 0.82, 0.62, -0.1, C.k);
    K.cil(0.17, 0.17, 0.04, 0.82, 0.62, 0.71, '#000', Math.PI / 2, 0, 0, 14, 'v');
    K.box(0.3, 0.12, 0.35, 0.65, 0.62, 0.2, C.j, 0, 0, 0, 'm', 0.03);
  }
}

function costruisciDisco(K, C) {
  K.cil(0.72, 0.14, 0.22, 0, 0.14, 0, C.p, 0, 0, 0, 22);
  K.toro(0.72, 0.035, 0, 0.25, 0, C.k, Math.PI / 2);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; K.asta([0, 0.02, 0], [Math.cos(a) * 0.68, 0.28, Math.sin(a) * 0.68], 0.02, C.k); }
  K.asta([0, 0, 0], [0, 0.45, 0], 0.03, C.k);
  K.sfera(0.06, 0, 0.47, 0, C.a, 'e');
}

// ------------------------------------------------------------------
// Modello completo
// ------------------------------------------------------------------
export function creaArma(c, r, fin, bruciato = false) {
  const C = colori(fin, r);
  const mat = bruciato ? MAT_BRUCIATO : MAT;
  const g = mesh(pezzo(`arma-${c}-${r}-${C.id}`, (K) => costruisciArma(K, c, C)), mat);
  if (c === 'mitra') {
    const canne = mesh(pezzo(`canne-${C.id}`, (K) => costruisciCanne(K, C)), mat);
    canne.position.set(0, 0, 1.25);
    g.add(canne);
    g.userData.canne = canne;
  }
  return g;
}

// ------------------------------------------------------------------
// Livree (motivi sulle piastre), decalcomanie (matricola, emblema)
// ------------------------------------------------------------------
const matLivree = new Map();
function matLivrea(l) {
  if (!l) return MAT.m;
  if (matLivree.has(l)) return matLivree.get(l);
  const base = TEX.map.image, N = base.width;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.globalCompositeOperation = 'multiply';
  let seme = 11 + l * 7;
  const rnd = () => ((seme = (seme * 16807) % 2147483647) / 2147483647);
  if (l === 1) { // strisce diagonali da corsa
    g.fillStyle = '#5a5a5a';
    g.beginPath(); g.moveTo(N * 0.2, 0); g.lineTo(N * 0.42, 0); g.lineTo(N * 0.02, N); g.lineTo(-N * 0.2, N); g.fill();
    g.fillStyle = '#787878';
    g.beginPath(); g.moveTo(N * 0.5, 0); g.lineTo(N * 0.58, 0); g.lineTo(N * 0.18, N); g.lineTo(N * 0.1, N); g.fill();
  } else if (l === 2) { // mimetica a macchie
    for (const [tono, n] of [['#8a8a8a', 26], ['#5e5e5e', 22], ['#bdbdbd', 14]]) {
      g.fillStyle = tono;
      for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 20 + rnd() * 50, 12 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); }
    }
  } else if (l === 3) { // tigrata
    g.fillStyle = '#4a4a4a';
    for (let i = 0; i < 9; i++) {
      const y = (i / 9) * N + rnd() * 20;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= N; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 18 + (x / N) * 30);
      g.lineTo(N, y + 30); for (let x = N; x >= 0; x -= 32) g.lineTo(x, y + 14 + Math.sin(x / 40 + i) * 10 + (x / N) * 22);
      g.fill();
    }
  } else if (l === 4) { // scacchi
    g.fillStyle = '#6a6a6a';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect((x * N) / 4, (y * N) / 4, N / 4, N / 4);
  } else if (l === 5) { // usurata: ruggine e bruciature
    for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.6 ? '#9a6a48' : '#4a3a30'; g.beginPath(); g.arc(rnd() * N, rnd() * N, 4 + rnd() * 26, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = MAT.m.clone();
  m.map = t;
  matLivree.set(l, m);
  return m;
}

const cacheDecal = new Map();
function matDecal(tipo, valore, colore) {
  const chiave = tipo + valore + colore;
  if (cacheDecal.has(chiave)) return cacheDecal.get(chiave);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(10,10,12,0.85)'; g.lineWidth = 8;
  g.fillStyle = colore;
  if (tipo === 'n') {
    g.font = '700 84px "Chakra Petch", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText(valore, 64, 68); g.fillText(valore, 64, 68);
  } else {
    const forme = {
      1: () => { g.beginPath(); g.moveTo(74, 8); g.lineTo(30, 70); g.lineTo(60, 70); g.lineTo(48, 120); g.lineTo(98, 52); g.lineTo(66, 52); g.closePath(); },
      2: () => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 24 : 56; g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); } g.closePath(); },
      3: () => { g.beginPath(); g.arc(64, 54, 40, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(90, 96); g.lineTo(80, 116); g.lineTo(48, 116); g.lineTo(38, 96); g.closePath(); },
      4: () => { g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8, r = i % 2 ? 46 : 58; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); },
      5: () => { g.beginPath(); g.moveTo(14, 100); g.lineTo(20, 34); g.lineTo(42, 66); g.lineTo(64, 22); g.lineTo(86, 66); g.lineTo(108, 34); g.lineTo(114, 100); g.closePath(); },
      6: () => { g.beginPath(); for (const x of [30, 58, 86]) { g.moveTo(x, 118); g.quadraticCurveTo(x + 30, 70, x + 12, 10); g.quadraticCurveTo(x + 14, 70, x + 16, 118); } },
    };
    (forme[valore] || forme[2])();
    g.stroke(); g.fill();
    if (+valore === 3) { g.fillStyle = '#111'; g.beginPath(); g.arc(48, 58, 10, 0, 7); g.arc(80, 58, 10, 0, 7); g.fill(); }
    if (+valore === 4) { g.fillStyle = '#111'; g.beginPath(); g.arc(64, 64, 16, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6, metalness: 0.2 });
  cacheDecal.set(chiave, m);
  return m;
}
const GEO_DECAL = new THREE.PlaneGeometry(1, 1);
function decal(padre, mat, dim, x, y, z, ry, rx = 0) {
  const d = new THREE.Mesh(GEO_DECAL, mat);
  d.scale.set(dim, dim, 1);
  d.position.set(x, y, z);
  d.rotation.set(rx, ry, 0, 'YXZ');
  padre.add(d);
  return d;
}

// detriti e punti di danno
const _w = new THREE.Vector3();

export class ModelloMech {
  constructor(aspetto, opz = {}) {
    this.aspetto = aspetto;
    this.bruciato = !!opz.bruciato;
    const luci = aspetto.luci || 0;
    const mat = (this.mat = this.bruciato ? MAT_BRUCIATO : { m: matLivrea(aspetto.livrea || 0), e: MAT.e, v: MAT.v });
    const C = (this.C = colori(aspetto.finitura, 0, luci));
    const F = C.id;
    const torso = PARTI.torso[aspetto.torso] || PARTI.torso[0];
    const hw = (this.hw = torso.raggio * 0.62);
    const tT = aspetto.torso, tG = aspetto.gambe, tB = aspetto.braccia, tH = aspetto.testa;
    const T = DIM_TORSO[tT];
    this.gruppo = new THREE.Group();
    this.fase = 0;
    this.slotStr = null;
    this.inclX = 0; this.inclZ = 0; this.kick = 0; this.yawPrec = null; this.velPrec = 0;
    this.danni = { bs: 1, bd: 1, g: 1, t: 1 };

    // gambe
    this.bacino = new THREE.Group();
    this.bacino.position.y = ALT_BACINO;
    this.gruppo.add(this.bacino);
    this.bacino.add(mesh(pezzo(`bacino-${tT}-${F}`, (K) => costruisciBacino(K, hw, C)), mat));
    this.gambe = [];
    for (const lato of [-1, 1]) {
      const anca = new THREE.Group(); anca.position.set(lato * hw * 0.62, 0, 0); this.bacino.add(anca);
      anca.add(mesh(pezzo(`coscia-${tG}-${F}`, (K) => costruisciCoscia(K, tG, C)), mat));
      const ginocchio = new THREE.Group();
      ginocchio.position.set(...FINE_COSCIA[tG]);
      anca.add(ginocchio);
      ginocchio.add(mesh(pezzo(`stinco-${tG}-${F}`, (K) => costruisciStinco(K, tG, C)), mat));
      this.gambe.push({ anca, ginocchio, lato });
    }
    this.cingoli = mesh(pezzo(`cingoli-${tT}-${F}`, (K) => costruisciCingoli(K, hw, C)), mat);
    this.cingoli.visible = false;
    this.gruppo.add(this.cingoli);
    this.propulsori = mesh(pezzo(`prop-${tT}-${F}`, (K) => costruisciPropulsori(K, hw, C)), mat);
    this.propulsori.visible = false;
    this.gruppo.add(this.propulsori);

    // torso e testa
    this.torso = new THREE.Group();
    this.torso.position.y = ALT_TORSO;
    this.gruppo.add(this.torso);
    this.torso.add(mesh(pezzo(`torso-${tT}-${F}`, (K) => costruisciTorso(K, tT, C)), mat));
    const cimaT = (this.cimaTorso = T.cima);
    this.testa = new THREE.Group();
    this.testa.position.set(0, cimaT + 0.08, 0.28);
    this.testa.scale.setScalar(1.18);
    this.torso.add(this.testa);
    this.testa.add(mesh(pezzo(`testa-${tH}-${F}`, (K) => costruisciTesta(K, tH, C)), mat));
    this.modTesta = new THREE.Group();
    this.testa.add(this.modTesta);

    // braccia
    this.braccia = [];
    const sp = SPESS_BRACCIA[tB];
    for (const lato of [-1, 1]) {
      const spalla = new THREE.Group();
      spalla.position.set(lato * (T.W * 0.56 + 0.4 + sp * 0.3), cimaT - 0.7, 0);
      this.torso.add(spalla);
      spalla.add(mesh(pezzo(`bsup-${tB}-${lato}-${F}`, (K) => costruisciBraccioSup(K, tB, lato, C)), mat));
      const avamb = new THREE.Group(); avamb.position.set(0, -L_BRACCIO, 0); spalla.add(avamb);
      avamb.add(mesh(pezzo(`bav-${tB}-${lato}-${F}`, (K) => costruisciAvambraccio(K, tB, lato, C)), mat));
      const presa = new THREE.Group(); presa.position.set(0, 0, L_AVAMB - 0.05); avamb.add(presa);
      this.braccia.push({ spalla, avamb, presa, lato, arma: null, rinculo: 0, rotto: false, penzola: 0 });
    }
    this.supporti = [-1, 1].map((lato) => {
      const s = new THREE.Group(); s.position.set(lato * hw * 0.55, cimaT + 0.35, -0.35); this.torso.add(s); return s;
    });
    this.schiena = new THREE.Group();
    this.schiena.position.set(0, T.cy - 0.25, -(T.D / 2 + 0.45));
    this.torso.add(this.schiena);

    // decalcomanie: matricola sugli spallacci e sulla schiena, emblema sul petto
    if (!this.bruciato) {
      const num = String(aspetto.numero ?? '').replace(/[^0-9A-Z]/gi, '').slice(0, 3);
      const colNum = luci ? C.a : '#f4f4f2';
      if (num) {
        const mn = matDecal('n', num, colNum);
        for (const b of this.braccia) decal(b.spalla, mn, sp * 0.9, b.lato * (sp * 1.12 + 0.03), 0, 0.05, b.lato * Math.PI / 2);
        decal(this.torso, mn, 0.7, 0, T.cy + T.H * 0.12, -T.D / 2 - 0.38, Math.PI);
      }
      if (aspetto.emblema) decal(this.torso, matDecal('e', aspetto.emblema, C.a), 0.55, T.W * 0.2, T.cy - T.H * 0.2, T.D * 0.425 + 0.02, 0);
    }

    this.bolla = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), matScudo);
    this.bolla.scale.setScalar(5.9);
    this.bolla.position.y = ALT_TORSO + 0.3;
    this.bolla.visible = false;
    this.gruppo.add(this.bolla);
    this.fiammaJet = [];
    this.torretta = null;
    this.radar = null;
  }

  colori(r) { return colori(this.aspetto.finitura, r, this.aspetto.luci || 0); }

  impostaSlot(slotStr) {
    if (slotStr === this.slotStr) return;
    this.slotStr = slotStr;
    const s = slotStr.split('|').map((x) => { if (!x) return null; const [c, r] = x.split(':'); return { c, r: +r }; });
    const F = this.aspetto.finitura, mat = this.mat, C = this.C;
    for (let i = 0; i < 2; i++) {
      const b = this.braccia[i];
      if (b.arma) b.presa.remove(b.arma);
      b.arma = creaArma(s[i] ? s[i].c : 'pugni', s[i] ? s[i].r : 0, F, this.bruciato);
      b.presa.add(b.arma);
    }
    for (let i = 0; i < 2; i++) {
      this.supporti[i].clear();
      if (s[2 + i]) this.supporti[i].add(creaArma(s[2 + i].c, s[2 + i].r, F, this.bruciato));
    }
    this.modTesta.clear();
    this.radar = null;
    if (s[5]) {
      const Cr = this.colori(s[5].r);
      this.modTesta.add(mesh(pezzo(`modt-${s[5].c}-${s[5].r}-${C.id}`, (K) => costruisciModTesta(K, s[5].c, Cr)), mat));
      if (s[5].c === 'radar') {
        const perno = new THREE.Group();
        perno.position.set(0.45, 1.66, -0.25);
        const disco = mesh(pezzo(`disco-${C.id}`, (K) => costruisciDisco(K, C)), mat);
        disco.rotation.x = 0.4;
        perno.add(disco);
        this.modTesta.add(perno);
        this.radar = perno;
      }
    }
    this.schiena.clear();
    this.fiammaJet = [];
    const cs = s[6] ? s[6].c : '';
    const Cs = this.colori(s[6] ? s[6].r : 0);
    this.schiena.add(mesh(pezzo(`schiena-${cs}-${s[6] ? s[6].r : 0}-${C.id}`, (K) => costruisciSchiena(K, cs, Cs)), mat));
    if (cs === 'jetpack') {
      for (const lato of [-1, 1]) {
        const f = new THREE.Group();
        const fuori = new THREE.Mesh(GEO_FIAMMA, matFiamma);
        fuori.scale.set(0.34, 2.0, 0.34);
        const dentro = new THREE.Mesh(GEO_FIAMMA, matNucleoFiamma);
        dentro.scale.set(0.16, 1.1, 0.16);
        f.add(fuori, dentro);
        f.position.set(lato * 0.62, -1.4, -0.35);
        f.rotation.x = Math.PI;
        f.visible = false;
        this.schiena.add(f);
        this.fiammaJet.push(f);
      }
    }
    const gm = s[4]?.c;
    this.cingoli.visible = gm === 'cingoli';
    this.bacino.visible = gm !== 'cingoli';
    this.propulsori.visible = gm === 'rapide';
  }

  impostaTorretta(attiva) {
    if (attiva && !this.torretta) {
      this.torretta = creaArma('torretta', 0, this.aspetto.finitura, this.bruciato);
      this.torretta.position.set(0, this.cimaTorso + 1.2, -0.5);
      this.torso.add(this.torretta);
    } else if (!attiva && this.torretta) {
      this.torso.remove(this.torretta);
      this.torretta = null;
    }
  }

  // aggiorna lo stato di danno; restituisce le parti che hanno appena superato una soglia
  impostaDanni(hp, max) {
    const nuovi = { bs: hp.bs / max.b, bd: hp.bd / max.b, g: hp.g / max.g, t: hp.t / max.t };
    const scatti = [];
    for (const k of ['bs', 'bd', 'g', 't']) {
      const prima = this.danni[k], ora = nuovi[k];
      for (const soglia of [0.6, 0.3, 0]) if (prima > soglia && ora <= soglia) { scatti.push({ parte: k, soglia }); break; }
      this.danni[k] = ora;
    }
    this.braccia.forEach((b, i) => {
      const rotto = this.danni[i === 0 ? 'bs' : 'bd'] <= 0;
      if (rotto === b.rotto) return;
      b.rotto = rotto;
      b.avamb.visible = !rotto;
      b.spalla.traverse((o) => { if (o.isMesh && o.userData.k) o.material = rotto ? MAT_BRUCIATO[o.userData.k] : this.mat[o.userData.k]; });
    });
    const gRotte = this.danni.g <= 0;
    if (gRotte !== this.gambeRotte) {
      this.gambeRotte = gRotte;
      this.bacino.traverse((o) => { if (o.isMesh && o.userData.k) o.material = gRotte ? MAT_BRUCIATO[o.userData.k] : this.mat[o.userData.k]; });
    }
    return scatti;
  }

  // posizione nel mondo di una parte (per scintille e detriti)
  puntoParte(parte, out = new THREE.Vector3()) {
    let nodo, off = [0, 0, 0];
    if (parte === 'bs' || parte === 'bd') { nodo = this.braccia[parte === 'bs' ? 0 : 1].spalla; off = [0, -0.6, 0]; }
    else if (parte === 'g') { nodo = this.gambe[1].ginocchio; off = [0, 0.3, 0]; }
    else { nodo = this.torso; off = [0, 1.6, 0.6]; }
    nodo.updateWorldMatrix(true, false);
    return out.set(...off).applyMatrix4(nodo.matrixWorld);
  }

  anima(dt, velocita, ap, flags, tempo, hp) {
    const passo = Math.min(velocita, 26);
    this.fase += dt * passo * 0.55;
    const amp = Math.min(1, passo / 10);
    const zoppo = this.gambeRotte && !this.cingoli.visible;
    for (const g of this.gambe) {
      const f = this.fase + (g.lato > 0 ? Math.PI : 0);
      const rigida = zoppo && g.lato > 0;
      g.anca.rotation.x = Math.sin(f) * (rigida ? 0.25 : 0.55) * amp;
      g.ginocchio.rotation.x = rigida ? 0 : Math.max(0, Math.sin(f + 1.2)) * 0.8 * amp * (this.aspetto.gambe === 0 ? -1 : 1);
    }
    // inclinazione in curva e in accelerazione/frenata
    const yaw = this.gruppo.rotation.y;
    let dy = this.yawPrec == null ? 0 : yaw - this.yawPrec;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yawPrec = yaw;
    const giro = dt > 0 ? dy / dt : 0;
    const acc = dt > 0 ? (velocita - this.velPrec) / dt : 0;
    this.velPrec = velocita;
    const k = Math.min(1, dt * 6);
    this.inclZ += (Math.max(-0.16, Math.min(0.16, giro * 0.05 * amp)) - this.inclZ) * k;
    this.inclX += (Math.max(-0.14, Math.min(0.18, acc * 0.01 + passo * 0.004)) - this.inclX) * k;
    this.kick = Math.max(0, this.kick - dt * 5);
    // passo pesante: impatto marcato, leggero accovacciamento, torsione del busto
    const cing = this.cingoli.visible;
    const impatto = cing ? 0 : Math.pow(Math.abs(Math.sin(this.fase)), 0.6) * 0.24 * amp;
    const giu = cing ? 0 : 0.12 * amp;
    this.torso.position.y = ALT_TORSO + impatto - giu;
    this.bacino.position.y = ALT_BACINO + impatto * 0.6 - giu;
    this.torso.rotation.set(0.07 + this.inclX - this.kick * 0.12, cing ? 0 : Math.sin(this.fase) * 0.06 * amp, this.inclZ + (cing ? 0 : Math.sin(this.fase) * 0.025 * amp) + (zoppo ? 0.08 : 0));
    this.bacino.rotation.z = zoppo ? -0.06 : 0;
    for (const b of this.braccia) {
      b.rinculo = Math.max(0, b.rinculo - dt * 6);
      if (b.rotto) {
        b.penzola += dt;
        b.spalla.rotation.x = 0.55 + Math.sin(b.penzola * 3) * 0.05 * (1 + amp);
        b.spalla.rotation.z = b.lato * 0.2;
      } else {
        b.spalla.rotation.x = -ap + Math.sin(this.fase + (b.lato > 0 ? 0 : Math.PI)) * 0.06 * amp - b.rinculo * 0.18;
        b.spalla.rotation.z = 0;
      }
      b.avamb.position.z = -b.rinculo * 0.6;
      if (b.arma?.userData.canne && flags & 128) b.arma.userData.canne.rotation.z += dt * 30;
      b.spalla.visible = true;
    }
    for (const s of this.supporti) s.rotation.x = -ap * 0.6;
    if (this.radar) this.radar.rotation.y = tempo * 2.5;
    for (const f of this.fiammaJet) {
      f.visible = !!(flags & 8);
      if (f.visible) { const s = 0.85 + Math.random() * 0.5; f.scale.set(1, s, 1); }
    }
    this.bolla.visible = !!(flags & 4);
    if (this.bolla.visible) this.bolla.material.opacity = 0.12 + Math.sin(tempo * 8) * 0.04;
  }

  sparo(lato, forza = 1) {
    const b = this.braccia[lato];
    if (b) b.rinculo = Math.min(1.6, forza);
    this.kick = Math.min(1.5, this.kick + forza * 0.5);
  }

  dispose() {
    this.gruppo.removeFromParent();
  }
}

// Drone fantasma: quadricottero con bracci, motori, eliche protette e occhio
export function creaDrone(colore = 0x6ff3ff) {
  const hex = '#' + new THREE.Color(colore).getHexString();
  const C = { p: '#9aa6b2', s: '#3d4652', d: '#22272d', j: '#474d55', k: '#c3cad1', g: '#16181b', a: hex, id: 'drone' + hex };
  const g = mesh(pezzo(`drone-${hex}`, (K) => {
    K.box(1.3, 0.45, 1.6, 0, 0, 0, C.s, 0, 0, 0, 'm', 0.15);
    K.box(1.0, 0.25, 1.2, 0, 0.3, -0.05, C.p, 0, 0, 0, 'm', 0.1);
    K.sfera(0.32, 0, -0.1, 0.78, C.d);
    K.sfera(0.2, 0, -0.1, 0.95, '#000', 'v');
    K.sfera(0.08, 0, -0.1, 1.12, C.a, 'e');
    K.luce(0.9, 0.05, 0, 0.12, 0.81, C.a);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 1.5, z = Math.sin(a) * 1.5;
      K.trave([Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [x, 0.15, z], 0.16, 0.16, C.j);
      K.cil(0.18, 0.2, 0.35, x, 0.2, z, C.d, 0, 0, 0, 12);
      K.toro(0.72, 0.04, x, 0.32, z, C.k, Math.PI / 2);
      K.sfera(0.05, x, 0.1, z, C.a, 'e');
    }
    K.asta([0.3, 0.4, -0.5], [0.35, 1.0, -0.6], 0.02, C.k);
  }), MAT);
  const eliche = [];
  const matElica = new THREE.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.3, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.02, 20), matElica);
    e.position.set(Math.cos(a) * 1.5, 0.4, Math.sin(a) * 1.5);
    g.add(e);
    eliche.push(e);
  }
  g.userData.eliche = eliche;
  return g;
}
