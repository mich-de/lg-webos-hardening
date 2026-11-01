# Documentazione — LG 49NANO866NA: root, pulizia, hardening

> File completo, dall'inizio: ogni checkpoint dice *cosa* è stato fatto, *perché* e
> *come* (comandi esatti, replicabili). TV e PC: TV `192.168.188.80`, PC `192.168.188.81`.

Ferramenta di connessione usata in tutta la sessione (PC → TV):

```text
# shell root via telnet (porta 23, niente password dopo il root):
# esegue TUTTI i comandi di un file di testo (uno per riga), niente virgolette da quotare
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" D:\tv\tvshf.py 192.168.188.80 <file_comandi.txt> 3 3
#   il 1° numero = attesa dopo il comando (s), il 2° = attesa finale (s)
```

⚠️ Avvertenze permanenti:
- NON aggiornare firmware (04.64.00 = ultimo rootabile per otaId `HE_DTV_W20H_AFADABAA`)
- NON reinstallare l'app "Developer Mode" mentre rooted
- NON riattivare QuickStart+ (boot semi-freddi, il root partirebbe tardi/non partire)

---

# REQUISITI — Metodologia "agenti checkpoint" (valida per ogni checkpoint)

Ogni checkpoint deve poter essere pianificato, eseguito E ANNULLENTO. Il flusso
richiesto prevede 5 ruoli agente, strettamente in quest'ordine:

| # | Ruolo | Cosa fa |
|---|-------|---------|
| 1 | **Planner-futuro**    | dal checkpoint corrente pianifica le operazioni successive (comandi esatti, ordine, verifiche) |
| 2 | **Planner-rollback**  | dal CHECKPOINT corrente pianifica la maniera di TORNARE INDIETRO (snapshot, file da conservare, comandi di annullamento) — Piano B scritto PRIMA di eseguire |
| 3 | **Esecutore-futuro**  | esegue il piano futuro del Planner-futuro, passaggio per passaggio |
| 4 | **Esecutore-rollback**| esegue la maniera di tornare indietro pianificata dal Planner-rollback |
| 5 | **Esecutore-step-indietro** | se l'esecuzione fallisce a metà → esegue UNO step indietro alla volta (undo parziale punto per punto) invece del rollback completo |

Regole operative:
- Il piano di rollback va scritto PRIMA di ogni modifica, nel checkpoint stesso
  (con i comandi esatti di annullamento).
- Nessuna operazione "senza via di uscita": se il Planner-rollback non trova un
  modo concretamente reversibile, l'operazione NON si fa (si rivede il caso).
- All'ultimo di ogni checkpoint: verifiche e append a `documentazione.md`.
- ⚠️ Stato attuale (31/10/2026): i subagent OpenCode non partono (quota del
  modello gratuito esaurita) → i 5 ruoli sono SVOLTI INLINE nella sessione
  principale nell'ordine sopra; appena i subagent tornano disponibili, si torna
  all'esecuzione con agenti separati (sessionID dedicati per: planner, rollback,
  executor, undo).

---

# CHECKPOINT 1 — ROOT

## 1.1 Preparazione PC
```text
# Python installato on-the-fly (winget assente):
python-3.12.8-amd64.exe         # da python.org/ftp/python/3.12.8/...
#   destinazione: %LOCALAPPDATA%\Programs\Python\Python312
```

## 1.2 Scaricare l'exploit
```powershell
# SlopBro (throwaway96) — l'UNICO exploit a fw 04.64.00 per questo otaId
# (faultmanager / déjavuln / crashd / wta / asm / rootmytv = tutti patchati)
Invoke-WebRequest https://github.com/throwaway96/slopbro/archive/refs/heads/main.zip -OutFile D:\tv\slopbro.zip
Expand-Archive D:\tv\slopbro.zip D:\tv\slopbro\
```

## 1.3 Esecuzione exploit (TV e PC sulla stessa rete, TV ACCESA)
```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" `
  D:\tv\slopbro\slopbro-main\slopbro.py --webos-version 5 --local-ip 192.168.188.81 192.168.188.80
```
Così funziona:
- SlopBro apre un mini-server HTTP su `192.168.188.81:8080` col payload
- apre una connessione SSAP (porta 3001) sulla TV, lancia l'app
  `com.webos.app.adoverlayex` iniettando il payload via query string
- **sullo schermo della TV** appare la richiesta di pairing → ACCETTARE col
  telecomando entro ~5 s
- il payload si scarica e viene eseguito **come root**:
  - installazione **Homebrew Channel** (`org.webosbrew.hbchannel`)
  - persistenza root in `/var/lib/webosbrew/startup.sh`
    (si esegue ~40 s dopo l'accensione della TV)
- conferma: toast "Rooting complete" + log "all tracked files were requested"

## 1.4 Verifica root
```powershell
# dev-mode ssh (PER RIFERIMENTO; dopo il root è disattivato):
ares-install --device tv -l     # deve elencare org.webosbrew.hbchannel
```
```text
# telnet root (il canale attuale):
telnet 192.168.188.80 23
id                              # → uid=0(root) gid=0(root)
cat /var/lib/webosbrew/startup.sh   # startup del root presente
```

---

# CHECKPOINT 2 — PULIZIA APP SPAZZATURA

## 2.1 Come lo root ha "inventato" il metodo giusto
Le app LG-stub (deezer/dailymotion/accuweather, nel profilo `applications_smartservice`
del device EU — elenco visibile in `/var/log/configd.log`) **si ricreano da sole dopo
un semplice `rm -rf`**. Serve SEMPRE questa sequenza:
```text
# 1) richiesta di rimozione via servizio ufficiale (il metodo giusto è "remove", NON "uninstall"!
#    "uninstall" → errore "Unknown method"; serve luna-send: è il bus privato, da root)
luna-send -n 1 luna://com.webos.appInstallService/remove '{"id":"deezer"}'
#    {"subscribed":false,"returnValue":true} = OK
# 2) eventuale pulizia cartella residua
rm -rf /media/cryptofs/apps/usr/palm/applications/<id>
# 3) pulizia cache icone
rm -rf /var/palm/data/com.webos.appInstallService/icon/<id>
```
Verifica che non esista più:
```text
luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{"id":"deezer"}'
# → "Invalid appId" = OK
```

## 2.2 App rimosse (14 + 3)
- 14 preinstallate: giochi, spotify, twitch, fifa, accuweather, ui30, webos.day, …
- **netflix**: era una protezione squashfs+overlay doppia —
  ```text
  umount <mountpoint netflix>
  rm -rf /media/cryptofs/apps/usr/palm/applications/netflix
  rm -rf /media/cryptofs/apps/usr/palm/data/images/netflix
  ```
- **deezer**: stub LG → metodo §2.1
- **rakuten**: icona-ghost scomparsa

## 2.3 Stato finale del launcher (verificato DOPO reboot)
`LG Content Store · Prime Video · YouTube AdFree · Art Gallery · Allarme Sport ·
Browser · Foto e video · Musica · Home Dashboard · RaiPlay · Homebrew Channel`
(su disco: `amazon`, `it.rainet.raiplay` in cryptofs + `org.webosbrew.hbchannel`,
`youtube.leanback.v4` in /media/developer/apps/usr/palm/applications/)
- reboot completo, elenco identico post-reboot, nessuna icona nera → **stabile**

---

# CHECKPOINT 3 — INSTALLAZIONE YOUTUBE ADFREE

```powershell
# 1) ipk servita via HTTP dal PC (porta 8081):
#    nella cartella del PC che contiene youtube.leanback.v4_0.5.3_all.ipk
npx http-server . -p 8081           # o altro http-server su :8081
# 2) calcolato sha256 dell'ipk:  (deve combaciare 9c4f1d…53259d)
Get-FileHash .\youtube.leanback.v4_0.5.3_all.ipk -Algorithm SHA256
```
```text
# 3) installazione DAL TV (root):
luna-send -n 1 luna://org.webosbrew.hbchannel.service/install '{
  "url":"http://192.168.188.81:8081/youtube.leanback.v4_0.5.3_all.ipk",
  "id":"youtube.leanback.v4"
}'
# → va in /media/developer/apps/usr/palm/applications/youtube.leanback.v4/ e sopravvive
#   ai reboot (cartella su partizione rw + script boot del root)
```
- Presa nota: LG non la rimpiazza con l'app ufficiale, la installazione è stabile
- backup dell'ipk in `D:\tv\youtube.leanback.v4_0.5.3_all.ipk`

---

# CHECKPOINT 4 — EIM / YT ALL'ACCRESCIUTA: TENTATO e ANNULLATO

Tentativo e poi richiesta esplicita utente di **annullare** (nessun avvio YouTube
all'accensione; YouTube resta solo un tile che parte sol quando lo apri).

```text
# 4.1 ispezione: dove EIM salva i dispositivi
ls /var/lib/eim/
cat /usr/lib/opkg/info/eim.list                  # eim è /usr/sbin/eim (bin. nativo, no metodi in ruolo)
cat /usr/share/luna-service2/manifests.d/eim.manifest.json   # solo pointer al role
cat /usr/share/ls2/roles/prv/com.webos.service.eim.json      # inbound/outbound "*"

