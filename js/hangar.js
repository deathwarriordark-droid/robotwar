// RobotWar — baia hangar: anteprima 3D del mech e scelta delle parti
import * as THREE from 'three';
import { PARTI, TELAI, statsDaAspetto } from './config.js';
import { ModelloMech } from './mech.js';

const ETICHETTE = { testa: 'TESTA', torso: 'TORSO', braccia: 'BRACCIA', gambe: 'GAMBE', finitura: 'FINITURA', livrea: 'LIVREA', luci: 'LUCI', emblema: 'EMBLEMA' };

export class Hangar {
  constructor(aspetto, suCambio) {
    this.aspetto = { ...aspetto };
    this.suCambio = suCambio;
    this.scena = new THREE.Scene();
    this.scena.background = new THREE.Color(0x0d131a);
    this.scena.fog = new THREE.Fog(0x0d131a, 30, 90);
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 200);
    this.angolo = 0.6;

    const pav = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x252d38, metalness: 0.6, roughness: 0.4 }));
    pav.position.y = -0.3;
    const anello = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.08, 6, 64), new THREE.MeshBasicMaterial({ color: 0xff6a2e }));
    anello.rotation.x = Math.PI / 2;
    const griglia = new THREE.GridHelper(120, 60, 0x2a3644, 0x18212b);
    griglia.position.y = -0.6;
    this.scena.add(pav, anello, griglia);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), new THREE.MeshStandardMaterial({ color: 0x1b232d, metalness: 0.5, roughness: 0.6 }));
      col.position.set(Math.cos(a) * 26, 10, Math.sin(a) * 26);
      const luce = new THREE.Mesh(new THREE.BoxGeometry(0.3, 18, 0.3), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x5cff6a : 0x3fa9ff }));
      luce.position.set(Math.cos(a) * 25.3, 10, Math.sin(a) * 25.3);
      this.scena.add(col, luce);
    }
    this.scena.add(new THREE.HemisphereLight(0xbfd8ff, 0x20242a, 1.1));
    const sp = new THREE.SpotLight(0xffffff, 900, 60, 0.6, 0.5);
    sp.position.set(6, 22, 10);
    this.scena.add(sp);
    const contro = new THREE.DirectionalLight(0xff8a50, 1.2);
    contro.position.set(-10, 8, -12);
    this.scena.add(contro);

    this.modello = null;
    this.ricostruisci();
    this.costruisciUI();
  }

  ricostruisci() {
    if (this.modello) this.modello.dispose();
    this.modello = new ModelloMech(this.aspetto);
    this.modello.impostaSlot('|||||||');
    this.scena.add(this.modello.gruppo);
  }

  costruisciUI() {
    const telai = document.getElementById('telai');
    telai.innerHTML = '';
    for (const t of TELAI) {
      const b = document.createElement('button');
      b.innerHTML = `${t.nome}`;
      b.title = t.desc;
      b.onclick = () => { Object.assign(this.aspetto, t.parti); this.aggiorna(); };
      telai.appendChild(b);
    }
    const parti = document.getElementById('parti');
    parti.innerHTML = '';
    this.valori = {};
    for (const k of Object.keys(ETICHETTE)) {
      const r = document.createElement('div');
      r.className = 'parte';
      r.innerHTML = `<span class="etichetta">${ETICHETTE[k]}</span><button>‹</button><div class="valore"></div><button>›</button>`;
      const [sx, dx] = r.querySelectorAll('button');
      const n = PARTI[k].length;
      sx.onclick = () => { this.aspetto[k] = ((this.aspetto[k] || 0) + n - 1) % n; this.aggiorna(); };
      dx.onclick = () => { this.aspetto[k] = ((this.aspetto[k] || 0) + 1) % n; this.aggiorna(); };
      this.valori[k] = r.querySelector('.valore');
      parti.appendChild(r);
    }
    this.aggiornaTesti();
  }

  aggiornaTesti() {
    for (const k of Object.keys(ETICHETTE)) {
      const p = PARTI[k][this.aspetto[k] || 0];
      this.valori[k].innerHTML = `${p.nome}<small>${p.desc || ''}</small>`;
    }
    const s = statsDaAspetto(this.aspetto);
    const barra = (v, max) => `<span style="display:inline-block;width:${Math.round((v / max) * 90)}px;height:6px;background:var(--verde);margin-right:6px"></span>`;
    document.getElementById('stat-mech').innerHTML = [
      ['Scafo', s.t, 320], ['Braccia', s.b, 115], ['Gambe', s.g, 145], ['Velocità', Math.round(s.vel * 10) / 10, 17], ['Radar', s.radar, 230],
    ].map(([n, v, m]) => `<div class="riga"><span>${n}</span><span>${barra(v, m)}<b>${v}</b></span></div>`).join('');
  }

  aggiorna() {
    this.ricostruisci();
    this.aggiornaTesti();
    this.suCambio({ ...this.aspetto });
  }

  frame(dt, disegna) {
    this.angolo += dt * 0.25;
    const d = 25;
    const spostX = innerWidth > 900 ? -1.5 : 0;
    this.camera.position.set(Math.sin(this.angolo) * d, 8, Math.cos(this.angolo) * d);
    this.camera.lookAt(spostX * Math.cos(this.angolo), 4.8, spostX * -Math.sin(this.angolo));
    this.modello.anima(dt, 0, Math.sin(performance.now() / 1500) * 0.15, 0, performance.now() / 1000, null);
    disegna(this.scena, this.camera);
  }

  ridimensiona() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
