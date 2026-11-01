/* core.js — Canali Italia: bridge webOS (luna/exec), HTTP locale, NameTools, canali curati.
 * ES5-safe (Chromium 79): niente ?. / ?? / replaceAll. Nessuna dipendenza esterna. */
'use strict';

/* ---------------- Luna bridge (pattern NusGuide/reminders-client) ---------------- */
var TV = (function () {
  var EXEC = 'luna://org.webosbrew.hbchannel.service/exec';

  function luna(uri, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var B = window.PalmServiceBridge;
      if (typeof B !== 'function') { reject(new Error('PalmServiceBridge assente')); return; }
      var br = new B(), done = false, tm;
      function fin(fn) {
        if (done) return;
        done = true; clearTimeout(tm);
        try { if (br.cancel) br.cancel(); } catch (e) { /* ignora */ }
        fn();
      }
      tm = setTimeout(function () { fin(function () { reject(new Error('timeout ' + uri)); }); }, timeoutMs || 8000);
      br.onservicecallback = function (msg) {
        var d;
        try { d = JSON.parse(msg); } catch (e) { fin(function () { reject(e); }); return; }
        fin(function () { if (d.returnValue === false) reject(new Error(d.errorText || 'errore ' + uri)); else resolve(d); });
      };
      try { br.call(uri, JSON.stringify(params || {})); } catch (e) { fin(function () { reject(e); }); }
    });
  }

  function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

  /** exec sincrono: risolve con {stdoutString} quando il comando finisce */
  function exec(command, timeoutMs) {
    return luna(EXEC, { command: command }, timeoutMs || 8000).then(function (r) {
      return String(r.stdoutString || '');
    });
  }

  return { luna: luna, exec: exec, q: q };
})();

/* ---------------- HTTP locale (file dell'app: cache/…) ---------------- */
/* file:// risponde status 0: accettato con responseText (bug noto, vedi NusGuide 0.3.x) */
function httpLocal(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs || 30000;
    xhr.onload = function () {
      if ((xhr.status >= 200 && xhr.status < 400) || (xhr.status === 0 && xhr.responseText)) resolve(xhr.responseText);
      else reject(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { reject(new Error('XHR err(' + xhr.status + ')')); };
    xhr.ontimeout = function () { reject(new Error('timeout ' + url)); };
    try { xhr.send(null); } catch (e) { reject(new Error('exc ' + String(e && e.message || e).slice(0, 60))); }
  });
}

