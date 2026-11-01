# Memory — progetto LG TV (D:\tv)

Fatti stabili + decisioni. Dettagli riproducibili in `documentazione.md`.

## Hardware / accesso
- TV: LG 49NANO866NA, webOS 5.6.2 (firmware 04.64.00), IP 192.168.188.80. PC: 192.168.188.81.
- TV **rooted** (SlopBro). ⚠️ NON aggiornare firmware, NON reinstallare Developer Mode, NON riattivare QuickStart+.
- Shell root: telnet (port 23) via wrapper `D:\tv\tvshf.py <ip> <file_comandi.txt> [wait] [wait2]` — comandi da file, NO quoting inline.
- File PC→TV: `python -m http.server 8081 --bind 0.0.0.0 --directory D:\tv` (prompt pesnto/IPv6-half-dead: kill python + rilancia; test curl).

## Installazione app sulla TV (metodo collaudato)
1. `npx ares-package D:\tv\<appdir> --outdir D:\tv\<appdir>` (build a mano FALLISCE verifier: errorCode -5)
2. TV: `wget -q -O /tmp/<app>.ipk http://192.168.188.81:8081/<percorso>.ipk`
3. `timeout -t 25 luna-send -f -n 8 luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/<app>.ipk","subscribe":true}'` — chiave **ipkUrl** non ipkgUri (sennò errorCode -2)
4. Verifica: `luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{"id":"<id>"}'` → version
   Disinstalla: `luna://com.webos.appInstallService/remove` con `{"id":"..."}` (NON uninstall).

## Tracking LG / privacy
- Hook `99privacy` v2 in `/media/developer/etc/hook.d/`: ferma uploadd, remotelogger, voiceinput, update (embarked). RESIDUO: uploadd + update systemd si riattivano (serve disable/mask persistente). DA FARE.
- **Takeover Hearth ATTIVO** (31/10/2026): LG Home montato-over con shim (`/media/developer/launcher-takeover/`, link boot `47-launcher-takeover`). Home/Back/standby → Hearth, LG Home mai parte. SAM già riavviato (method=restart). Old homehook `48-launcher-homehook` disattivato (dir tenuta; ripristina link `ln -sf` solo se togli takeover).
  - Diagnosi: `sh /media/developer/launcher-takeover/takeover.sh diagnose`
  - UNDO: `sh /media/developer/launcher-takeover/takeover.sh off` (ripristina LG Home; se non risponde: rm link+enabled, umount, reboot)

- Hearth homehook attivo (`48-launcher-homehook`): LG Home visibile 1–2 s poi Hearth. `sh /media/developer/launcher-homehook/diagnose.sh` = tutto verde.

## App installate
- `youtube.leanback.v4` YouTube AdFree (purca via boot script root, sopravvive reboot)
- `org.webosbrew.hbchannel` Homebrew Channel
- `org.nusguide.app` "Guida TV" v0.2.4 installata; v0.3.0 pacchettizzata (UI nuova: header data/ora, hero+sfondo sfocato, "In onda ora", griglia assoluta con linea adesso, loghi SVG generati; immagini Rai via `https://www.raiplay.it/resizegd/<w>x-<image>`; nav ↑↓ canale ←→ programma) (NOSTRA app, JS vanilla stdlib-only):
- **Brume NAS (192.168.188.56, OpenWrt "Brume NAS")**: disco `usb` servito HTTP :8080
  (lighttpd autoindex, `Accept-Ranges: bytes` OK — seek video OK) + FTP anonimo ("220 Brume NAS").
  Mount CIFS su TV NON serve, NON funziona (kernel cifs = "Operation not supported",
  mount.cifs assente; root fs read-only → mount solo sotto /media). Cred SSH root
  ignote (user `nas`/`nasnasnas` solo SMB). TV ha `curl` + wget. Test CORS NAS on-screen.
