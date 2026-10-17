// RobotWar — configurazione, bilanciamento e testi

export const VERSIONE = '1.0';
export const TICK = 1 / 30;            // passo fisso della simulazione (30 Hz)
export const LATO = 1200;              // lato della mappa in metri
export const META = LATO / 2;
export const RIS = 256;                // risoluzione griglia del terreno
export const PASSO = LATO / RIS;
export const ALTEZZA_MECH = 8.4;
export const PORTATA_RACCOLTA = 7;
export const PREFISSO_PEER = 'robotwar-it-';
export const MAX_GIOCATORI = 8;
export const MAX_MECH = 16;
export const ZONA_INIZIALE = 680;

// --- Slot del mech (come nell'HUD) ---
export const SLOT = [
  { tasto: '1', nome: 'Braccio SX', cat: 'arma' },
  { tasto: '2', nome: 'Braccio DX', cat: 'arma' },
  { tasto: '3', nome: 'Spalla SX', cat: 'spalla' },
  { tasto: '4', nome: 'Spalla DX', cat: 'spalla' },
  { tasto: '5', nome: 'Trazione', cat: 'gambe' },
  { tasto: '6', nome: 'Testa', cat: 'testa' },
  { tasto: '7', nome: 'Schiena', cat: 'schiena' },
  { tasto: 'Q', nome: 'Rastrelliera', cat: 'arma' },
];

export const RARITA = [
  { nome: 'Comune', colore: '#b8c4cf', molt: 1 },
  { nome: 'Rara', colore: '#3fa9ff', molt: 1.15 },
  { nome: 'Epica', colore: '#c05cff', molt: 1.32 },
  { nome: 'Leggendaria', colore: '#ffb02e', molt: 1.55 },
];

// --- Armi ---
// tipo: mischia | proiettile | raggio | cono | missile | mortaio
export const ARMI = {
  pugni:       { nome: 'Pugni', cat: 'arma', tipo: 'mischia', danno: 16, gittata: 6, cad: 0.45, calore: 3, carica: 0, sigla: 'PGN' },
  mitra:       { nome: 'Mitragliatrice', cat: 'arma', tipo: 'proiettile', danno: 7, vel: 240, cad: 0.09, carica: 40, ricarica: 2, calore: 1.6, disp: 0.022, vita: 1.6, gittata: 300, sigla: 'MTR' },
  dispersione: { nome: 'Cannone a dispersione', cat: 'arma', tipo: 'proiettile', pallini: 8, danno: 6.5, vel: 200, cad: 0.75, carica: 6, ricarica: 2.2, calore: 8, disp: 0.075, vita: 0.55, gittata: 90, sigla: 'DSP' },
  cannone:     { nome: 'Cannone', cat: 'arma', tipo: 'proiettile', danno: 42, esplosione: 5, vel: 170, grav: 12, cad: 1.1, carica: 5, ricarica: 2.6, calore: 13, disp: 0.004, vita: 3, gittata: 380, sigla: 'CNN' },
  laser:       { nome: 'Laser', cat: 'arma', tipo: 'raggio', danno: 13, gittata: 220, cad: 0.16, carica: 22, ricarica: 2.6, calore: 4, sigla: 'LSR' },
  fiamma:      { nome: 'Lanciafiamme', cat: 'arma', tipo: 'cono', danno: 4.5, gittata: 20, cono: 0.38, cad: 0.07, carica: 90, ricarica: 2.5, calore: 1.4, sigla: 'FMM' },
  lama:        { nome: 'Lama al plasma', cat: 'arma', tipo: 'mischia', danno: 46, gittata: 8, cad: 0.6, calore: 5, carica: 0, sigla: 'LAM' },
  railgun:     { nome: 'Railgun', cat: 'arma', tipo: 'raggio', danno: 105, gittata: 520, cad: 2.2, carica: 3, ricarica: 3.2, calore: 32, perfora: true, minRar: 2, sigla: 'RLG' },
  missili:     { nome: 'Lanciamissili', cat: 'spalla', tipo: 'missile', danno: 20, esplosione: 4.5, vel: 85, salva: 2, cad: 2.4, carica: 8, ricarica: 3.5, calore: 7, vita: 5, gittata: 300, sigla: 'MSL' },
  mortaio:     { nome: 'Mortaio', cat: 'spalla', tipo: 'mortaio', danno: 55, esplosione: 8, cad: 3, carica: 4, ricarica: 3.5, calore: 12, vita: 6, gittata: 260, sigla: 'MRT' },
};

