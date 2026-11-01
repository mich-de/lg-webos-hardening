/* app.js — Canali Italia: UI (splash sync, chips, griglia, Tivimate timeline, preferiti, settings).
 * Magic Remote: click + wheel; tasti VK: OK 13, Back 461/8/27, tasti numerici 0-9 per zapping diretto. */
'use strict';

(function () {
  var FAV_KEY = 'nuslive.favs';

  var ui = {
    cat: 'TUTTI', search: '', favOnly: false, viewMode: 'grid' // 'grid' | 'timeline'
  };
  var channels = [];
  var visible = [];
  var favs = loadFavs();
  var lastSyncLabel = '–';

  // Numeric zap state for main view
  var zapHomeDigits = '';
  var zapHomeTimer = null;

  // TV Exit Confirmation Toast state
  var exitBackCount = 0;
  var exitBackTimer = null;

  function showExitToast(appName) {
    exitBackCount++;
    if (exitBackCount >= 2) {
      clearTimeout(exitBackTimer);
      try { window.close(); } catch (err) {}
      return;
    }
    var toast = $('exit-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'exit-toast';
      toast.className = 'exit-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = 'Premi di nuovo Back per uscire da ' + appName;
    toast.classList.add('show');
    clearTimeout(exitBackTimer);
    exitBackTimer = setTimeout(function () {
      exitBackCount = 0;
      if (toast) toast.classList.remove('show');
    }, 2500);
  }

  function $(id) { return document.getElementById(id); }

  /* ---------------- boot ---------------- */
  function boot() {
    Player.init();
    Player.setOnClose(function () { focusFirstCard(); });
    buildChips();
    bindTopbar();
    bindSettings();
    bindKeys();

    Pipeline.onLog = addLog;
    addLog('Canali Italia — avvio', 'info');

    Pipeline.sync().then(function (res) {
      channels = res.channels;
      applyFavs();
      lastSyncLabel = new Date(res.lastSyncMs).toLocaleString('it-IT');
      $('brand-status').textContent = res.stats.channels + ' canali · ' + res.stats.withEpg + ' con guida';
      $('splash').classList.add('hidden');
      $('app').classList.remove('hidden');
      render();
      startTicker();
    }).catch(function (err) {
      addLog('Errore fatale: ' + err.message, 'err');
      $('sync-bar-fill').style.width = '100%';
    });
  }

  /* ---------------- splash log ---------------- */
  function addLog(text, kind) {
    var box = $('sync-log');
    var line = document.createElement('div');
    line.className = kind || 'info';
    line.textContent = '· ' + text;
    box.appendChild(line);
    while (box.childNodes.length > 9) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
    var w = Math.min(96, ($('sync-log').childNodes.length) * 9);
    $('sync-bar-fill').style.width = w + '%';
  }

  /* ---------------- chips categorie ---------------- */
  function buildChips() {
    var nav = $('chips');
    nav.innerHTML = '';
    var cats = [{ id: 'TUTTI', label: 'Tutti' }];
    for (var i = 0; i < NameTools.CATS.length; i++) cats.push(NameTools.CATS[i]);
    cats.push({ id: 'LOCALI', label: 'Locali' });
    cats.push({ id: 'ALTRO', label: 'Altro' });
    for (var j = 0; j < cats.length; j++) {
      (function (c) {
        var b = document.createElement('button');
        b.className = 'chip' + (c.id === ui.cat ? ' active' : '');
        b.textContent = c.label;
        b.addEventListener('click', function () {
          ui.cat = c.id;
          var chips = nav.querySelectorAll('.chip');
          for (var k = 0; k < chips.length; k++) chips[k].classList.remove('active');
          b.classList.add('active');
          render();
          focusFirstCard();
        });
        nav.appendChild(b);
      })(cats[j]);
    }
  }

  /* ---------------- topbar ---------------- */
  function bindTopbar() {
    var si = $('search'), tm = null;
    si.addEventListener('input', function () {
      if (tm) clearTimeout(tm);
      tm = setTimeout(function () { ui.search = si.value.trim().toLowerCase(); render(); }, 220);
    });
    si.addEventListener('keydown', function (e) {
      if (e.keyCode === 13) { si.blur(); focusFirstCard(); }
    });

    $('btn-view').addEventListener('click', toggleViewMode);

    $('btn-fav').addEventListener('click', function () {
      ui.favOnly = !ui.favOnly;
      $('btn-fav').classList.toggle('on', ui.favOnly);
      render();
      focusFirstCard();
    });
    $('btn-settings').addEventListener('click', openSettings);
  }

  function toggleViewMode() {
    ui.viewMode = (ui.viewMode === 'grid') ? 'timeline' : 'grid';
    $('btn-view').classList.toggle('on', ui.viewMode === 'timeline');
    if (ui.viewMode === 'timeline') {
      $('grid-wrap').classList.add('hidden');
      $('timeline-wrap').classList.remove('hidden');
      renderTimeline();
    } else {
      $('timeline-wrap').classList.add('hidden');
      $('grid-wrap').classList.remove('hidden');
      render();
      focusFirstCard();
    }
  }

  /* ---------------- filtro + render griglia ---------------- */
  function applyFavs() {
    var set = {};
    for (var i = 0; i < favs.length; i++) set[favs[i]] = true;
    for (var j = 0; j < channels.length; j++) channels[j].fav = !!set[channels[j].key];
    var c = $('fav-count');
    c.textContent = favs.length;
    c.classList.toggle('hidden', favs.length === 0);
  }

  function filter() {
    var out = [];
    for (var i = 0; i < channels.length; i++) {
      var ch = channels[i];
      if (ui.cat !== 'TUTTI' && ch.category !== ui.cat) continue;
      if (ui.favOnly && !ch.fav) continue;
      if (ui.search && ch.name.toLowerCase().indexOf(ui.search) < 0) continue;
      out.push(ch);
    }
    return out;
  }

  function render() {
    visible = filter();
    Player.setChannels(visible);
    if (ui.viewMode === 'timeline') {
      renderTimeline();
      return;
    }
    var grid = $('grid');
    grid.innerHTML = '';
    $('empty').classList.toggle('hidden', visible.length > 0);
    var now = Date.now();
    for (var i = 0; i < visible.length; i++) grid.appendChild(cardFor(visible[i], now));
  }

  function cardFor(ch, now) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('tabindex', '0');

    var logoHtml;
    if (ch.logo) {
      logoHtml = '<div class="card-logo"><img src="' + escapeHtml(ch.logo) + '" alt="" onerror="this.style.display=\'none\'"></div>';
    } else {
      logoHtml = '<div class="card-logo"><span class="logo-initials" style="color:' + tintOf(ch.name) + '">' + escapeHtml(initials(ch.name)) + '</span></div>';
    }

    var engine = ch.engine === 'dlive' ? 'Daddy' : (ch.engine === 'huhu' ? 'huhu' : '');
    var nn = Pipeline.nowNext(ch, now);
    var nowTxt = nn.now ? escapeHtml(nn.now.t) : '<span class="lbl">Guida non disponibile</span>';
    var nextTxt = nn.next ? 'Dopo: ' + escapeHtml(nn.next.t) : '';
    var pct = (EPG.progressAt(nn.now, now) * 100).toFixed(1);
    var lcnBadge = (ch.lcn && ch.lcn < 999) ? '<span class="lcn-badge">' + ch.lcn + '</span>' : '';

    card.innerHTML =
      logoHtml +
      '<div class="card-body">' +
        '<div class="card-name-line">' +
          lcnBadge +
          '<span class="card-name">' + escapeHtml(ch.name) + '</span>' +
          '<span class="hd-tag">HD</span>' +
          (engine ? '<span class="engine-tag">' + engine + '</span>' : '') +
          (ch.fav ? '<span class="fav-star">★</span>' : '') +
        '</div>' +
        '<div class="card-now">' + nowTxt + '</div>' +
        '<div class="card-progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="card-next">' + nextTxt + '</div>' +
      '</div>';

    card.addEventListener('click', function () { Player.open(ch); });
    card.addEventListener('keydown', function (e) {
      if (e.keyCode === 13) { e.preventDefault(); Player.open(ch); }
      else if (e.keyCode === 107) { toggleFav(ch); }
    });
    card._nnNow = card.querySelector('.card-now');
    card._nnProg = card.querySelector('.card-progress > div');
    card._nnNext = card.querySelector('.card-next');
    card._ch = ch;
    return card;
  }

  /* ---------------- HORIZONTAL EPG TIMELINE GRID (Tivimate / Sky Glass) ---------------- */
  function renderTimeline() {
    var nowMs = Date.now();
    var startMs = nowMs - (nowMs % 1800000) - 1800000; // 30 min prima arrotondato
    var hours = 5;
    var pxPerMinute = 4; // 240px per ora

    // Render hours
    var th = '';
    for (var h = 0; h < hours; h++) {
      var d = new Date(startMs + h * 3600000);
      var timeStr = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      th += '<div class="tl-hour" style="width:' + (60 * pxPerMinute) + 'px">' + timeStr + '</div>';
    }
    $('tl-times').innerHTML = th;

    // Position red now line
    var nowPos = ((nowMs - startMs) / 60000) * pxPerMinute + 300; // offset corner 300px
    $('tl-now-line').style.left = nowPos + 'px';

    // Render channels and program tracks
    var chHtml = '';
    var gridHtml = '';
    var prgById = Pipeline.state.prgById || {};

    for (var i = 0; i < visible.length; i++) {
      var ch = visible[i];
      var logoHtml = ch.logo
        ? '<div class="tl-ch-logo"><img src="' + escapeHtml(ch.logo) + '" alt=""></div>'
        : '<div class="tl-ch-logo"><span style="font-size:12px;font-weight:800;color:#FFF">' + escapeHtml(initials(ch.name)) + '</span></div>';

      chHtml += '<div class="tl-ch-row' + (i === 0 ? ' active' : '') + '" data-cix="' + i + '">'
        + (ch.lcn < 999 ? '<span class="tl-ch-lcn">' + ch.lcn + '</span>' : '<span class="tl-ch-lcn">–</span>')
        + logoHtml
        + '<span class="tl-ch-name">' + escapeHtml(ch.name) + '</span>'
        + '</div>';

      // Program tracks
      gridHtml += '<div class="tl-track" data-trix="' + i + '" style="width:' + (hours * 60 * pxPerMinute) + 'px">';
      var prgs = ch.tvgId ? (prgById[ch.tvgId] || []) : [];
      if (!prgs.length) {
        gridHtml += '<div class="tl-block" style="left:0;width:' + (hours * 60 * pxPerMinute - 8) + 'px">'
          + '<div class="tl-block-title">Programmazione in diretta: ' + escapeHtml(ch.name) + '</div>'
          + '<div class="tl-block-time">Guida dettagliata non disponibile</div>'
          + '</div>';
      } else {
        for (var p = 0; p < prgs.length; p++) {
          var prog = prgs[p];
          if (prog.e < startMs || prog.s > startMs + hours * 3600000) continue;
          var leftMin = Math.max(0, (prog.s - startMs) / 60000);
          var rightMin = Math.min(hours * 60, (prog.e - startMs) / 60000);
          var durMin = Math.max(15, rightMin - leftMin);
          var isLive = (nowMs >= prog.s && nowMs < prog.e);
          var sD = new Date(prog.s), eD = new Date(prog.e);
          var timeRange = ('0' + sD.getHours()).slice(-2) + ':' + ('0' + sD.getMinutes()).slice(-2)
            + ' - ' + ('0' + eD.getHours()).slice(-2) + ':' + ('0' + eD.getMinutes()).slice(-2);

          gridHtml += '<div class="tl-block' + (isLive ? ' now-live' : '') + '" style="left:' + (leftMin * pxPerMinute) + 'px;width:' + (durMin * pxPerMinute - 6) + 'px" data-cix="' + i + '" tabindex="0">'
            + '<div class="tl-block-title">' + escapeHtml(prog.t) + '</div>'
            + '<div class="tl-block-time">' + timeRange + '</div>'
            + '</div>';
        }
      }
      gridHtml += '</div>';
    }

    $('tl-channels').innerHTML = chHtml;
    $('tl-grid-content').innerHTML = gridHtml;

    // Attach click events to tune channel
    var blocks = $('tl-grid-content').querySelectorAll('.tl-block');
    for (var b = 0; b < blocks.length; b++) {
      blocks[b].addEventListener('click', function () {
        var cix = +this.getAttribute('data-cix');
        if (visible[cix]) Player.open(visible[cix]);
      });
    }
    var rows = $('tl-channels').querySelectorAll('.tl-ch-row');
    for (var r = 0; r < rows.length; r++) {
      rows[r].addEventListener('click', function () {
        var cix = +this.getAttribute('data-cix');
        if (visible[cix]) Player.open(visible[cix]);
      });
    }
  }

  /* ---------------- ticker now/next (30s) ---------------- */
  function startTicker() {
    setInterval(function () {
      if (Player.isOpen()) return;
      var now = Date.now();
      if (ui.viewMode === 'timeline') {
        var nowPos = ((now - (now - (now % 1800000) - 1800000)) / 60000) * 4 + 300;
        $('tl-now-line').style.left = nowPos + 'px';
        return;
      }
      var cards = $('grid').childNodes;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (!card._ch) continue;
        var nn = Pipeline.nowNext(card._ch, now);
        if (card._nnNow) card._nnNow.innerHTML = nn.now ? escapeHtml(nn.now.t) : '<span class="lbl">Guida non disponibile</span>';
        if (card._nnProg) card._nnProg.style.width = (EPG.progressAt(nn.now, now) * 100).toFixed(1) + '%';
        if (card._nnNext) card._nnNext.textContent = nn.next ? 'Dopo: ' + nn.next.t : '';
      }
    }, 30000);
  }

  /* ---------------- preferiti ---------------- */
  function loadFavs() {
    try { return JSON.parse(window.localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveFavs() {
    try { window.localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) { }
  }
  function toggleFav(ch) {
    var idx = favs.indexOf(ch.key);
    if (idx >= 0) favs.splice(idx, 1); else favs.push(ch.key);
    saveFavs();
    applyFavs();
    render();
  }

  /* ---------------- navigazione tasti & zapping ---------------- */
  function focusFirstCard() {
    var cards = $('grid').querySelectorAll('.card');
    if (cards.length) cards[0].focus();
  }

  function handleHomeDigit(digit) {
    zapHomeDigits += String(digit);
    var targetLcn = parseInt(zapHomeDigits, 10);
    var matchedCh = null;
    for (var i = 0; i < channels.length; i++) {
      if (channels[i].lcn === targetLcn) { matchedCh = channels[i]; break; }
    }

    var ov = $('zap-overlay'), dg = $('zap-digits'), nm = $('zap-chname');
    dg.textContent = 'CH ' + zapHomeDigits;
    nm.textContent = matchedCh ? matchedCh.name : 'Nessun canale';
    ov.classList.remove('hidden');

    clearTimeout(zapHomeTimer);
    zapHomeTimer = setTimeout(function () {
      ov.classList.add('hidden');
      if (matchedCh) Player.open(matchedCh);
      zapHomeDigits = '';
    }, 1200);
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var kc = e.keyCode;

      // Se il player è aperto, tutta la gestione tasti è in player.js
      if (Player.isOpen()) return;

      // Direct numeric zapping from home grid (0-9)
      if (document.activeElement !== $('search')) {
        if (kc >= 48 && kc <= 57) {
          e.preventDefault();
          handleHomeDigit(kc - 48);
          return;
        }
        if (kc >= 96 && kc <= 105) {
          e.preventDefault();
          handleHomeDigit(kc - 96);
          return;
        }
      }

      // Green color key (404) or Guide key (458): Toggle view mode
      if (kc === 404 || kc === 458) {
        e.preventDefault();
        toggleViewMode();
        return;
      }

      // Red color key (403): Toggle favorites
      if (kc === 403) {
        e.preventDefault();
        ui.favOnly = !ui.favOnly;
        $('btn-fav').classList.toggle('on', ui.favOnly);
        render();
        focusFirstCard();
        return;
      }

      // Back / Escape
      if (kc === 461 || kc === 8 || kc === 27) {
        if (!$('settings').classList.contains('hidden')) { e.preventDefault(); closeSettings(); return; }
        if (ui.viewMode === 'timeline') {
          e.preventDefault();
          toggleViewMode();
          return;
        }
        if (ui.search) {
          e.preventDefault();
          ui.search = '';
          $('search').value = '';
          render();
          focusFirstCard();
          return;
        }
        if (ui.cat !== 'TUTTI' || ui.favOnly) {
          e.preventDefault();
          ui.cat = 'TUTTI';
          ui.favOnly = false;
          $('btn-fav').classList.remove('on');
          buildChips();
          render();
          focusFirstCard();
          return;
        }
        e.preventDefault();
        showExitToast('Canali Italia');
        return;
      }

      var active = document.activeElement;
      if (!active || !active.classList || !active.classList.contains('card')) return;
      var cards = Array.prototype.slice.call($('grid').querySelectorAll('.card'));
      var idx = cards.indexOf(active);
      if (idx < 0) return;
      var grid = $('grid');
      var cols = Math.max(1, Math.round(grid.clientWidth / (cards[0].offsetWidth + grid.clientWidth * 0.029)));
      var next = -1;
      if (kc === 39) next = idx + 1;          // →
      else if (kc === 37) next = idx - 1;     // ←
      else if (kc === 40) next = idx + cols;  // ↓
      else if (kc === 38) next = idx - cols;  // ↑
      if (next >= 0 && next < cards.length) {
        e.preventDefault();
        cards[next].focus();
        cards[next].scrollIntoViewIfNeeded ? cards[next].scrollIntoViewIfNeeded() : cards[next].scrollIntoView(false);
      }
      else if ((kc === 38) && idx - cols < 0) {
        e.preventDefault();
        $('search').focus();
      }
    });

    $('grid-wrap').addEventListener('wheel', function (e) {
      $('grid-wrap').scrollTop += (e.deltaY > 0 ? 120 : -120);
    });
  }

  /* ---------------- settings ---------------- */
  function bindSettings() {
    $('btn-set-close').addEventListener('click', closeSettings);
    $('btn-refresh').addEventListener('click', function () {
      $('set-msg').textContent = 'Aggiornamento avviato…';
      Pipeline.sync({ force: true }).then(function (res) {
        channels = res.channels;
        applyFavs();
        lastSyncLabel = new Date(res.lastSyncMs).toLocaleString('it-IT');
        $('set-count').textContent = res.stats.channels;
        $('set-epg').textContent = res.stats.withEpg;
        $('set-logos').textContent = res.stats.withLogo;
        $('set-last').textContent = lastSyncLabel;
        $('set-msg').textContent = 'Aggiornato.';
        render();
      }).catch(function (err) { $('set-msg').textContent = 'Errore: ' + err.message; });
    });
    $('btn-clear').addEventListener('click', function () {
      Pipeline.clearCache().then(function () { $('set-msg').textContent = 'Cache svuotata. Premi "Aggiorna ora".'; })
        .catch(function (err) { $('set-msg').textContent = 'Errore: ' + err.message; });
    });
    $('settings').addEventListener('click', function (e) { if (e.target === $('settings')) closeSettings(); });
  }

  function openSettings() {
    $('set-count').textContent = Pipeline.state.stats.channels || channels.length;
    $('set-epg').textContent = Pipeline.state.stats.withEpg || 0;
    $('set-logos').textContent = Pipeline.state.stats.withLogo || 0;
    $('set-last').textContent = lastSyncLabel;
    $('set-msg').textContent = '';
    $('settings').classList.remove('hidden');
    $('btn-refresh').focus();
  }
  function closeSettings() { $('settings').classList.add('hidden'); }

  /* ---------------- util ---------------- */
  function initials(name) {
    var clean = String(name).replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, ' ').trim();
    var words = clean.split(/\s+/);
    var out = '';
    for (var i = 0; i < words.length && out.length < 3; i++) if (words[i]) out += words[i].charAt(0).toUpperCase();
    return out || '?';
  }
  var TINTS = ['#E11D48', '#2563EB', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DB2777'];
  function tintOf(name) {
    var sum = 0;
    for (var i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return TINTS[sum % TINTS.length];
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
