# Memory — progetto LG TV (D:\tv)

Fatti stabili e decisioni. Dettagli riproducibili in `documentazione.md`.

## Hardware / accesso
- TV: LG 49NANO866NA, webOS 5.6.2 (firmware 04.64.00), IP 192.168.188.80. PC: 192.168.188.81.
- TV **rooted** (SlopBro). ⚠️ NON aggiornare firmware, NON reinstallare Developer Mode, NON riattivare QuickStart+.
- Shell root: telnet (port 23) via wrapper `D:\tv\tvshf.py <ip> <file_comandi.txt> [wait] [wait2]` — comandi da file, NO quoting inline.
- Distribuzione file PC→TV: `python -m http.server 8081 --bind 0.0.0.0 --directory D:\tv` (prompt pesnto/IPv6-half-dead: killare i python e rilanciare; test con curl).

## Installazione app sulla TV (metodo collaudato)
1. `npx ares-package D:\tv\<appdir> --outdir D:\tv\<appdir>` (build a mano FALLISCE il verifier: errorCode -5)
2. TV: `wget -q -O /tmp/<app>.ipk http://192.168.188.81:8081/<percorso>.ipk`
3. `timeout -t 25 luna-send -f -n 8 luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/<app>.ipk","subscribe":true}'` — chiave **ipkUrl** non ipkgUri (altrimenti errorCode -2)
4. Verifica: `luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{"id":"<id>"}'` → version
   Disinstallazione: `luna://com.webos.appInstallService/remove` con `{"id":"..."}` (NON uninstall).

## Tracking LG / privacy
- Hook `99privacy` v2 in `/media/developer/etc/hook.d/`: ferma uploadd, remotelogger, voiceinput, update (embarked). RESIDUO: uploadd e update systemd si riattivano (servono disable/mask persistente). DA FARE.
- **Takeover Hearth ATTIVO** (31/10/2026): LG Home montato-over con shim (`/media/developer/launcher-takeover/`, link boot `47-launcher-takeover`). Home/Back/standby → Hearth, LG Home non parte mai. SAM già riavviato (method=restart). Old homehook `48-launcher-homehook` disattivato (dir tenuta; ripristinare il link `ln -sf` solo se si toglie il takeover).
  - Diagnosi: `sh /media/developer/launcher-takeover/takeover.sh diagnose`
  - UNDO: `sh /media/developer/launcher-takeover/takeover.sh off` (ripristina LG Home; se non risponde: rm link+enabled, umount, reboot)

- Hearth homehook attivo (`48-launcher-homehook`): LG Home visibile 1–2 s poi Hearth. `sh /media/developer/launcher-homehook/diagnose.sh` = tutto verde.

## App installate
- `youtube.leanback.v4` YouTube AdFree (purca via boot script root, sopravvive ai reboot)
- `org.webosbrew.hbchannel` Homebrew Channel
- `org.nusguide.app` "Guida TV" v0.2.4 installata; v0.3.0 pacchettizzata (UI nuova: header data/ora, hero+sfondo sfocato, "In onda ora", griglia assoluta con linea adesso, loghi SVG generati; immagini Rai via `https://www.raiplay.it/resizegd/<w>x-<image>`; nav ↑↓ canale ←→ programma) (NOSSA app, JS vanilla stdlib-only):
- **Brume NAS (192.168.188.56, OpenWrt "Brume NAS")**: il disco `usb` è servito HTTP su :8080
  (lighttpd autoindex, `Accept-Ranges: bytes` OK — seek video OK) + FTP anonimo ("220 Brume NAS").
  Mount CIFS su TV NON serve e NON funziona (kernel cifs = "Operation not supported",
  helper mount.cifs assente; root fs read-only → mount solo sotto /media). Cred SSH root non
  note (user `nas`/`nasnasnas` solo SMB). La TV ha `curl` e wget. Test CORS NAS on-screen.
