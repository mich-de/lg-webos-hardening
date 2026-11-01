/* pipeline.js — Canali Italia: refresh dati (cache/refresh.sh via exec) + merge/enrich.
 * Flusso: cache locali → se vecchie avvia refresh.sh (root curl, niente CORS) →
 *        catalogo huhu (paginato) + canali curati + EPG XMLTV + loghi → dedupe. */
'use strict';

var Pipeline = (function () {
  var REFRESH_SH = '/media/developer/nuslive/refresh.sh';
  var CACHE_MAX_AGE_MS = 6 * 3600 * 1000;

  var state = {
    channels: [],
    prgById: {},
    epgIndex: null,
    lastSyncMs: 0,
    stats: { channels: 0, withEpg: 0, withLogo: 0 }
  };

  function log(text, kind) { if (Pipeline.onLog) Pipeline.onLog(text, kind || 'info'); }

  /* ---------------- cache helpers ---------------- */
  function cacheText(name, timeoutMs) { return httpLocal('cache/' + name, timeoutMs); }

  function readDone() {
    return cacheText('refresh.done', 5000).then(function (t) {
      var m = /(\d{10,})/.exec(t);
      return m ? +m[1] : 0;
    }).catch(function () { return 0; });
  }

  /* ---------------- refresh via script TV (background + polling done) ---------------- */
  function startRefresh() {
    // stacca subito il done vecchio così il poll non lo vede
    return TV.exec('rm -f /media/developer/apps/usr/palm/applications/org.nuslive.app/cache/refresh.done', 6000)
      .catch(function () { /* ignora */ })
      .then(function () {
        log('Aggiornamento dati: catalogo, EPG, loghi…', 'info');
        return TV.exec('setsid sh ' + REFRESH_SH + ' >/dev/null 2>&1 &', 6000);
      });
  }

  function waitForDone(timeoutSec) {
    var t0 = Date.now();
    var last = 0;
    return new Promise(function (resolve, reject) {
      (function tick() {
        readDone().then(function (ts) {
          if (ts > last) { last = ts; }
          if (ts && Date.now() - t0 > 3000) { resolve(ts); return; } // done fresco
          var el = Math.round((Date.now() - t0) / 1000);
          if (el > timeoutSec) { reject(new Error('aggiornamento troppo lento')); return; }
          if (el % 10 === 0 && el !== tick.lastEl) { tick.lastEl = el; log('…in attesa del server (' + el + 's)', 'info'); }
          setTimeout(tick, 1000);
        }).catch(function () {
          var el = Math.round((Date.now() - t0) / 1000);
          if (el > timeoutSec) { reject(new Error('aggiornamento troppo lento')); return; }
          setTimeout(tick, 1000);
        });
      })();
    });
  }

  /* ---------------- catalogo ---------------- */
  function loadCatalog() {
    return cacheText('catalog.pages', 8000).then(function (t) {
      var pages = parseInt(t, 10) || 0;
      var jobs = [];
      for (var p = 1; p <= pages; p++) {
        (function (n) {
          jobs.push(cacheText('catalog-' + n + '.json', 20000).then(function (txt) {
            return JSON.parse(txt);
          }).catch(function () { return null; }));
        })(p);
      }
      return Promise.all(jobs);
    }).then(function (pageObjs) {
      var out = [], usedKeys = {};
      for (var i = 0; i < pageObjs.length; i++) {
        var page = pageObjs[i];
        if (!page || !page.items) continue;
        for (var j = 0; j < page.items.length; j++) {
          var it = page.items[j];
          if (String(it.group || '').toLowerCase() !== 'italy') continue;
          var ids = it.ids || {};
          var id = ids.id ? String(ids.id).trim() : '';
          if (!id) continue;
          var name = String(it.name || '').trim() || ('Canale ' + id);
          var url = (it.url && String(it.url).trim()) || (PLAY_PREFIX + id);
          if (!isPlayHandle(url) && url.indexOf('https://') === 0) url = 'http://' + url.slice(8);
          var logo = it.logo ? String(it.logo).trim() : '';
          if (logo && logo.indexOf('huhu.to') >= 0) logo = '';
          if (logo && logo.indexOf('https://') === 0) logo = 'http://' + logo.slice(8);
          var key = uniqueKey('huhu/' + NameTools.matchKey(name), usedKeys);
          out.push({ key: key, name: name, rawName: name, url: url, logo: logo || null, group: 'Italia', tvgId: null, engine: 'huhu' });
        }
      }
      return out;
    });
  }

  function uniqueKey(base, used) {
    if (!used[base]) { used[base] = true; return base; }
    var n = 2;
    while (used[base + '-' + n]) n++;
    used[base + '-' + n] = true;
    return base + '-' + n;
  }

  /* ---------------- sync completa ---------------- */
  function sync(opts) {
    opts = opts || {};
    var t0 = Date.now();
    return readDone().then(function (ts) {
      var fresh = ts && (Date.now() - ts < CACHE_MAX_AGE_MS);
      if (opts.force) fresh = false;
      if (fresh) { log('Cache locale ancora valida', 'info'); return null; }
      return startRefresh().then(function () { return waitForDone(180); });
    }).catch(function (e) {
      // exec/refresh non disponibile: se c'è una cache (anche vecchia) si usa quella
      log('Refresh non riuscito: ' + e.message, 'warn');
      return null;
    })
    .then(function () { return loadAll(); })
    .then(function (res) {
      log('Pronto: ' + res.stats.channels + ' canali (' + res.stats.withEpg + ' con guida, ' + res.stats.withLogo + ' con logo) in ' + Math.round((Date.now() - t0) / 1000) + 's', 'ok');
      return res;
    });
  }

  function loadAll() {
    var epgXml = '', epgChannels = [], catalog = [];

    return cacheText('catalog-1.json', 15000)
      .catch(function () { throw new Error('nessun catalogo in cache'); })
      .then(function () { log('Lettura catalogo…', 'info'); return loadCatalog(); })
      .then(function (cat) {
        catalog = cat;
        log('Catalogo: ' + catalog.length + ' canali', 'ok');
        return cacheText('epg.xml', 60000).catch(function () { return ''; });
      })
      .then(function (xml) {
        epgXml = xml;
        if (!epgXml) { log('EPG non disponibile', 'warn'); return null; }
        log('Analisi guida TV (XMLTV)…', 'info');
        epgChannels = EPG.parseChannels(epgXml);
        log('EPG: ' + epgChannels.length + ' canali in guida', 'ok');
        return null;
      })
      .then(function () {
        // loghi (2 fonti locali; la 3ª — icon EPG — viene dal parsed XML)
        return cacheText('freetv.m3u8', 20000).then(function (t) {
          LogoResolver.loadFreeTv(t);
          log('Loghi Free-TV: indice caricato', 'info');
        }).catch(function () { log('Indice loghi Free-TV non disponibile', 'warn'); })
          .then(function () {
            return cacheText('tvlogos.json', 10000).then(function (t) {
              LogoResolver.loadTvLogos(t);
              log('Loghi tv-logos: indice caricato', 'info');
            }).catch(function () { /* opzionale */ });
          });
      })
      .then(function () {
        // merge curati + catalogo
        var merged = {}, order = [], i;
        for (i = 0; i < InjectedChannels.list.length; i++) {
          merged[InjectedChannels.list[i].key] = InjectedChannels.list[i];
          order.push(InjectedChannels.list[i].key);
        }
        for (i = 0; i < catalog.length; i++) {
          if (!merged[catalog[i].key]) { merged[catalog[i].key] = catalog[i]; order.push(catalog[i].key); }
        }
        log('Canali curati DAZN/Sky/Rai aggiunti (' + InjectedChannels.list.length + ')', 'info');

        // indice EPG
        var epgIdx = epgXml ? new EPG.EpgIndex(epgChannels) : null;

        // enrich
        var enriched = [], withEpg = 0, withLogo = 0, epgIdSet = {};
        for (i = 0; i < order.length; i++) {
          var pc = merged[order[i]];
          var clean = NameTools.clean(pc.name);
          var epgId = epgIdx ? epgIdx.matchId(pc.tvgId, clean) : null;
          if (epgId) { withEpg++; epgIdSet[epgId] = true; }
          var epgIcon = epgId ? epgIdx.iconById[epgId] : null;
          var logo = LogoResolver.resolve(clean, epgIcon) || pc.logo;
          if (logo) withLogo++;
          var display = clean;
          var lcn = NameTools.getLcn(display, pc.rawName);
          enriched.push({
            key: pc.key, name: display, rawName: pc.rawName || pc.name, url: pc.url,
            logo: logo, category: NameTools.classify(clean, pc.group), group: pc.group,
            tvgId: epgId, engine: pc.engine, fav: false, lcn: lcn
          });
        }

        // dedupe: curati sempre tenuti; dal catalogo tiene la copia più ricca
        var curatedKeys = {};
        for (i = 0; i < InjectedChannels.list.length; i++) curatedKeys[InjectedChannels.list[i].key] = true;
        var buckets = {}, deduped = [];
        for (i = 0; i < enriched.length; i++) {
          var c = enriched[i];
          if (curatedKeys[c.key]) { deduped.push(c); continue; }
          var bk = NameTools.matchKey(c.name) + '|' + c.category;
          if (!buckets[bk]) { buckets[bk] = c; deduped.push(c); continue; }
          var old = buckets[bk];
          var score = (c.tvgId ? 2 : 0) + (c.logo ? 1 : 0);
          var oldScore = (old.tvgId ? 2 : 0) + (old.logo ? 1 : 0);
          if (score > oldScore) {
            var idx = deduped.indexOf(old);
            if (idx >= 0) deduped[idx] = c;
            buckets[bk] = c;
          }
        }

        deduped.sort(function (a, b) {
          var lcnA = a.lcn || 999;
          var lcnB = b.lcn || 999;
          if (lcnA !== lcnB) return lcnA - lcnB;
          if (a.category !== b.category) return a.category < b.category ? -1 : 1;
          return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        });

        // programmi: solo canali matchati e finestra -6h..+24h
        var prgById = {};
        if (epgXml && withEpg > 0) {
          log('Lettura programmi (oggi)…', 'info');
          var now = Date.now();
          var prg = EPG.parseProgrammes(epgXml, epgIdSet, now - 6 * 3600000, now + 24 * 3600000);
          prgById = EPG.indexProgrammes(prg);
          log('Programmi caricati: ' + prg.length, 'ok');
        }

        state.channels = deduped;
        state.prgById = prgById;
        state.epgIndex = epgIdx;
        if (epgIdx) epgIdx.prgById = prgById;
        state.lastSyncMs = Date.now();
        state.stats = { channels: deduped.length, withEpg: withEpg, withLogo: withLogo };

        // libera la stringa XMLTV grossa prima di restituire
        epgXml = null;

        return { channels: deduped, prgById: prgById, stats: state.stats, lastSyncMs: state.lastSyncMs };
      });
  }

  /** now/next per un canale */
  function nowNext(ch, nowMs) {
    if (!ch.tvgId) return { now: null, next: null };
    return EPG.nowNext(state.prgById, ch.tvgId, nowMs);
  }

  function clearCache() {
    return TV.exec('rm -f /media/developer/apps/usr/palm/applications/org.nuslive.app/cache/refresh.done /media/developer/apps/usr/palm/applications/org.nuslive.app/cache/catalog-*.json /media/developer/apps/usr/palm/applications/org.nuslive.app/cache/epg.xml /media/developer/apps/usr/palm/applications/org.nuslive.app/cache/freetv.m3u8 /media/developer/apps/usr/palm/applications/org.nuslive.app/cache/tvlogos.json', 8000);
  }

  return { sync: sync, loadAll: loadAll, nowNext: nowNext, clearCache: clearCache, state: state, onLog: null };
})();
