# Canali Italia — Tivimate & Sky Glass IPTV Edition (v0.2.0)

Applicazione webOS per la TV lineare italiana (Digitale Terrestre, Sky, FAST e canali locali), trasformata in una piattaforma IPTV di classe mainstream.

## Caratteristiche v0.2.0
1. **LCN Ufficiale DTT & Ordinamento Nazionale**:
   - Ordinamento canali secondo la numerazione ufficiale LCN italiana (Rai 1=1, Rai 2=2, Rai 3=3, Rete 4=4, Canale 5=5, Italia 1=6, LA7=7, TV8=8, NOVE=9, 20 Mediaset=20, Rai 4=21... Sky Sport=200+, Sky Cinema=300+).
   - Badge LCN in rilievo su ogni scheda del canale e nell'OSD del player.
2. **Guida TV Orizzontale a Linea Temporale (EPG Timeline Grid)**:
   - Vista a griglia orizzontale in stile Tivimate / Sky Glass:
     - Canali fissi a sinistra con logo e numero LCN.
     - Blocchi programma orizzontali proporzionali alla durata esatta (4px al minuto, 240px all'ora).
     - Linea rossa in tempo reale (`#tl-now-line`).
     - Tasto Verde (VK 404) o Guida TV (VK 458) per cambiare vista.
3. **In-Player Quick Channel Bar (Overlay rapido senza interrompere il video)**:
   - Durante la riproduzione, premendo $\leftarrow$ o $\downarrow$ compare la barra di zapping rapido in sovraimpressione.
   - Mostra logo, LCN e programma in onda in tempo reale.
   - Permette di cambiare canale con OK senza interrompere lo streaming.
4. **Zapping Numerico Diretto (0-9)**:
   - Digitando i numeri sul telecomando (es. `5` o `20`), compare l'overlay flottante animato `CH [numero]` che commuta istantaneamente al canale corrispondente.

## File e Risorse
- Sorgenti: `D:\tv\nuslive\app\`
- IPK installato: `org.nuslive.app_0.2.0_all.ipk`
- Screenshot TV live: `D:\tv\nuslive\shots\`
