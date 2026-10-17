// RobotWar — multiplayer peer-to-peer con PeerJS (WebRTC). L'host fa da server nel browser.
import { PREFISSO_PEER } from './config.js';

export class Rete {
  constructor() {
    this.peer = null;
    this.host = false;
    this.conns = new Map();
    this.connHost = null;
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
      this.peer = new window.Peer(PREFISSO_PEER + codice, { debug: 1 });
      this.peer.on('open', (id) => { aperto = true; ok(id); });
      this.peer.on('error', (e) => { if (!aperto) ko(e); else console.warn('PeerJS', e); });
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* ignora */ } });
      this.peer.on('connection', (conn) => {
        conn.on('open', () => { this.conns.set(conn.peer, conn); this.suEntrata(conn.peer); });
        conn.on('data', (d) => this.suMessaggio(conn.peer, d));
        conn.on('close', () => { if (this.conns.delete(conn.peer)) this.suUscita(conn.peer); });
        conn.on('error', () => { if (this.conns.delete(conn.peer)) this.suUscita(conn.peer); });
      });
    });
  }

  unisciti(codice) {
    return new Promise((ok, ko) => {
      if (!window.Peer) { ko(new Error('PeerJS non caricato: controlla la connessione')); return; }
      this.host = false;
      let fatto = false;
      this.peer = new window.Peer({ debug: 1 });
      const fallisci = (e) => { if (!fatto) { fatto = true; ko(e); } };
      this.peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') fallisci(new Error('Stanza non trovata: controlla il codice'));
        else fallisci(e);
      });
      this.peer.on('open', () => {
        const conn = this.peer.connect(PREFISSO_PEER + codice, { reliable: true, serialization: 'json' });
        const timer = setTimeout(() => fallisci(new Error('Nessuna risposta dalla stanza')), 15000);
        conn.on('open', () => { clearTimeout(timer); this.connHost = conn; fatto = true; ok(this.peer.id); });
        conn.on('data', (d) => this.suMessaggio('host', d));
        conn.on('close', () => this.suUscita('host'));
        conn.on('error', (e) => fallisci(e));
      });
    });
  }

  invia(pid, msg) {
    const c = this.conns.get(pid);
    if (c && c.open) { try { c.send(msg); } catch (e) { console.warn(e); } }
  }

  trasmetti(msg) {
    for (const c of this.conns.values()) if (c.open) { try { c.send(msg); } catch (e) { console.warn(e); } }
  }

  aHost(msg) {
    if (this.connHost && this.connHost.open) { try { this.connHost.send(msg); } catch (e) { console.warn(e); } }
  }

  chiudi() {
    this.suUscita = () => {};
    try { this.peer && this.peer.destroy(); } catch { /* ignora */ }
    this.peer = null;
    this.conns.clear();
    this.connHost = null;
  }
}
