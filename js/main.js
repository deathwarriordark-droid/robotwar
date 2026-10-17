// RobotWar — avvio, schermate (hangar → lobby → partita → risultati) e ciclo di gioco
import * as THREE from 'three';
import { VERSIONE, TICK, GUIDA, COMANDI, FORMATI, MAX_GIOCATORI, DIFFICOLTA } from './config.js';
import { generaMappa } from './mondo.js';
import { Simulazione } from './simulazione.js';
import { Vista } from './vista.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Rete } from './rete.js';
import { Hangar } from './hangar.js';
import { codiceCasuale, r2, r3 } from './util.js';
import { preparaAmbiente } from './mech.js';
import { Post } from './post.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------------- salvataggio locale ----------------
const PREDEFINITO = {
  nome: '',
  aspetto: { testa: 1, torso: 1, braccia: 1, gambe: 1, finitura: 0, livrea: 0, luci: 0, emblema: 0, numero: String(10 + Math.floor(Math.random() * 90)) },
  imp: { qualita: 'alta', scala: 1, distanza: 900, fov: 72, sens: 1, invertiY: false, camera: 'terza', fps: true, touch: 'auto', generale: 0.6, effetti: 0.8, musica: 0.35 },
  stat: { partite: 0, vittorie: 0, uccisioni: 0, migliore: 0 },
  solo: { diff: 'normale', bot: 11 },
};
function carica() {
  try {
    const d = JSON.parse(localStorage.getItem('robotwar') || '{}');
    return { ...PREDEFINITO, ...d, aspetto: { ...PREDEFINITO.aspetto, ...d.aspetto }, imp: { ...PREDEFINITO.imp, ...d.imp }, stat: { ...PREDEFINITO.stat, ...d.stat }, solo: { ...PREDEFINITO.solo, ...d.solo } };
  } catch { return structuredClone(PREDEFINITO); }
}
const dati = carica();
function salva() { try { localStorage.setItem('robotwar', JSON.stringify(dati)); } catch { /* ignora */ } }
const nomePilota = () => (dati.nome || '').trim() || 'Pilota';

// ---------------- motore ----------------
const canvas = $('gioco');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: dati.imp.qualita !== 'bassa', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function applicaRisoluzione() {
  const base = Math.min(devicePixelRatio || 1, dati.imp.qualita === 'alta' ? 2 : dati.imp.qualita === 'media' ? 1.5 : 1);
  renderer.setPixelRatio(base * dati.imp.scala);
  renderer.setSize(innerWidth, innerHeight, false);
  if (post) { post.attivo = dati.imp.qualita === 'alta'; post.ridimensiona(); }
}
let post = null;
preparaAmbiente(renderer);
post = new Post(renderer);
applicaRisoluzione();
const disegna = (scena, camera) => post.render(scena, camera);

const audio = new Audio();
audio.impostaVolumi(dati.imp);
const hud = new Hud();
const rete = new Rete();
let stato = 'hangar';
let vista = null, sim = null, mappa = null, mioId = null, partita = null;
let seq = 0, tick = 0, acc = 0, bufferEv = [], pingMs = null, fpsMedia = 60, fineMostrata = false;
let lobby = null; // { codice, host, giocatori, opz }

const input = new Input(canvas, {
  pausa: () => apriPausa(),
  mappa: () => { if (stato === 'partita') { hud.apriMappa(); input.bloccato = hud.mappaAperta || hud.chatAperta || pausaAperta(); } },
  camera: () => { if (vista) { vista.cockpit = !vista.cockpit; dati.imp.camera = vista.cockpit ? 'cockpit' : 'terza'; salva(); } },
  minimappa: (d) => hud.zoomMinimappa(d),
  chat: (v) => apriChat(v),
  debug: () => { if (sim) { sim.gestoreEventi.forza(); toast('Evento d\'arena forzato'); } },
});
input.sens = dati.imp.sens;
input.invertiY = dati.imp.invertiY;
function aggiornaTouch() {
  const t = dati.imp.touch === 'si' || (dati.imp.touch === 'auto' && input.touchDisponibile && matchMedia('(pointer: coarse)').matches);
  input.impostaTouch(t);
}
aggiornaTouch();

const hangar = new Hangar(dati.aspetto, (a) => { dati.aspetto = a; salva(); });