- **App media (31/10/2026, v0.1.0, installate via dev/install, wget→/tmp)**: `org.nusgallery.app`
  NusGallery (tab FOTO/VIDEO/AUDIO, parse autoindex lighttpd, griglia paginata, viewer
  img/video/audio), `org.nusmusic.app` NusMusic (crawl BFS 4 livelli, playlist, player),
  `org.nusart.app` NusArt (Met Museum public-domain, cross-fade 9s, 9 categorie).
  Sorgenti `D:\tv\nusgallery|nusmusic|nusart\app\`; ipk `_0.1.0_all.ipk` in root progetto
  di ciascuna. Lancio verificato: NusGallery parte senza crash. TODO: on-screen test.
- **NusArt 0.1.1**: mix Met + NASA (`images-api.nasa.gov`, ~medium da ~thumb), filtro sfondo
  landscape naturalWidth/naturalHeight >= 1.55 (le verticali vengono saltate), preferiti
  on-device in IndexedDB `nusart-db` (max 25, trim i più vecchi), VK 415 = "_salva sfondo",
  chip ★= Preferiti / ⬇= Salva; rotella/frecce = opera ↑↓ = cat.
- **NusGallery 0.1.1**: schermata Sorigente (pulsante t app ▤ in topbar): scan LAN
  192.168.188.1–254:8080 in batch XHR che cerca il marker "Index of" + class="d"
  (lighttpd autoindex) → lista sorgenti con note share `\\192.168.188.56\usb` = root :
  8080 del Brume; selezione sorgente persistita in localStorage `nusgallery.src`
  (url + nome), cache delle dir resettata al cambio sorgente. Back/eschi = chiudo overlay.

## EPG — fonti DIRETTE (niente GitHub/terzi, NO cmem.ai)
- **Rai (perfetto, endpoint ufficiale)**: `https://guidatv.rai.it/palinsesto/app/<slug>/<pole:GG-MM-AAAA>.json`
  - TLS valido solo su `guidatv.rai.it` SENZA `www` (www https fallisce ALTNAME; www http ok)
  - risposta: `events[]` con `name`, `date` "gg/mm/aaaa", `hour` "HH:MM", `duration` "HH:MM:SS", `duration_in_minutes` "5 min", `description`, `image`, `program`.
  - slug canali di `rai_guidatv.html` attributo `channels='[..]'` (rai-1..5, movie, premium, gulp, yoyo, news-24, storia, sport, raiplay*)
- **Mediaset (fallback)**: `https://www.mediaset.it/guidatv/` SSR (oggi) — rows `href="/diretta/<slug>"`, cards delimitate `--epg-card-width` ×2, ora `>(HH:MM)<`, title span `text-headline-8b-m`; durata = distanza tra eventi consecutivi.
- **Mediaset GraphQL `frontier.api-graph.mediaset.it`** (GetEpgPageV2, APQ): subgraph page-composition SEMPRE `SUBGRAPH_RESPONSE_BODY_EMPTY` → inutilizzabile. Non ritentare.
- Rifiutate/cadute: epgshare03 (NXDOMAIN), theplatform mediaset-epg (feed disattivato), raiplay.it/guidatv/mappaCanali.json (404), guidatv.sky.it feed.xml (è HTML SPA), DPDmancic repo (404), la7.it (404), cmem.ai (vietato).

## Skills/config locali
- Skills caveman + ponytail installate in `D:\CentroAI\data\opencode\config\opencode\skills\` (config root attivo; `~/.config/opencode` NON viene visto). headroom via pip (`headroom` CLI ok).
- cmem.ai NON usare (deciso dall'utente). Subagent spesso quota-exhausted → lavoro inline.
- **Skill `/fritz-newip` + plugin `fritz-newip`** (config globale = tutti i progetti): su errore 429/quota del provider → conferma utente → `fritz-reconnect` → attesa internet → retry. Skill: `skills\fritz-newip\SKILL.md`; plugin: `plugins\fritz-newip\index.ts` (hook `retry`), repo pubblico: https://github.com/mich-de/opencode-plugin-fritz-newip
  - ⚠️ 31/10: NON rimettere l'entry `plugins` in `opencode.jsonc` globale — la directory config auto-carica `plugins\` e l'entry esplicita crea "Duplicate plugin ID: fritz-newip" (plugin failed). Fix: entry rimossa, solo auto-load.
- **Sessione/checkpoint**: PRIMA che la quota scada → aggiornare `handover.md` (stato completo) così qualsiasi nuova sessione riparte. Il plugin non salva da solo: l'handover va tenuto fresco ogni fase.

## Magic Remote
- L'utente usa il **Magic Remote** (pointer + wheel + tasti): niente dipendenza da soli ←→↑↓.
- Le app del progetto devono supportare: click (tap) sugli elementi, wheel per scorrere, tasti VK standard (13 OK, 461/8/27 Back).
- Chiedere sempre qualcosa in caso di UI che funzioni solo da tastiera.

## Convenzioni
- App TV in italiano; vanilla JS, stdlib-only, niente CDN/cloud.
- Ogni checkpoint va in `documentazione.md`; update di `handover.md` (e `memory.md` appena creato) a fine fase.
- Chromium 79 (webOS 5.6): oltre a `gap` su flex, NON supportato nemmeno CSS `inset` (Chrome 87) → usare top/left/right/bottom.
- NuSport ESPN: dir NBA = `basketball` (non `basket`, dà 400). Tennis: eventi in `events[].groupings[].competitions` (no `competitions` diretto). Standings: `site.api.espn.com/apis/v2/sports/soccer/{slug}/standings` → `children[].standings.entries[].stats`. ESPN risponde 403 a UA "HeadlessChrome" (solo per test PC).
- ESPN calendario (verificato 31/10/2026): `site.api.../scoreboard?dates=A-B` (range) → **400** per soccer/NBA (ok solo tennis); `dates=YYYYMM` funziona ma pesante (300 KB–1.3 MB). Usare **`site.web.api.espn.com/apis/v2/scoreboard/header?sport=soccer&league=<slug>&dates=YYYYMMDD-YYYYMMDD`** (range ok, ~25 KB gzip/30 gg; eventi in `sports[0].leagues[0].events`, competitors piatti, stato in `fullStatus`). F1 stagione: `racing/f1/scoreboard?dates=2026` (25 GP con sessioni FP1..Race, ~27 KB gzip); `leagues[0].calendar` ha solo date GP.
- **Promemoria condivisi** (NuSport + Guida TV): demone root `/media/developer/reminders/remind.sh` (sorgente `D:\tv\reminders\`), boot hook `95-reminders` in `/var/lib/webosbrew/init.d/`. Le app scrivono SOLO via `remind.sh add|del|snooze|lead` (exec hbchannel), client `reminders-client.js` (ES5). Righe `<epoch>|<id>|<appId>|<titolo>|<extra>`. NuSport usa id `ns<espnId>`, extra = slug lega. createAlert/createToast da root confermati (returnValue true); onclick exec da pulsante NON ancora verificato → fallback `touch /media/developer/reminders/onclick_launch`.

## Live TV: cambio canale (testato 31/10/2026, root)
- `luna-send -n 1 luna://com.webos.service.apiadapter/tv/openChannel '{"channelId":"1_33_7_7_263_751_8572"}'` → Live TV in primo piano su LA7 (verifica: `.../tv/getCurrentChannel '{}'`, risponde solo se Live TV attiva, altrimenti si blocca: usare `timeout -t`).
- Lista: `.../tv/getChannelList '{}'` (790 KB, 516 canali, Terrestrial+Satellite con stessi numeri → preferire channelModeId 0). channelId = `1_<phys>_<lcn>_<lcn>_<TSID>_<SVCID>_<ONID>`.
- `applicationManager/launch` livetv con `params.channelId` NON cambia canale se Live TV è già aperta.
- Permessi apiadapter: gruppi system.remote/secondscreen → web app usa fallback `org.webosbrew.hbchannel.service/exec`.
- NusGuide: XHR su file:// (cache/) dà status 0 → va accettato (bug Sky "Guida non disponibile" fino a 0.3.2).

