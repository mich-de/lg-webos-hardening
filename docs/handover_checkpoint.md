# Handover Checkpoint — NuStream (v0.4.3) & Canali Italia (v0.2.3)

**Data Checkpoint**: 1 Novembre 2026, 17:53 CET  
**Dispositivo di Test Live**: LG TV 49NANO866NA (webOS 5.6.2, IP `192.168.188.80`, CDP `:9998`, telnet `:23`)  
**Applicazioni verificate su TV**:
- **NuStream**: `org.nusstream.app` (v0.4.3) — IPK `D:\tv\nusstream\org.nusstream.app_0.4.3_all.ipk`
- **Canali Italia**: `org.nuslive.app` (v0.2.3) — IPK `D:\tv\nuslive\org.nuslive.app_0.2.3_all.ipk`

---

## 1. Gestione Gerarchica Tasto BACK (Nessuna uscita improvvisa al Launcher)

In entrambe le applicazioni è stata implementata un'architettura rigorosa a **pila (back stack)** per il tasto **Indietro / Back (keyCode 461 / 8 / 27)** del telecomando Magic Remote:

### A. NuStream (v0.4.3)
1. **In-Player Overlay & Drawer**:
   - Se è aperto il drawer Audio e Sottotitoli (`#ptracksdrawer`) $\rightarrow$ chiude il drawer e torna al video.
   - Se è aperto il drawer Episodi serie TV (`#pepdrawer`) $\rightarrow$ chiude il drawer e torna al video.
   - Se è visibile il modal di countdown Auto-Next (`#pautonext`) $\rightarrow$ annulla il countdown e prosegue la riproduzione.
   - Se è visibile la sinossi / scheda info in riproduzione (`#pinfo`) $\rightarrow$ chiude la scheda info lasciando il video a tutto schermo.
2. **Uscita dal Player**:
   - Con video a tutto schermo e nessun overlay aperto, il tasto Back chiude la riproduzione (`stopPlay()`) e torna alla **Scheda Dettaglio (`ST.DETAIL`)** se avviato da lì, oppure alla **Home (`ST.HOME`)** se avviato da riga/hero.
   - In caso di fallback iframe (`vix_iframe`), è stato inserito un listener all'interno del `contentDocument` dell'iframe per intercettare il tasto 461 e impedire a webOS WAM di terminare l'applicazione al launcher.
3. **Scheda Dettaglio (`ST.DETAIL`)**:
   - Back richiama `chiudiDettaglio()` ripristinando la schermata esatta di provenienza (`search`, `browse`, `watchlist` o `home`) con il corretto mantenimento del focus.
4. **Schermata Ricerca (`ST.SEARCH`)**:
   - Se il focus è sulla griglia dei risultati $\rightarrow$ Back riporta il focus alla tastiera TV virtuale.
   - Se il focus è sulla tastiera $\rightarrow$ Back chiude la ricerca e torna alla Home.
5. **Viste Catalogo & Watchlist (`ST.BROWSE` / `ST.WATCHLIST`)**:
   - Back chiude la vista e ritorna alla Home.
6. **Schermata Principale Home (`ST.HOME`)**:
   - Se il focus è su una riga/shelf $\rightarrow$ Back risale all'Hero banner Netflix in alto.
   - Se il focus è sull'Hero $\rightarrow$ Back apre e posiziona il focus sulla Sidebar di navigazione a sinistra.
   - Se il focus è sulla Sidebar ma su una voce diversa da "Home" $\rightarrow$ Back seleziona la voce "Home".
   - **Root Level (Sidebar su Home)**: Back **NON** esce direttamente al launcher, ma mostra un elegante popup toast a comparsa:
     > *"Premi di nuovo Back per uscire da NuStream"*
     Solo se l'utente preme Back una seconda volta entro **2.5 secondi**, l'applicazione si chiude regolarmente (`window.close()`).

### B. Canali Italia (v0.2.3)
1. **In-Player Quick Channel Bar**:
   - Se aperta (`qbOpen === true`) $\rightarrow$ Back chiude la barra rapida e ripristina la visione del canale corrente.
2. **In-Player OSD (Informazioni canale)**:
   - Se l'OSD è visibile a schermo $\rightarrow$ Back nasconde l'OSD lasciando il flusso video a schermo intero pulito.
   - Se l'OSD è già nascosto $\rightarrow$ Back chiude il player e torna alla griglia o alla timeline canali.
