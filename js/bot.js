// RobotWar — intelligenza dei bot: generano gli stessi input di un giocatore
import { ARMI, OGGETTI, DIFFICOLTA, SLOT, PORTATA_RACCOLTA } from './config.js';
import { angDiff, clamp } from './util.js';

const GITTATA_BOT = { pugni: 7, lama: 8, fiamma: 18, dispersione: 40, mitra: 170, cannone: 200, laser: 200, railgun: 420 };
const DIST_PREF = { pugni: 4, lama: 4, fiamma: 12, dispersione: 22, mitra: 60, cannone: 80, laser: 70, railgun: 140 };

export function creaStatoBot(rnd) {
  return { pensa: rnd() * 0.5, nemico: null, meta: null, metaTipo: null, strafe: rnd() < 0.5 ? -1 : 1, strafeT: 0, ultimaPos: null, controlloT: 2, bloccato: 0, errore: [0, 0, 0], erroreT: 0 };
}

function armaPrincipale(m) {
  let best = 'pugni', bv = 0;
  for (const i of [0, 1]) {
    const o = m.slot[i];
    if (!o) continue;
    const v = (ARMI[o.c]?.danno || 0) * (1 + o.r);
    if (v > bv) { bv = v; best = o.c; }
  }
  return best;
}

function utile(m, b) {
  const def = OGGETTI[b.c];
  if (!def) return false;
  if (def.cat === 'rottami') return m.hp.t < m.max.t * 0.8 || m.hp.bs <= 0 || m.hp.bd <= 0;
  const cand = [];
  SLOT.forEach((s, i) => { if (i < 7 && s.cat === def.cat) cand.push(i); });
  if (cand.some((i) => !m.slot[i])) return true;
  return cand.some((i) => m.slot[i].r < b.r);
}

function slotPeggiore(m, c) {
  const def = OGGETTI[c];
  let best = -1, br = 9;
  SLOT.forEach((s, i) => {
    if (i >= 7 || s.cat !== def.cat) return;
    const r = m.slot[i] ? m.slot[i].r : -1;
    if (r < br) { br = r; best = i; }
  });
  return best;
}

function decidi(sim, m, b, d) {
  const z = sim.zona;
  // nemico più vicino visibile
  let nem = null, nd = d.vista;
  for (const o of sim.mech) {
    if (o.stato !== 'vivo' || o.squadra === m.squadra) continue;
    const dist = Math.hypot(o.x - m.x, o.z - m.z);
    const prefer = o.id === m.ultimoColpitore && sim.tempo - m.ultimoDanno < 4 ? 0.6 : 1;
    if (dist * prefer >= nd) continue;
    const ox = m.x, oy = m.y + 6, oz = m.z, tx = o.x - ox, ty = o.y + 4 - oy, tz = o.z - oz, l = Math.hypot(tx, ty, tz);
    if (sim.mappa.lanciaRaggio(ox, oy, oz, tx / l, ty / l, tz / l, l) < l - o.raggio - 2) continue;
    nd = dist * prefer; nem = o;
  }
  b.nemico = nem ? nem.id : null;

  // zona prima di tutto
  const dz = Math.hypot(m.x - z.cx, m.z - z.cz);
  const dzt = Math.hypot(m.x - z.tcx, m.z - z.tcz);
  if (dz > z.r - 12 || (z.stato === 'chiusura' && dzt > z.tr) || (z.stato === 'attesa' && z.t < 25 && dzt > z.tr)) {
    b.meta = [z.tcx + (sim.rnd() - 0.5) * z.tr * 0.6, z.tcz + (sim.rnd() - 0.5) * z.tr * 0.6];
    b.metaTipo = 'zona';
    if (dz > z.r) b.nemico = null;
    return;
  }
  if (b.metaTipo === 'zona' && b.meta && Math.hypot(b.meta[0] - m.x, b.meta[1] - m.z) > 15) return;

  // bottino utile vicino
  if (!nem || armaPrincipale(m) === 'pugni') {
    let best = null, bd = nem ? 60 : 180;
    for (const l of sim.bottino.values()) {
      const dist = Math.hypot(l.x - m.x, l.z - m.z);
      if (dist < bd && utile(m, l)) { bd = dist; best = l; }
    }
    if (best) { b.meta = [best.x, best.z]; b.metaTipo = 'bottino'; b.bottino = best.id; return; }
  }
  if (!b.meta || b.metaTipo !== 'giro' || Math.hypot(b.meta[0] - m.x, b.meta[1] - m.z) < 12) {
    const p = sim.mappa.puntoTerra(sim.rnd, z.tcx, z.tcz, Math.max(30, z.tr * 0.8));
    b.meta = p; b.metaTipo = 'giro';
  }
}

