# EPG digitale terrestre: fonti per canale (verificate 31/10/2026)

Parser nuovi: `D:\tv\epg_parsers_new.js` (`parseSky`, `parseAurora`, ES5). Campioni + test: `D:\tv\epg_samples\` (`node D:\tv\epg_samples\test_parsers.js`, tutti OK, 0 buchi/sovrapposizioni su Aurora).

## Fonti

| Fonte | URL | Formato data | CORS | Sulla TV |
|---|---|---|---|---|
| **RAI** (già nota) | `https://guidatv.rai.it/palinsesto/app/<slug>/<gg-mm-aaaa>.json` | gg-mm-aaaa | (già funzionante) | XHR / cache |
| **MEDIASET SSR** (già nota) | `https://www.mediaset.it/guidatv/` ora fa **301** su `https://mediasetinfinity.mediaset.it/guidatv` (seguire redirect o usare direttamente il nuovo URL) | solo oggi | (già funzionante) | XHR / cache |
| **SKY gtv** (nuova) | `https://apid.sky.it/gtv/v1/events?from=<ISO UTC>&to=<ISO UTC>&pageSize=999&pageNum=0&env=<DTH\|DTT>&channels=<id>[&channels=<id2>...]` | `2026-10-30T23:00:00Z` (UTC, giorno locale = 23:00Z-23:00Z in CET) | `Access-Control-Allow-Origin` solo per `https://guidatv.sky.it`; con `Origin: null` o un altro Origin risponde **403 "Invalid CORS request"**; senza Origin 200 | **serve wget** (epg_offline.sh) |
| **AURORA WBD** (nuova, sito ufficiale nove.tv/realtime/dmax...) | `https://public.aurora.enhanced.live/site/page/<page>/?include=default&filter[environment]=<env>&v=2` | 7 giorni in una sola risposta | `access-control-allow-origin: *` | XHR diretto OK (wget opzionale) |