3. **Player Stage & Iframe DaddyLive**:
   - All'interno del documento `dembed.st`, il listener intercetta i tasti 461, 8 e 27 rilanciandoli al gestore `onKey` dell'app madre, impedendo al browser webOS di abbandonare l'app.
4. **Schermata Impostazioni (`#settings`)**:
   - Se aperta $\rightarrow$ Back chiude il pannello impostazioni.
5. **Guida Canali Timeline Tivimate**:
   - Se attiva la vista orizzontale $\rightarrow$ Back ritorna alla vista classica a Griglia.
6. **Filtri di Ricerca, Categorie e Preferiti**:
   - Se è attiva una ricerca testuale $\rightarrow$ Back cancella la ricerca e mostra tutti i canali.
   - Se è selezionata una categoria specifica o il filtro preferiti $\rightarrow$ Back resetta la visualizzazione alla categoria principale *"TUTTI"*.
7. **Root Level (Griglia TUTTI)**:
   - Back mostra il toast di conferma TV:
     > *"Premi di nuovo Back per uscire da Canali Italia"*
     Uscita confermata solo con doppia pressione entro **2.5 secondi**.

---

## 2. Risoluzione Audio DaddyLive su Canali Italia (Sky Sport F1 & Altri)
- **Causa individuata**: I flussi DaddyLive integrano Clappr/Hls all'interno di `dembed.st` con parametro `"start_muted": true` e un pulsante in-page `#unmute` (arancione), non raggiungibile dal cursore del telecomando. Inoltre l'iframe originario mancava della permissions policy `allow="autoplay"`.
- **Risoluzione applicata**:
  1. Caricamento diretto dell'embed `https://dembed.st/premiumtv/daddy.php?id=<ID>` (bypass del redirect intermedio `dlive.sx`).
  2. Aggiunta policy `allow="autoplay *; fullscreen *; encrypted-media *"`.
  3. Loop automatico di unmuting attivo: appena montati gli elementi nel DOM, viene eseguito il click su `#unmute` e impostato `v.muted = false; v.volume = 1.0;`.
  4. Tasti rapidi abilitati da telecomando: **OK (13)** e tasto **Blu (406)** per sblocco/unmute forzato, tasto **Giallo (405)** per cambiare engine (`stream` / `cast`).
  5. Test dal vivo verificato su TV su **Sky Sport F1 (ID 577)** e **Sky Sport MotoGP (ID 575)** con audio perfetto e `videoMuted: false`, `videoVolume: 1.0`.

---

## 3. NuStream Video & Player Features
- **Eliminazione Glitch**: Web Worker demuxing multithread HLS.js + buffer bilanciato webOS (`30MB`).
- **Tracce Audio & Sottotitoli Reali**: Drawer nativo aperto con tasto **Giallo (405)** o pulsante OSD, con chiusura con Back, Giallo o tasto `✕ Chiudi`.
- **Dati Video Autentici**: Risoluzione reale (`4K UHD`, `1080p FHD`, `720p HD`), bitrate effettivo in Mbps e codec (`H.264`/`H.265`) calcolati dallo stream hardware.
- **Isolamento Player**: Risolto il bug della sidebar visibile durante la riproduzione tramite viewport `100vw x 100vh` e classe `body.in-player #sidebar { display: none !important; }`.
- **Font TV Mainstream**: Tipografia ridimensionata (24px - 68px) per visione confortevole da divano.

---

## 4. Riepilogo Pacchetti e Percorsi

| Componente | File IPK Installato su TV | Codice Sorgente |
|---|---|---|
| **NuStream v0.4.3** | `D:\tv\nusstream\org.nusstream.app_0.4.3_all.ipk` | `D:\tv\nusstream\app\` |
| **Canali Italia v0.2.3** | `D:\tv\nuslive\org.nuslive.app_0.2.3_all.ipk` | `D:\tv\nuslive\app\` |
| **Script di Test Back TV** | `D:\tv\nusstream\test_back_tv.js` | Test CDP sequenza Back NuStream |
| **Script di Test Back Live** | `D:\tv\nuslive\test_back_live.js` | Test CDP sequenza Back Canali Italia |
| **Script Audio DaddyLive** | `D:\tv\nuslive\verify_f1_audio.js` | Test verifica audio F1 & MotoGP |
