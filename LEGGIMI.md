# RobotWar

Battle royale di mech modulari nel browser, in italiano, giocabile con gli amici. Nessuna installazione, nessun server da pagare.

## Avvio in locale
Dalla cartella del gioco:

```powershell
python -m http.server 8080
```

Poi apri http://localhost:8080 (serve un server: aprendo `index.html` con doppio clic i moduli JS non si caricano).

## Giocare con gli amici
1. MULTIPLAYER → CREA STANZA → COPIA LINK e mandalo agli amici.
2. Gli amici aprono il link, scelgono il mech e premono ENTRA.
3. L'host sceglie le regole (Co-op contro i bot, Tutti contro tutti, Coppie, Squadre da 4) e preme AVVIA PARTITA.

Il link funziona per gli amici solo se il gioco sta su un indirizzo pubblico (vedi sotto).

In partita, in basso a destra, chi si collega vede PING, JITTER e il tipo di collegamento: DIRETTA (da browser a browser) oppure PONTE (passa da un server TURN quando il router blocca il collegamento diretto). Se un amico non riesce proprio a collegarsi, la soluzione più solida è un server TURN dedicato: si aggiunge in `js/config.js` (`ICE_SERVER`). L'host fa da server nel suo browser: se chiude la scheda, la partita finisce. Fino a 8 giocatori umani più i bot (massimo 16 mech).
Su alcune reti aziendali o con NAT molto restrittivi la connessione diretta WebRTC può non riuscire: in quel caso prova da un'altra rete.

## Pubblicazione gratuita (GitHub Pages)
1. Crea un repository pubblico su GitHub (es. `robotwar`).
2. Dalla cartella del gioco:
   ```powershell
   git init
   git add .
   git commit -m "RobotWar"
   git branch -M main
   git remote add origin https://github.com/TUO-UTENTE/robotwar.git
   git push -u origin main
   ```
3. Su GitHub: Settings → Pages → Branch `main`, cartella `/ (root)` → Save.
4. Dopo un minuto il gioco è su `https://TUO-UTENTE.github.io/robotwar/`.

In alternativa: Netlify Drop (trascini la cartella sul sito).

## Comandi
| Tasto | Azione |
|---|---|
| WASD | Muoviti |
| Mouse / clic sinistro | Mira / spara con le braccia |
| Clic destro | Spara con le spalle |
| 1–4 | Seleziona slot |
| R | Ricarica |
| SPAZIO | Scatto, oppure volo col Jetpack |
| E | Monta parte · tieni premuto vicino a un relitto per strapparne un arto |
| G | Metti l'arma nella rastrelliera / prendi rottami |
| Q | Scambia arma con la rastrelliera |
| X | OVERDRIVE (calore oltre 80%) |
| F | Sali/scendi dal mech di un compagno (artigliere) |
| Z / C / M | Zoom / telecamera / mappa |
| INVIO / ESC | Chat / menu |

## Meccaniche
- **Si parte a mani nude**: armi e moduli si trovano sull'isola, con rarità Comune / Rara / Epica / Leggendaria.
- **Arti con vita propria**: un braccio distrutto perde l'arma; le gambe rotte rallentano.
- **Strappa-arti**: un mech abbattuto resta come relitto per 12 s. Tieni premuto E per strappargli l'arma migliore e ripararti.
- **Drone fantasma**: se muori diventi un drone. Clic = impulso EMP sui nemici; raccogli 5 nuclei per rientrare (una volta, nei primi ~5 minuti).
- **Calore e Overdrive**: sparare scalda; oltre l'80% premi X per danni doppi per 5 s. Se surriscaldi in Overdrive resti bloccato 3 s.
- **Eventi d'arena** ogni ~90 s: tempesta EMP, pioggia di meteore, cassa leggendaria, taglia sul pilota più forte.
- **Zona** in 5 fasi: fuori si perde scafo ogni secondo.

## Debug
Con `?debug=1` nell'indirizzo: F8 genera bottino leggendario vicino a te, F9 forza un evento d'arena (solo host o Solo), e in console c'è `robotwar`.

## Struttura
```
index.html, css/stile.css
js/config.js       bilanciamento e testi
js/mondo.js        isola procedurale (dati e collisioni)
js/scenario.js     scena 3D del mondo: edifici, terreno, vegetazione, oggetti, cielo
js/post.js         bagliore (bloom) con qualità Alta
js/mech.js         modelli 3D dei mech
js/simulazione.js  logica autoritativa (host)
js/armi.js         armi, proiettili, danni
js/bot.js          intelligenza dei bot
js/eventi.js       eventi d'arena
js/vista.js        rendering, effetti, telecamera (client)
js/hud.js          interfaccia di gioco
js/input.js        tastiera, mouse, touch
js/audio.js        suoni e musica sintetizzati
js/rete.js         multiplayer PeerJS
js/hangar.js       baia hangar
js/main.js         schermate e ciclo di gioco
```
Tutti gli asset (modelli, suoni, musica) sono generati dal codice: nessun file esterno, nessun diritto di terzi.
