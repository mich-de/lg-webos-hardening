/* NusGuide — Guida TV per webOS 5.x (_org.nusguide.app_)
 * Nessun CDN, nessuna dipendenza: JS vanilla.
 * Fonte dati: EPG interno TV (luna://com.webos.epgdb find/search) provata a
 * runtime; se nessun kind risponde → fallback canali hardcoded senza EPG.
 */
(function () {
'use strict';

/* ---------------- Luna bridge (pattern Hearth luna.ts) ---------------- */
function lunaCall(uri, params, timeoutMs) {
	params = params || {}; timeoutMs = timeoutMs || 8000;
	return new Promise(function (resolve, reject) {
		if (typeof window.PalmServiceBridge !== 'function') {
			reject(new Error('no PalmServiceBridge')); return;
		}
		var bridge = new window.PalmServiceBridge();
		var done = false;
		var timer = setTimeout(function () {
			if (done) return; done = true;
			try { bridge.cancel && bridge.cancel(); } catch (e) {}
			reject(new Error('timeout'));
		}, timeoutMs);
		bridge.onservicecallback = function (msg) {
			if (done) return; done = true; clearTimeout(timer);
			var payload;
			try { payload = JSON.parse(msg); } catch (e) { reject(new Error('bad json')); return; }
			if (payload.returnValue === false) {
				reject(new Error(payload.errorText || ('errorCode ' + payload.errorCode)));
			} else { resolve(payload); }
		};
		try { bridge.call(uri, JSON.stringify(params)); }
		catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
	});
}

/* ---------------- Config ---------------- */
var KIND_PROGRAMS = [
	'com.webos.epg.programs:1', 'com.palm.epg.programs:1',
	'com.webos.epg.service.programs:1', 'com.webos.service.epg.programs:1',
	'com.webos.epgdb.programs:1', 'com.palm.epg.program:1'
];
var KIND_CHANNELS = [
	'com.webos.epg.channels:1', 'com.palm.epg.channels:1',
	'com.webos.epg.service.channels:1', 'com.webos.service.epg.channels:1',
	'com.webos.epgdb.channels:1', 'com.palm.epg.channel:1'
];
/* Lista canali (ordine LCN DTT): per aggiungerne uno basta una riga.
 *   src = chiave in LOADERS, id = slug/ID per quella fonte (vedi D:\tv\epg_sources_dtt.md)
 *     rai: slug guidatv.rai.it · mediaset: slug /diretta/ · sky: id canale env=DTT (solo cache wget)
 *     aurora: environment WBD (page opzionale, default 'guida-tv')
 *   tgr = true: canale con edizioni regionali TGR ("TG Regione" -> regione scelta)
 * Canali senza fonte non vanno inseriti. */
var FALLBACK_CHANNELS = [
	{ num: '1',  name: 'Rai 1',          color: '#0060A9', src: 'rai', id: 'rai-1' },
	{ num: '2',  name: 'Rai 2',          color: '#C8161D', src: 'rai', id: 'rai-2' },
	{ num: '3',  name: 'Rai 3',          color: '#1E8410', src: 'rai', id: 'rai-3', tgr: true },
	{ num: '4',  name: 'Rete 4',         color: '#1C3F94', src: 'mediaset', id: 'rete4_cR4' },
	{ num: '5',  name: 'Canale 5',       color: '#E07B00', src: 'mediaset', id: 'canale5_cC5' },
	{ num: '6',  name: 'Italia 1',       color: '#D4004F', src: 'mediaset', id: 'italia1_cI1' },
	{ num: '7',  name: 'La7',            color: '#1B3F8F', src: 'sky', id: '8329' },
	{ num: '8',  name: 'TV8',            color: '#0090C0', src: 'sky', id: '8327' },
	{ num: '9',  name: 'Nove',           color: '#5B2C83', src: 'aurora', id: 'nove' },
	{ num: '20', name: '20 Mediaset',    color: '#A3191F', src: 'mediaset', id: '20mediaset_cLB' },
	{ num: '21', name: 'Rai 4',          color: '#9C1470', src: 'rai', id: 'rai-4' },
	{ num: '22', name: 'Iris',           color: '#6B3FA0', src: 'mediaset', id: 'iris_cKI' },
	{ num: '23', name: 'Rai 5',          color: '#3F6596', src: 'rai', id: 'rai-5' },
	{ num: '24', name: 'Rai Movie',      color: '#1F5C99', src: 'rai', id: 'rai-movie' },
	{ num: '25', name: 'Rai Premium',    color: '#8C1C4C', src: 'rai', id: 'rai-premium' },
	{ num: '26', name: 'Cielo',          color: '#2A86BF', src: 'sky', id: '8773' },
	{ num: '27', name: 'TwentySeven',    color: '#B0185A', src: 'mediaset', id: '_cTS' },
	{ num: '28', name: 'TV2000',         color: '#1D5F9E', src: 'sky', id: '8325' },
	{ num: '29', name: 'La7 Cinema',     color: '#34407F', src: 'sky', id: '6624' },
	{ num: '30', name: 'La5',            color: '#C2367A', src: 'mediaset', id: 'la5_cKA' },
	{ num: '31', name: 'Real Time',      color: '#C8261E', src: 'aurora', id: 'realtime' },
	{ num: '33', name: 'Food Network',   color: '#D0600E', src: 'aurora', id: 'foodnetwork' },
	{ num: '34', name: 'Cine34',         color: '#80602A', src: 'mediaset', id: 'cine34_cB6' },
	{ num: '35', name: 'Focus',          color: '#0A7380', src: 'mediaset', id: 'focus_cFU' },
	{ num: '38', name: 'Giallo',         color: '#A8860A', src: 'aurora', id: 'giallo', page: 'guida-tv-giallo' },
	{ num: '39', name: 'Top Crime',      color: '#7A1020', src: 'mediaset', id: 'topcrime_cLT' },
	{ num: '40', name: 'Boing',          color: '#D84C00', src: 'mediaset', id: 'kids_cKB' },
	{ num: '42', name: 'Rai Gulp',       color: '#4E9A2E', src: 'rai', id: 'rai-gulp' },
	{ num: '43', name: 'Rai YoYo',       color: '#C98200', src: 'rai', id: 'rai-yoyo' },
	{ num: '46', name: 'Cartoonito',     color: '#1E78C8', src: 'mediaset', id: 'kids_cLA' },
	{ num: '47', name: 'Super!',         color: '#C62E2B', src: 'sky', id: '8314' },
	{ num: '48', name: 'Rai News 24',    color: '#0B4F8A', src: 'rai', id: 'rai-news-24' },
	{ num: '49', name: 'Italia 2',       color: '#5432A0', src: 'mediaset', id: 'italia2_cI2' },
	{ num: '50', name: 'Sky TG24',       color: '#0A3D7A', src: 'sky', id: '9313' },
	{ num: '51', name: 'TGCom24',        color: '#B32424', src: 'sky', id: '10473' },
	{ num: '52', name: 'DMAX',           color: '#3A4048', src: 'aurora', id: 'dmaxit' },
	{ num: '54', name: 'Rai Storia',     color: '#7A5C3E', src: 'rai', id: 'rai-storia' },
	{ num: '55', name: 'Mediaset Extra', color: '#00796B', src: 'mediaset', id: 'mediasetextra_cKQ' },
	{ num: '56', name: 'HGTV',           color: '#4F8A2B', src: 'aurora', id: 'hgtvit' },
	{ num: '58', name: 'Rai Sport',      color: '#0270AA', src: 'rai', id: 'rai-sport' },
	{ num: '59', name: 'Motor Trend',    color: '#A31A1A', src: 'aurora', id: 'motortrend' }
];

/* Sedi TGR (Rai 3 regionale) */
var REGIONI = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
	'Friuli Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte',
	'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino', 'Alto Adige', 'Umbria',
	"Valle d'Aosta", 'Veneto'];
var region = 'Campania';
try { var sr = localStorage.getItem('nusguide.region'); if (REGIONI.indexOf(sr) >= 0) region = sr; } catch (e) {}

/* Fonti EPG dirette (niente GitHub/TERZI):
 *  - Rai:  https://guidatv.rai.it/palinsesto/app/<slug>/<gg-mm-aaaa>.json
 *          (endpoint ufficiale del componente rai-tv-guide di guidatv.rai.it)
 *  - Mediaset: https://mediasetinfinity.mediaset.it/guidatv (HTML SSR: card orario+titolo; www.mediaset.it/guidatv/ fa 301 qui)
 *  - Sky gtv (CORS bloccato): solo cache locale scaricata da epg_offline.sh (wget)
 *  - Aurora WBD (Nove, Real Time, DMAX...): XHR diretto, CORS *, 7 giorni per richiesta
 */
var RAI_PALINSESTO = 'https://guidatv.rai.it/palinsesto/app/';
var MEDIASET_GUIDA = 'https://mediasetinfinity.mediaset.it/guidatv';
var AURORA_PAGE = 'https://public.aurora.enhanced.live/site/page/';
var AURORA_TTL = 60 * 60 * 1000;
var SHARED_TTL = 9 * 60 * 1000;
var SKY_TTL = 30 * 60 * 1000;    // file Sky riscritto ogni 15 min da epg_offline.sh, finestra 49 h: ri-parse al massimo ogni 30 min  // HTML Mediaset / file Sky: un solo download+parse per tutti i canali

var PX_PER_MIN = 8;             // 240 px per mezz'ora
var WINDOW_MIN = 240;           // finestra query EPG interno: 4 h
var LOGO_W = 152;               // colonna logo (140) + margine (12)
var ROW_H = 72;                 // riga griglia (64) + margine (8)
var NSTRIP = 8;                 // card "In onda ora" visibili
var RAI_IMG = 'https://www.raiplay.it/resizegd/';   // immagini Rai ridimensionate (verificato 200 OK)
var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
var GSHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
	'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
var HUE = [200, 210, 330, 30, 120, 260, 15, 175]; // colori fallback canali
var MSLOT = 30 * 60 * 1000;

/* ---------------- Stato ---------------- */
var channels = [];              // [{num,name,progs:[{title,start,end,desc}]}]
var programsKind = null;
var channelsKind = null;
var fCh = 0;                    // canale focus
var fTime = 0;                  // istante focus (ms): sceglie il programma nel canale
var viewStart = 0;              // ms del bordo sinistro della griglia
var topRow = 0;
var hasEpg = false;
var detailOpen = false;

/* ---------------- Utils ---------------- */
function $(id) { return document.getElementById(id); }
function hhmm(ms) {
	var d = new Date(ms);
	return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
function tileColor(seed) {
	var h = HUE[seed % HUE.length];
	return 'hsl(' + h + ',55%,45%)';
}
function esc(s) {
	return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
	});
}
// normalizzatore tollerante: campi possibili ignoti
function pick(o, keys) {
	for (var i = 0; i < keys.length; i++) {
		if (o[keys[i]] != null && o[keys[i]] !== '') return o[keys[i]];
	}
	return null;
}
function toMs(v) {
	if (v == null) return null;
	if (typeof v === 'number') return v < 1e10 ? v * 1000 : v;   // s vs ms
	var n = Date.parse(String(v).replace('T', ' ').replace('Z', ' UTC') + '');
	if (isNaN(n)) n = Date.parse(String(v));
	return isNaN(n) ? null : n;
}