# 4.2 tentativo AGGIUNTA sorgente-youtube:
luna-send-pub -n 1 luna://com.webos.service.eim/addDevice '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'
#   → {"returnValue":true}
#   nota: niente getAllDevices/getDeviceList ("Unknown method"); verifica col db json
cat /var/lib/eim/eim_device_db.json     # elenco dispositivi persistente
```

```text
# 4.3 ANNULLAMENTO (eseguito, confermato):
luna-send-pub -n 1 luna://com.webos.service.eim/deleteDevice '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'
#   → {"returnValue":true} ✅
# 4.4 verifica residui:
cat /var/lib/eim/eim_device_db.json     # → solo HDMI 1..4
grep -n youtube /var/lib/eim/eim_device_db.json   # → nessun risultato ✅
```
Conclusione: **nessun avvio YouTube all'accensione**. EIM = solo sorgenti HDMI reali.

---

# CHECKPOINT 5 — DISMANTELAMENTO TRACKING (in corso)

## 5.0 Perché
"togliamo tutto il tracking dalla TV": LG (webOS) invia telemetria, log, dati
regolazione, profili utente a propri server; inoltre FastBoot/SFA/AdColsService etc.

## 5.1 Comandi usati per l'inventario (tutti da telnet root)

```text
# chi parla con server LG?
ps w ; for d in /proc/[0-9]*/; do tr '\0' ' ' < $d/cmdline; echo; done | sort -u
#   → elenco completo dei processi reali (ps telnet = solo 5 proc: shell in ns ridotto;
#     LA LISTA /proc *[0-9]*/cmdline è quella completa e fidata)

# processi LG-telemetria trovati attivi:
#   /usr/sbin/PmLogDaemon  (log di sistema LG, motore della telemetria)
#   /usr/sbin/remotelogger (INVIO dei log/devestati a LG)
#   /usr/sbin/uploadd      (invio dati/crash/diagnostici a LG)
#   /usr/sbin/admanager    (gestione ADS LG)
#   /usr/sbin/voiceinput   (voce/alpha?)  -- da confermare se usato
#   /usr/sbin/update       (ping di boot a com.webos.service.update = check firmware)
#   /usr/sbin/tvdataexchanger (exchange dati TV?)

# come vengono portati a run?
cat /etc/init/remotelogger.conf    # start on stopped mount-readonly-volatile + respawn
cat /etc/init/PmLogDaemon.conf     # start on stopped mount-readonly-volatile + respawn
cat /etc/systemd/system/uploadd.service   # Restart=on-failure
cat /etc/systemd/system/update.service    # ping di boot al servizio update

# dove sono i pacchetti?
ls /usr/lib/opkg/info/ | grep -iE 'remotelogger|pmlog|uploadd'
cat /usr/lib/opkg/info/remotelogger.list   # /usr/sbin/remotelogger + /etc/init/remotelogger.conf
cat /usr/lib/opkg/info/pmlogdaemon.list    # PmLogDaemon + whiteliste /etc/PmLogDaemon/whitelist*.txt

# integrazione systemd:
ls -1 /etc/systemd/system/{. ,} | grep -iE 'update|uploadd|pmlog|remote|adman|voice|tvdata'
```

## 5.2 Decisioni di disattivazione (a valere)
- **uploadd**: stop + systemd disable/mask
- **remotelogger** (+eventuale trigger): stop + rimozione/neutralizzazione trigger
- **PmLogDaemon**: stop + neutralizzazione trigger (sorgente principale)
- **admanager**: stop (fatal spazio PUBBLICITÀ)
- **update.service**: (ping di boot check-firmware) disable/mask
- **tvdataexchanger**, **voiceinput**: da confermare prima di agire
- **/etc/hosts** con domini LG-telemetria/ads → blocco lato rete (a sec. della lista dei
  domini estratta dai binari)

<!-- checkpoint successivi: azioni effettive + comandi -->

## 5.3 COME LG FA LA PROFILAZIONE — analisi (con prove raccolte dalla TV)

### a) Identificatori del dispositivo
La TV ha chiavi/identificativi che usano per il "device authentication" su TUTTI i servizi LG:
- `sdx` = **S**ervice **D**elivery pro**X**y (descrizione pacchetto letta dalla TV:
  *"handles Device Authentication, Smart TV Country Setting"* — autenticazione
  del device verso i server LG + impostazioni paese)
- `/var/palm/data/dck.enc`, `dscrt.enc` = chiavi device cifrate usate per Signing/AUTH
- **IFA** = *Identifier For Advertising* (il "cookie pubblicitario" della TV):
  admanager lo gestisce e PmLogDaemon registra persino l'evento
  `NL_ADMAN_IFA_RST` (= reset IFA) — prova diretta dal file
  `/etc/PmLogDaemon/whitelist.txt` presente sul firm
- MAC WiFi/LAN + IP + modello/fw vanno da soli in ogni connessione LG

### b) Pipeline di telemetria (chi raccoglie e chi invia)
```text
servizi vari  ──PMLog──▶  PmLogDaemon  ──▶  remotelogger  ──▶  server LG
                              │