## NuTV (`org.nutv.app`, D:\tv\nutv\app, v0.1.0 installata 31/10/2026)
- Video in-app OK: `<video autoplay><source src="tv://" type="service/webos-broadcast">` = canale CORRENTE del sintonizzatore (JSON channelID nel type IGNORATO). Nessun permesso in appinfo.
- Cambio canale senza uscire: exec root = openChannel -> loop getCurrentChannel finché channelId combacia -> `applicationManager/launch org.nutv.app params.zap` (Live TV visibile ~1-2 s). getCurrentChannel risponde anche con NuTV in primo piano (Live TV in background).
- Provati e scartati: iepg/setChannel (Unknown method), legacybroadcast.broadcast/changeChannel (serve broadcastId interno).
- XHR file:// verso cache di un'altra app (nusguide/cache) NON funziona -> LA7/TV8/Cielo/TV2000/Super!/SkyTG24/TGCom24 senza EPG in NuTV.
- NuTV 0.1.3: loghi originali canali (tv-logo/tv-logos, PNG ridotti in `app/logos/<LCN>.png`, inclusi nell'ipk, niente rete), icone Lucide inline, DESIGN.md in D:\tv\nutv\DESIGN.md. La TV non ha loghi locali (getChannelList imgUrl vuoto).
- Skill design installate in D:\CentroAI\data\claude\skills\: impeccable (solo cartella skill: NIENTE hook/settings; il launcher scarica un binario da GitHub releases, non eseguito), design-taste-frontend (taste-skill, senza scripts/), hallmark (senza agents/, install-hook/install/imagegen). thinking-orbs scartato (React/TS).
- NuTV 0.1.9: tasti CH± (codici reali 33/34) e VOL±/muto li gestisce la TV anche con NuTV in primo piano (Live TV in background zappa e mostra il suo banner; OSD volume LG non disattivabile: nessuna chiave appinfo trovata). NuTV quindi non zappa sui CH (riallinea in silenzio con getCurrentChannel) e non ha OSD volume propria. Tasto 1536 "Unidentified" dal log = presunto Ingressi -> apre scheda Ingressi (da confermare). Iniezione tasti: networkinput/sendSpecialKey arriva all'app ma la TV non zappa; uinput (python 2.7 sul TV) crea il device ma i tasti non arrivano.
- **NuTV 0.2.1: zapping DENTRO l'app senza Live TV**: `<source src="tv://<channelId>" type="service/webos-broadcast">` + `video.load()` sintonizza il canale (getCurrentChannel cambia, NuTV resta in primo piano, ~1,5 s). Fallback openChannel+rilancio solo se il video non parte. CH± (33/34) gestiti da NuTV (test utente: con NuTV in primo piano la TV NON zappa da sé). Tasto Ingressi = 1536 (confermato).
- Scartati: legacybroadcast `broadcast/changeChannel` (broadcastId: mediaId e id pipeline UMS "Invalid broadcastID"; `broadcast/open` crea una sessione staccata che non cambia lo schermo). ⚠️ `ls-monitor | grep -o '.\{0,40\}...'` ha scritto 362 MB in /tmp: usare sempre `head -c`.
