# Hearth IT — direzione visiva icone (v2, "piastre illustrate a livelli")

Giudizio sulla v1 (glifo-linea bianco su piastra a gradiente scuro uguale per tutti): "brutte e anonime".
v2: ogni app/ingresso ha una sua **identità**: colore pieno e saturato, un **motivo di sfondo proprio** preso dal
soggetto (raggi di trasmissione per NuTV, palinsesto a barre per Guida TV, campo da calcio per NuSport, ...),
il **soggetto pieno** in primo piano e un **riflesso**. Riferimenti: Apple TV home (icone LSR a livelli con parallax,
tvOS HIG FOCUS-04) e adaptive icon / banner Android TV (foreground + background separati, logo nella safe zone 66%).

## Regole
- **Composizione a 3 livelli** (viewBox 100×100, ogni livello è un `<svg>` assoluto separato dentro la piastra):
  1. **sfondo**: tinta piena del tile + motivo disegnato a mano con due sole tinte di sovrapposizione
     (`rgba(255,255,255,.13)` luce, `rgba(0,0,0,.14)` ombra) + ombra portata del soggetto (stesso path, nero 24%,
     spostato di +1.4/+2 unità). Così ogni colore genera da sé i suoi toni, senza gradienti.
  2. **soggetto**: glifo **UIcons Solid Rounded** (pieno, non linea), 50% del lato, centrato (safe zone 66%).
  3. **riflesso**: grande ellisse bianca 9% in alto a sinistra (luce sul vetro).
- **Colore**: tinta piena satura per tile (tabella sotto). Glifo bianco `#FFFFFF`; su giallo glifo scuro `#2B1D00`.
  Nessun gradiente, ombra CSS, blur o filtro.
- **Focus = profondità** (parallax a livelli, solo `transform`, compositor): tile già ingrandito da Hearth +
  sfondo `translate(-2px,-1px) scale(1.04)`, soggetto `translate(3px,-5px) scale(1.07)`, riflesso `translate(9px,5px)`
  (movimenti 1-2 / 3-5 / 5-9 px come la Parallax Layer Reference tvOS). Transizione 220 ms; poi una deriva lenta
  del soggetto e del riflesso per 2 cicli (≈5 s) e quiete, così il TV non anima a vuoto. Disattivabile:
  `ART_PARALLAX = false` in `src/config/features.ts` (oppure `prefers-reduced-motion`). Mai `filter`/`box-shadow` animati.
- **Loghi di terzi** (RaiPlay, YouTube, Prime Video, Homebrew, Input Hook, ...): immagine originale, stessa
  piastra/raggio/anello di focus; al focus ricevono lo stesso livello **riflesso** che scorre, così si muovono
  come le altre.
- **Nostre app** (Guida TV, NuSport, NuTV): in Hearth sono disegnate dal vivo a livelli come le app di sistema
  (mappa `SYSTEM_APP_ICON`); le loro `icon.png` (512×512, Pillow, `make_icons.py`) riproducono la stessa
  composizione appiattita, per Home LG e ovunque webOS mostri l'icona.
- Forma/raggio = impostazione Hearth "forma icone" (la piastra ritaglia i livelli).
- Il nome resta nell'etichetta sotto il tile (un banner con wordmark sarebbe illeggibile a 150 px).

