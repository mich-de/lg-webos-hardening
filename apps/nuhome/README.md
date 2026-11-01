# NuHome — launcher home per webOS TV 5.x

Launcher home moderno (dark glassmorphism, font system-ui, nessuna libreria/CDN esterna)
per **LG 49NANO866NA** (webOS TV 5.x, 1920x1080). App id: `org.nuhome.launcher`, vendor `NuHome`.

## Struttura progetto

```
nuhome/
├─ app/
│  ├─ appinfo.json      # id, versione 0.1.2, uiRevision "2"
│  ├─ index.html
│  ├─ main.css
│  ├─ main.js
│  ├─ icon.png          # generata da make_icon.py (512x512)
│  └─ bg.png            # (opzionale) generato con: make_icon.py --bg
├─ make_icon.py          # PNG procedurali, SOLO stdlib (struct+zlib)
├─ build_ipk.py          # packaging .ipk, SOLO stdlib (ar + tar.gz); stampa sha256
└─ README.md
```

## 1. Build

```bat
cd /d D:\tv\nuhome
python make_icon.py
python build_ipk.py
```

Il file finale è `org.nuhome.launcher_0.1.2_all.ipk` (stampa anche lo sha256).

## 2. Installare sul TV

### Via Homebrew Channel + HTTP

1. Dai un file server al PC: `python -m http.server 8081` dentro `D:\tv\nuhome`
   (servirà anche il browser di test all'indirizzo `http://<ip-pc>:8081/app/`).
2. Su configurare firelg-pc da Homebrew Channel (app `org.webosbrew.hbchannel`) — opzione "installare
   l'ipk a runtime" lancia:
   ```
   luna://org.webosbrew.hbchannel.service/install { "url": "http://<ip-pc>:8081/org.nuhome.launcher_0.1.2_all.ipk", "id": "org.nuhome.launcher" }
   ```
   (ad es. via SSH sul TV: `luna-send -n 1 -f luna://org.webosbrew.hbchannel.service/install '{"url":...,"id":...}'`)
3. Il TV scarica, installe e avvia NuHome; il launcher compare nella lista app.

### Via sviluppatore webOS (opzionale, per test rapidi)

- Abilita TV "Installa app sviluppatore / Dev mode", usa ares-install o la Homebrew
  Channel UI. Dà `ares-inspect` o servi `app` via `http.server` e usa dev mode
  direttamente con `python -m http.server 8081` nella cartella `app/` (browser debug iframe).

> Nota: il PC e il TV devono essere sulla stessa rete. Nessuna connessione esterna richiesta
> dall'app: LUNA è locale sul TV.

## 3. Come si usa

- Barra superiore: logo **NuHome** (OK = aggiorna lista app), orologio grande + data,
  **Smart bar** con app bloccate.
- Freccia Su dalla prima riga → barra superiore; Freccia Giù sull'ultima riga → wrap in prima riga.
- **OK** breve su un tile = avvia app → `luna://com.webos.service.applicationManager/launch`
- **OK tenuto ~2 s** su un tile / app della smart bar = context menu: blocca/sblocca, avvia, annulla.
- **Back / Indietro** (`461`, `8`, `27`) chiude il context menu.
- Niente polling: una sola `listApps` all'avvio (subscribe=false), refresh manuali con OK sul logo.

## 4. Errori LUNA / fallback

Se `listApps` fallisce, compaiono comunque 4 tile hard-coded:
`youtube.leanback.v4` (YouTube AdFree), `it.rainet.raiplay` (RaiPlay),
`amazon` (Prime Video), `org.webosbrew.hbchannel` (Homebrew Channel).