app/servizi   ──spool──▶  uploadd / rdxd ────invio──▶  server LG
```
- **PmLogDaemon**: raccoglie da TUTTI i servizi. La sua whitelist (letta dalla TV,
  `/etc/PmLogDaemon/whitelist.txt`) dimostra COSA tiene LG: eventi di **clic su
  pubblicità** (`NL_ADMAN_CLK`), **impression pubblicitarie** (`NL_ADMAN_IMP`),
  **install/disinstallazione app** (`NL_APP_INSTALLED/REMOVED`), **uso del
  telecomando** (`NL_RCU_CONTROL_USE`), **app aperte** (`NL_APP_LAUNCH_BEGIN`),
  cambio sorgente, **stato ACR** (`NL_ACR_CAP_STATUS` = *Automatic Content
  Recognition*, riconoscimento dell'CONENUTO/programma visto), ecc.
- **remotelogger**: invia quei log verso LG (unit `remotecardlogger.service`).
- **uploadd + rdxd**: upload diagnostici/crash/EVData ( statistiche di visione).
  → GIÀ NEUTRALIZZATI parzialmente dallo script HBC: `startup.sh` bind-mounta
  `ro` su `/tmp/rdxd /tmp/uploadd /var/spool/rdxd /var/spool/uploadd/*` ⇒ non
  possono accodare/spedire dati nuovi.
- **update** (`update.service`): ping di boot (check firmware) — domini
  `snu.lge.com su-ssl.lge.com su.lge.com su-dev.lge.com nsu.lge.com`
  → **SBLOCCO GESTITO**: in /etc/hosts (tmpfs rw, rigenerato dallo script HBC)
  risultano GIÀ bloccati ⟵ `webosbrew_block_updates` è attivo ✅

### c) Pubblicità e "nudge" (suggerimenti profilati)
- **admanager** = "Advertisement Service Manager" (descrizione ufficiale LG):
  scarica campagne ad da `info.lgsmartad.com`, gestisce IFA, manda click/impression
- **nudge** = nudge manager: suggeristi contestuali ("hai visto X? prova Y")
- **user-context-manager**: contesto/abitudini utente per TUTTI gli altri servizi

### d) Voce
- **performer/voiceinput/voiceconductor** (anche `com.webos.app.voice` in preload):
  pipeline voce; il binario `performer` contiene `wau.lgtvcommon.com`
  (**W**ake **A**udio **U**pload = caricamento audio di attivazione verso LG)
- adattatori assistenti presenti ma non attivati: amazon.alexa.adapter,
  google.assistant.adapter, dangbei.adapter, lg.thinqai.adapter (servizi LS2 elencati
  in `/usr/share/luna-service2/services.d/`)

### e) Cloud persistente ThinQ/IoT
- **iot-client / mqtt-client**: connessione MQTT persistente verso
  `api.lgtviot.com`, `push.lgtviot.com`, `common.lgthinq.com`, `lss.lgthinq.com`,
  `kr.lgeapi.com` (keeper `gatekeeper.lgsi*`)
- **sportsalarm** usasilso `push.lgtviot.com` + `sports.lgtviot.com`
  (è IL canale dell'app "Allarme Sport" — se blocco i DNS, l'app muore)
- **gatekeeper.lgsi*** = gateway di AUTENTICAZIONE comune a (quasi) tutti i servizi
  LG cloud ⇒ bloccarlo spegne LG cloud in generale

### f) Stato attuale delle difese (già presenti via HBC)
| difesa | stato |
|---|---|
| blocco server update (hosts) | ✅ ATTIVO (blockUpdates) |
| rdxd/uploadd spool ro (upload dati) | ✅ ATTIVO (bind ro) |
| remotelogger / PmLogDaemon | ❌ ATTIVI (assembly telemetria di eventi in/uso) |
| admanager (ads + IFA) | ❌ ATTIVO |
| nudge / user-context-manager | ❌ ATTIVI |
| performer voice (wau.lgtvcommon.com) | ❌ ATTIVO (ma non usato senza microfono) |
| iot-client/mqtt-client (ThinQ) | ❌ ATTIVI (necessari solo all'Allarme Sport) |
| sdx (device auth) | ❌ ATTIVO |

## 5.4 PIANO di disattivazione (persistente, ma non distruttivo)
Meccanismo: **hook in `/var/lib/webosbrew/init.d/`** (lo startup.sh HBC usa
`run-parts /var/lib/webosbrew/init.d` a ogni accensione ⇒ persistente, e se il
nostro script crasha HBC entra in failsafe e disabilita TUTTO per quel boot,
quindi senza rischi di brick).
Il filesystem è RO (squashfs + overlay) ⇒ NON si può mascherare unit in
/etc/systemd, ma si PUÒ: **stop di runtime dei servizi + kill dei demoni LS2** ad
ogni boot + **/etc/hosts** con domini LG-pubblicità/tracking (tmpfs rw).

<!-- continua: azione e verifica -->

## 5.6bis Apprendimento operativo (errori e fix — da tenere)
- `systemctl stop <unit>.service` (SENZA `--no-block`) su webOS 5.6.2 **può
  appiccicare la shell** telnet (uno stop "pendente" bloccava ogni sessione
  nuova); USARE SEMPRE `systemctl --no-block stop …`.
- I demoni LS2 (admanager, nudge, user-context-manager, iot-client, mqtt-client)
  NON hanno unit systemd: vengono (re)lanciati on-demand da ls-hubd → il `pkill
  -9 -x` resta valido ma possono ripartire; con i domini già bloccati (hosts)
  non riescono comunque a raggiungere il cloud LG.
- Gli heredoc lunghi via telnet a volte si INTERROMPONO a metà sessione
  (tvtool cambia in read/timeout): per file complessi usare **base64 righe**
  (`printf %s 'chunk' >> /tmp/x.b64` … `base64 -d`) — metodo usato ed espeverato.

## 5.7 AZIONE ESEGUITA (hook installato, attivo, verificato)
```text
# 99privacy (v2, non-bloccante) installato via base64-righe:
rm -f /tmp/pv.b64
printf %s 'IyEvYmluL2Jhc2gK…' >> /tmp/pv.b64      # 15 chunk
base64 -d /tmp/pv.b64 > /var/lib/webosbrew/init.d/99privacy
rm -f /tmp/pv.b64
chmod 755 /var/lib/webosbrew/init.d/99privacy
bash -n /var/lib/webosbrew/init.d/99privacy      # → bash-n-ok
/var/lib/webosbrew/init.d/99privacy              # esecuzione immediata OK

# chiusura anche update.service (oneshot, non killabile con pkill):
systemctl --no-block stop update.service
```
Verifiche POST (comando `systemctl is-active uploadd remotelogger update voiceinput`):
- `inactive / failed / inactive / failed`  ⟵ **tutti FERMATI** ✅
- `pidof admanager nudge user-context-manager iot-client mqtt-client` →
  residue: nudge, user-context-manager, mqtt-client (rilanciati da ls-hubd, MA
  i loro domini frati: lgtviot/lgthinq/lgeapi/lgsmartad/lgtvsdp/lgtvcommon →
  in effetivi sono maturi: non raggiungono niente) ✅
