// RobotWar — simulazione autoritativa (gira sull'host o in locale in modalità Solo)
import {
  META, SLOT, OGGETTI, ARMI, MODULI, ZONA, ZONA_INIZIALE, DRONE, STRAPPO, CALORE, MAX_MECH, NOMI_BOT,
  PORTATA_RACCOLTA, FORMATI, statsDaAspetto, PARTI, TELAI,
} from './config.js';
import { clamp, lerp, creaRng, r2, r3, mescola } from './util.js';
import { aggiornaArmi, aggiornaProiettili } from './armi.js';
import { pensaBot, creaStatoBot } from './bot.js';
import { GestoreEventi } from './eventi.js';

export const STATI = ['lancio', 'vivo', 'drone', 'morto', 'imbarcato'];

export function inputVuoto() {
  return { seq: 0, mx: 0, mz: 0, yaw: 0, mira: [0, 0, 0], f1: false, f2: false, boost: false, tieniE: false, a: [] };
}

// Movimento condiviso: lo usano l'host e (per la predizione) il client
export function muoviMech(m, inp, dt, mappa) {
  if (m.stato === 'imbarcato' || m.stato === 'morto') return;
  m.yaw = inp.yaw;
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }

  if (m.stato === 'drone') {
    const tx = (fx * mz - fz * mx) * DRONE.vel, tz = (fz * mz + fx * mx) * DRONE.vel;
    const a = 1 - Math.exp(-dt * 4);
    m.vx += (tx - m.vx) * a; m.vz += (tz - m.vz) * a;
    m.x = clamp(m.x + m.vx * dt, -META + 5, META - 5);
    m.z = clamp(m.z + m.vz * dt, -META + 5, META - 5);
    const quota = Math.max(mappa.altezzaSuolo(m.x, m.z, 999), 0) + (inp.boost ? 32 : 14);
    m.y += (quota - m.y) * (1 - Math.exp(-dt * 2.5));
    return;
  }

  if (m.stato === 'lancio') {
    m.vx = (fx * mz - fz * mx) * 30; m.vz = (fz * mz + fx * mx) * 30;
    m.vy = inp.boost ? -11 : -26;
    m.x = clamp(m.x + m.vx * dt, -META + 5, META - 5);
    m.z = clamp(m.z + m.vz * dt, -META + 5, META - 5);
    m.y += m.vy * dt;
    const suolo = mappa.altezzaSuolo(m.x, m.z, m.y);
    if (m.y <= suolo) { m.y = suolo; m.vy = 0; m.vx = 0; m.vz = 0; m.stato = 'vivo'; m.aTerra = true; m.appenaAtterrato = true; }
    return;
  }

  // vivo
  let vel = m.vel;
  const gm = m.slot[4]?.c;
  if (gm === 'rapide') vel *= MODULI.rapide.vel;
  else if (gm === 'cingoli') vel *= MODULI.cingoli.vel;
  if (m.hp.g <= 0 && gm !== 'cingoli') vel *= 0.55;
  if (m.disturbato > 0) vel *= 0.6;
  if (m.y < -0.5) vel *= 0.65;
  if (mz < 0) vel *= 0.8;
  const tx = (fx * mz - fz * mx) * vel, tz = (fz * mz + fx * mx) * vel;
  m.dashT -= dt; m.dashCd -= dt; m.carbCd -= dt;
  if (m.dashT <= 0) {
    const a = 1 - Math.exp(-dt * (m.aTerra ? 9 : 2.5));
    m.vx += (tx - m.vx) * a; m.vz += (tz - m.vz) * a;
  }
  const jet = m.slot[6]?.c === 'jetpack';
  m.jetOn = false;
  if (inp.boost) {
    if (jet) {
      if (m.carb > 0) { m.vy = Math.min(m.vy + 50 * dt, 13); m.carb -= 26 * dt; m.carbCd = 0.8; m.jetOn = true; }
    } else if (m.dashCd <= 0 && m.carb >= 25 && m.aTerra) {
      let dx = tx, dz = tz, dl = Math.hypot(dx, dz);
      if (dl < 0.5) { dx = fx; dz = fz; dl = 1; }
      m.vx = (dx / dl) * 46; m.vz = (dz / dl) * 46; m.vy = 4;
      m.dashT = 0.22; m.dashCd = 0.8; m.carb -= 25; m.carbCd = 1;
    }
  }
  if (m.carbCd <= 0) m.carb = Math.min(100, m.carb + 18 * dt);
  m.vy -= 32 * dt;
  m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
  mappa.collidi(m, m.raggio);
  m.x = clamp(m.x, -META + 5, META - 5);
  m.z = clamp(m.z, -META + 5, META - 5);
  const suolo = mappa.altezzaSuolo(m.x, m.z, m.y);
  if (m.y <= suolo || (m.aTerra && m.vy <= 0 && m.y - suolo < 1.5)) {
    m.y = suolo; m.vy = 0; m.aTerra = true;
  } else m.aTerra = false;
}

