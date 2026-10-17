// RobotWar — eventi d'arena: tempesta EMP, meteore, cassa leggendaria, taglia
import { EVENTI, TESTI_EVENTI, ARMI } from './config.js';
import { r2 } from './util.js';
import { esplosione } from './armi.js';

const TIPI = ['emp', 'meteore', 'cassa', 'taglia'];

export class GestoreEventi {
  constructor(sim) {
    this.sim = sim;
    this.prossimo = EVENTI.primo;
    this.annunciato = null;
    this.ultimo = null;
    this.emp = 0;
    this.meteoreAttive = 0;
    this.metCd = 0;
    this.meteore = [];
    this.cassa = null;
  }

  scegli() {
    const s = this.sim;
    let lista = TIPI.filter((t) => t !== this.ultimo);
    if (!s.mech.some((m) => m.stato === 'vivo' && (m.uccisioni > 0 || m.danni > 50))) lista = lista.filter((t) => t !== 'taglia');
    return lista[Math.floor(s.rnd() * lista.length)];
  }

  forza(tipo) {
    this.attiva(tipo || this.scegli());
  }

  step(dt) {
    const s = this.sim;
    this.prossimo -= dt;
    if (!this.annunciato && this.prossimo <= EVENTI.preavviso) {
      this.annunciato = this.scegli();
      s.ev({ k: 'ann', tipo: 'evento', testo: TESTI_EVENTI[this.annunciato].preavviso });
    }
    if (this.prossimo <= 0 && this.annunciato) {
      this.attiva(this.annunciato);
      this.annunciato = null;
      const [a, b] = EVENTI.intervallo;
      this.prossimo = a + s.rnd() * (b - a);
    }

    if (this.emp > 0) this.emp = Math.max(0, this.emp - dt);

    if (this.meteoreAttive > 0) {
      this.meteoreAttive -= dt;
      this.metCd -= dt;
      if (this.metCd <= 0) {
        this.metCd = 0.3;
        const vivi = s.mech.filter((m) => m.stato === 'vivo');
        let x, z;
        if (vivi.length && s.rnd() < 0.6) {
          const m = vivi[Math.floor(s.rnd() * vivi.length)];
          const a = s.rnd() * Math.PI * 2, d = s.rnd() * 40;
          x = m.x + Math.cos(a) * d; z = m.z + Math.sin(a) * d;
        } else {
          [x, z] = s.mappa.puntoTerra(s.rnd, s.zona.cx, s.zona.cz, Math.max(20, s.zona.r), -50);
        }
        const y = s.mappa.altezzaSuolo(x, z, 999);
        this.meteore.push({ x, y, z, t: 2.2 });
        s.ev({ k: 'met', x: r2(x), y: r2(y), z: r2(z), t: 2.2 });
      }
    }
    for (const mt of this.meteore) {
      mt.t -= dt;
      if (mt.t <= 0) esplosione(s, mt.x, mt.y + 1, mt.z, 11, 50, null, 'meteora');
    }
    this.meteore = this.meteore.filter((m) => m.t > 0);

    if (this.cassa) {
      const c = this.cassa;
      if (!c.atterrata) {
        c.t -= dt;
        if (c.t <= 0) {
          c.atterrata = true;
          c.vita = 40;
          const armi = Object.keys(ARMI).filter((k) => k !== 'pugni');
          const arma = s.rnd() < 0.4 ? 'railgun' : armi[Math.floor(s.rnd() * armi.length)];
          s.aggiungiBottino(c.x + 2, c.z, arma, 3);
          s.aggiungiBottino(c.x - 2, c.z + 1, s.rnd() < 0.5 ? 'scudo' : 'jetpack', 2 + Math.floor(s.rnd() * 2));
          s.aggiungiBottino(c.x, c.z - 2.5, 'rottami', 0);
          s.aggiungiBottino(c.x + 1, c.z + 2.5, 'rottami', 0);
          s.ev({ k: 'esp', x: r2(c.x), y: r2(c.y + 1), z: r2(c.z), r: 7, c: 'cassa' });
          s.ev({ k: 'ann', tipo: 'evento', testo: 'La cassa leggendaria è atterrata!' });
          esplosione(s, c.x, c.y + 1, c.z, 6, 80, null, 'cassa');
        }
      } else {
        c.vita -= dt;
        if (c.vita <= 0) this.cassa = null;
      }
    }
  }

  attiva(tipo) {
    const s = this.sim;
    this.ultimo = tipo;
    const T = TESTI_EVENTI[tipo];
    if (tipo === 'emp') {
      this.emp = 20;
      s.ev({ k: 'ann', tipo: 'evento', testo: T.via });
    } else if (tipo === 'meteore') {
      this.meteoreAttive = 16;
      s.ev({ k: 'ann', tipo: 'pericolo', testo: T.via });
    } else if (tipo === 'cassa') {
      const z = s.zona;
      const [x, zz] = s.mappa.puntoTerra(s.rnd, z.tcx, z.tcz, Math.max(25, z.tr * 0.7));
      this.cassa = { x, z: zz, y: s.mappa.altezzaSuolo(x, zz, 999), t: 15, atterrata: false };
      s.ev({ k: 'ann', tipo: 'evento', testo: T.via });
    } else if (tipo === 'taglia') {
      let best = null, bv = -1;
      for (const m of s.mech) {
        if (m.stato !== 'vivo') continue;
        const v = m.uccisioni * 1000 + m.danni;
        if (v > bv) { bv = v; best = m; }
      }
      if (!best) return;
      best.taglia = 45;
      s.ev({ k: 'ann', tipo: 'evento', testo: `TAGLIA su ${best.nome}! Abbattilo per una riparazione completa` });
      s.ev({ k: 'taglia', id: best.id });
    }
  }
}
