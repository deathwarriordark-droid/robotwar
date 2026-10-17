// RobotWar — interfaccia di gioco: barre, slot, minimappa, mappa, feed, chat, annunci
import * as THREE from 'three';
import { SLOT, OGGETTI, ARMI, RARITA, META, ZONA, DRONE } from './config.js';
import { coloreTerreno } from './mondo.js';
import { formattaTempo } from './util.js';

const $ = (id) => document.getElementById(id);
const RAGGI_MINI = [110, 230, 480];

function coloreHp(r) {
  if (r <= 0) return '#3a3f46';
  if (r > 0.6) return '#5cff6a';
  if (r > 0.3) return '#ffd23a';
  return '#ff3b4a';
}

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), mini: $('minimappa'), mappa: $('mappa'), mappaBox: $('mappa-grande'), vivi: $('vivi'), uccisioni: $('uccisioni'),
      zona: $('zona-info'), feed: $('feed'), annuncio: $('annuncio'), evento: $('evento-attivo'), chatBox: $('chat-box'), chatLog: $('chat-log'),
      chatInput: $('chat-input'), slotBar: $('slot-bar'), drone: $('drone-info'), spett: $('spettatore'), fps: $('fps'), vign: $('vignetta'),
      glitch: $('glitch'), numeri: $('numeri'), hit: $('hitmarker'), prog: $('progresso'), arco: $('progresso-arco'), prompt: $('prompt'),
      empAvviso: $('emp-avviso'), mirino: $('mirino'),
      bScafo: $('b-scafo'), bScudo: $('b-scudo'), bCarb: $('b-carb'), bCalore: $('b-calore'),
      vScafo: $('v-scafo'), vCarb: $('v-carb'), vCalore: $('v-calore'),
    };
    this.bambola = {};
    document.querySelectorAll('.bambola div').forEach((d) => (this.bambola[d.dataset.p] = d));
    this.zoomMini = 1;
    this.chatAperta = false;
    this.mappaAperta = false;
    this.numeri = [];
    this.tAgg = 0;
    this.dannoFlash = 0;
    this.v3 = new THREE.Vector3();
    this.costruisciSlot();
  }

  costruisciSlot() {
    const b = this.el.slotBar;
    b.innerHTML = '';
    this.slotEl = [];
    SLOT.forEach((s, i) => {
      if (i === 4 || i === 7) { const sep = document.createElement('div'); sep.className = 'separatore'; b.appendChild(sep); }
      const d = document.createElement('div');
      d.className = 'slot' + (i >= 4 && i < 7 ? ' piccolo' : '');
      d.innerHTML = `<div class="tasto">${s.tasto} · ${s.nome}</div><div class="nome-s"></div><div class="mun"></div><div class="ric"></div>`;
      b.appendChild(d);
      this.slotEl.push({ d, nome: d.querySelector('.nome-s'), mun: d.querySelector('.mun'), ric: d.querySelector('.ric') });
    });
  }

  prepara(mappa) {
    this.mappa = mappa;
    this.sfondo = document.createElement('canvas');
    this.sfondo.width = this.sfondo.height = 512;
    const g = this.sfondo.getContext('2d');
    const img = g.createImageData(512, 512);
    for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) {
      const x = (px / 512) * META * 2 - META, z = (py / 512) * META * 2 - META;
      const h = mappa.altezza(x, z);
      let c;
      if (h < 0) { const k = Math.max(0, 1 + h / 20); c = [0.1 + 0.1 * k, 0.32 + 0.12 * k, 0.45 + 0.1 * k]; }
      else { c = coloreTerreno(mappa, x, z, h, 0); const ombra = 0.85 + Math.min(0.3, h / 200); c = c.map((v) => v * ombra); }
      const i = (py * 512 + px) * 4;
      img.data[i] = c[0] * 255; img.data[i + 1] = c[1] * 255; img.data[i + 2] = c[2] * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(40,44,52,0.9)';
    const k = 512 / (META * 2);
    for (const e of mappa.edifici) g.fillRect((e.x0 + META) * k, (e.z0 + META) * k, (e.x1 - e.x0) * k, (e.z1 - e.z0) * k);
    this.el.feed.innerHTML = '';
    this.el.chatLog.innerHTML = '';
    this.el.annuncio.className = '';
    this.chiudiMappa();
    for (const n of this.numeri) n.el.remove();
    this.numeri = [];
  }

  mostra(v) { this.el.hud.classList.toggle('visibile', v); }

  // ---------------- messaggi ----------------
  feed(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 6) this.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 6200);
  }

  annuncio(testo, tipo = 'info', durata = 3.5) {
    const a = this.el.annuncio;
    a.innerHTML = testo;
    a.className = 'visibile ' + tipo;
    clearTimeout(this.tAnn);
    this.tAnn = setTimeout(() => a.classList.remove('visibile'), durata * 1000);
  }

  chat(nome, testo) {
    const d = document.createElement('div');
    d.innerHTML = nome ? `<b></b> ` : '';
    if (nome) d.querySelector('b').textContent = nome + ':';
    d.appendChild(document.createTextNode(testo));
    this.el.chatLog.appendChild(d);
    while (this.el.chatLog.children.length > 8) this.el.chatLog.firstChild.remove();
  }

  apriChat(v) {
    this.chatAperta = v;
    this.el.chatBox.classList.toggle('aperta', v);
    if (v) { this.el.chatInput.value = ''; setTimeout(() => this.el.chatInput.focus(), 0); }
    else this.el.chatInput.blur();
  }

  hitmarker(kill) {
    const h = this.el.hit;
    h.classList.toggle('kill', !!kill);
    h.style.opacity = 1;
    clearTimeout(this.tHit);
    this.tHit = setTimeout(() => (h.style.opacity = 0), kill ? 400 : 130);
  }

  colpito(forza) { this.dannoFlash = Math.min(1, this.dannoFlash + forza); }

  numero(pos, valore, forte) {
    const el = document.createElement('span');
    el.textContent = valore;
    if (forte) el.className = 'forte';
    this.el.numeri.appendChild(el);
    this.numeri.push({ el, x: pos[0] + (Math.random() - 0.5) * 2, y: pos[1], z: pos[2] + (Math.random() - 0.5) * 2, t: 0 });
    if (this.numeri.length > 24) this.numeri.shift().el.remove();
  }

  aggiornaNumeri(camera, dt) {
    const w = innerWidth, h = innerHeight;
    this.numeri = this.numeri.filter((n) => {
      n.t += dt;
      if (n.t > 0.9) { n.el.remove(); return false; }
      this.v3.set(n.x, n.y + n.t * 4, n.z).project(camera);
      if (this.v3.z > 1) { n.el.style.display = 'none'; return true; }
      n.el.style.display = '';
      n.el.style.left = ((this.v3.x + 1) / 2) * w + 'px';
      n.el.style.top = ((1 - this.v3.y) / 2) * h + 'px';
      n.el.style.opacity = 1 - Math.max(0, n.t - 0.5) / 0.4;
      return true;
    });
  }

  zoomMinimappa(d) { this.zoomMini = Math.max(0, Math.min(2, this.zoomMini + d)); }

  apriMappa() { this.mappaAperta = !this.mappaAperta; this.el.mappaBox.classList.toggle('visibile', this.mappaAperta); }
  chiudiMappa() { this.mappaAperta = false; this.el.mappaBox.classList.remove('visibile'); }

  // ---------------- aggiornamento per frame ----------------
  aggiorna(s, dt) {
    this.dannoFlash = Math.max(0, this.dannoFlash - dt * 2.2);
    const io = s.io, tu = s.tu;
    const fuori = io && io.stato === 'vivo' && Math.hypot(io.x - s.zona.cx, io.z - s.zona.cz) > s.zona.r;
    const basso = io && io.stato === 'vivo' && io.hp.t / io.max.t < 0.3;
    this.el.vign.classList.toggle('zona', fuori && this.dannoFlash < 0.2);
    this.el.vign.style.opacity = Math.max(this.dannoFlash, fuori ? 0.6 : basso ? 0.3 + Math.sin(performance.now() / 200) * 0.1 : 0);
    this.el.glitch.classList.toggle('attivo', !!(tu && tu.disturbato > 0));
    const p = tu ? tu.strappo : 0;
    this.el.prog.style.display = p > 0 ? 'block' : 'none';
    if (p > 0) this.el.arco.style.strokeDashoffset = 151 * (1 - p);
    if (s.prompt) { this.el.prompt.style.display = 'block'; this.el.prompt.innerHTML = s.prompt; }
    else this.el.prompt.style.display = 'none';
    this.el.mirino.style.display = io && (io.stato === 'vivo' || io.stato === 'imbarcato' || io.stato === 'drone') ? '' : 'none';
    this.el.mirino.style.filter = io && io.flags & 2 ? 'hue-rotate(-100deg) saturate(4)' : '';

    this.tAgg -= dt;
    if (this.tAgg > 0) return;
    this.tAgg = 0.08;

    this.el.vivi.textContent = `● ${s.vivi} IN VITA` + (s.squadre ? ` · ${s.sq} SQUADRE` : '');
    this.el.uccisioni.textContent = `⚔ ${tu ? tu.k : 0}`;
    const z = s.zona;
    let tz;
    if (z.stato === 0) tz = `ZONA: si chiude tra ${formattaTempo(z.t)}`;
    else if (z.stato === 1) tz = `ZONA IN CHIUSURA ${formattaTempo(z.t)}`;
    else tz = 'ZONA FINALE';
    if (fuori) tz = `FUORI ZONA! −${ZONA[Math.min(z.fase, ZONA.length - 1)].danno}/s`;
    this.el.zona.textContent = tz;
    this.el.zona.classList.toggle('pericolo', fuori || z.stato === 1);
    const ev = [];
    if (s.emp) ev.push('⚡ TEMPESTA EMP');
    if (s.meteore) ev.push('☄ PIOGGIA DI METEORE');
    if (s.cassa) ev.push(s.cassa[3] ? '◆ CASSA LEGGENDARIA A TERRA' : `◆ CASSA IN ARRIVO ${Math.ceil(s.cassa[2])}s`);
    if (s.taglia) ev.push(`☠ TAGLIA: ${s.taglia}`);
    this.el.evento.style.display = ev.length ? 'block' : 'none';
    this.el.evento.textContent = ev.join('  ·  ');
    this.el.fps.textContent = `FPS ${s.fps}` + (s.ping != null ? ' · ' + s.ping : '') + (io ? ` · X ${Math.round(io.x)} Z ${Math.round(io.z)}` : '');

    // stato mech
    if (io && tu && io.stato !== 'drone') {
      const m = io.max;
      const set = (k, r) => (this.bambola[k].style.background = coloreHp(r));
      set('t', io.hp.t / m.t); set('testa', io.hp.t / m.t); set('bs', io.hp.bs / m.b); set('bd', io.hp.bd / m.b); set('g', io.hp.g / m.g);
      this.el.bScafo.style.width = Math.max(0, (io.hp.t / m.t) * 100) + '%';
      this.el.bScafo.style.background = coloreHp(io.hp.t / m.t);
      const scMax = io.slot[6]?.c === 'scudo' ? 110 * (1 + io.slot[6].r * 0.2) : 1;
      this.el.bScudo.style.width = io.slot[6]?.c === 'scudo' ? (tu.scudo / scMax) * 100 + '%' : '0';
      this.el.vScafo.textContent = Math.max(0, Math.ceil(io.hp.t));
      this.el.bCarb.style.width = tu.carb + '%';
      this.el.vCarb.textContent = Math.round(tu.carb);
      this.el.bCalore.style.width = tu.calore + '%';
      this.el.vCalore.textContent = tu.od > 0 ? `OD ${Math.ceil(tu.od)}` : tu.surr > 0 ? 'BLOCCO' : Math.round(tu.calore);
      this.el.vCalore.style.color = tu.od > 0 ? '#ff6a2e' : tu.calore >= 80 ? '#ffd23a' : '';
      this.aggiornaSlot(io, tu);
    }
    $('stato-mech').style.display = io && io.stato !== 'drone' && io.stato !== 'morto' ? '' : 'none';
    this.el.slotBar.style.display = io && (io.stato === 'vivo' || io.stato === 'lancio') ? '' : 'none';

    // drone / spettatore / artigliere
    if (io && io.stato === 'drone' && tu) {
      const pronto = tu.empCd <= 0 ? '<b>PRONTO</b>' : `${Math.ceil(tu.empCd)}s`;
      const rientro = tu.rientrato ? 'Rientro già usato: disturba i nemici!' : s.tempo < DRONE.limiteRientro
        ? `Nuclei <b>${tu.nuclei}/${DRONE.nuclei}</b> per rientrare (entro ${formattaTempo(DRONE.limiteRientro - s.tempo)})`
        : 'Tempo per il rientro scaduto';
      this.el.drone.innerHTML = `DRONE FANTASMA · Scafo ${tu.droneHp} · CLIC impulso EMP ${pronto}<br>${rientro}`;
      this.el.drone.style.display = 'block';
    } else this.el.drone.style.display = 'none';
    if (s.spettatore) { this.el.spett.style.display = 'block'; this.el.spett.innerHTML = s.spettatore; }
    else this.el.spett.style.display = 'none';

    this.disegnaMinimappa(s);
    if (this.mappaAperta) this.disegnaMappa(s);
  }

  aggiornaSlot(io, tu) {
    SLOT.forEach((sl, i) => {
      const e = this.slotEl[i], o = io.slot[i];
      let nome = '', mun = '', cl = 'slot' + (i >= 4 && i < 7 ? ' piccolo' : '');
      let bordo = '#555';
      if (o) {
        const def = OGGETTI[o.c];
        nome = def.nome;
        bordo = RARITA[o.r].colore;
        const a = ARMI[o.c];
        if (a) mun = a.carica ? (tu.ric[i] > 0 ? '…' : `${tu.mun[i]}/${a.carica}`) : '∞';
      } else if (i < 2) { nome = 'Pugni'; mun = '∞'; }
      else { nome = '—'; cl += ' vuoto'; }
      if (i === tu.sel) cl += ' sel';
      if ((i === 0 && io.hp.bs <= 0) || (i === 1 && io.hp.bd <= 0)) { cl += ' rotto'; mun = 'ROTTO'; }
      if (e.d.className !== cl) e.d.className = cl;
      if (e.nome.textContent !== nome) e.nome.textContent = nome;
      if (e.mun.textContent !== mun) e.mun.textContent = mun;
      e.d.style.borderBottomColor = bordo;
      e.ric.style.width = tu.ric[i] > 0 ? (1 - tu.ric[i]) * 100 + '%' : '0';
    });
  }

  disegnaMinimappa(s) {
    const c = this.el.mini, g = c.getContext('2d'), W = c.width;
    const centro = s.centro;
    const R = RAGGI_MINI[this.zoomMini];
    const k512 = 512 / (META * 2);
    g.clearRect(0, 0, W, W);
    g.drawImage(this.sfondo, (centro[0] - R + META) * k512, (centro[1] - R + META) * k512, R * 2 * k512, R * 2 * k512, 0, 0, W, W);
    const tp = (x, z) => [((x - centro[0] + R) / (2 * R)) * W, ((z - centro[1] + R) / (2 * R)) * W];
    const sc = W / (2 * R);
    this.el.empAvviso.style.display = s.emp ? 'flex' : 'none';
    this.disegnaZona(g, s.zona, tp, sc, W);
    if (!s.emp) this.disegnaSegni(g, s, tp, 1);
    const io = s.io;
    if (io) this.freccia(g, tp(io.x, io.z), io.yaw, '#ffffff', 7);
  }

  disegnaMappa(s) {
    const c = this.el.mappa, g = c.getContext('2d'), W = c.width;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.sfondo, 0, 0, W, W);
    const sc = W / (META * 2);
    const tp = (x, z) => [(x + META) * sc, (z + META) * sc];
    g.font = '600 14px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    for (const l of this.mappa.luoghi) {
      const [x, y] = tp(l.x, l.z);
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillText(l.nome.toUpperCase(), x + 1, y + 1);
      g.fillStyle = '#fff';
      g.fillText(l.nome.toUpperCase(), x, y);
    }
    this.disegnaZona(g, s.zona, tp, sc, W);
    if (!s.emp) this.disegnaSegni(g, s, tp, 1.3);
    if (s.io) this.freccia(g, tp(s.io.x, s.io.z), s.io.yaw, '#ffffff', 9);
  }

  disegnaZona(g, z, tp, sc, W) {
    const [cx, cy] = tp(z.cx, z.cz);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, W);
    g.arc(cx, cy, Math.max(0.1, z.r * sc), 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(120,40,220,0.28)';
    g.fill('evenodd');
    g.strokeStyle = '#4fd8ff'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, Math.max(0.1, z.r * sc), 0, Math.PI * 2); g.stroke();
    if (z.stato !== 2) {
      const [tx, ty] = tp(z.tcx, z.tcz);
      g.setLineDash([5, 5]); g.strokeStyle = '#ffffff';
      g.beginPath(); g.arc(tx, ty, Math.max(0.1, z.tr * sc), 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }

  disegnaSegni(g, s, tp, k) {
    if (s.nuclei) {
      g.fillStyle = '#6ff3ff';
      for (const n of s.nuclei) { const [x, y] = tp(n[0], n[1]); g.fillRect(x - 2 * k, y - 2 * k, 4 * k, 4 * k); }
    }
    if (s.cassa) {
      const [x, y] = tp(s.cassa[0], s.cassa[1]);
      g.fillStyle = '#ffb02e'; g.strokeStyle = '#000';
      g.beginPath(); g.moveTo(x, y - 8 * k); g.lineTo(x + 8 * k, y); g.lineTo(x, y + 8 * k); g.lineTo(x - 8 * k, y); g.closePath(); g.fill(); g.stroke();
    }
    for (const e of s.entita) {
      const [x, y] = tp(e.x, e.z);
      if (e.taglia) {
        g.fillStyle = '#ffb02e';
        g.font = `${14 * k}px sans-serif`; g.textAlign = 'center';
        g.fillText('☠', x, y - 7 * k);
      }
      if (e.alleato) this.freccia(g, [x, y], e.yaw, e.stato === 'drone' ? '#6ff3ff' : '#5cff6a', 6 * k);
      else if (e.radar || e.taglia) { g.fillStyle = e.stato === 'drone' ? '#9aa' : '#ff3b4a'; g.beginPath(); g.arc(x, y, 4 * k, 0, Math.PI * 2); g.fill(); }
    }
  }

  freccia(g, [x, y], yaw, colore, r) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI - yaw);
    g.fillStyle = colore; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.75, r * 0.8); g.lineTo(0, r * 0.35); g.lineTo(-r * 0.75, r * 0.8); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
}