- **App media (31/10/2026, v0.1.0, via dev/install, wget→/tmp)**: `org.nusgallery.app`
  NusGallery (tab FOTO/VIDEO/AUDIO, parse autoindex lighttpd, griglia paginata, viewer
  img/video/audio), `org.nusmusic.app` NusMusic (crawl BFS 4 livelli, playlist, player),
  `org.nusart.app` NusArt (Met Museum public-domain, cross-fade 9s, 9 categorie).
  Sorgenti `D:\tv\nusgallery|nusmusic|nusart\app\`; ipk `_0.1.0_all.ipk` in root progetto
  di ognuna. Lancio verificato: NusGallery parte no crash. TODO: test on-screen.
- **NusArt 0.1.1**: mix Met + NASA (`images-api.nasa.gov`, ~medium da ~thumb), filtro sfondo
  landscape naturalWidth/naturalHeight >= 1.55 (verticali saltate), preferiti
  on-device IndexedDB `nusart-db` (max 25, trim più vecchi), VK 415 = "_salva sfondo",
  chip ★= Preferiti / ⬇= Salva; rotella/frecce = opera ↑↓ = cat.
- **NusStream 0.2.0** (org.nusstream.app): canale StreamingCommunity → web app. Motore = port
  JS ES5 da StrComm/engine (Laravel+Inertia data-page, /it/archive+/it/search JSON,
  self-heal dominio via app_url/cdn_url + 4 seed cold-start, iframe→vixcloud embed→
  masterPlaylist token/expires+canPlayFHD→m3u8 firmato risolto SOLO al play);
  continua-a-guardare localStorage (min2%/fine95%/max20). UI 0.2.0 stile Netflix:
  hero full-bleed (logo+badge+GUARDA/DETTAGLIO), righe poster 186x279, focus rosso
  animato, dettaglio backdrop blur 76vh+logo+badges+chips stagioni+episodi 16:9,
  skeleton shimmer, player barra progresso rossa. Sorgenti `D:\tv\nusstream\app\`.
  ⚠️ NL: full page data-page ≠ X-Inertia parziale (Kotlin): ok, REST completo
  contiene tutto. Verificato on-TV: UA Chromium 79 accettato (200 su tutto).
- **NusGallery 0.1.1**: schermata Sorigente (pulsante t app ▤ in topbar): scan LAN
  192.168.188.1–254:8080 batch XHR cerca marker "Index of" + class="d"
  (lighttpd autoindex) → lista sorgenti con note share `\\192.168.188.56\usb` = root :
  8080 Brume; sorgente scelta persistita localStorage `nusgallery.src`
  (url + nome), cache dir reset a cambio sorgente. Back/eschi = chiude overlay.

## EPG — fonti DIRETTE (niente GitHub/terzi, NO cmem.ai)
- **Rai (perfetto, endpoint ufficiale)**: `https://guidatv.rai.it/palinsesto/app/<slug>/<pole:GG-MM-AAAA>.json`
  - TLS valido solo `guidatv.rai.it` SENZA `www` (www https fallisce ALTNAME; www http ok)
  - risposta: `events[]` con `name`, `date` "gg/mm/aaaa", `hour` "HH:MM", `duration` "HH:MM:SS", `duration_in_minutes` "5 min", `description`, `image`, `program`.
  - slug canali da `rai_guidatv.html` attributo `channels='[..]'` (rai-1..5, movie, premium, gulp, yoyo, news-24, storia, sport, raiplay*)
- **Mediaset (fallback)**: `https://www.mediaset.it/guidatv/` SSR (oggi) — rows `href="/diretta/<slug>"`, cards delimitate `--epg-card-width` ×2, ora `>(HH:MM)<`, title span `text-headline-8b-m`; durata = distanza tra eventi consecutivi.
- **Mediaset GraphQL `frontier.api-graph.mediaset.it`** (GetEpgPageV2, APQ): subgraph page-composition SEMPRE `SUBGRAPH_RESPONSE_BODY_EMPTY` → inutilizzabile. Non ritentare.
- Rifiutate/cadute: epgshare03 (NXDOMAIN), theplatform mediaset-epg (feed off), raiplay.it/guidatv/mappaCanali.json (404), guidatv.sky.it feed.xml (HTML SPA), DPDmancic repo (404), la7.it (404), cmem.ai (vietato).