// ---------------- schermate ----------------
function mostra(nome) {
  stato = nome;
  for (const s of ['hangar', 'lobby', 'hud', 'risultati']) $(s).classList.toggle('visibile', s === nome || (nome === 'partita' && s === 'hud'));
  input.attivo = nome === 'partita';
  if (nome !== 'partita') input.sblocca();
  audio.musica(nome === 'partita' ? 'partita' : nome === 'risultati' ? null : 'hangar');
}

function toast(t, ms = 2500) {
  const el = $('toast');
  el.textContent = t;
  el.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.style.display = 'none'), ms);
}

function messaggio(id, t) { $(id).textContent = t || ''; }

// ---------------- hangar UI ----------------
$('versione').textContent = VERSIONE;
$('nome-pilota').value = dati.nome;
$('nome-pilota').addEventListener('input', (e) => { dati.nome = e.target.value.slice(0, 16); salva(); });
$('numero-mech').value = dati.aspetto.numero || '';
$('numero-mech').addEventListener('input', (e) => { const v = e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 3).toUpperCase(); e.target.value = v; hangar.aspetto.numero = v; hangar.aggiorna(); });
$('guida').innerHTML = GUIDA.map(([t, d]) => `<div class="voce"><b>${t}</b><span>${d}</span></div>`).join('');
$('lista-comandi').innerHTML = COMANDI.map(([k, d]) => `<div class="voce"><kbd>${k}</kbd><span>${d}</span></div>`).join('') +
  '<p class="nota">Touch: joystick a sinistra, trascina a destra per mirare. Gamepad: in arrivo.</p>';
function aggiornaStatPilota() {
  const s = dati.stat;
  $('stat-pilota').innerHTML = [['Partite', s.partite], ['Vittorie', s.vittorie], ['Uccisioni', s.uccisioni], ['Miglior posizione', s.migliore ? '#' + s.migliore : '—']]
    .map(([n, v]) => `<div class="riga"><span>${n}</span><b>${v}</b></div>`).join('');
}
aggiornaStatPilota();

document.querySelectorAll('.schede button[data-scheda]').forEach((b) => {
  b.onclick = () => {
    audio.avvia(); audio.suona('clic');
    document.querySelectorAll('.schede button[data-scheda]').forEach((x) => x.classList.toggle('attiva', x === b));
    document.querySelectorAll('.pannello.sx').forEach((p) => p.classList.toggle('nascosto', p.dataset.pannello !== b.dataset.scheda));
  };
});
$('btn-impostazioni-h').onclick = () => apriImpostazioni();

function scelta(idGruppo, valore, cb) {
  const g = $(idGruppo);
  g.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('attiva', b.dataset.v === valore);
    b.onclick = () => { audio.avvia(); audio.suona('clic'); g.querySelectorAll('button').forEach((x) => x.classList.toggle('attiva', x === b)); cb(b.dataset.v); };
  });
}
scelta('scelta-modo', 'solo', (v) => { $('opz-solo').classList.toggle('nascosto', v !== 'solo'); $('opz-multi').classList.toggle('nascosto', v !== 'multi'); });
scelta('scelta-diff', dati.solo.diff, (v) => { dati.solo.diff = v; salva(); });
$('num-bot').value = dati.solo.bot;
$('num-bot-v').textContent = dati.solo.bot;
$('num-bot').oninput = (e) => { dati.solo.bot = +e.target.value; $('num-bot-v').textContent = e.target.value; salva(); };

$('btn-gioca').onclick = () => {
  audio.avvia();
  const opz = { formato: 'tutti', difficolta: dati.solo.diff, numBot: dati.solo.bot, giocatori: [{ pid: 'locale', nome: nomePilota(), aspetto: dati.aspetto }] };
  avviaPartita({ seme: (Math.random() * 1e9) | 0, opz, host: true, multi: false });
};

// link d'invito
const stanzaUrl = new URLSearchParams(location.search).get('stanza');
if (stanzaUrl) {
  document.querySelector('#scelta-modo [data-v="multi"]').click();
  $('codice-stanza').value = stanzaUrl.toUpperCase();
  messaggio('msg-hangar', `Sei stato invitato nella stanza ${stanzaUrl.toUpperCase()}: scegli il mech e premi ENTRA`);
}

