/* epg.js — Canali Italia: parser XMLTV a scanner + indici EPG + resolver loghi.
 * Nessun DOM parsing: indexOf-loop su testo (memoria contenuta su TV 1.6GB). */
'use strict';

var EPG = (function () {

  /* ---------------- helper ---------------- */
  var ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
  function decodeEntities(s) {
    return String(s).replace(/&(amp|lt|gt|quot|apos|#39);/g, function (m) { return ENTITIES[m] || m; });
  }

  /** "20261031203000 +0100" -> epoch ms */
  function xmltvMs(s) {
    if (!s || s.length < 15) return null;
    var y = +s.substr(0, 4), mo = +s.substr(4, 2) - 1, d = +s.substr(6, 2);
    var h = +s.substr(8, 2), mi = +s.substr(10, 2), se = +s.substr(12, 2);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
    var utc = Date.UTC(y, mo, d, h, mi, se);
    var sign = s.charAt(15) === '-' ? -1 : 1;
    var oh = +s.substr(16, 2), om = +s.substr(18, 2);
    if (!isNaN(oh)) utc -= sign * (oh * 60 + (isNaN(om) ? 0 : om)) * 60000;
    return utc;
  }

  function attr(block, name) {
    var m = new RegExp(name + '="([^"]*)"').exec(block);
    return m ? decodeEntities(m[1]) : '';
  }

  /* ---------------- canali EPG ---------------- */
  /** xml -> [{id, names[], icon}] */
  function parseChannels(xml) {
    var out = [], pos = 0, guard = 0;
    while (guard++ < 5000) {
      var a = xml.indexOf('<channel', pos);
      if (a < 0) break;
      var b = xml.indexOf('</channel>', a);
      if (b < 0) break;
      var block = xml.slice(a, b);
      var id = attr(block, 'id');
      if (id) {
        var names = [], np = 0;
        while (guard++ < 20000) {
          var nd = block.indexOf('<display-name', np);
          if (nd < 0) break;
          var openEnd = block.indexOf('>', nd);
          var nde = block.indexOf('</display-name>', nd);
          if (openEnd < 0 || nde < 0 || nde < openEnd) break;
          var nm = block.slice(openEnd + 1, nde).trim();
          if (nm) names.push(decodeEntities(nm));
          np = nde + 15;
        }
        var icon = '';
        var ic = block.indexOf('<icon');
        if (ic >= 0) icon = attr(block.slice(ic), 'src');
        out.push({ id: id, names: names, icon: icon });
      }
      pos = b + 10;
    }
    return out;
  }

  /* ---------------- indici + match (porting EpgIndex.kt) ---------------- */
  function EpgIndex(epgChannels) {
    this.channels = epgChannels;
    this.knownIds = {};
    this.iconById = {};
    this.byName = {};
    this.prgById = {};   // id -> [{s,e,t,d}] ordinati per start (popolato dopo)
    this.aliases = {};

    var self = this, i, j;
    for (i = 0; i < epgChannels.length; i++) {
      var c = epgChannels[i];
      this.knownIds[c.id] = true;
      if (c.icon) this.iconById[c.id] = c.icon;
      for (j = 0; j < c.names.length; j++) {
        var k = NameTools.matchKey(c.names[j]);
        if (k.length >= 3 && !this.byName[k]) this.byName[k] = c.id;
      }
      // chiave dall'ID intero ("Sky.Sport.Uno.it" -> "skysportuno")
      var idk = NameTools.matchKey(c.id.replace(/\.it$/, '').replace(/\.\./g, '.').replace(/\./g, ' '));
      if (idk.length >= 5 && !this.byName[idk]) this.byName[idk] = c.id;
    }

    // alias per nomi generici
    var AL = [
      ['skysport', ['Sky.Sport.Uno.it', 'Sky.Sport.24.it']],
      ['skysportseriea', ['Sky.Sport.Calcio.it', 'Sky.Sport.Uno.it']],
      ['skycinema', ['Sky.Cinema.Uno.it']],
      ['skycalcio1', ['Sky.Sport..251.it']], ['skycalcio2', ['Sky.Sport..252.it']],
      ['skycalcio3', ['Sky.Sport..253.it']], ['skycalcio4', ['Sky.Sport..254.it']],
      ['skysport251', ['Sky.Sport..251.it']], ['skysport252', ['Sky.Sport..252.it']],
      ['skysport253', ['Sky.Sport..253.it']], ['skysport254', ['Sky.Sport..254.it']],
      ['skysportarena', ['Sky.Sport.Arena.it']],
      ['skycalcio5', ['Sky.Sport..255.it']], ['skycalcio6', ['Sky.Sport..256.it']], ['skycalcio7', ['Sky.Sport..257.it']],
      ['dazn', ['DAZN.1.it.it']], ['dazn1', ['DAZN.1.it.it']], ['dazn2', ['DAZN.2.it.it']],
      ['raisport', ['RaiSport.it', 'RAI.Sport...227.it']],
      ['eurosport1', ['Eurosport.Italia.it']], ['eurosport2', ['Eurosport.2.Italia.it']]
    ];
    for (i = 0; i < AL.length; i++) {
      this.aliases[AL[i][0]] = AL[i][1];
    }
  }

  EpgIndex.prototype.hasPrograms = function (id) {
    var l = this.prgById[id];
    return !!(l && l.length);
  };

  /** Se prgById è già popolato verifica che ci siano programmi, altrimenti verifica l'esistenza del canale nell'indice XMLTV */
  EpgIndex.prototype.isValidId = function (id) {
    if (!id) return false;
    if (this.prgById && Object.keys(this.prgById).length > 0) {
      return this.hasPrograms(id);
    }
    return !!this.knownIds[id];
  };

  /** id EPG migliore per un canale; null se nessun match sicuro */
  EpgIndex.prototype.matchId = function (explicitTvgId, channelName) {
    var i;
    if (explicitTvgId) {
      if (this.isValidId(explicitTvgId)) return explicitTvgId;
      var byFirst = this.byName[NameTools.matchKey(explicitTvgId.split('.')[0])];
      if (byFirst && this.isValidId(byFirst)) return byFirst;
    }
    var k = NameTools.matchKey(channelName);
    if (k.length < 3) return null;

    // alias curato
    var alTargets = this.aliases[k];
    if (alTargets) {
      for (i = 0; i < alTargets.length; i++) {
        if (this.isValidId(alTargets[i])) return alTargets[i];
      }
    }
    // match esatto
    var exact = this.byName[k];
    if (exact && this.isValidId(exact)) return exact;

    // prefix match non ambiguo (solo lunghezze vicine)
    if (k.length >= 6) {
      var cands = [], seen = {};
      for (var ek in this.byName) {
        if (!Object.prototype.hasOwnProperty.call(this.byName, ek)) continue;
        if (ek.length < 6) continue;
        if (Math.abs(ek.length - k.length) > 3) continue;
        if (!(ek.indexOf(k) === 0 || k.indexOf(ek) === 0)) continue;
        var v = this.byName[ek];
        if (!this.isValidId(v) || seen[v]) continue;
        seen[v] = true; cands.push(v);
      }
      if (cands.length === 1) return cands[0];
    }
    return null;
  };

  /* ---------------- programmi (filtrati) ---------------- */
  /**
   * Scansiona i blocchi <programme> e tiene solo id in idSet e [fromMs,toMs).
   * Ritorna {c,s,e,t,d} — stringhe decodificate, ordinati per canale+start.
   */
  function parseProgrammes(xml, idSet, fromMs, toMs, onProgress) {
    var out = [], pos = 0, guard = 0;
    var len = xml.length;
    while (guard++ < 400000) {
      var a = xml.indexOf('<programme', pos);
      if (a < 0) break;
      var gt = xml.indexOf('>', a);
      if (gt < 0) break;
      var head = xml.slice(a, gt);
      var ch = attr(head, 'channel');
      if (!idSet[ch]) {
        pos = gt + 1; continue;
      }
      var s = xmltvMs(attr(head, 'start'));
      var e = xmltvMs(attr(head, 'stop'));
      var b = xml.indexOf('</programme>', gt);
      if (b < 0) break;
      if (s != null && e != null && e > fromMs && s < toMs) {
        var block = xml.slice(gt + 1, b);
        var t = '', d = '';
        var ti = block.indexOf('<title');
        if (ti >= 0) {
          var tiEnd = block.indexOf('</title>', ti);
          if (tiEnd > 0) t = decodeEntities(block.slice(block.indexOf('>', ti) + 1, tiEnd).trim());
        }
        var di = block.indexOf('<desc');
        if (di >= 0) {
          var diEnd = block.indexOf('</desc>', di);
          if (diEnd > 0) d = decodeEntities(block.slice(block.indexOf('>', di) + 1, diEnd).trim());
        }
        if (t) out.push({ c: ch, s: s, e: e, t: t, d: d });
      }
      pos = b + 12;
      if (onProgress && (guard % 30000) === 0) onProgress(pos, len);
    }
    return out;
  }

  /** raggruppa per canale e ordina per start */
  function indexProgrammes(list) {
    var byId = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      (byId[p.c] || (byId[p.c] = [])).push(p);
    }
    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      byId[id].sort(function (x, y) { return x.s - y.s; });
    }
    return byId;
  }

  /** now/next per id EPG */
  function nowNext(prgById, epgId, nowMs) {
    var list = prgById[epgId];
    if (!list || !list.length) return { now: null, next: null };
    // ricerca binaria: primo con e > now
    var lo = 0, hi = list.length - 1, idx = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (nowMs < list[mid].e) { idx = mid; hi = mid - 1; } else lo = mid + 1;
    }
    if (idx < 0) return { now: null, next: null };
    var cur = nowMs >= list[idx].s ? list[idx] : null;
    var nxt = cur ? (list[idx + 1] || null) : list[idx];
    return { now: cur, next: nxt };
  }

  function progressAt(p, nowMs) {
    if (!p) return 0;
    var span = Math.max(1, p.e - p.s);
    var v = (nowMs - p.s) / span;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  return {
    parseChannels: parseChannels,
    parseProgrammes: parseProgrammes,
    indexProgrammes: indexProgrammes,
    nowNext: nowNext,
    progressAt: progressAt,
    xmltvMs: xmltvMs,
    EpgIndex: EpgIndex
  };
})();

