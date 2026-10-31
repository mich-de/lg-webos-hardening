# NusArt (org.nusart.app) — interno

Galleria a schermo pieno / salvaschermo per webOS 5.x (rooted, webapp): opere di pubblico
dominio dal **Met Museum**. Stesso pattern di NuSport (`D:\tv\nusport\app\`): vanilla JS,
nessun build, nessun CDN, Chromium 79 (niente `?.`/`??`, niente `gap`/`inset` CSS).

## File

| File | Ruolo |
|---|---|
| `appinfo.json` | id `org.nusart.app`, v0.1.0, type web, icon.png + largeIcon.png |
| `index.html` | due layer `img` sovrapposti per il cross-fade, topbar, didascalia, attesa, banner |
| `main.css` | dark theme, `object-fit: contain`, cross-fade opacity 1.2 s, barra 9 s |
| `main.js` | logica: Met API, shuffle, cache in memoria, Magic Remote, fallback |
| `icon.png` / `largeIcon.png` | icone app |
| `README.md` | questo file |

## API usate (nessuna chiave)

- `search`: `…/v1/search?hasImages=true&isPublicDomain=true&q=<artista>` → `objectIDs`
- `objects/<id>` → `primaryImage`, `title`, `artistDisplayName`, `objectDate`, `objectName`

Categorie preimpostate: Van Gogh, Monet, Renoir, Vermeer, Rembrandt, Klimt, Hokusai,
Caravaggio, Seurat. **Nessun id hard-coded**: a ogni categoria gli id vengono mescolati
(Fisher–Yates) e pescati a caso. Cache **solo in memoria** durante la sessione
(search per artista + oggetti già visualizzati).

## Comportamento

- Avanzamento automatico ogni **9 s**, cross-fade CSS 1,2 s (due layer, toggle `.vis`).
- Ogni immagine viene **precaricata**: URL rotto → skip automatico sull'opera successiva
  (guardia `tent > 40`, guard `seq` per scartare le risposte dei salti vecchi).
- `onerror` anche a runtime (listener capture su `.slide` come in NuSport).
- Se nessuna immagine entro **10 s** dall'avvio → schermata di attesa con messaggio
  italiano, spinner e bottone **Riprova**; banner informative.

## Magic Remote

| Input | Azione |
|---|---|
| Click (puntatore) | interfaccia on/off (salvaschermo); click su chip categoria → cambia categoria; su "Riprova" → ritento |
| Rotella | cambio manuale opera (su/giù) |
| ← → | opera precedente / successiva |
| ↑ ↓ | categoria precedente / successiva |
| VK 13 (OK) | salta alla successiva |
| VK 461 / 8 / 27 (Back/Bksp/Esc) | esce dalla app |

## Prossimi passi

1. Package: `ares-package D:\tv\nusart\app` → installare con `ares-install` (o via
   Homebrew Channel come le altre webapp rooted).
2. Collaudo sulla TV: avvio, passaggio tra categorie (↑↓), skipp rapidi (rotella),
   disconnessione rete → schermata di attesa entro 10 s + Riprova.
3. Eventuali ritocchi: durata slide (`SLIDE_MS`), fade (`FADE_MS`), tempo atteso
   (`AVVIO_TIMEOUT`) in `main.js`.