$('btn-crea').onclick = () => creaStanza();
$('btn-entra').onclick = () => entraStanza($('codice-stanza').value.trim().toUpperCase());
$('codice-stanza').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-entra').click(); });

// ---------------- lobby / rete ----------------
async function creaStanza(tentativo = 0) {
  audio.avvia();
  messaggio('msg-hangar', 'Creo la stanza…');
  const codice = codiceCasuale(5);
  try {
    await rete.ospita(codice);
  } catch (e) {
    rete.chiudi();
    if (e.type === 'unavailable-id' && tentativo < 3) return creaStanza(tentativo + 1);
    messaggio('msg-hangar', 'Impossibile creare la stanza: ' + (e.message || e.type));
    return;
  }
  messaggio('msg-hangar', '');
  lobby = { codice, host: true, giocatori: [{ pid: rete.id, nome: nomePilota(), aspetto: dati.aspetto }], opz: { formato: 'coop', difficolta: 'normale', numBot: 8 } };
  rete.suEntrata = () => {};
  rete.suUscita = (pid) => {
    if (stato === 'partita' && sim) { sim.disconnetti(pid); return; }
    if (!lobby) return;
    const g = lobby.giocatori.find((x) => x.pid === pid);
    lobby.giocatori = lobby.giocatori.filter((x) => x.pid !== pid);
    if (g) chatLobby(null, `${g.nome} è uscito`);
    inviaLobby();
  };
  rete.suMessaggio = (pid, m) => messaggioHost(pid, m);
  apriLobby();
}

async function entraStanza(codice) {
  audio.avvia();
  if (!/^[A-Z0-9]{5}$/.test(codice)) { messaggio('msg-hangar', 'Il codice è di 5 caratteri'); return; }
  messaggio('msg-hangar', `Mi collego alla stanza ${codice}…`);
  rete.suMessaggio = (pid, m) => messaggioClient(m);
  rete.suUscita = () => {
    rete.chiudi();
    lobby = null;
    if (stato === 'partita' || stato === 'lobby') { chiudiPartita(); mostra('hangar'); }
    toast('Connessione con l\'host persa', 4000);
  };
  try {
    await rete.unisciti(codice);
  } catch (e) {
    rete.chiudi();
    messaggio('msg-hangar', e.message || 'Connessione fallita');
    return;
  }
  messaggio('msg-hangar', '');
  lobby = { codice, host: false, giocatori: [], opz: {} };
  rete.aHost({ t: 'ciao', nome: nomePilota(), aspetto: dati.aspetto, v: VERSIONE });
  apriLobby();
  if (!entraStanza.ping) entraStanza.ping = setInterval(() => { if (!rete.host && rete.connHost) rete.aHost({ t: 'ping', c: performance.now() }); }, 2000);
}

function apriLobby() {
  mostra('lobby');
  $('lobby-codice').textContent = lobby.codice;
  $('lobby-link').value = `${location.origin}${location.pathname}?stanza=${lobby.codice}`;
  $('lobby-chat-log').innerHTML = '';
  const sel = $('lobby-formato');
  sel.innerHTML = Object.entries(FORMATI).map(([k, f]) => `<option value="${k}">${f.nome}</option>`).join('');
  for (const id of ['lobby-formato', 'lobby-diff', 'lobby-bot']) $(id).disabled = !lobby.host;
  $('btn-avvia').style.display = lobby.host ? '' : 'none';
  $('lobby-nota-host').textContent = lobby.host ? 'Sei l\'host: tieni aperta questa scheda finché giocate.' : 'Le regole le sceglie l\'host.';
  messaggio('msg-lobby', '');
  renderLobby();
}

function renderLobby() {
  if (!lobby) return;
  const o = lobby.opz;
  if (o.formato) $('lobby-formato').value = o.formato;
  if (o.difficolta) $('lobby-diff').value = o.difficolta;
  if (o.numBot != null) { $('lobby-bot').value = o.numBot; $('lobby-bot-v').textContent = o.numBot; }
  $('lobby-conta').textContent = `${lobby.giocatori.length}/${MAX_GIOCATORI}`;
  const ul = $('lobby-giocatori');
  ul.innerHTML = '';
  lobby.giocatori.forEach((g, i) => {
    const li = document.createElement('li');
    li.textContent = g.nome;
    const s = document.createElement('small');
    s.textContent = i === 0 ? 'HOST' : g.pid === rete.id ? 'TU' : '';
    li.appendChild(s);
    ul.appendChild(li);
  });
}

