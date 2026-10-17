// RobotWar — armi, proiettili, calore/Overdrive e danni (lato host, autoritativo)
import { ARMI, OGGETTI, RARITA, ALTEZZA_MECH, CALORE, DRONE } from './config.js';
import { clamp, r2 } from './util.js';

const PUGNI = { c: 'pugni', r: 0 };
const TORRETTA = { c: 'mitra', r: 0 };

export const vivoColpibile = (m) => m.stato === 'vivo' || m.stato === 'drone';

export function bocca(m, i) {
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw), rx = -fz, rz = fx;
  const lato = i === 0 || i === 2 ? -1 : 1;
  if (i === 9) return [m.x - fx * 0.4, m.y + 8.7, m.z - fz * 0.4]; // torretta artigliere
  const lat = (i < 2 ? m.raggio * 0.62 + 0.75 : m.raggio * 0.34) * lato;
  const h = i < 2 ? 4.6 : 7.9;
  const av = i < 2 ? 4.0 : 0.6;
  return [m.x + rx * lat + fx * av, m.y + h, m.z + rz * lat + fz * av];
}

function direzione(m, o, mira) {
  let dx = mira[0] - o[0], dy = mira[1] - o[1], dz = mira[2] - o[2];
  let l = Math.hypot(dx, dy, dz);
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
  if (l < 5 || (dx * fx + dz * fz) / (l || 1) < 0.25) {
    const cp = Math.cos(m.ap);
    dx = fx * cp; dy = Math.sin(m.ap); dz = fz * cp; l = 1;
  }
  return [dx / l, dy / l, dz / l];
}