/* ---------------- Discovery + caricamento EPG ---------------- */
function tryKinds(kinds) {
	var i = 0;
	function next() {
		if (i >= kinds.length) return Promise.resolve(null);
		var kind = kinds[i++];
		return lunaCall('luna://com.webos.epgdb/find',
			{ query: { from: kind, limit: 1 } }, 5000)
			.then(function (res) {
				if (res && res.results) return kind;
				return null;
			})
			.catch(function () { return null; })
			.then(function (ok) { return ok ? ok : next(); });
	}
	return next();
}

function discover() {
	return Promise.all([tryKinds(KIND_CHANNELS), tryKinds(KIND_PROGRAMS)])
		.then(function (r) { channelsKind = r[0]; programsKind = r[1]; });
}

function loadFromEpg() {
	var pCh = channelsKind
		? lunaCall('luna://com.webos.epgdb/find',
			{ query: { from: channelsKind, limit: 200, orderBy: 'channelNumber' } }, 8000)
			.catch(function () { return null; })
		: Promise.resolve(null);
	var win0 = Date.now() - MSLOT, win1 = Date.now() + WINDOW_MIN * 60000;
	var pPr = programsKind
		? lunaCall('luna://com.webos.epgdb/find',
			{ query: { from: programsKind, limit: 800,
				where: [{ prop: 'startTime', op: '>', val: win0 },
					{ prop: 'startTime', op: '<', val: win1 }] } }, 10000)
			.catch(function () { return null; })
		: Promise.resolve(null);

	return Promise.all([pCh, pPr]).then(function (r) {
		var chRes = r[0] && r[0].results, prRes = r[1] && r[1].results;
		if (!chRes || !chRes.length) return false;

		var list = chRes.map(function (c, idx) {
			var num = pick(c, ['channelNumber', 'channelNum', 'number', 'lcn', 'major']);
			var name = pick(c, ['channelName', 'name', 'title', 'callsign']);
			if (!name && num != null) name = 'Canale ' + num;
			if (!name) name = 'Canale';
			return { num: String(num == null ? idx + 1 : num), name: String(name),
				 progs: [], id: pick(c, ['_id', 'channelId', 'id', 'guideId']) };
		});

		if (prRes && prRes.length) {
			var byCh = {};
			prRes.forEach(function (p) {
				var title = pick(p, ['title', 'programName', 'name', 'eventTitle']);
				var st = toMs(pick(p, ['startTime', 'start', 'beginTime', 'startDateTime']));
				var dur = toMs(pick(p, ['duration', 'durationMs']));
				if (dur == null) {
					var et = toMs(pick(p, ['endTime', 'end', 'endDateTime']));
					if (et != null && st != null) dur = et - st;
				}
				if (!title || st == null) return;
				if (dur == null || dur <= 0) dur = 30 * 60000;
				var pid = pick(p, ['channelId', 'channel', 'channelRef', 'guideId']);
				var key = pid != null ? String(pid) : '0';
				(byCh[key] = byCh[key] || []).push({
					title: String(title), start: st, end: st + dur,
					desc: String(pick(p, ['description', 'shortDesc', 'synopsis', 'longDesc']) || '')
				});
			});
			list.forEach(function (c) {
				var k = null;
				if (c.id != null && byCh[String(c.id)]) k = String(c.id);
				if (!k && byCh[c.num]) k = c.num;
				if (!k) { // match per nome canale se presente nel programma
					Object.keys(byCh).forEach(function (bk) { if (k) return; });
					for (var bk in byCh) {
						var cand = byCh[bk][0] && byCh[bk][0].chName;
					}
				}
				c.progs = (k ? byCh[k] : []).sort(function (a, b) { return a.start - b.start; });
			});
		}

		channels = list;
		hasEpg = channels.some(function (c) { return c.progs.length > 0; });
		return hasEpg;
	});
}