function inviaLobby() {
  if (!lobby || !lobby.host) return;
  rete.trasmetti({ t: 'lobby', giocatori: lobby.giocatori, opz: lobby.opz });
  renderLobby();
}

function chatLobby(nome, testo) {
  const d = document.createElement('div');
  if (nome) { const b = document.createElement('b'); b.textContent = nome + ': '; b.style.color = 'var(--blu)'; d.appendChild(b); }
  d.appendChild(document.createTextNode(testo));
  $('lobby-chat-log').appendChild(d);
  $('lobby-chat-log').scrollTop = 1e6;
  if (stato === 'partita') hud.chat(nome, testo);
}

function inviaChat(testo) {
  testo = testo.trim().slice(0, 120);
  if (!testo) return;
  const msg = { t: 'chat', nome: nomePilota(), testo };
  if (!lobby) { hud.chat(msg.nome, testo); return; }
  if (lobby.host) { rete.trasmetti(msg); chatLobby(msg.nome, testo); }
  else rete.aHost(msg);
}

$('lobby-chat').addEventListener('keydown', (e) => { if (e.key === 'Enter') { inviaChat(e.target.value); e.target.value = ''; } });
$('btn-copia').onclick = async () => {
  try { await navigator.clipboard.writeText($('lobby-link').value); toast('Link copiato: mandalo agli amici!'); }
  catch { $('lobby-link').select(); toast('Seleziona e copia il link'); }
};
$('lobby-formato').onchange = (e) => { lobby.opz.formato = e.target.value; inviaLobby(); };
$('lobby-diff').onchange = (e) => { lobby.opz.difficolta = e.target.value; inviaLobby(); };
$('lobby-bot').oninput = (e) => { lobby.opz.numBot = +e.target.value; $('lobby-bot-v').textContent = e.target.value; inviaLobby(); };
$('btn-esci-lobby').onclick = () => { rete.chiudi(); lobby = null; mostra('hangar'); };
$('btn-avvia').onclick = () => {
  if (!lobby || !lobby.host) return;
  const opz = { ...lobby.opz, giocatori: lobby.giocatori.map((g) => ({ pid: g.pid, nome: g.nome, aspetto: g.aspetto })) };
  avviaPartita({ seme: (Math.random() * 1e9) | 0, opz, host: true, multi: true });
};

function messaggioHost(pid, m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'ciao': {
      if (stato === 'partita') { rete.invia(pid, { t: 'rifiuto', motivo: 'Partita già in corso: riprova tra poco' }); return; }
      if (lobby.giocatori.length >= MAX_GIOCATORI) { rete.invia(pid, { t: 'rifiuto', motivo: 'Stanza piena' }); return; }
      const nome = String(m.nome || 'Pilota').slice(0, 16);
      const aspetto = m.aspetto && typeof m.aspetto === 'object' ? m.aspetto : dati.aspetto;
      if (!lobby.giocatori.some((g) => g.pid === pid)) lobby.giocatori.push({ pid, nome, aspetto });
      chatLobby(null, `${nome} è entrato nella stanza`);
      inviaLobby();
      break;
    }
    case 'chat': {
      const g = lobby.giocatori.find((x) => x.pid === pid);
      const msg = { t: 'chat', nome: g ? g.nome : '?', testo: String(m.testo || '').slice(0, 120) };
      rete.trasmetti(msg);
      chatLobby(msg.nome, msg.testo);
      break;
    }
    case 'in': {
      if (!sim || !m.i) return;
      const id = sim.idDaPeer(pid);
      if (id) sim.riceviInput(id, m.i);
      break;
    }
    case 'ping': rete.invia(pid, { t: 'pong', c: m.c }); break;
  }
}

function messaggioClient(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'lobby': lobby.giocatori = m.giocatori; lobby.opz = m.opz; renderLobby(); break;
    case 'rifiuto': messaggio('msg-hangar', m.motivo); rete.chiudi(); lobby = null; mostra('hangar'); break;
    case 'chat': chatLobby(m.nome, m.testo); break;
    case 'via': {
      const r = m.roster.find((x) => x.pid === rete.id);
      if (!r) return;
      avviaPartita({ seme: m.seme, opz: m.opz, host: false, multi: true, roster: m.roster, mio: r.id });
      break;
    }
    case 'snap': if (vista) { vista.applicaSnapshot(m, m.tu); vista.eventi(m.ev || []); } break;
    case 'fine': mostraRisultati(m.ris, m.vinc); break;
    case 'pong': pingMs = Math.round(performance.now() - m.c); break;
  }
}

