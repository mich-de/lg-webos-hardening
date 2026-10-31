/* NuTV — app TV parallela a Live TV (org.nutv.app), webOS 5.6 / Chromium 79, ES5.
 * Video: <video><source src="tv://" type="service/webos-broadcast"> = canale corrente del sintonizzatore
 *   (verificato 31/10/2026: il JSON channelID nel type viene ignorato).
 * Cambio canale: src="tv://<channelId>" + load() (tuneInApp, niente Live TV). Fallback: exec root openChannel ->
 *   attesa getCurrentChannel -> rilancio NuTV (params.zap); in quel caso Live TV si vede ~1-2 s.
 * Riuso da NusGuide: lunaCall, getChannelList (grep via exec), loader EPG Rai/Mediaset/Sky cache/Aurora, promemoria.
 */
(function () {
'use strict';

var APP_ID = 'org.nutv.app';
var TV_API = 'luna://com.webos.service.apiadapter/tv/';
var HB_EXEC = 'luna://org.webosbrew.hbchannel.service/exec';
var NG_DIR = 'cache/';   // copia della cache EPG scritta da epg_offline.sh (file:// fuori dall'app non è leggibile)
var CH_KEY = 'nutv.channels', CH_TTL = 24 * 3600000;
var NUM_MS = 1500, BANNER_MS = 6000, ROW_H = 76;

/* ---------------- Luna ---------------- */
function lunaCall(uri, params, timeoutMs) {
	return new Promise(function (resolve, reject) {
		if (typeof window.PalmServiceBridge !== 'function') { reject(new Error('no PalmServiceBridge')); return; }
		var bridge = new window.PalmServiceBridge(), done = false;
		var timer = setTimeout(function () {
			if (done) return; done = true;
			try { if (bridge.cancel) bridge.cancel(); } catch (e) {}
			reject(new Error('timeout'));
		}, timeoutMs || 8000);
		bridge.onservicecallback = function (msg) {
			if (done) return; done = true; clearTimeout(timer);
			var p;
			try { p = JSON.parse(msg); } catch (e) { reject(new Error('bad json')); return; }
			if (p.returnValue === false) reject(new Error(p.errorText || ('errorCode ' + p.errorCode)));
			else resolve(p);
		};
		try { bridge.call(uri, JSON.stringify(params || {})); }
		catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
	});
}
function hbExec(cmd, ms) {
	return lunaCall(HB_EXEC, { command: cmd }, ms || 15000).then(function (r) { return r.stdoutString || ''; });
}

/* ---------------- Utils ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
	return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
	});
}
function hhmm(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
var toastT = null;
function toast(msg, ms) {
	var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
	clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, ms || 4000);
}

/* ---------------- EPG (tabella e loader da NusGuide) ---------------- */
// LCN DTT -> fonte EPG + colore brand (stessa tabella di nusguide/app/main.js)
var EPG = {
	'1': ['#0060A9', 'rai', 'rai-1'], '2': ['#C8161D', 'rai', 'rai-2'], '3': ['#1E8410', 'rai', 'rai-3'],
	'4': ['#1C3F94', 'mediaset', 'rete4_cR4'], '5': ['#E07B00', 'mediaset', 'canale5_cC5'], '6': ['#D4004F', 'mediaset', 'italia1_cI1'],
	'7': ['#1B3F8F', 'sky', '8329'], '8': ['#0090C0', 'sky', '8327'], '9': ['#5B2C83', 'aurora', 'nove'],
	'20': ['#A3191F', 'mediaset', '20mediaset_cLB'], '21': ['#9C1470', 'rai', 'rai-4'], '22': ['#6B3FA0', 'mediaset', 'iris_cKI'],
	'23': ['#3F6596', 'rai', 'rai-5'], '24': ['#1F5C99', 'rai', 'rai-movie'], '25': ['#8C1C4C', 'rai', 'rai-premium'],
	'26': ['#2A86BF', 'sky', '8773'], '27': ['#B0185A', 'mediaset', '_cTS'], '28': ['#1D5F9E', 'sky', '8325'],
	'29': ['#34407F', 'sky', '6624'], '30': ['#C2367A', 'mediaset', 'la5_cKA'], '31': ['#C8261E', 'aurora', 'realtime'],
	'33': ['#D0600E', 'aurora', 'foodnetwork'], '34': ['#80602A', 'mediaset', 'cine34_cB6'], '35': ['#0A7380', 'mediaset', 'focus_cFU'],
	'38': ['#A8860A', 'aurora', 'giallo', 'guida-tv-giallo'], '39': ['#7A1020', 'mediaset', 'topcrime_cLT'],
	'40': ['#D84C00', 'mediaset', 'kids_cKB'], '42': ['#4E9A2E', 'rai', 'rai-gulp'], '43': ['#C98200', 'rai', 'rai-yoyo'],
	'46': ['#1E78C8', 'mediaset', 'kids_cLA'], '47': ['#C62E2B', 'sky', '8314'], '48': ['#0B4F8A', 'rai', 'rai-news-24'],
	'49': ['#5432A0', 'mediaset', 'italia2_cI2'], '50': ['#0A3D7A', 'sky', '9313'], '51': ['#B32424', 'sky', '10473'],
	'52': ['#3A4048', 'aurora', 'dmaxit'], '54': ['#7A5C3E', 'rai', 'rai-storia'], '55': ['#00796B', 'mediaset', 'mediasetextra_cKQ'],
	'56': ['#4F8A2B', 'aurora', 'hgtvit'], '58': ['#0270AA', 'rai', 'rai-sport'], '59': ['#A31A1A', 'aurora', 'motortrend']
};
var RAI_PALINSESTO = 'https://guidatv.rai.it/palinsesto/app/';
var MEDIASET_GUIDA = 'https://mediasetinfinity.mediaset.it/guidatv';
var AURORA_PAGE = 'https://public.aurora.enhanced.live/site/page/';

function httpGet(url, timeoutMs) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = timeoutMs || 15000;
		xhr.onload = function () {
			// file:// risponde status 0
			if ((xhr.status >= 200 && xhr.status < 400) || (xhr.status === 0 && xhr.responseText)) resolve(xhr.responseText);
			else reject(new Error('HTTP ' + xhr.status));
		};
		xhr.onerror = function () { reject(new Error('XHR err')); };
		xhr.ontimeout = function () { reject(new Error('timeout')); };
		try { xhr.send(null); } catch (e) { reject(e); }
	});
}
function raiDay(d) { return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear(); }
function hmsToMs(hour, dateStr) {
	var md = /(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(dateStr || ''), tm = /^(\d{1,2}):(\d{2})/.exec(hour || '');
	if (!md || !tm) return null;
	return new Date(+md[3], +md[2] - 1, +md[1], +tm[1], +tm[2]).getTime();
}
function durToMs(dur, durMin) {
	if (durMin) { var m = /(\d+)/.exec(durMin); if (m) return +m[1] * 60000; }
	if (dur) { var t = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(dur); if (t) return (+t[1] * 3600 + +t[2] * 60 + +t[3]) * 1000; }
	return 30 * 60000;
}
function loadRai(id) {
	var days = [new Date(Date.now() - 6 * 3600000), new Date(), new Date(Date.now() + 86400000)];
	days = days[0].getDate() === days[1].getDate() ? days.slice(1) : days.slice(0, 2);   // dopo mezzanotte serve anche ieri
	return Promise.all(days.map(function (d) {
		var f = id + '/' + raiDay(d) + '.json';
		return httpGet(NG_DIR + id + '-' + raiDay(d) + '.json', 4000)
			.catch(function () { return httpGet(RAI_PALINSESTO + f); })
			.then(function (t) { return JSON.parse(t).events || []; })
			.catch(function () { return []; });
	})).then(function (parts) {
		return [].concat.apply([], parts).map(function (e) {
			var st = hmsToMs(e.hour, e.date);
			return st == null ? null : { title: String(e.name || ''), start: st, end: st + durToMs(e.duration, e.duration_in_minutes) };
		}).filter(Boolean).sort(function (a, b) { return a.start - b.start; });
	});
}
var shared = {};
function sharedGet(key, fn, ttl) {   // un download+parse per tutti i canali della fonte
	var s = shared[key];
	if (!s || Date.now() - s.t > ttl) {
		s = shared[key] = { t: Date.now(), p: fn() };
		s.p.catch(function () { if (shared[key] === s) delete shared[key]; });
	}
	return s.p;
}
function loadMediaset(id) {
	return sharedGet('ms', function () { return httpGet(MEDIASET_GUIDA, 25000).then(parseMediaset); }, 9 * 60000)
		.then(function (m) { return m[id] || []; });
}
function loadSky(id) {   // CORS bloccato: solo cache wget di NusGuide
	return sharedGet('sky', function () {
		return httpGet(NG_DIR + 'sky-dtt-' + raiDay(new Date()) + '.json', 6000)
			.catch(function () { return httpGet(NG_DIR + 'sky-dtt-' + raiDay(new Date(Date.now() - 86400000)) + '.json', 6000); })
			.then(parseSky);
	}, 30 * 60000).then(function (m) { return m[id] || []; });
}
function loadAurora(id, page) {
	var key = 'nutv.aurora.' + id, c = lsGet(key);
	if (c && c.p && Date.now() - c.t < 3600000) return Promise.resolve(c.p);
	return httpGet(AURORA_PAGE + (page || 'guida-tv') + '/?include=default&filter%5Benvironment%5D=' + id + '&v=2', 20000).then(function (t) {
		var cut = Date.now() - 6 * 3600000;
		var p = parseAurora(t).filter(function (x) { return x.end > cut; }).map(function (x) { return { title: x.title, start: x.start, end: x.end }; });
		lsSet(key, { t: Date.now(), p: p });
		return p;
	}, function (e) { if (c && c.p) return c.p; throw e; });
}
var LOADERS = { rai: loadRai, mediaset: loadMediaset, sky: loadSky, aurora: loadAurora };

// c.ld = Promise caricamento (null = da fare); c.progs = programmi; refresh ogni 15 min
function loadEpg(c) {
	var e = EPG[c.n];
	if (!e) return Promise.resolve([]);
	if (!c.ld || Date.now() - c.ldT > 15 * 60000) {
		c.ldT = Date.now();
		c.ld = LOADERS[e[1]](e[2], e[3]).then(function (p) { c.progs = p; return p; }, function () { c.progs = c.progs || []; return c.progs; });
	}
	return c.ld;
}
function nowNext(c) {
	var now = Date.now(), p = c.progs || [], i;
	for (i = 0; i < p.length; i++) {
		if (p[i].start <= now && now < p[i].end) return { now: p[i], next: p[i + 1] || null };
		if (p[i].start > now) return { now: null, next: p[i] };
	}
	return { now: null, next: null };
}

/* ---------------- Canali TV ---------------- */
var all = [], byNum = {}, cur = null, prev = null;
var favs = lsGet('nutv.favs') || {};

function colorOf(c) {
	if (EPG[c.n]) return EPG[c.n][0];
	var h = 0; for (var i = 0; i < c.nm.length; i++) h = (h * 31 + c.nm.charCodeAt(i)) % 360;
	return 'hsl(' + h + ',45%,38%)';
}
// loghi originali (tv-logo/tv-logos, ridotti e inclusi nel pacchetto: niente rete) per LCN DTT nazionali
var LOGOS = ' 1 2 3 4 5 6 7 8 9 20 21 22 23 24 25 26 27 29 30 31 34 35 38 39 40 42 43 46 47 48 49 50 51 54 55 ';
// loghi bianchi o chiari (TV8, Iris, 27, Cine34, Top Crime, Cartoonito, Italia 2, Sky TG24, Extra, LA7): piastra scura
var DARK = ' 7 8 22 27 29 34 39 46 49 50 55 ';
function logoHtml(c) {
	if (LOGOS.indexOf(' ' + c.n + ' ') >= 0)
		return '<div class="logo img' + (DARK.indexOf(' ' + c.n + ' ') >= 0 ? ' dk' : '') + '"><img src="logos/' + c.n + '.png" alt="' + esc(c.nm) + '"><i>' + esc(c.n) + '</i></div>';
	return '<div class="logo" style="background:' + colorOf(c) + '"><b>' + esc(c.n) + '</b><span>' + esc(c.nm) + '</span></div>';
}
// icone Lucide (ISC) inline
var ICON_STAR = '<svg class="ico" viewBox="0 0 24 24" width="30" height="30" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>';
// grep -o della lista (790 KB -> ~60 KB): channelNumber apre ogni canale
function parseGrepList(out) {
	var list = [], o = null;
	out.split('\n').forEach(function (ln) {
		var m = /^"(\w+)":"?([^"]*)"?$/.exec(ln.trim());
		if (!m) return;
		if (m[1] === 'channelNumber') list.push(o = {});
		if (o) o[m[1]] = m[1] === 'channelModeId' ? +m[2] : m[1] === 'Radio' ? m[2] === 'true' : m[2];
	});
	return list;
}
// DTT (channelModeId 0) prima del satellite, niente radio; ordinati per numero
function buildList(raw) {
	var m = {}, out = [];
	raw.forEach(function (c) {
		if (!c.channelNumber || !c.channelId || c.Radio || !/^[\w.-]+$/.test(c.channelId)) return;
		var o = m[c.channelNumber];
		if (!o || (o.mode !== 0 && c.channelModeId === 0))
			m[c.channelNumber] = { n: String(c.channelNumber), nm: String(c.channelName || ''), id: c.channelId, mode: c.channelModeId };
	});
	for (var k in m) out.push({ n: m[k].n, nm: m[k].nm, id: m[k].id });
	out.sort(function (a, b) { return (parseFloat(a.n) || 1e9) - (parseFloat(b.n) || 1e9); });
	return out;
}
function loadChannels(force) {
	var c = lsGet(CH_KEY);
	if (!force && c && c.l && c.l.length && Date.now() - c.t < CH_TTL) return Promise.resolve(c.l);
	return lunaCall(TV_API + 'getChannelList', {}, 8000)
		.then(function (r) { return r.channelList || []; })
		.catch(function () {
			return hbExec('luna-send -n 1 ' + TV_API + "getChannelList '{}' | grep -o '\"channelNumber\":\"[^\"]*\"\\|\"channelName\":\"[^\"]*\"\\|\"channelModeId\":[0-9]*\\|\"Radio\":[a-z]*\\|\"channelId\":\"[^\"]*\"'", 25000).then(parseGrepList);
		})
		.then(function (raw) {
			var l = buildList(raw);
			if (!l.length) throw new Error('lista canali vuota');
			lsSet(CH_KEY, { t: Date.now(), l: l });
			return l;
		});
}
function setChannels(l) {
	all = l.map(function (c) { return { n: c.n, nm: c.nm, id: c.id }; });
	byNum = {};
	all.forEach(function (c) { byNum[c.n] = c; });
}
function byId(id) { for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }

/* ---------------- Zapping ---------------- */
var zapping = null, pending = null;
function zapCmd(id) {
	var get = 'timeout -t 2 luna-send -n 1 ' + TV_API + "getCurrentChannel '{}' | grep -q '\"channelId\":\"" + id + "\"'";
	return 'luna-send -n 1 ' + TV_API + "openChannel '{\"channelId\":\"" + id + "\"}' >/dev/null; i=0; "
		+ 'while [ $i -lt 15 ]; do ' + get + ' && break; usleep 250000; i=$((i+1)); done; usleep 500000; '
		+ "luna-send -n 1 luna://com.webos.applicationManager/launch '{\"id\":\"" + APP_ID + "\",\"params\":{\"zap\":\"" + id + "\"}}' >/dev/null; echo zap$i";
}
// Zap dentro NuTV, senza Live TV: <source src="tv://<channelId>"> sintonizza quel canale (verificato 31/10/2026 col proto,
// getCurrentChannel cambia; il JSON channelID nel type invece è ignorato). Promise: risolve su 'playing', rifiuta su errore/6 s.
function tuneInApp(c) {
	return new Promise(function (resolve, reject) {
		var v = $('tv'), s = v.querySelector('source'), done = false, t;
		if (!$('novideo').classList.contains('hidden')) { reject(new Error('no video')); return; }
		function fin(ok) {
			if (done) return; done = true; clearTimeout(t);
			v.removeEventListener('playing', onOk); v.removeEventListener('error', onErr); s.removeEventListener('error', onErr);
			if (ok) resolve(); else reject(new Error('video'));
		}
		function onOk() { fin(true); }
		function onErr() { fin(false); }
		v.addEventListener('playing', onOk); v.addEventListener('error', onErr); s.addEventListener('error', onErr);
		t = setTimeout(function () { fin(false); }, 6000);
		s.src = 'tv://' + c.id;
		v.load();
		try { v.play(); } catch (e) {}
	});
}
function tune(c) {
	if (c && c.input) { switchInput(c); return; }
	if (!c || !/^[\w.-]+$/.test(c.id)) return;
	if (cur && c.id === cur.id) { showBanner(); return; }
	if (zapping) { pending = c; busy(c); return; }
	zapping = c; pending = null;
	busy(c);
	tuneInApp(c).catch(function () {
		// fallback: openChannel (Live TV in primo piano ~1-2 s) + rilancio NuTV
		return hbExec(zapCmd(c.id), 20000).catch(function () {
			return lunaCall(TV_API + 'openChannel', { channelId: c.id }, 8000);   // niente exec root: si resta su Live TV
		});
	}).then(function () { arrived(c); }, function (e) {
		zapping = null; busy(null);
		toast('Cambio canale fallito: ' + String(e && e.message || e).slice(0, 70), 6000);
	});
}
function arrived(c) {
	if (!cur || cur.id !== c.id) { if (cur) prev = cur; cur = c; }
	lsSet('nutv.last', { cur: cur && cur.id, prev: prev && prev.id });
	zapping = null; busy(null);
	if (pending && pending.id !== cur.id) { var p = pending; pending = null; tune(p); return; }
	pending = null;
	showBanner();
	if (panelOpen) renderList();
}
function busy(c) {
	var b = $('busy');
	if (!c) { b.classList.add('hidden'); return; }
	$('busyt').textContent = (c.n ? 'Sintonizzo ' + c.n + ' ' : 'Carico ') + c.nm + '…';
	b.classList.remove('hidden');
}
function step(d) {
	if (!all.length) return;
	var base = pending || zapping || cur, i = base ? all.indexOf(base) : -1;
	if (i < 0 && base) i = all.indexOf(byNum[base.n]);
	tune(all[(i + d + all.length) % all.length]);
}
function goPrev() { if (prev) tune(prev); else toast('Nessun canale precedente'); }