function loadFallback() {
	channels = FALLBACK_CHANNELS.map(function (c) {
		var o = { progs: [] };
		for (var k in c) o[k] = c[k];
		return o;
	});
	hasEpg = false;
	fCh = Math.min(fCh, channels.length - 1);
	return Promise.resolve(false);
}

/* ---------------- EPG online: fonti dirette Rai / Mediaset / Sky / Aurora ---------------- */
function httpGet(url, timeoutMs) {
	timeoutMs = timeoutMs || 15000;
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = timeoutMs;
		xhr.onload = function () {
			// file:// (cache/ locale dell'app) risponde status 0: senza questo la cache non veniva mai letta (Sky = solo cache)
			if ((xhr.status >= 200 && xhr.status < 400) || (xhr.status === 0 && xhr.responseText)) resolve(xhr.responseText);
			else reject(new Error('HTTP ' + xhr.status));
		};
		xhr.onerror = function () { reject(new Error('XHR err(' + xhr.status + ')')); };
		xhr.ontimeout = function () { reject(new Error('timeout')); };
		try { xhr.send(null); } catch (e) { reject(new Error('exc ' + String(e && e.message || e).slice(0, 40))); }
	});
}

// "gg-mm-aaaa" come vuole Rai
function raiDay(d) {
	return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear();
}

function hmsToMs(hour, dateStr) {
	// hour "HH:MM" + date "gg/mm/aaaa" (Rai) o Data locale (Mediaset)
	if (!hour) return null;
	var y = null, mo = null, dd = null;
	if (dateStr) {
		var mDate = /(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(dateStr);
		if (mDate) { dd = +mDate[1]; mo = +mDate[2] - 1; y = +mDate[3]; }
	}
	var tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(hour);
	if (!tm) return null;
	if (y == null) {
		var now = new Date();
		y = now.getFullYear(); mo = now.getMonth(); dd = now.getDate();
	}
	var ms = new Date(y, mo, dd, +tm[1], +tm[2]).getTime();
	return isNaN(ms) ? null : ms;
}

function durToMs(dur, durMin) {
	if (durMin) { var m = /(\d+)/.exec(durMin); if (m) return +m[1] * 60000; }
	if (dur) { var t = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(dur); if (t) return (+t[1] * 3600 + +t[2] * 60 + +t[3]) * 1000; }
	return 30 * 60000;
}

function loadRaiChannel(chan) {
	var days = [new Date(), new Date(Date.now() + 86400000)];
	return Promise.all(days.map(function (d, di) {
		var url = RAI_PALINSESTO + chan.id + '/' + raiDay(d) + '.json';
		var cacheUrl = 'cache/' + chan.id + '-' + raiDay(d) + '.json';
		return httpGet(cacheUrl, 6000)
			.catch(function () { return httpGet(url); })
			.then(function (txt) {
				var j = JSON.parse(txt);
				if (di === 0) chan.cacheOk = true;
				return (j && j.events) || [];
			})
			.catch(function (e) { if (di === 0) chan.netErr = String(e && e.message || e).slice(0, 30); return []; });
	})).then(function (parts) {
		var evs = parts[0].concat(parts[1]);
		chan.progs = evs.map(function (e) {
			var st = hmsToMs(e.hour, e.date);
			if (st == null) return null;
			var dur = durToMs(e.duration, e.duration_in_minutes);
			var name = String(e.name || '');
			// edizioni regionali nel palinsesto Rai 3: "TG Regione", "TG Regione Meteo", "TGR Buongiorno Regione"
			var tgr = chan.tgr && /^TGR?\b.*\bRegione\b/i.test(name) ? name : '';
			return { title: tgr ? tgrTitle(tgr) : name, tgr: tgr, start: st, end: st + dur,
				desc: String(e.description || ''), ep: String(e.episode_title || ''),
				img: e.image ? String(e.image) : '',
				prog: e.program && e.program.name ? String(e.program.name) : '' };
		}).filter(Boolean).sort(function (a, b) { return a.start - b.start; });
		return chan.progs.length;
	});
}

// Promise condivisa (un download+parse per tutti i canali della fonte), scade dopo SHARED_TTL
var shared = {};
function sharedGet(key, fn, ttl) {
	var s = shared[key];
	if (!s || Date.now() - s.t > (ttl || SHARED_TTL)) {
		s = shared[key] = { t: Date.now(), p: fn() };
		s.p.catch(function () { if (shared[key] === s) delete shared[key]; });
	}
	return s.p;
}

function loadMediasetChannel(chan) {
	return sharedGet('mediaset', function () {
		return httpGet(MEDIASET_GUIDA, 25000).then(parseMediaset);
	}).then(function (map) {
		chan.progs = map[chan.id] || [];
		return chan.progs.length;
	});
}

// Sky: CORS bloccato -> solo file scritto da epg_offline.sh (finestra 49 h da mezzanotte, multi-canale);
// file di ieri come riserva (copre anche oggi).
function loadSkyChannel(chan) {
	return sharedGet('sky', function () {
		return httpGet('cache/sky-dtt-' + raiDay(new Date()) + '.json', 6000)
			.catch(function () { return httpGet('cache/sky-dtt-' + raiDay(new Date(Date.now() - 86400000)) + '.json', 6000); })
			.then(parseSky);
	}, SKY_TTL).then(function (map) {   // 1,2 MB: parse una volta, mappa tenuta in memoria (il file copre 49 h)
		chan.progs = map[chan.id] || [];
		return chan.progs.length;
	});
}

// Aurora: 1 richiesta = 7 giorni; cache localStorage (programmi già parsati) con TTL 1 h
function loadAuroraChannel(chan) {
	var key = 'nusguide.aurora.' + chan.id, cached = null;
	try { cached = JSON.parse(localStorage.getItem(key)); } catch (e) {}
	function use(progs) { chan.progs = progs; return progs.length; }
	if (cached && cached.p && Date.now() - cached.t < AURORA_TTL) return Promise.resolve(use(cached.p));
	var url = AURORA_PAGE + (chan.page || 'guida-tv') + '/?include=default&filter%5Benvironment%5D=' + chan.id + '&v=2';
	return httpGet(url, 20000).then(function (txt) {
		var cut = Date.now() - 6 * 3600000;
		var progs = parseAurora(txt).filter(function (p) { return p.end > cut; });
		try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), p: progs })); } catch (e) {}
		return use(progs);
	}).catch(function (e) {
		if (cached && cached.p) return use(cached.p);   // rete giù: meglio dati vecchi che niente
		throw e;
	});
}

