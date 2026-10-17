// RobotWar — tastiera, mouse (pointer lock) e comandi touch

const AZIONI = { KeyE: 'E', KeyG: 'G', KeyQ: 'Q', KeyR: 'R', KeyX: 'X', KeyF: 'F', Digit1: 's0', Digit2: 's1', Digit3: 's2', Digit4: 's3' };

export class Input {
  constructor(canvas, callback) {
    this.canvas = canvas;
    this.cb = callback; // { mappa, camera, minimappa(+/-), chat, pausa, debug }
    this.tasti = new Set();
    this.f1 = false; this.f2 = false;
    this.yaw = 0; this.pitch = 0;
    this.sens = 1; this.invertiY = false;
    this.azioni = [];
    this.attivo = false;       // in partita
    this.bloccato = false;     // chat/mappa/pausa aperte
    this.joy = { x: 0, y: 0 };
    this.touchTasti = new Set();
    this.touch = false;

    addEventListener('keydown', (e) => this.giu(e));
    addEventListener('keyup', (e) => this.tasti.delete(e.code));
    addEventListener('blur', () => { this.tasti.clear(); this.f1 = this.f2 = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.attivo) return;
      if (document.pointerLockElement !== canvas) { this.blocca(); return; }
      if (e.button === 0) this.f1 = true;
      if (e.button === 2) this.f2 = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.f1 = false; if (e.button === 2) this.f2 = false; });
    addEventListener('contextmenu', (e) => { if (this.attivo) e.preventDefault(); });
    addEventListener('mousemove', (e) => {
      if (!this.attivo || document.pointerLockElement !== canvas) return;
      this.ruota(e.movementX, e.movementY, 0.0022);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.attivo && !this.bloccato) this.cb.pausa?.();
    });
    this.preparaTouch();
  }

  ruota(dx, dy, k) {
    this.yaw -= dx * k * this.sens;
    this.pitch -= dy * k * this.sens * (this.invertiY ? -1 : 1);
    this.pitch = Math.max(-1.25, Math.min(1.2, this.pitch));
  }

  blocca() {
    if (this.touch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignora */ }
  }
  sblocca() { if (document.pointerLockElement) document.exitPointerLock(); }

  giu(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) {
      if (e.code === 'Escape' && t.id === 'chat-input') { t.blur(); this.cb.chat?.(false); }
      return;
    }
    if (!this.attivo) return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Enter') { e.preventDefault(); this.cb.chat?.(true); return; }
    if (e.code === 'Escape') { this.cb.pausa?.(); return; }
    if (e.code === 'KeyM') { this.cb.mappa?.(); return; }
    if (e.code === 'KeyC') { this.cb.camera?.(); return; }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { this.cb.minimappa?.(1); return; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { this.cb.minimappa?.(-1); return; }
    if (e.code === 'F9') { e.preventDefault(); this.cb.debug?.(); return; }
    if (this.bloccato) return;
    this.tasti.add(e.code);
    if (AZIONI[e.code]) this.azioni.push(AZIONI[e.code]);
    if (e.code === 'Space') e.preventDefault();
  }

  premi(a) { this.azioni.push(a); }

  campiona() {
    const k = this.tasti, tt = this.touchTasti;
    const out = { mx: 0, mz: 0, boost: false, f1: false, f2: false, tieniE: false, zoom: false, a: [] };
    if (this.attivo && !this.bloccato) {
      out.mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      out.mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      if (this.joy.x || this.joy.y) { out.mx = this.joy.x; out.mz = -this.joy.y; }
      out.boost = k.has('Space') || tt.has('boost');
      out.f1 = this.f1 || tt.has('f1');
      out.f2 = this.f2 || tt.has('f2');
      out.tieniE = k.has('KeyE') || tt.has('E');
      out.zoom = k.has('KeyZ');
      out.a = this.azioni;
    }
    this.azioni = [];
    return out;
  }

  preparaTouch() {
    const tocco = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.touchDisponibile = tocco;
    const joy = document.getElementById('joy'), pom = document.getElementById('joy-pomello');
    let joyId = null, cx = 0, cy = 0;
    const R = 55;
    joy.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; joyId = t.identifier;
      const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - cx, dy = t.clientY - cy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.joy.x = dx / R; this.joy.y = dy / R;
          pom.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === this.guardaId) {
          this.ruota(t.clientX - this.gx, t.clientY - this.gy, 0.005);
          this.gx = t.clientX; this.gy = t.clientY;
        }
      }
    }, { passive: true });
    const fine = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; this.joy.x = this.joy.y = 0; pom.style.transform = ''; }
        if (t.identifier === this.guardaId) this.guardaId = null;
      }
    };
    addEventListener('touchend', fine);
    addEventListener('touchcancel', fine);
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.attivo) return;
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth * 0.35 && this.guardaId == null) { this.guardaId = t.identifier; this.gx = t.clientX; this.gy = t.clientY; }
      }
    }, { passive: true });
    document.querySelectorAll('#touch button').forEach((b) => {
      const t = b.dataset.t;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        b.classList.add('premuto');
        if (t === 'M') { this.cb.mappa?.(); return; }
        if (t === 'ESC') { this.cb.pausa?.(); return; }
        this.touchTasti.add(t);
        if (['E', 'G', 'Q', 'R', 'X', 'F'].includes(t)) this.azioni.push(t);
      }, { passive: false });
      const su = () => { b.classList.remove('premuto'); this.touchTasti.delete(t); };
      b.addEventListener('touchend', su);
      b.addEventListener('touchcancel', su);
    });
  }

  impostaTouch(attivo) {
    this.touch = attivo;
    document.getElementById('touch').classList.toggle('attivo', attivo);
    document.body.classList.toggle('touch', attivo);
  }
}
