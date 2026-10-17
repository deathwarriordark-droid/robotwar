// RobotWar — effetti sonori e musica sintetizzati con WebAudio (nessun file audio)

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { generale: 0.6, effetti: 0.8, musica: 0.35 };
    this.asc = { x: 0, y: 0, z: 0, yaw: 0 };
    this.ultimi = new Map();
    this.brano = null;
  }

  avvia() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.mus = this.ctx.createGain(); this.mus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.rumore = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.rumore.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.impostaVolumi(this.vol);
    if (this.branoRichiesto) this.musica(this.branoRichiesto);
  }

  impostaVolumi(v) {
    this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    this.master.gain.value = this.vol.generale;
    this.sfx.gain.value = this.vol.effetti;
    this.mus.gain.value = this.vol.musica * 0.5;
  }

  ascoltatore(x, y, z, yaw) { this.asc = { x, y, z, yaw }; }

  // uscita con volume e pan in base alla distanza
  uscita(pos, forza) {
    const g = this.ctx.createGain();
    let vol = forza, pan = 0;
    if (pos) {
      const dx = pos[0] - this.asc.x, dy = pos[1] - this.asc.y, dz = pos[2] - this.asc.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 550) return null;
      vol *= 1 / (1 + (d * d) / 2500);
      const rx = -Math.cos(this.asc.yaw), rz = Math.sin(this.asc.yaw);
      pan = d > 1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    }
    if (vol < 0.01) return null;
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  osc(dest, tipo, f0, f1, t0, dur, vol = 1) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  rum(dest, tipoF, f0, f1, t0, dur, vol = 1, q = 1) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.rumore;
    s.loop = true;
    f.type = tipoF; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  suona(nome, pos = null, forza = 1, minIntervallo = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (minIntervallo) {
      const k = nome + (pos ? Math.round(pos[0] / 20) + ':' + Math.round(pos[2] / 20) : '');
      const t = this.ctx.currentTime;
      if (t - (this.ultimi.get(k) || 0) < minIntervallo) return;
      this.ultimi.set(k, t);
    }
    const o = this.uscita(pos, forza);
    if (!o) return;
    const t = this.ctx.currentTime;
    switch (nome) {
      case 'mitra': this.rum(o, 'bandpass', 2200, 900, t, 0.08, 0.7, 1.2); this.osc(o, 'square', 180, 60, t, 0.05, 0.25); break;
      case 'torretta': this.rum(o, 'bandpass', 2600, 1200, t, 0.06, 0.5, 1.5); break;
      case 'dispersione': this.rum(o, 'lowpass', 2400, 300, t, 0.3, 1.1); this.osc(o, 'sine', 120, 40, t, 0.2, 0.6); break;
      case 'cannone': this.rum(o, 'lowpass', 1200, 120, t, 0.5, 1.2); this.osc(o, 'sine', 90, 30, t, 0.4, 0.9); break;
      case 'laser': this.osc(o, 'square', 1500, 280, t, 0.13, 0.35); this.osc(o, 'sine', 2400, 900, t, 0.1, 0.2); break;
      case 'railgun': this.osc(o, 'sawtooth', 300, 3000, t, 0.12, 0.35); this.rum(o, 'highpass', 3000, 800, t + 0.08, 0.45, 0.9); this.osc(o, 'sine', 70, 30, t + 0.08, 0.5, 0.9); break;
      case 'fiamma': this.rum(o, 'bandpass', 700, 400, t, 0.18, 0.45, 0.7); break;
      case 'missili': this.rum(o, 'bandpass', 500, 1800, t, 0.5, 0.6, 2); break;
      case 'mortaio': this.osc(o, 'sine', 160, 50, t, 0.3, 1); this.rum(o, 'lowpass', 900, 200, t, 0.2, 0.6); break;
      case 'pugni': this.osc(o, 'sine', 110, 40, t, 0.18, 0.9); this.rum(o, 'lowpass', 600, 200, t, 0.1, 0.5); break;
      case 'lama': this.osc(o, 'sawtooth', 1100, 180, t, 0.22, 0.3); this.rum(o, 'highpass', 4000, 1500, t, 0.15, 0.35); break;
      case 'esplosione': this.rum(o, 'lowpass', 1400, 60, t, 1.3, 1.4); this.osc(o, 'sine', 70, 25, t, 0.9, 1.1); break;
      case 'colpo': this.osc(o, 'square', 420, 160, t, 0.07, 0.3); this.rum(o, 'highpass', 3000, 2000, t, 0.06, 0.35); break;
      case 'impatto': this.rum(o, 'lowpass', 1500, 400, t, 0.07, 0.35); break;
      case 'hit': this.osc(o, 'sine', 1300, 1100, t, 0.05, 0.35); break;
      case 'kill': this.osc(o, 'square', 660, 660, t, 0.09, 0.25); this.osc(o, 'square', 990, 990, t + 0.09, 0.16, 0.25); break;
      case 'monta': [523, 659, 784].forEach((f, i) => this.osc(o, 'triangle', f, f, t + i * 0.06, 0.12, 0.35)); break;
      case 'scatto': this.rum(o, 'bandpass', 600, 2400, t, 0.3, 0.7, 1.5); break;
      case 'jet': this.rum(o, 'bandpass', 900, 700, t, 0.16, 0.35, 0.8); break;
      case 'passo': this.osc(o, 'sine', 65, 35, t, 0.14, 0.5); this.rum(o, 'lowpass', 300, 100, t, 0.08, 0.3); break;
      case 'atterra': this.osc(o, 'sine', 80, 25, t, 0.6, 1.2); this.rum(o, 'lowpass', 700, 80, t, 0.6, 0.9); break;
      case 'od': this.osc(o, 'sawtooth', 180, 900, t, 0.6, 0.35); this.osc(o, 'square', 90, 450, t, 0.6, 0.2); break;
      case 'surr': this.osc(o, 'square', 500, 90, t, 0.5, 0.3); this.rum(o, 'highpass', 5000, 3000, t, 0.7, 0.3); break;
      case 'emp': this.osc(o, 'square', 1600, 80, t, 0.7, 0.35); this.osc(o, 'sine', 60, 60, t, 0.7, 0.6); break;
      case 'annuncio': this.osc(o, 'triangle', 880, 880, t, 0.12, 0.3); this.osc(o, 'triangle', 1320, 1320, t + 0.13, 0.2, 0.3); break;
      case 'allarme': for (let i = 0; i < 3; i++) this.osc(o, 'square', 740, 740, t + i * 0.18, 0.1, 0.18); break;
      case 'strappo': this.rum(o, 'bandpass', 1200, 300, t, 0.8, 0.8, 4); this.osc(o, 'sawtooth', 220, 90, t, 0.8, 0.25); break;
      case 'nucleo': [880, 1175, 1568].forEach((f, i) => this.osc(o, 'sine', f, f, t + i * 0.05, 0.15, 0.3)); break;
      case 'drone': this.osc(o, 'sine', 300, 120, t, 1.0, 0.4); break;
      case 'rientro': [392, 523, 659, 784, 1046].forEach((f, i) => this.osc(o, 'triangle', f, f, t + i * 0.08, 0.25, 0.35)); break;
      case 'ricarica': this.osc(o, 'square', 300, 300, t, 0.04, 0.2); this.osc(o, 'square', 420, 420, t + 0.12, 0.05, 0.2); break;
      case 'clic': this.osc(o, 'triangle', 700, 500, t, 0.05, 0.25); break;
      case 'vittoria': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.osc(o, 'triangle', f, f, t + i * 0.14, 0.3, 0.4)); break;
      case 'sconfitta': [392, 349, 311, 262].forEach((f, i) => this.osc(o, 'triangle', f, f, t + i * 0.2, 0.35, 0.35)); break;
    }
  }

  // Musica generativa molto semplice: basso + arpeggio in scala minore
  musica(tipo) {
    this.branoRichiesto = tipo;
    if (!this.ctx) return;
    if (this.brano) { clearInterval(this.brano); this.brano = null; }
    if (!tipo) return;
    const scala = [0, 3, 5, 7, 10, 12, 15];
    const radici = tipo === 'hangar' ? [45, 41, 43, 40] : [40, 40, 43, 38];
    const bpm = tipo === 'hangar' ? 84 : 118;
    const passo = 60 / bpm / 2;
    let i = 0;
    const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const prossimo = () => {
      if (this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.05;
      const radice = radici[Math.floor(i / 16) % radici.length];
      if (i % 4 === 0 || (tipo !== 'hangar' && i % 4 === 3)) this.osc(this.mus, 'triangle', freq(radice - 12), freq(radice - 12), t, passo * 1.8, 0.5);
      if (tipo !== 'hangar' && i % 8 === 4) this.rum(this.mus, 'highpass', 6000, 6000, t, 0.06, 0.12);
      if (tipo !== 'hangar' && i % 4 === 0) this.osc(this.mus, 'sine', 120, 40, t, 0.15, 0.4);
      if (Math.random() < (tipo === 'hangar' ? 0.45 : 0.6)) {
        const n = radice + 12 + scala[Math.floor(Math.random() * scala.length)];
        this.osc(this.mus, 'sine', freq(n), freq(n), t, passo * 2.5, 0.12);
      }
      if (i % 32 === 0) {
        for (const iv of [0, 7, 15]) this.osc(this.mus, 'sawtooth', freq(radice + iv), freq(radice + iv), t, passo * 30, 0.025);
      }
      i++;
    };
    this.brano = setInterval(prossimo, passo * 1000);
  }
}