// fonte -> loader(chan): Promise<numero programmi>. Nuova fonte = nuova voce qui.
var LOADERS = { rai: loadRaiChannel, mediaset: loadMediasetChannel, sky: loadSkyChannel, aurora: loadAuroraChannel };

function tgrTitle(name) {
	return name.replace(/^TG Regione/i, 'TGR ' + region).replace(/\bRegione\b/i, region);
}
function applyRegion() {
	channels.forEach(function (c) {
		c.progs.forEach(function (p) { if (p.tgr) p.title = tgrTitle(p.tgr); });
	});
}

/* ping diagnostico: manda lo stato al PC (log http.server) */
function pingTo(tag) {
	var x = new XMLHttpRequest();
	x.open('POST', 'http://192.168.188.81:8081/dbg/' + encodeURIComponent(tag), true);
	try { x.send('1'); } catch (e) {}
}

// Caricamento lazy: solo i canali visibili (pagina "In onda ora" + righe griglia), alla prima comparsa.
// c.ld: falsy = da caricare, altrimenti Promise del caricamento (in corso o fatto). Il refresh azzera c.ld e ricarica solo quelli visibili.
var loadErrs = [], redrawT = null;
function loadChannels(from, to) {
	var jobs = [];
	for (var i = Math.max(0, from); i < Math.min(channels.length, to); i++) {
		(function (c) {
			var fn = LOADERS[c.src];
			if (!fn || !c.id) return;
			if (!c.ld) c.ld = fn(c).catch(function (e) {
				var m = String(e && e.message || e).slice(0, 60);
				loadErrs.push(c.name.slice(0, 8) + ':' + m);
				pingTo(c.name + '|ERR|' + m);
				return 0;
			}).then(function (n) {
				if (n) { hasEpg = true; scheduleRedraw(); }
				return n;
			});
			jobs.push(c.ld);   // anche quelli già in corso: chi aspetta (boot) vede il totale vero
		})(channels[i]);
	}
	return Promise.all(jobs).then(function (counts) {
		return counts.reduce(function (a, b) { return a + b; }, 0);
	});
}
function scheduleRedraw() {   // più canali che arrivano insieme -> un solo render
	if (redrawT) return;
	redrawT = setTimeout(function () { redrawT = null; if (!detailOpen) render(true); }, 80);
}
function loadVisible() {
	var first = Math.floor(fCh / NSTRIP) * NSTRIP, vr = visibleRows();
	return loadChannels(Math.min(first, topRow), Math.max(first + NSTRIP, topRow + vr));
}

function boot() {
	$('sourcehint').textContent = 'Ricerca EPG interno…';
	return discover()
		.then(loadFromEpg)
		.catch(function () { return false; })
		.then(function (ok) {
			if (ok) {
				$('sourcehint').textContent = 'EPG della TV · ' + channels.length + ' canali';
				jumpNow();
				return;
			}
			loadFallback();
			$('sourcehint').textContent = 'EPG online · ' + channels.length + ' canali…';
			jumpNow();   // griglia subito; jumpNow -> render -> loadVisible()
			return loadVisible().then(function (tot) {
				$('sourcehint').textContent = tot
					? 'EPG online · ' + channels.length + ' canali'
					: 'No EPG · ' + loadErrs.slice(0, 3).join(' ~ ');
				pingTo('TOT=' + tot + '|' + loadErrs.join(' ~ '));
			});
		});
}

/* ---------------- Render ---------------- */
function floor30(ms) { return Math.floor(ms / MSLOT) * MSLOT; }
function fmtDur(ms) {
	var m = Math.round(ms / 60000), h = Math.floor(m / 60);
	return h ? h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min';
}
function pct(p, now) { return Math.max(0, Math.min(100, (now - p.start) / (p.end - p.start) * 100)); }
function isLive(p, now) { return p.start <= now && now < p.end; }
function imgUrl(p, w) {
	if (!p || !p.img) return '';
	if (/^https?:/.test(p.img)) return p.sized ? p.img + '&w=' + w + '&h=' + Math.round(w * 9 / 16) : p.img;   // Sky: resize lato server
	return RAI_IMG + w + 'x-' + p.img;
}

