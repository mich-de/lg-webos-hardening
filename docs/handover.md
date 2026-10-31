# Handover — LG TV hardening & ad-free YouTube

Data: 31/10/2026 · Sessione di lavoro su D:\tv

---

## 1. La TV

| Campo | Valore |
|---|---|
| Modello | **LG 49NANO866NA** (2021, serie NANO86) |
| Firmware | **04.64.00** (webOS 5.6.2, codename `jhericurl-jimna`, board K6HP_DVB_EU) |
| IP LAN | `192.168.188.80` (PC: `192.168.188.81`) |
| root | **SÌ — TV rooted** (exploit SlopBro, persistente) |
| Boot root | `/var/lib/webosbrew/startup.sh` (HBC startup, esegue ~40s dopo l'accensione) |

⚠️ **NON aggiornare il firmware** — 04.64.00 è l'ultimo rootabile per questo otaId
(`HE_DTV_W20H_AFADABAA`). Un update distruggerebbe il root.

⚠️ **NON reinstallare l'app "Developer Mode"** mentre rooted (confligge col root).

---

## 2. come connettersi alla TV (da questo PC)

### Telnet root (canale attuale, già funzionante)
```
port 23 — shell root, niente password
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" D:\tv\tvrun.py 192.168.188.80 "comando"
```
(script `D:\tv\tvrun.py` — wrapper telnetlib; NB: host è argv[1], comando argv[2])

### SSH dev mode (prima del root — ORA DISATTIVATO)
- Device ares: `tv` (`prisoner@192.168.188.80:9922`, chiave `~/.ssh/tv_webos`,
  passphrase dev: `<PASSPHRASE_DEV_MODE>`) — port ssh dev-mode su webOS 5.6.2 = **9922**, key server = **9991**
- nota: il client OpenSSH di Windows fallisce la negoziazione con questi firmware; i tool
  `ares-*` (npm `@webos-tools/cli`, globale) funzionano perché usano la lib ssh2

### SlopBro (exploit usato per il root)
- `D:\tv\slopbro\slopbro-main\` (GitHub throwaway96/slopbro)
- Coppia di chiavi SSAP salvata accanto allo script (file `.key`)
- comando già usato: `python slopbro.py --webos-version 5 --local-ip 192.168.188.81 192.168.188.80`

## 2b. Come è stato eseguito il root (riproducibile)

1. **Python installato** on-the-fly:
   `python-3.12.8-amd64.exe` in `%LOCALAPPDATA%\Programs\Python\Python312`
   (scaricato da python.org/ftp/python/3.12.8/...; winget assente sul PC)
2. **SlopBro scaricato**: `https://github.com/throwaway96/slopbro/archive/refs/heads/main.zip`
   → estratto in `D:\tv\slopbro\slopbro-main\`
3. **Scelta exploit** (dal database in cani.rootmy.tv, file JS analizzato):
   per otaId `HE_DTV_W20H_AFADABAA` il solo exploit ancora funzionante a fw 04.64.00
   è **slopbro** (faultmanager/déjavuln/crashd/wta/asm/rootmytv = patchati)
4. **Esecuzione** dal PC sulla stessa rete:
   ```
   & "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" D:\tv\slopbro\slopbro-main\slopbro.py --webos-version 5 --local-ip 192.168.188.81 192.168.188.80
   ```
   - SlopBro serve un HTML exploit via HTTP sulla `192.168.188.81:8080`
   - apre connessione SSAP sulla porta 3001 e lancia l'app `com.webos.app.adoverlayex`
     iniettando i payload via query string
   - sullo schermo TV chiede **pairing** (accettato con telecomando in ~5 s)
   - payload scaricato e poi eseguito **come root**: installazione Homebrew
     Channel + persistenza in `/var/lib/webosbrew/startup.sh`
   - log sullo schermo/script: "all tracked files were requested" e poi
     "Rooting complete" (toast su TV)
5. **Verifica post-root**:
   - `ares-install --device tv -l` mostra `org.webosbrew.hbchannel`
   - **telnet 192.168.188.80 23** → shell root senza password (banner webOS 5.6.2)
     `id` ⇒ `uid=0(root) gid=0(root)`

---

## 3. Completato — STATO FINALE

### Elenco launcher attuale (verificato DOPO il reboot di conferma)
LG Content Store · Prime Video · **YouTube AdFree** · Art Gallery · Allarme Sport ·
Browser · Foto e video · Musica · Home Dashboard · RaiPlay · Homebrew Channel
(su disco: `amazon`, `it.rainet.raiplay` in cryptofs + `org.webosbrew.hbchannel`,
`youtube.leanback.v4` in `/media/developer/apps/usr/palm/applications/`)

- ✅ Rimosse definitivamente: **14 app spazzatura** iniziali (giochi, spotify, twitch,
  fifa, accuweather, ui30, webos.day, …) + **netflix** (era protezione
  squashfs+overlay: eseguito `umount`, tolta la cartella E l'immagine dati in
  `/media/cryptofs/apps/usr/palm/data/images/netflix`) + **deezer** (aggiunta
  di LG come **"stub app"** con solo icone!) + **rakuten** (icona ghost, mai nei registri)
- ✅ YouTube AdFree installata **dopo il root** — LG NON la rimpiazza più con l'app ufficiale
- ✅ Reboot della TV completato e stato confermato stabile (elenco identico post-reboot)

### Come si toglie un'app LG stub/ricostruita (il trucco finale)
```
luna-send -n 1 luna://com.webos.appInstallService/remove '{"id":"deezer"}'
```
NB: il metodo ufficiale è **`remove`** (NON `uninstall`! → altrimenti errore
"Unknown method"), e il metodo richiede `luna-send` (bus privato, da root):
`{"subscribed":false,"returnValue":true}` = OK. Verifica: getAppInfo → "Invalid appId".
Le app "stub" di LG (deezer/dailymotion/accuweather nel profilo
`applications_smartservice` del device EU, elenco visibile in
`/var/log/configd.log`) si ricreano da sole dopo un semplice `rm -rf` →
serve SEMPRE prima `appInstallService/remove`, poi eventuale `rm -rf` della cartella
e `rm -rf /var/palm/data/com.webos.appInstallService/icon/<id>` (cache icone).

---

## 4. TO-DO (opzionali / verifiche future)

- ✅ ~~NusGuide con EPG reale~~ FATTO e VERIFICATO (31/10/2026, v0.2.4): Rai (cache locale via `epg_offline.sh` su TV ogni 15 min) + Mediaset SSR. "EPG online · 276 programmi" con titoli/orari reali. Magic Remote: click/wheel. Vedi `documentazione.md` §10–14.
- ✅ ~~LG Home sempre indietro~~ FATTO + ESTESO (31/10/2026): takeover Hearth su **entrambi** i percorsi Home:
  (1) `com.webos.app.home` — shim originale, link `47-launcher-takeover`;
  (2) `com.webos.app.fullhome` — su webOS 5.6 Home/Back lancia QUESTA app nativa QML → secondo shim. `takeover.sh` patchato con env `APP_DIR/STAGE/SHIM_ID/LINK` (patch in `D:\tv\staging\takeover.sh`, pushata sul TV), wrapper `fullhome-takeover.sh` + link `46-fullhome-takeover`, stage `stage-fh`. SAM legge entrambi: type web, vendor hearth. `ls-monitor` ha confermato che fullhome era il chiamante reale dei lanci Home.
  UNDO: `sh /media/developer/launcher-takeover/takeover.sh off` + `sh /media/developer/launcher-takeover/fullhome-takeover.sh off` (in quest'ordine).
- ✅ (31/10 sera) **Takeover Home verificato via ls-monitor**: homeKey → `com.webos.app.fullhome` → watcher lancia Hearth in ~150 ms.
- ✅ (31/10 sera) **Hearth IT installato** (build+ares-package+dev/install in-place, takeover rimasto ok). Anche `src/lib/clock.ts` tradotto (giorni/mesi/saluti). ipk: `hearth-it/Hearth-main/build/tld.my.customlauncher_1.2.0_all.ipk`. Rollback: ipk originale `D:\tv\tld.my.customlauncher_1.2.0_all.ipk`.
- ✅ Sfondo Sorrento 4K su TV: `/media/developer/wallpaper/sorrento-4k.jpg` (Commons, CC BY-SA 4.0, crediti `D:\tv\wallpaper\CREDITS.txt`). Attivazione MANUALE: Impostazioni Hearth → Sfondo → Memoria interna (config in localStorage, non settabile da shell).
- ✅ NusGuide 0.3.0 installata (hero, In onda ora, loghi, griglia assoluta). In corso: 0.3.1 (fix lag/blur, linea adesso sfasata ~4 min, impostazione regione TGR default Campania) + ricerca fonti EPG per tutti i canali DTT (`D:\tv\epg_sources_dtt.md`, `epg_parsers_new.js`).
- ⏳ NuSport 0.2.0 in sviluppo (loghi, classifica, giorni, altri campionati) → `D:\tv\nusport\org.nusport.app_0.2.0_all.ipk`, da installare.
- ✅ NuSport 0.2.0 installata+screenshot ok (8 leghe, stemmi, marcatori, classifica, Ieri/Oggi/Domani, F1).
- ✅ NusGuide 0.3.1 installata+screenshot ok (lag: tolto blur, render parziale; TGR regione default Campania; linea adesso allineata). In corso 0.3.2: ~45 canali (Sky via cache wget in epg_offline.sh, Discovery "Aurora" via XHR), fix icona ⚙ (quadratino). Fonti: `D:\tv\epg_sources_dtt.md`.
- 🟡 NusGuide 0.3.2 PACCHETTIZZATA, NON installata (`nusguide/org.nusguide.app_0.3.2_all.ipk`): 41 canali LCN (Rai/Mediaset SSR mediasetinfinity/Sky DTT da cache/Aurora XHR+localStorage 1 h), parser in `app/parsers.js` (test: `node D:\tv\epg_samples	est_parsers.js`), lazy load canali visibili, icona impostazioni SVG. `epg_offline.sh` aggiornato (12 Rai + 1 richiesta Sky multi-canale → `cache/sky-dtt-<gg-mm-aaaa>.json`). Da fare: deploy ipk + script, riavvio loop, screenshot.
- ✅ Sfondo ridotto a 1080p: `/media/developer/wallpaper/sorrento-1080.jpg` (il 4K cancellato dal TV: sprecava RAM).
- ✅ `D:\tv\hardware.md`: specifiche HW complete (Realtek RTD2880, 4×A55 1.1 GHz 32 bit, 1.6 GB RAM, eMMC 8 GB, piano grafico app 1080p).
- ⏸️ Adblock TV: pronto ma NON installato (bloccato dal classifier auto-mode). File: `D:\tv\adblock\hosts.block` (76 730 domini StevenBlack, 9/riga, whitelist hbbtv/rai/mediaset/espn/sky/youtube), hook `D:\tv\adblock\98adblock` (append a `/etc/hosts` tmpfs a ogni boot), comandi `D:\tv\cmds_adblock.txt`. UNDO: `rm /var/lib/webosbrew/init.d/98adblock` + reboot. DNS AdGuard (94.140.14.14 / 94.140.15.15) da impostare a mano: gateway 192.168.188.1.
- ✅ NuSport 0.3.5 installata (0.3.4: riattiva Serie A nascosta per errore in cfg.off, flag cfg.fixA; 0.3.5: icona Aggiorna SVG). Da 0.3.0 (Calendario 30 gg tutte le leghe calcio+NBA, F1 Stagione, Impostazioni leghe/ordine/avvio, promemoria con campanella).
- ✅ NusGuide 0.4.0 installata (Sky ok: bug httpGet stato 0 su file://; doppio click = cambio canale via luna://com.webos.service.apiadapter/tv/openChannel; Ricordamelo).
- ✅ Demone promemoria condiviso attivo: /media/developer/reminders/remind.sh (start/status/add/del/snooze). EPG loop spostato in /media/developer/nusguide-epg/epg_offline.sh.
- ⏸️ Boot hook (94-nusguide-epg, 95-reminders) NON installati: bloccati dal classifier (persistenza). Utente deve lanciare D:\tv\cmds_bootlinks.txt. Senza: dopo reboot promemoria ed EPG Sky fermi.
- ⏳ NuTV (org.nutv.app) 0.1.1 INSTALLATA: video in-app via <video><source src="tv://" type="service/webos-broadcast">, zapping = root openChannel + rilancio NuTV (Live TV visibile ~1-2 s), lista canali reale, banner Ora/Dopo, preferiti, Ricordamelo. Cache EPG copiata da epg_offline.sh in org.nutv.app/cache. App in: D:\tv\nutv\.
- ✅ NuTV 0.2.1 installata: zapping DENTRO l app con <source src="tv://<channelId>" type="service/webos-broadcast"> + video.load() (Live TV non va più in primo piano; fallback openChannel). CH± gestiti da NuTV (con NuTV in primo piano la TV non zappa da sola). VOL: solo OSD LG. Tasto Ingressi = keyCode 1536 confermato. ⚠️ mai ls-monitor senza head -c (riempie /tmp=RAM); scheda Ingressi HDMI; codici tasti ignoti loggati in /tmp/nutv-keys.log). Da 0.1.4: loghi canali originali (35 PNG locali da tv-logo/tv-logos, piastra scura per loghi chiari), icone Lucide inline, revisione 10-foot (testo >=22-28px, focus anello 3px, safe area 5%), DESIGN.md in nutv/. Guida Sky ok. Non testati: tasti reali telecomando, Ricordamelo end-to-end.
- ✅ Skill design installate in D:/CentroAI/data/claude/skills: ui-ux-pro-max, impeccable (solo cartella skill: NON eseguire il launcher, scarica binario), design-taste-frontend, hallmark (esclusi hook/imagegen), react-native-tv-best-practices, tvos-design-guidelines, webos-tv. Catalogo aggiornato.
- ✅ Icone ridisegnate (UIcons Regular Rounded Freepik/Flaticon da npm @flaticon/flaticon-uicons, crediti in Impostazioni Hearth + hearth-it/ICONS.md): Hearth 1.2.3, Guida TV 0.4.2, NuSport 0.3.2, NuTV 0.2.3 installate.
- ⚠️ Loop EPG: avviarlo SEMPRE staccato: luna-send hbchannel exec {"command":"setsid sh /media/developer/nusguide-epg/epg_offline.sh >/tmp/nusepg_loop.log 2>&1 </dev/null &"} (da telnet con nohup muore a fine sessione). Verifica: ps -ef | grep -i epg.
- ❌ Tasti VOL in NuTV: non arrivano mai all app (log tasti: solo 33/34/1536/1537/461), li gestisce il sistema con OSD LG non nascondibile.
- ✅ OSD volume di sistema ridisegnato (QML compositor, bind mount /media/developer/volosd/new/*.qml su /usr/lib/qml/WebOSCompositor/views/volume/, riavvio surface-manager-daemon.service). Comandi: sh /media/developer/volosd/volosd.sh on|off|status [norestart]. Originali in D:/tv/volosd/orig (md5 ok). Persistenza: utente lancia D:/tv/cmds_volosd_boot.txt (hook 93-volosd). Muto via luna: audio/master/muteVolume {mute:true}.
- ❌ YouTube miniature più piccole: NON fattibile (nessuna opzione in youtube-webos; zoom CSS rimpicciolisce solo la pagina). userScript.js ripristinato (backup `userScript.js.orig` sul TV).
- 💡 Proposto all'utente: widget prestazioni (CPU/RAM/temp) in alto a sx in Hearth — in attesa di conferma.
- ⬜ **Test finale da fare on-screen**: premere Home e Back → deve arrivare Hearth (il watcher 8860 reagisce a entrambi gli id). Cattura `ls-monitor` attiva sul TV (`/tmp/lsmon.txt`, resetta alle 17:03) per la verifica via bus.
- ✅ ~~Privacy persistente~~ FATTO (31/10/2026): `/etc` read-only → mask runtime `/run/systemd/system/{uploadd,update}.service -> /dev/null` (verificato: `systemctl start` = no-op, `ps` pulito). Il hook `99privacy` (`/var/lib/webosbrew/init.d/` + copia in `/media/developer/etc/hook.d/`) ricrea il mask a ogni boot + `systemctl stop`.
- ✅ ~~NuSport~~ FATTO e VERIFICATO (31/10/2026, v0.1.0): skeleton subagent + deploy. Screenshot TV: Serie A live reale (Bologna–Monza 2–1, 2° tempo), Udinese–Roma, Milan–Inter. Fonte ESPN free (`site.api.espn.com/apis/site/v2/...`), tab Serie A/Champions/NBA/ATP/WTA, Magic Remote (click/wheel/VK), refresh 60s, no `gap` CSS. Codice: `D:\tv\nusport\app\`.
- ✅ ~~Hearth traduzione IT~~ FATTO + **INSTALLATO** (31/10): traduzione applicata + build
  completa (`vite build` + legacy ES5 581 KB) + packaging `ares-package dist --no-minify`
  + install v **1.2.1** via dev/install (wget da PC :8081) — update-in-place riuscito e
  Hearth rilanciato sul TV. Versione bump son lavoro.
- ✅ Kinda-skill/plugin anti-quota (31/10/2026):
  - Skill `/fritz-newip` in `D:\CentroAI\data\opencode\config\opencode\skills\fritz-newip\SKILL.md` (manuale).
  - **Plugin** `fritz-newip` in `D:\CentroAI\data\opencode\config\opencode\plugins\fritz-newip\index.ts`: hook `retry` → se errore 429/quota: chiede conferma via permission (stacca internet a casa), esegue `fritz-reconnect`, aspetta internet (`api.ipify.org`), retry automatico con delay. Cooldown 30 min. Registrato in `opencode.jsonc` global `plugins`.
- ℹ️ `tvshf.py` patchato (`sys.stdout.reconfigure` utf8) — crashava sui caratteri `●` di systemctl.
- ✅ ~~pulizia residui / icone nere~~ FATTO (elenco launch points pulito e stabile)
- ✅ ~~YouTube AdFree permanente~~ FATTO (installata con `org.webosbrew.hbchannel.service/install`,
  ipk servita via HTTP dal PC su :8081 + sha256 `9c4f1d…53259d`; va in
  `/media/developer/apps/…` e sopravvive ai reboot via script di boot del root)
- ⬜ Opzionale: avvio automatico di YouTube AdFree all'accensione / sorgente input:
  `luna-send-pub -n 1 luna://com.webos.service.eim/addDevice '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'`
  (annullare con `eim/deleteDevice` stesso formato)
- ⬜ Opzionale conservativo: in HBC → Settings abilitare **blockUpdates** (già di default col root)
- ⬜ Controllo utente sul launcher TV dopo l'ultimo reboot: icone nere o Deezer devono essere sparite
- ⚠️ NON riattivare QuickStart+ (Impostazioni → Generale → Dispositivi): evita boot semi-freddi
- ⚠️ NON aggiornare il firmware / NON reinstallare "Developer Mode"

---

## 5. File in D:\tv

| File | Uso |
|---|---|
| `youtube.leanback.v4_0.5.3_all.ipk` | YouTube AdFree (installata; tenuta come backup) |
| `slopbro.zip` / `slopbro\slopbro-main\` | exploit root (servirebbe solo in caso di re-root) |
| `tvshf.py` | **wrapper telnet attuale**: `tvshf.py <ip> <file_comandi.txt> [wait] [wait2]` — legge i comandi da file, niente quote di shell (consigliato) |
| `tvshell.py` / `tvrun.py` / **`cleanup.py`** | wrapper telnet vecchi (⚠️ BUG: passando il comando come unico argomento Python cerca `getaddrinfo` sul comando, "label too long"; chiamare sempre `tvrun.py <ip> "<cmd>"`) |
| `cmds_*.txt` | file di comandi telnet usati durante la sessione |
| `nusguide/app/*` | app "Guida TV" (org.nusguide.app) — JS vanilla, fonti Rai/Mediaset dirette |
| `epg_mediaset_probe.py` / `epg_mediaset_apq.py` / `test_parse_epg.js` | test endpoint Mediaset GraphQL (non usabile) + parser di validazione |
| `rai_tv_guide.js` / `rai_guidatv.html` | componente ufficiale Rai scaricato (da dove è ricavato l'endpoint palinsesto) |
| `documentazione.md` | **documentazione completa** (checkpoint 1–11) |
| questo file | handover |