/* numeri: accumulo e timeout 1,5 s */
var numBuf = '', numT = null;
function numKey(d) {
	numBuf = (numBuf + d).slice(-4);
	$('numbox').textContent = numBuf; $('numbox').classList.remove('hidden');
	clearTimeout(numT);
	numT = setTimeout(numGo, NUM_MS);
}
function numGo() {
	var n = String(+numBuf); numBuf = ''; $('numbox').classList.add('hidden');
	if (byNum[n]) tune(byNum[n]); else toast('Canale ' + n + ' non presente');
}

/* ---------------- Banner Ora / Dopo ---------------- */
var bannerT = null, bFocus = -1;
function showBanner(keep) {
	if (!cur) return;
	$('banner').classList.remove('hidden');
	renderBanner();
	loadEpg(cur).then(function () { if (!$('banner').classList.contains('hidden')) renderBanner(); });
	clearTimeout(bannerT);
	if (!keep) bannerT = setTimeout(hideBanner, BANNER_MS);
}
function hideBanner() { $('banner').classList.add('hidden'); setBFocus(-1); }
function bannerOpen() { return !$('banner').classList.contains('hidden'); }
function renderBanner() {
	var c = cur, nn = nowNext(c), now = Date.now();
	$('blogo').outerHTML = logoHtml(c).replace('class="logo', 'id="blogo" class="logo');
	$('bname').innerHTML = esc(c.n + '  ' + c.nm) + (favs[c.id] ? '<span class="star">' + ICON_STAR + '</span>' : '');
	var noEpg = !EPG[c.n] ? 'Guida non disponibile per questo canale' : (c.ld && c.progs ? 'Nessuna informazione' : 'Carico la guida…');
	$('bnowt').textContent = nn.now ? nn.now.title : noEpg;
	$('bnowh').textContent = nn.now ? hhmm(nn.now.start) + ' – ' + hhmm(nn.now.end) : '';
	$('bbar').style.visibility = nn.now ? '' : 'hidden';
	if (nn.now) $('bbar').firstChild.style.width = Math.max(0, Math.min(100, (now - nn.now.start) / (nn.now.end - nn.now.start) * 100)) + '%';
	$('bnextt').textContent = nn.next ? nn.next.title : '—';
	$('bnexth').textContent = nn.next ? hhmm(nn.next.start) : '';
	$('btnfav').classList.toggle('on', !!favs[c.id]);
	$('btnrem').classList.toggle('hidden', !(nn.next && window.Reminders));
}
function bButtons() {
	return [].filter.call($('bbtns').children, function (b) { return !b.classList.contains('hidden'); });
}
function setBFocus(i) {
	var bs = bButtons();
	bFocus = i < 0 ? -1 : Math.max(0, Math.min(bs.length - 1, i));
	[].forEach.call($('bbtns').children, function (b) { b.classList.remove('focused'); });
	if (bFocus >= 0) bs[bFocus].classList.add('focused');
}
function act(a) {
	if (a === 'fav') toggleFav(cur);
	else if (a === 'remind') remindNext();
	else if (a === 'last') goPrev();
	else if (a === 'list') { hideBanner(); openPanel(); }
	else if (a === 'exit') { try { window.close(); } catch (e) {} }
}
function toggleFav(c) {
	if (!c) return;
	if (favs[c.id]) delete favs[c.id]; else favs[c.id] = 1;
	lsSet('nutv.favs', favs);
	if (bannerOpen()) renderBanner();
	if (panelOpen) renderList();
	toast(favs[c.id] ? c.nm + ' aggiunto ai preferiti' : c.nm + ' tolto dai preferiti', 2500);
}
function remindNext() {
	var c = cur, p = c && nowNext(c).next;
	if (!p || !window.Reminders) return;
	Reminders.add(p.start / 1000, 'nt' + c.n.replace(/\D/g, '') + '_' + Math.floor(p.start / 1000), APP_ID,
		c.nm + ': ' + p.title, 'lcn:' + c.n).then(function () {
		toast('Promemoria: ' + p.title + ' alle ' + hhmm(p.start) + ' su ' + c.nm, 4000);
	}, function (e) { toast('Promemoria non impostato: ' + String(e && e.message || e).slice(0, 70), 6000); });
}

