# LG webOS 5 Hardening & Custom Apps

Progetto di personalizzazione per **LG 49NANO866NA** (webOS 5.6.2). Contiene launcher sostitutivo (Hearth IT), app personalizzate senza cloud, adblock, EPG offline, promemoria condivisi, OSD volume ridisegnato.

## Cosa c'è

| Cartella | Uso |
|---|---|
| **hearth-it/** | Launcher sostitutivo Hearth, traduzione IT, icone UIcons |
| **apps/** | App personalizzate (NusGuide = EPG, NuSport = sport, NuTV = Live TV, NusLive = canali Italia, NusStream = player catalogo, NusBrowser = browser WPE, NuHome = launcher base, NusGallery/NusMusic/NusArt = media) |
| **tv/epg/** | Loop EPG offline (Rai + Sky), cache locale ogni 15 min |
| **tv/reminders/** | Demone promemoria condiviso tra app, boot hook |
| **tv/adblock/** | Adblock via hosts (StevenBlack unified ~77k domini) |
| **tv/privacy/** | Hook privacy (disabilita telemetry upload, update) |
| **tv/volosd/** | OSD volume ridisegnato (compositor QML) |
| **tv/launcher-takeover/** | Shim Hearth al posto di LG Home |
| **docs/** | Hardware, memory, handover, documentazione completa |

## Prerequisites

- **TV rooted** (SlopBro già eseguito) + Homebrew Channel installato
- **PC sulla stessa LAN** della TV
- **Node.js** >= 14 (per building app Hearth e ares-package)
- **Python 3** (tools di build icone)
- **ares-cli** (npm -g: `npm install -g @webos-tools/cli`)

Verificare connessione:
```
telnet <TV_IP> 23    # accesso root, shell senza password
```

## Build e install app

### 1. Build Hearth (launcher IT)

```bash
cd hearth-it
npm install
npm test           # test (richiede sh/Git Bash su Windows)
npm run build      # typecheck + dist/ creata
npx ares-package dist --outdir . --no-minify
# tld.my.customlauncher_*.ipk creato
```

Nota: `npm run package` usa `sh scripts/package.sh` (serve un `sh` POSIX); su Windows si può usare il `npx ares-package` sopra.

Dev-install sulla TV:
```bash
python -m http.server 8081 --directory .
# Poi su TV (telnet):
wget -q -O /tmp/hearth.ipk http://<PC_IP>:8081/tld.my.customlauncher_*.ipk
luna-send -n 8 luna://com.webos.appInstallService/dev/install \
  '{"id":"com.ares.defaultName","ipkUrl":"/tmp/hearth.ipk","subscribe":true}'
```

### 2. Build app NusGuide, NuSport, NuTV, ecc.

```bash
cd apps/nusguide
npx ares-package app --outdir .
# org.nusguide.app_*.ipk creato
```

Ripetere per `apps/nusport`, `apps/nutv`, `apps/nuslive`, `apps/nusstream`, `apps/nusbrowser`, `apps/nuhome`, `apps/nusgallery`, `apps/nusmusic`, `apps/nusart`.

Dev-install:
```bash
wget -q -O /tmp/app.ipk http://<PC_IP>:8081/org.nusguide.app_*.ipk
luna-send -n 8 luna://com.webos.appInstallService/dev/install \
  '{"id":"org.nusguide.app","ipkUrl":"/tmp/app.ipk"}'
```

## Avvio automatico (boot hooks)

File comandi in `tv/cmds/`:

- **cmds_bootlinks.txt**: installa hook boot (EPG, promemoria, launcher takeover)
- **cmds_volosd_boot.txt**: installa OSD volume ridisegnato
- **cmds_adblock.txt**: installa adblock hosts

Lanciare sulla TV via telnet (file per file, aspettare "fine" prima del successivo):
```
tvshf.py <TV_IP> tv/cmds/cmds_bootlinks.txt 3 3
tvshf.py <TV_IP> tv/cmds/cmds_volosd_boot.txt 3 3
tvshf.py <TV_IP> tv/cmds/cmds_adblock.txt 3 3
```

## Struttura progetto

```
D:\tv\_publish\lg-webos-hardening/
├── hearth-it/
│   ├── src/ scripts/ public/ # launcher source (Vite + Preact/TS)
│   └── ICONS.md            # crediti icone UIcons
├── apps/
│   ├── nusguide/           # EPG (Rai, Mediaset, Sky)
│   ├── nusport/            # Sport live (ESPN)
│   ├── nutv/               # Live TV in-app
│   ├── nuslive/            # Canali Italia (EPG 204 canali, zapping in-app)
│   ├── nusstream/          # Player catalogo (HLS, tracce audio/sottotitoli)
│   ├── nusbrowser/         # Browser sicuro (motore WPE nativo + shim)
│   ├── nuhome/             # Launcher base vanilla JS
│   ├── nusgallery/         # Foto/video da NAS
│   ├── nusmusic/           # Musica da NAS
│   └── nusart/             # Arte (Met Museum + NASA)
├── tv/
│   ├── epg/
│   │   └── epg_offline.sh  # loop EPG, ogni 15 min
│   ├── reminders/
│   │   └── remind.sh       # demone promemoria
│   ├── adblock/
│   │   ├── hosts.block     # lista domini bloccati
│   │   └── build_hosts.py  # rigenera da StevenBlack
│   ├── privacy/
│   │   └── 99privacy       # disabilita telemetry
│   ├── volosd/
│   │   └── volosd.sh       # attiva OSD ridisegnato
│   ├── launcher-takeover/
│   │   └── takeover.sh     # rimpiazza LG Home con Hearth
│   └── cmds/
│       ├── cmds_bootlinks.txt
│       ├── cmds_volosd_boot.txt
│       └── cmds_adblock.txt
├── tools/
│   ├── tvshf.py            # wrapper telnet (comandi da file)
│   ├── make_icons.py       # genera icone (UIcons)
│   └── uicons_extract.py   # estrae glyph da UIcons
├── wallpaper/
│   └── sorrento-1080.jpg   # sfondo default
└── docs/
    ├── hardware.md         # specifiche TV
    ├── handover.md         # stato finale, note
    ├── handover_checkpoint.md # checkpoint NuStream/Canali Italia
    ├── memory.md           # fatti stabili
    ├── documentazione.md   # checkpoints dettagliati
    ├── epg_sources_dtt.md  # sorgenti EPG
    └── epg_parsers_new.js  # parser EPG test
```

## Note importanti

- **Non aggiornare il firmware** — 04.64.00 è l'ultimo rootabile
- **EPG loop**: lanciare sempre staccato (setsid) altrimenti muore alla chiusura telnet
- **Adblock**: rigenera `hosts.block` ogni volta (StevenBlack ~77k domini, whitelist app TV/Rai/Mediaset/ESPN/Sky)
- **OSD volume**: bind mount QML dal compositor, verificare con `systemctl status surface-manager-daemon`
- **Magic Remote**: app supportano pointer, wheel, tasti VK standard (OK=13, Back=461)
- **Chromium 68 reale** (webOS 5.6, verificato su `:9998/json/version`; le note "Chromium 79" sono errate): niente `?.`, `??`, `globalThis` JS; niente `gap` e `inset` CSS (usare top/left/right/bottom)

## Crediti

- **Hearth**: launcher webOS open source (GitHub: second-screen/hearth)
- **Icone**: UIcons Regular Rounded (Flaticon/Freepik) — vedi `hearth-it/ICONS.md`
- **EPG Rai**: API ufficiale `guidatv.rai.it`
- **Adblock**: StevenBlack unified hosts (GitHub: StevenBlack/hosts)
- **Exploit root**: SlopBro (GitHub: throwaway96/slopbro) — **solo a scopo educativo, non ridistribuire**

## Licenza

Progetto educativo. App personalizzate: vanilla JS, niente dipendenze cloud.

---

**Ultima aggiornamento**: 01/11/2026  
Per dettagli tecnici: vedi `docs/documentazione.md` e `docs/handover.md`
