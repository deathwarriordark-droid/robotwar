// RobotWar — isola procedurale: dati uguali per tutti grazie al seme (la scena 3D è in scenario.js)
import { META, RIS, PASSO, LUOGHI, PESI_BOTTINO, PESI_RARITA, ARMI, ALTEZZA_MECH } from './config.js';
import { creaRng, clamp, lerp, smooth, scegliPesato, mescola } from './util.js';

function hash(ix, iz, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rumore(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm(x, z, s, ottave = 5) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < ottave; i++) {
    v += amp * rumore(x * f, z * f, s + i * 17);
    tot += amp; amp *= 0.5; f *= 2.03;
  }
  return v / tot;
}

const CELLA = 40;
const GN = Math.ceil((META * 2) / CELLA);

// ------------------------------------------------------------------
// Dati della mappa (puri, senza grafica): usati da simulazione e vista
// ------------------------------------------------------------------
export function generaMappa(seme) {
  const rnd = creaRng(seme);
  const N = RIS + 1;

  const grezza = (x, z) => {
    const d = Math.hypot(x, z) / META;
    const colline = fbm(x / 240, z / 240, seme);
    const monti = Math.pow(fbm(x / 420 + 50, z / 420 + 50, seme + 99, 4), 2.2);
    const h = (colline - 0.45) * 55 + monti * 95 + 6;
    const bordo = 1 - smooth(0.6, 0.97, d);
    return h * bordo + (bordo - 1) * 16;
  };

  // Luoghi abitati (città, basi) — appiattiti
  const nomi = mescola(LUOGHI, rnd);
  const luoghi = [];
  for (let i = 0; i < 5; i++) {
    for (let t = 0; t < 40; t++) {
      const ang = i * (Math.PI * 2 / 5) + rnd() * 0.9;
      const r = 160 + rnd() * 250;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const h = grezza(x, z);
      if (h > 4 && h < 38) { luoghi.push({ nome: nomi[i], x, z, raggio: 70 + rnd() * 30, h }); break; }
    }
  }
  luoghi.push({ nome: 'Nucleo Centrale', x: (rnd() - 0.5) * 60, z: (rnd() - 0.5) * 60, raggio: 60, h: Math.max(5, grezza(0, 0)) });

  const alt0 = (x, z) => {
    let h = grezza(x, z);
    for (const l of luoghi) {
      const d = Math.hypot(x - l.x, z - l.z);
      const w = 1 - smooth(l.raggio * 0.9, l.raggio * 1.5, d);
      if (w > 0) h = lerp(h, l.h, w);
    }
    return h;
  };

  const H = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++)
    for (let ix = 0; ix < N; ix++) H[iz * N + ix] = alt0(-META + ix * PASSO, -META + iz * PASSO);

  const altezza = (x, z) => {
    let gx = (x + META) / PASSO, gz = (z + META) / PASSO;
    gx = clamp(gx, 0, RIS - 0.0001); gz = clamp(gz, 0, RIS - 0.0001);
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * N + ix;
    return lerp(lerp(H[i], H[i + 1], fx), lerp(H[i + N], H[i + N + 1], fx), fz);
  };

  // Edifici (scatole allineate agli assi)
  const edifici = [];
  const aggiungiEdificio = (cx, cz, w, p, a, tono) => {
    const hmin = Math.min(altezza(cx - w / 2, cz - p / 2), altezza(cx + w / 2, cz - p / 2), altezza(cx - w / 2, cz + p / 2), altezza(cx + w / 2, cz + p / 2), altezza(cx, cz));
    edifici.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - p / 2, z1: cz + p / 2, y0: hmin - 2, y1: hmin + a, tono });
  };
  for (const l of luoghi) {
    for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
      if (rnd() < 0.42) continue;
      const cx = l.x + gx * 25 + (rnd() - 0.5) * 6, cz = l.z + gz * 25 + (rnd() - 0.5) * 6;
      const d = Math.hypot(cx - l.x, cz - l.z);
      if (d > l.raggio || d < 12) continue;
      const centrale = d < l.raggio * 0.45;
      aggiungiEdificio(cx, cz, 9 + rnd() * 11, 9 + rnd() * 11, 7 + rnd() * (centrale ? 30 : 15), Math.floor(rnd() * 6));
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900;
    const h = altezza(x, z);
    if (h < 3 || h > 40) continue;
    aggiungiEdificio(x, z, 6 + rnd() * 8, 6 + rnd() * 8, 4 + rnd() * 6, 6 + Math.floor(rnd() * 2));
  }

  const dentroLuogo = (x, z, m = 1) => luoghi.some((l) => Math.hypot(x - l.x, z - l.z) < l.raggio * m);

  // Rocce
  const rocce = [];
  for (let i = 0; i < 400 && rocce.length < 170; i++) {
    const x = (rnd() - 0.5) * 1080, z = (rnd() - 0.5) * 1080;
    const h = altezza(x, z);
    if (h < 1 || dentroLuogo(x, z, 1.2)) continue;
    const r = 1.5 + rnd() * 4;
    rocce.push({ x, z, r, y: h, y1: h + r * 1.2, rot: rnd() * 6 });
  }

  // Alberi (solo grafica)
  const alberi = [];
  for (let i = 0; i < 3000 && alberi.length < 1000; i++) {
    const x = (rnd() - 0.5) * 1100, z = (rnd() - 0.5) * 1100;
    const h = altezza(x, z);
    if (h < 2.5 || h > 48 || dentroLuogo(x, z, 1.1)) continue;
    if (rumore(x / 90, z / 90, seme + 5) < 0.45) continue;
    alberi.push({ x, z, y: h, s: 0.7 + rnd() * 0.8 });
  }

  // Griglia spaziale per le collisioni
  const ostacoli = [];
  for (const e of edifici) ostacoli.push({ tipo: 0, ...e });
  for (const r of rocce) ostacoli.push({ tipo: 1, x: r.x, z: r.z, r: r.r, y0: r.y - 2, y1: r.y1 });
  const griglia = Array.from({ length: GN * GN }, () => []);
  ostacoli.forEach((o, i) => {
    const x0 = o.tipo === 0 ? o.x0 : o.x - o.r, x1 = o.tipo === 0 ? o.x1 : o.x + o.r;
    const z0 = o.tipo === 0 ? o.z0 : o.z - o.r, z1 = o.tipo === 0 ? o.z1 : o.z + o.r;
    const cx0 = clamp(Math.floor((x0 - 4 + META) / CELLA), 0, GN - 1), cx1 = clamp(Math.floor((x1 + 4 + META) / CELLA), 0, GN - 1);
    const cz0 = clamp(Math.floor((z0 - 4 + META) / CELLA), 0, GN - 1), cz1 = clamp(Math.floor((z1 + 4 + META) / CELLA), 0, GN - 1);
    for (let a = cx0; a <= cx1; a++) for (let b = cz0; b <= cz1; b++) griglia[b * GN + a].push(i);
  });
  const cella = (x, z) => {
    const a = clamp(Math.floor((x + META) / CELLA), 0, GN - 1), b = clamp(Math.floor((z + META) / CELLA), 0, GN - 1);
    return griglia[b * GN + a];
  };

  const altezzaSuolo = (x, z, y) => {
    let h = altezza(x, z);
    for (const i of cella(x, z)) {
      const o = ostacoli[i];
      if (y < o.y1 - 1.6) continue;
      if (o.tipo === 0) { if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && o.y1 > h) h = o.y1; }
      else if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r * 0.8) ** 2 && o.y1 > h) h = o.y1;
    }
    return h;
  };

  // Spinge fuori un cerchio (mech) dagli ostacoli
  const collidi = (m, r) => {
    for (const i of cella(m.x, m.z)) {
      const o = ostacoli[i];
      if (m.y >= o.y1 - 1.0 || m.y + ALTEZZA_MECH < o.y0) continue;
      if (o.tipo === 0) {
        const px = clamp(m.x, o.x0, o.x1), pz = clamp(m.z, o.z0, o.z1);
        const dx = m.x - px, dz = m.z - pz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          m.x += dx * k; m.z += dz * k;
          const nx = dx / d, nz = dz / d, vn = m.vx * nx + m.vz * nz;
          if (vn < 0) { m.vx -= vn * nx; m.vz -= vn * nz; }
        } else {
          const pen = [m.x - o.x0, o.x1 - m.x, m.z - o.z0, o.z1 - m.z];
          const k = pen.indexOf(Math.min(...pen));
          if (k === 0) m.x = o.x0 - r; else if (k === 1) m.x = o.x1 + r; else if (k === 2) m.z = o.z0 - r; else m.z = o.z1 + r;
        }
      } else {
        const dx = m.x - o.x, dz = m.z - o.z, d2 = dx * dx + dz * dz, rr = r + o.r * 0.85;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), k = (rr - d) / d;
        m.x += dx * k; m.z += dz * k;
      }
    }
  };

  const solido = (x, y, z) => {
    if (y < altezza(x, z)) return true;
    for (const i of cella(x, z)) {
      const o = ostacoli[i];
      if (y > o.y1 || y < o.y0) continue;
      if (o.tipo === 0) { if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1) return true; }
      else if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return true;
    }
    return false;
  };

  // Distanza dal primo ostacolo lungo un raggio (direzione normalizzata)
  const lanciaRaggio = (ox, oy, oz, dx, dy, dz, max) => {
    let best = max;
    for (const o of ostacoli) {
      if (o.tipo === 0) {
        let tmin = 0, tmax = best;
        const assi = [[ox, dx, o.x0, o.x1], [oy, dy, o.y0, o.y1], [oz, dz, o.z0, o.z1]];
        let ok = true;
        for (const [p, d, a, b] of assi) {
          if (Math.abs(d) < 1e-8) { if (p < a || p > b) { ok = false; break; } continue; }
          let t1 = (a - p) / d, t2 = (b - p) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
        if (ok && tmin < best) best = tmin;
      } else {
        const cy = (o.y0 + o.y1) / 2, rr = o.r;
        const lx = o.x - ox, ly = cy - oy, lz = o.z - oz;
        const t = lx * dx + ly * dy + lz * dz;
        if (t < 0 || t > best) continue;
        const d2 = lx * lx + ly * ly + lz * lz - t * t;
        if (d2 < rr * rr) { const th = t - Math.sqrt(rr * rr - d2); if (th > 0 && th < best) best = th; }
      }
    }
    // terreno: marcia + bisezione
    const passo = 2.5;
    let prec = 0;
    for (let t = passo; t <= best; t += passo) {
      if (oy + dy * t < altezza(ox + dx * t, oz + dz * t)) {
        let a = prec, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m < altezza(ox + dx * m, oz + dz * m)) b = m; else a = m;
        }
        return b;
      }
      prec = t;
    }
    return best;
  };

  const puntoTerra = (r, cx = 0, cz = 0, raggio = 520, minH = 1.5) => {
    for (let t = 0; t < 80; t++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * raggio;
      const x = clamp(cx + Math.cos(a) * d, -META + 20, META - 20), z = clamp(cz + Math.sin(a) * d, -META + 20, META - 20);
      if (altezza(x, z) > minH && !solido(x, altezza(x, z) + 2, z)) return [x, z];
    }
    return [cx, cz];
  };

  // Bottino iniziale
  const rb = creaRng(seme + 7);
  const bottino = [];
  let idB = 1;
  const nuovoOggetto = (x, z) => {
    const c = scegliPesato(PESI_BOTTINO, rb);
    let r = c === 'rottami' ? 0 : Number(scegliPesato(PESI_RARITA, rb));
    if (ARMI[c]?.minRar) r = Math.max(r, ARMI[c].minRar);
    bottino.push({ id: idB++, x, y: altezza(x, z), z, c, r });
  };
  for (const l of luoghi) {
    for (let i = 0; i < 46; i++) {
      const a = rb() * Math.PI * 2, d = Math.sqrt(rb()) * l.raggio * 1.15;
      const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d;
      if (solido(x, altezza(x, z) + 1.5, z)) continue;
      nuovoOggetto(x, z);
    }
  }
  for (let i = 0; i < 90; i++) { const [x, z] = puntoTerra(rb); nuovoOggetto(x, z); }

  // Nuclei per i droni fantasma
  const nuclei = [];
  for (let i = 0; i < 70; i++) { const [x, z] = puntoTerra(rb); nuclei.push({ id: i + 1, x, y: altezza(x, z) + 3, z }); }

  return { seme, H, N, altezza, altezzaSuolo, collidi, solido, lanciaRaggio, puntoTerra, luoghi, edifici, rocce, alberi, bottino, nuclei };
}

// ------------------------------------------------------------------
// Colori del terreno (usati anche dalla minimappa)
// ------------------------------------------------------------------
export function coloreTerreno(mappa, x, z, h, pendenza) {
  if (h < -0.5) return [0.55 - (-h) * 0.01, 0.5 - (-h) * 0.01, 0.38];
  if (h < 2.2) return [0.78, 0.72, 0.52];
  for (const l of mappa.luoghi) if (Math.hypot(x - l.x, z - l.z) < l.raggio * 1.05) return [0.36, 0.37, 0.38];
  if (pendenza > 0.9 || h > 52) return [0.47, 0.45, 0.43];
  const v = rumore(x / 30, z / 30, 3) * 0.12;
  if (h > 38) return [0.42 + v, 0.48 + v, 0.33];
  return [0.27 + v, 0.47 + v, 0.22 + v * 0.5];
}