/* ---------------- loghi 3 fonti (porting LogoResolver.kt) ---------------- */
var LogoResolver = (function () {
  var map = {};

  function put(rawKey, url) {
    var k = NameTools.matchKey(rawKey);
    if (k.length >= 3 && !map[k]) map[k] = url;
    var noDigits = k.replace(/[0-9]+$/, '');
    if (noDigits.length >= 3 && !map[noDigits]) map[noDigits] = url;
  }

  function loadFreeTv(text) {
    var blocks = text.split('#EXTINF:');
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i];
      var lm = /tvg-logo="([^"]+)"/.exec(block);
      if (!lm) continue;
      var logo = lm[1];
      var tn = /tvg-name="([^"]+)"/.exec(block);
      var comma = block.indexOf(',');
      var display = comma >= 0 ? block.slice(comma + 1).split('\n')[0].trim() : '';
      if (tn && tn[1]) put(tn[1], logo);
      if (display) put(display, logo);
    }
  }

  function loadTvLogos(jsonText) {
    var arr;
    try { arr = JSON.parse(jsonText); } catch (e) { return; }
    if (!arr || !arr.length) return;
    for (var i = 0; i < arr.length; i++) {
      var o = arr[i];
      var fn = o.name || '', url = o.download_url || '';
      if (fn.slice(-4) !== '.png' || !url) continue;
      var base = fn.slice(0, -4);
      if (base.slice(-3) === '-it') base = base.slice(0, -3);
      base = base.replace(/-\d+$/, '') || fn.slice(0, -4);
      put(base.replace(/-/g, ' '), url);
    }
  }

  function resolve(name, epgIcon) {
    if (epgIcon && epgIcon.trim()) {
      var u = epgIcon.trim();
      return u.indexOf('https://') === 0 ? 'http://' + u.slice(8) : u; // preferHttp
    }
    var k0 = NameTools.matchKey(name);
    if (k0.length < 3) return null;
    // varianti della chiave
    var noDigits = k0.replace(/[0-9]+$/, '');
    var noTv = k0.slice(-2) === 'tv' ? k0.slice(0, -2) : k0;
    var noChannel = k0.slice(-7) === 'channel' ? k0.slice(0, -7) : k0;
    var variants = [k0, noDigits, noTv, noChannel];
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].length >= 3 && map[variants[i]]) return map[variants[i]];
    }
    // fuzzy: prefisso con lunghezza vicina
    var best = null, bestDiff = 4;
    for (var ek in map) {
      if (!Object.prototype.hasOwnProperty.call(map, ek)) continue;
      if (ek.length < 4) continue;
      var diff = Math.abs(ek.length - k0.length);
      if (diff > 3) continue;
      if (ek.indexOf(k0) === 0 || k0.indexOf(ek) === 0) {
        if (diff < bestDiff) { bestDiff = diff; best = map[ek]; }
      }
    }
    return best;
  }

  return { loadFreeTv: loadFreeTv, loadTvLogos: loadTvLogos, resolve: resolve, size: function () { return Object.keys(map).length; } };
})();