## Pubblicazione GitHub
- Repo **privato** `github.com/mich-de/lg-webos-hardening`, working copy `D:\tv\_publish\lg-webos-hardening` (master, 2 commit al 01/11/2026).
- Aggiornamento: copiare nella root del publish → docs (`documentazione.md`, `handover.md`, `memory.md`, `hardware.md`, `handover_checkpoint.md`, `epg_sources_dtt.md`), `hearth-it\ICONS.md`, `apps\<app>\` (sorgenti `app/` + script, NO test/shots/ipk/png), poi `git add -A && git commit && git push`. `.gitignore` esclude già `*.png *.ipk node_modules dist`.
- Include anche NusStream (client StreamingCommunity) — deciso esplicitamente dall'utente (01/11/2026), repo resta privato.

## Skills/config locali
- Skills caveman + ponytail in `D:\CentroAI\data\opencode\config\opencode\skills\` (config root attivo; `~/.config/opencode` NON visto). headroom via pip (`headroom` CLI ok).
- cmem.ai NON usare (deciso utente). Subagent spesso quota-exhausted → lavoro inline.
- **Skill `/fritz-newip` + plugin `fritz-newip`** (config globale = tutti progetti): errore 429/quota provider → conferma utente → `fritz-reconnect` → attesa internet → retry. Skill: `skills\fritz-newip\SKILL.md`; plugin: `plugins\fritz-newip\index.ts` (hook `retry`), repo pubblico: https://github.com/mich-de/opencode-plugin-fritz-newip
  - ⚠️ 31/10: NON rimettere entry `plugins` in `opencode.jsonc` globale — dir config auto-carica `plugins\`, entry esplicita crea "Duplicate plugin ID: fritz-newip" (plugin failed). Fix: entry rimossa, solo auto-load.
- **Sessione/checkpoint**: PRIMA che quota scada → aggiorna `handover.md` (stato completo) così nuova sessione riparte. Plugin non salva da solo: handover fresco ogni fase.

## Magic Remote
- Utente usa **Magic Remote** (pointer + wheel + tasti): no dipendenza da soli ←→↑↓.
- App progetto devono supportare: click (tap) su elementi, wheel per scroll, tasti VK standard (13 OK, 461/8/27 Back).
- Chiedere sempre se UI funziona solo da tastiera.

## Convenzioni
- App TV in italiano; vanilla JS, stdlib-only, no CDN/cloud.
- Ogni checkpoint in `documentazione.md`; update `handover.md` (e `memory.md` appena creato) a fine fase.
- **Motore TV reale = Chromium 68.0.3440.106** (verificato 01/11/2026 su :9998 /json/version; browser LG, WAM, app_shell, libcbe; le note "Chromium 79" sono errate). Niente `gap` flex, `inset`, `?.`, `??`, `globalThis`. WAM gira con `--no-sandbox`.
- NuSport ESPN: dir NBA = `basketball` (non `basket`, dà 400). Tennis: eventi in `events[].groupings[].competitions` (no `competitions` diretto). Standings: `site.api.espn.com/apis/v2/sports/soccer/{slug}/standings` → `children[].standings.entries[].stats`. ESPN 403 a UA "HeadlessChrome" (solo test PC).
- ESPN calendario (verificato 31/10/2026): `site.api.../scoreboard?dates=A-B` (range) → **400** per soccer/NBA (ok solo tennis); `dates=YYYYMM` funziona ma pesante (300 KB–1.3 MB). Usa **`site.web.api.espn.com/apis/v2/scoreboard/header?sport=soccer&league=<slug>&dates=YYYYMMDD-YYYYMMDD`** (range ok, ~25 KB gzip/30 gg; eventi in `sports[0].leagues[0].events`, competitors piatti, stato in `fullStatus`). F1 stagione: `racing/f1/scoreboard?dates=2026` (25 GP con sessioni FP1..Race, ~27 KB gzip); `leagues[0].calendar` solo date GP.
- **Promemoria condivisi** (NuSport + Guida TV): demone root `/media/developer/reminders/remind.sh` (sorgente `D:\tv\reminders\`), boot hook `95-reminders` in `/var/lib/webosbrew/init.d/`. App scrivono SOLO via `remind.sh add|del|snooze|lead` (exec hbchannel), client `reminders-client.js` (ES5). Righe `<epoch>|<id>|<appId>|<titolo>|<extra>`. NuSport usa id `ns<espnId>`, extra = slug lega. createAlert/createToast da root confermati (returnValue true); onclick exec da pulsante NON ancora verificato → fallback `touch /media/developer/reminders/onclick_launch`.

## Live TV: cambio canale (testato 31/10/2026, root)
- `luna-send -n 1 luna://com.webos.service.apiadapter/tv/openChannel '{"channelId":"1_33_7_7_263_751_8572"}'` → Live TV in primo piano su LA7 (verifica: `.../tv/getCurrentChannel '{}'`, risponde solo se Live TV attiva, sennò si blocca: usa `timeout -t`).
- Lista: `.../tv/getChannelList '{}'` (790 KB, 516 canali, Terrestrial+Satellite stessi numeri → preferisci channelModeId 0). channelId = `1_<phys>_<lcn>_<lcn>_<TSID>_<SVCID>_<ONID>`.
- `applicationManager/launch` livetv con `params.channelId` NON cambia canale se Live TV già aperta.
- Permessi apiadapter: gruppi system.remote/secondscreen → web app usa fallback `org.webosbrew.hbchannel.service/exec`.
- NusGuide: XHR su file:// (cache/) dà status 0 → accettalo (bug Sky "Guida non disponibile" fino 0.3.2).