// --- Moduli (non armi) ---
export const MODULI = {
  jetpack: { nome: 'Jetpack', cat: 'schiena', sigla: 'JET', desc: 'Tieni SPAZIO per volare' },
  scudo:   { nome: 'Scudo energetico', cat: 'schiena', hp: 110, sigla: 'SCD', desc: 'Assorbe danni, si ricarica' },
  radar:   { nome: 'Radar esteso', cat: 'testa', raggio: 280, sigla: 'RDR', desc: 'Nemici in minimappa' },
  ottica:  { nome: 'Ottica da cecchino', cat: 'testa', sigla: 'OTT', desc: 'Z per zoom forte, +20% gittata' },
  rapide:  { nome: 'Gambe rapide', cat: 'gambe', vel: 1.25, sigla: 'RAP', desc: '+25% velocità' },
  cingoli: { nome: 'Cingoli corazzati', cat: 'gambe', vel: 0.9, riduzione: 0.15, sigla: 'CNG', desc: '-15% danni subiti' },
  rottami: { nome: 'Rottami', cat: 'rottami', sigla: 'RTM', desc: 'Ripara scafo e arti' },
};

export const OGGETTI = { ...ARMI, ...MODULI };

export const PESI_BOTTINO = {
  mitra: 16, dispersione: 12, cannone: 10, laser: 10, fiamma: 8, lama: 7, railgun: 2,
  missili: 7, mortaio: 5, jetpack: 5, scudo: 5, radar: 4, ottica: 3, rapide: 4, cingoli: 4, rottami: 22,
};
export const PESI_RARITA = { 0: 58, 1: 28, 2: 11, 3: 3 };

// --- Parti dell'hangar ---
export const PARTI = {
  testa: [
    { id: 'visore', nome: 'Visore', radar: 170, desc: 'Radar 170 m' },
    { id: 'cresta', nome: 'Cresta', radar: 200, desc: 'Radar 200 m' },
    { id: 'cupola', nome: 'Cupola', radar: 230, desc: 'Radar 230 m' },
  ],
  torso: [
    { id: 'snello', nome: 'Torso Snello', hp: 190, raggio: 1.9, peso: 0, desc: 'Scafo 190, piccolo' },
    { id: 'guardiano', nome: 'Torso Guardiano', hp: 250, raggio: 2.2, peso: 0.07, desc: 'Scafo 250' },
    { id: 'fortezza', nome: 'Torso Fortezza', hp: 320, raggio: 2.6, peso: 0.15, desc: 'Scafo 320, grosso' },
  ],
  braccia: [
    { id: 'agili', nome: 'Braccia Agili', hp: 60, desc: 'Braccia 60' },
    { id: 'standard', nome: 'Braccia Standard', hp: 85, desc: 'Braccia 85' },
    { id: 'corazzate', nome: 'Braccia Corazzate', hp: 115, desc: 'Braccia 115' },
  ],
  gambe: [
    { id: 'digitigradi', nome: 'Gambe Digitigrade', vel: 17, hp: 80, desc: 'Veloci, fragili' },
    { id: 'bipede', nome: 'Gambe Bipedi', vel: 14.5, hp: 105, desc: 'Equilibrate' },
    { id: 'tozze', nome: 'Gambe Tozze', vel: 12, hp: 145, desc: 'Lente, robuste' },
  ],
  finitura: [
    { id: 'fabbrica', nome: 'Fabbrica', primario: '#c4cad3', secondario: '#3b4452', accento: '#5cff6a' },
    { id: 'cobalto', nome: 'Cobalto', primario: '#2d5fa8', secondario: '#1a2233', accento: '#ff9a2e' },
    { id: 'brace', nome: 'Brace', primario: '#8e2a22', secondario: '#2a1c1a', accento: '#ffd23a' },
    { id: 'giungla', nome: 'Giungla', primario: '#56693a', secondario: '#2e3524', accento: '#e8c25a' },
    { id: 'notte', nome: 'Notte', primario: '#24232e', secondario: '#121218', accento: '#b84dff' },
    { id: 'neve', nome: 'Neve', primario: '#e9eef3', secondario: '#7d8b99', accento: '#3fd2ff' },
    { id: 'oro', nome: 'Oro Reale', primario: '#c99a2e', secondario: '#1d1a14', accento: '#ff4040' },
  ],
  livrea: [
    { id: 'liscia', nome: 'Liscia', desc: 'Solo piastre e usura' },
    { id: 'strisce', nome: 'Strisce', desc: 'Bande diagonali' },
    { id: 'mimetica', nome: 'Mimetica', desc: 'Macchie a tre toni' },
    { id: 'tigrata', nome: 'Tigrata', desc: 'Strisce ondulate' },
    { id: 'scacchi', nome: 'Scacchi', desc: 'Riquadri alternati' },
    { id: 'usurata', nome: 'Veterana', desc: 'Ruggine e bruciature' },
  ],
  luci: [
    { id: 'finitura', nome: 'Della finitura', desc: 'Colore originale' },
    { id: 'verde', nome: 'Verde', colore: '#5cff6a', desc: '' },
    { id: 'ciano', nome: 'Ciano', colore: '#3fd6ff', desc: '' },
    { id: 'arancio', nome: 'Arancio', colore: '#ff5a2e', desc: '' },
    { id: 'rosso', nome: 'Rosso', colore: '#ff2a3a', desc: '' },
    { id: 'viola', nome: 'Viola', colore: '#b84dff', desc: '' },
    { id: 'oro', nome: 'Oro', colore: '#ffc23a', desc: '' },
    { id: 'bianco', nome: 'Bianco', colore: '#f2f6ff', desc: '' },
  ],
  emblema: [
    { id: 'nessuno', nome: 'Nessuno', desc: '' },
    { id: 'fulmine', nome: 'Fulmine', desc: '' },
    { id: 'stella', nome: 'Stella', desc: '' },
    { id: 'teschio', nome: 'Teschio', desc: '' },
    { id: 'ingranaggio', nome: 'Ingranaggio', desc: '' },
    { id: 'corona', nome: 'Corona', desc: '' },
    { id: 'artiglio', nome: 'Artiglio', desc: '' },
  ],
};

