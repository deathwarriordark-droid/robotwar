// RobotWar — multiplayer peer-to-peer con PeerJS (WebRTC). L'host fa da server nel browser.
// Due canali per ogni giocatore:
//  - "affidabile" (ordinato): lobby, chat, eventi di gioco, inizio e fine partita
//  - "rapido" (WebRTC senza ritrasmissioni): posizioni e comandi, sempre i più freschi
import { PREFISSO_PEER, ICE_SERVER } from './config.js';

const OPZ_PEER = { debug: 1, config: { iceServers: ICE_SERVER, sdpSemantics: 'unified-plan' } };

// Canale rapido: WebRTC puro, non ordinato e SENZA ritrasmissioni (un pacchetto perso si salta,
// ne arriva uno più nuovo). Si apre dentro lo stesso collegamento già stabilito (negotiated: stesso id
// sui due lati), quindi niente seconda trattativa di rete.
const ID_RAPIDO = 77;
function apriRapido(conn, suDati) {
  const pc = conn.peerConnection;
  if (!pc || !pc.createDataChannel) return null;
  try {
    const ch = pc.createDataChannel('rapido', { negotiated: true, id: ID_RAPIDO, ordered: false, maxRetransmits: 0 });
    ch.onmessage = (e) => { try { suDati(JSON.parse(e.data)); } catch { /* pacchetto rovinato: si ignora */ } };
    return ch;
  } catch (e) { console.warn('canale rapido non disponibile', e); return null; }
}

export class Rete {
  constructor() {
    this.peer = null;
    this.host = false;
    this.conns = new Map();   // pid -> canale affidabile
    this.veloci = new Map();  // pid -> canale veloce PeerJS (versioni vecchie del gioco)
    this.rapidi = new Map();  // pid -> canale rapido WebRTC
    this.rapidoHost = null;
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
          this.rapidi.set(conn.peer, apriRapido(conn, (d) => this.suMessaggio(conn.peer, d)));
          this.suEntrata(conn.peer);
        });
        conn.on('data', (d) => this.suMessaggio(conn.peer, d));
        const chiusa = () => {
          if (veloce) { if (this.veloci.get(conn.peer) === conn) this.veloci.delete(conn.peer); return; }
          if (this.conns.get(conn.peer) === conn) {
            this.conns.delete(conn.peer);
            try { this.rapidi.get(conn.peer)?.close(); } catch { /* ignora */ }
            this.rapidi.delete(conn.peer);
            this.suUscita(conn.peer);
          }
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
          this.rapidoHost = apriRapido(conn, (d) => this.suMessaggio('host', d));
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

  // canale rapido: se la coda in uscita è piena il pacchetto si salta (true = inviato o saltato apposta, null = canale non pronto)
  mandaRapido(ch, msg) {
    if (!ch || ch.readyState !== 'open') return null;
    if (ch.bufferedAmount > 16384) return false;
    try { ch.send(JSON.stringify(msg)); return true; } catch { return null; }
  }

  invia(pid, msg) { this.manda(this.conns.get(pid), msg); }
  // stato e comandi: canale rapido; se non è pronto, ripiego sul veloce PeerJS o sull'affidabile
  inviaVeloce(pid, msg) { if (this.mandaRapido(this.rapidi.get(pid), msg) !== null) return; if (!this.manda(this.veloci.get(pid), msg)) this.invia(pid, msg); }
  trasmetti(msg) { for (const c of this.conns.values()) this.manda(c, msg); }
  aHost(msg) { this.manda(this.connHost, msg); }
  aHostVeloce(msg) { if (this.mandaRapido(this.rapidoHost, msg) !== null) return; if (!this.manda(this.connHostVeloce, msg)) this.aHost(msg); }

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
    this.rapidi.clear();
    this.connHost = null;
    this.connHostVeloce = null;
    this.rapidoHost = null;
  }
}