// logo canale: SVG locale generato (numero + nome + colore brand), niente loghi protetti
function logoSvg(c, idx) {
	var col = c.color || tileColor(idx);
	var id = 'lg' + String(c.num).replace(/\W/g, '');
	return '<svg viewBox="0 0 160 90" width="160" height="90" preserveAspectRatio="xMidYMid slice">'
		+ '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">'
		+ '<stop offset="0" stop-color="' + col + '"/><stop offset="1" stop-color="' + col + '" stop-opacity=".55"/>'
		+ '</linearGradient></defs>'
		+ '<rect width="160" height="90" fill="#111827"/><rect width="160" height="90" fill="url(#' + id + ')"/>'
		+ '<circle cx="150" cy="-10" r="70" fill="#fff" fill-opacity=".08"/>'
		+ '<text x="12" y="28" fill="#fff" font-size="20" font-weight="700" font-family="sans-serif">' + esc(c.name) + '</text>'
		+ '<text x="150" y="82" fill="#fff" text-anchor="end" font-size="54" font-weight="800" font-family="sans-serif">' + esc(c.num) + '</text>'
		+ '</svg>';
}

function progAt(c, t) {
	if (!c || !c.progs.length) return -1;
	for (var i = 0; i < c.progs.length; i++) {
		if (c.progs[i].start <= t && t < c.progs[i].end) return i;
		if (c.progs[i].start > t) return i;   // buco: primo successivo
	}
	return c.progs.length - 1;
}
function focusedProgram() {
	var c = channels[fCh], i = progAt(c, fTime);
	return i < 0 ? null : c.progs[i];
}

function visibleRows() { return Math.max(1, Math.floor(($('gridbody').clientHeight - 8) / ROW_H)); }
function gridMin() { return Math.max(60, ($('gridbody').clientWidth - LOGO_W) / PX_PER_MIN); }

// porta in vista il programma focus (sposta la finestra solo se esce)
function ensureVisible() {
	var p = focusedProgram(); if (!p) return;
	var vis = gridMin() * 60000;
	if (p.end <= viewStart + 10 * 60000 || p.start >= viewStart + vis - 30 * 60000) {
		viewStart = floor30(Math.max(p.start, fTime)) - MSLOT;
	}
	var vr = visibleRows();
	if (fCh < topRow) topRow = fCh;
	if (fCh >= topRow + vr) topRow = fCh - vr + 1;
}

// full=true: ricostruisce strip+griglia (tick 30 s, nuovi dati, chiusura dettaglio).
// Al solo cambio focus si ricostruisce solo se cambia finestra/riga/pagina strip;
// altrimenti si spostano solo le classi .focused (niente innerHTML della griglia).
var gridKey = '', focusEls = [];
function render(full) {
	renderHero();
	var key = viewStart + '|' + topRow + '|' + visibleRows() + '|' + Math.floor(fCh / NSTRIP);
	if (full || key !== gridKey) {
		gridKey = key;
		renderNowStrip();
		renderTimeHead();
		renderRows();
		loadVisible();   // lazy: carica i canali appena entrati in vista
	}
	markFocus();
}
function markFocus() {
	for (var i = 0; i < focusEls.length; i++) focusEls[i].classList.remove('focused');
	var c = channels[fCh], k = progAt(c, fTime), body = $('gridbody');
	focusEls = [
		$('nowstrip').querySelector('.ncard[data-ch="' + fCh + '"]'),
		body.querySelector('.chlogo[data-ch="' + fCh + '"]'),
		body.querySelector(k >= 0 ? '.prog[data-ch="' + fCh + '"][data-pi="' + k + '"]' : '.prog.na[data-ch="' + fCh + '"]')
	].filter(Boolean);
	for (var j = 0; j < focusEls.length; j++) focusEls[j].classList.add('focused');
}

function renderHero() {
	var c = channels[fCh], p = focusedProgram(), now = Date.now();
	if (!c) return;
	var chips = '<span class="chip svg">' + logoSvg(c, fCh).replace('width="160" height="90"', 'width="64" height="36"') + '</span>';
	if (p && isLive(p, now)) chips += '<span class="chip live">● IN ONDA</span>';
	else if (p && p.start > now) chips += '<span class="chip">' + (sameDay(p.start, now) ? 'OGGI' : GSHORT[new Date(p.start).getDay()].toUpperCase()) + ' ' + hhmm(p.start) + '</span>';
	else if (p) chips += '<span class="chip">TERMINATO</span>';
	if (p && p.prog && p.prog !== p.title) chips += '<span class="chip">' + esc(p.prog) + '</span>';
	$('hchips').innerHTML = chips;
	$('htitle').textContent = p ? p.title : c.name;
	$('hmeta').textContent = p
		? hhmm(p.start) + ' – ' + hhmm(p.end) + '  ·  ' + fmtDur(p.end - p.start) + (p.ep ? '  ·  ' + p.ep : '')
		: 'Guida programmi non disponibile per questo canale';
	var live = p && isLive(p, now);
	$('hprog').style.display = live ? '' : 'none';
	if (live) $('hprog').firstChild.style.width = pct(p, now) + '%';
	$('hdesc').textContent = p ? (p.desc || (live ? 'Mancano ' + fmtDur(p.end - now) + ' alla fine.' : '')) : '';
	setImage($('himg'), c, p, 480);
	setBg(imgUrl(p, 32));   // 32 px scalata a schermo intero = sfocatura "gratis", niente filter: blur
}

function sameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }

// riquadro immagine: logo canale sotto, foto programma sopra (se carica)
function setImage(box, c, p, w) {
	var url = imgUrl(p, w);
	if (box._url === url && box.firstChild) return;
	box._url = url;
	box.innerHTML = logoSvg(c, fCh);
	clearTimeout(box._t);
	if (!url) return;
	box._t = setTimeout(function () {   // debounce: niente download/decodifica a ogni tasto
		if (box._url !== url) return;
		var img = new Image();
		img.onload = function () { if (box._url === url) box.appendChild(img); };
		img.src = url;
	}, 200);
}

var bgTimer = null, bgUrl = '';
function setBg(url) {
	if (url === bgUrl) return;
	bgUrl = url;
	clearTimeout(bgTimer);
	bgTimer = setTimeout(function () {   // debounce: niente download a ogni tasto
		var bg = $('bg');
		if (!url) { bg.classList.remove('on'); return; }
		var im = new Image();
		im.onload = function () { if (bgUrl !== url) return; bg.style.backgroundImage = 'url("' + url + '")'; bg.classList.add('on'); };
		im.onerror = function () { bg.classList.remove('on'); };
		im.src = url;
	}, 350);
}