// ---------------- partita ----------------
function avviaPartita({ seme, opz, host, multi, roster, mio }) {
  chiudiPartita();
  messaggio('carica-testo', '');
  mappa = generaMappa(seme);
  if (host) {
    sim = new Simulazione(mappa, opz);
    roster = sim.roster();
    mioId = sim.idDaPeer(multi ? rete.id : 'locale');
    if (multi) rete.trasmetti({ t: 'via', seme, opz, roster });
  } else {
    sim = null;
    mioId = mio;
  }
  partita = { opz, host, multi };
  hud.prepara(mappa);
  vista = new Vista({ renderer, mappa, roster, mioId, impostazioni: dati.imp, audio, hud, host });
  const r = roster.find((x) => x.id === mioId);
  input.yaw = 0; input.pitch = -0.25;
  if (sim) { const m = sim.perId.get(mioId); input.yaw = m.yaw; }
  seq = 0; tick = 0; acc = 0; bufferEv = []; fineMostrata = false;
  mostra('partita');
  hud.annuncio(`LANCIO!<small>${r ? 'Raccogli armi e parti: si parte a mani nude' : ''}</small>`, 'evento', 4);
  if (!input.touch) input.blocca();
}

function chiudiPartita() {
  if (vista) { vista.distruggi(); vista = null; }
  sim = null; partita = null;
  hud.apriChat(false);
  hud.chiudiMappa();
  input.bloccato = false;
  $('pausa').classList.remove('visibile');
}

function costruisciInput() {
  const c = input.campiona();
  const m = vista.puntoMira();
  return { seq: ++seq, mx: c.mx, mz: c.mz, yaw: r3(input.yaw), mira: [r2(m[0]), r2(m[1]), r2(m[2])], f1: c.f1, f2: c.f2, boost: c.boost, tieniE: c.tieniE, a: c.a, zoom: c.zoom };
}

function tickFisso() {
  tick++;
  const inp = costruisciInput();
  partita.zoom = inp.zoom;
  // spettatore: clic per cambiare mech osservato
  const ioE = vista.entita.get(mioId);
  if (ioE && ioE.stato === 'morto' && inp.f1 && !partita.clicPrima) vista.cambiaSpettato();
  partita.clicPrima = inp.f1;

  if (partita.host) {
    sim.riceviInput(mioId, inp);
    sim.step(TICK);
    const evs = sim.svuotaEventi();
    const snap = sim.snapshot();
    vista.applicaSnapshot(snap, sim.datiPersonali(mioId));
    vista.eventi(evs);
    if (partita.multi) {
      bufferEv.push(...evs);
      if (tick % 3 !== 2) {
        snap.ev = bufferEv;
        bufferEv = [];
        for (const pid of rete.conns.keys()) {
          const id = sim.idDaPeer(pid);
          rete.invia(pid, { ...snap, tu: id ? sim.datiPersonali(id) : null });
        }
      }
    }
    if (sim.finita && !fineMostrata) {
      const ris = sim.risultati();
      if (partita.multi) rete.trasmetti({ t: 'fine', ris, vinc: sim.vincitore });
      setTimeout(() => mostraRisultati(ris, sim ? sim.vincitore : null), 2500);
      fineMostrata = true;
    }
  } else {
    rete.aHost({ t: 'in', i: inp });
    vista.prevedi(inp);
  }
}