function slotStr(slot) {
  return slot.map((o) => (o ? `${o.c}:${o.r}` : '')).join('|');
}

export class Simulazione {
  // opz: { formato, difficolta, numBot, giocatori: [{ pid, nome, aspetto }] }
  constructor(mappa, opz) {
    this.mappa = mappa;
    this.opz = opz;
    this.rnd = creaRng((mappa.seme ^ 0x5bd1e995) | 0);
    this.tempo = 0;
    this.mech = [];
    this.perId = new Map();
    this.proiettili = [];
    this.bottino = new Map(mappa.bottino.map((b) => [b.id, { ...b }]));
    this.nuclei = new Map(mappa.nuclei.map((n) => [n.id, { ...n }]));
    this.relitti = new Map();
    this.eventi = [];
    this.prossimoId = 100000;
    this.finita = false;
    this.creaMech();
    this.zona = { cx: 0, cz: 0, r: ZONA_INIZIALE, fase: 0, stato: 'attesa', t: ZONA[0].attesa, dur: ZONA[0].attesa, dcx: 0, dcz: 0, dr: ZONA_INIZIALE, tcx: 0, tcz: 0, tr: ZONA_INIZIALE };
    this.scegliProssimaZona();
    this.gestoreEventi = new GestoreEventi(this);
  }

  ev(e) { this.eventi.push(e); }
  svuotaEventi() { const e = this.eventi; this.eventi = []; return e; }

  creaMech() {
    const { giocatori, formato } = this.opz;
    const umani = giocatori.length;
    const tot = Math.min(MAX_MECH, umani + this.opz.numBot);
    let dim = FORMATI[formato]?.dim ?? 1;
    const coop = formato === 'coop';
    if (coop) dim = Math.max(1, Math.min(4, umani));
    const nomi = mescola(NOMI_BOT, this.rnd);
    let id = 1, squadra = 0, nelSq = 0;
    const prossimaSquadra = () => { if (nelSq >= dim) { squadra++; nelSq = 0; } nelSq++; return squadra; };
    for (const g of giocatori) {
      const sq = coop ? 0 : prossimaSquadra();
      this.aggiungiMech(id++, g.nome, g.aspetto, sq, true, g.pid);
    }
    if (coop) { squadra = 1; nelSq = 0; }
    else if (nelSq > 0) { squadra++; nelSq = 0; }
    for (let i = umani; i < tot; i++) {
      const t = TELAI[Math.floor(this.rnd() * TELAI.length)];
      const asp = { ...t.parti, finitura: Math.floor(this.rnd() * PARTI.finitura.length), livrea: Math.floor(this.rnd() * PARTI.livrea.length), luci: this.rnd() < 0.5 ? 0 : Math.floor(this.rnd() * PARTI.luci.length), emblema: Math.floor(this.rnd() * PARTI.emblema.length), numero: String(Math.floor(this.rnd() * 99) + 1).padStart(2, '0') };
      if (this.rnd() < 0.5) asp.testa = Math.floor(this.rnd() * 3);
      this.aggiungiMech(id++, nomi[i % nomi.length], asp, prossimaSquadra(), false, null);
    }
    // punti di lancio per squadra
    const centri = [];
    const sq = [...new Set(this.mech.map((m) => m.squadra))];
    for (const s of sq) {
      let best = null;
      for (let t = 0; t < 30; t++) {
        const p = this.mappa.puntoTerra(this.rnd, 0, 0, 470);
        const dmin = Math.min(999, ...centri.map((c) => Math.hypot(c[0] - p[0], c[1] - p[1])));
        if (!best || dmin > best.d) best = { p, d: dmin };
        if (dmin > 150) break;
      }
      centri.push(best.p);
      let k = 0;
      for (const m of this.mech.filter((m) => m.squadra === s)) {
        const a = (k++ / 4) * Math.PI * 2;
        m.x = best.p[0] + Math.cos(a) * 9; m.z = best.p[1] + Math.sin(a) * 9;
        m.y = 150 + this.rnd() * 25;
        m.yaw = Math.atan2(-m.x, -m.z);
        m.input.yaw = m.yaw;
      }
    }
  }