/* ---------------- Lista canali (render solo righe visibili) ---------------- */
var panelOpen = false, tab = 'all', pFocus = 0, pTop = 0, VIS = 11;
function shown() { return tab === 'fav' ? all.filter(function (c) { return favs[c.id]; }) : tab === 'in' ? inputs : all; }
var TABS = ['all', 'fav', 'in'];
function nextTab(d) { setTab(TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length]); }

/* ---------------- Ingressi HDMI (eim) ---------------- */
var inputs = [];
function loadInputs() {
	return lunaCall('luna://com.webos.service.eim/getAllInputStatus', {}, 5000)
		.catch(function () { return hbExec("luna-send -n 1 luna://com.webos.service.eim/getAllInputStatus '{}'", 8000).then(JSON.parse); })
		.then(function (r) {
			inputs = (r.devices || []).filter(function (d) { return /^HDMI_\d$/.test(d.id) && /^[\w.]+$/.test(d.appId); }).map(function (d) {
				return { n: 'H' + d.port, nm: d.label, id: d.id, input: d.appId, on: !!d.hdmiPlugIn };
			});
			if (panelOpen && tab === 'in') renderList();
		}, function () {});
}
function switchInput(c) {
	toast('Passo a ' + c.nm + '…', 2500);
	lunaCall('luna://com.webos.applicationManager/launch', { id: c.input }, 6000).catch(function () {
		return hbExec("luna-send -n 1 luna://com.webos.applicationManager/launch '{\"id\":\"" + c.input + "\"}'");
	}).catch(function (e) { toast('Ingresso non disponibile: ' + String(e && e.message || e).slice(0, 60), 5000); });
}
function openInputs() { if (!panelOpen) openPanel(); setTab('in'); }