Note Sky:
- Più canali in una sola chiamata: ripetere `&channels=` (con la virgola restituisce solo l'ultimo).
- Lista canali: `https://apid.sky.it/gtv/v1/channels?env=DTT` (32 canali) / `env=DTH` (143).
- Campi evento: `starttime`/`endtime` (ISO UTC), `content.contentTitle` (titolo migliore; `eventTitle` a volte è solo "Ep. 35"), `eventSynopsis`, `content.imagesMap[].img.url` (path relativo: base `https://guidatv.sky.it`, es. key `cover` 600x800, `scene`/`background` 1920x1080), `content.genre.name`.
- wget: `wget -q -T 20 -O f.json "https://apid.sky.it/gtv/v1/events?from=...&to=...&pageSize=999&pageNum=0&env=DTH&channels=8195&channels=8133&channels=9117"` (senza header Origin è 200).

Note Aurora:
- Struttura: `blocks[type=epgBlock].channels[0].days[7].programs[]` con `start_dt`, `end_dt`, `start_time`, `end_time` (HH:MM), `duration` (min), `show_name`, `title` (episodio), `description`, `season`, `episode`, `show_image` (sempre null nei campioni).
- **ATTENZIONE**: `*_dt` è ora locale italiana etichettata `+00:00`; i programmi a cavallo di mezzanotte compaiono in entrambi i giorni troncati a 00:00. `parseAurora` lo gestisce (inizio vero da `end - duration` se `start_time` non coincide; dedupe).

## Tabella LCN (numerazione LCN indicativa)

| LCN | Canale | Fonte | id / slug | Note |
|---|---|---|---|---|
| 1 | Rai 1 | RAI | `rai-1` | Sky fallback DTH 899 |
| 2 | Rai 2 | RAI | `rai-2` | Sky DTH 898 |
| 3 | Rai 3 | RAI | `rai-3` | Sky DTH 897 |
| 4 | Rete 4 | MEDIASET | `rete4_cR4` | Sky DTH 10464 |
| 5 | Canale 5 | MEDIASET | `canale5_cC5` | Sky DTH 10354 |
| 6 | Italia 1 | MEDIASET | `italia1_cI1` | Sky DTH 10454 |
| 7 | La7 | SKY | DTH `319` (o DTT `8329`) | wget |
| 8 | TV8 | SKY | DTH `8195` (DTT `8327`) | wget |
| 9 | Nove | AURORA | env `nove`, page `guida-tv` | Sky DTH 12116 (meno eventi) |
| 20 | 20 Mediaset | MEDIASET | `20mediaset_cLB` | Sky DTH 10458 |
| 21 | Rai 4 | RAI | `rai-4` | |
| 22 | Iris | MEDIASET | `iris_cKI` | Sky DTH 10467 |
| 23 | Rai 5 | RAI | `rai-5` | |
| 24 | Rai Movie | RAI | `rai-movie` | |
| 25 | Rai Premium | RAI | `rai-premium` | |
| 26 | Cielo | SKY | DTH `8133` (DTT `8773`) | wget |
| 27 | TwentySeven | MEDIASET | `_cTS` (cardTitle "TwentySeven") | Sky DTH 11342 |
| 28 | TV2000 | SKY | DTH `7588` (DTT `8325`) | extra |
| 29 | La7 Cinema (ex La7d) | SKY | DTH `11430` (DTT `6624`) | wget |
| 30 | La5 | MEDIASET | `la5_cKA` | Sky DTT 6625 |
| 31 | Real Time | AURORA | env `realtime`, page `guida-tv` | |
| 33 | Food Network | AURORA | env `foodnetwork`, page `guida-tv` | Sky DTH 12123 |
| 34 | Cine34 | MEDIASET | `cine34_cB6` | Sky DTH 10893 |
| 35 | Focus | MEDIASET | `focus_cFU` | Sky DTH 10470 |
| 36 | RTL 102.5 | SKY | DTT `8320` | extra |
| 37 | Warner TV | **NESSUNA** | | non su Sky/Aurora |
| 38 | Giallo | AURORA | env `giallo`, page **`guida-tv-giallo`** | Sky DTH 12126 |
| 39 | Top Crime | MEDIASET | `topcrime_cLT` | Sky DTH 10468 |
| 40 | Boing | MEDIASET | `kids_cKB` (cardTitle "Boing") | Sky DTT 6628 |
| 41 | K2 | **NESSUNA** | | k2tv.it -> discoveryplus.com (403/auth) |
| 42 | Rai Gulp | RAI | `rai-gulp` | |
| 43 | Rai YoYo | RAI | `rai-yoyo` | |
| 44 | Frisbee | **NESSUNA** | | frisbeetv.it -> discoveryplus.com (403/auth) |
| 46 | Cartoonito | MEDIASET | `kids_cLA` (cardTitle "Cartoonito") | Sky DTT 8132 |
| 47 | Super! | SKY | DTH `6460` (DTT `8314`) | extra |
| 48 | Rai News 24 | RAI | `rai-news-24` | |
| 49 | Italia 2 | MEDIASET | `italia2_cI2` | Sky DTH 10469 |
| 50 | Sky TG24 | SKY | DTH `9117` (DTT `9313`) | wget |
| 51 | TGCom24 | SKY | DTT `10473` | MEDIASET SSR ha anche `_cKF`/video? non verificato |
| 52 | DMAX | AURORA | env **`dmaxit`**, page `guida-tv` | Sky DTH 12120 |
| 54 | Rai Storia | RAI | `rai-storia` | |
| 55 | Mediaset Extra | MEDIASET | `mediasetextra_cKQ` | Sky DTT 6627 |
| 56 | HGTV | AURORA | env **`hgtvit`**, page `guida-tv` | Sky DTH 12127 |
| 57 | Rai Scuola | **NESSUNA** | | `rai-scuola` -> 400 su guidatv.rai.it, non su Sky |
| 58 | Rai Sport | RAI | `rai-sport` | Sky DTT 8317 |
| 59 | Motor Trend | AURORA | env `motortrend`, page `guida-tv` | |
| 64 | SuperTennis | SKY | DTT `8322` | extra |

Aurora channel id interni (informativi): nove 3, real-time 2, dmax 4, food-network 6, motortrend 11, hgtv 13, giallo 27.

## Esito prove

- Sky `apid.sky.it`: 200 senza Origin; 403 con `Origin: null`/estranei. Immagini `https://guidatv.sky.it/uuid/...` 200 image/jpeg.
- Aurora: 200, CORS `*`, ~80-200 KB per canale (7 giorni).
- La7 `www.la7.it/palinsesto` e `/appPalinsesto/...`: 301 (non approfondito: La7/La7 Cinema coperti da Sky).
- discovery+ (K2/Frisbee): API serve token, non usata.
