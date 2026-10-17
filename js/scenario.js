// RobotWar — scena 3D del mondo: terreno, edifici dettagliati, vegetazione, oggetti, acqua, cielo.
// Tutto è generato da codice (texture su canvas, geometrie procedurali). Le collisioni restano
// quelle di mondo.js: qui si costruisce solo la parte visiva, dentro gli stessi volumi.
import * as THREE from 'three';
import { META, RIS, PASSO } from './config.js';
import { creaRng, clamp } from './util.js';
import { coloreTerreno } from './mondo.js';
import { Kit, MAT } from './mech.js';

// ------------------------------------------------------------------
// Texture procedurali
// ------------------------------------------------------------------
function tela(n = 256) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
let semeT = 1234;
const rnd = () => ((semeT = (semeT * 16807) % 2147483647) / 2147483647);
function rumoreTela(g, n, fine, alfa, scuro = true) {
  for (let i = 0; i < fine; i++) {
    const v = scuro ? Math.floor(rnd() * 90) : 160 + Math.floor(rnd() * 95);
    g.fillStyle = `rgba(${v},${v},${v},${alfa * rnd()})`;
    g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}
function normaleDa(alt, forza = 2) {
  const n = alt.width, d = alt.getContext('2d').getImageData(0, 0, n, n).data;
  const [c, g] = tela(n), img = g.createImageData(n, n);
  const h = (x, y) => d[((((y + n) % n) * n + ((x + n) % n)) * 4)] / 255;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * forza, dy = (h(x, y + 1) - h(x, y - 1)) * forza;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// facciata: una campata da 4 m x 4 m (un piano, una finestra)
function facciata(tipo) {
  const N = 256;
  const [c, g] = tela(N), [a, ga] = tela(N), [r, gr] = tela(N);
  const base = { cemento: '#b5ad9f', mattoni: '#8e4a36', vetro: '#5d6873', lamiera: '#7d8890', pianoterra: '#9a948a', rovina: '#8f8a82' }[tipo];
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  ga.fillStyle = '#999'; ga.fillRect(0, 0, N, N);
  gr.fillStyle = '#e0e0e0'; gr.fillRect(0, 0, N, N);
  rumoreTela(g, N, 2500, 0.18); rumoreTela(g, N, 1200, 0.12, false);
  const finestra = (x, y, w, h, rotta = false) => {
    g.fillStyle = '#3a3c40'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
    ga.fillStyle = '#7a7a7a'; ga.fillRect(x - 6, y - 6, w + 12, h + 12);
    if (rotta) { g.fillStyle = '#0c0c0e'; g.fillRect(x, y, w, h); ga.fillStyle = '#202020'; ga.fillRect(x, y, w, h); }
    else {
      const gr2 = g.createLinearGradient(x, y, x + w, y + h);
      gr2.addColorStop(0, '#5f7f99'); gr2.addColorStop(0.45, '#25384a'); gr2.addColorStop(0.55, '#8fb0c8'); gr2.addColorStop(1, '#1c2a38');
      g.fillStyle = gr2; g.fillRect(x, y, w, h);
      g.fillStyle = '#3a3c40'; g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * 0.35, w, 5);
      ga.fillStyle = '#404040'; ga.fillRect(x, y, w, h);
      gr.fillStyle = '#181818'; gr.fillRect(x, y, w, h);
    }
    g.fillStyle = 'rgba(230,226,215,0.9)'; g.fillRect(x - 10, y + h + 6, w + 20, 8);
    ga.fillStyle = '#d0d0d0'; ga.fillRect(x - 10, y + h + 6, w + 20, 8);
    // colature sotto il davanzale
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(40,36,30,${0.05 + rnd() * 0.1})`; g.fillRect(x + rnd() * w, y + h + 14, 2 + rnd() * 4, 30 + rnd() * 80); }
  };
  if (tipo === 'cemento' || tipo === 'rovina') {
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, N - 18, N, 18);
    ga.fillStyle = '#c4c4c4'; ga.fillRect(0, N - 18, N, 18);
    g.strokeStyle = 'rgba(40,40,40,0.25)'; g.lineWidth = 2; g.strokeRect(1, 1, N - 2, N - 2);
    finestra(58, 56, 140, 120, tipo === 'rovina' && rnd() < 2);
    if (tipo === 'rovina') {
      for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,18,16,${0.2 + rnd() * 0.3})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N * 0.6, 20 + rnd() * 50, 30 + rnd() * 70, 0, 0, 7); g.fill(); }
      for (let i = 0; i < 8; i++) { g.strokeStyle = 'rgba(30,28,26,0.7)'; g.lineWidth = 1.5; g.beginPath(); let x = rnd() * N, y = rnd() * N; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 40; y += rnd() * 30; g.lineTo(x, y); } g.stroke(); }
    }
  } else if (tipo === 'mattoni') {
    for (let y = 0; y < N; y += 16) for (let x = -((y / 16) % 2) * 16; x < N; x += 32) {
      const t = 0.85 + rnd() * 0.3;
      g.fillStyle = `rgb(${142 * t | 0},${70 * t | 0},${52 * t | 0})`; g.fillRect(x + 1, y + 1, 30, 14);
      ga.fillStyle = '#b0b0b0'; ga.fillRect(x + 1, y + 1, 30, 14);
    }
    ga.globalCompositeOperation = 'darken';
    finestra(64, 60, 128, 116);
    g.fillStyle = '#c9c1b0'; g.fillRect(56, 44, 144, 12);
  } else if (tipo === 'vetro') {
    for (let i = 0; i < 4; i++) {
      const x = i * 64;
      const gr2 = g.createLinearGradient(x, 0, x + 64, N);
      gr2.addColorStop(0, '#7d9fb8'); gr2.addColorStop(0.5, '#2c4256'); gr2.addColorStop(0.7, '#9cc0d8'); gr2.addColorStop(1, '#22364a');
      g.fillStyle = gr2; g.fillRect(x + 4, 0, 56, N - 40);
      gr.fillStyle = '#121212'; gr.fillRect(x + 4, 0, 56, N - 40);
      ga.fillStyle = '#606060'; ga.fillRect(x + 4, 0, 56, N - 40);
    }
    g.fillStyle = '#3c454f'; g.fillRect(0, N - 40, N, 40);
    gr.fillStyle = '#707070'; gr.fillRect(0, N - 40, N, 40);
  } else if (tipo === 'lamiera') {
    for (let x = 0; x < N; x++) {
      const v = 0.5 + Math.sin((x / N) * Math.PI * 16) * 0.5;
      ga.fillStyle = `rgb(${80 + v * 120 | 0},${80 + v * 120 | 0},${80 + v * 120 | 0})`; ga.fillRect(x, 0, 1, N);
      g.fillStyle = `rgba(255,255,255,${v * 0.12})`; g.fillRect(x, 0, 1, N);
    }
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${120 + rnd() * 40},${60 + rnd() * 20},30,${0.15 + rnd() * 0.25})`; g.fillRect(rnd() * N, rnd() * N * 0.5, 3 + rnd() * 10, 40 + rnd() * 140); }
    gr.fillStyle = '#909090'; gr.fillRect(0, 0, N, N);
    g.fillStyle = 'rgba(30,30,30,0.5)'; g.fillRect(0, N - 6, N, 6);
  } else if (tipo === 'pianoterra') {
    g.fillStyle = '#5a5f66'; g.fillRect(40, 40, 176, N - 40);
    for (let y = 44; y < N; y += 8) { g.fillStyle = y % 16 ? '#6c727a' : '#4c5158'; g.fillRect(44, y, 168, 6); ga.fillStyle = y % 16 ? '#b0b0b0' : '#707070'; ga.fillRect(44, y, 168, 6); }
    const insegne = ['#c0392b', '#2471a3', '#d4ac0d', '#1e8449', '#7d3c98'];
    g.fillStyle = insegne[Math.floor(rnd() * insegne.length)]; g.fillRect(30, 8, 196, 26);
    g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 6; i++) g.fillRect(50 + i * 26, 16, 16, 10);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 200 : 40},${rnd() * 120 | 0},${rnd() * 200 | 0},0.35)`; g.fillRect(50 + rnd() * 150, 100 + rnd() * 100, 10 + rnd() * 30, 6 + rnd() * 20); }
  }
  // sporco dal basso e dall'alto
  const sp = g.createLinearGradient(0, 0, 0, N);
  sp.addColorStop(0, 'rgba(40,36,30,0.18)'); sp.addColorStop(0.2, 'rgba(0,0,0,0)'); sp.addColorStop(0.85, 'rgba(0,0,0,0)'); sp.addColorStop(1, 'rgba(50,45,38,0.25)');
  g.fillStyle = sp; g.fillRect(0, 0, N, N);
  return { map: tex(c), normalMap: tex(normaleDa(a, 3), false), roughnessMap: tex(r, false) };
}

function texTetto() {
  const N = 256, [c, g] = tela(N), [a, ga] = tela(N);
  g.fillStyle = '#5b5852'; g.fillRect(0, 0, N, N); ga.fillStyle = '#888'; ga.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) { const v = 60 + rnd() * 90 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(rnd() * N, rnd() * N, 2, 2); ga.fillStyle = `rgb(${v + 60},${v + 60},${v + 60})`; ga.fillRect(rnd() * N, rnd() * N, 2, 2); }
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,30,32,0.25)'; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 30 + rnd() * 60, 20 + rnd() * 40, rnd() * 3, 0, 7); g.fill(); }
  return { map: tex(c), normalMap: tex(normaleDa(a, 1.5), false) };
}

function texTerreno() {
  const N = 512, [c, g] = tela(N), [a, ga] = tela(N);
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, N, N); ga.fillStyle = '#808080'; ga.fillRect(0, 0, N, N);
  for (let i = 0; i < 400; i++) { const v = 170 + rnd() * 80 | 0; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.beginPath(); g.arc(rnd() * N, rnd() * N, 6 + rnd() * 30, 0, 7); g.fill(); }
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * N, y = rnd() * N, v = 120 + rnd() * 135 | 0;
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4); g.stroke();
    ga.fillStyle = `rgba(${v},${v},${v},0.5)`; ga.fillRect(x, y, 1.5, 1.5);
  }
  for (let i = 0; i < 300; i++) { const v = 90 + rnd() * 70 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(rnd() * N, rnd() * N, 1 + rnd() * 2.5, 0, 7); g.fill(); ga.fillStyle = '#e0e0e0'; ga.beginPath(); ga.arc(rnd() * N, rnd() * N, 2, 0, 7); ga.fill(); }
  return { map: tex(c), normalMap: tex(normaleDa(a, 2.5), false) };
}

function texGenerica(colore, macchie, forza = 2) {
  const N = 256, [c, g] = tela(N), [a, ga] = tela(N);
  g.fillStyle = colore; g.fillRect(0, 0, N, N); ga.fillStyle = '#808080'; ga.fillRect(0, 0, N, N);
  for (let i = 0; i < macchie; i++) {
    const v = rnd() * 255 | 0, x = rnd() * N, y = rnd() * N, rr = 1 + rnd() * 6;
    g.fillStyle = `rgba(${v},${v},${v},0.12)`; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    ga.fillStyle = `rgba(${v},${v},${v},0.5)`; ga.beginPath(); ga.arc(x, y, rr, 0, 7); ga.fill();
  }
  for (let i = 0; i < 40; i++) { ga.strokeStyle = 'rgba(20,20,20,0.6)'; ga.lineWidth = 1.5; ga.beginPath(); let x = rnd() * N, y = rnd() * N; ga.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; ga.lineTo(x, y); } ga.stroke(); }
  return { map: tex(c), normalMap: tex(normaleDa(a, forza), false) };
}

function texErba() {
  const [c, g] = tela(128);
  for (let i = 0; i < 26; i++) {
    const x = 8 + rnd() * 112, h = 50 + rnd() * 74, curva = (rnd() - 0.5) * 30;
    const v = 0.7 + rnd() * 0.3;
    g.strokeStyle = `rgb(${110 * v | 0},${170 * v | 0},${70 * v | 0})`; g.lineWidth = 2 + rnd() * 2.5;
    g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + curva * 0.3, 128 - h * 0.6, x + curva, 128 - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function texNuvola() {
  const [c, g] = tela(256);
  for (let i = 0; i < 40; i++) {
    const x = 40 + rnd() * 176, y = 100 + (rnd() - 0.5) * 60, r = 20 + rnd() * 45;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function texAcqua() {
  const [a, ga] = tela(256);
  ga.fillStyle = '#808080'; ga.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const v = rnd() * 255 | 0; ga.fillStyle = `rgba(${v},${v},${v},0.25)`; ga.beginPath(); ga.ellipse(rnd() * 256, rnd() * 256, 4 + rnd() * 18, 2 + rnd() * 6, 0, 0, 7); ga.fill(); }
  const t = tex(normaleDa(a, 1.2), false); return t;
}

// ------------------------------------------------------------------
// Pezzi d'arredo (costruiti con il kit dei mech, chiave 'p' = oggetti, 'e' = luci)
// ------------------------------------------------------------------
const COL = { cls: '#a8a397', cls2: '#8d887d', ferro: '#4d545c', ruggine: '#7a4a2e', gomma: '#1b1c1e', legno: '#7a5a3a', vetro: '#20303c' };

function lampione(K, x, y, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  K.cil(0.14, 0.2, 7, x, y + 3.5, z, COL.ferro, 0, 0, 0, 8, 'p');
  K.cil(0.3, 0.35, 0.5, x, y + 0.25, z, COL.ferro, 0, 0, 0, 8, 'p');
  K.asta([x, y + 6.8, z], [x + s * 2, y + 7.1, z + c * 2], 0.08, COL.ferro, 'p', 6);
  K.box(0.5, 0.18, 1.0, x + s * 2.2, y + 7.0, z + c * 2.2, COL.ferro, 0, ry, 0, 'p', 0);
  K.box(0.4, 0.05, 0.8, x + s * 2.2, y + 6.9, z + c * 2.2, '#fff2c8', 0, ry, 0, 'e', 0);
}
function barile(K, x, y, z, colore) {
  K.cil(0.45, 0.45, 1.25, x, y + 0.63, z, colore, 0, 0, 0, 12, 'p');
  for (const h of [0.35, 0.9]) K.cil(0.47, 0.47, 0.06, x, y + h, z, COL.ferro, 0, 0, 0, 12, 'p');
  K.cil(0.43, 0.43, 0.02, x, y + 1.26, z, '#3a3a3a', 0, 0, 0, 12, 'p');
}
function cassa(K, x, y, z, s, ry) {
  K.box(s, s, s, x, y + s / 2, z, COL.legno, 0, ry, 0, 'p', 0);
  for (const dy of [0.06, s - 0.06]) K.box(s + 0.04, 0.1, s + 0.04, x, y + dy, z, '#5a4028', 0, ry, 0, 'p', 0);
  K.box(s * 0.12, s, s + 0.03, x, y + s / 2, z, '#5a4028', 0, ry, 0, 'p', 0);
}
function barriera(K, x, y, z, ry) {
  K.box(0.7, 0.35, 3.6, x, y + 0.18, z, COL.cls, 0, ry, 0, 'p', 0);
  K.box(0.35, 0.65, 3.6, x, y + 0.65, z, COL.cls, 0, ry, 0, 'p', 0);
  K.box(0.37, 0.12, 3.62, x, y + 0.85, z, '#c8a020', 0, ry, 0, 'p', 0);
}
function relittoAuto(K, x, y, z, ry, colore, rng) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const p = (dx, dz) => [x + c * dx + s * dz, z - s * dx + c * dz];
  const incl = (rng() - 0.5) * 0.25;
  K.box(1.9, 0.7, 4.4, x, y + 0.75, z, colore, 0, ry, incl, 'p', 0);
  K.box(1.7, 0.6, 2.2, ...[p(0, -0.2)].map(([a, b]) => [a, y + 1.4, b])[0], colore, 0, ry, incl, 'p', 0);
  K.box(1.72, 0.45, 2.0, ...[p(0, -0.2)].map(([a, b]) => [a, y + 1.42, b])[0], COL.vetro, 0, ry, incl, 'p', 0);
  for (const [dx, dz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    if (rng() < 0.25) continue;
    const [wx, wz] = p(dx, dz);
    K.cil(0.38, 0.38, 0.3, wx, y + 0.38, wz, COL.gomma, 0, ry, Math.PI / 2, 10, 'p');
  }
  for (let i = 0; i < 4; i++) { const [rx, rz] = p((rng() - 0.5) * 1.6, (rng() - 0.5) * 4); K.box(0.4 + rng() * 0.4, 0.05, 0.3 + rng() * 0.5, rx, y + 1.12, rz, COL.ruggine, 0, rng() * 3, 0, 'p', 0); }
}
function container(K, x, y, z, ry, colore) {
  K.box(2.44, 2.6, 6.06, x, y + 1.3, z, colore, 0, ry, 0, 'p', 0);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = -5; i <= 5; i++) {
    for (const l of [-1, 1]) K.box(0.06, 2.4, 0.1, x + c * l * 1.24 + s * i * 0.55, y + 1.3, z - s * l * 1.24 + c * i * 0.55, colore, 0, ry, 0, 'p', 0);
  }
  K.box(2.5, 0.12, 6.1, x, y + 2.62, z, COL.ferro, 0, ry, 0, 'p', 0);
}
function traliccio(K, x, y, z, ry, h = 26) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (dx, dy, dz) => [x + c * dx + s * dz, y + dy, z - s * dx + c * dz];
  const base = 2.6, cima = 0.7;
  const gamba = (sx, sz) => K.asta(P(sx * base, 0, sz * base), P(sx * cima, h, sz * cima), 0.12, COL.ferro, 'p', 5);
  gamba(-1, -1); gamba(1, -1); gamba(-1, 1); gamba(1, 1);
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6, t1 = (i + 1) / 6, w0 = base + (cima - base) * t0, w1 = base + (cima - base) * t1;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      K.asta(P(a[0] * w0, h * t0, a[1] * w0), P(b[0] * w1, h * t1, b[1] * w1), 0.05, COL.ferro, 'p', 4);
    }
  }
  K.asta(P(-6, h - 3, 0), P(6, h - 3, 0), 0.15, COL.ferro, 'p', 5);
  K.asta(P(-4.5, h - 7, 0), P(4.5, h - 7, 0), 0.13, COL.ferro, 'p', 5);
  for (const dx of [-6, 6, -4.5, 4.5]) K.cil(0.12, 0.12, 0.8, ...P(dx, dx === 6 || dx === -6 ? h - 3.5 : h - 7.5, 0), '#c8ccd0', 0, 0, 0, 6, 'p');
}
function serbatoio(K, x, y, z, r, h) {
  K.cil(r, r, h, x, y + h / 2, z, '#c9c6bd', 0, 0, 0, 24, 'p');
  K.agg(new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'p', '#b9b6ad', x, y + h, z, 0, 0, 0, 1, 0.3, 1);
  for (let i = 1; i < 4; i++) K.cil(r + 0.06, r + 0.06, 0.18, x, y + (h * i) / 4, z, COL.ferro, 0, 0, 0, 24, 'p');
  K.box(0.6, h, 0.12, x + r + 0.15, y + h / 2, z, COL.ferro, 0, 0, 0, 'p', 0);
  for (let k = 0; k < h; k += 0.6) K.box(0.6, 0.05, 0.3, x + r + 0.15, y + k, z + 0.1, COL.ferro, 0, 0, 0, 'p', 0);
  K.box(2.2, 0.18, 0.12, x, y + h * 0.5, z + r + 0.02, '#c03020', 0, 0, 0, 'p', 0);
}

// ------------------------------------------------------------------
// Edifici
// ------------------------------------------------------------------
const INDUSTRIALI = ['Raffineria', 'Fonderia', 'Porto Ruggine'];

function muro(K, tipo, cx, cz, L, ya, yb, ry, v0, colore = '#ffffff') {
  const g = new THREE.PlaneGeometry(L, yb - ya);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 4, (ya - v0) / 4 + uv.getY(i) * (yb - ya) / 4);
  K.agg(g, tipo, colore, cx, (ya + yb) / 2, cz, 0, ry, 0);
}

function scatola(K, tipo, e, ya, yb, v0, colore, rientro = 0) {
  const x0 = e.x0 + rientro, x1 = e.x1 - rientro, z0 = e.z0 + rientro, z1 = e.z1 - rientro;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  muro(K, tipo, cx, z1, w, ya, yb, 0, v0, colore);
  muro(K, tipo, cx, z0, w, ya, yb, Math.PI, v0, colore);
  muro(K, tipo, x1, cz, d, ya, yb, Math.PI / 2, v0, colore);
  muro(K, tipo, x0, cz, d, ya, yb, -Math.PI / 2, v0, colore);
}

function tetto(K, e, y, rientro = 0) {
  const w = e.x1 - e.x0 - rientro * 2, d = e.z1 - e.z0 - rientro * 2;
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 6, uv.getY(i) * d / 6);
  K.agg(g, 'tetto', '#ffffff', (e.x0 + e.x1) / 2, y, (e.z0 + e.z1) / 2, -Math.PI / 2, 0, 0);
}

function costruisciEdificio(K, e, tipoLuogo, rng) {
  const w = e.x1 - e.x0, d = e.z1 - e.z0, cx = (e.x0 + e.x1) / 2, cz = (e.z0 + e.z1) / 2;
  const suolo = e.y0 + 2, h = e.y1 - suolo;
  const tinta = ['#ffffff', '#f2ece2', '#e6eef2', '#f6efe6', '#ebe6dc'][Math.floor(rng() * 5)];
  const rovina = e.tono >= 6;
  // serbatoio industriale dentro l'ingombro quadrato
  if (tipoLuogo === 'industriale' && Math.abs(w - d) < Math.min(w, d) * 0.35 && rng() < 0.45) {
    serbatoio(K, cx, e.y0, cz, Math.min(w, d) / 2 - 0.2, e.y1 - e.y0);
    return;
  }
  let facc = rovina ? 'rovina' : tipoLuogo === 'industriale' ? 'lamiera' : h > 24 ? (rng() < 0.6 ? 'vetro' : 'cemento') : (rng() < 0.5 ? 'mattoni' : 'cemento');
  const conPianoTerra = !rovina && facc !== 'lamiera' && h > 7;
  if (conPianoTerra) {
    scatola(K, 'pianoterra', e, e.y0, suolo + 4, suolo, tinta);
    scatola(K, facc, e, suolo + 4, e.y1, suolo, tinta);
    // pensilina d'ingresso
    const lato = rng() < 0.5 ? 1 : -1;
    K.box(Math.min(6, w * 0.5), 0.25, 1.6, cx, suolo + 4.1, lato > 0 ? e.z1 + 0.8 : e.z0 - 0.8, COL.cls2, 0, 0, 0, 'p', 0);
  } else scatola(K, facc, e, e.y0, e.y1, suolo, tinta);
  // spigoli e marcapiani
  for (const [x, z] of [[e.x0, e.z0], [e.x1, e.z0], [e.x0, e.z1], [e.x1, e.z1]]) K.box(0.5, e.y1 - e.y0, 0.5, x, (e.y0 + e.y1) / 2, z, facc === 'lamiera' ? COL.ferro : COL.cls2, 0, 0, 0, 'p', 0);
  if (facc === 'cemento' || facc === 'vetro') for (let y = suolo + 8; y < e.y1 - 2; y += 8) K.box(w + 0.3, 0.3, d + 0.3, cx, y, cz, COL.cls2, 0, 0, 0, 'p', 0);

  if (rovina) {
    // cima spezzata: blocchi inclinati, ferri d'armatura, macerie alla base
    tetto(K, e, e.y1 - 0.05, 0.1);
    for (let i = 0; i < 5; i++) K.box(1 + rng() * 3, 0.6 + rng() * 1.5, 1 + rng() * 3, e.x0 + rng() * w, e.y1 + 0.3, e.z0 + rng() * d, COL.cls2, (rng() - 0.5) * 0.8, rng() * 3, (rng() - 0.5) * 0.8, 'p', 0);
    for (let i = 0; i < 8; i++) { const x = e.x0 + rng() * w, z = e.z0 + rng() * d; K.asta([x, e.y1 - 0.2, z], [x + (rng() - 0.5) * 1.5, e.y1 + 1 + rng() * 2, z + (rng() - 0.5) * 1.5], 0.04, COL.ruggine, 'p', 4); }
    for (let i = 0; i < 7; i++) { const a = rng() * Math.PI * 2, r = Math.max(w, d) * 0.55 + rng() * 2; K.agg(new THREE.DodecahedronGeometry(0.6 + rng() * 1.4, 0), 'p', rng() < 0.5 ? COL.cls : COL.cls2, cx + Math.cos(a) * r, suolo + 0.2, cz + Math.sin(a) * r, rng(), rng(), rng(), 1, 0.6, 1); }
    return;
  }
  tetto(K, e, e.y1 - 0.02);
  // parapetto
  for (const [lx, lz, sx, sz] of [[cx, e.z1 - 0.15, w, 0.3], [cx, e.z0 + 0.15, w, 0.3], [e.x1 - 0.15, cz, 0.3, d], [e.x0 + 0.15, cz, 0.3, d]]) K.box(sx, 0.9, sz, lx, e.y1 + 0.45, lz, facc === 'lamiera' ? COL.ferro : COL.cls, 0, 0, 0, 'p', 0);
  // impianti sul tetto
  const n = Math.floor(1 + rng() * 3 + (w * d) / 120);
  for (let i = 0; i < n; i++) {
    const x = e.x0 + 1.5 + rng() * (w - 3), z = e.z0 + 1.5 + rng() * (d - 3), q = rng();
    if (q < 0.35) { K.box(1.6, 1.0, 1.2, x, e.y1 + 0.5, z, '#9aa0a6', 0, 0, 0, 'p', 0); K.cil(0.45, 0.45, 0.08, x, e.y1 + 1.02, z, '#2a2d30', 0, 0, 0, 12, 'p'); }
    else if (q < 0.55 && facc !== 'vetro') { for (const [ax, az] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) K.asta([x + ax, e.y1, z + az], [x + ax * 0.9, e.y1 + 2, z + az * 0.9], 0.07, COL.ferro, 'p', 4); K.cil(1.2, 1.2, 1.8, x, e.y1 + 2.9, z, '#6b5a48', 0, 0, 0, 12, 'p'); K.agg(new THREE.ConeGeometry(1.25, 0.6, 12), 'p', '#5a4a3a', x, e.y1 + 4.1, z); }
    else if (q < 0.7) { K.asta([x, e.y1, z], [x, e.y1 + 4 + rng() * 5, z], 0.05, '#c3cad1', 'p', 4); }
    else if (q < 0.85) { K.box(2.4, 2.4, 2.4, x, e.y1 + 1.2, z, COL.cls2, 0, 0, 0, 'p', 0); K.box(0.9, 1.8, 0.05, x, e.y1 + 0.9, z + 1.22, '#4a4f55', 0, 0, 0, 'p', 0); }
    else { K.box(2.0, 0.5, 1.4, x, e.y1 + 0.25, z, '#8a9097', 0, 0, 0, 'p', 0); K.box(1.8, 0.05, 1.2, x, e.y1 + 0.52, z, COL.vetro, 0, 0, 0, 'p', 0); }
  }
  if (facc === 'lamiera') {
    // tubature esterne e ciminiera
    for (let i = 0; i < 2; i++) { const x = e.x0 + 1 + rng() * (w - 2); K.cil(0.3, 0.3, e.y1 - suolo, x, (e.y1 + suolo) / 2, e.z1 + 0.4, '#8a6a4a', 0, 0, 0, 10, 'p'); }
    if (rng() < 0.5) { const x = cx + (rng() - 0.5) * w * 0.4, z = cz + (rng() - 0.5) * d * 0.4, hh = 10 + rng() * 14; K.cil(0.9, 1.2, hh, x, e.y1 + hh / 2, z, '#7a7068', 0, 0, 0, 14, 'p'); for (let k = 2; k < hh; k += 4) K.cil(1.25, 1.25, 0.3, x, e.y1 + k, z, '#b03020', 0, 0, 0, 14, 'p'); }
  }
}

// ------------------------------------------------------------------
// Vegetazione e rocce (geometrie istanziate)
// ------------------------------------------------------------------
function geoPino() {
  const K = new Kit();
  K.cil(0.25, 0.4, 3.5, 0, 1.75, 0, '#6a4c36', 0, 0, 0, 7, 'a');
  for (let i = 0; i < 4; i++) {
    const r = 2.6 - i * 0.55, y = 2.6 + i * 1.7;
    K.agg(new THREE.ConeGeometry(r, 2.8, 8), 'a', i % 2 ? '#4a8a40' : '#3f7a3a', 0, y + 1.2, 0, 0, i * 0.4, 0);
  }
  return K.fondi().a;
}
function geoLatifoglia() {
  const K = new Kit();
  K.cil(0.3, 0.5, 4, 0, 2, 0, '#5d4433', 0, 0, 0, 7, 'a');
  K.asta([0, 3, 0], [1.4, 5, 0.3], 0.18, '#5d4433', 'a', 6);
  K.asta([0, 3.4, 0], [-1.2, 5.2, -0.5], 0.16, '#5d4433', 'a', 6);
  for (const [x, y, z, r, c] of [[0, 6.2, 0, 2.6, '#3f7a34'], [1.6, 5.6, 0.4, 1.9, '#4a8a3a'], [-1.5, 5.8, -0.5, 2.0, '#376f2e'], [0.3, 7.4, -0.3, 1.8, '#4f9340'], [-0.4, 5.2, 1.3, 1.6, '#3a7431']]) K.agg(new THREE.IcosahedronGeometry(r, 1), 'a', c, x, y, z);
  return K.fondi().a;
}
function geoCespuglio() {
  const K = new Kit();
  for (const [x, y, z, r, c] of [[0, 0.6, 0, 1.0, '#3d6e2f'], [0.8, 0.5, 0.3, 0.75, '#47803a'], [-0.7, 0.45, -0.2, 0.7, '#355f2a']]) K.agg(new THREE.IcosahedronGeometry(r, 1), 'a', c, x, y, z, 0, 0, 0, 1, 0.8, 1);
  return K.fondi().a;
}
function geoRoccia(seme, dettaglio = 2) {
  const g = new THREE.IcosahedronGeometry(1, dettaglio);
  const p = g.attributes.position, r = creaRng(seme);
  const sfasa = [r() * 10, r() * 10, r() * 10];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(x * 2.1 + sfasa[0]) * 0.13 + Math.sin(y * 3.3 + sfasa[1]) * 0.1 + Math.sin(z * 2.7 + sfasa[2]) * 0.12 + (r() - 0.5) * 0.08;
    p.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  const ni = g.toNonIndexed();
  ni.computeVertexNormals();
  const n = ni.attributes.normal, col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const muschio = n.getY(i) > 0.65;
    const v = 0.55 + r() * 0.1;
    col[i * 3] = muschio ? 0.32 : v; col[i * 3 + 1] = muschio ? 0.45 : v * 0.97; col[i * 3 + 2] = muschio ? 0.25 : v * 0.92;
  }
  ni.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ni;
}
function geoErba() {
  const g1 = new THREE.PlaneGeometry(1.6, 1.1); g1.translate(0, 0.55, 0);
  const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
  const g3 = g1.clone(); g3.rotateY(Math.PI / 4);
  const out = new THREE.BufferGeometry();
  const pos = [], uv = [], nor = [];
  for (const g of [g1, g2, g3]) {
    const ni = g.toNonIndexed();
    pos.push(...ni.attributes.position.array); uv.push(...ni.attributes.uv.array);
    for (let i = 0; i < ni.attributes.position.count; i++) nor.push(0, 1, 0);
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

// ------------------------------------------------------------------
// Costruzione della scena
// ------------------------------------------------------------------
export function costruisciMondo(mappa, qualita = 'alta') {
  const gruppo = new THREE.Group();
  const N = mappa.N;
  const alta = qualita === 'alta', media = qualita === 'media';
  semeT = 1234 + (mappa.seme % 1000);
  const rng = creaRng(mappa.seme + 99);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), eul = new THREE.Euler();

  // ---- terreno con texture di dettaglio ----
  const geo = new THREE.PlaneGeometry(META * 2, META * 2, RIS, RIS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ix = i % N, iz = Math.floor(i / N);
    const h = mappa.H[iz * N + ix];
    pos.setY(i, h);
    uv.setXY(i, pos.getX(i) / 9, pos.getZ(i) / 9);
    const hx = mappa.H[iz * N + Math.min(ix + 1, N - 1)] - h, hz = mappa.H[Math.min(iz + 1, N - 1) * N + ix] - h;
    const k = coloreTerreno(mappa, pos.getX(i), pos.getZ(i), h, Math.hypot(hx, hz) / PASSO);
    col[i * 3] = k[0] * 1.08; col[i * 3 + 1] = k[1] * 1.08; col[i * 3 + 2] = k[2] * 1.08;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const tt = texTerreno();
  const terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tt.map, normalMap: tt.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, metalness: 0 }));
  terreno.receiveShadow = alta;
  gruppo.add(terreno);

  // ---- mare ----
  const nAcqua = texAcqua();
  nAcqua.repeat.set(220, 220);
  const acqua = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x1a5670, roughness: 0.12, metalness: 0.35, normalMap: nAcqua, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.9 }));
  acqua.rotation.x = -Math.PI / 2;
  gruppo.add(acqua);

  // ---- edifici ----
  const KE = new Kit();
  for (const e of mappa.edifici) {
    let vicino = null, dmin = 1e9;
    for (const l of mappa.luoghi) { const dd = Math.hypot((e.x0 + e.x1) / 2 - l.x, (e.z0 + e.z1) / 2 - l.z); if (dd < dmin) { dmin = dd; vicino = l; } }
    const tipoLuogo = vicino && dmin < vicino.raggio * 1.3 && INDUSTRIALI.includes(vicino.nome) ? 'industriale' : 'urbano';
    costruisciEdificio(KE, e, tipoLuogo, rng);
  }
  // ---- oggetti sparsi ----
  const libero = (x, z) => { const h = mappa.altezza(x, z); return h > 1 && !mappa.solido(x, h + 1.2, z); };
  const coloriBarili = ['#9a2a20', '#2a4a8a', '#c8a020', '#3a6a3a', '#5a5a5a'];
  const coloriAuto = ['#6a2a24', '#2c3e50', '#7a7a6a', '#4a5a3a', '#8a6a2a'];
  const coloriCont = ['#a3402a', '#2a6a8a', '#3a7a3a', '#c09a2a', '#6a3a7a'];
  for (const l of mappa.luoghi) {
    const ind = INDUSTRIALI.includes(l.nome);
    for (const anello of [0.45, 0.85]) {
      const n = Math.floor(l.raggio * anello * Math.PI * 2 / 22);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = l.x + Math.cos(a) * l.raggio * anello, z = l.z + Math.sin(a) * l.raggio * anello;
        if (libero(x, z)) lampione(KE, x, mappa.altezza(x, z), z, a + Math.PI);
      }
    }
    const sparsi = (nn, fn) => { for (let i = 0; i < nn; i++) { const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * l.raggio * 1.1; const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d; if (libero(x, z)) fn(x, mappa.altezza(x, z), z); } };
    sparsi(8, (x, y, z) => { const n = 1 + Math.floor(rng() * 4), col2 = coloriBarili[Math.floor(rng() * coloriBarili.length)]; for (let k = 0; k < n; k++) barile(KE, x + (k % 2) * 1.0, y, z + Math.floor(k / 2) * 1.0, col2); });
    sparsi(7, (x, y, z) => { cassa(KE, x, y, z, 1.2 + rng() * 0.6, rng() * 3); if (rng() < 0.5) cassa(KE, x + 0.2, y + 1.3, z, 1.1, rng() * 3); });
    sparsi(8, (x, y, z) => barriera(KE, x, y, z, rng() * Math.PI));
    sparsi(5, (x, y, z) => relittoAuto(KE, x, y, z, rng() * Math.PI * 2, coloriAuto[Math.floor(rng() * coloriAuto.length)], rng));
    if (ind) sparsi(14, (x, y, z) => container(KE, x, y, z, Math.floor(rng() * 4) * Math.PI / 2 + (rng() - 0.5) * 0.1, coloriCont[Math.floor(rng() * coloriCont.length)]));
  }
  // linee elettriche tra i luoghi
  for (let i = 0; i < mappa.luoghi.length - 1; i++) {
    const A = mappa.luoghi[i], B = mappa.luoghi[(i + 2) % mappa.luoghi.length];
    const L = Math.hypot(B.x - A.x, B.z - A.z), n = Math.floor(L / 70), ry = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2;
    let prec = null;
    for (let k = 1; k < n; k++) {
      const x = A.x + ((B.x - A.x) * k) / n, z = A.z + ((B.z - A.z) * k) / n;
      if (!libero(x, z)) { prec = null; continue; }
      const y = mappa.altezza(x, z);
      traliccio(KE, x, y, z, ry);
      const c0 = Math.cos(ry), s0 = Math.sin(ry);
      const attacchi = [[-6, 25 - 3.5], [6, 25 - 3.5]].map(([dx, hy]) => [x + c0 * dx, y + hy, z - s0 * dx]);
      if (prec) for (let w = 0; w < 2; w++) {
        const a = prec[w], b = attacchi[w], m = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 4, (a[2] + b[2]) / 2];
        KE.cavo([a, m, b], 0.05, '#1a1a1a');
      }
      prec = attacchi;
    }
  }

  const fac = {};
  for (const t of ['cemento', 'mattoni', 'vetro', 'lamiera', 'pianoterra', 'rovina']) fac[t] = facciata(t);
  const tTetto = texTetto(), tOgg = texGenerica('#d8d8d8', 900, 2.5);
  const matFac = (t) => new THREE.MeshStandardMaterial({ vertexColors: true, ...fac[t], roughness: 1, metalness: t === 'vetro' ? 0.6 : t === 'lamiera' ? 0.5 : 0.05, envMap: MAT.v.envMap, envMapIntensity: t === 'vetro' ? 1.4 : 0.5 });
  const materiali = {
    cemento: matFac('cemento'), mattoni: matFac('mattoni'), vetro: matFac('vetro'), lamiera: matFac('lamiera'), pianoterra: matFac('pianoterra'), rovina: matFac('rovina'),
    tetto: new THREE.MeshStandardMaterial({ vertexColors: true, ...tTetto, roughness: 1 }),
    p: new THREE.MeshStandardMaterial({ vertexColors: true, ...tOgg, roughness: 0.85, metalness: 0.25, envMap: MAT.v.envMap, envMapIntensity: 0.5 }),
    e: MAT.e,
  };
  materiali.m = materiali.p; // i cavi del kit usano la chiave 'm'
  const geos = KE.fondi();
  for (const [k, g] of Object.entries(geos)) {
    if (!g || !materiali[k]) continue;
    if (k === 'p') {
      // gli oggetti d'arredo hanno UV per faccia: ripetizione più fitta
      const uvp = g.attributes.uv; for (let i = 0; i < uvp.count; i++) uvp.setXY(i, uvp.getX(i) * 0.5, uvp.getY(i) * 0.5);
    }
    const mesh = new THREE.Mesh(g, materiali[k]);
    mesh.castShadow = alta && k !== 'e';
    mesh.receiveShadow = alta;
    gruppo.add(mesh);
  }

  // ---- rocce ----
  const tRoccia = texGenerica('#bdbab4', 1600, 3);
  const matRoccia = new THREE.MeshStandardMaterial({ vertexColors: true, ...tRoccia, roughness: 0.95, flatShading: true });
  const varianti = [geoRoccia(1), geoRoccia(2), geoRoccia(3)].map((g) => new THREE.InstancedMesh(g, matRoccia, Math.ceil(mappa.rocce.length / 3) + 1));
  const nv = [0, 0, 0];
  mappa.rocce.forEach((r, i) => {
    const v = i % 3;
    q.setFromEuler(eul.set(0, r.rot * 2, (r.rot % 1) * 0.3));
    m4.compose(p.set(r.x, r.y - r.r * 0.15, r.z), q, s.set(r.r * 1.05, r.r * 1.15, r.r * 1.05));
    varianti[v].setMatrixAt(nv[v]++, m4);
  });
  varianti.forEach((im, v) => { im.count = nv[v]; im.castShadow = alta; im.receiveShadow = alta; gruppo.add(im); });
  // sassi piccoli sparsi
  const nSassi = alta ? 700 : media ? 400 : 150;
  const sassi = new THREE.InstancedMesh(geoRoccia(4, 1), matRoccia, nSassi);
  let ns = 0;
  for (let i = 0; i < nSassi * 3 && ns < nSassi; i++) {
    const x = (rng() - 0.5) * 1100, z = (rng() - 0.5) * 1100, h = mappa.altezza(x, z);
    if (h < 0.5 || mappa.solido(x, h + 0.5, z)) continue;
    const sc = 0.3 + rng() * 0.8;
    q.setFromEuler(eul.set(rng() * 3, rng() * 3, rng() * 3));
    m4.compose(p.set(x, h, z), q, s.set(sc, sc * 0.7, sc));
    sassi.setMatrixAt(ns++, m4);
  }
  sassi.count = ns;
  gruppo.add(sassi);

  // ---- alberi e cespugli ----
  const tFoglie = texGenerica('#d0d0d0', 2500, 3);
  const matPianta = new THREE.MeshStandardMaterial({ vertexColors: true, ...tFoglie, roughness: 0.9, flatShading: true });
  const quota = alta ? 1 : media ? 0.65 : 0.35;
  const nAlb = Math.floor(mappa.alberi.length * quota);
  const pini = new THREE.InstancedMesh(geoPino(), matPianta, nAlb), latif = new THREE.InstancedMesh(geoLatifoglia(), matPianta, nAlb);
  let np = 0, nl = 0;
  for (let i = 0; i < nAlb; i++) {
    const a = mappa.alberi[i];
    q.setFromEuler(eul.set((rng() - 0.5) * 0.08, rng() * 6.28, (rng() - 0.5) * 0.08));
    const sc = a.s * (0.85 + rng() * 0.35);
    m4.compose(p.set(a.x, a.y - 0.3, a.z), q, s.set(sc, sc * (0.9 + rng() * 0.3), sc));
    if (a.y > 22 || rng() < 0.45) pini.setMatrixAt(np++, m4); else latif.setMatrixAt(nl++, m4);
  }
  pini.count = np; latif.count = nl;
  for (const im of [pini, latif]) { im.castShadow = alta; im.receiveShadow = alta; gruppo.add(im); }
  const nCesp = Math.floor(900 * quota);
  const cesp = new THREE.InstancedMesh(geoCespuglio(), matPianta, nCesp);
  let nc = 0;
  for (let i = 0; i < nCesp * 4 && nc < nCesp; i++) {
    const x = (rng() - 0.5) * 1100, z = (rng() - 0.5) * 1100, h = mappa.altezza(x, z);
    if (h < 2.5 || h > 40 || mappa.solido(x, h + 1, z)) continue;
    const sc = 0.7 + rng() * 1.1;
    q.setFromEuler(eul.set(0, rng() * 6.28, 0));
    m4.compose(p.set(x, h - 0.2, z), q, s.set(sc, sc, sc));
    cesp.setMatrixAt(nc++, m4);
  }
  cesp.count = nc;
  gruppo.add(cesp);

  // ---- erba ----
  const nErba = alta ? 14000 : media ? 6000 : 0;
  if (nErba) {
    const erba = new THREE.InstancedMesh(geoErba(), new THREE.MeshStandardMaterial({ map: texErba(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xc8d8a8 }), nErba);
    let ne = 0;
    for (let i = 0; i < nErba * 3 && ne < nErba; i++) {
      const x = (rng() - 0.5) * 1100, z = (rng() - 0.5) * 1100, h = mappa.altezza(x, z);
      if (h < 2.6 || h > 36 || mappa.luoghi.some((l) => Math.hypot(x - l.x, z - l.z) < l.raggio * 1.05)) continue;
      const sc = 0.8 + rng() * 1.2;
      q.setFromEuler(eul.set(0, rng() * 6.28, 0));
      m4.compose(p.set(x, h - 0.05, z), q, s.set(sc, sc * (0.8 + rng() * 0.6), sc));
      erba.setMatrixAt(ne++, m4);
      erba.setColorAt(ne - 1, c.setRGB(0.8 + rng() * 0.3, 0.85 + rng() * 0.25, 0.7 + rng() * 0.2));
    }
    erba.count = ne;
    gruppo.add(erba);
  }

  // ---- cielo con sole, nuvole ----
  const dirSole = new THREE.Vector3(220, 340, 140).normalize();
  const cielo = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { alto: { value: new THREE.Color(0x2a66ad) }, orizzonte: { value: new THREE.Color(0xc4dbea) }, sole: { value: dirSole } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 alto; uniform vec3 orizzonte; uniform vec3 sole; varying vec3 vP; void main(){ float t = clamp(vP.y*1.6, 0.0, 1.0); vec3 c = mix(orizzonte, alto, pow(t, 0.7)); float d = max(dot(normalize(vP), sole), 0.0001); c += vec3(1.0,0.92,0.75) * (pow(d, 900.0) * 1.6 + pow(d, 12.0) * 0.18); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  cielo.renderOrder = -1;
  gruppo.add(cielo);
  const nuvole = new THREE.Group();
  const matNuv = new THREE.SpriteMaterial({ map: texNuvola(), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
  for (let i = 0; i < (alta ? 28 : 14); i++) {
    const sp = new THREE.Sprite(matNuv);
    const a = rng() * Math.PI * 2, r = 400 + rng() * 1200;
    sp.position.set(Math.cos(a) * r, 260 + rng() * 220, Math.sin(a) * r);
    sp.scale.set(260 + rng() * 260, 110 + rng() * 80, 1);
    nuvole.add(sp);
  }
  gruppo.add(nuvole);

  // ---- luci ----
  const emi = new THREE.HemisphereLight(0xd6ebff, 0x4d5a3c, 0.85);
  const sole = new THREE.DirectionalLight(0xfff1dc, 1.8);
  sole.position.copy(dirSole).multiplyScalar(400);
  if (alta) {
    sole.castShadow = true;
    sole.shadow.mapSize.set(2048, 2048);
    const sc = sole.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 1000;
    sole.shadow.bias = -0.0006;
    sole.shadow.normalBias = 0.4;
  }
  gruppo.add(emi, sole, sole.target);

  let t = 0;
  return {
    gruppo, sole, cielo,
    aggiorna(centro, dt = 0.016) {
      t += dt;
      cielo.position.set(centro.x, 0, centro.z);
      acqua.position.x = centro.x; acqua.position.z = centro.z;
      nAcqua.offset.set(centro.x / 6000 * 220 + t * 0.02, centro.z / 6000 * 220 + t * 0.013);
      nuvole.position.set(centro.x * 0.6 + t * 2, 0, centro.z * 0.6);
      if (sole.castShadow) {
        sole.position.set(centro.x + dirSole.x * 400, centro.y + dirSole.y * 400, centro.z + dirSole.z * 400);
        sole.target.position.copy(centro);
      }
    },
  };
}