function b64enc(s) { return window.btoa(unescape(encodeURIComponent(s))); }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------------- NameTools (porting esatto da Kotlin) ---------------- */
var NameTools = (function () {
  var TRAILING_TAG = /\s*[|\/]\s*[A-Za-z0-9]{1,4}\s*$/;
  var MULTISPACE = /\s{2,}/;
  var NON_ALNUM = /[^a-z0-9]+/g;
  var WEIRD_SPACE = /[\u00A0\u2000-\u200D\u202F\uFEFF]/g;

  function smartCase(s) {
    return s.split(' ').map(function (w) {
      if (!w) return w;
      if (w.length <= 3 && /^[A-Za-z0-9]+$/.test(w)) return w.toUpperCase();
      if (/[0-9]/.test(w)) return w.toUpperCase();
      if (w.toUpperCase() === w) return w.toLowerCase().replace(/^(.)/, function (m) { return m.toUpperCase(); });
      return w;
    }).join(' ');
  }

  /** "SKY ARTE |E" -> "Sky Arte" */
  function clean(raw) {
    var s = String(raw).replace(WEIRD_SPACE, ' ').trim();
    var prev;
    do {
      prev = s;
      s = s.replace(TRAILING_TAG, '').trim();
    } while (s !== prev && s.length);
    s = s.replace(MULTISPACE, ' ').replace(/^[\s|-]+|[\s|-]+$/g, '');
    if (!s.trim()) return String(raw).trim();
    return smartCase(s);
  }

  var PARENS = /\s*\((?:daddy|huhu|backup|new|old|alt|\d+)\)\s*/gi;

  /** chiave normalizzata per il match contro i nomi EPG */
  function matchKey(name) {
    var stripped = clean(name).replace(PARENS, ' ').trim();
    var k = stripped.toLowerCase().replace(NON_ALNUM, '');
    var suffixes = ['hd', 'sd', 'fhd', '4k', 'it', 'italia', 'italy'];
    for (var i = 0; i < suffixes.length; i++) {
      var sfx = suffixes[i];
      if (k.length > sfx.length + 2 && k.lastIndexOf(sfx) === k.length - sfx.length) k = k.slice(0, -sfx.length);
    }
    return k;
  }

  /* ---------------- classificazione categorie & LCN ---------------- */
  var LCN_MAP = {
    'rai1': 1, 'raiuno': 1, 'rai2': 2, 'raidue': 2, 'rai3': 3, 'raitre': 3,
    'rete4': 4, 'canale5': 5, 'italia1': 6, 'la7': 7, 'tv8': 8, 'nove': 9,
    '20mediaset': 20, 'canale20': 20, 'rai4': 21, 'iris': 22, 'rai5': 23,
    'raimovie': 24, 'raipremium': 25, 'cielo': 26, 'twentyseven': 27, 'tv2000': 28,
    'la7d': 29, 'la5': 30, 'realtime': 31, 'qvc': 32, 'foodnetwork': 33, 'cine34': 34,
    'focus': 35, 'rtl1025': 36, 'warnertv': 37, 'giallo': 38, 'topcrime': 39,
    'boing': 40, 'k2': 41, 'raigulp': 42, 'raiyoyo': 43, 'frisbee': 44, 'super': 47,
    'rainews24': 48, 'rainews': 48, 'italia2': 49, 'skytg24': 50, 'tgcom24': 51,
    'dmax': 52, 'raistoria': 54, 'mediasetextra': 55, 'motortrend': 56, 'raiscuola': 57,
    'raisport': 58, 'sportitalia': 60, 'supertennis': 64,
    'skyuno': 108, 'skyatlantic': 110, 'skyserie': 112,
    'skycinemauno': 301, 'skycinemaplus': 302, 'skycinemaaction': 305, 'skycinemacomedy': 309,
    'skysport24': 200, 'skysportuno': 201, 'skysportcalcio': 202, 'skysporttennis': 203,
    'skysportf1': 207, 'skysportmotogp': 208,
    'dazn1': 214, 'dazn2': 215, 'eurosport1': 210, 'eurosport2': 211
  };

  function getLcn(name, rawKey) {
    var k = matchKey(name);
    if (LCN_MAP[k]) return LCN_MAP[k];
    var rk = matchKey(rawKey || '');
    if (LCN_MAP[rk]) return LCN_MAP[rk];
    // check prefix (e.g. "rai1hd" -> "rai1")
    for (var lk in LCN_MAP) {
      if (k.indexOf(lk) === 0 || rk.indexOf(lk) === 0) return LCN_MAP[lk];
    }
    return 999;
  }

  var CATS = [
    { id: 'NAZIONALI', label: 'Nazionali DTT', words: ['rai 1', 'rai 2', 'rai 3', 'rete 4', 'canale 5', 'italia 1', 'la7', 'tv8', 'nove', '20 mediaset', 'iris', 'cielo', 'twentyseven', 'tv2000', 'la7d', 'la5', 'real time', 'cine34', 'focus', 'giallo', 'top crime', 'boing', 'dmax', 'italia 2', 'mediaset extra'] },
    { id: 'GENERALISTI', label: 'Generalisti', words: ['rai 1', 'rai 2', 'rai 3', 'rai1', 'rai2', 'rai3', 'rai premium', 'canale 5', 'canale5', 'italia 1', 'italia1', 'rete 4', 'rete4', 'la7', 'la 7', '20 mediaset', 'cielo', 'tv2000', 'tv 2000', 'rsi la', 'rtsi'] },
    { id: 'SPORT', label: 'Sport', words: ['sport', 'dazn', 'eurosport', 'calcio', 'tennis', 'motogp', ' f1', 'golf', 'basket', 'supertennis', 'sportitalia', 'solocalcio', 'milan tv', 'inter tv', 'juventus', 'lazio style', 'roma tv', 'napoli', 'premium sport'] },
    { id: 'CINEMA', label: 'Cinema', words: ['cinema', 'movie', 'film', 'primafila', 'iris', 'cine34', 'cine 34', 'twentyseven', 'warner tv', 'paramount', 'premium cinema', 'rai movie', 'rai 4', 'la7 cinema', 'la 7 cinema'] },
    { id: 'SERIE', label: 'Serie & Intrattenimento', words: ['serie', 'sky atlantic', 'sky uno', 'sky serie', 'fox', 'comedy central', 'top crime', 'giallo', 'real time', 'la5', 'la 5', 'tv8', 'tv 8', 'nove', 'twenty seven', 'spike', 'mediaset extra', 'italia 2', 'rakuten', 'pluto tv', 'samsung tv', 'atlantic'] },
    { id: 'NEWS', label: 'News', words: ['news', ' tg', 'tgcom', 'sky tg', 'rai news', 'rainews', 'canale 24', 'class cnbc', 'meteo', 'parlament', 'camera dei deputati', 'senato', 'notizie'] },
    { id: 'BAMBINI', label: 'Bambini', words: ['kids', 'junior', 'cartoon', 'boing', 'cartoonito', 'rai gulp', 'rai yoyo', 'yoyo', 'gulp', 'nick', 'frisbee', ' k2', 'super!', 'baby tv', 'pokemon', 'dea kids', 'bim bum'] },
    { id: 'DOCUMENTARI', label: 'Documentari', words: ['discovery', 'nat geo', 'national geographic', 'history', 'documentar', 'dmax', 'focus', 'geo tv', 'rai storia', 'rai scuola', 'blaze', 'crime + inv', 'investigation', 'sky nature', 'sky documentaries', 'sky arte', ' arte', 'classica'] },
    { id: 'MUSICA', label: 'Musica', words: ['music', 'musica', 'mtv', 'radio', 'vh1', 'deejay', 'rtl 102', 'kiss kiss', 'm2o', 'virgin radio', ' rds', '70-80', '80-90', 'hit tv', 'video italia'] }
  ];
  var LOCALI = { id: 'LOCALI', label: 'Locali' };
  var ALTRO = { id: 'ALTRO', label: 'Altro' };

  function catById(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    if (id === 'LOCALI') return LOCALI;
    return ALTRO;
  }

  function classify(name, group) {
    var n = ' ' + clean(name).toLowerCase() + ' ';
    var g = (group || '').toLowerCase();
    if (g.indexOf('local') >= 0 || g.indexOf('region') >= 0) return 'LOCALI';
    for (var i = 0; i < CATS.length; i++) {
      var words = CATS[i].words;
      for (var j = 0; j < words.length; j++) {
        if (n.indexOf(words[j]) >= 0) return CATS[i].id;
      }
    }
    if (/\b(tele|canale \d|antenna \d|radio ?tele)\b/.test(n) &&
        n.indexOf('sky') < 0 && n.indexOf('rai ') < 0 && n.indexOf('mediaset') < 0) return 'LOCALI';
    return 'ALTRO';
  }

  return { clean: clean, matchKey: matchKey, classify: classify, catById: catById, CATS: CATS, getLcn: getLcn };
})();