  aggiungiMech(id, nome, aspetto, squadra, umano, pid) {
    const st = statsDaAspetto(aspetto);
    const m = {
      id, nome, aspetto, squadra, umano, pid,
      x: 0, y: 150, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, ap: 0,
      aTerra: false, dashT: 0, dashCd: 0, carb: 100, carbCd: 0, jetOn: false,
      stato: 'lancio', hp: { t: st.t, bs: st.b, bd: st.b, g: st.g }, max: st, raggio: st.raggio, vel: st.vel,
      slot: [null, null, null, null, null, null, null, null], sel: 0,
      calore: 0, surr: 0, od: 0, scudo: 0, pugniCd: [0, 0], torrettaCd: 0,
      disturbato: 0, taglia: 0, nuclei: 0, rientrato: false, droneHp: 0, empCd: 0,
      strappo: null, imbarcatoSu: null, artigliere: null,
      uccisioni: 0, danni: 0, piazzamento: 0, ultimoDanno: -99, ultimoColpitore: null, ultimoSparo: -99,
      ack: 0, coda: [], input: inputVuoto(), disconnesso: false,
      bot: umano ? null : creaStatoBot(this.rnd),
    };
    this.mech.push(m);
    this.perId.set(id, m);
    return m;
  }

  roster() {
    return this.mech.map((m) => ({ id: m.id, nome: m.nome, aspetto: m.aspetto, squadra: m.squadra, umano: m.umano, pid: m.pid, max: m.max }));
  }

  idDaPeer(pid) { return this.mech.find((m) => m.pid === pid)?.id; }

  riceviInput(id, inp) {
    const m = this.perId.get(id);
    if (!m || !m.umano) return;
    m.coda.push(inp);
    if (m.coda.length > 20) m.coda.splice(0, m.coda.length - 20);
  }

  disconnetti(pid) {
    const m = this.mech.find((x) => x.pid === pid);
    if (!m) return;
    m.disconnesso = true;
    m.umano = false;
    m.bot = creaStatoBot(this.rnd);
    if (m.stato === 'drone') { m.stato = 'morto'; }
    if (m.stato === 'imbarcato') this.sbarca(m);
    this.ev({ k: 'ann', tipo: 'info', testo: `${m.nome} si è disconnesso: lo guida un bot` });
  }

  // ------------------------------------------------------------------
  step(dt) {
    if (this.finita) return;
    this.tempo += dt;
    for (const m of this.mech) {
      if (m.stato === 'morto') continue;
      if (m.umano) {
        let n = m.coda.length > 5 ? 2 : 1, fatto = false;
        while (n-- > 0 && m.coda.length) {
          const inp = m.coda.shift();
          m.input = inp; m.ack = inp.seq;
          this.azioni(m, inp);
          muoviMech(m, inp, dt, this.mappa);
          fatto = true;
        }
        if (!fatto) muoviMech(m, { ...m.input, mx: 0, mz: 0, boost: false, a: [] }, dt, this.mappa);
      } else {
        const inp = pensaBot(this, m, dt);
        m.input = inp;
        this.azioni(m, inp);
        muoviMech(m, inp, dt, this.mappa);
      }
      const mi = m.input.mira;
      if (mi) m.ap = Math.atan2(mi[1] - (m.y + 6.2), Math.hypot(mi[0] - m.x, mi[2] - m.z) || 1);
    }
    this.collisioniMech();
    for (const m of this.mech) this.aggiornaMech(m, dt);
    aggiornaArmi(this, dt);
    aggiornaProiettili(this, dt);
    this.aggiornaRelitti(dt);
    this.aggiornaZona(dt);
    this.gestoreEventi.step(dt);
    this.controllaFine();
  }