export function pensaBot(sim, m, dt) {
  const b = m.bot;
  const d = DIFFICOLTA[sim.opz.difficolta] || DIFFICOLTA.normale;
  const inp = { seq: 0, mx: 0, mz: 0, yaw: m.yaw, mira: [m.x + Math.sin(m.yaw) * 50, m.y + 5, m.z + Math.cos(m.yaw) * 50], f1: false, f2: false, boost: false, tieniE: false, a: [] };

  if (m.stato === 'lancio') {
    if (!b.meta) decidi(sim, m, b, d);
    if (b.meta) { inp.yaw = Math.atan2(b.meta[0] - m.x, b.meta[1] - m.z); inp.mz = Math.hypot(b.meta[0] - m.x, b.meta[1] - m.z) > 10 ? 1 : 0; }
    return inp;
  }
  if (m.stato !== 'vivo') return inp;

  b.pensa -= dt;
  if (b.pensa <= 0) { b.pensa = d.reazione * (0.7 + sim.rnd() * 0.6); decidi(sim, m, b, d); }

  // anti-blocco
  b.controlloT -= dt;
  if (b.controlloT <= 0) {
    b.controlloT = 1.5;
    if (b.ultimaPos && Math.hypot(m.x - b.ultimaPos[0], m.z - b.ultimaPos[1]) < 1.5 && b.meta) { b.bloccato = 1; b.strafe *= -1; }
    b.ultimaPos = [m.x, m.z];
  }

  const nem = b.nemico ? sim.perId.get(b.nemico) : null;
  const turn = (target) => {
    const diff = angDiff(m.yaw, target);
    const max = 3.2 * dt;
    return m.yaw + clamp(diff, -max, max);
  };

  if (nem && nem.stato === 'vivo' && b.metaTipo !== 'zona') {
    const dx = nem.x - m.x, dz = nem.z - m.z, dist = Math.hypot(dx, dz);
    inp.yaw = turn(Math.atan2(dx, dz));
    const arma = armaPrincipale(m);
    const pref = DIST_PREF[arma] * (1.2 - d.aggr * 0.4);
    inp.mz = dist > pref * 1.25 ? 1 : dist < pref * 0.7 ? -0.8 : 0;
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = 1.2 + sim.rnd() * 2; if (sim.rnd() < 0.6) b.strafe *= -1; }
    inp.mx = b.strafe * (arma === 'pugni' || arma === 'lama' ? 0.3 : 0.85);
    // mira con errore
    b.erroreT -= dt;
    if (b.erroreT <= 0) {
      b.erroreT = 0.4;
      const e = d.errore * dist;
      b.errore = [(sim.rnd() - 0.5) * 2 * e, (sim.rnd() - 0.5) * e, (sim.rnd() - 0.5) * 2 * e];
    }
    const lead = Math.min(dist / 200, 1);
    inp.mira = [nem.x + nem.vx * lead + b.errore[0], nem.y + 3.8 + b.errore[1], nem.z + nem.vz * lead + b.errore[2]];
    const allineato = Math.abs(angDiff(m.yaw, Math.atan2(dx, dz))) < 0.3;
    if (allineato && dist < (GITTATA_BOT[arma] || 100)) inp.f1 = true;
    if (allineato && (m.slot[2] || m.slot[3]) && dist < 260 && dist > 15) inp.f2 = true;
    if (m.calore >= 82 && m.od <= 0) inp.a.push('X');
    if (m.calore > 92 && d.aggr < 0.8) { inp.f1 = false; inp.f2 = false; }
    if (sim.tempo - m.ultimoDanno < 0.5 && sim.rnd() < 0.04 * d.aggr) inp.boost = true;
    if (m.slot[6]?.c === 'jetpack' && sim.rnd() < 0.01) b.jetT = 0.8;
  } else if (b.meta) {
    const dx = b.meta[0] - m.x, dz = b.meta[1] - m.z, dist = Math.hypot(dx, dz);
    const target = Math.atan2(dx, dz);
    inp.yaw = turn(target);
    inp.mz = Math.abs(angDiff(m.yaw, target)) < 1 ? 1 : 0.35;
    inp.mira = [m.x + Math.sin(m.yaw) * 40, m.y + 5, m.z + Math.cos(m.yaw) * 40];
    if (b.metaTipo === 'bottino') {
      const l = sim.bottino.get(b.bottino);
      if (!l) { b.meta = null; b.pensa = 0; }
      else if (dist < PORTATA_RACCOLTA - 1.5) {
        const s = slotPeggiore(m, l.c);
        if (s >= 0 && s < 4) inp.a.push('s' + s);
        inp.a.push('E');
        b.meta = null; b.pensa = 0.2;
      }
    }
    if (dist < 4 && b.metaTipo !== 'bottino') b.meta = null;
    if (m.slot.some((o) => o && ARMI[o.c]?.carica && o.m < ARMI[o.c].carica * 0.5 && o.ric <= 0) && sim.rnd() < 0.02) inp.a.push('R');
    if (b.metaTipo === 'zona' && m.carb > 60 && sim.rnd() < 0.02) inp.boost = true;
  }

  if (b.bloccato > 0) {
    b.bloccato -= dt;
    inp.boost = true;
    inp.mx = b.strafe;
    if (b.bloccato <= 0) { b.meta = null; b.pensa = 0; }
  }
  if (b.jetT > 0) { b.jetT -= dt; inp.boost = true; }
  return inp;
}
