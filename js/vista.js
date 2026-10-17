// RobotWar — vista lato client: interpola gli snapshot, disegna mech, effetti, telecamera
import * as THREE from 'three';
import { ModelloMech, creaDrone } from './mech.js';
import { costruisciMondo } from './scenario.js';
import { muoviMech, STATI } from './simulazione.js';
import { OGGETTI, ARMI, RARITA, TICK, PORTATA_RACCOLTA, STRAPPO, PARTI, SLOT, statsDaAspetto, META } from './config.js';

const COL_PROIETTILE = { mitra: 0xffd27a, dispersione: 0xffb060, cannone: 0xff7a3a, missili: 0xffffff, mortaio: 0xff9a50 };
const DIM_PROIETTILE = { mitra: [0.2, 0.2, 4], dispersione: [0.16, 0.16, 2.2], cannone: [0.6, 0.6, 2.4], missili: [0.45, 0.45, 1.9], mortaio: [0.8, 0.8, 0.8] };
const SUONO_ARMA = { mitra: 'mitra', dispersione: 'dispersione', cannone: 'cannone', laser: 'laser', railgun: 'railgun', fiamma: 'fiamma', missili: 'missili', mortaio: 'mortaio', pugni: 'pugni', lama: 'lama' };
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qq = new THREE.Quaternion(), m4 = new THREE.Matrix4(), col = new THREE.Color(), ASSE_Z = new THREE.Vector3(0, 0, 1);

// ---- particelle istanziate ----
class Particelle {
  constructor(scena, max, additive) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.55 }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, col.setRGB(1, 1, 1));
    this.additive = additive;
    this.p = [];
    scena.add(this.mesh);
  }
  emetti(x, y, z, vx, vy, vz, vita, s0, s1, colore, grav = 0, attrito = 0) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, vita, d: vita, s0, s1, c: new THREE.Color(colore), grav, attrito });
  }
  aggiorna(dt) {
    let n = 0;
    const vivi = [];
    for (const p of this.p) {
      p.vita -= dt;
      if (p.vita <= 0) continue;
      p.vy -= p.grav * dt;
      const a = Math.exp(-p.attrito * dt);
      p.vx *= a; p.vy *= a; p.vz *= a;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 1 - p.vita / p.d;
      const s = p.s0 + (p.s1 - p.s0) * k;
      m4.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(n, m4);
      const f = this.additive ? 1 - k : 1;
      this.mesh.setColorAt(n, col.copy(p.c).multiplyScalar(f));
      n++;
      vivi.push(p);
    }
    this.p = vivi;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

function targa(nome, colore) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(8, 2, 1);
  sp.renderOrder = 10;
  sp.userData = { c, tex, nome, colore, ultimo: -1 };
  return sp;
}
function disegnaTarga(sp, hp, taglia) {
  const u = sp.userData;
  const chiave = Math.round(hp * 40) + (taglia ? 1000 : 0);
  if (chiave === u.ultimo) return;
  u.ultimo = chiave;
  const g = u.c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = '700 24px "Chakra Petch", sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)';
  const testo = (taglia ? '☠ ' : '') + u.nome;
  g.strokeText(testo, 128, 26);
  g.fillStyle = taglia ? '#ffb02e' : u.colore;
  g.fillText(testo, 128, 26);
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(48, 38, 160, 10);
  g.fillStyle = hp > 0.6 ? '#5cff6a' : hp > 0.3 ? '#ffd23a' : '#ff3b4a';
  g.fillRect(50, 40, 156 * Math.max(0, hp), 6);
  u.tex.needsUpdate = true;
}

export class Vista {
  constructor({ renderer, mappa, roster, mioId, impostazioni, audio, hud, host }) {
    this.renderer = renderer;
    this.mappa = mappa;
    this.mioId = mioId;
    this.imp = impostazioni;
    this.audio = audio;
    this.hud = hud;
    this.host = host;
    this.tempo = 0;
    this.scena = new THREE.Scene();
    const dist = impostazioni.distanza;
    this.scena.fog = new THREE.Fog(0xbcd6e8, dist * 0.3, dist);
    this.camera = new THREE.PerspectiveCamera(impostazioni.fov, innerWidth / innerHeight, 0.5, 3500);
    this.mondo = costruisciMondo(mappa, impostazioni.qualita);
    this.scena.add(this.mondo.gruppo);
    renderer.shadowMap.enabled = impostazioni.qualita === 'alta';

    this.roster = new Map(roster.map((r) => [r.id, r]));
    const mio = this.roster.get(mioId);
    this.miaSquadra = mio ? mio.squadra : -1;
    this.entita = new Map();
    for (const r of roster) this.creaEntita(r);

    this.fuoco = new Particelle(this.scena, 900, true);
    this.fumo = new Particelle(this.scena, 500, false);
    this.proiettili = new Map();
    this.tracce = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 600);
    this.tracce.frustumCulled = false;
    for (let i = 0; i < 600; i++) this.tracce.setColorAt(i, col.setRGB(1, 1, 1));
    this.tracce.count = 0;
    this.scena.add(this.tracce);
    this.raggi = [];
    this.anelli = [];
    this.detriti = [];
    this.geoDetrito = new THREE.BoxGeometry(1, 0.18, 0.8);
    this.matDetriti = new Map();

    this.creaBottino();
    this.creaZona();
    this.relitti = new Map();
    this.avvisi = [];
    this.cassaMesh = null;