  collisioniMech() {
    const v = this.mech.filter((m) => m.stato === 'vivo');
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j];
      if (Math.abs(a.y - b.y) > 6) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = a.raggio + b.raggio;
      if (d >= rr || d < 1e-4) continue;
      const k = (rr - d) / d / 2;
      a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k;
    }
  }

  aggiornaMech(m, dt) {
    if (m.stato === 'imbarcato') {
      const c = this.perId.get(m.imbarcatoSu);
      if (!c || c.stato !== 'vivo') { this.sbarca(m); return; }
      m.x = c.x; m.y = c.y; m.z = c.z;
      return;
    }
    if (m.appenaAtterrato) { m.appenaAtterrato = false; this.ev({ k: 'atterra', id: m.id }); }
    if (m.stato === 'drone') {
      m.empCd -= dt;
      for (const n of this.nuclei.values()) {
        if (Math.hypot(n.x - m.x, n.z - m.z) < 7) {
          this.nuclei.delete(n.id);
          m.nuclei++;
          this.ev({ k: 'n-', id: n.id, da: m.id });
          if (m.nuclei >= DRONE.nuclei) {
            if (!m.rientrato && this.tempo < DRONE.limiteRientro) this.rientro(m);
          }
        }
      }
      return;
    }
    if (m.stato !== 'vivo') return;

    // calore, overdrive, stati
    const raffr = this.tempo - m.ultimoSparo > 0.8 ? CALORE.raffrRiposo : CALORE.raffr;
    m.calore = Math.max(0, m.calore - raffr * dt);
    if (m.surr > 0) { m.surr -= dt; if (m.surr <= 0) { m.surr = 0; m.calore = Math.min(m.calore, 55); } }
    if (m.od > 0) m.od = Math.max(0, m.od - dt);
    if (m.disturbato > 0) m.disturbato = Math.max(0, m.disturbato - dt);
    if (m.taglia > 0) m.taglia = Math.max(0, m.taglia - dt);
    if (m.slot[6]?.c === 'scudo') {
      const max = MODULI.scudo.hp * (1 + m.slot[6].r * 0.2);
      if (this.tempo - m.ultimoDanno > 4) m.scudo = Math.min(max, m.scudo + 28 * dt);
    } else m.scudo = 0;

    // zona
    const z = this.zona;
    if (Math.hypot(m.x - z.cx, m.z - z.cz) > z.r) {
      m.hp.t -= ZONA[Math.min(z.fase, ZONA.length - 1)].danno * dt;
      if (m.hp.t <= 0) { this.elimina(m, null, 'zona'); return; }
    }

    // strappa-arti (tieni premuto E vicino a un relitto)
    if (m.input.tieniE) {
      if (!m.strappo) {
        if (!this.bottinoVicino(m)) {
          let best = null, bd = STRAPPO.distanza;
          for (const r of this.relitti.values()) {
            if (r.da.has(m.id)) continue;
            const d = Math.hypot(r.x - m.x, r.z - m.z);
            if (d < bd) { bd = d; best = r; }
          }
          if (best) m.strappo = { rid: best.id, t: 0, inizio: this.tempo };
        }
      } else {
        const r = this.relitti.get(m.strappo.rid);
        if (!r || Math.hypot(r.x - m.x, r.z - m.z) > STRAPPO.distanza + 2 || m.ultimoDanno > m.strappo.inizio) {
          if (r && m.ultimoDanno > m.strappo.inizio) this.ev({ k: 'strappoKo', id: m.id });
          m.strappo = null;
        } else {
          m.strappo.t += dt;
          if (m.strappo.t >= STRAPPO.tempo) this.completaStrappo(m, r);
        }
      }
    } else m.strappo = null;

    // raccolta automatica dei rottami se danneggiato
    if (m.hp.t < m.max.t * 0.92 || m.hp.bs <= 0 || m.hp.bd <= 0) {
      for (const b of this.bottino.values()) {
        if (b.c === 'rottami' && Math.hypot(b.x - m.x, b.z - m.z) < 4.5 && Math.abs(b.y - m.y) < 6) { this.raccogli(m, b, 'monta'); break; }
      }
    }
  }

  // ------------------------------------------------------------------
  azioni(m, inp) {
    if (!inp.a || !inp.a.length) return;
    for (const a of inp.a) {
      if (a[0] === 's') { const n = +a.slice(1); if (n >= 0 && n < 4) m.sel = n; continue; }
      switch (a) {
        case 'E': if (m.stato === 'vivo') { const b = this.bottinoVicino(m); if (b) this.raccogli(m, b, 'monta'); } break;
        case 'G': if (m.stato === 'vivo') { const b = this.bottinoVicino(m); if (b) this.raccogli(m, b, 'rastrelliera'); } break;
        case 'Q': if (m.stato === 'vivo') this.scambia(m); break;
        case 'R': if (m.stato === 'vivo') for (const o of m.slot) { const d = o && ARMI[o.c]; if (d?.carica && o.m < d.carica && o.ric <= 0) o.ric = d.ricarica; } break;
        case 'X':
          if (m.stato === 'vivo' && m.calore >= CALORE.soglia && m.od <= 0 && m.surr <= 0) { m.od = CALORE.durataOD; this.ev({ k: 'od', id: m.id }); }
          break;
        case 'F': this.imbarco(m); break;
      }
    }
  }

  bottinoVicino(m) {
    let best = null, bd = PORTATA_RACCOLTA;
    for (const b of this.bottino.values()) {
      if (Math.abs(b.y - m.y) > 7) continue;
      const d = Math.hypot(b.x - m.x, b.z - m.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  nuovoOggetto(c, r) {
    const d = ARMI[c];
    return { c, r, m: d?.carica || 0, ric: 0, cd: 0 };
  }

  togliBottino(b) {
    if (b.id == null) return;
    this.bottino.delete(b.id);
    this.ev({ k: 'b-', id: b.id });
  }

  lascia(m, o) {
    const a = this.rnd() * Math.PI * 2;
    const x = clamp(m.x + Math.cos(a) * 4, -META + 5, META - 5), z = clamp(m.z + Math.sin(a) * 4, -META + 5, META - 5);
    this.aggiungiBottino(x, z, o.c, o.r);
  }

  aggiungiBottino(x, z, c, r) {
    const b = { id: this.prossimoId++, x: r2(x), y: r2(this.mappa.altezzaSuolo(x, z, 999)), z: r2(z), c, r };
    this.bottino.set(b.id, b);
    this.ev({ k: 'b+', id: b.id, x: b.x, y: b.y, z: b.z, c, r });
  }

  ripara(m, q) {
    m.hp.t = Math.min(m.max.t, m.hp.t + q);
    for (const p of ['bs', 'bd']) m.hp[p] = m.hp[p] <= 0 ? m.max.b * 0.5 : Math.min(m.max.b, m.hp[p] + q * 0.75);
    m.hp.g = m.hp.g <= 0 ? m.max.g * 0.5 : Math.min(m.max.g, m.hp.g + q * 0.75);
  }

  // modo: 'monta' (E) oppure 'rastrelliera' (G)
  raccogli(m, b, modo) {
    const def = OGGETTI[b.c];
    if (!def) return;
    if (def.cat === 'rottami') {
      this.ripara(m, 45);
      this.togliBottino(b);
      this.ev({ k: 'monta', id: m.id, c: b.c, r: 0, s: -1 });
      return;
    }
    if (modo === 'rastrelliera' && def.cat === 'arma') {
      const vecchio = m.slot[7];
      m.slot[7] = this.nuovoOggetto(b.c, b.r);
      this.togliBottino(b);
      if (vecchio) this.lascia(m, vecchio);
      this.ev({ k: 'monta', id: m.id, c: b.c, r: b.r, s: 7 });
      return;
    }
    this.monta(m, b.c, b.r);
    this.togliBottino(b);
  }

  monta(m, c, r) {
    const def = OGGETTI[c];
    const cand = [];
    SLOT.forEach((s, i) => { if (i < 7 && s.cat === def.cat) cand.push(i); });
    let t = cand.find((i) => !m.slot[i]);
    if (t === undefined) t = cand.includes(m.sel) ? m.sel : cand[0];
    const vecchio = m.slot[t];
    m.slot[t] = this.nuovoOggetto(c, r);
    if (vecchio) this.lascia(m, vecchio);
    if (t === 0 && m.hp.bs <= 0) m.hp.bs = m.max.b * 0.5;
    if (t === 1 && m.hp.bd <= 0) m.hp.bd = m.max.b * 0.5;
    if (t === 4) m.hp.g = m.max.g;
    if (c === 'scudo') m.scudo = MODULI.scudo.hp * (1 + r * 0.2);
    this.ev({ k: 'monta', id: m.id, c, r, s: t });
  }

  scambia(m) {
    const i = m.sel <= 1 ? m.sel : 0;
    const a = m.slot[i];
    m.slot[i] = m.slot[7];
    m.slot[7] = a;
    this.ev({ k: 'monta', id: m.id, c: m.slot[i]?.c || 'pugni', r: m.slot[i]?.r || 0, s: i });
  }

  imbarco(m) {
    if (m.stato === 'imbarcato') { this.sbarca(m); return; }
    if (m.stato !== 'vivo' || this.opz.formato === 'tutti') return;
    let best = null, bd = 11;
    for (const c of this.mech) {
      if (c === m || c.squadra !== m.squadra || c.stato !== 'vivo' || c.artigliere) continue;
      const d = Math.hypot(c.x - m.x, c.z - m.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    m.stato = 'imbarcato';
    m.imbarcatoSu = best.id;
    m.strappo = null;
    best.artigliere = m.id;
    this.ev({ k: 'imbarco', id: m.id, su: best.id });
  }

  sbarca(m) {
    const c = this.perId.get(m.imbarcatoSu);
    if (c) c.artigliere = null;
    m.imbarcatoSu = null;
    m.stato = 'vivo';
    const a = this.rnd() * Math.PI * 2;
    m.x = clamp((c ? c.x : m.x) + Math.cos(a) * 7, -META + 5, META - 5);
    m.z = clamp((c ? c.z : m.z) + Math.sin(a) * 7, -META + 5, META - 5);
    m.y = this.mappa.altezzaSuolo(m.x, m.z, (c ? c.y : m.y) + 3);
    m.vx = m.vy = m.vz = 0;
    this.ev({ k: 'sbarco', id: m.id });
  }

  artoDistrutto(b, parte) {
    let c = '';
    if (parte === 'bs' && b.slot[0]) { c = b.slot[0].c; b.slot[0] = null; }
    if (parte === 'bd' && b.slot[1]) { c = b.slot[1].c; b.slot[1] = null; }
    this.ev({ k: 'arto', id: b.id, p: parte, c });
  }

  completaStrappo(m, r) {
    r.da.add(m.id);
    m.strappo = null;
    let idx = -1, best = -1;
    r.slot.forEach((o, j) => {
      const cat = OGGETTI[o.c]?.cat;
      const s = o.r * 10 + (cat === 'arma' ? 3 : cat === 'spalla' ? 2 : 1);
      if (s > best) { best = s; idx = j; }
    });
    let preso = null;
    if (idx >= 0) {
      preso = r.slot.splice(idx, 1)[0];
      this.monta(m, preso.c, preso.r);
    }
    // ripara l'arto messo peggio
    const parti = [['bs', m.max.b], ['bd', m.max.b], ['g', m.max.g]];
    parti.sort((a, b) => m.hp[a[0]] / a[1] - m.hp[b[0]] / b[1]);
    m.hp[parti[0][0]] = parti[0][1];
    m.hp.t = Math.min(m.max.t, m.hp.t + 30);
    this.ev({ k: 'strappo', id: m.id, rid: r.id, c: preso ? preso.c : '', r: preso ? preso.r : 0 });
    this.ev({ k: 'rel~', id: r.id, s: r.slot.map((o) => `${o.c}:${o.r}`).join('|') });
  }

  elimina(b, att, c) {
    if (b.stato !== 'vivo') return;
    b.hp.t = 0;
    const rid = this.prossimoId++;
    const rel = { id: rid, mid: b.id, x: b.x, y: b.y, z: b.z, yaw: b.yaw, slot: b.slot.filter(Boolean).map((o) => ({ c: o.c, r: o.r })), t: STRAPPO.durataRelitto, da: new Set() };
    this.relitti.set(rid, rel);
    this.ev({ k: 'rel+', id: rid, mid: b.id, x: r2(b.x), y: r2(b.y), z: r2(b.z), yaw: r3(b.yaw), s: rel.slot.map((o) => `${o.c}:${o.r}`).join('|') });
    if (b.artigliere) { const g = this.perId.get(b.artigliere); if (g) this.sbarca(g); b.artigliere = null; }
    let killer = att;
    if (!killer && b.ultimoColpitore && this.tempo - b.ultimoDanno < 10) killer = this.perId.get(b.ultimoColpitore);
    if (killer && killer !== b) {
      killer.uccisioni++;
      if (b.taglia > 0 && killer.stato === 'vivo') {
        this.ripara(killer, 9999);
        this.ev({ k: 'ann', tipo: 'evento', testo: `${killer.nome} ha riscosso la taglia su ${b.nome}!` });
      }
    }
    this.ev({ k: 'kill', a: killer && killer !== b ? killer.id : 0, b: b.id, c: c || '' });
    b.slot = [null, null, null, null, null, null, null, null];
    b.scudo = 0; b.od = 0; b.taglia = 0; b.strappo = null; b.calore = 0; b.surr = 0; b.disturbato = 0;
    if (b.umano) {
      b.stato = 'drone';
      b.droneHp = DRONE.hp;
      b.empCd = 2;
      b.y += 6;
      b.vx = b.vz = 0;
      this.ev({ k: 'drone', id: b.id });
    } else b.stato = 'morto';
    this.controllaSquadra(b.squadra);
  }

  eliminaDrone(b, att) {
    if (b.stato !== 'drone') return;
    b.stato = 'morto';
    this.ev({ k: 'kill', a: att ? att.id : 0, b: b.id, c: 'drone' });
  }

  rientro(m) {
    m.rientrato = true;
    m.nuclei = 0;
    m.stato = 'lancio';
    m.y += 60;
    m.vx = m.vz = 0;
    m.hp = { t: m.max.t, bs: m.max.b, bd: m.max.b, g: m.max.g };
    m.piazzamento = 0;
    this.ev({ k: 'rientro', id: m.id });
    this.ev({ k: 'ann', tipo: 'bene', testo: `${m.nome} è rientrato in partita!` });
  }

  vivo(m) { return m.stato === 'vivo' || m.stato === 'lancio' || m.stato === 'imbarcato'; }

  controllaSquadra(sq) {
    if (this.mech.some((m) => m.squadra === sq && this.vivo(m))) return;
    const vive = new Set(this.mech.filter((m) => this.vivo(m)).map((m) => m.squadra));
    const posto = vive.size + 1;
    for (const m of this.mech) if (m.squadra === sq) m.piazzamento = posto;
  }

  aggiornaRelitti(dt) {
    for (const r of [...this.relitti.values()]) {
      r.t -= dt;
      if (r.t > 0) continue;
      this.relitti.delete(r.id);
      for (const o of r.slot) { const a = this.rnd() * Math.PI * 2; this.aggiungiBottino(r.x + Math.cos(a) * 5, r.z + Math.sin(a) * 5, o.c, o.r); }
      if (this.rnd() < 0.6) this.aggiungiBottino(r.x + 2, r.z - 2, 'rottami', 0);
      this.ev({ k: 'rel-', id: r.id });
      this.ev({ k: 'esp', x: r2(r.x), y: r2(r.y + 3), z: r2(r.z), r: 6, c: 'relitto' });
    }
  }

  // ------------------------------------------------------------------
  scegliProssimaZona() {
    const z = this.zona;
    if (z.fase >= ZONA.length) return;
    const nr = ZONA[z.fase].raggio;
    let cx = z.cx, cz = z.cz;
    for (let t = 0; t < 20; t++) {
      const a = this.rnd() * Math.PI * 2, d = this.rnd() * Math.max(0, z.r - nr) * 0.75;
      const x = z.cx + Math.cos(a) * d, y = z.cz + Math.sin(a) * d;
      if (Math.abs(x) < META - 40 && Math.abs(y) < META - 40 && this.mappa.altezza(x, y) > 1) { cx = x; cz = y; break; }
    }
    z.tcx = cx; z.tcz = cz; z.tr = nr;
  }

  aggiornaZona(dt) {
    const z = this.zona;
    if (z.stato === 'finale') return;
    z.t -= dt;
    if (z.stato === 'attesa') {
      if (z.t <= 0) {
        z.stato = 'chiusura';
        z.dur = z.t = ZONA[z.fase].chiusura;
        z.dcx = z.cx; z.dcz = z.cz; z.dr = z.r;
        this.ev({ k: 'ann', tipo: 'pericolo', testo: 'La zona si sta chiudendo!' });
      }
    } else {
      const k = 1 - Math.max(0, z.t) / z.dur;
      z.cx = lerp(z.dcx, z.tcx, k); z.cz = lerp(z.dcz, z.tcz, k); z.r = lerp(z.dr, z.tr, k);
      if (z.t <= 0) {
        z.fase++;
        if (z.fase >= ZONA.length) { z.stato = 'finale'; z.t = 0; return; }
        z.stato = 'attesa';
        z.dur = z.t = ZONA[z.fase].attesa;
        this.scegliProssimaZona();
      }
    }
  }

  controllaFine() {
    if (this.tempo < 8 || this.finita) return;
    const vive = new Set(this.mech.filter((m) => this.vivo(m)).map((m) => m.squadra));
    if (vive.size <= 1) {
      const v = [...vive][0];
      for (const m of this.mech) if (m.squadra === v) m.piazzamento = 1;
      this.finita = true;
      this.vincitore = v;
      return;
    }
    if (!this.mech.some((m) => m.umano && m.stato !== 'morto')) { this.finita = true; this.vincitore = null; }
  }

  risultati() {
    return this.mech
      .map((m) => ({ id: m.id, nome: m.nome, squadra: m.squadra, umano: m.umano || !!m.pid, posto: m.piazzamento || 1, uccisioni: m.uccisioni, danni: Math.round(m.danni) }))
      .sort((a, b) => a.posto - b.posto || b.uccisioni - a.uccisioni);
  }

  // ------------------------------------------------------------------
  // Snapshot compatto per la rete
  snapshot() {
    const z = this.zona;
    const ge = this.gestoreEventi;
    return {
      t: 'snap',
      tm: r2(this.tempo),
      m: this.mech.map((m) => [
        m.id, STATI.indexOf(m.stato), r2(m.x), r2(m.y), r2(m.z), r3(m.yaw), r3(m.ap),
        Math.ceil(m.hp.t), Math.ceil(m.hp.bs), Math.ceil(m.hp.bd), Math.ceil(m.hp.g),
        slotStr(m.slot), this.flags(m), Math.ceil(m.scudo), r2(m.vx), r2(m.vz), m.imbarcatoSu || 0,
      ]),
      z: [r2(z.cx), r2(z.cz), r2(z.r), z.fase, z.stato === 'attesa' ? 0 : z.stato === 'chiusura' ? 1 : 2, r2(z.t), r2(z.tcx), r2(z.tcz), r2(z.tr)],
      mis: this.proiettili.filter((p) => p.bers !== undefined).map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z)]),
      ar: [r2(ge.emp), ge.cassa ? [r2(ge.cassa.x), r2(ge.cassa.z), r2(ge.cassa.t), ge.cassa.atterrata ? 1 : 0] : 0, ge.meteoreAttive > 0 ? 1 : 0],
      vivi: this.mech.filter((m) => this.vivo(m)).length,
      sq: new Set(this.mech.filter((m) => this.vivo(m)).map((m) => m.squadra)).size,
    };
  }

  flags(m) {
    let f = 0;
    if (m.od > 0) f |= 1;
    if (m.surr > 0) f |= 2;
    if (m.scudo > 0.5) f |= 4;
    if (m.jetOn) f |= 8;
    if (m.disturbato > 0) f |= 16;
    if (m.taglia > 0) f |= 32;
    if (m.strappo) f |= 64;
    if (m.input.f1 && m.stato === 'vivo') f |= 128;
    if (m.artigliere) f |= 256;
    return f;
  }

  datiPersonali(id) {
    const m = this.perId.get(id);
    if (!m) return null;
    return {
      ack: m.ack, x: r3(m.x), y: r3(m.y), z: r3(m.z), vx: r3(m.vx), vy: r3(m.vy), vz: r3(m.vz),
      carb: r2(m.carb), carbCd: r2(m.carbCd), dashCd: r2(m.dashCd), dashT: r2(m.dashT), aTerra: m.aTerra,
      calore: r2(m.calore), surr: r2(m.surr), od: r2(m.od), sel: m.sel,
      mun: m.slot.map((o) => (o ? o.m : -1)), ric: m.slot.map((o) => (o && o.ric > 0 ? r2(o.ric / (ARMI[o.c]?.ricarica || 1)) : 0)),
      scudo: Math.ceil(m.scudo), nuclei: m.nuclei, rientrato: m.rientrato, droneHp: Math.ceil(m.droneHp), empCd: r2(m.empCd),
      strappo: m.strappo ? r2(m.strappo.t / STRAPPO.tempo) : 0, disturbato: r2(m.disturbato),
      k: m.uccisioni, d: Math.round(m.danni), posto: m.piazzamento, stato: m.stato, vel: m.vel, raggio: m.raggio,
      hpg: m.hp.g, art: m.artigliere || 0,
    };
  }
}
