# NusStream — memoria progetto (fatti stabili)

## Cos'è
App webOS LG (TV, webOS 5.6.2) che fa da client per StreamingCommunity, UI stile Netflix.
- Source: `app/{appinfo.json,index.html,main.css,main.js,images/}` — vanilla JS ES5 (target Chromium 79), 867 righe main.js, 190 main.css.
- id app: `org.nusstream.app`, versione in `app/appinfo.json` (0.4.5).
- Zero framework/bundler: `main.js` è sorgente non minificata.

## Dominio StreamingCommunity (instabile)
- Il sito cambia dominio ogni poche settimane. Stato 18/11/2026: `https://streamingcommunityz.dad` (app_url + `cdn.streamingcommunityz.dad`).
- I vecchi `.nexus/.day/.rip/.shiksha/.taxi/build` **non risolvono più** (DNS bloccato/NXDOMAIN dalla LAN): non rimetterli come unico seed.
- Embed player: host `vixcloud.cc` (prima `.co`, ora morto). L'app non hardcoda l'host: regex generica su `/embed/\d+`.
- `siteGet` ha self-heal: se l'host salvato in localStorage (`nusstream.net`, `confirmed:true`) non risponde, azzera `confirmed`, riporta `cdn` a `CDN0` e ri-walka `SEEDS`.
- Aggiornamento automatico: `.github/workflows/nusstream-update.yml` (cron 05:00) + `apps/nusstream/tools/update_domains.mjs` (probe TLD, riscrive SEEDS/CDN0, bump patch, `ares-package`, commit ipk). Dry-run locale: `node tools/update_domains.mjs --dry-run`.

## Accesso TV
- IP: `192.168.188.80` (DHCP fissa finora). PC dev: `192.168.188.81`.
- **telnet porta 23 = root shell senza auth** → canale principale comandi. Helper: `D:\tv\tvrun.py` (telnetlib, py3.12), `D:\tv\nusstream\sh.py <cmd>` wrapper comodo.
- ssh porta 22 c'è ma la "chiave" `D:\tv\192.168.188.80.key` è in realtà una password hex, non una key (ssh rifiuta).
- **Developer Mode NON usata**: install tramite Luna `com.webos.appInstallService/dev/install` con `ipkUrl` locale.
- TV ha python 2.7 (`/usr/bin/python`). Iniezione tasti `/dev/uinput` (`D:\tv\nutv\tools\key.py`) **non ha funzionato** in questa sessione.
- **CDP**: WebAppMgr gira con `--remote-debugging-port=9998` → `http://192.168.188.80:9998/json/list`. Chromium 79: Playwright `connectOverCDP` fallisce (`Browser.setDownloadBehavior` assente) → usare CDP raw via WebSocket nativo Node (`cdp2.js`).

## Deploy pipeline (verificata end-to-end)
`D:\tv\nusstream\build.ps1`:
1. `ares-package app -o .` → `org.nusstream.app_<ver>_all.ipk`
2. server HTTP statico PC root `D:\tv` porta **8081** (auto-start se assente) — usato sia da `test/shot.js` sia dal deploy TV
3. `deploy.py <ipk>`: telnet → TV wget ipk da `http://192.168.188.81:8081/nusstream/<ipk>` → luna install → md5 verifica → launch

### Quirks importanti
- **`ares-package` minifica il JS di default** (terser `-c -m`): nel'ipk `main.js` è una riga (~24.5k vs 39k sorgente). Non è corruzione! md5 atteso sul TV per main.js = md5(terser -c -m di app/main.js). CSS/HTML non toccati.
- App installata in `/media/developer/apps/usr/palm/applications/org.nusstream.app/` (NON /usr/palm/applications).
- `luna-send -n 8` si ferma prima della risposta finale → **non** usare `returnValue` dell'stream come esito: verifica con md5 dei file installati (come fa `deploy.py`).
- Comandi lunghi via telnet: passarli DA PYTHON (file .py), mai interpolati da PowerShell (i `\"` si rompono).
- `com.webos.applicationManager/closeApps` **non esiste** su questa webOS ("Unknown method").

## Screenshot/verifica su TV
- `pull_cap.py` / `verify_tv.py`: capture Luna `com.webos.service.capture/executeOneShot` → `/tmp/cap.png` (960x540, graphicPlane) → base64 via telnet con marker `__B64BEGIN__/__B64END__` → md5 check → salva PNG. Filtro righe: solo `fullmatch [A-Za-z0-9+/]+={0,2}` (scarta echo terminale).
- `cdp2.js`: marker codice nuovo = `#srcinfo` = "Catalogo online · StreamingCommunity · italiano"; fa anche `Page.reload` + `Page.captureScreenshot` (più comodo, cattura DOM reale).

## Convenzioni
- Risposte IT, brevi. Piano prima, subagent per parti indipendenti.
- `requiredACG: []` presente in appinfo.json (silenzia warning ares).
- Screenshot in `test/shots/` (`tv-*.png` = su TV, numerici = mock locali).