export const TELAI = [
  { id: 'esploratore', nome: 'Esploratore', desc: 'Leggero e veloce', parti: { testa: 0, torso: 0, braccia: 0, gambe: 0 } },
  { id: 'guardiano', nome: 'Guardiano', desc: 'Equilibrato', parti: { testa: 1, torso: 1, braccia: 1, gambe: 1 } },
  { id: 'colosso', nome: 'Colosso', desc: 'Pesante e resistente', parti: { testa: 2, torso: 2, braccia: 2, gambe: 2 } },
];

export function statsDaAspetto(a) {
  const testa = PARTI.testa[a.testa] || PARTI.testa[0];
  const torso = PARTI.torso[a.torso] || PARTI.torso[0];
  const braccia = PARTI.braccia[a.braccia] || PARTI.braccia[0];
  const gambe = PARTI.gambe[a.gambe] || PARTI.gambe[0];
  return {
    t: torso.hp, b: braccia.hp, g: gambe.hp,
    raggio: torso.raggio,
    vel: gambe.vel * (1 - torso.peso),
    radar: testa.radar,
  };
}

// --- Zona che si chiude ---
export const ZONA = [
  { attesa: 75, chiusura: 45, raggio: 430, danno: 2 },
  { attesa: 60, chiusura: 40, raggio: 260, danno: 4 },
  { attesa: 50, chiusura: 35, raggio: 150, danno: 7 },
  { attesa: 40, chiusura: 30, raggio: 70, danno: 11 },
  { attesa: 30, chiusura: 30, raggio: 0, danno: 18 },
];

// --- Drone fantasma ---
export const DRONE = { hp: 45, vel: 30, empCd: 8, empRaggio: 30, empDurata: 3.5, nuclei: 5, limiteRientro: 290 };

// --- Strappa-arti ---
export const STRAPPO = { tempo: 2, durataRelitto: 12, distanza: 11 };

// --- Calore e Overdrive ---
export const CALORE = { soglia: 80, blocco: 2, bloccoOD: 3, durataOD: 5, raffr: 9, raffrRiposo: 30 };