function openPanel() {
	panelOpen = true;
	var l = shown(), i = cur ? l.indexOf(cur) : -1;
	pFocus = i < 0 ? 0 : i; pTop = Math.max(0, pFocus - 5);
	$('panel').classList.remove('hidden');
	renderList();
}
function closePanel() { panelOpen = false; $('panel').classList.add('hidden'); }
function setTab(t) { tab = t; pFocus = 0; pTop = 0; renderList(); if (t === 'in') loadInputs(); }
function movePanel(d) {
	var l = shown(); if (!l.length) return;
	pFocus = Math.max(0, Math.min(l.length - 1, pFocus + d));
	if (pFocus < pTop) pTop = pFocus;
	if (pFocus >= pTop + VIS) pTop = pFocus - VIS + 1;
	renderList();
}
var listT = null;
function renderList() {
	[].forEach.call($('ptabs').children, function (t) { t.classList.toggle('sel', t.getAttribute('data-tab') === tab); });
	var l = shown(), html = '';
	if (!l.length) html = '<div class="empty">' + (tab === 'fav' ? 'Nessun preferito: premi la stella su un canale.' : tab === 'in' ? 'Carico gli ingressi…' : 'Nessun canale.') + '</div>';
	for (var i = pTop; i < Math.min(l.length, pTop + VIS); i++) {
		var c = l[i], nn = nowNext(c);
		if (c.input) {
			html += '<div class="row' + (i === pFocus ? ' focused' : '') + '" data-i="' + i + '" style="top:' + ((i - pTop) * ROW_H) + 'px">'
				+ '<div class="logo inp"><b>' + esc(c.n.slice(1)) + '</b><span>HDMI</span></div><div class="t"><div class="nm">' + esc(c.nm) + '</div><div class="pg">'
				+ (c.on ? 'Dispositivo collegato' : '&nbsp;') + '</div></div></div>';
			continue;
		}
		html += '<div class="row' + (i === pFocus ? ' focused' : '') + (c === cur ? ' cur' : '') + '" data-i="' + i + '" style="top:' + ((i - pTop) * ROW_H) + 'px">'
			+ logoHtml(c) + '<div class="t"><div class="nm">' + esc(c.nm) + '</div><div class="pg">'
			+ (nn.now ? esc(hhmm(nn.now.start) + '  ' + nn.now.title) : '&nbsp;') + '</div></div>'
			+ '<div class="st' + (favs[c.id] ? ' on' : '') + '" data-fav="' + i + '">' + ICON_STAR + '</div></div>';
	}
	$('plist').innerHTML = html;
	// EPG lazy delle sole righe visibili; un solo ridisegno quando arrivano
	for (var j = pTop; j < Math.min(l.length, pTop + VIS); j++) {
		if (EPG[l[j].n] && !l[j].ld) loadEpg(l[j]).then(function () {
			clearTimeout(listT); listT = setTimeout(function () { if (panelOpen) renderList(); }, 150);
		});
	}
}