## Tavolozza e motivi
| Chiave | Tile | Fondo | Glifo `fi-sr-…` | Motivo |
|---|---|---|---|---|
| nutv | NuTV | `#FF5A14` arancio segnale | `tv-retro` | raggi (trasmissione) |
| nusguide | Guida TV | `#5B3DF5` indaco elettrico | `calendar-clock` | barre di palinsesto (EPG) |
| nusport | NuSport | `#0FA554` verde prato | `football` | campo: strisce di taglio, metà campo, cerchio, aree |
| nusgallery | NusGallery | `#14A3FF` azzurro | `images` | sole e colline |
| nusmusic | NusMusic | `#F0146E` lampone | `headphones` | solchi di vinile |
| nusart | NusArt | `#FFC400` giallo (glifo scuro) | `brush` | macchie di colore |
| nuslive | NusLive | `#E5141B` rosso diretta | `live` | onde di segnale |
| photo | Foto e video / Media Player | `#FF3D6E` rosa | `photo-video` | sole e colline |
| music | Musica | `#B81EE0` magenta | `music-alt` | solchi di vinile |
| homedash | Home Dashboard | `#12B5CB` ciano | `smart-home` | griglia di punti (dispositivi) |
| browser | Browser | `#1F6FFF` blu | `globe` | meridiani e paralleli |
| gallery | Art Gallery | `#FF8A00` ambra | `palette` | macchie di colore |
| sports | Allarme Sport | `#E11D2E` rosso | `trophy` | raggi |
| house | LG Home | `#A50034` rosso LG | `home` | glifo fantasma gigante |
| tv (fisso) | Impostazioni sistema | `#3B4A63` grafite | `settings-sliders` | binari dei cursori |
| gear | Impostazioni Hearth | `#D9481C` brace | `settings` | fiamma fantasma (`fire-flame-curved`) |
| hdmi / usb / input | Porta HDMI, USB, Altro ingresso | `#FFB800` giallo (glifo scuro) | `plug-cable`, `usb-pendrive`, `sign-in-alt` | strisce diagonali |
| tv / settop / antenna | TV, Decoder, Antenna | `#0BB5A5` teal | `screen`, `satellite-dish`, `broadcast-tower` | onde di segnale |
| console / controller | Console, Controller | `#2F4BFF` / `#6A2BFF` | `gamepad`, `joystick` | griglia di punti |
| desktop / laptop | PC, Laptop | `#2477C9` / `#3E6DB5` | `computer`, `laptop` | strisce diagonali |
| tvbox | Box / stick TV | `#7B2FF7` | `router` | raggi |
| disc / speaker | Lettore dischi, Soundbar | `#1A73E8` / `#00897B` | `disc-drive`, `speaker` | solchi |
| phone / camera | Telefono, Fotocamera | `#2EB85C` / `#FF3D6E` | `mobile-notch`, `camera` | punti / sole e colline |

Geometria dei motivi delle nostre app (100×100, condivisa tra Hearth e `make_icons.py`):
- **raggi**: 12 spicchi da (50,54), larghi 15°, ogni 30°, raggio 95, luce; disco r 30 ombra.
- **EPG**: 4 righe (y 12, 32, 52, 72; alte 13; raggio 6.5) di barre affiancate con stacco 3, larghezze
  [28,46,34] [16,54,40] [42,24,44] [22,38,50] da x −6; barre alternate luce/ombra; colonna "ora" x 58-61 luce.
- **campo**: 8 strisce verticali larghe 12.5 alternate ombra; linee luce spessore 2.6: metà campo x 50, cerchio
  r 17 in (50,50), aree rettangoli x −3..17 e 83..103, y 28..72.

## Crediti
- Glifi: **Flaticon UIcons Solid Rounded**, autore Freepik (https://www.flaticon.com/uicons), dal pacchetto
  npm ufficiale `@flaticon/flaticon-uicons@3.3.1`, convertiti in path locali da `uicons_extract.py ... solid`
  (`uicons/paths-solid.json`, `uicons/uicons-solid-rounded.ttf`). Licenza Flaticon gratuita: attribuzione
  obbligatoria, mostrata in Hearth (Impostazioni, riga in basso): "Icone: UIcons Solid di Freepik – Flaticon
  (flaticon.com/uicons); motivi e composizione Hearth IT".
- Motivi, palette e composizione: disegnati a mano per Hearth IT (nessun asset di terzi).
- Loghi RaiPlay, YouTube, Prime Video, Homebrew, Input Hook: dei rispettivi titolari, non modificati.

## Implementazione
- Hearth: `src/lib/art.ts` (tavolozza `ART`, motivi), `src/components/ArtIcon.tsx` (3 livelli),
  `src/components/Tile.tsx`, `src/lib/sourceicons.ts` (path Solid, `SYSTEM_APP_ICON` incl. nostre app),
  `src/components/Glyph.tsx`, `src/theme/global.css` (`.art*`, parallax), `src/config/features.ts`
  (`ART_PARALLAX`), `src/screens/Settings.tsx` (crediti).
- PNG nostre app: `D:\tv\hearth-it\make_icons.py` (Pillow, TTF Solid, supersampling 4×): Guida TV/NuSport/NuTV
  512×512; NusGallery, NusMusic, NusArt (icon + largeIcon) e NusLive alle dimensioni originali. NusStream escluso.
- v1 (UIcons Regular su gradienti) archiviata: `uicons/paths.json`, `uicons/uicons-regular-rounded.ttf`.