// --- Eventi d'arena ---
export const EVENTI = { primo: 70, intervallo: [80, 100], preavviso: 10 };
export const TESTI_EVENTI = {
  emp: { titolo: 'TEMPESTA EMP', preavviso: 'Tempesta EMP in arrivo: radar e minimappa salteranno!', via: 'TEMPESTA EMP — radar fuori uso' },
  meteore: { titolo: 'PIOGGIA DI METEORE', preavviso: 'Pioggia di meteore tra 10 secondi! Guarda i cerchi rossi.', via: 'METEORE! Evita i cerchi rossi' },
  cassa: { titolo: 'CASSA LEGGENDARIA', preavviso: 'Una cassa leggendaria sta per essere sganciata!', via: 'Cassa leggendaria in caduta — segnata in mappa' },
  taglia: { titolo: 'TAGLIA', preavviso: 'Sta per essere messa una taglia sul pilota più forte…', via: 'TAGLIA' },
};

// --- Bot ---
export const DIFFICOLTA = {
  facile:    { nome: 'Facile', reazione: 0.8, errore: 0.09, vista: 140, aggr: 0.4 },
  normale:   { nome: 'Normale', reazione: 0.45, errore: 0.05, vista: 200, aggr: 0.65 },
  difficile: { nome: 'Difficile', reazione: 0.25, errore: 0.025, vista: 260, aggr: 0.85 },
};

export const NOMI_BOT = [
  'Ferraglia', 'Bullone', 'Martello', 'Scintilla', 'Ruggine', 'Turbina', 'Pistone', 'Saetta', 'Granito',
  'Tenaglia', 'Cavaliere-9', 'Volt', 'Corazza', 'Fulmine', 'Trivella', 'Ingranaggio', 'Vespa', 'Tuono',
  'Manovella', 'Cingolo', 'Tritone', 'Vulcano', 'Brontolo', 'Magnete',
];

export const LUOGHI = ['Città Vecchia', 'Base Ferro', 'Porto Ruggine', 'Raffineria', 'Antenna Nord', 'Fonderia', 'Borgo Cromo'];

export const FORMATI = {
  tutti: { nome: 'Tutti contro tutti', dim: 1 },
  coop: { nome: 'Co-op (umani insieme contro i bot)', dim: 0 },
  coppie: { nome: 'Coppie', dim: 2 },
  squadre4: { nome: 'Squadre da 4', dim: 4 },
};

export const COMANDI = [
  ['W A S D', 'Muoviti'],
  ['MOUSE', 'Mira'],
  ['CLIC SINISTRO', 'Spara con le braccia'],
  ['CLIC DESTRO', 'Spara con le spalle'],
  ['1 – 4', 'Seleziona slot'],
  ['R', 'Ricarica'],
  ['SPAZIO', 'Scatto / Jetpack'],
  ['E', 'Monta parte · tieni premuto su un relitto per strappare'],
  ['G', 'Raccogli nella rastrelliera / rottami'],
  ['Q', 'Scambia arma con la rastrelliera'],
  ['X', 'OVERDRIVE (calore oltre 80%)'],
  ['F', 'Sali / scendi dal mech di un compagno'],
  ['Z', 'Zoom'],
  ['C', 'Telecamera terza persona / cockpit'],
  ['M', 'Mappa'],
  ['- / =', 'Zoom minimappa'],
  ['INVIO', 'Chat'],
  ['ESC', 'Menu e impostazioni'],
];

export const GUIDA = [
  ['01 HANGAR', 'Scegli testa, torso, braccia, gambe e colori. Si parte a mani nude: le armi si trovano sul campo.'],
  ['02 LOBBY', 'Crea una stanza e manda il link agli amici, oppure gioca da solo contro i bot.'],
  ['03 LANCIO', 'Tutti cadono insieme sull\'isola. Raccogli parti: con E le monti sullo scafo.'],
  ['04 SOPRAVVIVI', 'Resta dentro la zona che si chiude. Vince l\'ultima squadra in piedi.'],
  ['STRAPPA-ARTI', 'Un mech abbattuto resta come relitto per 12 s: tieni premuto E vicino per strappargli l\'arma migliore e ripararti.'],
  ['DRONE FANTASMA', 'Se muori diventi un drone: clic per l\'impulso EMP sui nemici, raccogli 5 nuclei per rientrare in partita (una volta).'],
  ['OVERDRIVE', 'Sparare scalda. Oltre l\'80% premi X: danni doppi per 5 s. Se surriscaldi in Overdrive resti bloccato 3 s.'],
  ['EVENTI', 'Tempesta EMP, pioggia di meteore, cassa leggendaria, taglia sul più forte: tieni d\'occhio gli annunci.'],
];