/* ---------------- Input: Magic Remote + tasti ---------------- */
var lastNav = 0;
function navOk() { var t = Date.now(); if (t - lastNav < 140) return false; lastNav = t; return true; }

document.addEventListener('click', function (e) {
	for (var el = e.target; el && el.nodeType === 1; el = el.parentNode) {
		var a = el.getAttribute('data-act'), t = el.getAttribute('data-tab'), f = el.getAttribute('data-fav'), r = el.getAttribute('data-i');
		if (a) { act(a); return; }
		if (t) { setTab(t); return; }
		if (f != null) { toggleFav(shown()[+f]); return; }
		if (r != null) { var c = shown()[+r]; closePanel(); tune(c); return; }
		if (el.id === 'banner' || el.id === 'panel') return;
	}
	if (panelOpen) closePanel(); else showBanner();   // click sul video
});
document.addEventListener('wheel', function (e) {
	e.preventDefault();
	if (!navOk()) return;
	var d = e.deltaY > 0 ? 1 : -1;
	if (panelOpen) movePanel(d); else step(-d);   // rotella su = canale successivo
}, { passive: false });

document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	if (k >= 48 && k <= 57) { numKey(k - 48); e.preventDefault(); return; }
	if (k >= 96 && k <= 105) { numKey(k - 96); e.preventDefault(); return; }
	if (numBuf && k === 13) { clearTimeout(numT); numGo(); e.preventDefault(); return; }
	// diagnosi: codici dei tasti non di navigazione -> /tmp/nutv-keys.log (per mappare Ingressi ecc. dal telecomando reale)
	if (!(k >= 37 && k <= 40) && k !== 13) hbExec('echo ' + k + ' ' + String(e.key || '').replace(/[^\w]/g, '') + ' >> /tmp/nutv-keys.log', 3000).catch(function () {});
	// CH+/CH- (log reale: 33 PageUp / 34 PageDown; test utente 0.1.9: con NuTV in primo piano la TV NON zappa da sé) -> zap nostro
	if (k === 33 || k === 34 || k === 402 || k === 403 || k === 427 || k === 428) {
		if (panelOpen) closePanel();
		step(k === 33 || k === 402 || k === 427 ? 1 : -1);
		e.preventDefault();
		return;
	}
	if (k === 447 || k === 448 || k === 449) return;   // volume/muto: solo TV (OSD LG non disattivabile, niente doppioni)
	// shortcut: 1536 "Unidentified" visto nel log dal telecomando reale, presunto tasto Ingressi (da confermare con l'utente)
	if (k === 1536 || /input|source/i.test(String(e.key || ''))) { openInputs(); e.preventDefault(); return; }
	var back = k === 461 || k === 8 || k === 27;
	if (panelOpen) {
		var l = shown();
		if (k === 38) { if (navOk()) movePanel(-1); }
		else if (k === 40) { if (navOk()) movePanel(1); }
		else if (k === 37 || k === 39) nextTab(k === 39 ? 1 : -1);
		else if (k === 13) { var c = l[pFocus]; closePanel(); tune(c); }
		else if (back) closePanel();
		else return;
		e.preventDefault(); return;
	}
	if (bannerOpen() && bFocus >= 0) {
		if (k === 37) setBFocus(bFocus - 1);
		else if (k === 39) setBFocus(bFocus + 1);
		else if (k === 13) act(bButtons()[bFocus].getAttribute('data-act'));
		else if (back) hideBanner();
		else if (k === 38 || k === 40) { setBFocus(-1); step(k === 38 ? 1 : -1); }
		else return;
		if (bannerOpen()) { clearTimeout(bannerT); bannerT = setTimeout(hideBanner, BANNER_MS * 2); }
		e.preventDefault(); return;
	}
	switch (k) {
		case 38: step(1); break;                   // ↑
		case 40: step(-1); break;                  // ↓
		case 37: case 39: showBanner(true); setBFocus(0); clearTimeout(bannerT); bannerT = setTimeout(hideBanner, BANNER_MS * 2); break;
		case 13: openPanel(); break;
		case 461: case 8: case 27:
			if (bannerOpen()) hideBanner(); else goPrev();   // Back breve = canale precedente
			break;
		default: return;
	}
	e.preventDefault();
});

