# NusMusic — README interno

App webOS "Music" per LG 49NANO866NA (webOS 5.x, rooted) — app id `org.nusmusic.app`, v0.1.0.
Player MP3/FLAC/M4A/AAC/WAV/OGG dal NAS Brume (lighttpd autoindex, HTTP puro): solo contenuti
dal NAS, nessun campo cloud/CDN. Vanilla JS ES5 (Chromium 79), UI italiana, dark theme.

## Struttura (come org.nusport.app)

```
nusmusic/
├─ app/
│  ├─ appinfo.json      # id org.nusmusic.app, 0.1.0, type web, title NusMusic, largeIcon
│  ├─ index.html
│  ├─ main.css          # stesso dark theme di NuSport (no gap flex / no inset, Chromium 79)
│  ├─ main.js           # crawl autoindex + playlist + player + Magic Remote
│  ├─ icon.png          # 128x128 (entry launcher)
│  └─ largeIcon.png     # 230x230 (griglia app grande)
├─ make_icon.py          # PNG procedurali icon.png + largeIcon.png, SOLO stdlib (python nel repo root)
└─ README.md
```

## NAS Brume

- Sorgente: `http://192.168.188.56:8080/` (lighttpd autoindex).
- Parser: righe `<tr class="d">` = directory, `<tr>` = file; `href` per il nome,
  `td[data-value]` per la size.
- Crawl BFS in background, ricorsione max 4 livelli di sotto-cartelle, 3 richieste in
  parallelo; solo file con estensione audio (case-insensitive).
- Il NAS risponde con Range OK: seek/±10s funzionanti direttamente via `<audio>`.

## Funzioni

- **Playlist**: elenco ordinato (cartella, poi titolo) con intestazioni di cartella,
  ricerca libera nel testo (input in alto, filtra nome + percorso), tasto "Aggiorna".
- **Player** (`<audio controls autoplay>`): titolo, cartella, size, "n di m";
  prev/next con toast; ±10s su ←/→; volume con ↑/↓/rotella; loop singolo brano su
  "Ripeti"; "Casuale" = shuffle; OK play/pausa; VK 412/417 prec/succ, 415/19/413.
- **Empty state** in italiano quando non ci sono audio o il NAS non risponde con retry.
- **Magic Remote**: click selettore, rotella per scorrere liste, VK 13 OK / 461 8 27 Back /
  frecce; zone di fuoco (ricerca + barra / lista) identiche a NuSport.
- **Riprendi**: in localStorage (`nusmusic.cfg`) restano shuffle/loop, filtro ricerca e
  ultimo brano+posizione; al riavvio la playlist si riprende con l'ultima traccia a fuoco.

## Nota CORS / mixed content

Il TV carica l'app da `file://`: le XHR verso `http://192.168.188.56:8080/` possono essere
bloccate da Chromium se il NAS non invia CORS (vedi messaggio d'errore dell'app). Se serve,
aggiungere a lighttpd sul NAS:

```
setenv.add-response-header = ( "Access-Control-Allow-Origin" => "*" )
```

La riproduzione via `<audio src>` invece funziona anche senza CORS.

## Build / install

```bat
cd /d D:\tv\nusmusic
make_icon.py            # rigenera le icone (opzionale)
npx ares-package app    # → org.nusmusic.app_0.1.0_all.ipk  (passo successivo atteso)
npx ares-install org.nusmusic.app_0.1.0_all.ipk
```

Prossimo passo atteso: `npx ares-package app` dentro `D:\tv\nusmusic` e install via ares / Homebrew Channel.