function disperdi(d, disp, rnd) {
  const x = d[0] + (rnd() - 0.5) * 2 * disp, y = d[1] + (rnd() - 0.5) * 2 * disp, z = d[2] + (rnd() - 0.5) * 2 * disp;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

const nemici = (a, b) => b !== a && b.squadra !== a.squadra;

export function aggiornaArmi(sim, dt) {
  for (const m of sim.mech) {
    for (const o of m.slot) {
      if (!o) continue;
      if (o.cd > 0) o.cd -= dt;
      if (o.ric > 0) { o.ric -= dt; if (o.ric <= 0) { o.ric = 0; o.m = ARMI[o.c]?.carica || 0; } }
    }
    m.pugniCd[0] -= dt; m.pugniCd[1] -= dt; m.torrettaCd -= dt;
    const inp = m.input;
    if (m.stato === 'drone') { if (inp.f1 && m.empCd <= 0) emp(sim, m); continue; }
    if (m.stato === 'imbarcato') { if (inp.f1) sparaArtigliere(sim, m); continue; }
    if (m.stato !== 'vivo' || m.surr > 0) continue;
    if (inp.f1) { sparaSlot(sim, m, 0); sparaSlot(sim, m, 1); }
    if (inp.f2 && !m.artigliere) { sparaSlot(sim, m, 2); sparaSlot(sim, m, 3); }
  }
}

function sparaSlot(sim, m, i) {
  if (m.surr > 0) return;
  if (i === 0 && m.hp.bs <= 0) return;
  if (i === 1 && m.hp.bd <= 0) return;
  const o = m.slot[i];
  if (!o) {
    if (i > 1 || m.pugniCd[i] > 0) return;
    m.pugniCd[i] = ARMI.pugni.cad;
    m.pugniCd[1 - i] = Math.max(m.pugniCd[1 - i], ARMI.pugni.cad / 2);
    spara(sim, m, i, PUGNI, m, m.input.mira);
    return;
  }
  const def = ARMI[o.c];
  if (!def || o.cd > 0 || o.ric > 0) return;
  if (def.carica && o.m <= 0) { o.ric = def.ricarica; return; }
  o.cd = def.cad;
  if (def.carica) { o.m--; if (o.m <= 0) o.ric = def.ricarica; }
  spara(sim, m, i, o, m, m.input.mira);
}

function sparaArtigliere(sim, g) {
  const c = sim.perId.get(g.imbarcatoSu);
  if (!c || c.stato !== 'vivo' || c.surr > 0) return;
  let sparato = false;
  for (const i of [2, 3]) {
    const o = c.slot[i];
    if (!o) continue;
    const def = ARMI[o.c];
    if (o.cd > 0 || o.ric > 0) continue;
    if (o.m <= 0) { o.ric = def.ricarica; continue; }
    o.cd = def.cad; o.m--; if (o.m <= 0) o.ric = def.ricarica;
    spara(sim, c, i, o, g, g.input.mira, g);
    sparato = true;
  }
  if (!sparato && !c.slot[2] && !c.slot[3] && g.torrettaCd <= 0) {
    g.torrettaCd = 0.13;
    spara(sim, c, 9, TORRETTA, g, g.input.mira, g);
  }
}

// m = mech che porta l'arma, att = chi riceve il merito (artigliere o pilota)
function spara(sim, m, i, o, att, mira, artigliere = null) {
  const def = ARMI[o.c];
  const od = (artigliere || m).od > 0 ? 2 : 1;
  const danno = def.danno * RARITA[o.r || 0].molt * od;
  const org = bocca(m, i);
  const dir = direzione(artigliere ? { ...m, yaw: artigliere.yaw, ap: artigliere.ap } : m, org, mira);
  const testaOttica = m.slot[5]?.c === 'ottica';

  switch (def.tipo) {
    case 'proiettile': {
      const n = def.pallini || 1;
      for (let k = 0; k < n; k++) {
        const d = disperdi(dir, def.disp || 0, sim.rnd);
        nuovoProiettile(sim, { da: att.id, sq: att.squadra, c: o.c, r: o.r, x: org[0], y: org[1], z: org[2], vx: d[0] * def.vel, vy: d[1] * def.vel, vz: d[2] * def.vel, g: def.grav || 0, danno, esp: def.esplosione || 0, vita: def.vita, s: i });
      }
      break;
    }
    case 'missile': {
      const bers = cercaBersaglio(sim, att, org, dir);
      for (let k = 0; k < def.salva; k++) {
        const d = disperdi([dir[0], dir[1] + 0.25, dir[2]], 0.12, sim.rnd);
        nuovoProiettile(sim, { da: att.id, sq: att.squadra, c: o.c, r: o.r, x: org[0], y: org[1] + k * 0.4, z: org[2], vx: d[0] * def.vel, vy: d[1] * def.vel, vz: d[2] * def.vel, g: 0, danno, esp: def.esplosione, vita: def.vita, bers: bers ? bers.id : 0, vel: def.vel, s: i });
      }
      break;
    }
    case 'mortaio': {
      const tx = mira[0], ty = mira[1], tz = mira[2];
      const dist = Math.hypot(tx - org[0], tz - org[2]);
      const T = clamp(dist / 70, 1.2, 3.6), g = 25;
      const vx = (tx - org[0]) / T, vz = (tz - org[2]) / T, vy = (ty - org[1] + 0.5 * g * T * T) / T;
      nuovoProiettile(sim, { da: att.id, sq: att.squadra, c: o.c, r: o.r, x: org[0], y: org[1], z: org[2], vx, vy, vz, g, danno, esp: def.esplosione, vita: def.vita, s: i });
      break;
    }
    case 'raggio': {
      const max = def.gittata * (testaOttica ? 1.2 : 1);
      const dMondo = sim.mappa.lanciaRaggio(org[0], org[1], org[2], dir[0], dir[1], dir[2], max);
      const colpiti = [];
      for (const b of sim.mech) {
        if (!vivoColpibile(b) || !nemici(att, b)) continue;
        const cy = b.stato === 'drone' ? b.y : b.y + ALTEZZA_MECH / 2;
        const lx = b.x - org[0], ly = cy - org[1], lz = b.z - org[2];
        const t = lx * dir[0] + ly * dir[1] + lz * dir[2];
        if (t < 0 || t > dMondo) continue;
        const px = org[0] + dir[0] * t, py = org[1] + dir[1] * t, pz = org[2] + dir[2] * t;
        const rr = b.stato === 'drone' ? 2.2 : b.raggio + 0.3;
        if ((px - b.x) ** 2 + (pz - b.z) ** 2 > rr * rr) continue;
        const ymin = b.stato === 'drone' ? b.y - 1.8 : b.y, ymax = b.stato === 'drone' ? b.y + 1.8 : b.y + ALTEZZA_MECH;
        if (py < ymin || py > ymax) continue;
        colpiti.push({ b, t, p: [px, py, pz] });
      }
      colpiti.sort((a, b) => a.t - b.t);
      const lista = def.perfora ? colpiti : colpiti.slice(0, 1);
      for (const h of lista) applicaDanno(sim, h.b, danno, att, h.p, o.c);
      const fine = def.perfora || !lista.length ? dMondo : lista[0].t;
      sim.ev({ k: 'r', id: m.id, s: i, c: o.c, r: o.r, x1: r2(org[0]), y1: r2(org[1]), z1: r2(org[2]), x2: r2(org[0] + dir[0] * fine), y2: r2(org[1] + dir[1] * fine), z2: r2(org[2] + dir[2] * fine) });
      break;
    }
    case 'cono': {
      for (const b of sim.mech) {
        if (!vivoColpibile(b) || !nemici(att, b)) continue;
        const cy = b.stato === 'drone' ? b.y : b.y + 3.6;
        const lx = b.x - org[0], ly = cy - org[1], lz = b.z - org[2];
        const d = Math.hypot(lx, ly, lz);
        if (d > def.gittata + b.raggio) continue;
        const cos = (lx * dir[0] + ly * dir[1] + lz * dir[2]) / (d || 1);
        if (cos < Math.cos(def.cono) && d > b.raggio + 1) continue;
        if (sim.mappa.lanciaRaggio(org[0], org[1], org[2], lx / d, ly / d, lz / d, d) < d - b.raggio - 1) continue;
        applicaDanno(sim, b, danno, att, [b.x, cy, b.z], o.c);
      }
      if (sim.tempo - (m.ultimaFiamma || 0) > 0.1) {
        m.ultimaFiamma = sim.tempo;
        sim.ev({ k: 'f', id: m.id, s: i, x: r2(org[0]), y: r2(org[1]), z: r2(org[2]), dx: r2(dir[0]), dy: r2(dir[1]), dz: r2(dir[2]) });
      }
      break;
    }
    case 'mischia': {
      let colpito = false;
      for (const b of sim.mech) {
        if (!vivoColpibile(b) || !nemici(att, b)) continue;
        const lx = b.x - m.x, lz = b.z - m.z, d = Math.hypot(lx, lz);
        if (d > def.gittata + b.raggio + m.raggio || Math.abs(b.y - m.y) > 8) continue;
        const cos = (lx * Math.sin(m.yaw) + lz * Math.cos(m.yaw)) / (d || 1);
        if (cos < 0.45) continue;
        applicaDanno(sim, b, danno, att, [b.x, b.y + 4.5, b.z], o.c);
        if (b.stato === 'vivo') { b.vx += (lx / (d || 1)) * (o.c === 'lama' ? 14 : 10); b.vz += (lz / (d || 1)) * (o.c === 'lama' ? 14 : 10); b.vy += 4; }
        colpito = true;
      }
      sim.ev({ k: 'mi', id: m.id, s: i, c: o.c, h: colpito ? 1 : 0 });
      break;
    }
  }

  // calore (con artigliere a bordo scalda il mech che porta le armi)
  const chi = m;
  chi.calore += def.calore;
  chi.ultimoSparo = sim.tempo;
  if (chi.calore >= 100) {
    chi.calore = 100;
    chi.surr = chi.od > 0 ? CALORE.bloccoOD : CALORE.blocco;
    chi.od = 0;
    sim.ev({ k: 'surr', id: chi.id });
  }
}

function cercaBersaglio(sim, att, org, dir) {
  let best = null, bestS = 0.35;
  for (const b of sim.mech) {
    if (b.stato !== 'vivo' || !nemici(att, b)) continue;
    const lx = b.x - org[0], ly = b.y + 3.6 - org[1], lz = b.z - org[2];
    const d = Math.hypot(lx, ly, lz);
    if (d > 320) continue;
    const ang = Math.acos(clamp((lx * dir[0] + ly * dir[1] + lz * dir[2]) / d, -1, 1));
    if (ang < bestS) { bestS = ang; best = b; }
  }
  return best;
}

function nuovoProiettile(sim, p) {
  p.id = sim.prossimoId++;
  sim.proiettili.push(p);
  sim.ev({ k: 'p', id: p.id, da: p.da, c: p.c, r: p.r, s: p.s, x: r2(p.x), y: r2(p.y), z: r2(p.z), vx: r2(p.vx), vy: r2(p.vy), vz: r2(p.vz), g: p.g, h: p.bers !== undefined ? 1 : 0 });
}

// Primo impatto lungo un segmento: mech nemici, poi mondo
export function colpisciSegmento(sim, x0, y0, z0, x1, y1, z1, sq) {
  let best = null, bestT = 1;
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
  for (const m of sim.mech) {
    if (!vivoColpibile(m) || m.squadra === sq) continue;
    let t = l2 > 0 ? ((m.x - x0) * dx + (m.z - z0) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const px = x0 + dx * t, pz = z0 + dz * t;
    const rr = m.stato === 'drone' ? 2.2 : m.raggio;
    if ((px - m.x) ** 2 + (pz - m.z) ** 2 > rr * rr) continue;
    const py = y0 + (y1 - y0) * t;
    const ymin = m.stato === 'drone' ? m.y - 1.8 : m.y, ymax = m.stato === 'drone' ? m.y + 1.8 : m.y + ALTEZZA_MECH;
    if (py < ymin || py > ymax) continue;
    if (t < bestT) { bestT = t; best = m; }
  }
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const passi = Math.max(1, Math.ceil((len * bestT) / 2));
  for (let s = 1; s <= passi; s++) {
    const t = (bestT * s) / passi;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
    if (sim.mappa.solido(x, y, z)) return { t, p: [x, y, z], mech: null };
  }
  if (best) return { t: bestT, p: [x0 + (x1 - x0) * bestT, y0 + (y1 - y0) * bestT, z0 + (z1 - z0) * bestT], mech: best };
  return null;
}

export function aggiornaProiettili(sim, dt) {
  const vivi = [];
  for (const p of sim.proiettili) {
    p.vita -= dt;
    if (p.vita <= 0) {
      if (p.esp) esplosione(sim, p.x, p.y, p.z, p.esp, p.danno, sim.perId.get(p.da), p.c);
      sim.ev({ k: 'imp', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), m: 0, e: p.esp ? 1 : 0, c: p.c });
      continue;
    }
    if (p.bers) {
      const t = sim.perId.get(p.bers);
      if (t && t.stato === 'vivo') {
        const lx = t.x - p.x, ly = t.y + 3.6 - p.y, lz = t.z - p.z, l = Math.hypot(lx, ly, lz) || 1;
        const v = Math.hypot(p.vx, p.vy, p.vz) || 1, k = Math.min(1, dt * 2.8);
        let nx = p.vx / v + (lx / l - p.vx / v) * k, ny = p.vy / v + (ly / l - p.vy / v) * k, nz = p.vz / v + (lz / l - p.vz / v) * k;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const vel = Math.min(p.vel * 1.6, v + 60 * dt);
        p.vx = (nx / nl) * vel; p.vy = (ny / nl) * vel; p.vz = (nz / nl) * vel;
      }
    }
    p.vy -= p.g * dt;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
    const h = colpisciSegmento(sim, p.x, p.y, p.z, nx, ny, nz, p.sq);
    if (h) {
      const att = sim.perId.get(p.da);
      if (p.esp) esplosione(sim, h.p[0], h.p[1], h.p[2], p.esp, p.danno, att, p.c, h.mech);
      else if (h.mech) applicaDanno(sim, h.mech, p.danno, att, h.p, p.c);
      sim.ev({ k: 'imp', id: p.id, x: r2(h.p[0]), y: r2(h.p[1]), z: r2(h.p[2]), m: h.mech ? 1 : 0, e: p.esp ? 1 : 0, c: p.c });
      continue;
    }
    p.x = nx; p.y = ny; p.z = nz;
    if (Math.abs(p.x) > 900 || Math.abs(p.z) > 900 || p.y < -30) continue;
    vivi.push(p);
  }
  sim.proiettili = vivi;
}

export function esplosione(sim, x, y, z, raggio, danno, att, c, diretto = null) {
  for (const b of sim.mech) {
    if (!vivoColpibile(b)) continue;
    if (att && (b === att || b.squadra === att.squadra)) continue;
    const cy = b.stato === 'drone' ? b.y : b.y + 3.6;
    const d = Math.max(0, Math.hypot(b.x - x, cy - y, b.z - z) - (b.stato === 'drone' ? 1.5 : b.raggio));
    if (d > raggio && b !== diretto) continue;
    const k = b === diretto ? 1 : 1 - 0.6 * (d / raggio);
    applicaDanno(sim, b, danno * k, att, b === diretto ? [x, y, z] : null, c);
  }
  sim.ev({ k: 'esp', x: r2(x), y: r2(y), z: r2(z), r: raggio, c });
}

export function applicaDanno(sim, b, danno, att, punto, c) {
  if (b.stato !== 'vivo' && b.stato !== 'drone') return;
  if (att && att !== b && att.squadra === b.squadra) return;
  if (danno <= 0) return;
  const px = punto ? punto[0] : b.x, py = punto ? punto[1] : b.y + 4, pz = punto ? punto[2] : b.z;
  if (b.stato === 'drone') {
    b.droneHp -= danno;
    sim.ev({ k: 'dan', a: att ? att.id : 0, b: b.id, d: Math.round(danno), x: r2(px), y: r2(py), z: r2(pz) });
    if (b.droneHp <= 0) sim.eliminaDrone(b, att);
    return;
  }
  if (b.slot[4]?.c === 'cingoli') danno *= 1 - OGGETTI.cingoli.riduzione;
  let resto = danno;
  if (b.scudo > 0) { const a = Math.min(b.scudo, resto); b.scudo -= a; resto -= a; }
  b.ultimoDanno = sim.tempo;
  if (att && att !== b) { b.ultimoColpitore = att.id; att.danni += danno; }
  let parte = 't';
  if (punto && resto > 0) {
    const rx = -Math.cos(b.yaw), rz = Math.sin(b.yaw);
    const lat = (punto[0] - b.x) * rx + (punto[2] - b.z) * rz;
    const h = punto[1] - b.y;
    if (h < 3.6) parte = 'g';
    else if (Math.abs(lat) > b.raggio * 0.68 && h < 7.0) parte = lat > 0 ? 'bd' : 'bs';
  }
  if (resto > 0) {
    if (parte === 't') b.hp.t -= resto;
    else {
      const prima = b.hp[parte];
      b.hp[parte] = Math.max(0, prima - resto);
      b.hp.t -= resto * (prima > 0 ? 0.35 : 0.8);
      if (prima > 0 && b.hp[parte] <= 0) sim.artoDistrutto(b, parte);
    }
  }
  sim.ev({ k: 'dan', a: att ? att.id : 0, b: b.id, d: Math.round(danno), x: r2(px), y: r2(py), z: r2(pz), p: parte, s: resto < danno ? 1 : 0 });
  if (b.hp.t <= 0) sim.elimina(b, att, c);
}

export function emp(sim, m) {
  m.empCd = DRONE.empCd;
  sim.ev({ k: 'emp', id: m.id, x: r2(m.x), y: r2(m.y), z: r2(m.z) });
  for (const b of sim.mech) {
    if (b.stato !== 'vivo' || b.squadra === m.squadra) continue;
    if (Math.hypot(b.x - m.x, b.z - m.z) > DRONE.empRaggio) continue;
    b.disturbato = DRONE.empDurata;
    b.scudo = 0;
    sim.ev({ k: 'dist', id: b.id, da: m.id });
  }
}