/* ---------------- canali curati (porting InjectedChannels.kt) ---------------- */
var InjectedChannels = (function () {
  var DLIVE = {
    '877': 'DAZN 1', '878': 'Eurosport 1', '879': 'Eurosport 2',
    '854': 'Italia 1', '855': 'La7', '856': 'La7d HD+',
    '850': 'Rai 1', '851': 'Rai 2', '852': 'Rai 3', '853': 'Rai 4',
    '882': 'Rai Sport', '858': 'Rai Premium', '857': '20 Mediaset',
    '881': 'Sky Uno', '880': 'Sky Serie',
    '859': 'Sky Cinema Collection', '860': 'Sky Cinema Uno', '861': 'Sky Cinema Action',
    '862': 'Sky Cinema Comedy', '863': 'Sky Cinema Uno +24', '864': 'Sky Cinema Romance',
    '865': 'Sky Cinema Family', '867': 'Sky Cinema Drama', '868': 'Sky Cinema Suspense',
    '869': 'Sky Sport 24', '870': 'Sky Sport Calcio',
    '871': 'Sky Calcio 1 (251)', '872': 'Sky Calcio 2 (252)', '873': 'Sky Calcio 3 (253)',
    '874': 'Sky Calcio 4 (254)', '3': 'Sky Sport 252', '2': 'Sky Sport 253',
    '875': 'Sky Sport Basket', '460': 'Sky Sport Max', '461': 'Sky Sport Uno',
    '462': 'Sky Sport Arena', '574': 'Sky Sport Golf', '575': 'Sky Sport MotoGP',
    '576': 'Sky Sport Tennis', '577': 'Sky Sport F1'
  };

  var list = [];
  for (var id in DLIVE) {
    if (!Object.prototype.hasOwnProperty.call(DLIVE, id)) continue;
    list.push({
      key: 'dlive/' + id,
      name: DLIVE[id],
      rawName: DLIVE[id],
      url: 'https://dlive.sx/watch.php?id=' + id,
      logo: null,
      group: 'Daddy Live',
      tvgId: 'Dlive.' + id,
      engine: 'dlive'
    });
  }

  return { list: list };
})();

/* ---------------- riconoscimento sorgenti ---------------- */
var PLAY_PREFIX = 'https://huhu.to/huhu-iptv/play/';

function isPlayHandle(url) { return String(url).indexOf(PLAY_PREFIX) === 0; }

function isDlive(url) {
  var u = String(url).toLowerCase();
  return u.indexOf('dlive.') >= 0 || u.indexOf('dlhd.') >= 0 || u.indexOf('/watch.php?id=') >= 0;
}
