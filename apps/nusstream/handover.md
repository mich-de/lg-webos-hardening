# NuStream (v0.4.2) & Canali Italia (v0.2.1) — Handover

## Novità NuStream v0.4.2

1. **Risoluzione Sidebar Durante Riproduzione**:
   - Isolamento a schermo intero del player (`#playerview { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1000; background: #000; }`).
   - Classe `body.in-player` applicata dinamicamente in `play()` e rimossa in `stopPlay()`.
   - Nascondimento forzato di `#sidebar`, `#topbar` e `#hint` durante la riproduzione (`display: none !important; visibility: hidden !important; pointer-events: none !important;`).
   - `#content-wrap` espanso a `left: 0; width: 100vw; height: 100vh;` eliminando l'offset di 88px.

2. **Modalità di Uscita da Audio e Sottotitoli ("Come esco?")**:
   - Aggiunto pulsante esplicito a video: **`✕ Chiudi (Back)`** (`#ptd-close`) nell'intestazione del drawer.
   - Aggiunto box di guida alla base del drawer: *"Premi **Back** o **Giallo** per uscire · Frecce ◀ ▶ ▼ ▲ · OK per scegliere"*.
   - Supporto di chiusura immediata con:
     - Tasto **Back** (461 / 8 / 27).
     - Tasto **Giallo** (405).
     - Freccia **Sinistra** (37) se ci si trova già sulla colonna Audio.
     - Click sul pulsante **`✕ Chiudi`**.
     - Click su qualsiasi area esterna al pannello (video o sfondo).

3. **Ingrandimento Globale dei Font (Leggibilità da Divano a 3-4m)**:
   - Sidebar: etichette da 22px a **26px**, logo da 32px a **36px**.
   - Topbar: tag da 15px a **18px**, info da 19px a **23px**, orologio da 26px a **30px**.
   - Hero: metadati da 21px a **26px**, badge da 16px a **20px**, trama da 22px a **26px**, bottoni a **26px**.
   - Rail & Card: titoli sezioni da 28px a **34px**, titoli card da 20px a **24px**, badge da 15-16px a **18-19px**.
   - Scheda Dettaglio: titolo da 62px a **68px**, trama da 25px a **28px**, cast da 21px a **24px**, stagioni e bottoni a **26-28px**, episodi a **24px**.
   - Player OSD: titolo da 42px a **48px**, badge metadati da 18px a **23px**, minutaggio da 24px a **30px**, bottoni azione a **25px**.
   - Drawer Audio e Sottotitoli: titolo da 30px a **36px**, categorie a **24px**, voci opzioni da 19px a **25px**, spunte $\checkmark$ a **26px**.
   - Barra Comandi inferiore: etichetta a **20px**, testo guida a **24px**.

## Novità Canali Italia v0.2.1
- Ingrandimento tipografico su EPG Timeline orizzontale: titoli blocchi da 16px a **20px**, orari da 13px a **17px**, nomi canale a **22px**, LCN a **19px**.
- Quick Channel Bar: titoli da 19px a **23px**, programmi in onda a **19px**.
- OSD In-Player: titolo canale a **38px**, programma in onda a **27px**, successivo a **23px**.
