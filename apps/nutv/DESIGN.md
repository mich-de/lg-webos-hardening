# NuTV — DESIGN.md

Modo: **Operate** (zapping a 3 m dal divano, Magic Remote). Il video è il protagonista; l'interfaccia è un overlay sobrio che sparisce da sola.

## Piattaforma (vincoli duri)
- webOS 5.6, Chromium 68, piano grafico 1920×1080 fisso (niente responsive).
- ES5, niente CDN, niente `gap` flex, `inset`, `filter: blur`, `backdrop-filter`. Flex con prefisso `-webkit-`.
- CPU lenta: solo animazioni `opacity`/`transform`, render solo righe visibili.

## Colore (token)
| Token | Valore | Uso |
|---|---|---|
| surface | `rgba(10,14,22,.86–.92)` | banner, pannello, toast |
| text | `#eef2f8` | testo primario |
| text-2 | `#9fb0c8` / `#c7d2e2` | orari, "Dopo" |
| hint | `#7f8ea6` | suggerimenti tasti |
| accent | `#4da3ff` | focus, barra avanzamento, tab attiva |
| fav | `#ffc93c` | stella preferiti |
| logo-plate | `#eef1f5` | piastra chiara sotto i loghi originali |

## Tipografia
Font di sistema TV (`LG Smart UI`), numeri tabellari. Scala: nome canale 40, Ora/Dopo 30, righe lista 27/21, etichette 20–22, numero digitato 90.

## Componenti
- **Logo canale**: logo originale (tv-logo/tv-logos, PNG locali in `app/logos/<LCN>.png`) su piastra chiara + numero LCN in basso a destra; senza logo → tessera colorata con numero e nome.
- **Banner Ora/Dopo**: in basso, 190 px, si chiude dopo 6 s (12 s se un pulsante ha il focus). Pulsanti: Preferito, Ricordamelo, Ultimo, Canali.
- **Lista canali**: pannello a sinistra 760 px, 11 righe da 76 px, schede Tutti/Preferiti/Esci.
- **Icone**: Lucide (ISC) inline, stroke 2, `currentColor`. Mai emoji o glifi unicode come icone.
- **Focus**: sfondo accent sui pulsanti; riga con contorno interno 3 px accent.
- **Sintonia**: pillola in alto a destra con punto pulsante (CSS puro).
