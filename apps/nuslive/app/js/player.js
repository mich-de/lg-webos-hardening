/* player.js — Canali Italia: riproduzione a due motori con Tivimate / Sky Glass UX.
 * Caratteristiche:
 *   - huhu: resolve via exec (resolve.sh, root curl) -> HLS nativo multi-candidato
 *   - Daddy/dlive: iframe del wrapper ufficiale stream/stream-<id>.php (+ fallback cast/)
 *   - Quick Channel Bar (Overlay rapido senza interrompere il video)
 *   - Zapping numerico diretto (tasti 0-9) con overlay animato
 *   - Badge LCN ufficiale DTT
 */
'use strict';

var Player = (function () {
  var RESOLVE_SH = '/media/developer/nuslive/resolve.sh';
  var CAND_TIMEOUT_MS = 15000;

  var els = null;
  var current = null;
  var candidates = [];
  var candIdx = 0;
  var token = 0;
  var osdTimer = null;
  var tickTimer = null;
  var dliveSeg = 'stream';
  var onClose = null;

  // Quick Bar state
  var qbOpen = false;
  var qbIdx = 0;
  var channelList = [];

  // Numeric zapping state
  var zapDigits = '';
  var zapTimer = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    els = {
      root: $('player'), stage: $('player-stage'), status: $('player-status'),
      statusText: $('player-status-text'), osd: $('player-osd'),
      name: $('osd-name'), engine: $('osd-engine'), now: $('osd-now'),
      next: $('osd-next'), progress: $('osd-progress-fill'),
      logo: $('osd-logo'), initials: $('osd-initials'), lcn: $('osd-lcn'),
      btnClose: $('btn-close'), btnRetry: $('btn-retry'), btnAlt: $('btn-altplayer'),
      quickBar: $('quick-bar'), qbRail: $('qb-rail'),
      zapOverlay: $('zap-overlay'), zapDigitsEl: $('zap-digits'), zapChNameEl: $('zap-chname')
    };

    els.btnClose.addEventListener('click', close);
    els.btnRetry.addEventListener('click', function () { if (current) open(current, { forceFresh: true }); });
    els.btnAlt.addEventListener('click', function () {
      if (!current || current.engine !== 'dlive') return;
      dliveSeg = dliveSeg === 'stream' ? 'cast' : 'stream';
      playDlive();
    });

    els.root.addEventListener('mousemove', function () {
      if (!qbOpen) showOsd();
    });
    els.root.addEventListener('click', function (e) {
      if (e.target && e.target.closest && (e.target.closest('.osd-btn') || e.target.closest('.qb-card'))) return;
      if (qbOpen) { toggleQuickBar(false); return; }
      showOsd();
    });

    document.addEventListener('keydown', onKey, true);
  }

  function setChannels(list) {
    if (list && list.length) channelList = list;
  }

  function zap(delta) {
    if (!current || !channelList.length) return;
    var idx = -1;
    for (var i = 0; i < channelList.length; i++) {
      if (channelList[i].key === current.key) { idx = i; break; }
    }
    if (idx < 0) idx = 0;
    var nextIdx = (idx + delta + channelList.length) % channelList.length;
    open(channelList[nextIdx]);
  }

  /* ---------------- Zapping Numerico Diretto (0-9) ---------------- */
  function handleDigit(digit) {
    zapDigits += String(digit);
    if (!els.zapOverlay) els.zapOverlay = $('zap-overlay');
    if (!els.zapDigitsEl) els.zapDigitsEl = $('zap-digits');
    if (!els.zapChNameEl) els.zapChNameEl = $('zap-chname');

    var targetLcn = parseInt(zapDigits, 10);
    var matchedCh = null;
    for (var i = 0; i < channelList.length; i++) {
      if (channelList[i].lcn === targetLcn) { matchedCh = channelList[i]; break; }
    }

    els.zapDigitsEl.textContent = 'CH ' + zapDigits;
    els.zapChNameEl.textContent = matchedCh ? matchedCh.name : 'Nessun canale';
    els.zapOverlay.classList.remove('hidden');

    clearTimeout(zapTimer);
    zapTimer = setTimeout(function () {
      commitZap();
    }, 1200);
  }

  function commitZap() {
    clearTimeout(zapTimer);
    if (els.zapOverlay) els.zapOverlay.classList.add('hidden');
    if (!zapDigits) return;
    var targetLcn = parseInt(zapDigits, 10);
    zapDigits = '';

    for (var i = 0; i < channelList.length; i++) {
      if (channelList[i].lcn === targetLcn) {
        open(channelList[i]);
        return;
      }
    }
  }

  /* ---------------- Quick Channel Bar (Overlay) ---------------- */
  function toggleQuickBar(show) {
    qbOpen = (show !== undefined) ? show : !qbOpen;
    if (qbOpen) {
      if (els.osd) els.osd.classList.add('off');
      renderQuickBar();
      els.quickBar.classList.remove('hidden');
    } else {
      els.quickBar.classList.add('hidden');
      showOsd();
    }
  }

  function renderQuickBar() {
    if (!channelList.length) return;
    if (current) {
      for (var i = 0; i < channelList.length; i++) {
        if (channelList[i].key === current.key) { qbIdx = i; break; }
      }
    }
    var h = '', now = Date.now();
    for (var j = 0; j < channelList.length; j++) {
      var ch = channelList[j];
      var isCur = (current && current.key === ch.key);
      var isFoc = (j === qbIdx);
      var nn = Pipeline.nowNext(ch, now);
      var nowTxt = nn.now ? nn.now.t : 'Guida non disp.';
      var progPct = (EPG.progressAt(nn.now, now) * 100).toFixed(0);

      var logoHtml = '';
      if (ch.logo) {
        logoHtml = '<div class="qb-logo"><img src="' + escapeHtml(ch.logo) + '" alt="" onerror="this.style.display=\'none\'"></div>';
      } else {
        logoHtml = '<div class="qb-logo"><span class="qb-initials">' + escapeHtml(initialsOf(ch.name)) + '</span></div>';
      }

      h += '<div class="qb-card' + (isCur ? ' active' : '') + (isFoc ? ' focused' : '') + '" data-qbx="' + j + '">'
        + logoHtml
        + '<div class="qb-body">'
        +   '<div class="qb-name-line">'
        +     (ch.lcn < 999 ? '<span class="qb-lcn">' + ch.lcn + '</span>' : '')
        +     '<span class="qb-name">' + escapeHtml(ch.name) + '</span>'
        +   '</div>'
        +   '<div class="qb-now">' + escapeHtml(nowTxt) + '</div>'
        +   '<div class="qb-prog"><div style="width:' + progPct + '%"></div></div>'
        + '</div></div>';
    }
    els.qbRail.innerHTML = h;
    var focusedEl = els.qbRail.querySelector('.qb-card.focused');
    if (focusedEl && focusedEl.scrollIntoView) focusedEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function keyQuickBar(kc) {
    if (kc === 37) { // Left
      if (qbIdx > 0) {
        qbIdx--;
        updateQbFocus();
      }
      return;
    }
    if (kc === 39) { // Right
      if (qbIdx < channelList.length - 1) {
        qbIdx++;
        updateQbFocus();
      }
      return;
    }
    if (kc === 13) { // OK: seleziona canale
      toggleQuickBar(false);
      open(channelList[qbIdx]);
      return;
    }
    if (kc === 461 || kc === 8 || kc === 27 || kc === 38) { // Back o Freccia Su: chiudi bar
      toggleQuickBar(false);
      return;
    }
  }

  function updateQbFocus() {
    var cards = els.qbRail.querySelectorAll('.qb-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('focused', i === qbIdx);
    }
    if (cards[qbIdx] && cards[qbIdx].scrollIntoView) {
      cards[qbIdx].scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  /* ---------------- Gestione Tasti Telecomando ---------------- */
  function onKey(e) {
    if (els.root.classList.contains('hidden')) return;
    var kc = e.keyCode;

    // Direct numeric input (0-9: keyCodes 48-57, numpad 96-105)
    if (kc >= 48 && kc <= 57) {
      e.preventDefault(); e.stopPropagation();
      handleDigit(kc - 48);
      return;
    }
    if (kc >= 96 && kc <= 105) {
      e.preventDefault(); e.stopPropagation();
      handleDigit(kc - 96);
      return;
    }

    // In numeric zapping pending
    if (zapDigits.length > 0) {
      if (kc === 13) { e.preventDefault(); e.stopPropagation(); commitZap(); return; }
      if (kc === 461 || kc === 8 || kc === 27) {
        e.preventDefault(); e.stopPropagation();
        zapDigits = '';
        clearTimeout(zapTimer);
        if (els.zapOverlay) els.zapOverlay.classList.add('hidden');
        return;
      }
    }

    // In Quick Bar mode
    if (qbOpen) {
      e.preventDefault(); e.stopPropagation();
      keyQuickBar(kc);
      return;
    }

    // Normal player mode
    if (kc === 461 || kc === 8 || kc === 27) {
      e.preventDefault(); e.stopPropagation();
      if (els.osd && !els.osd.classList.contains('off')) {
        hideOsd();
        return;
      }
      close();
      return;
    }
    if (kc === 405) { // Tasto Giallo: se DaddyLive, alterna tra stream e cast
      if (current && current.engine === 'dlive') {
        e.preventDefault(); e.stopPropagation();
        dliveSeg = dliveSeg === 'stream' ? 'cast' : 'stream';
        playDlive();
        return;
      }
    }
    if (kc === 406) { // Tasto Blu: forza unmute audio se dlive
      if (current && current.engine === 'dlive') {
        e.preventDefault(); e.stopPropagation();
        triggerUnmuteDlive();
        showOsd();
        return;
      }
    }
    if (kc === 13) { // OK: toggle play / pause se non quick bar, oppure forza unmute se dlive
      var vid = els.stage.querySelector('video');
      if (vid) {
        if (vid.paused) { try { vid.play(); } catch (er) {} }
        else { try { vid.pause(); } catch (er) {} }
      } else if (current && current.engine === 'dlive') {
        triggerUnmuteDlive();
      }
      showOsd();
      return;
    }
    if (kc === 37 || kc === 40) { // Left o Down apre la Guida Rapida
      e.preventDefault(); e.stopPropagation();
      toggleQuickBar(true);
      return;
    }
    if (kc === 38) { // Up mostra info OSD
      e.preventDefault(); e.stopPropagation();
      showOsd();
      return;
    }
    if (kc === 33) { e.preventDefault(); zap(1); return; }   // CH+
    if (kc === 34) { e.preventDefault(); zap(-1); return; }  // CH-

    showOsd();
  }

  /* ---------------- apertura canale ---------------- */
  function open(ch, opts) {
    opts = opts || {};
    if (!els) init();
    current = ch;
    token++;
    toggleQuickBar(false);
    setOsdChannel(ch);
    els.root.classList.remove('hidden');
    els.btnRetry.classList.add('hidden');
    els.btnAlt.classList.add('hidden');
    showStatus(ch.engine === 'dlive' ? 'Avvio del player…' : 'Risolvo lo stream…');
    showOsd();

    if (ch.engine === 'dlive' || isDlive(ch.url)) {
      els.btnAlt.classList.remove('hidden');
      playDlive();
      return;
    }
    if (isPlayHandle(ch.url)) {
      resolveHuhu(opts.forceFresh).then(function (urls) {
        if (!urls.length) throw new Error('nessuno stream disponibile');
        candidates = urls;
        candIdx = 0;
        playCandidate();
      }).catch(function (err) {
        fail('Resolve non riuscito: ' + err.message);
      });
      return;
    }
    candidates = withHttpFallback([ch.url]);
    candIdx = 0;
    playCandidate();
  }

  /* ---------------- huhu resolve via root curl ---------------- */
  function resolveHuhu(forceFresh) {
    var cmd = 'sh ' + RESOLVE_SH + ' ' + TV.q(b64enc(current.url)) + (forceFresh ? ' fresh' : '');
    showStatus('Risolvo lo stream…');
    return TV.exec(cmd, 24000).then(function (out) {
      var arr = [];
      try { arr = JSON.parse(String(out).trim()); } catch (e) { arr = []; }
      var urls = [];
      for (var i = 0; i < arr.length; i++) {
        var u = arr[i] && arr[i].url ? String(arr[i].url) : '';
        if (u.indexOf('http') === 0) urls = urls.concat(withHttpFallback([u]));
      }
      var seen = {}, ded = [];
      for (var j = 0; j < urls.length; j++) { if (!seen[urls[j]]) { seen[urls[j]] = true; ded.push(urls[j]); } }
      return ded;
    });
  }

  function withHttpFallback(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push(list[i]);
      if (list[i].indexOf('https://') === 0) out.push('http://' + list[i].slice(8));
    }
    return out;
  }

  /* ---------------- video HLS nativo ---------------- */
  function playCandidate() {
    var myToken = ++token;
    if (candIdx >= candidates.length) { fail('Nessun candidato riproducibile'); return; }
    var url = candidates[candIdx];
    showStatus('Connessione allo stream (' + (candIdx + 1) + '/' + candidates.length + ')…');

    var video = document.createElement('video');
    video.autoplay = true;
    video.muted = false;
    video.playsInline = true;
    video.setAttribute('x-webkit-airplay', 'disabled');
    clearStage();
    els.stage.appendChild(video);

    var settled = false;
    var guard = setTimeout(function () {
      if (settled || myToken !== token) return;
      settled = true;
      candIdx++;
      playCandidate();
    }, CAND_TIMEOUT_MS);

    video.addEventListener('playing', function () {
      if (settled || myToken !== token) return;
      settled = true; clearTimeout(guard);
      hideStatus();
    });
    video.addEventListener('error', function () {
      if (settled || myToken !== token) return;
      settled = true; clearTimeout(guard);
      candIdx++;
      if (candIdx < candidates.length) playCandidate();
      else fail('Stream non riproducibile');
    });
    try {
      video.src = url;
      video.load();
      var p = video.play();
      if (p && p.catch) p.catch(function () { });
    } catch (e) {
      clearTimeout(guard);
      candIdx++;
      if (candIdx < candidates.length) playCandidate(); else fail('Errore player: ' + e.message);
    }
  }

  /* ---------------- dlive: iframe wrapper ufficiale & unmuting automatico ---------------- */
  var dliveUnmuteTimer = null;

  function stopDliveUnmute() {
    if (dliveUnmuteTimer) {
      clearInterval(dliveUnmuteTimer);
      dliveUnmuteTimer = null;
    }
  }

  function triggerUnmuteDlive() {
    try {
      var iframe = els.stage.querySelector('iframe');
      if (!iframe) return;
      var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (doc) {
        var btn = doc.querySelector('#unmute');
        if (btn) {
          btn.click();
          try {
            var evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: iframe.contentWindow });
            btn.dispatchEvent(evt);
          } catch (e1) {}
        }
        var v = doc.querySelector('video');
        if (v) {
          if (v.muted) v.muted = false;
          if (v.volume < 1) v.volume = 1.0;
          if (v.paused) try { v.play(); } catch (e2) {}
        }
        if (!doc._backBound) {
          doc._backBound = true;
          doc.addEventListener('keydown', function (evt) {
            var k = evt.keyCode;
            if (k === 461 || k === 8 || k === 27 || k === 13 || k === 405 || k === 406 || k === 37 || k === 38 || k === 39 || k === 40 || k === 33 || k === 34) {
              evt.preventDefault();
              evt.stopPropagation();
              onKey(evt);
            }
          }, true);
        }
      }
    } catch (e) {}
  }

  function playDlive() {
    var m = /id=(\d+)/.exec(current.url);
    var id = m ? m[1] : String(current.url).split('/').pop().replace(/\D/g, '');
    if (!id) { fail('Id canale dlive non trovato'); return; }

    var src;
    if (dliveSeg === 'cast') {
      src = 'https://dlive.sx/cast/stream-' + id + '.php';
    } else {
      // Caricamento diretto dembed: elimina il doppio wrapper iframe e permette
      // all'app webOS (privilegio file://) l'accesso diretto al DOM per sbloccare l'audio
      src = 'https://dembed.st/premiumtv/daddy.php?id=' + id;
    }

    var iframe = document.createElement('iframe');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    clearStage();
    els.stage.appendChild(iframe);
    iframe.src = src;

    var myToken = token;
    var attempts = 0;

    stopDliveUnmute();

    // Polling attivo per unmuting immediato appena il player e il video sono agganciati nel DOM
    dliveUnmuteTimer = setInterval(function () {
      if (myToken !== token) {
        stopDliveUnmute();
        return;
      }
      attempts++;
      if (attempts > 60) { // monitora fino a 18 secondi
        stopDliveUnmute();
      }
      triggerUnmuteDlive();
    }, 300);

    iframe.addEventListener('load', function () {
      if (myToken === token) {
        hideStatus();
        triggerUnmuteDlive();
      }
    });

    setTimeout(function () {
      if (myToken === token) {
        hideStatus();
        triggerUnmuteDlive();
      }
    }, 4000);
  }

  /* ---------------- OSD ---------------- */
  function setOsdChannel(ch) {
    els.name.textContent = NameTools.clean(ch.rawName || ch.name);
    els.engine.textContent = ch.engine === 'dlive' ? 'Daddy' : (ch.engine === 'huhu' ? 'huhu' : '');

    if (els.lcn) {
      if (ch.lcn && ch.lcn < 999) {
        els.lcn.textContent = 'CH ' + ch.lcn;
        els.lcn.classList.remove('hidden');
      } else {
        els.lcn.classList.add('hidden');
      }
    }

    var nn = Pipeline.nowNext(ch, Date.now());
    renderNowNext(nn);
    if (ch.logo) {
      els.logo.src = ch.logo;
      els.logo.classList.remove('hidden');
      els.initials.classList.add('hidden');
      els.logo.onerror = function () {
        els.logo.classList.add('hidden');
        els.initials.classList.remove('hidden');
      };
    } else {
      els.logo.classList.add('hidden');
      els.initials.classList.remove('hidden');
    }
    els.initials.textContent = initialsOf(els.name.textContent);
    startTick();
  }

  function renderNowNext(nn) {
    var nowTxt = 'In onda: —';
    if (nn.now) nowTxt = 'In onda: ' + nn.now.t + ' (' + hhmm(nn.now.s) + '–' + hhmm(nn.now.e) + ')';
    els.now.textContent = nowTxt;
    els.next.textContent = nn.next ? 'Dopo: ' + nn.next.t + ' (' + hhmm(nn.next.s) + ')' : '';
    els.progress.style.width = (EPG.progressAt(nn.now, Date.now()) * 100).toFixed(1) + '%';
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(function () {
      if (!current) return;
      renderNowNext(Pipeline.nowNext(current, Date.now()));
    }, 20000);
  }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  function showOsd() {
    if (qbOpen) return;
    els.osd.classList.remove('off');
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function () {
      if (!els.status.classList.contains('hidden')) return;
      els.osd.classList.add('off');
    }, 5000);
  }

  function hideOsd() {
    if (osdTimer) { clearTimeout(osdTimer); osdTimer = null; }
    if (els && els.osd) els.osd.classList.add('off');
  }

  function showStatus(txt) { els.statusText.textContent = txt; els.status.classList.remove('hidden'); showOsd(); }
  function hideStatus() { els.status.classList.add('hidden'); }

  function fail(msg) {
    showStatus(msg);
    els.btnRetry.classList.remove('hidden');
    if (current && current.engine === 'dlive') els.btnAlt.classList.remove('hidden');
  }

  function clearStage() {
    stopDliveUnmute();
    els.stage.innerHTML = '';
  }

  /* ---------------- chiusura ---------------- */
  function close() {
    token++;
    stopTick();
    toggleQuickBar(false);
    if (osdTimer) { clearTimeout(osdTimer); osdTimer = null; }
    clearStage();
    els.root.classList.add('hidden');
    current = null;
    if (onClose) onClose();
  }

  /* ---------------- util ---------------- */
  function hhmm(ms) {
    var d = new Date(ms);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function initialsOf(name) {
    var clean = String(name).replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, ' ').trim();
    var words = clean.split(/\s+/);
    var out = '';
    for (var i = 0; i < words.length && out.length < 3; i++) if (words[i]) out += words[i].charAt(0).toUpperCase();
    return out || '?';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init: init,
    open: open,
    close: close,
    zap: zap,
    setChannels: setChannels,
    handleDigit: handleDigit,
    isOpen: function () { return els && !els.root.classList.contains('hidden'); },
    setOnClose: function (fn) { onClose = fn; }
  };
})();