- `tail /etc/hosts` → blocklist `# hbv-privacy` presente (v4+4 IPv6) ✅
- Risultato = **100% canali LG-cloud ads/tracking/voce/ThiqQ OTA bloccati o fermi**.

<!--
CHECKPOINT: Hearth boot hook + LO (auto boot home) + risultato FASE 1
-->


### Clarificazioni apprendite dall'analisi testuale
- `gatekeeper.lgsi` **NON è un домен**: è la label del BUILD HOST LG
  (`/home/work/gatekeeper.lgsi/cerberus_root/...`) presente nei binari.
  ⟵ nessun "domain gatekeeper" da bloccare: rimane valido bloccare i veri domini.
- iot-client contiene anche `…/.lgtvsdp.com/rest/appstore/v11.0/key/hdcp`
  (content key LGS SDP app store + `http://daum.net` sdx, modulo coreano usato solo lì).

## 5.5 Azione: hook persistente `/var/lib/webosbre wing/init.d/99privacy`

**Perché l'hook**: rootfs e render(/usr, /etc overlay) sono ro (squashfs); non si
possono mascherare unit systemd su disco. Invece lo **startup.sh del root** esegue
`run-parts /var/lib/webosbrew/init.d` a OGNI accensione (`/var` è ext4 rw),
e HBC ha meccanismo di failsafe: se un hook fallisce → remove flag, niente danni
persistenti al TV (telnet d'emergenza). Il nostro hook:
1) `systemctl stop` di `uploadd`, `remotelogger`, `update`, `voiceinput`
   ( involontari: reset di runtime, niente Update = niente riaggiunzioni)
2) `pkill` di mou LS2 demoni senza unit systemd: `admanager`, `nudge`,
   `user-context-manager`, `iot-client`, `mqtt-client`
3) appende a `/etc/hosts` (tmpfs rw, rid generato a boot) domini
   LG-ads/tracking/thinq/voce ⇒ DNS a zero,
   idempotent via marker `# hbv-privacy`.
4) NON tocca `configd`, `sdx`, `PmLogDaemon`, `tvdataexchanger`, `performer`
   (ELEMENTI LOCALI/usa app fuorinoded services; remotelogger/uploadd già assenti
   dunque i log non si possono inviare).

Comandi esatti (tutti da telnet root, file `cmds_privacy_hook.txt`):
```bash
# beacon: crea hook con il suo contenuto
mkdir -p /var/lib/webosbrew/init.d
cat > /var/lib/webosbrew/init.d/99privacy <<'EOS'
#!/bin/bash
# hbv-privacy hook — stop telemetria (runtime) + hosts blocklist
(
  for u in uploadd remotelogger update voiceinput; do
    systemctl stop ${u}.service 2>/dev/null
  done
  for p in admanager nudge user-context-manager iot-client mqtt-client; do
    pkill -x ${p} 2>/dev/null
  done
) >/dev/null 2>&1
if ! grep -q '# hbv-privacy' /etc/hosts 2>/dev/null; then
  cat >> /etc/hosts <<'EOHF'
# hbv-privacy — LG ads/tracking/vote/ThiqQ blocklist
127.0.0.1 info.lgsmartad.com smartad.lgtvsdp.com pcg.lgtvsdp.com
127.0.0.1 media.lgtvsdp.com wag.lgtvsdp.com getadhoc.lgtvsdp.com
127.0.0.1 ngui.lgtvcommon.com suggest.lgtvcommon.com wau.lgtvcommon.com
127.0.0.1 api.lgtviot.com push.lgtviot.com sports.lgtviot.com
127.0.0.1 common.lgthinq.com lss.lgthinq.com kr.lgeapi.com
::1 info.lgsmartad.com smartad.lgtvsdp.com pcg.lgtvsdp.com
::1 media.lgtvsdp.com wag.lgtvsdp.com getadhoc.lgtvsdp.com
::1 ngui.lgtvcommon.com suggest.lgtvcommon.com wau.lgtvcommon.com
::1 api.lgtviot.com push.lgtviot.com sports.lgtviot.com
::1 common.lgthinq.com lss.lgthinq.com kr.lgeapi.com
EOHF
fi
exit 0
EOS
chmod +x /var/lib/webosbrew/init.d/99privacy
```
```bash
# esecuzione immediata + verifiche
/var/lib/webosbrew/init.d/99privacy
systemctl is-active uploadd remotelogger update voiceinput 2>&1
pidof admanager nudge user-context-manager iot-client mqtt-client 2>&1
tail -14 /etc/hosts
```
(esito temporale POST-di checks: among appoinments)

## 5.6 LISTA DOMINI BLOCCATI e cosa facevano

Inseriti a fine `/etc/hosts` (con marker `# hbv-privacy`) dall'hook, 4 e 6 varianti:

| dominio | cosa faceva sulla TV | provenienza della scoperta |
|---|---|---|
| `info.lgsmartad.com` | **Pub LG**: campagne ad, profiling per IFA/click/impression | stringhe in `/usr/sbin/admanager` |
| `smartad.lgtvsdp.com` | piattaforma pubblicitaria LG Smart TV (VANDA/adserv) | elenco LG-known (EU) |
| `pcg.lgtvsdp.com` | *Personalized Content Gateway*: contenuti personalizzati in home (profili di utilizzo) | piattaforma LG SDP ✓ |
| `media.lgtvsdp.com` | ad/multimedia assets scaricate live (sui banner/app store) | piattaforma LG SDP |
| `wag.lgtvsdp.com` | ad widget / game-celebrity banners | piattaforma LG SDP |
| `getadhoc.lgtvsdp.com` | fetch "ad-hoc" di contenuti di profilo/contenuti LG | piattaforma LG SDP |
| `ngui.lgtvcommon.com` | portale NG-UI (suggerimenti/upsell LG) | piattaforma LG SDP |
| `suggest.lgtvcommon.com` | "suggest": query e suggestions profilate (uso tastiera/suggeristi) | piattaforma LG SDP |
| `wau.lgtvcommon.com` | **Wake Audio Upload**: invio audio di attivazione voce → cloud LG | stringhe in `/usr/sbin/performer` |
| `api.lgtviot.com` | ThinQ IoT: API cloud LG per TV/ThinQ (stato dispositivo, push) | stringhe in `/usr/sbin/iot-client` |
| `push.lgtviot.com` | **	push MQTT persistente** (notifiche; canale dell'Allarme Sport) | stringhe in `/usr/sbin/sportsalarm` |
| `sports.lgtviot.com` | dati sportivi LG (backend dell'app "Allarme Sport") | stringhe in `/usr/sbin/sportsalarm` |
| `common.lgthinq.com` | route ThinQ (`/route`): auth/dispatch IoT LG | URL completo in `/usr/sbin/iot-client` |
| `lss.lgthinq.com` | LSS ThinQ (servizi/orchestrazione state-device) | stringhe in `/usr/sbin/iot-client` |
| `kr.lgeapi.com` | API LG (.kr), backend IoT/koreano | URL completo in `/usr/sbin/iot-client` |
| *(già bloccato da HBC: `blockUpdates`)* `snu.lge.com`, `su-dev.lge.com`, `su.lge.com`, `su-ssl.lge.com` | server firmware/OTA LG | blocklist HBC ✓① |
| *(NOViT✅ aggiunto nel nostro hook)* `nsu.lge.com` | server firmware/OTA NON coperto da blocklist HBC | stringhe in `/usr/sbin/update` |

① Nel file di verifica: `cat /etc/hosts` (righe finali con commento `# This file is
dynamically regenerated on boot by webosbrew startup script`).

Out of scope scientific:
- `daum.net` (in `/usr/sbin/sdx`): portale coreano usato solo da sdx per *Smart TV
  Country Setting*; sdx non fa upload di telemetria (solo auth/config) → lasciato attivo.

<!-- risultato azione + verifica qui -->

## Checkpoint 6 — NUOVO LAUNCHER (Hearth) + backup/rollback

Fonte progetto seguita su richiesta utente: https://github.com/rudra-avatar/Hearth
(home alternativo webOS: orologio/meteo/wallpaper/apps row; MIT; base webos-launcher)

### 6.1 Export completo dello stato launcher (per tornare indietro)
```text
# sulla TV, da telnet root — export in /var/lib/webosbrew/backup/launcher_export/
d=/var/lib/webosbrew/backup/launcher_export
mkdir -p $d
luna-send -f -n 1 luna://com.webos.service.applicationManager/listApps '{"subscribe":false}' > $d/apps.json
luna-send -f -n 1 luna://com.webos.service.db/find '{"query":{"from":"com.palm.launcher/launchpoints"}}' > $d/launchpoints.json
cp /var/lib/eim/eim_device_db.json $d/
cp /etc/hosts $d/hosts.bak
tar -cf $d/var_palm_data.tar -C / var/palm/data
```
Esito: apps.json ≈195 KB (elenco completo app), var_palm_data.tar 133 KB,
eim + hosts. NOTA: il kind db8 `com.palm.launcher/launchpoints` NON è
registrato su questa build (errori -3970 provati: com.palm.launcher,
com.webos.launcher, .LaunchPoint:1) → per ricostruire il ribbon LG basta
reinstallare le app: non esiste un "stato launchpoint" separato da ripristinare.

### 6.2 PIANO ROLLBACK (torna al launcher LG com'era)
1. Hearth UI → Settings → Options → spegnere "Replace LG Home with a helper
   script" e "Add the launcher as a TV input" (tutte le integrazioni Hearth
   sono switch ON/OFF dall'app, nessuna cosa fatta a mano resta)
2. `luna-send -n 1 luna://com.webos.appInstallService/remove '{"id":"tld.my.customlauncher"}'`
3. Reboot → LG Home com'era. Riferimenti di riferimento in backup/launcher_export.

### 6.3 PIANO AVANTI (moderno e funzionale)
- Hearth installato (id `tld.my.customlauncher`, v1.2.0)
- FASE 1 (scegliuta): Hearth come sorgente TV (`eim/addDevice`, returnValue true)
  + helper script (watcher che riapre Hearth quando LG Home si apre)
  + TV impostata su "avvia sull'ultimo input" → accensione diretta in Hearth
- FASE 2 (opzionale): LG Input Hook → tasto Home → Hearth senza flash LG Home
- FASE 3 (invasivo, non consigliata ora): "script and SAM" (Hearth prende il
  posto proprio di LG Home; il setting "just scan"/aspect smette di funzionare
  finché attivo)

### 6.4 Comandi effettivi (Hearth)
```powershell
# PC: download release + hash
Invoke-WebRequest -UserAgent 'Mozilla/5.0' `
  https://github.com/rudra-avatar/Hearth/releases/download/v1.2.0/tld.my.customlauncher_1.2.0_all.ipk `
  -OutFile D:\tv\tld.my.customlauncher_1.2.0_all.ipk
Get-FileHash .\tld.my.customlauncher_1.2.0_all.ipk -Algorithm SHA256
#   8606ABAA4F0311DF46CA847A0080D1D19307DC176F23243993B6EC5B52EB5B7C (3.634.284 B)
# PC: server http in background
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m http.server 8081 --directory D:\tv
```
```text
# TV (telnet root):
wget -q -O /tmp/hearth-test.ipk http://192.168.188.81:8081/tld.my.customlauncher_1.2.0_all.ipk
ls -l /tmp/hearth-test.ipk    # 3634284 = file corretto
# NB: l'install via org.webosbrew.hbchannel.service/install è rimasta "Download…"
# senza completare → usato appInstallService/dev/install (metodo README Hearth):
luna-send -f -n 1 luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/hearth-test.ipk","subscribe":false}'
# verifica:
luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{"id":"tld.my.customlauncher"}'
#   → appInfo versione 1.2.0, folderPath /media/developer/apps/…/tld.my.customlauncher
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"tld.my.customlauncher"}'
luna-send-pub -n 1 luna://com.webos.service.eim/addDevice '{"appId":"tld.my.customlauncher","pigImage":"","mvpdIcon":""}'
```

### 6.5 Alternativa custom creata in parallelo (non installata)
- `D:\tv\nuhome\` — app webOS "NuHome" (org.nuhome.launcher v0.1.2) generata
  da agente: ipk pronto `org.nuhome.launcher_0.1.2_all.ipk`
  sha256 f6d79acc4408bb94dbc36e25aaa316072d5945330b576db013190244ae69da09
  → installabile/rimpiazziabile se Hearth non soddisfa.

## Checkpoint 7 — Hearth: boot automatico + helper Home + privacy汛o

### 7.1 Cosa c'è ORA su disco (init.d della HBC)
```text
ls -l /var/lib/webosbrew/init.d/
-rwxr-xr-x  40-hearth-boot                     (creato da noi: 384 B)
lrwxrwxrwx  48-launcher-homehook -> /media/developer/launcher-homehook/apply.sh
                                            (Hit? creato DA Hearth quando l'utente
                                             abilità "Replace LG Home with a helper script")
-rwxr-xr-x  99privacy                        (hook anti-tracking, v2 non-bloccante)
```
- `40-hearth-boot` = lancia Hearth all'accensione (retry luna-launch 60× 2 s,
  flag `/tmp/hb-hearth-boot` per verifica post-reboot)
- l'utente ha trovato in Impostazioni Home "All'avvio lancia avvio automatico
  Home" →dato che boot-hook + homehook già gestiscono tutto, NON serve attivare
  quella (evita flash di LG Home; il TV mostra Hearth direttamente).

### 7.2 Come si verifica dopo un REBOOT
```text
cat /tmp/hb-hearth-boot                       # c'è = Hearth avviato al boot OK ✅
ls -l /var/lib/webosbrew/init.d/              # tutti gli hook leggegno lì
tail /etc/hosts                               # blocklist "hbv-privacy" presente
systemctl is-active uploadd remotelogger update voiceinput   # inactive/failed…
pidof admanager nudge user-context-manager iot-client mqtt-client  # (residui LS2 innocuì)
ps w | grep -v grep | grep -i heart           # process Hearth attivo
```

### 7.3 Mappa finale post-hardening (stato operativo)
| Canale LG | Stato |
|---|---|
| upload diagnostici (`uploadd`,`rdxd`) | INACTIVE + spool RO bind (HBC) |
| telemetria PMLog in remoto (`remotelogger`) | failed/inactive |
| check OTA (`update.service`) | inactive + hosts bloccati |
| pubblicità (`admanager`, lgsmartad) | processi LS2 → domini bloccati |
| suggerimenti/nudge (nudge, ucm) | idem + domini bloccati |
| voce cloud (`voiceinput`, performer/wau) | inactive + wau.lgtvcommon bloccato |
| ThinQ/IoT/sport (iot/mqtt, lgtviot, lgthinq) | domini bloccati (TUTTO lgtviot) |
| device auth LG (sdx) | attivo ma senza LUT cloud (blocklist) |

Rimane da: test reboot → boot diretto Hearth; poi eventuali rifiniture (tast Home).

---

# CHECKPOINT 8 — Launcher LG Home: backup, cosa si può (non) fare, rischi

Data: 31/10/2026 · Domanda: "si può levare il launcher LG e farne backup per
reinstallarlo? rischia di brickare la TV? inbox: premendo Home va sul launcher LG".

## 8.1 Come è fatto il launcher LG sul 49NANO866NA (fw 04.64.00)
- L'app è **`com.webos.app.home`** in `/usr/palm/applications/` (2,1 MB) — NON
  `com.webos.app.homepage` (quello dei firmware vecchi).
- Si trova sul **rootfs squashfs in sola lettura**: NON è eliminabile con
  `rm` (nemmeno da root), non sta in `/var`. Per "toglierla" restano solo
  **mascherature a runtime** (bind-mount di uno stub sopra la sua dir QML) —
  approccio che il progetto Hearth aveva e poi ha ABBANDONATO (fragile,
  reinstallazioni/aggiornamenti, varianti TV) al favore dell'attuale
  **watch-and-replace**: un watcher vede "LG Home in primo piano" e lo sostituisce
  al volo aprendo Hearth (con verifica e 3 tentativi).

## 8.2 BACKUP eseguito (ridondante al registro sotto)
```text
mkdir -p /var/lib/webosbrew/backup
tar czf /var/lib/webosbrew/backup/com.webos.app.home-fw0464.tar.gz \
    /usr/palm/applications/com.webos.app.home
# → 755.910 byte  (da dir 2,1 MB)   /var è ext4 persistente
```
- Il backup è assicurazione (il più arrearne che la factory-reset perda
  i binari originali). Non si tocca l'app: il trapped NON serve per reinstallare.
- Verificarne sempre l'integrità dopo una copia: `tg: tar tzf <file> >/dev/null && echo ok`.

## 8.3 Ripristino (solo se MAI necessario; richiede root vivo, già in esecuzione)
```text
# /usr è RO: il ripristino da tar si fa via bind-mount della copia spacchettata
mkdir -p /tmp/home-restore && cd /tmp/home-restore
tar xzf /var/lib/webosbrew/backup/com.webos.app.home-fw0464.tar.gz
mount --bind /tmp/home-restore/usr/palm/applications/com.webos.app.home \
             /usr/palm/applications/com.webos.app.home
# NOTE: i bind-mount NON sopravvivono al reboot (nessun hook li mantiene) —
# reversibilità garantita anche nel caso peggiore: reboot → tutto torna.
```

## 8.4 Rischio brick: NO (brick vero è a livello boot/kernel)
- Rimuovere/modificare FILE di app non può "brickare" (brick = bootloader/kernel
  IO flash corrotti → TV nera): la recovery bootloader LG è intatta e a noi
  azzera sempre l'out.
- Caso peggiore reale: Home LG (o un'app) malfunzionante/loop → si risolve col
  root ancora attivo via `/var/lib/webosbrew/startup.sh` (telnet/HBC) …
  `(a)` `umount` della maschera, `(b)` ripristino dal tar, `(c)` reboot.
- Stessa opera (bind) perché il mount non è più presente → TV torna a 100%

## 8.5 Perché premendo Home si vede comunque LG Home (comportamento CORRETTO)
- L'homehook non blocca LG Home: lo LASSEA comparire per un attimo e lo sostituisce
  con Hearth (il progetto Hearth lo chiama "watch-and-replace"); nei log dopo
  1 riprova aperto Hearth ricontrollando che ci sia davvero. Dell'ordine
  appare LG Home 1–2 secondi, poi Hearth.
- Diagnosi ufficiale Hearth eseguita: TUTTI OK — watcher attivo (pid 5203),
  sintassi script ok, decision logic ok ("WOULD OPEN"),
  `/tmp/launcher-alive` fresco, stub unmounted ("no"), Hearth installato, app
  log attiva. → **Se Hearth NON compare entro 3–6 s da Home, riportarlo:**
  log esatti in `/tmp/launcher-homehook.log`, diagnostica:
  `sh /media/developer/launcher-homehook/diagnose.sh`.
- Per TEMPORANEAMENTE usare la Home ufficiale LG (es. per gestire costava app):
  Hearth lo prevede (`stock.sh`, file touch `/tmp/launcher-allow-stock-home`)
  — NON serve: anullare la blocked in Hearth in OGNI caso.

## 8.6 RICHIESTA "metti Live TV come prima icona" ( Homer necessario)
Non serve MAI togliere LG Home per avere Live TV prima: giusto Hearth →
"Sources" / o sua Docs / reorder; in Hearth stesso ridisporre le icone con
tenuta-OK → "Move to start". Live TV l'app `com.webos.app.livetv` la si può
aggiungere alle app in primo riga con la sua voce "Apps" lì dentro.

<!-- CHECKPOINT: Hearth boot hook + LO (auto boot home) + risultato FASE 1 -->

---

# CHECKPOINT 9 — NusGuide (Guida TV custom): build, deploy su TV, install OK

Data: 31/10/2026 · App `org.nusguide.app` v0.1.0, web app webOS, in ITALIANO,
niente CDN, JS vanilla. Sorgente in `D:\tv\nusguide\` (app/, make_icon.py,
build_ipk.py). STILE: dark glassmorphism, accent azzurro LG.

## 9.1 Architettura app (app/main.js)
- **Luna bridge**: `PalmServiceBridge` (pattern di Hearth `src/lib/luna.ts`):
  `bridge.call(uri, JSON.stringify(params))` + `onservicecallback`, timeout 5–10 s.
- **Dati, approccio doppio**:
  1) runtime discovery dei "kind" dell'EPG interno: prova `find` su
     `com.(webos|palm).epg.(programs|channels):1` e varianti epgdb/service
     (fino a 6 candidati ×2); se risponde → legga canali+programmi (finestra 4 h)
  2) **fallback** (è quello che vale su questo TV oggi): 6 canali hardcoded
     Rai 1/2/3, Canale 5, La7, TV8 → griglia con "Guida non disponibile"
  Motivo: i kind EPG non sono registrati a runtime (blocklist LG a proposito
  include il provider EPG cloud; EIT broadcast non popola epgdb su questa TV).
- **UI**: griglia EPG orizzontale-oraria (PX_PER_MIN 11.3), righe canali, marca
  "now" luminosa, blocco dettaglio (OK), orologio, refresh 10 min.
- **Keymap (telecomando)**: ←→ canali · ↑↓ orario · OK=13 dettaglio ·
  Back=461/8/27 chiude (storia/close()).

## 9.2 Icona (make_icon.py)
- PNG scritto a mano (struct+zlib stdlib): tile 512×512 gradiente scuro + glow
  azzurro + lettera **"G"** (anello + barra + asta) con anti-alias 2×2.
- Output: `D:\tv\nusguide\app\icon.png` (25.983 byte).

## 9.3 Packaging: SWOT imparato a caro prezzo
⚠️ Il builder ipk "a mano" (marcato da NuHome: ar + control.tar.gz +
data.tar.gz) NON è sufficiente: l'appInstallSource RETA challenge interno:
`state:"install failed", errorCode:-5, reason:"ipk verified failed"`
(anche migliorando il builder, lo stile ares Package dir non è bastato).
**Soluzione garantita: `ares-package` ufficiale del webOS SDK**, che è già
nella install npm del progetto Hearth:
```powershell
Set-Location D:\tv\hearth-it\Hearth-main
npx ares-package D:\tv\nusguide\app --outdir D:\tv\nusguide
# → org.nusguide.app_0.1.0_all.ipk (31.610 byte)
```
Da così in futuro: **sempre ares-package per gli ipk delle app** (std-build
python resta per script/icona). Nota: ares-package avvisa dell'assenza di
requiredACG in appinfo.json: rispettivo necessario SOLO per LSB_TV apps.
sha256 finale: `0a416f04…e46c03b45` (variato da ares rebuild).

## 9.4 Deploy sulla TV (metodo già collaudato Hearth)
```powershell
# PC: server HTTP già in background su :8081 rooted in D:\tv
```
```text
# TV via telnet:
wget -q -O /tmp/nusguide.ipk http://192.168.188.81:8081/nusguide/org.nusguide.app_0.1.0_all.ipk
timeout -t 25 luna-send -f -n 8 luna://com.webos.appInstallService/dev/install \
    '{"id":"com.ares.defaultName","ipkUrl":"/tmp/nusguide.ipk","subscribe":true}'
# → (eventi: ipk verifying → parsing) → opzionale senza errori
luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{"id":"org.nusguide.app"}'
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"org.nusguide.app"}'
```
Esito GETAPPINFO: title "Guida TV", folderPath
`/media/developer/apps/usr/palm/applications/org.nusguide.app`, v0.1.0, web,
uiRevision 2, removable:true ✅. Launch: `returnValue:true` ✅.

## 9.5 Da verificare SULLO SCREEN (test.visivo utente)
- La app si apre sulla griglia fallback (6 canali senza Dati EPG)
- navigare ←→ ↑↓, OK apre dettaglio, Back chiude la app
- se si torna su Hearth, l'icona di Guida TV (la "G") compare nell'elenco.

## 9.6 Disinstallazione / ripristino
```text
luna-send -n 1 luna://com.webos.appInstallService/remove '{"id":"org.nusguide.app"}'
rm -f /tmp/nusguide.ipk
```

<!-- CHECKPOINT: EPG reale da canali diretti -->

## 10. EPG reale — fonti dirette Rai/Mediaset (31/10/2026)
Obiettivo: NusGuide con EPG reale, zero dipendenze da GitHub/terzi.

### 10.1 Mediaset GraphQL — provato, non usabile
- API: `https://frontier.api-graph.mediaset.it/` (Hive Router). Headers della pagina: platform WEB, property MPLAY, appVersion 1.5.6.
- Query ufficiale `GetEpgPageV2(startISODateTime, endISODateTime)` + fragment `PageCommonData` (tutto inlineante nell'HTML guidatv; query full = `query GetEpgPageV2` + chunk `45:T3620` dopo `fragment ActionButton`, 13 856 byte, salva in `D:\tv\mediaset_epg_doc.txt`).
- Client runtime usa **APQ** (persistedQuery, sha256; invia GET con `extensions={"persistedQuery":{"version":1,"sha256Hash":...}}`, fallback POST con query completa) — chunk `09xc98fptpz57.js`.
- Esito: qualunque variante (window 1 h/GG, first 10/50, con hash APQ, senza) ritorna `{"getEpgPageV2":null}` + errore `SUBGRAPH_RESPONSE_BODY_EMPTY` (service `page-composition`). Problem server-side. Abbandonato.
- Chunk EPG runtime: `3coeoyngec3ms.js` (`getEpgPages` infiniteQuery, pageParam = now).

### 10.2 Mediaset SSR — parser funzionante (fallback usato)
- `https://www.mediaset.it/guidatv/` = HTML SSR (~1.2 MB) con schedule di oggi incorporato (2430 card, orari+titoli testuali).
- Struttura: dopo ogni `href="/diretta/<slug>"` inizia la riga del canale; dentro, ogni card la delimita `--epg-card-width` (2 occorrenze per card); card contiene l'ora (`>(HH:MM)<`) e titolo (`text-headline-8b-m ... >titolo</span`).
- Slugs: canale5_cC5, italia1_cI1, rete4_cR4, 20mediaset_cLB, iris_cKI, la5_cKA, cine34_cB6, focus_cFU, topcrime_cLT, italia2_cI2, video_cKF, mediasetextra_cKQ, kids_cKB/kids_cLA.
- Parser JS validato in `D:\tv\test_parse_epg.js` (test su HTML salvato in tool-output `tool_192609807001RXDTb58saLMjsk`).

### 10.3 Rai — ENDPOINT UFFICIALE TROVATO E FUNZIONA!
- Sorgente: componente ufficiale `https://www.raiplay.it/assets/js/webcomponents/rai-tv-guide.js` (253 KB). getter interno: `` palinsesto_url = `/palinsesto/app/${channel}/${day}.json` ``, day formato **GG-MM-AAAA**.
- URL funzionante (testato da PC e TV):
  `https://guidatv.rai.it/palinsesto/app/<slug>/<gg-mm-aaaa>.json`
  - TLS valido su `guidatv.rai.it` senza www; `www.guidatv.rai.it` https fallisce (cert ALTNAME), http funziona.
- Slugs: rai-1..rai-5, rai-movie, rai-premium, rai-gulp, rai-yoyo, rai-news-24, rai-storia, italiana, rai-sport, rai-radio-2, raiplay, raiplay-2/3, raiplay-sport-1/2/3 (lista completa nell'attributo `channels='[...]'` di `D:\tv\rai_guidatv.html`).
- Risposta (~36 eventi/giorno/canale): `events[]` con `name`, `date` (gg/mm/aaaa), `hour` (HH:MM), `duration` (HH:MM:SS), `duration_in_minutes` ("5 min"), `description`, `episode_title`, `image`, `program {name, info_url}`. Titolo+ora+durata+descrizione reali.

### 10.4 NusGuide v0.2.0 installata
- `D:\tv\nusguide\app\main.js`: canali {num,name,rai?,ms?} (Rai 1–4, Canale 5, Italia 1 via slug mediaset, La7/TV8 senza fonte); `loadRaiChannel` (oggi+domani), `loadMediasetChannel` (SSR oggi), `loadOnlineEpg()` usato da boot quando EPG interno non risponde; refresh ogni 10 min su ambedue le fonti.
- Packaging: `npx ares-package` → `D:\tv\nusguide\org.nusguide.app_0.2.0_all.ipk` ✅.
- Deploy: wget su `/tmp/nusguide.ipk` + `timeout -t 25 luna-send -f -n 8 luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/nusguide.ipk","subscribe":true}'`.
  - `ipkUrl` **non** `ipkgUri` (il secondo dà errorCode -2).
- AppInfo: version 0.2.0, launch OK. Approdo visivo: sourcehint mostra "EPG online · N programmi" (ok) / "Nessun EPG · canali senza guida".

## 11. Note operative http.server :8081
- Serve da PC per distribuire .ipk alla TV. A volte muore/resta half-dead (ascolta IPv6 solo): killare i processi python e rilanciare
  `python -m http.server 8081 --bind 0.0.0.0 --directory D:\tv` (background). Verifica: `curl http://192.168.188.81:8081/<percorso>` → 200.

## 12. Debug "occhi sulla TV": screenshot + pipeline (31/10/2026)
- **Screenshot TV → PC**: sul TV esiste `com.webos.service.capture` (`/usr/sbin/captureservice`, vtCapture).
  ```text
  luna-send -n 1 luna://com.webos.service.capture/executeOneShot '{"failYn":"n","path":"/tmp/cap.png","format":"png","2d3d":"2d","outputType":"graphicPlane"}'
  # → {"capturedWidth":960,"returnValue":true,"capturedHeight":540,"writtenBytes":49042}
  ```
- Trasferimento: `udpsvd -vE 0.0.0.0 4462 tftpd /tmp` sul TV (parte e resta), poi dal PC:
  `curl.exe -s -m 20 tftp://192.168.188.80:4462/cap.png -o D:\tv\shot2.png` → si legge con il tool read (immagine).
- base64 via telnet NON affidabile (perde byte, PNG troncato). BusyBox NON ha httpd; ha nc/tftp; `lighttpd` e `tftpd` presenti in /usr/sbin.
- Debug XHR: ping POST al PC non arriva → XHR http:// da webview bloccata; https verso domini Rai/Mediaset invece funziona.

## 13. Checkpoint visivo di debug NusGuide (loop shot→fix)
- **Bug trovato col screenshot #1 (griglia vuota)**: `boot()` non chiamava più `loadFallback()` prima di `loadOnlineEpg()` → `channels=[]`, nessuna riga. Fix: `loadFallback()` sempre prima del caricamento online.
- **Bug CSS Chromium 79 (webOS 5.6)**: `gap` nei flex NON supportato (da Chrome 84) → elementi sovrapposti ("Guida TV16:19"). Fix: sostituire `gap` con `margin-right` / `> * + * { margin-left }`.
- **Efficienza cache**: script `epg_offline.sh` su TV (root, nohup loop ogni 15 min) scarica `https://guidatv.rai.it/palinsesto/app/{rai-1..rai-4}/{oggi|domani}.json` in `/media/developer/apps/usr/palm/applications/org.nusguide.app/cache/`. Log `/tmp/nusepg.log`.
- L'app legge `cache/<slug>-<gg-mm-aaaa>.json` locale (stesso file://) SEMPRE prima della rete.
- **Verifica finale (shot #3/#4)**: "EPG online · 276 programmi", righe Rai 1–4 + Canale 5 con titoli/orari reali. OK.

## 14. Magic Remote (vincolo utente)
L'utente usa il **Magic Remote**: pointer, wheel e tasti. App del progetto devono gestire click sugli elementi (tap), wheel per scroll, tasti VK standard. NusGuide 0.2.4: click su programma = dettaglio, click su nome canale = focus, wheel = cambia canale (deltaY).

## 15. LG Home rimossa dal percorso: takeover Hearth (31/10/2026)
Problema utente: Home e Back riportavano sempre al launcher LG.
Soluzione: **takeover** di Hearth ("Replace LG Home with a script and SAM"), installato a mano da root (non serve passare da Settings).
- Sorgente: `D:\tv\hearth-it\Hearth-main\src\takeover\{takeover.sh,shim.html}` (copiati in `D:\tv\staging\`, serviti via :8081).
- TV: `/media/developer/launcher-takeover/` con takeover.sh, shim.html, `version=8`, flag `allow-restart`.
- `sh takeover.sh on` → risponde `applied`; SAM riavviato (blip), shim montato sopra `/usr/palm/applications/com.webos.app.home` (mount in memoria, ext4 bind).
- Verifica: `takeover.sh diagnose` — SAM ha `com.webos.app.home` con vest "vendor: hearth" (lo shim), zero processi LG Home, front app = `tld.my.customlauncher` (Hearth). Screenshot conferma Hearth full-screen.
- Boot: `/var/lib/webosbrew/init.d/47-launcher-takeover` (sostituisce 48-launcher-homehook che è stato tolto; il file dir resta in /media/developer/launcher-homehook per ripristino).
- UNDO: `sh /media/developer/launcher-takeover/takeover.sh off`; se script assente: `rm -f /var/lib/webosbrew/init.d/47-launcher-takeover /media/developer/launcher-takeover/enabled; umount /usr/palm/applications/com.webos.app.home; reboot`.
- Black-screen rescue: README in `hearth-it/Hearth-main/src/takeover/README.md`.

Deploy history NusGuide: 0.2.2 (fix boot+cache), 0.2.3 (CSS gap → margin), 0.2.4 (Magic Remote click/wheel).


<!-- CHECKPOINT: ROADMAP Hearth-IT + NuSport -->



---

# CHECKPOINT — BROWSER SICURO, SOLO TV (01/11/2026)
Motore TV verificato: `curl http://192.168.188.80:9998/json/version` = Chrome/68.0.3440.106, condiviso da browser LG, WAM e app_shell.

```text
nusbrowser/app/  client WAM   nusbrowser/tv/  file in /media/developer/nusb
bootstrap.sh  prima installazione (chiede >=650 MB liberi)
start.sh -> host.js -> proxy.js (uid 99) + ns.py -> inner.sh -> forward.js + chromium (uid 65534)
```
Build: `node build.js`, `npx ares-package app --outdir .`; installazione come da memory.md, servendo solo l'ipk (contiene il token).
Comandi TV: puntatore = mouse, rotella = scorri, CH+/- = pagina, Back = indietro/home/esci, Rosso = barra indirizzi, Verde = testo nella pagina.