    this.zona = { cx: 0, cz: 0, r: 680, fase: 0, stato: 0, t: 0, tcx: 0, tcz: 0, tr: 680 };
    this.arena = { emp: 0, cassa: 0, meteore: 0 };
    this.vivi = roster.length;
    this.sq = 0;
    this.tm = 0;
    this.tu = null;
    this.pred = null;
    this.storico = [];
    this.scossa = 0;
    this.cockpit = impostazioni.camera === 'cockpit';
    this.fovAtt = impostazioni.fov;
    this.spettaId = null;
    this.ultimoSnap = performance.now();
  }

  creaEntita(r) {
    const alleato = r.squadra === this.miaSquadra;
    const modello = new ModelloMech(r.aspetto);
    modello.impostaSlot('|||||||');
    this.scena.add(modello.gruppo);
    const drone = creaDrone(alleato ? 0x5cff6a : 0xff5050);
    drone.visible = false;
    this.scena.add(drone);
    const tg = targa(r.nome, r.id === this.mioId ? '#ffffff' : alleato ? '#5cff6a' : '#ff8080');
    this.scena.add(tg);
    const marcatore = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0xffb02e }));
    marcatore.visible = false;
    this.scena.add(marcatore);
    const e = {
      r, alleato, modello, drone, targa: tg, marcatore, stato: 'lancio', hp: { t: 1, bs: 1, bd: 1, g: 1 },
      max: r.max || statsDaAspetto(r.aspetto), flags: 0, slotStr: '', slot: [], ap: 0,
      pos: new THREE.Vector3(), tgt: new THREE.Vector3(), yaw: 0, tyaw: 0, vx: 0, vz: 0, primo: true, passoFase: 0, jetT: 0, su: 0, buf: [],
    };
    this.entita.set(r.id, e);
    return e;
  }

  // ---------------- bottino, nuclei, zona ----------------
  creaBottino() {
    this.bottino = new Map(this.mappa.bottino.map((b) => [b.id, { ...b }]));
    this.nuclei = new Map(this.mappa.nuclei.map((n) => [n.id, { ...n }]));
    const geo = {
      arma: new THREE.BoxGeometry(1.8, 0.6, 0.6),
      spalla: new THREE.BoxGeometry(1.1, 1.1, 1.1),
      schiena: new THREE.CylinderGeometry(0.6, 0.6, 1.4, 8),
      testa: new THREE.OctahedronGeometry(0.85),
      gambe: new THREE.BoxGeometry(0.6, 1.7, 0.6),
      rottami: new THREE.DodecahedronGeometry(0.75),
    };
    this.bottMesh = {};
    for (const [k, g] of Object.entries(geo)) {
      const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5, emissive: 0x222222, flatShading: true }), 800);
      im.frustumCulled = false;
      for (let i = 0; i < 800; i++) im.setColorAt(i, col.setRGB(1, 1, 1));
      im.count = 0;
      this.scena.add(im);
      this.bottMesh[k] = im;
    }
    const gr = new THREE.CylinderGeometry(0.12, 0.25, 12, 6); gr.translate(0, 6, 0);
    this.fasci = new THREE.InstancedMesh(gr, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 800);
    this.fasci.frustumCulled = false;
    for (let i = 0; i < 800; i++) this.fasci.setColorAt(i, col.setRGB(1, 1, 1));
    this.scena.add(this.fasci);
    this.nucMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1.2), new THREE.MeshBasicMaterial({ color: 0x6ff3ff }), 100);
    this.nucMesh.frustumCulled = false;
    this.scena.add(this.nucMesh);
  }

  aggiornaBottino() {
    const cnt = { arma: 0, spalla: 0, schiena: 0, testa: 0, gambe: 0, rottami: 0 };
    let nf = 0;
    const t = this.tempo;
    const cx = this.centroCamera ? this.centroCamera.x : 0, cz = this.centroCamera ? this.centroCamera.z : 0;
    for (const b of this.bottino.values()) {
      if (Math.abs(b.x - cx) > 350 || Math.abs(b.z - cz) > 350) continue;
      const cat = OGGETTI[b.c]?.cat || 'rottami';
      const im = this.bottMesh[cat];
      const i = cnt[cat]++;
      qq.setFromAxisAngle(v2.set(0, 1, 0), t * 1.2 + b.id);
      m4.compose(v2.set(b.x, b.y + 1.3 + Math.sin(t * 2 + b.id) * 0.25, b.z), qq, v1.set(1, 1, 1));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.set(cat === 'rottami' ? '#8a8f96' : RARITA[b.r].colore));
      if (cat !== 'rottami') {
        m4.makeTranslation(b.x, b.y, b.z);
        this.fasci.setMatrixAt(nf, m4);
        this.fasci.setColorAt(nf, col.set(RARITA[b.r].colore));
        nf++;
      }
    }
    for (const [k, im] of Object.entries(this.bottMesh)) {
      im.count = cnt[k];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.fasci.count = nf;
    this.fasci.instanceMatrix.needsUpdate = true;
    if (this.fasci.instanceColor) this.fasci.instanceColor.needsUpdate = true;
    // nuclei: visibili solo ai droni
    const io = this.entita.get(this.mioId);
    let nn = 0;
    if (io && io.stato === 'drone') {
      for (const n of this.nuclei.values()) {
        qq.setFromAxisAngle(v2.set(0, 1, 0), t * 2 + n.id);
        m4.compose(v2.set(n.x, n.y + Math.sin(t * 3 + n.id) * 0.5, n.z), qq, v1.set(1, 1.4, 1));
        this.nucMesh.setMatrixAt(nn++, m4);
      }
    }
    this.nucMesh.count = nn;
    this.nucMesh.instanceMatrix.needsUpdate = true;
  }

  creaZona() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(120,60,255,0)');
    gr.addColorStop(0.6, 'rgba(120,60,255,0.25)');
    gr.addColorStop(1, 'rgba(160,90,255,0.65)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    for (let y = 128; y < 256; y += 12) { g.fillStyle = `rgba(200,170,255,${((y - 128) / 128) * 0.45})`; g.fillRect(0, y, 64, 2); }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    this.texZona = tex;
    this.muro = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    this.muro.renderOrder = 5;
    this.scena.add(this.muro);
  }

  // ---------------- snapshot e predizione ----------------
  applicaSnapshot(snap, tu) {
    this.ultimoSnap = performance.now();
    this.tm = snap.tm;
    // orologio dell'host stimato in locale: serve a interpolare gli altri mech senza scatti
    if (!this.host) {
      // orologio dell'host: si segue il pacchetto arrivato più in fretta (offset massimo), che è il meno ritardato
      const ora = performance.now() / 1000, off = snap.tm - ora;
      if (this.offServer == null || off > this.offServer + 0.5 || off < this.offServer - 1.5) this.offServer = off;
      else if (off > this.offServer) this.offServer += (off - this.offServer) * 0.5;
      else this.offServer += (off - this.offServer) * 0.02;
      // ritardo di interpolazione adattivo: più la rete è irregolare (jitter), più margine si tiene
      if (this.intervallo == null) { this.intervallo = 1 / 15; this.jitter = 0; this.ritardo = 0.1; }
      if (this.arrivoPrec != null) {
        const dA = Math.min(1, ora - this.arrivoPrec);
        this.intervallo += (dA - this.intervallo) * 0.05;
        this.jitter += (Math.abs(dA - this.intervallo) - this.jitter) * 0.08;
      }
      this.arrivoPrec = ora;
      const obiettivo = Math.max(0.09, Math.min(0.35, this.intervallo * 1.5 + this.jitter * 2.5));
      this.ritardo += (obiettivo - this.ritardo) * (obiettivo > this.ritardo ? 0.3 : 0.02);
    }
    if (snap.sl) for (const [id, str] of snap.sl) {
      const e = this.entita.get(id);
      if (!e || str === e.slotStr) continue;
      e.slotStr = str;
      e.slot = str.split('|').map((x) => { if (!x) return null; const [c, r] = x.split(':'); return { c, r: +r }; });
      e.modello.impostaSlot(str);
    }
    for (const row of snap.m) {
      const e = this.entita.get(row[0]);
      if (!e) continue;
      const nuovoStato = STATI[row[1]];
      if (e.stato !== nuovoStato && (nuovoStato === 'drone' || nuovoStato === 'lancio')) e.primo = true;
      e.stato = nuovoStato;
      e.tgt.set(row[2], row[3], row[4]);
      e.tyaw = row[5]; e.ap = row[6];
      e.hp = { t: row[7], bs: row[8], bd: row[9], g: row[10] };
      e.flags = row[11]; e.scudo = row[12]; e.vx = row[13]; e.vz = row[14]; e.su = row[15];
      if (e.primo) { e.pos.copy(e.tgt); e.yaw = e.tyaw; e.primo = false; e.buf.length = 0; }
      if (!this.host) { e.buf.push({ t: snap.tm, x: row[2], y: row[3], z: row[4], yaw: row[5] }); if (e.buf.length > 12) e.buf.shift(); }
    }
    const z = snap.z;
    this.zona = { cx: z[0], cz: z[1], r: z[2], fase: z[3], stato: z[4], t: z[5], tcx: z[6], tcz: z[7], tr: z[8] };
    this.arena = { emp: snap.ar[0], cassa: snap.ar[1], meteore: snap.ar[2] };
    this.vivi = snap.vivi; this.sq = snap.sq;
    for (const [id, x, y, z2] of snap.mis) { const p = this.proiettili.get(id); if (p) { p.tx = x; p.ty = y; p.tz = z2; } }
    if (tu) {
      this.tu = tu;
      if (!this.host) this.riconcilia(tu);
    }
  }

  riconcilia(tu) {
    const e = this.entita.get(this.mioId);
    if (!e) return;
    if (!this.pred) this.pred = { hp: {}, slot: [] };
    const p = this.pred;
    Object.assign(p, { x: tu.x, y: tu.y, z: tu.z, vx: tu.vx, vy: tu.vy, vz: tu.vz, carb: tu.carb, carbCd: tu.carbCd, dashCd: tu.dashCd, dashT: tu.dashT, aTerra: tu.aTerra, stato: tu.stato, vel: tu.vel, raggio: tu.raggio, disturbato: tu.disturbato, yaw: e.tyaw });
    p.hp.g = tu.hpg;
    p.slot = e.slot;
    this.storico = this.storico.filter((i) => i.seq > tu.ack);
    for (const inp of this.storico) muoviMech(p, inp, TICK, this.mappa);
  }

  prevedi(inp) {
    if (this.host) return;
    this.storico.push(inp);
    if (this.storico.length > 90) this.storico.shift();
    if (this.pred) muoviMech(this.pred, inp, TICK, this.mappa);
  }

  // ---------------- eventi ----------------
  eventi(lista) {
    const io = this.mioId;
    for (const ev of lista) {
      switch (ev.k) {
        case 'p': {
          const ang = ev.c === 'missili' ? 1 : 0;
          this.proiettili.set(ev.id, { x: ev.x, y: ev.y, z: ev.z, vx: ev.vx, vy: ev.vy, vz: ev.vz, g: ev.g, c: ev.c, vita: ev.c === 'missili' ? 6 : 4, h: ev.h, tx: null });
          if (ev.s !== undefined) this.sparoVisivo(ev.da, ev.s, ev.c, [ev.x, ev.y, ev.z], ang);
          break;
        }
        case 'imp': {
          this.proiettili.delete(ev.id);
          if (!ev.e) {
            const colore = ev.m ? 0xffa040 : 0xcbb894;
            for (let i = 0; i < (ev.m ? 6 : 3); i++) this.fuoco.emetti(ev.x, ev.y, ev.z, (Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14, 0.3, 0.35, 0.05, colore, 30);
            if (!ev.m) this.fumo.emetti(ev.x, ev.y, ev.z, 0, 2, 0, 0.6, 0.6, 1.4, 0x9a8f80);
            this.audio.suona(ev.m ? 'colpo' : 'impatto', [ev.x, ev.y, ev.z], 0.6, 0.03);
          }
          break;
        }
        case 'r': {
          this.raggio(ev);
          this.sparoVisivo(ev.id, ev.s, ev.c, [ev.x1, ev.y1, ev.z1], 0);
          break;
        }
        case 'f': {
          for (let i = 0; i < 9; i++) {
            const v = 26 + Math.random() * 10, sp = 0.25;
            this.fuoco.emetti(ev.x, ev.y, ev.z, (ev.dx + (Math.random() - 0.5) * sp) * v, (ev.dy + (Math.random() - 0.5) * sp) * v + 2, (ev.dz + (Math.random() - 0.5) * sp) * v, 0.55, 0.4, 2.6, i % 3 ? 0xff7a20 : 0x7fd8ff, -4, 1.5);
          }
          this.audio.suona('fiamma', [ev.x, ev.y, ev.z], 0.8, 0.09);
          break;
        }
        case 'mi': {
          const e = this.entita.get(ev.id);
          if (e) e.modello.sparo(ev.s);
          if (e) this.audio.suona(SUONO_ARMA[ev.c] || 'pugni', [e.pos.x, e.pos.y + 4, e.pos.z], 0.9);
          break;
        }
        case 'esp': this.esplosione(ev.x, ev.y, ev.z, ev.r); break;
        case 'dan': {
          if (ev.b === io) { this.hud.colpito(Math.min(0.7, ev.d / 50)); this.scossa = Math.min(1.2, this.scossa + ev.d / 60); }
          if (ev.a === io && ev.b !== io) { this.hud.hitmarker(false); this.hud.numero([ev.x, ev.y, ev.z], ev.d, ev.d >= 40); this.audio.suona('hit', null, 0.6, 0.04); }
          break;
        }
        case 'kill': {
          const a = this.roster.get(ev.a), b = this.roster.get(ev.b);
          const nA = a ? a.nome : 'La zona', nB = b ? b.nome : '?';
          const arma = ev.c === 'drone' ? 'drone abbattuto' : ev.c === 'zona' ? 'zona' : OGGETTI[ev.c]?.nome || ev.c || '';
          const cl = ev.a === io ? 'io' : ev.b === io ? 'nem' : '';
          const tA = a ? this.esc(nA) : (ev.c === 'meteora' ? 'Una meteora' : ev.c === 'cassa' ? 'La cassa' : 'La zona');
          this.hud.feed(`<span class="${cl}">${tA} <small>[${this.esc(arma)}]</small> ${this.esc(nB)}</span>`);
          if (ev.a === io && ev.b !== io) { this.hud.hitmarker(true); this.audio.suona('kill'); this.hud.annuncio(ev.c === 'drone' ? `Drone di ${this.esc(nB)} abbattuto` : `ABBATTUTO <small>${this.esc(nB)}</small>`, 'bene', 2); }
          if (ev.b === io && ev.c !== 'drone') this.hud.annuncio(`SEI STATO ABBATTUTO<small>da ${tA}</small>`, 'pericolo', 4);
          if (ev.b === io && ev.c === 'drone') this.hud.annuncio('IL TUO DRONE È STATO ABBATTUTO<small>Ora osservi la partita</small>', 'pericolo', 4);
          break;
        }
        case 'drone':
          if (ev.id === io) { setTimeout(() => this.hud.annuncio('SEI UN DRONE FANTASMA<small>Clic: impulso EMP · raccogli 5 nuclei per rientrare</small>', 'evento', 5), 2500); this.audio.suona('drone'); }
          break;
        case 'rientro': if (ev.id === io) { this.audio.suona('rientro'); this.hud.annuncio('RIENTRO IN PARTITA!<small>Si riparte a mani nude</small>', 'bene', 4); } break;
        case 'monta':
          if (ev.id === io) {
            this.audio.suona('monta');
            const def = OGGETTI[ev.c];
            if (ev.s === -1) this.hud.feed('<span class="io">Riparazione con rottami</span>');
            else if (def) this.hud.feed(`<span class="io">${def.nome} <span style="color:${RARITA[ev.r].colore}">${RARITA[ev.r].nome}</span> → ${SLOT[ev.s]?.nome || ''}</span>`);
          }
          break;
        case 'arto': if (ev.id === io) this.hud.annuncio(`${ev.p === 'g' ? 'GAMBE DANNEGGIATE' : ev.p === 'bs' ? 'BRACCIO SX DISTRUTTO' : 'BRACCIO DX DISTRUTTO'}<small>${ev.c ? 'Arma persa — ' : ''}raccogli rottami o monta un\'arma per ripararlo</small>`, 'pericolo', 3); break;
        case 'od': {
          const e = this.entita.get(ev.id);
          if (e) this.audio.suona('od', [e.pos.x, e.pos.y, e.pos.z]);
          if (ev.id === io) this.hud.annuncio('OVERDRIVE!<small>danni doppi per 5 secondi</small>', 'evento', 2);
          break;
        }
        case 'surr': {
          const e = this.entita.get(ev.id);
          if (e) { this.audio.suona('surr', [e.pos.x, e.pos.y, e.pos.z], 0.8); for (let i = 0; i < 6; i++) this.fumo.emetti(e.pos.x, e.pos.y + 6, e.pos.z, (Math.random() - 0.5) * 3, 5, (Math.random() - 0.5) * 3, 1.2, 0.8, 2.5, 0xdddddd); }
          if (ev.id === io) this.hud.annuncio('SURRISCALDATO!<small>armi bloccate</small>', 'pericolo', 1.5);
          break;
        }
        case 'emp': {
          this.anello(ev.x, ev.y, ev.z, 30, 0x6ff3ff);
          this.audio.suona('emp', [ev.x, ev.y, ev.z]);
          break;
        }
        case 'dist': if (ev.id === io) this.hud.annuncio('DISTURBO EMP!<small>rallentato e scudo azzerato</small>', 'pericolo', 2); break;
        case 'n-':
          this.nuclei.delete(ev.id);
          if (ev.da === io) this.audio.suona('nucleo');
          break;
        case 'atterra': {
          const e = this.entita.get(ev.id);
          if (e) {
            for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.fumo.emetti(e.tgt.x, e.tgt.y + 0.5, e.tgt.z, Math.cos(a) * 12, 1, Math.sin(a) * 12, 1, 1, 3, 0xb8a888, 0, 2); }
            this.audio.suona('atterra', [e.tgt.x, e.tgt.y, e.tgt.z]);
            if (ev.id === io) this.scossa = 1;
          }
          break;
        }
        case 'imbarco':
          if (ev.id === io) this.hud.annuncio(`A BORDO COME ARTIGLIERE<small>Clic: armi da spalla di ${this.esc(this.roster.get(ev.su)?.nome || '')} · F per scendere</small>`, 'bene', 4);
          if (ev.su === io) this.hud.annuncio(`${this.esc(this.roster.get(ev.id)?.nome || '')} È SALITO A BORDO<small>ora comanda le tue armi da spalla</small>`, 'bene', 3);
          this.audio.suona('monta');
          break;
        case 'strappo': {
          const e = this.entita.get(ev.id);
          if (e) this.audio.suona('strappo', [e.pos.x, e.pos.y, e.pos.z]);
          if (ev.id === io) this.hud.annuncio(ev.c ? `STRAPPATO: ${OGGETTI[ev.c].nome}<small style="color:${RARITA[ev.r].colore}">${RARITA[ev.r].nome} · arto riparato</small>` : 'ARTO RIPARATO', 'bene', 2.5);
          break;
        }
        case 'strappoKo': if (ev.id === io) this.hud.annuncio('STRAPPO INTERROTTO', 'pericolo', 1.2); break;
        case 'met': this.avvisoMeteora(ev); break;
        case 'ann':
          this.hud.annuncio(this.esc(ev.testo), ev.tipo, ev.tipo === 'evento' ? 4.5 : 3);
          this.audio.suona(ev.tipo === 'pericolo' ? 'allarme' : 'annuncio');
          break;
        case 'b+': this.bottino.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, z: ev.z, c: ev.c, r: ev.r }); break;
        case 'b-': this.bottino.delete(ev.id); break;
        case 'rel+': this.creaRelitto(ev); break;
        case 'rel~': { const r = this.relitti.get(ev.id); if (r) r.modello.impostaSlot(this.slotDa(ev.s)); break; }
        case 'rel-': { const r = this.relitti.get(ev.id); if (r) { r.modello.dispose(); this.relitti.delete(ev.id); } break; }
      }
    }
  }

  esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

  slotDa(s) {
    // dalla lista "c:r|c:r" del relitto a 8 slot ordinati per categoria
    const out = ['', '', '', '', '', '', '', ''];
    for (const x of (s || '').split('|').filter(Boolean)) {
      const cat = OGGETTI[x.split(':')[0]]?.cat;
      const i = SLOT.findIndex((sl, j) => j < 7 && sl.cat === cat && !out[j]);
      if (i >= 0) out[i] = x;
    }
    return out.join('|');
  }

  creaRelitto(ev) {
    const r = this.roster.get(ev.mid);
    if (!r) return;
    const modello = new ModelloMech(r.aspetto, { bruciato: true });
    modello.impostaSlot(this.slotDa(ev.s));
    modello.gruppo.position.set(ev.x, ev.y - 0.9, ev.z);
    modello.gruppo.rotation.set(0.25, ev.yaw, 0.18);
    modello.anima(0, 0, -0.6, 0, 0, null);
    this.scena.add(modello.gruppo);
    this.relitti.set(ev.id, { modello, x: ev.x, y: ev.y, z: ev.z, t: 0 });
  }

  sparoVisivo(id, s, c, pos, missile) {
    const e = this.entita.get(id);
    const FORZA = { cannone: 1.6, railgun: 1.6, dispersione: 1.2, mortaio: 1.0, missili: 0.6, mitra: 0.35, laser: 0.45 };
    if (e && s < 2) e.modello.sparo(s, FORZA[c] || 1);
    else if (e && s >= 2) e.modello.kick = Math.min(1.5, e.modello.kick + (FORZA[c] || 1) * 0.4);
    if (c !== 'fiamma' && c !== 'pugni' && c !== 'lama') {
      const colore = c === 'laser' || c === 'railgun' ? 0x9ff6ff : 0xffc860;
      this.fuoco.emetti(pos[0], pos[1], pos[2], 0, 0, 0, 0.06, c === 'cannone' || c === 'railgun' ? 1.6 : 0.8, 0.3, colore);
      if (missile) this.fumo.emetti(pos[0], pos[1], pos[2], 0, 2, 0, 0.6, 0.8, 2, 0xdddddd);
    }
    const suono = id === this.mioId ? 1 : 0.9;
    this.audio.suona(e && e.stato === 'imbarcato' ? 'torretta' : SUONO_ARMA[c] || 'mitra', pos, suono, c === 'mitra' ? 0.05 : 0);
    if (id === this.mioId) this.scossa = Math.min(1, this.scossa + (c === 'railgun' ? 0.6 : c === 'cannone' ? 0.35 : c === 'mitra' ? 0.04 : 0.12));
  }

  raggio(ev) {
    let r = this.raggi.find((x) => x.t <= 0);
    if (!r) {
      if (this.raggi.length >= 30) return;
      const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.frustumCulled = false;
      this.scena.add(mesh);
      r = { mesh, t: 0, d: 0 };
      this.raggi.push(r);
    }
    const rail = ev.c === 'railgun';
    v1.set(ev.x1, ev.y1, ev.z1); v2.set(ev.x2, ev.y2, ev.z2);
    const len = v1.distanceTo(v2);
    r.mesh.position.copy(v1);
    r.mesh.lookAt(v2);
    r.w = rail ? 0.35 : 0.12;
    r.mesh.scale.set(r.w, r.w, len);
    r.mesh.material.color.set(rail ? 0x9ff6ff : RARITA[ev.r]?.colore || '#ff4060');
    if (!rail) r.mesh.material.color.set(ev.r >= 2 ? RARITA[ev.r].colore : '#ff4a6a');
    r.mesh.visible = true;
    r.t = r.d = rail ? 0.5 : 0.1;
    const n = rail ? 8 : 2;
    for (let i = 0; i < n; i++) this.fuoco.emetti(ev.x2, ev.y2, ev.z2, (Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10, 0.3, rail ? 0.7 : 0.35, 0.05, 0x9ff6ff, 20);
    if (rail) for (let i = 0; i < 12; i++) { const k = i / 12; this.fumo.emetti(ev.x1 + (ev.x2 - ev.x1) * k, ev.y1 + (ev.y2 - ev.y1) * k, ev.z1 + (ev.z2 - ev.z1) * k, 0, 0.5, 0, 1.2, 0.4, 1.2, 0xbfe8ff); }
  }

  anello(x, y, z, raggio, colore) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: colore, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    this.scena.add(mesh);
    this.anelli.push({ mesh, t: 0, d: 0.6, r: raggio });
  }

  esplosione(x, y, z, r) {
    const n = Math.min(26, 8 + r * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = r * (1.5 + Math.random() * 2);
      this.fuoco.emetti(x, y, z, Math.cos(a) * Math.cos(b) * v, Math.abs(Math.sin(b)) * v + 2, Math.sin(a) * Math.cos(b) * v, 0.45 + Math.random() * 0.3, r * 0.35, r * 0.05, i % 2 ? 0xff8a2a : 0xffd060, 0, 3);
    }
    this.fuoco.emetti(x, y, z, 0, 0, 0, 0.18, r * 0.4, r * 1.3, 0xfff0c0);
    for (let i = 0; i < n / 2; i++) this.fumo.emetti(x + (Math.random() - 0.5) * r, y + Math.random() * r * 0.5, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4, 1.6 + Math.random(), r * 0.3, r * 0.9, 0x4a4540, -1, 0.6);
    for (let i = 0; i < 6; i++) this.fumo.emetti(x, y, z, (Math.random() - 0.5) * 30, 10 + Math.random() * 14, (Math.random() - 0.5) * 30, 1.2, 0.3, 0.3, 0x222222, 30);
    this.audio.suona('esplosione', [x, y, z], Math.min(1.4, 0.5 + r / 8));
    const io = this.entita.get(this.mioId);
    if (io) { const d = io.pos.distanceTo(v1.set(x, y, z)); if (d < 60) this.scossa = Math.min(1.5, this.scossa + (1 - d / 60) * r / 8); }
  }

  avvisoMeteora(ev) {
    const anello = new THREE.Mesh(new THREE.RingGeometry(10, 11.2, 40), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    anello.rotation.x = -Math.PI / 2;
    anello.position.set(ev.x, ev.y + 0.4, ev.z);
    this.scena.add(anello);
    const sasso = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    this.scena.add(sasso);
    this.avvisi.push({ anello, sasso, x: ev.x, y: ev.y, z: ev.z, t: ev.t, d: ev.t });
    const io = this.entita.get(this.mioId);
    if (io && Math.hypot(io.pos.x - ev.x, io.pos.z - ev.z) < 14) this.audio.suona('allarme', null, 0.5, 0.5);
  }

  // ---------------- mira ----------------
  puntoMira() {
    const cam = this.camera;
    const o = cam.position;
    cam.getWorldDirection(v1);
    const d = v1;
    let t = this.mappa.lanciaRaggio(o.x, o.y, o.z, d.x, d.y, d.z, 900);
    for (const e of this.entita.values()) {
      if (e.r.id === this.mioId || e.alleato) continue;
      if (e.stato !== 'vivo' && e.stato !== 'drone') continue;
      const cy = e.stato === 'drone' ? e.pos.y : e.pos.y + 4.2;
      const lx = e.pos.x - o.x, ly = cy - o.y, lz = e.pos.z - o.z;
      const tc = lx * d.x + ly * d.y + lz * d.z;
      if (tc < 0 || tc > t) continue;
      const px = o.x + d.x * tc - e.pos.x, pz = o.z + d.z * tc - e.pos.z, py = o.y + d.y * tc - cy;
      const rr = e.stato === 'drone' ? 2.2 : 2.6;
      if (px * px + pz * pz < rr * rr && Math.abs(py) < (e.stato === 'drone' ? 2 : 4.3)) t = tc;
    }
    if (t < (this.distCam || 0) + 2) t = (this.distCam || 0) + 40;
    return [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
  }

  // ---------------- frame ----------------
  frame(dt, input, zoom) {
    this.tempo += dt;
    const io = this.entita.get(this.mioId);
    const emp = this.arena.emp > 0;

    // entità
    for (const e of this.entita.values()) {
      const mio = e.r.id === this.mioId;
      let tx = e.tgt.x, ty = e.tgt.y, tz = e.tgt.z;
      if (mio && this.pred && !this.host && (this.pred.stato === 'vivo' || this.pred.stato === 'lancio' || this.pred.stato === 'drone') && e.stato === this.pred.stato) { tx = this.pred.x; ty = this.pred.y; tz = this.pred.z; }
      let interp = null;
      if (!mio && !this.host && e.buf.length) { interp = this.interpola(e); tx = interp.x; ty = interp.y; tz = interp.z; }
      const k = 1 - Math.exp(-dt * (interp ? 25 : mio ? 22 : 12));
      if (e.pos.distanceToSquared(v1.set(tx, ty, tz)) > 900) e.pos.set(tx, ty, tz);
      else e.pos.lerp(v1, k);
      const yawT = mio && (e.stato === 'vivo' || e.stato === 'drone' || e.stato === 'lancio') ? input.yaw : interp ? interp.yaw : e.tyaw;
      let dy = yawT - e.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      e.yaw += dy * Math.min(1, dt * (mio || interp ? 30 : 12));
      const vivo = e.stato === 'vivo' || e.stato === 'lancio';
      e.modello.gruppo.visible = vivo && !(mio && this.cockpit && e.stato === 'vivo');
      e.drone.visible = e.stato === 'drone';
      if (vivo) {
        e.modello.gruppo.position.copy(e.pos);
        e.modello.gruppo.rotation.y = e.yaw;
        const vel = Math.hypot(e.vx, e.vz);
        e.modello.impostaTorretta(!!(e.flags & 256));
        e.modello.anima(dt, e.stato === 'lancio' ? 0 : vel, mio ? input.pitch * 0.8 : e.ap, e.flags | (e.stato === 'lancio' ? 8 : 0), this.tempo, e.hp);
        if (e.modello.torretta && e.flags & 256) e.modello.torretta.rotation.y = 0;
        const dCam0 = e.pos.distanceTo(this.camera.position);
        // passi
        if (e.stato === 'vivo' && vel > 2) {
          const f = Math.floor(e.modello.fase / Math.PI);
          if (f !== e.passoFase) {
            e.passoFase = f;
            if (!e.modello.cingoli.visible) {
              this.audio.suona('passo', [e.pos.x, e.pos.y, e.pos.z], 0.6);
              const lato = f % 2 ? 1 : -1, rx = -Math.cos(e.yaw) * lato * 1.2, rz = Math.sin(e.yaw) * lato * 1.2;
              for (let i = 0; i < 3; i++) this.fumo.emetti(e.pos.x + rx, e.pos.y + 0.3, e.pos.z + rz, (Math.random() - 0.5) * 5, 1 + Math.random(), (Math.random() - 0.5) * 5, 0.8, 0.5, 1.6, 0xb8a888, 0, 2);
              if (mio) this.scossa = Math.max(this.scossa, 0.12);
              else if (dCam0 < 40) this.scossa = Math.max(this.scossa, 0.08 * (1 - dCam0 / 40));
            }
          }
        }
        if (e.flags & 8 || e.stato === 'lancio') {
          e.jetT -= dt;
          if (e.jetT <= 0) { e.jetT = 0.05; this.fuoco.emetti(e.pos.x - Math.sin(e.yaw) * 1.4, e.pos.y + 2.6, e.pos.z - Math.cos(e.yaw) * 1.4, (Math.random() - 0.5) * 2, -14, (Math.random() - 0.5) * 2, 0.35, 0.8, 0.1, 0x8fd8ff); if (mio || Math.random() < 0.3) this.audio.suona('jet', [e.pos.x, e.pos.y, e.pos.z], 0.5, 0.12); }
        }
        if (e.flags & 1 && Math.random() < dt * 20) this.fuoco.emetti(e.pos.x + (Math.random() - 0.5) * 3, e.pos.y + 3 + Math.random() * 4, e.pos.z + (Math.random() - 0.5) * 3, 0, 4, 0, 0.3, 0.4, 0.05, 0xff5a1a);
        this.danniVisivi(e, dt);
        // vapore dagli scarichi: forte se surriscaldato, a sbuffi mentre spara
        if ((e.flags & 2 && Math.random() < dt * 30) || (e.flags & 128 && Math.random() < dt * 4)) {
          const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), l = Math.random() < 0.5 ? -1 : 1;
          this.fumo.emetti(e.pos.x - fx * 1.8 - fz * l, e.pos.y + 7.2, e.pos.z - fz * 1.8 + fx * l, -fx * 2 + (Math.random() - 0.5), 5 + Math.random() * 3, -fz * 2, 1.1, 0.5, 2.4, 0xe8eef2, -1, 0.8);
        }
        if (e.flags & 64 && Math.random() < dt * 25) this.fuoco.emetti(e.pos.x + Math.sin(e.yaw) * 4, e.pos.y + 3, e.pos.z + Math.cos(e.yaw) * 4, (Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12, 0.3, 0.3, 0.05, 0xffb040, 25);
      }
      if (e.stato === 'drone') {
        e.drone.position.copy(e.pos);
        e.drone.position.y += Math.sin(this.tempo * 3 + e.r.id) * 0.3;
        e.drone.rotation.y = e.yaw;
        for (const el of e.drone.userData.eliche) el.rotation.y += dt * 40;
      }
      // targa e taglia
      const dCam = e.pos.distanceTo(this.camera.position);
      const mostra = !mio && (vivo || e.stato === 'drone') && dCam < 200 && !(emp && !e.alleato);
      e.targa.visible = mostra;
      if (mostra) {
        e.targa.position.set(e.pos.x, e.pos.y + (e.stato === 'drone' ? 3 : 11), e.pos.z);
        e.targa.scale.set(8 * Math.max(1, dCam / 60), 2 * Math.max(1, dCam / 60), 1);
        disegnaTarga(e.targa, e.stato === 'drone' ? 0.5 : e.hp.t / e.max.t, e.flags & 32);
      }
      e.marcatore.visible = !!(e.flags & 32) && vivo && !mio;
      if (e.marcatore.visible) { e.marcatore.position.set(e.pos.x, e.pos.y + 13 + Math.sin(this.tempo * 4), e.pos.z); e.marcatore.rotation.y += dt * 3; }
    }

    // proiettili
    let nt = 0;
    for (const [id, p] of this.proiettili) {
      p.vita -= dt;
      if (p.vita <= 0) { this.proiettili.delete(id); continue; }
      if (p.h && p.tx != null) {
        const k = 1 - Math.exp(-dt * 15);
        const ox = p.x, oy = p.y, oz = p.z;
        p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.z += (p.tz - p.z) * k;
        if (Math.hypot(p.x - ox, p.y - oy, p.z - oz) > 0.01) { p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt; p.vz = (p.z - oz) / dt; }
      } else {
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      if (p.c === 'missili' || p.c === 'mortaio') { if (Math.random() < dt * 40) this.fumo.emetti(p.x, p.y, p.z, 0, 1, 0, 0.8, 0.5, 1.6, 0xcccccc); }
      if (nt >= 600) continue;
      const dim = DIM_PROIETTILE[p.c] || DIM_PROIETTILE.mitra;
      v1.set(p.vx, p.vy, p.vz);
      if (v1.lengthSq() < 0.01) v1.set(0, 0, 1);
      qq.setFromUnitVectors(ASSE_Z, v1.normalize());
      m4.compose(v2.set(p.x, p.y, p.z), qq, v1.set(dim[0], dim[1], dim[2]));
      this.tracce.setMatrixAt(nt, m4);
      this.tracce.setColorAt(nt, col.setHex(COL_PROIETTILE[p.c] || 0xffd27a));
      nt++;
    }
    this.tracce.count = nt;
    this.tracce.instanceMatrix.needsUpdate = true;
    if (this.tracce.instanceColor) this.tracce.instanceColor.needsUpdate = true;

    for (const r of this.raggi) {
      if (r.t <= 0) { r.mesh.visible = false; continue; }
      r.t -= dt;
      const k = Math.max(0, r.t / r.d);
      r.mesh.material.opacity = k;
      r.mesh.scale.x = r.mesh.scale.y = r.w * (0.4 + k * 0.6);
    }
    this.aggiornaDetriti(dt);
    this.anelli = this.anelli.filter((a) => {
      a.t += dt;
      const k = a.t / a.d;
      if (k >= 1) { a.mesh.removeFromParent(); a.mesh.geometry.dispose(); return false; }
      a.mesh.scale.setScalar(a.r * k);
      a.mesh.material.opacity = 1 - k;
      return true;
    });
    this.avvisi = this.avvisi.filter((a) => {
      a.t -= dt;
      if (a.t <= 0) { a.anello.removeFromParent(); a.sasso.removeFromParent(); return false; }
      const k = a.t / a.d;
      a.anello.material.opacity = 0.4 + Math.sin(this.tempo * 20) * 0.4;
      a.sasso.position.set(a.x + 50 * k, a.y + 200 * k, a.z + 30 * k);
      if (Math.random() < dt * 40) this.fuoco.emetti(a.sasso.position.x, a.sasso.position.y, a.sasso.position.z, 0, 0, 0, 0.5, 2.2, 0.3, 0xff6a20);
      return true;
    });
    for (const r of this.relitti.values()) {
      r.t += dt;
      if (Math.random() < dt * 5) this.fumo.emetti(r.x + (Math.random() - 0.5) * 3, r.y + 5, r.z + (Math.random() - 0.5) * 3, 0, 5, 0, 2, 1, 3, 0x2a2826, -1);
      if (Math.random() < dt * 8) this.fuoco.emetti(r.x + (Math.random() - 0.5) * 3, r.y + 3 + Math.random() * 3, r.z + (Math.random() - 0.5) * 3, 0, 3, 0, 0.4, 0.6, 0.1, 0xff6a20);
    }

    // cassa leggendaria
    const cs = this.arena.cassa;
    if (cs) {
      if (!this.cassaMesh) {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0x804000, metalness: 0.6, roughness: 0.3 }));
        box.position.y = 1.5;
        const fascio = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 400, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        fascio.position.y = 200;
        g.add(box, fascio);
        g.userData.box = box;
        this.scena.add(g);
        this.cassaMesh = g;
      }
      const suolo = this.mappa.altezzaSuolo(cs[0], cs[1], 999);
      this.cassaMesh.position.set(cs[0], suolo, cs[1]);
      this.cassaMesh.userData.box.position.y = 1.5 + (cs[3] ? 0 : Math.max(0, cs[2]) * 14);
      this.cassaMesh.userData.box.visible = !cs[3];
    } else if (this.cassaMesh) { this.cassaMesh.removeFromParent(); this.cassaMesh = null; }

    // zona
    const z = this.zona;
    this.muro.position.set(z.cx, 120, z.cz);
    this.muro.scale.set(Math.max(0.5, z.r), 320, Math.max(0.5, z.r));
    this.texZona.repeat.set(Math.max(1, Math.round(z.r / 8)), 1);
    this.texZona.offset.x = this.tempo * 0.05;

    this.aggiornaCamera(dt, input, zoom);
    this.centroCamera = io ? io.pos : this.camera.position;
    this.aggiornaBottino();
    this.fuoco.aggiorna(dt);
    this.fumo.aggiorna(dt);
    this.mondo.aggiorna(io ? io.pos : this.camera.position, dt);
    this.hud.aggiornaNumeri(this.camera, dt);
    const cp = this.camera.position;
    this.audio.ascoltatore(cp.x, cp.y, cp.z, input.yaw);
  }

  // ---------------- danni visibili ----------------
  danniVisivi(e, dt) {
    const scatti = e.modello.impostaDanni(e.hp, e.max);
    for (const sc of scatti) {
      const p = e.modello.puntoParte(sc.parte, v2);
      const n = sc.soglia === 0 ? 5 : 2;
      for (let i = 0; i < n; i++) this.detrito(p, e);
      for (let i = 0; i < (sc.soglia === 0 ? 18 : 8); i++) this.fuoco.emetti(p.x, p.y, p.z, (Math.random() - 0.5) * 16, Math.random() * 12, (Math.random() - 0.5) * 16, 0.4, 0.3, 0.05, 0xffb040, 30);
      if (sc.soglia === 0) { this.fumo.emetti(p.x, p.y, p.z, 0, 3, 0, 1.2, 1, 3, 0x2a2826); this.audio.suona('colpo', [p.x, p.y, p.z], 1); }
    }
    const d = e.modello.danni;
    for (const parte of ['bs', 'bd', 'g', 't']) {
      const r = d[parte];
      if (r >= 0.5 || (parte === 'g' && e.modello.cingoli.visible)) continue;
      const k = 1 - r;
      if (Math.random() < dt * 5 * k) {
        const p = e.modello.puntoParte(parte, v2);
        for (let i = 0; i < 3; i++) this.fuoco.emetti(p.x, p.y, p.z, (Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8, 0.3, 0.18, 0.03, 0xffd080, 28);
      }
      if (r < 0.3 && Math.random() < dt * 4 * k) {
        const p = e.modello.puntoParte(parte, v2);
        this.fumo.emetti(p.x, p.y, p.z, (Math.random() - 0.5), 3 + Math.random() * 2, (Math.random() - 0.5), 1.5, 0.5, 2.2, 0x2f2d2b, -1);
        if (parte === 't' && r < 0.2) this.fuoco.emetti(p.x, p.y, p.z, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2, 0.45, 0.6, 0.1, 0xff6a20);
      }
    }
  }

  detrito(p, e) {
    if (this.detriti.length >= 60) { const vecchio = this.detriti.shift(); vecchio.mesh.removeFromParent(); }
    const colore = PARTI.finitura[e.r.aspetto.finitura]?.primario || '#888888';
    if (!this.matDetriti.has(colore)) this.matDetriti.set(colore, new THREE.MeshStandardMaterial({ color: colore, metalness: 0.5, roughness: 0.6 }));
    const mesh = new THREE.Mesh(this.geoDetrito, this.matDetriti.get(colore));
    const s = 0.4 + Math.random() * 0.6;
    mesh.scale.setScalar(s);
    mesh.position.copy(p);
    mesh.castShadow = true;
    this.scena.add(mesh);
    this.detriti.push({ mesh, vx: (Math.random() - 0.5) * 14, vy: 6 + Math.random() * 8, vz: (Math.random() - 0.5) * 14, rx: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14, t: 0 });
  }

  aggiornaDetriti(dt) {
    this.detriti = this.detriti.filter((d) => {
      d.t += dt;
      if (d.t > 6) { d.mesh.removeFromParent(); return false; }
      const m = d.mesh;
      d.vy -= 30 * dt;
      m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      m.rotation.x += d.rx * dt; m.rotation.z += d.rz * dt;
      const suolo = this.mappa.altezza(m.position.x, m.position.z) + 0.1;
      if (m.position.y < suolo) {
        m.position.y = suolo;
        d.vy = Math.abs(d.vy) > 3 ? -d.vy * 0.35 : 0;
        d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5;
      }
      if (d.t > 5) m.scale.multiplyScalar(0.95);
      return true;
    });
  }

  // crea in anticipo i raggi (laser/railgun) così i loro materiali vengono compilati subito
  preriscalda() {
    for (let i = 0; i < 6; i++) this.raggio({ c: i % 2 ? 'railgun' : 'laser', r: 0, x1: 0, y1: -500, z1: 0, x2: 0, y2: -499, z2: 0 });
    for (const r of this.raggi) r.t = 0;
  }

  // posizione di un mech remoto leggermente nel passato (ritardo adattivo), tra due snapshot o poco oltre l'ultimo
  interpola(e) {
    const b = e.buf, t = performance.now() / 1000 + this.offServer - this.ritardo;
    if (t <= b[0].t) return b[0];
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (t >= a.t && t <= c.t) {
        const k = (t - a.t) / (c.t - a.t || 1);
        let dy = c.yaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k, yaw: a.yaw + dy * k };
      }
    }
    const u = b[b.length - 1], ex = Math.min(0.35, t - u.t);
    return { x: u.x + e.vx * ex, y: u.y, z: u.z + e.vz * ex, yaw: u.yaw };
  }

  bersaglioCamera() {
    const io = this.entita.get(this.mioId);
    if (!io) return null;
    if (io.stato === 'imbarcato') return this.entita.get(io.su) || io;
    if (io.stato !== 'morto') return io;
    let e = this.spettaId && this.entita.get(this.spettaId);
    if (!e || (e.stato !== 'vivo' && e.stato !== 'lancio')) {
      const vivi = [...this.entita.values()].filter((x) => x.stato === 'vivo');
      e = vivi.find((x) => x.alleato) || vivi[0];
      this.spettaId = e ? e.r.id : null;
    }
    return e || io;
  }

  cambiaSpettato() {
    const vivi = [...this.entita.values()].filter((x) => x.stato === 'vivo');
    if (!vivi.length) return;
    const i = vivi.findIndex((x) => x.r.id === this.spettaId);
    this.spettaId = vivi[(i + 1) % vivi.length].r.id;
  }

  aggiornaCamera(dt, input, zoom) {
    const io = this.entita.get(this.mioId);
    const e = this.bersaglioCamera();
    if (!e) return;
    const yaw = input.yaw, pitch = input.pitch;
    const dir = v1.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const cam = this.camera;
    const drone = e.stato === 'drone';
    const ottica = io && io.slot[5]?.c === 'ottica';
    const fovT = zoom ? (ottica ? 22 : 48) : this.imp.fov;
    this.fovAtt += (fovT - this.fovAtt) * Math.min(1, dt * 12);
    if (Math.abs(cam.fov - this.fovAtt) > 0.01) { cam.fov = this.fovAtt; cam.updateProjectionMatrix(); }
    if (this.cockpit && io && io.stato === 'vivo' && e === io) {
      cam.position.set(e.pos.x + Math.sin(yaw) * 1.2, e.pos.y + 7.7, e.pos.z + Math.cos(yaw) * 1.2);
      this.distCam = 0;
    } else {
      const piv = v2.set(e.pos.x, e.pos.y + (drone ? 1.5 : 8.6), e.pos.z);
      let dist = drone ? 9 : 13 + (e.max.raggio || 2) * 1.2;
      if (zoom) dist *= 0.7;
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const lat = drone ? 0 : 2.2;
      const bx = -dir.x * dist + rx * lat, by = -dir.y * dist + 1, bz = -dir.z * dist + rz * lat;
      const bl = Math.hypot(bx, by, bz);
      const libera = this.mappa.lanciaRaggio(piv.x, piv.y, piv.z, bx / bl, by / bl, bz / bl, bl);
      const k = Math.max(0.15, (libera - 0.8) / bl);
      cam.position.set(piv.x + bx * k, piv.y + by * k, piv.z + bz * k);
      const suolo = this.mappa.altezza(cam.position.x, cam.position.z) + 1.2;
      if (cam.position.y < suolo) cam.position.y = suolo;
      this.distCam = bl * k;
    }
    if (this.scossa > 0) {
      this.scossa = Math.max(0, this.scossa - dt * 3);
      const s = this.scossa * 0.35;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z);
  }

  // ---------------- dati per l'HUD ----------------
  statoHud(fps, ping, formato) {
    const io = this.entita.get(this.mioId);
    const tu = this.tu;
    const radar = io ? Math.max(statsDaAspetto(io.r.aspetto).radar, io.slot[5]?.c === 'radar' ? OGGETTI.radar.raggio : 0) : 0;
    const centro = this.bersaglioCamera()?.pos || this.camera.position;
    const entita = [];
    let taglia = null;
    for (const e of this.entita.values()) {
      if (e.r.id === this.mioId) continue;
      if (e.stato !== 'vivo' && e.stato !== 'drone' && e.stato !== 'lancio') continue;
      const d = io ? Math.hypot(e.pos.x - io.pos.x, e.pos.z - io.pos.z) : 9999;
      if (e.flags & 32) taglia = e.r.nome;
      entita.push({ x: e.pos.x, z: e.pos.z, yaw: e.yaw, alleato: e.alleato, stato: e.stato, taglia: !!(e.flags & 32), radar: d < radar && e.stato !== 'drone' });
    }
    let prompt = null;
    if (io && io.stato === 'vivo') {
      let best = null, bd = PORTATA_RACCOLTA;
      for (const b of this.bottino.values()) {
        if (Math.abs(b.y - io.pos.y) > 7) continue;
        const d = Math.hypot(b.x - io.pos.x, b.z - io.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        const def = OGGETTI[best.c];
        const rar = def.cat === 'rottami' ? '' : ` <span style="color:${RARITA[best.r].colore}">${RARITA[best.r].nome}</span>`;
        prompt = `<kbd>E</kbd>${def.cat === 'rottami' ? 'Ripara con' : 'Monta'} ${def.nome}${rar}` + (def.cat === 'arma' ? ` &nbsp; <kbd>G</kbd>Rastrelliera` : '');
      } else {
        for (const r of this.relitti.values()) {
          if (Math.hypot(r.x - io.pos.x, r.z - io.pos.z) < STRAPPO.distanza) { prompt = '<kbd>E</kbd>Tieni premuto: STRAPPA un arto dal relitto'; break; }
        }
        if (!prompt && formato !== 'tutti') {
          for (const e of this.entita.values()) {
            if (e !== io && e.alleato && e.stato === 'vivo' && !(e.flags & 256) && Math.hypot(e.pos.x - io.pos.x, e.pos.z - io.pos.z) < 11) { prompt = `<kbd>F</kbd>Sali a bordo di ${this.esc(e.r.nome)} come artigliere`; break; }
          }
        }
      }
    }
    let spettatore = null;
    if (io && io.stato === 'morto') {
      const t = this.entita.get(this.spettaId);
      spettatore = t ? `Osservi <b>${this.esc(t.r.nome)}</b> · CLIC per cambiare · ESC per uscire` : 'Partita in corso…';
    }
    const ioHud = io ? { stato: io.stato, x: io.pos.x, z: io.pos.z, yaw: io.yaw, hp: io.hp, max: io.max, slot: io.slot, flags: io.flags } : null;
    return {
      io: ioHud, tu, zona: this.zona, vivi: this.vivi, sq: this.sq, squadre: formato !== 'tutti', tempo: this.tm,
      emp: this.arena.emp > 0, meteore: !!this.arena.meteore, cassa: this.arena.cassa || null, taglia,
      entita, centro: [centro.x, centro.z],
      nuclei: io && io.stato === 'drone' ? [...this.nuclei.values()].map((n) => [n.x, n.z]) : null,
      prompt, spettatore, fps, ping,
    };
  }

  ridimensiona() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  distruggi() {
    this.scena.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