## NuTV (`org.nutv.app`, D:\tv\nutv\app, v0.1.0 installata 31/10/2026)
- Video in-app OK: `<video autoplay><source src="tv://" type="service/webos-broadcast">` = canale CORRENTE sintonizzatore (JSON channelID nel type IGNORATO). Nessun permesso in appinfo.
- Cambio canale senza uscire: exec root = openChannel -> loop getCurrentChannel finché channelId combacia -> `applicationManager/launch org.nutv.app params.zap` (Live TV visibile ~1-2 s). getCurrentChannel risponde anche con NuTV in primo piano (Live TV in background).
- Provati, scartati: iepg/setChannel (Unknown method), legacybroadcast.broadcast/changeChannel (serve broadcastId interno).
- XHR file:// verso cache altra app (nusguide/cache) NON funziona -> LA7/TV8/Cielo/TV2000/Super!/SkyTG24/TGCom24 senza EPG in NuTV.
- NuTV 0.1.3: loghi originali canali (tv-logo/tv-logos, PNG ridotti in `app/logos/<LCN>.png`, nell'ipk, no rete), icone Lucide inline, DESIGN.md in D:\tv\nutv\DESIGN.md. TV senza loghi locali (getChannelList imgUrl vuoto).
- Skill design in D:\CentroAI\data\claude\skills\: impeccable (solo cartella skill: NO hook/settings; launcher scarica binario da GitHub releases, non eseguito), design-taste-frontend (taste-skill, senza scripts/), hallmark (senza agents/, install-hook/install/imagegen). thinking-orbs scartato (React/TS).
- NuTV 0.1.9: tasti CH± (codici reali 33/34) e VOL±/muto gestiti da TV anche con NuTV in primo piano (Live TV in background zappa + mostra banner; OSD volume LG non disattivabile: nessuna chiave appinfo). Quindi NuTV non zappa su CH (riallinea in silenzio con getCurrentChannel), no OSD volume propria. Tasto 1536 "Unidentified" da log = presunto Ingressi -> apre scheda Ingressi (da confermare). Iniezione tasti: networkinput/sendSpecialKey arriva all'app ma TV non zappa; uinput (python 2.7 su TV) crea device ma tasti non arrivano.
- **NuTV 0.2.1: zapping DENTRO app senza Live TV**: `<source src="tv://<channelId>" type="service/webos-broadcast">` + `video.load()` sintonizza canale (getCurrentChannel cambia, NuTV resta in primo piano, ~1,5 s). Fallback openChannel+rilancio solo se video non parte. CH± (33/34) gestiti da NuTV (test utente: con NuTV in primo piano TV NON zappa da sé). Tasto Ingressi = 1536 (confermato).
- NuTV 0.2.5 (sorgente+ipk, NON installata: TV offline 31/10 22:50): scheda Programmi del canale (palinsesto 24h, OK su futuro = promemoria, su live = guarda), tab Recenti (`nutv.recent`, 12), timer spegnimento 30/60/90/120 (0.2.6: processo root `setsid sh -c sleep+powerOff`, pid in `nutv.sleep`, kill solo se /proc/pid/cmdline contiene powerOff; fallback timer in-app; `tvpower/power/powerOff` reason remoteKey NON verificato), orologio nel banner, accento colore canale, barra avanzamento nelle righe. 0.2.6: dettaglio programma (immagine Rai `raiplay.it/resizegd/`, Sky sized, Aurora; trama, episodio) nel pannello Programmi. Fix CSS: riga orfana che annullava `.logo.inp`.
- Scartati: legacybroadcast `broadcast/changeChannel` (broadcastId: mediaId e id pipeline UMS "Invalid broadcastID"; `broadcast/open` crea sessione staccata, non cambia schermo). ⚠️ `ls-monitor | grep -o '.\{0,40\}...'` ha scritto 362 MB in /tmp: usa sempre `head -c`.

## Browser Sicuro (org.nusbrowser.app, D:\tv\nusbrowser, 01/11/2026) — SOLO TV, nessun PC (requisito utente)
- Stato e prossimi passi: `handover.md`. Motore scelto: WPE WebKit (cog) armhf a 1280x720 in finestra nativa, 8,6 fps misurati contro ~3 di Chromium headless + JPEG.
- Finestra nativa: il compositor LG mostra una superficie solo con `wl_webos_shell_surface` e `appId` di un'app avviata prima (lanciarla ~7 s prima). Lo shim `tv/webos-shim.c` (LD_PRELOAD) la aggiunge a cog. Protocollo: `webos-shell.xml` di webosbrew/SDL-webOS.
- Compositor (wayland-info): wl_shell, wl_shm, wl_webos_shell, mali_buffer_sharing; niente xdg_wm_base. Socket /tmp/xdg/wayland-0 root:505.
- CPU Cortex-A55 32 bit. GPU Mali (/dev/mali0, libmali soft-float): inutilizzabile da armhf; da armel non presenta frame.
- Isolamento (kernel 4.4 senza seccomp/user_ns): uid 65534, capability zero, chroot, namespace rete/mount/PID via `ns.py` (Python 2.7 TV; unshare Debian vuole pidfd_open). Rete solo via `forward.js` -> socket unix -> `proxy.js` uid 99 (solo :443, http -> redirect https, no IP privati, adblock).
- Browser LG: `native_builtin`, jail chroot, uid 5446, zero capability, rete condivisa. `run_webbrowser`/`extra_conf` non letti. Non irrobustibile senza sostituire il binario.
- Trappole TV: telnet tronca righe >~1 KB e chiudendo la sessione uccide i comandi (script autonomi con setsid); BusyBox sleep senza decimali; tar da Windows lascia uid 197609; dopo prove con bind, montaggi impilati: smontare in ciclo e verificare PRIMA di rm -rf; con document.hidden la WAM non lavora, i test vanno in foreground. Mai chromium completo + nodejs: partizione piena.
- Cattura schermo: `luna://com.webos.surfacemanager/captureCompositorOutput {"output":"/tmp/x.jpg","format":"JPG"}`.
- L'utente usa la TV durante i test: non pilotarla senza dirlo, e rimettere l'app che stava usando.
