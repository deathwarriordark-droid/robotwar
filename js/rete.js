// RobotWar — multiplayer peer-to-peer con PeerJS (WebRTC). L'host fa da server nel browser.
// Due canali per ogni giocatore:
//  - "affidabile" (ordinato): lobby, chat, eventi di gioco, inizio e fine partita
//  - "veloce" (non ordinato): posizioni e comandi, così un pacchetto in ritardo non blocca gli altri
import { PREFISSO_PEER, ICE_SERVER } from './config.js';

const OPZ_PEER = { debug: 1, config: { iceServers: ICE_SERVER, sdpSemantics: 'unified-plan' } };

export class Rete {
  constructor() {
    this.peer = null;
    this.host = false;
    this.conns = new Map();   // pid -> canale affidabile
    this.veloci = new Map();  // pid -> canale veloce
    this.connHost = null;
    this.connHostVeloce = null;
    this.suMessaggio = () => {};
    this.suEntrata = () => {};
    this.suUscita = () => {};
  }

  get id() { return this.peer ? this.peer.id : null; }

  ospita(codice) {
    return new Promise((ok, ko) => {
      if (!window.Peer) { ko(new Error('PeerJS non caricato: controlla la connessione')); return; }
      this.host = true;
      let aperto = false;
      this.peer = new window.Peer(PREFISSO_PEER + codice, OPZ_PEER);
      this.peer.on('open', (id) => { aperto = true; ok(id); });
      this.peer.on('error', (e) => { if (!aperto) ko(e); else console.warn('PeerJS', e.type || e); });
      // se cade il collegamento col server di segnalazione, le partite in corso continuano: si riprova
      this.peer.on('disconnected', () => { setTimeout(() => { try { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); } catch { /* ignora */ } }, 1000); });
      this.peer.on('connection', (conn) => {
        const veloce = conn.label === 'veloce';
        conn.on('open', () => {
          if (veloce) { this.veloci.set(conn.peer, conn); return; }
          this.conns.set(conn.peer, conn);
          this.suEntrata(conn.peer);
        });
        conn.on('data', (d) => this.suMessaggio(conn.peer, d));
        const chiusa = () => {
          if (veloce) { if (this.veloci.get(conn.peer) === conn) this.veloci.delete(conn.peer); return; }
          if (this.conns.get(conn.peer) === conn) { this.conns.delete(conn.peer); this.suUscita(conn.peer); }
        };
        conn.on('close', chiusa);
        conn.on('error', chiusa);
      });
    });
  }

  unisciti(codice) {
    return new Promise((ok, ko) => {
      if (!window.Peer) { ko(new Error('PeerJS non caricato: controlla la connessione')); return; }
      this.host = false;
      let fatto = false;
      this.peer = new window.Peer(OPZ_PEER);
      const fallisci = (e) => { if (!fatto) { fatto = true; ko(e); } };
      this.peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') fallisci(new Error('Stanza non trovata: controlla il codice'));
        else fallisci(e);
      });
      this.peer.on('disconnected', () => { setTimeout(() => { try { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); } catch { /* ignora */ } }, 1000); });
      this.peer.on('open', () => {
        const dest = PREFISSO_PEER + codice;
        const conn = this.peer.connect(dest, { label: 'affidabile', reliable: true, serialization: 'json' });
        const timer = setTimeout(() => fallisci(new Error('Nessuna risposta dalla stanza: controlla il codice o riprova')), 25000);
        conn.on('open', () => {
          clearTimeout(timer);
          this.connHost = conn;
          fatto = true;
          ok(this.peer.id);
          const v = this.peer.connect(dest, { label: 'veloce', reliable: false, serialization: 'json' });
          v.on('open', () => { this.connHostVeloce = v; });
          v.on('data', (d) => this.suMessaggio('host', d));
          v.on('close', () => { if (this.connHostVeloce === v) this.connHostVeloce = null; });
        });
        conn.on('data', (d) => this.suMessaggio('host', d));
        conn.on('close', () => { if (this.connHost === conn) this.suUscita('host'); });
        conn.on('error', (e) => fallisci(e));
      });
    });
  }

  manda(c, msg) {
    if (c && c.open) { try { c.send(msg); return true; } catch (e) { console.warn(e); } }
    return false;
  }

  invia(pid, msg) { this.manda(this.conns.get(pid), msg); }
  // canale veloce, con ripiego su quello affidabile se il veloce non è (ancora) aperto
  inviaVeloce(pid, msg) { if (!this.manda(this.veloci.get(pid), msg)) this.invia(pid, msg); }
  trasmetti(msg) { for (const c of this.conns.values()) this.manda(c, msg); }
  aHost(msg) { this.manda(this.connHost, msg); }
  aHostVeloce(msg) { if (!this.manda(this.connHostVeloce, msg)) this.aHost(msg); }

  // collegamento diretto o tramite server ponte (TURN), letto dalle statistiche WebRTC
  async tipoCollegamento() {
    const pc = this.connHost && this.connHost.peerConnection;
    if (!pc || !pc.getStats) return null;
    try {
      const st = await pc.getStats();
      let coppia = null;
      st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) coppia = st.get(r.selectedCandidatePairId); });
      if (!coppia) st.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) coppia = r; });
      if (!coppia) return null;
      const loc = st.get(coppia.localCandidateId), rem = st.get(coppia.remoteCandidateId);
      const relay = (loc && loc.candidateType === 'relay') || (rem && rem.candidateType === 'relay');
      return { tipo: relay ? 'PONTE' : 'DIRETTA', rtt: coppia.currentRoundTripTime != null ? Math.round(coppia.currentRoundTripTime * 1000) : null };
    } catch { return null; }
  }

  chiudi() {
    this.suUscita = () => {};
    try { this.peer && this.peer.destroy(); } catch { /* ignora */ }
    this.peer = null;
    this.conns.clear();
    this.veloci.clear();
    this.connHost = null;
    this.connHostVeloce = null;
  }
}