/* ---------------- Lancio / rilancio ---------------- */
function params(p) {
	if (typeof p === 'string') { try { p = JSON.parse(p || '{}'); } catch (e) { p = {}; } }
	return p || {};
}
function handleParams(p) {
	p = params(p);
	if (p.zap) { var c = byId(p.zap); if (c) { if (!zapping || zapping.id === c.id) arrived(c); } return true; }
	var m = /^lcn:(\d+)$/.exec(String(p.extra || ''));   // da promemoria
	if (m && byNum[m[1]]) { tune(byNum[m[1]]); return true; }
	return false;
}
document.addEventListener('webOSRelaunch', function (e) {
	var p = params(e.detail || (window.PalmSystem && window.PalmSystem.launchParams));
	if (p.reminderAction) return;   // gestito da reminders-client.js
	if (!handleParams(p)) showBanner();
});
document.addEventListener('visibilitychange', function () {
	if (!document.hidden) { var v = $('tv'); try { if (v.paused) v.play(); } catch (e) {} }
});

// canale attuale del sintonizzatore (risponde solo se Live TV è attiva) -> altrimenti ultimo salvato
function detectCurrent() {
	return hbExec('timeout -t 3 luna-send -n 1 ' + TV_API + "getCurrentChannel '{}' | grep -o '\"channelId\":\"[^\"]*\"'", 8000)
		.then(function (out) { var m = /"channelId":"([^"]+)"/.exec(out); return m ? byId(m[1]) : null; })
		.catch(function () { return null; });
}

function boot() {
	var v = $('tv');
	v.addEventListener('error', function () { $('novideo').classList.remove('hidden'); });
	v.querySelector('source').addEventListener('error', function () { $('novideo').classList.remove('hidden'); });
	if (!v.canPlayType('service/webos-broadcast')) $('novideo').classList.remove('hidden');

	var cached = lsGet(CH_KEY);
	if (!cached) busy({ n: '', nm: 'lista canali' });
	loadChannels(false).then(function (l) {
		setChannels(l);
		busy(null);
		var last = lsGet('nutv.last') || {};
		prev = byId(last.prev);
		cur = byId(last.cur) || byNum['1'] || all[0];
		if (handleParams(window.PalmSystem && window.PalmSystem.launchParams)) return;
		showBanner();
		detectCurrent().then(function (c) { if (c && c !== cur) { if (cur) prev = cur; cur = c; showBanner(); } });
	}, function (e) {
		busy(null);
		toast('Lista canali non disponibile: ' + String(e && e.message || e).slice(0, 70), 10000);
	});
	setInterval(function () { if (bannerOpen()) renderBanner(); }, 30000);
}

if (window.Reminders && Reminders.handleLaunch(APP_ID)) return;   // azione da notifica: esegue e chiude
boot();

})();