function renderNowStrip() {
	var now = Date.now(), first = Math.floor(fCh / NSTRIP) * NSTRIP, html = '';
	for (var i = first; i < Math.min(channels.length, first + NSTRIP); i++) {
		var c = channels[i], k = progAt(c, now), p = k >= 0 ? c.progs[k] : null;
		if (p && !isLive(p, now)) { p = null; k = k - 1; }
		var nx = c.progs[k + 1] && c.progs[k + 1].start >= now - 60000 ? c.progs[k + 1] : null;
		html += '<div class="ncard' + (p ? '' : ' empty') + '" data-ch="' + i + '">'
			+ '<div class="top">' + logoSvg(c, i).replace('width="160" height="90"', 'width="64" height="36"')
			+ '<span>' + (p ? 'ancora ' + fmtDur(p.end - now) : '') + '</span></div>'
			+ '<div class="t">' + (p ? esc(p.title) : 'Guida non disponibile') + '</div>'
			+ (p ? '<div class="bar"><i style="width:' + pct(p, now) + '%"></i></div>' : '')
			+ '<div class="n">' + (nx ? 'Poi <b>' + hhmm(nx.start) + '</b> ' + esc(nx.title) : '&nbsp;') + '</div>'
			+ '</div>';
	}
	$('nowstrip').innerHTML = html;
}

function renderTimeHead() {
	var head = $('timehead'), now = Date.now(), vis = gridMin(), html = '';
	for (var m = 0; m < vis; m += 30) {
		var t = viewStart + m * 60000, d = new Date(t);
		var tag = (d.getHours() === 0 && d.getMinutes() === 0) || m === 0 && !sameDay(t, now)
			? '<b>' + GSHORT[d.getDay()] + '</b>' : '';
		html += '<div class="tl" style="left:' + (LOGO_W + m * PX_PER_MIN) + 'px">' + tag + hhmm(t) + '</div>';
	}
	var x = (now - viewStart) / 60000 * PX_PER_MIN;
	if (x >= 0 && x < vis * PX_PER_MIN) {
		html += '<div class="nowlbl" style="left:' + (LOGO_W + x) + 'px">' + hhmm(now) + '</div>';
	}
	head.innerHTML = html;
}

function renderRows() {
	var body = $('gridbody'), now = Date.now(), vis = gridMin() * 60000;
	var vEnd = viewStart + vis;
	var end = Math.min(channels.length, topRow + visibleRows()), html = '';
	for (var i = topRow; i < end; i++) {
		var c = channels[i];
		html += '<div class="chrow"><div class="chlogo" data-ch="' + i + '">'
			+ logoSvg(c, i) + '</div><div class="progrow">';
		var any = false;
		for (var k = 0; k < c.progs.length; k++) {
			var p = c.progs[k];
			if (p.end <= viewStart || p.start >= vEnd) continue;
			any = true;
			var s = Math.max(p.start, viewStart), e = Math.min(p.end, vEnd);
			var cls = 'prog' + (isLive(p, now) ? ' live' : p.end <= now ? ' past' : '');
			html += '<div class="' + cls + '" data-ch="' + i + '" data-pi="' + k + '" style="left:'
				+ ((s - viewStart) / 60000 * PX_PER_MIN) + 'px;width:' + Math.max(6, (e - s) / 60000 * PX_PER_MIN - 6) + 'px">'
				+ '<div class="t">' + esc(p.title) + '</div><div class="s">' + hhmm(p.start) + ' – ' + hhmm(p.end) + '</div>'
				+ (isLive(p, now) ? '<div class="el" style="width:' + pct(p, now) + '%"></div>' : '')
				+ '</div>';
		}
		if (!any) html += '<div class="prog na" data-ch="' + i + '"><div class="t">Guida non disponibile</div></div>';
		html += '</div></div>';
	}
	var x = (now - viewStart) / 60000 * PX_PER_MIN;
	if (x >= 0 && now < vEnd) html += '<div class="nowline" style="left:' + (LOGO_W + x) + 'px"></div>';
	body.innerHTML = html;
}

/* ---------------- Dettaglio ---------------- */
function openDetail() {
	var c = channels[fCh], p = focusedProgram(), now = Date.now();
	if (!c) return;
	$('dchips').innerHTML = $('hchips').innerHTML;
	$('dtitle').textContent = p ? p.title : c.name;
	$('dtime').textContent = p
		? GIORNI[new Date(p.start).getDay()] + ' ' + hhmm(p.start) + ' – ' + hhmm(p.end) + '  ·  ' + fmtDur(p.end - p.start)
		: 'Guida programmi non disponibile per questo canale';
	var live = p && isLive(p, now);
	$('dprog').style.display = live ? '' : 'none';
	if (live) $('dprog').firstChild.style.width = pct(p, now) + '%';
	$('ddesc').textContent = (p && p.tgr ? 'Edizione regionale: TGR ' + region + ' (cambia da Impostazioni, in alto a destra)\n\n' : '')
		+ (p && p.ep ? p.ep + '\n\n' : '') + (p && p.desc ? p.desc
		: c.src === 'rai' ? 'Nessuna descrizione disponibile.'
		: 'Nessuna descrizione disponibile per questo programma.');
	setImage($('dimg'), c, p, 800);
	$('dwatch').classList.toggle('hidden', !(live || !p));   // "Guarda ora": in onda (o canale senza guida)
	$('dremind').classList.toggle('hidden', !(p && p.start > now && window.Reminders));   // promemoria: solo programmi futuri
	$('detail').classList.remove('hidden');
	detailOpen = true;
	pickT = Date.now();
}
function closeDetail() {
	$('detail').classList.add('hidden');
	detailOpen = false;
	render(true);
}

/* ---------------- Impostazioni (regione TGR) ---------------- */
var setOpen = false, setIdx = 0, headFocus = false, SET_COLS = 4;
function setHeadFocus(on) { headFocus = on; $('btnset').classList.toggle('focused', on); }
function openSettings() {
	setHeadFocus(false);
	var html = '';
	for (var i = 0; i < REGIONI.length; i++) {
		html += '<div class="reg' + (REGIONI[i] === region ? ' sel' : '') + '" data-reg="' + i + '">' + esc(REGIONI[i]) + '</div>';
	}
	$('reglist').innerHTML = html;
	setIdx = Math.max(0, REGIONI.indexOf(region));
	markReg();
	$('settings').classList.remove('hidden');
	setOpen = true;
}
function closeSettings() { $('settings').classList.add('hidden'); setOpen = false; }
function markReg() {
	var els = $('reglist').children;
	for (var i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === setIdx);
}
function moveReg(d) { setIdx = Math.max(0, Math.min(REGIONI.length - 1, setIdx + d)); markReg(); }
function chooseRegion(i) {
	region = REGIONI[i];
	try { localStorage.setItem('nusguide.region', region); } catch (e) {}
	applyRegion();
	closeSettings();
	render(true);
}

