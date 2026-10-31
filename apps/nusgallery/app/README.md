# NusGallery — sfoglia il NAS Brume via HTTP (autoindex lighttpd) su webOS

- `appinfo.json` — metadati app webOS: id `org.nusgallery.app`, entry `index.html`, icone in `images/`.
- `index.html` — scheletro DOM: topbar, tab FOTO/VIDEO/AUDIO, breadcrumb, griglia, viewer fullscreen, messaggi di stato.
- `main.css` — dark theme moddabile Chromium 79 (niente gap flex/inset), glow di focus Magic Remote.
- `main.js` — IIFE vanilla ES5: config NAS (`192.168.188.56:8080`), cache directory in localStorage (TTL 10 min, max 60), parse listing lighttpd (`tr.d`, `td.s[data-value]`, `td.t`), filtro per estensione, griglia paginata (MAX 40), viewer `<img>` / `<video controls autoplay>` / `<audio controls>`, Magic Remote (click, rotella, VK 13/461/8/27/frecce), safe-mode con messaggio PC/PCCH.
- `images/icon.png`, `images/largeIcon.png` — icone launcher.