function mostraRisultati(ris, vinc) {
  if (stato !== 'partita') return;
  fineMostrata = true;
  const io = ris.find((x) => x.id === mioId);
  const vinto = io && vinc != null && io.squadra === vinc;
  $('ris-titolo').textContent = vinto ? 'VITTORIA!' : 'PARTITA FINITA';
  $('ris-titolo').className = vinto ? 'vittoria' : '';
  $('ris-posto').textContent = io ? `Posizione #${io.posto} · ${io.uccisioni} uccisioni · ${io.danni} danni` : '';
  const t = $('ris-tabella');
  t.innerHTML = '<tr><th>#</th><th>PILOTA</th><th>SQUADRA</th><th>UCCISIONI</th><th>DANNI</th></tr>';
  for (const r of ris) {
    const tr = document.createElement('tr');
    if (r.id === mioId) tr.className = 'io';
    for (const v of [r.posto, (r.umano ? '★ ' : '') + r.nome, r.squadra + 1, r.uccisioni, r.danni]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    t.appendChild(tr);
  }
  if (io) {
    dati.stat.partite++;
    dati.stat.uccisioni += io.uccisioni;
    if (vinto) dati.stat.vittorie++;
    if (!dati.stat.migliore || io.posto < dati.stat.migliore) dati.stat.migliore = io.posto;
    salva();
    aggiornaStatPilota();
  }
  audio.suona(vinto ? 'vittoria' : 'sconfitta');
  mostra('risultati');
}

$('btn-torna').onclick = () => {
  chiudiPartita();
  if (lobby && lobby.host) { apriLobby(); inviaLobby(); }
  else if (lobby) apriLobby();
  else mostra('hangar');
};

// ---------------- pausa, chat, impostazioni ----------------
const pausaAperta = () => $('pausa').classList.contains('visibile');
function apriPausa() {
  if (stato !== 'partita') return;
  if (hud.chatAperta) { apriChat(false); return; }
  if (hud.mappaAperta) { hud.chiudiMappa(); input.bloccato = false; input.blocca(); return; }
  if ($('impostazioni').classList.contains('visibile')) return;
  $('pausa').classList.add('visibile');
  input.bloccato = true;
  input.sblocca();
}
function chiudiPausa() {
  $('pausa').classList.remove('visibile');
  input.bloccato = false;
  input.blocca();
}
$('btn-riprendi').onclick = () => chiudiPausa();
$('btn-impostazioni-p').onclick = () => apriImpostazioni();
$('btn-abbandona').onclick = () => {
  $('pausa').classList.remove('visibile');
  const eraHost = lobby && lobby.host;
  chiudiPartita();
  if (lobby && !eraHost) { rete.chiudi(); lobby = null; }
  if (eraHost) { rete.trasmetti({ t: 'rifiuto', motivo: 'L\'host ha chiuso la partita' }); rete.chiudi(); lobby = null; }
  mostra('hangar');
};

function apriChat(v) {
  if (stato !== 'partita') return;
  if (!v && hud.chatAperta) { const t = $('chat-input').value; if (t.trim()) inviaChat(t); }
  hud.apriChat(v);
  input.bloccato = v || pausaAperta();
  if (v) input.sblocca(); else if (!pausaAperta()) input.blocca();
}
$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apriChat(false); } e.stopPropagation(); });

function apriImpostazioni() {
  const i = dati.imp;
  const campo = (label, html) => `<label class="campo">${label}${html}</label>`;
  const sel = (k, opz) => `<select data-k="${k}">${opz.map(([v, n]) => `<option value="${v}" ${String(i[k]) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const rng = (k, min, max, step) => ` <b data-v="${k}">${i[k]}</b><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${i[k]}">`;
  $('imp-campi').innerHTML = [
    '<h3>GIOCO</h3>',
    campo('Telecamera', sel('camera', [['terza', 'Terza persona'], ['cockpit', 'Cockpit']])),
    campo('Sensibilità mouse', rng('sens', 0.2, 3, 0.1)),
    campo('Inverti asse Y', sel('invertiY', [['false', 'No'], ['true', 'Sì']])),
    campo('Comandi touch', sel('touch', [['auto', 'Automatico'], ['si', 'Sempre'], ['no', 'Mai']])),
    '<h3>GRAFICA</h3>',
    campo('Qualità (dalla prossima partita)', sel('qualita', [['alta', 'Alta'], ['media', 'Media'], ['bassa', 'Bassa (più veloce)']])),
    campo('Scala di rendering', sel('scala', [['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']])),
    campo('Distanza visiva', rng('distanza', 300, 1500, 50)),
    campo('Campo visivo (FOV)', rng('fov', 55, 100, 1)),
    campo('Mostra FPS', sel('fps', [['true', 'Sì'], ['false', 'No']])),
    '<h3>AUDIO</h3>',
    campo('Volume generale', rng('generale', 0, 1, 0.05)),
    campo('Effetti', rng('effetti', 0, 1, 0.05)),
    campo('Musica', rng('musica', 0, 1, 0.05)),
  ].join('');
  $('imp-campi').querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener('input', () => {
      const k = el.dataset.k;
      let v = el.value;
      if (['sens', 'distanza', 'fov', 'generale', 'effetti', 'musica', 'scala'].includes(k)) v = +v;
      if (k === 'invertiY' || k === 'fps') v = v === 'true';
      i[k] = v;
      const b = $('imp-campi').querySelector(`[data-v="${k}"]`);
      if (b) b.textContent = v;
      applicaImpostazioni();
      salva();
    });
  });
  $('impostazioni').classList.add('visibile');
}
$('btn-chiudi-imp').onclick = () => { $('impostazioni').classList.remove('visibile'); };