/* ---------------- Navigazione ---------------- */
var atNow = true;               // focus agganciato all'ora corrente (segue il tempo)
function jumpNow() {
	fTime = Date.now(); atNow = true;
	viewStart = floor30(fTime) - MSLOT;
	ensureVisible(); render(true);
}
function moveChannel(d) {
	fCh = Math.max(0, Math.min(channels.length - 1, fCh + d));
	ensureVisible(); render();
}
function moveProg(d) {
	var c = channels[fCh], i = progAt(c, fTime);
	if (i < 0) return;
	var j = Math.max(0, Math.min(c.progs.length - 1, i + d)), p = c.progs[j], now = Date.now();
	fTime = isLive(p, now) ? now : p.start;   // sul programma in onda il focus resta "adesso"
	atNow = fTime === now;
	ensureVisible(); render();
}
function focusAt(ch, t) { fCh = ch; fTime = t; atNow = Math.abs(t - Date.now()) < 1000; ensureVisible(); render(); }

/* ---------------- Input Magic Remote (pointer) + tastiera ---------------- */
// throttle navigazione (tasti tenuti premuti / rotella): max 1 passo ogni 120 ms
var lastNav = 0;
function navOk() { var t = Date.now(); if (t - lastNav < 120) return false; lastNav = t; return true; }

function hitId(el, id) { for (; el && el.nodeType === 1; el = el.parentNode) if (el.id === id) return true; return false; }
document.addEventListener('click', function (e) {
	if (detailOpen) {   // 2o click entro DBL_MS dall'apertura = doppio click sul programma -> canale in diretta
		e.preventDefault();
		var watch = Date.now() - pickT < DBL_MS || hitId(e.target, 'dwatch');
		if (!watch && hitId(e.target, 'dremind')) { remindFocused(); return; }
		closeDetail();
		if (watch) watchCh(fCh);
		return;
	}
	var el = e.target;
	if (setOpen) {
		while (el && el.nodeType === 1 && el.id !== 'settings') {
			if (el.dataset && el.dataset.reg != null) { chooseRegion(+el.dataset.reg); return; }
			if (el.id === 'setclose') break;
			el = el.parentNode;
		}
		if (!el || el.id !== 'settings') closeSettings();
		return;
	}
	setHeadFocus(false);
	while (el && el.nodeType === 1) {
		var ds = el.dataset || {};
		if (el.id === 'btnnow') { jumpNow(); return; }
		if (el.id === 'btnset') { openSettings(); return; }
		if (el.id === 'hero') { openDetail(); return; }
		if (ds.pi != null) {
			var p = channels[+ds.ch].progs[+ds.pi], now = Date.now();
			focusAt(+ds.ch, isLive(p, now) ? now : p.start); openDetail(); return;
		}
		if (ds.ch != null) {
			if (el.classList.contains('ncard')) { focusAt(+ds.ch, Date.now()); openDetail(); }
			else focusAt(+ds.ch, fTime);
			return;
		}
		el = el.parentNode;
	}
});
document.addEventListener('wheel', function (e) {
	e.preventDefault();
	if (!navOk()) return;
	if (detailOpen) { closeDetail(); return; }
	var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
	if (setOpen) { moveReg(d > 0 ? 1 : -1); return; }
	if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) moveProg(d > 0 ? 1 : -1);
	else moveChannel(d > 0 ? 1 : -1);
}, { passive: false });

document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	if (k >= 37 && k <= 40 && !navOk()) { e.preventDefault(); return; }
	if (detailOpen) {
		if (k === 13 && !$('dwatch').classList.contains('hidden')) { closeDetail(); watchCh(fCh); e.preventDefault(); }
		else if (k === 461 || k === 8 || k === 27 || k === 13) { closeDetail(); e.preventDefault(); }
		return;
	}
	if (setOpen) {
		if (k === 37) moveReg(-1);
		else if (k === 39) moveReg(1);
		else if (k === 38) moveReg(-SET_COLS);
		else if (k === 40) moveReg(SET_COLS);
		else if (k === 13) chooseRegion(setIdx);
		else if (k === 461 || k === 8 || k === 27) closeSettings();
		else return;
		e.preventDefault();
		return;
	}
	if (headFocus) {   // focus sul pulsante ⚙ nell'header
		if (k === 13) openSettings();
		else if (k === 40 || k === 461 || k === 8 || k === 27) setHeadFocus(false);
		else if (k !== 37 && k !== 38 && k !== 39) return;
		e.preventDefault();
		return;
	}
	if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
	switch (k) {
		case 38:                                  // ↑ canale prec. (dal primo: pulsante ⚙)
			if (fCh === 0) setHeadFocus(true); else moveChannel(-1);
			break;
		case 40: moveChannel(1); break;           // ↓ canale succ.
		case 37: moveProg(-1); break;             // ← programma prec.
		case 39: moveProg(1); break;              // → programma succ.
		case 13: openDetail(); break;             // OK
		case 461: case 8: case 27:                // Back: prima torna ad adesso, poi esce
			if (!atNow) { jumpNow(); break; }
			window.history.length > 1 ? window.history.back()
				: window.close && window.close();
			break;
		default: return;
	}
	e.preventDefault();
});

/* ---------------- Orologio + refresh ---------------- */
function tickClock() {
	var d = new Date();
	$('clock').textContent = hhmm(d.getTime());
	$('date').textContent = GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
	if (atNow) fTime = d.getTime();
	if (channels.length && !detailOpen) render(true);   // avanza barre + linea adesso
}
setInterval(tickClock, 30 * 1000);

function refreshEpg() {
	if (channels.length && channels[0].src) {   // modalità online: ricarica (lazy) solo i visibili
		channels.forEach(function (c) { c.ld = 0; });
		loadVisible();
	} else if (channelsKind && programsKind) {
		loadFromEpg().then(function (ok) { if (ok) render(true); }).catch(function () {});
	}
}
setInterval(refreshEpg, 10 * 60 * 1000);

/* ---------------- Live TV: cambio canale ---------------- */
// apiadapter = backend luna di ssap://tv/getChannelList|openChannel (testato da root 31/10/2026: openChannel porta
// in primo piano com.webos.app.livetv sul canale). Gruppi system.remote/secondscreen: la web app dev di norma non li ha
// -> fallback root via Homebrew Channel exec (come Hearth).
var TV_API = 'luna://com.webos.service.apiadapter/tv/';
var HB_EXEC = 'luna://org.webosbrew.hbchannel.service/exec';
var TVCH_KEY = 'nusguide.tvch', TVCH_TTL = 24 * 3600000, DBL_MS = 350;
var pickT = 0, tvMap = null, tuning = false, toastT = null;

