/* ============================================================
 * NuHome - main.js
 * Launcher home per webOS TV 5.x (LG 49NANO866NA, 1920x1080).
 *
 * - Lingua UI: italiano
 * - Nessuna libreria esterna: solo web API + PalmServiceBridge legacy
 * - Navigazione telecomando: frecce (37-40), OK/Enter (13),
 *   Back (461 / 8 / 27)
 * - Context menu: OK tenuto ~2 secondi su un tile  ->  pin/unpin
 * - Prestazioni: un'unica listApps all'avvio;
 *   refresh manuale con OK sul logo NuHome.
 * ============================================================ */

(function () {
  'use strict';

  /* ===================== Costanti ===================== */

  var APP_ID = 'org.nuhome.launcher';
  var URI_LIST_APPS = 'luna://com.webos.service.applicationManager/listApps';
  var URI_LAUNCH    = 'luna://com.webos.service.applicationManager/launch';

  /* Tile hardware predefiniti usati se LUNA fallisce (id di fallback
   * compatibili sia con TV stock sia con Homebrew Channel).            */
  var FALLBACK_APPS = [
    { id: 'youtube.leanback.v4',      title: 'YouTube AdFree' },
    { id: 'it.rainet.raiplay',        title: 'RaiPlay' },
    { id: 'amazon',                   title: 'Prime Video' },
    { id: 'org.webosbrew.hbchannel',  title: 'Homebrew Channel' }
  ];

  /* App bloccate (smart bar) di default se l'utente non ha scelto nulla. */
  var DEFAULT_PINS = ['youtube.leanback.v4', 'it.rainet.raiplay', 'amazon', 'org.webosbrew.hbchannel'];
  var PREFS_KEY = 'nuhome_pins_v1';

  /* ===================== Stato globale ===================== */

  var apps = [];            // elenco tile (griglia)
  var pins = loadPrefs();   // id delle app in smart bar
  var barItems = [];        // elementi focusabili barra superiore
  var menuOpen = false;
  var menuIdx = 0;
  var menuActions = [];

  /* ===================== Utility DOM ===================== */

  function $(id) { return document.getElementById(id); }
  var elLogo = $('logo'), elBar = $('smartbar'), elGrid = $('grid');
  var elStatus = $('status'), elToast = $('toast'), elClockT = $('clk-time'), elClockD = $('clk-date');
  var elCtx = $('ctx'), elCtxTitle = $('ctx-title'), elCtxSub = $('ctx-sub'), elCtxActions = $('ctx-actions');

  /* ===================== Prefs (localStorage) ===================== */

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) { /* prefs corrotte: si riparte dai default */ }
    return DEFAULT_PINS.slice();
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(pins)); } catch (e) { /* non fatale */ }
  }

  /* ===================== LUNA (PalmServiceBridge legacy) ===================== */

  /**
   * Wrapper per la vecchia API PalmServiceBridge (presente nelle webapp webOS).
   * window.PalmServiceBridge: onservicecallback riceve una stringa JSON.
   * subscribe=false: un solo callback e poi si stacca (nessun polling).
   *
   * @param {string} service  URI luna:// completo
   * @param {object} params   parametri JSON
   * @returns {Promise<object>} risposta parsata, oppure reject con errore
   */
  function lunaRequest(service, params, subscribe) {
    return new Promise(function (resolve, reject) {
      var Bridge = window.PalmServiceBridge;
      if (!Bridge) {
        reject(new Error('PalmServiceBridge non disponibile (fuori da webOS?)'));
        return;
      }
      var bridge = new Bridge();
      bridge.onservicecallback = function (msg) {
        var data;
        try { data = JSON.parse(msg); }
        catch (e) { reject(new Error('Risposta LUNA non JSON: ' + msg)); return; }
        if (!subscribe) bridge.cancel(); // chiudo subito, niente sottoscrizione attiva
        resolve(data);
      };
      try {
        bridge.call(service, JSON.stringify(params || {}));
      } catch (e) {
        reject(e);
      }
    });
  }

  /** Lancia un'app per id (applicationManager/launch). */
  function launchApp(appId) {
    toast('Avvio ' + appId + '…');
    lunaRequest(URI_LAUNCH, { id: appId }, false).catch(function (e) {
      toast('Avvio fallito: ' + (e && e.message ? e.message : 'errore'));
    });
  }

  /* ===================== Caricamento app ===================== */

  /** Un solo listApps all'avvio / su refresh manuale (nessun polling). */
  function loadApps() {
    setStatus('Caricamento app…');
    lunaRequest(URI_LIST_APPS, { subscribe: false, includeDev: true }, false)
      .then(function (res) {
        var list = res && (res.apps || res.launchPoints || res.appsList) || [];
        apps = list
          .filter(function (a) { return a && a.id && a.id !== APP_ID; })
          .map(function (a) {
            return { id: a.id, title: a.title || a.id, icon: a.icon || '', bgColor: a.bgColor || '' };
          });
        elStatus.hidden = true;
        render();
        toast(apps.length + ' app trovate');
      })
      .catch(function (e) {
        /* Fallback tollerante: mostro comunque i tile hard-coded. */
        apps = FALLBACK_APPS.slice();
        elStatus.hidden = false;
        setStatus('LUNA non disponibile (' + (e.message || e) + ') — lista fallback');
        render();
        toast('Lista di fallback (4 app)');
      });
  }

  function setStatus(msg) { elStatus.textContent = msg; }

  /* ===================== Rendering ===================== */

  /* Colore deterministico dalla hash dell'id (fallback lettera). */
  function colorFor(id) {
    var h = 0, i;
    for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var hue = h % 360;
    return 'hsl(' + hue + ', 45%, 38%)';
  }

  /** Tile a lettera colorata (fallback se l'icona non si carica). */
  function fallbackIcon(app) {
    var letter = (app.title || '?').trim().charAt(0).toUpperCase();
    return '<div class="tile-icon" style="background:linear-gradient(135deg,' +
      colorFor(app.id) + ',#1c2333)">' + esc(letter) + '</div>';
  }

  /** Icona: prova il path luna/file:// se presente, altrimenti lettera. */
  function iconHtml(app) {
    if (!app.icon) return fallbackIcon(app);
    /* I path luna: e file:// vengono provati come URL; se il caricamento
     * fallisce (onerror) torniamo alla lettera colorata. */
    var src = app.icon.indexOf('://') === -1 && app.icon.charAt(0) !== '/'
      ? 'file:///usr/palm/applications/' + app.id + '/' + app.icon
      : (app.icon.charAt(0) === '/' ? 'file://' + app.icon : app.icon);
    return '<div class="tile-icon"><img src="' + esc(src) + '" alt=""></div>';
  }

  function render() {
    /* --- Smart bar (app bloccate) --- */
    elBar.innerHTML = '';
    barItems = [elLogo];
    pins.forEach(function (id) {
      var app = findByAppId(id) || { id: id, title: id.split('.').pop() };
      var b = document.createElement('button');
      b.className = 'bar-item';
      b.dataset.appid = app.id;
      b.innerHTML = '<span class="bar-icon" style="background:' + colorFor(app.id) + '">' +
        app.title.charAt(0).toUpperCase() + '</span>' + esc(app.title);
      b.dataset.hint = 'Bloccata: OK tenuto per rimuovere'; // informativo
      elBar.appendChild(b);
      barItems.push(b);
    });

    /* --- Griglia --- */
    elGrid.innerHTML = '';
    apps.forEach(function (app) {
      var t = document.createElement('div');
      t.className = 'tile';
      t.dataset.appid = app.id;
      t.dataset.title = app.title;
      t.dataset.icon = app.icon;
      /* icona (o fallback lettera) + titolo + appid piccolo sotto */
      t.innerHTML = iconHtml(app) +
        '<div><div class="tile-name">' + esc(app.title) + '</div>' +
        '<div class="tile-appid">' + esc(app.id) + '</div></div>';
      /* Se l'immagine non carica (servlet/file:// negato), fallback elegante:
       * sostituisco l'icona con la tile a lettera colorata. */
      var img = t.querySelector('.tile-icon img');
      if (img) {
        img.addEventListener('error', function () {
          t.querySelector('.tile-icon').outerHTML = fallbackIcon(app);
        });
      }
      elGrid.appendChild(t);
    });

    /* Focus iniziale: primo tile (o logo se lista vuota). */
    focusables = barItems.concat(Array.prototype.slice.call(elGrid.children));
    focusIdx = Math.min(focusIdx >= barItems.length ? barItems.length : 0, focusables.length - 1);
    if (focusIdx < 0) focusIdx = 0;
    applyFocus(true);
  }

  function findByAppId(id) {
    for (var i = 0; i < apps.length; i++) if (apps[i].id === id) return apps[i];
    return null;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ===================== Focus management ===================== */

  /* Focusabile: barra superiore (logo + smart bar) e tile griglia.
   * Navigazione bidirezionale geometrica: sceglie il candidato migliore
   * nella direzione richiesta in base ai rettangoli a schermo.         */
  var focusables = [];
  var focusIdx = 0; /* indice in focusables (inizialmente: griglia dopo la barra) */

  function applyFocus(skipAnim) {
    focusables.forEach(function (f, i) {
      f.classList.toggle('focused', i === focusIdx);
    });
    var el = focusables[focusIdx];
    if (el) {
      /* scroll minimale per tenerlo visibile */
      var r = el.getBoundingClientRect();
      if (r.top < 0) window.scrollBy(0, r.top);
      if (r.bottom > window.innerHeight) window.scrollBy(0, r.bottom - window.innerHeight);
    }
    if (!skipAnim) { /* l'animazione e' gia' gestita da CSS transition */ }
  }

  function rect(i) { return focusables[i].getBoundingClientRect(); }
  function centerX(r) { return r.left + r.width / 2; }
  function centerY(r) { return r.top + r.height / 2; }

  /** Sposta il focus nella direzione dir {-1,0,1} x {orizzontale?, verticale?}. */
  function moveFocus(axis /* 'x'|'y' */, dir /* -1|+1 */) {
    if (!focusables.length || focusIdx >= focusables.length) { focusIdx = 0; applyFocus(true); return; }
    var cur = rect(focusIdx);
    var cx = centerX(cur), cy = centerY(cur);
    var best = -1, bestScore = Infinity;

    for (var i = 0; i < focusables.length; i++) {
      if (i === focusIdx) continue;
      var r = rect(i), tx = centerX(r), ty = centerY(r);
      var d = (axis === 'x') ? tx - cx : ty - cy;
      if (dir > 0 ? d <= 0 : d >= 0) continue; /* solo candidati nella direzione */
      var cross = (axis === 'x') ? Math.abs(ty - cy) : Math.abs(tx - cx);
      var overlap = (axis === 'x')
        ? Math.max(0, Math.min(cur.bottom, r.bottom) - Math.max(cur.top, r.top))
        : Math.max(0, Math.min(cur.right, r.right) - Math.max(cur.left, r.left));
      /* punteggio: distanza primaria + penalita' per scostamento laterale */
      var score = Math.abs(d) + cross * 2 - overlap;
      if (score < bestScore) { bestScore = score; best = i; }
    }

    if (best >= 0) {
      focusIdx = best;
      applyFocus();
      return;
    }
    /* Nessun candidato: gestisco i wrap richiesti. */
    if (axis === 'y' && dir > 0) {
      /* ultima riga + giu' = wrap al primo tile della griglia */
      var gridStart = barItems.length;
      if (focusables.length > gridStart) { focusIdx = gridStart; applyFocus(); }
    } else if (axis === 'x') {
      /* wrap orizzontale: eXtremo destro -> primo tile, estremo sinistro -> ultimo */
      var grid = Array.prototype.slice.call(elGrid.children);
      var idxIn = grid.indexOf(focusables[focusIdx]);
      if (idxIn !== -1 && grid.length) {
        var target = dir > 0 ? idxIn - (idxIn % 1 === 0 ? 0 : 0) : 0;
        if (dir > 0) target = grid.indexOf(grid[0]); /* primo tile */
        else target = grid.indexOf(grid[grid.length - 1]); /* ultimo tile */
        if (target >= 0) { focusIdx = barItems.length + target; applyFocus(); }
      }
    }
    else { toast('Fine lista'); }
  }

  /* ===================== Context menu (OK tenuto 2s) ===================== */

  function openContextMenu(focusEl) {
    var isTile = focusEl.classList.contains('tile');
    var appId = isTile ? focusEl.dataset.appid : focusEl.dataset.appid; /* anche smart bar */
    var title = isTile ? focusEl.dataset.title : focusEl.textContent.trim();
    var app = findByAppId(appId);
    if (!app && !isTile) app = { id: appId, title: title };
    if (!app) { toast('Nessuna app selezionata'); return; }

    var pinned = pins.indexOf(appId) !== -1;
    menuActions = [
      { label: pinned ? '✕ Sblocca dallo Smart bar' : '★ Blocca nello Smart bar',
        act: function () { pinned ? unpin(appId) : pin(appId); closeContextMenu(); } },
      { label: '▶ Avvia ora',  act: function () { launchApp(appId); closeContextMenu(); } },
      { label: 'Annulla',      act: function () { closeContextMenu(); } }
    ];
    elCtxTitle.textContent = app.title;
    elCtxSub.textContent = appId;
    elCtxActions.innerHTML = '';
    menuActions.forEach(function (m) {
      var b = document.createElement('button');
      b.textContent = m.label;
      elCtxActions.appendChild(b);
    });
    menuIdx = 0;
    drawMenuFocus();
    menuOpen = true;
    elCtx.hidden = false;
  }

  function drawMenuFocus() {
    Array.prototype.forEach.call(elCtxActions.children, function (b, i) {
      b.classList.toggle('focused', i === menuIdx);
    });
  }

  function closeContextMenu() {
    menuOpen = false;
    elCtx.hidden = true;
  }

  function pin(id) {
    if (pins.indexOf(id) === -1) pins.push(id);
    savePrefs();
    toast('Bloccata nello Smart bar');
    render();
  }
  function unpin(id) {
    pins = pins.filter(function (p) { return p !== id; });
    savePrefs();
    toast('Sbloccata');
    render();
  }

  /* ===================== Orario (orologio grande) ===================== */

  function tickClock() {
    var d = new Date();
    elClockT.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    var mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
                'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    elClockD.textContent = giorni[d.getDay()] + ' ' + d.getDate() + ' ' + mesi[d.getMonth()] + ' ' + d.getFullYear();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ===================== Toast ===================== */

  var toastTimer = null;
  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.classList.remove('show'); }, 2200);
  }

  /* ===================== Telecomando (keydown) ===================== */

  var KEY_ENTER = [13];
  var KEY_BACK = [461, 8, 27];
  var holdTimer = null;    // long-press OK
  var holding = false;

  function onKeyDown(e) {
    var k = e.keyCode;

    if (menuOpen) {
      if (e.keyCode === 37 || e.keyCode === 39) e.preventDefault();
      switch (k) {
        case 38: menuIdx = (menuIdx - 1 + menuActions.length) % menuActions.length; drawMenuFocus(); e.preventDefault(); return;
        case 40: menuIdx = (menuIdx + 1) % menuActions.length; drawMenuFocus(); e.preventDefault(); return;
        case 13: menuActions[menuIdx].act(); e.preventDefault(); return;
      }
      if (KEY_BACK.indexOf(k) !== -1) { closeContextMenu(); e.preventDefault(); return; }
      return;
    }

    /* frecce */
    if (k === 37) { moveFocus('x', -1); e.preventDefault(); return; }
    if (k === 39) { moveFocus('x', +1); e.preventDefault(); return; }
    if (k === 38) { moveFocus('y', -1); e.preventDefault(); return; }
    if (k === 40) { moveFocus('y', +1); e.preventDefault(); return; }

    if (KEY_BACK.indexOf(k) !== -1) {
      e.preventDefault(); /* abbiamo già chiuso un eventuale context menu */
      returning(true);
      return;
    }

    if (KEY_ENTER.indexOf(k) !== -1) {
      /* long-press: dopo 2 s di OK continuato -> context menu */
      if (!e.repeat && !holding) {
        holding = true;
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(function () {
          /* OK tenuto 2s */
          var el = focusables[focusIdx];
          if (el && (el.classList.contains('tile') || el.parentNode === elBar)) {
            openContextMenu(el);
          }
          holdTimer = null;
        }, 2000);
      }
      e.preventDefault();
    }
    /* altri tasti (tasti LG "home" o colorati) -> ignorati */
  }

  function onKeyUp(e) {
    if (KEY_ENTER.indexOf(e.keyCode) !== -1 && holding) {
      holding = false;
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (!menuOpen && !e.repeat) {
        var el = focusables[focusIdx];
        if (!el) return;
        if (el.id === 'logo') {            /* OK sul logo = refresh elenco */
          toast('Aggiorno le app…');
          loadApps();
        } else if (el.classList.contains('tile')) {
          launchApp(el.dataset.appid);
        } else if (el.parentNode === elBar) {
          launchApp(el.dataset.appid);
        }
      }
    }
  }

  function returning(silent) { /* Back: chiuso context menu sopra; qui non segue pagine */ }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  /* ===================== Avvio ===================== */

  tickClock();
  setInterval(tickClock, 1000); /* solo orologio: nessun polling luna */
  loadApps();

})();