function applicaImpostazioni() {
  const i = dati.imp;
  input.sens = i.sens;
  input.invertiY = i.invertiY;
  audio.impostaVolumi(i);
  applicaRisoluzione();
  aggiornaTouch();
  $('fps').style.display = i.fps ? '' : 'none';
  if (vista) {
    vista.cockpit = i.camera === 'cockpit';
    vista.scena.fog.far = i.distanza;
    vista.scena.fog.near = i.distanza * 0.3;
  }
}
applicaImpostazioni();

// ---------------- debug (solo con ?debug) ----------------
if (DEBUG) {
  window.robotwar = { get sim() { return sim; }, get vista() { return vista; }, get dati() { return dati; }, input, get mioId() { return mioId; }, renderer, post,
    avanza(n) { for (let i = 0; i < n && stato === 'partita'; i++) { tickFisso(); if (i % 3 === 0) vista.frame(TICK * 3, input, false); } } };
  addEventListener('keydown', (e) => {
    if (e.code === 'F8' && sim) {
      const m = sim.perId.get(mioId);
      for (const c of ['railgun', 'missili', 'jetpack', 'scudo', 'cannone', 'rottami']) sim.aggiungiBottino(m.x + (Math.random() - 0.5) * 8, m.z + 6 + Math.random() * 4, c, 3);
      toast('Bottino di prova generato');
    }
  });
}

// ---------------- ciclo principale ----------------
// La simulazione a passo fisso è guidata da un timer in un Worker: continua anche se la
// scheda dell'host finisce in secondo piano (requestAnimationFrame lì si ferma).
let ultimoTick = performance.now();
function passiFissi() {
  const ora = performance.now();
  if (stato !== 'partita' || !vista) { ultimoTick = ora; acc = 0; return; }
  acc += Math.min(0.25, (ora - ultimoTick) / 1000);
  ultimoTick = ora;
  let n = 0;
  while (acc >= TICK && n < 8) { acc -= TICK; tickFisso(); n++; }
  if (n === 8) acc = 0;
}
try {
  const motore = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 15);'], { type: 'text/javascript' })));
  motore.onmessage = passiFissi;
} catch {
  setInterval(passiFissi, 15);
}

let ultimo = performance.now();
function ciclo(t) {
  requestAnimationFrame(ciclo);
  const dt = Math.min(0.1, (t - ultimo) / 1000);
  ultimo = t;
  fpsMedia += (1 / Math.max(dt, 0.001) - fpsMedia) * 0.05;
  if ((stato === 'partita' || stato === 'risultati') && vista) {
    vista.frame(dt, input, partita ? partita.zoom : false);
    hud.aggiorna(vista.statoHud(Math.round(fpsMedia), partita && !partita.host ? pingMs : null, partita ? partita.opz.formato : 'tutti'), dt);
    disegna(vista.scena, vista.camera);
  } else {
    hangar.frame(dt, disegna);
  }
}

addEventListener('resize', () => {
  applicaRisoluzione();
  hangar.ridimensiona();
  if (vista) vista.ridimensiona();
});
addEventListener('pointerdown', () => audio.avvia(), { once: true });
addEventListener('beforeunload', () => { try { rete.chiudi(); } catch { /* ignora */ } });

$('carica-barra').style.width = '100%';
setTimeout(() => { $('caricamento').style.display = 'none'; }, 250);
mostra('hangar');
requestAnimationFrame(ciclo);