function hbExec(cmd, ms) {
	return lunaCall(HB_EXEC, { command: cmd }, ms || 15000).then(function (r) { return r.stdoutString || ''; });
}
function normName(s) { return String(s || '').toLowerCase().replace(/\bhd\b/g, '').replace(/[^a-z0-9]/g, ''); }
// [{channelNumber, channelName, channelModeId, Radio, channelId}] -> {lcn: {id, nm, mode}}: DTT (mode 0) prima del satellite, niente radio
function buildTvMap(list) {
	var m = {};
	list.forEach(function (c) {
		if (!c.channelNumber || !c.channelId || c.Radio) return;
		var o = m[c.channelNumber];
		if (!o || (o.mode !== 0 && c.channelModeId === 0))
			m[c.channelNumber] = { id: c.channelId, nm: normName(c.channelName), mode: c.channelModeId };
	});
	return m;
}
// output di grep -o (una chiave per riga, channelNumber apre ogni canale): lista intera ~790 KB, filtrata ~63 KB
function parseGrepList(out) {
	var list = [], cur = null;
	out.split('\n').forEach(function (ln) {
		var m = /^"(\w+)":"?([^"]*)"?$/.exec(ln.trim());
		if (!m) return;
		if (m[1] === 'channelNumber') list.push(cur = {});
		if (cur) cur[m[1]] = m[1] === 'channelModeId' ? +m[2] : m[1] === 'Radio' ? m[2] === 'true' : m[2];
	});
	return list;
}
function getTvMap(force) {
	if (!force && tvMap) return Promise.resolve(tvMap);
	if (!force) {
		try { var c = JSON.parse(localStorage.getItem(TVCH_KEY)); if (c && c.m && Date.now() - c.t < TVCH_TTL) return Promise.resolve(tvMap = c.m); } catch (e) {}
	}
	return lunaCall(TV_API + 'getChannelList', {}, 8000)
		.then(function (r) { return r.channelList || []; })
		.catch(function () {
			return hbExec('luna-send -n 1 ' + TV_API + "getChannelList '{}' | grep -o '\"channelNumber\":\"[^\"]*\"\\|\"channelName\":\"[^\"]*\"\\|\"channelModeId\":[0-9]*\\|\"Radio\":[a-z]*\\|\"channelId\":\"[^\"]*\"'", 20000).then(parseGrepList);
		})
		.then(function (list) {
			var m = buildTvMap(list);
			if (!Object.keys(m).length) throw new Error('lista canali TV vuota');
			tvMap = m;
			try { localStorage.setItem(TVCH_KEY, JSON.stringify({ t: Date.now(), m: m })); } catch (e) {}
			return m;
		});
}
function findTv(m, lcn, name) {   // per numero LCN, poi per nome normalizzato
	if (m[lcn]) return m[lcn];
	var n = normName(name);
	for (var k in m) if (n && m[k].nm === n) return m[k];
	return null;
}
function toast(msg, ms) {
	var t = $('toast');
	t.textContent = msg; t.classList.remove('hidden');
	clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, ms || 8000);
}
// Cambia canale Live TV al numero LCN (name = fallback per nome). Promise<bool>; errore -> messaggio in-app.
function tuneTo(lcn, name) {
	lcn = String(lcn);
	if (tuning) return Promise.resolve(false);
	tuning = true;
	toast('Sintonizzo ' + (name || 'canale ' + lcn) + '…');
	function find(force) { return getTvMap(force).then(function (m) { return findTv(m, lcn, name); }); }
	return find(false)
		.then(function (ch) { return ch || find(true); })   // lista in cache vecchia: riletta una volta
		.then(function (ch) {
			if (!ch || !/^[\w.-]+$/.test(ch.id)) throw new Error('canale ' + lcn + ' non trovato sulla TV');
			return lunaCall(TV_API + 'openChannel', { channelId: ch.id }, 8000).catch(function () {
				return hbExec('luna-send -n 1 ' + TV_API + "openChannel '{\"channelId\":\"" + ch.id + "\"}'").then(function (out) {
					if (out.indexOf('"returnValue":true') < 0) throw new Error(out.slice(0, 60) || 'openChannel senza risposta');
				});
			});
		})
		.then(function () { tuning = false; $('toast').classList.add('hidden'); return true; },
			function (e) {
				tuning = false;
				toast('Impossibile cambiare canale: ' + String(e && e.message || e).slice(0, 80), 6000);
				return false;
			});
}
function watchCh(i) { var c = channels[i]; if (c) tuneTo(c.num, c.name); }

// Lancio con params {"extra":"lcn:<n>"} (anche promemoria: {"reminder":...,"extra":"lcn:<n>"}) -> cambio canale subito
function handleLaunch(p) {
	if (typeof p === 'string') { try { p = JSON.parse(p || '{}'); } catch (e) { p = null; } }
	if (p && p.reminderAction) return;   // snooze/annulla dalla notifica: li gestisce reminders-client.js
	var m = p && /^lcn:(\d+)$/.exec(String(p.extra || ''));
	if (!m) return;
	var c = FALLBACK_CHANNELS.filter(function (x) { return x.num === m[1]; })[0];
	tuneTo(m[1], c && c.name);
}
document.addEventListener('webOSRelaunch', function (e) { handleLaunch(e.detail || (window.PalmSystem && window.PalmSystem.launchParams)); });

// "Ricordamelo": demone condiviso /media/developer/reminders (D:\tv\reminders); alla notifica rilancia l'app con extra lcn:<n>
function remindFocused() {
	var c = channels[fCh], p = focusedProgram();
	if (!c || !p || !window.Reminders) return;
	Reminders.add(p.start / 1000, 'ng' + c.num + '_' + Math.floor(p.start / 1000), 'org.nusguide.app',
		c.name + ': ' + p.title, 'lcn:' + c.num).then(function () {
		toast('Promemoria impostato: ' + p.title + ' (' + hhmm(p.start) + ', ' + c.name + ')', 4000);
		$('dremind').classList.add('hidden');
	}, function (e) {
		toast('Promemoria non impostato: ' + String(e && e.message || e).slice(0, 80), 6000);
	});
}

/* ---------------- Avvio ---------------- */
if (window.Reminders && Reminders.handleLaunch('org.nusguide.app')) return;   // azione da notifica: esegue e chiude l'app
handleLaunch(window.PalmSystem && window.PalmSystem.launchParams);
tickClock();
boot();

})();
