/* NusStream 0.4.4 — Netflix TV 2025 Edition — org.nusstream.app
 * Vanilla JS ES5, target webOS 5.x / Chromium 79.
 * Novità 0.4.1:
 *   - Fix Glitches & Stutter: Web Worker HLS abilitato per demuxing multithread + buffer controllato
 *   - Dati Video Reali: Risoluzione reale rilevata dal flusso (4K / 1080p FHD / 720p HD / SD), bitrate effettivo, codec H.264/H.265
 *   - Selettore Audio & Sottotitoli: Pannello rapido per cambiare traccia lingua (es. Italiano, Inglese) e sottotitoli (Forced, Completi, Disattivati)
 *   - Rimossi badge fittizi: Solo metadati autentici estratti dall'HLS master playlist
 *   - Navigation Rail laterale espandibile Netflix 2025
 *   - Ricerca TV con tastiera QWERTY integrata
 *   - Watchlist persistente e In-Player Drawer episodi
 */
(function () {
'use strict';

/* ---------------- Config ---------------- */
var SEEDS = [
	'https://streamingcommunityz.dad',
	'https://streamingcommunityz.store',
	'https://streamingcommunityz.one',
	'https://streamingcommunityz.build'
];
var CDN0 = 'https://cdn.streamingcommunityz.dad/images/';
var LS_HOST = 'nusstream.net';
var LS_PROG = 'nusstream.prog';
var LS_WATCH = 'nusstream.watchlist';
var PROG_MAX = 30, PROG_MIN = 0.02, PROG_END = 0.95;

/* ---------------- Helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function imgCss(u) { return u ? 'background-image:url(\'' + String(u).replace(/'/g, '%27') + '\')' : ''; }
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
function mmss(sec) {
	if (!isFinite(sec) || sec < 0) sec = 0;
	var s = Math.floor(sec), m = Math.floor(s / 60), hh = Math.floor(m / 60);
	m %= 60; s %= 60;
	function p(n) { return (n < 10 ? '0' : '') + n; }
	return (hh ? hh + ':' : '') + p(m) + ':' + p(s);
}
function pct(x) { return Math.max(0, Math.min(100, Math.round(x * 100))); }
function scrIn(el, inline) {
	if (!el || !el.scrollIntoView) return;
	if (inline) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	else el.scrollIntoView({ block: 'nearest' });
}
function clockTick() {
	var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
	var h = p(d.getHours()), m = p(d.getMinutes()), s = p(d.getSeconds());
	if ($('clock')) $('clock').textContent = h + ':' + m + ':' + s;
	if ($('side-clock')) $('side-clock').textContent = h + ':' + m;
}
var HINTS = {
	home: '← Menu · ↑↓ Righe · ←→ Sfoglia · OK Guarda/Apri',
	sidebar: '↑↓ Voci menu · OK Seleziona · → Torna ai contenuti',
	hero: '← Menu · ←→ Riproduci / Info / Lista · ↓ Catalogo · OK Conferma',
	browse: '← Menu · ←→↑↓ Sfoglia griglia · OK Apri · Back Torna',
	detail: 'OK Riproduci · ↓ Stagioni ed episodi · Back Torna',
	episodes: '←→↑↓ Seleziona episodio · OK Avvia · Back Torna',
	search: 'Tastiera: ←→↑↓ seleziona · OK inserisci · ↓ Risultati · Back Chiudi',
	play: '↑ Info & Opzioni · OK Pausa/Play · Giallo: Audio/Sub · Back Esci'
};
function setHint(k) {
	var el = $('hinttext');
	if (el) el.textContent = (typeof k === 'string' && HINTS[k]) ? HINTS[k] : (k || '');
}

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

/* ---------------- Watchlist (La mia lista) ---------------- */
function watchGet() { return lsGet(LS_WATCH, []); }
function watchHas(url) {
	var list = watchGet();
	for (var i = 0; i < list.length; i++) if (list[i].url === url) return true;
	return false;
}
function watchToggle(it) {
	if (!it || !it.url) return false;
	var list = watchGet(), idx = -1;
	for (var i = 0; i < list.length; i++) {
		if (list[i].url === it.url) { idx = i; break; }
	}
	var inList = false;
	if (idx >= 0) {
		list.splice(idx, 1);
		inList = false;
	} else {
		list.unshift(refItem(it));
		if (list.length > 50) list.pop();
		inList = true;
	}
	lsSet(LS_WATCH, list);
	return inList;
}
function watchShelf() {
	var w = watchGet();
	return w.length ? { title: 'LA MIA LISTA', items: w, watch: true } : null;
}

/* ---------------- Motore Rete ---------------- */
var eng = lsGet(LS_HOST, null) || { host: SEEDS[0], cdn: CDN0, confirmed: false };
function engSave() { lsSet(LS_HOST, { host: eng.host, cdn: eng.cdn, confirmed: eng.confirmed }); }

function netGet(url, accept, cb) {
	var x = new XMLHttpRequest();
	x.open('GET', url, true);
	x.timeout = 25000;
	if (accept) x.setRequestHeader('Accept', accept);
	x.onload = function () { cb({ ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText || '' }); };
	x.onerror = x.ontimeout = function () { cb({ ok: false, status: 0, text: '' }); };
	try { x.send(null); } catch (e) { cb({ ok: false, status: 0, text: '' }); }
}

function dataPage(html) {
	var m = /data-page="(.*?)"\s*>/.exec(html || '');
	if (!m) return null;
	var raw = m[1]
		.replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
		.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
	try { var j = JSON.parse(raw); cfgSync(j); return j; } catch (e) { return null; }
}
function cfgSync(page) {
	var p = page && page.props ? page.props : null, dirty = false;
	if (p && typeof p.app_url === 'string' && p.app_url) {
		var h = p.app_url.replace(/\/+$/, '');
		if (h && h !== eng.host) { eng.host = h; eng.confirmed = true; dirty = true; }
		else if (!eng.confirmed) { eng.confirmed = true; dirty = true; }
	}
	if (p && typeof p.cdn_url === 'string' && p.cdn_url) {
		var c = p.cdn_url.replace(/\/+$/, '') + '/images/';
		if (c !== eng.cdn) { eng.cdn = c; dirty = true; }
	}
	if (dirty) engSave();
}
function siteGet(url, accept, cb) {
	if (eng.confirmed) {
		netGet(url, accept, function (r) {
			/* host memorizzato non più raggiungibile (dominio cambiato/DNS): riparti dai seed */
			if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 403)) { cb(r); return; }
			var old = eng.host;
			eng.confirmed = false;
			eng.cdn = CDN0;
			engSave();
			var rest = [], i;
			for (i = 0; i < SEEDS.length; i++) if (SEEDS[i] !== old) rest.push(SEEDS[i]);
			walk(rest.length ? rest : SEEDS.slice(0));
		});
		return;
	}
	walk(SEEDS.slice(0));
	function walk(seeds) {
		if (!seeds.length) { cb({ ok: false, status: 0, text: '' }); return; }
		var u = url.replace(/^https:\/\/[^/]+/, seeds[0]);
		netGet(u, accept, function (r) {
			if (r.ok) { eng.confirmed = true; eng.host = u.replace(/^(https:\/\/[^/]+).*/, '$1'); engSave(); cb(r); return; }
			if (r.status === 403) { cb(r); return; }
			walk(seeds.slice(1));
		});
	}
}
function hostPath(path, qs) {
	if (!qs) return eng.host + path;
	var cleanQs = String(qs).replace(/^[?&]+/, '');
	var sep = (path.indexOf('?') >= 0) ? '&' : '?';
	return eng.host + path + sep + cleanQs;
}

function parseTitles(arr) {
	var out = [], i, t;
	if (!arr) return out;
	for (i = 0; i < arr.length; i++) {
		t = arr[i];
		if (t.id == null || !t.slug) continue;
		var im = t.images || [], poster = null, back = null, cover = null, logo = null, j;
		for (j = 0; j < im.length; j++) {
			if (!im[j].filename) continue;
			if (im[j].type === 'poster') poster = eng.cdn + im[j].filename;
			else if (im[j].type === 'background') back = eng.cdn + im[j].filename;
			else if (im[j].type === 'cover') cover = eng.cdn + im[j].filename;
			else if (im[j].type === 'logo') logo = eng.cdn + im[j].filename;
		}
		var dt = (t.last_air_date_it || t.last_air_date || '');
		out.push({
			url: t.id + '|' + t.slug,
			tid: t.id, slug: t.slug, isTv: (t.type || 'movie') === 'tv',
			title: t.name || '?', poster: poster, backdrop: back, cover: cover, logo: logo,
			score: (t.score && t.score !== '0') ? String(t.score) : '',
			year: dt.length >= 4 ? dt.slice(0, 4) : '',
			plot: t.plot || ''
		});
	}
	return out;
}

/* ---------------- API ---------------- */
function apiHome(cb) {
	siteGet(hostPath('/'), '', function (r) {
		if (!r.ok) { cb(null); return; }
		var page = dataPage(r.text);
		if (!page) { cb(null); return; }
		var sliders = (page.props || {}).sliders || [], res = {};
		var ok = { trending: 1, latest: 1, top10: 1 };
		for (var i = 0; i < sliders.length; i++)
			if (sliders[i] && ok[sliders[i].name]) res[sliders[i].name] = parseTitles(sliders[i].titles || []);
		cb(res);
	});
}
function apiArchive(type, page, cb) {
	siteGet(hostPath('/it/archive', 'type=' + type + '&sort=release_date&page=' + page), 'application/json', function (r) {
		if (!r.ok) { cb(null); return; }
		try { var j = JSON.parse(r.text); cb({ items: parseTitles(j.data || []), lastPage: j.last_page || 0 }); }
		catch (e) { cb(null); }
	});
}
function apiSearch(q, cb) {
	siteGet(hostPath('/it/search', 'q=' + encodeURIComponent(q)), 'application/json', function (r) {
		if (!r.ok) { cb(null); return; }
		try { var j = JSON.parse(r.text); cb(parseTitles(j.data || [])); } catch (e) { cb(null); }
	});
}
function apiDetail(item, cb) {
	siteGet(hostPath('/it/titles/' + item.tid + '-' + item.slug), '', function (r) {
		if (!r.ok) { cb(null); return; }
		var page = dataPage(r.text);
		var t = page && page.props ? page.props.title : null;
		if (!t) { cb(null); return; }
		var names = function (k, lim) {
			var a = t[k] || [], o = [], i;
			for (i = 0; i < a.length && (!lim || o.length < lim); i++)
				if (a[i] && a[i].name) o.push(a[i].name);
			return o.join(', ');
		};
		var seasons = [], sa = t.seasons || [], i;
		for (i = 0; i < sa.length; i++)
			if (sa[i] && sa[i].number >= 0) seasons.push({ n: sa[i].number, ep: sa[i].episodes_count | 0, plot: sa[i].plot || '' });
		var trailer = '', tra = t.trailers || [];
		for (i = 0; i < tra.length; i++) {
			var o = tra[i] || {};
			var isIt = /ita/i.test([o.name, o.title, o.label, o.language, o.lang].join(' '));
			var raw = o.youtube_id || o.key || o.url || o.link || '';
			var yid = (String(raw).match(/[A-Za-z0-9_-]{11}/) || [''])[0];
			if (yid && (!trailer || isIt)) { trailer = yid; if (isIt) break; }
		}
		var im = t.images || [], back = item.backdrop || '', logo = item.logo || '', j;
		for (j = 0; j < im.length; j++) {
			if (im[j].filename && im[j].type === 'background' && !back) back = eng.cdn + im[j].filename;
			if (im[j].filename && im[j].type === 'logo' && !logo) logo = eng.cdn + im[j].filename;
		}
		cb({
			plot: t.plot || item.plot || '', genres: names('genres'), cast: names('main_actors', 6),
			director: names('main_directors'), runtime: t.runtime > 0 ? t.runtime : 0,
			seasons: seasons, trailer: trailer, backdrop: back, logo: logo
		});
	});
}
function apiEpisodes(item, n, cb) {
	siteGet(hostPath('/it/titles/' + item.tid + '-' + item.slug + '/season-' + n), '', function (r) {
		if (!r.ok) { cb(null); return; }
		var page = dataPage(r.text);
		var ls = page && page.props ? page.props.loadedSeason : null;
		var a = ls && ls.episodes ? ls.episodes : null;
		if (!a) { cb(null); return; }
		var out = [], i, e;
		for (i = 0; i < a.length; i++) {
			e = a[i];
			if (e.id == null || e.number < 0) continue;
			var img = e.images || [], thumb = null, j;
			for (j = 0; j < img.length; j++)
				if (img[j].filename && (img[j].type === 'cover' || img[j].type === 'background')) { thumb = eng.cdn + img[j].filename; break; }
			out.push({
				url: item.tid + '|' + item.slug + '|' + e.id,
				tid: item.tid, slug: item.slug, epId: e.id, n: e.number,
				title: e.number + '. ' + (e.name || ('Episodio ' + e.number)),
				thumb: thumb || item.poster,
				isTv: true, eps: true, sTitle: item.title, season: n,
				plot: e.plot || ''
			});
		}
		out.sort(function (x, y) { return x.n - y.n; });
		cb(out);
	});
}

/* ---------------- Risoluzione Stream Vixcloud ---------------- */
function resolveStream(item, attempt, cb) {
	if (item.isTv && !item.epId) {
		apiEpisodes(item, 1, function (eps) {
			if (eps && eps.length) {
				resolveStream(eps[0], attempt, cb);
			} else {
				cb(null, 'nessun episodio trovato per la serie');
			}
		});
		return;
	}
	var tail = item.epId ? ('episode_id=' + item.epId + '&next_episode=1') : '';
	siteGet(hostPath('/it/iframe/' + item.tid + '-' + item.slug, tail), '', function (r) {
		if (!r.ok) { cb(null, 'server iframe HTTP ' + (r.status || 0)); return; }
		var m = /(https:\/\/[^"'\s]*vixcloud[^"'\s]*\/embed\/\d+\?[^"'\s]+)/.exec(r.text)
			|| /(https:\/\/[^"'\s]*vixcloud[^"'\s]*\/embed\/\d+[^"'\s]*)/.exec(r.text)
			|| /(https:\/\/[^"'\s]*vixcloud[^"'\s]*\/embed\/[^\s"'>]+)/.exec(r.text)
			|| /(?:src=["'])(https:\/\/[^"'\s]+\/embed\/[^\s"'>]+)/.exec(r.text);
		if (!m) { cb(null, 'embed non trovato'); return; }
		var emb = m[1].replace(/&amp;/g, '&');
		netGet(emb, '', function (r2) {
			var pu = (/window\.masterPlaylist[\s\S]*?url:\s*['"]([^'"]+)['"]/.exec(r2.text) || [])[1]
				|| (/(?:masterPlaylist[\s\S]*?url|url)\s*:\s*['"]([^'"]+playlist[^'"]*)['"]/.exec(r2.text) || [])[1]
				|| (/(?:masterPlaylist[\s\S]*?url|url)\s*:\s*['"]([^'"]+)['"]/.exec(r2.text) || [])[1]
				|| (/url\s*:\s*['"]([^'"]+)['"]/.exec(r2.text) || [])[1];
			var tk = (/params[\s\S]*?['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/.exec(r2.text) || [])[1]
				|| (/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/.exec(r2.text) || [])[1];
			var ex = (/params[\s\S]*?['"]?expires['"]?\s*:\s*['"]?([0-9]+)['"]?/.exec(r2.text) || [])[1]
				|| (/['"]?expires['"]?\s*:\s*['"]?([0-9]+)['"]?/.exec(r2.text) || [])[1];
			var fhd = /canPlayFHD\s*=\s*true/.test(r2.text);

			if (!(r2.ok && pu && tk && ex)) {
				if ((attempt | 0) < 1) { setTimeout(function () { resolveStream(item, 1, cb); }, 900); return; }
				if (emb) { cb(null, null, emb); return; }
				cb(null, 'token scaduto o embed bloccato'); return;
			}
			var sep = pu.indexOf('?') >= 0 ? '&' : '?';
			var url = (pu + sep + 'token=' + tk + '&expires=' + ex + (fhd ? '&h=1' : '')).replace(/&amp;/g, '&');
			cb(url, null, emb);
		});
	});
}

/* ---------------- Continua a guardare ---------------- */
function progGet(url) { return (lsGet(LS_PROG, {})[url]) || null; }
function progSave(item, pos, dur) {
	var all = lsGet(LS_PROG, {});
	all[item.url] = {
		url: item.url, tid: item.tid, slug: item.slug, isTv: !!item.isTv,
		epId: item.epId || 0, season: item.season || 0, n: item.n || 0,
		title: item.title, sTitle: item.sTitle || '', thumb: item.thumb || item.poster || '',
		p: pos, d: dur, upd: Date.now()
	};
	if (dur > 0 && pos / dur >= PROG_END) delete all[item.url];
	var ks = Object.keys(all);
	while (ks.length > PROG_MAX) {
		var old = ks[0];
		for (var i = 0; i < ks.length; i++) if (all[ks[i]].upd < all[old].upd) old = ks[i];
		delete all[old];
		ks = Object.keys(all);
	}
	lsSet(LS_PROG, all);
}
function progShelf() {
	var all = lsGet(LS_PROG, {}), out = [], k;
	for (k in all) {
		var c = all[k];
		if (c.d > 0 && c.p / c.d >= PROG_END) continue;
		if (c.p / (c.d || 1) < PROG_MIN) continue;
		out.push({ url: c.url, tid: c.tid, slug: c.slug, isTv: c.isTv, epId: c.epId, season: c.season, n: c.n,
			title: c.title, sTitle: c.sTitle, thumb: c.thumb, kind: c.epId ? 'ep' : 'title', prog: c.d > 0 ? c.p / c.d : 0, upd: c.upd });
	}
	out.sort(function (a, b) { return b.upd - a.upd; });
	return out;
}

/* ---------------- Stato Applicazione ---------------- */
var ST = { HOME: 0, BROWSE: 1, DETAIL: 2, PLAY: 3, SEARCH: 4, WATCHLIST: 5 };
var screen = ST.HOME;
var hz = 'hero';                             // 'sidebar' | 'hero' | 'row'
var heroFocus = 0, heroItem = null, heroUpd = 0;
var shelves = [], fRow = 0, fX = 0;
var bType = 'movie', bPage = 1, bItems = [], bLast = 1, bIdx = 0;
var dItem = null, dSeason = null, dEps = [], dEp = 0, dFocus = 0, dChip = 0;
var sItems = [], sIdx = 0, sGrid = false, sQuery = '';
var returnTo = null;

// Sidebar state
var NAV_KEYS = ['search', 'home', 'tv', 'movie', 'latest', 'watchlist'];
var navIdx = 1;                              // 1 = home
var curNav = 'home';

// Keyboard state for search
var KBD_ROWS = [
	['1','2','3','4','5','6','7','8','9','0'],
	['Q','W','E','R','T','Y','U','I','O','P'],
	['A','S','D','F','G','H','J','K','L'],
	['Z','X','C','V','B','N','M','.', '-'],
	[
		{ id: 'space', label: 'SPAZIO', w: 'space' },
		{ id: 'del', label: '⌫ CANCELLA', w: 'wide' },
		{ id: 'clear', label: 'SVUOTA', w: 'wide' }
	]
];
var kbdR = 1, kbdC = 0;
var sZone = 'kbd';                           // 'kbd' | 'grid'

// Player Audio & Subtitles Drawer state
var tracksDrawerOpen = false;
var tracksCol = 0;                           // 0 = Audio, 1 = Subtitles
var tracksAudIdx = 0;
var tracksSubIdx = -1;

/* ---------------- Card Rendering ---------------- */
function cardHtml(it, taller) {
	var img = it.thumb || it.cover || it.backdrop || it.poster || '';
	var name = it.sTitle || it.title;
	return '<div class="cimg' + (taller ? ' taller' : '') + (img ? '' : ' cempty') + '"' + (img ? ' style="' + imgCss(img) + '"' : '') + '>'
		+ (img ? '' : esc(it.n ? 'S' + it.season + 'E' + it.n : (it.isTv ? 'Serie' : 'Film'))) + '</div>'
		+ '<div class="cname">' + esc(name) + (it.sTitle ? '<span>&middot; ' + esc(it.title) + '</span>' : '') + '</div>'
		+ (it.score ? '<div class="cbadge">&#9733; ' + esc(it.score) + '</div>' : '')
		+ (it.prog ? '<div class="pbar"><i style="width:' + pct(it.prog) + '%"></i></div>' : '');
}
function refItem(it) {
	return {
		tid: it.tid, slug: it.slug, title: it.title, sTitle: it.sTitle || '', isTv: !!it.isTv,
		poster: it.poster || it.thumb || '', backdrop: it.backdrop || it.thumb || '', cover: it.cover || '',
		logo: it.logo || '', url: it.url, year: it.year || '', score: it.score || '', plot: it.plot || ''
	};
}

/* ---------------- SIDEBAR NETFLIX 2025 ---------------- */
function sidebarExpand(exp) {
	var sb = $('sidebar');
	if (!sb) return;
	if (exp) sb.classList.add('expanded');
	else sb.classList.remove('expanded');
}
function syncSidebarFocus() {
	var items = document.querySelectorAll('#nav-items .nav-item');
	for (var i = 0; i < items.length; i++) {
		var it = items[i];
		var key = it.getAttribute('data-nav');
		it.classList.toggle('focused', hz === 'sidebar' && i === navIdx);
		it.classList.toggle('active', key === curNav);
	}
}
function sidebarAction() {
	var key = NAV_KEYS[navIdx];
	curNav = key;
	sidebarExpand(false);
	syncSidebarFocus();
	if (key === 'search') {
		apriRicerca();
	} else if (key === 'home') {
		screen = ST.HOME;
		$('detail').className = 'hidden';
		$('searchview').className = 'hidden';
		$('hero').className = '';
		hz = 'hero';
		heroFocus = 0;
		renderHome();
		setHint(HINTS.hero);
	} else if (key === 'tv') {
		apriBrowse('tv');
	} else if (key === 'movie') {
		apriBrowse('movie');
	} else if (key === 'latest') {
		apriBrowse('latest');
	} else if (key === 'watchlist') {
		apriWatchlistView();
	}
}
function keySidebar(k) {
	if (k === 38) {
		if (navIdx > 0) { navIdx--; syncSidebarFocus(); }
		return;
	}
	if (k === 40) {
		if (navIdx < NAV_KEYS.length - 1) { navIdx++; syncSidebarFocus(); }
		return;
	}
	if (k === 13) {
		sidebarAction();
		return;
	}
	if (k === 461 || k === 8 || k === 27) {
		if (screen === ST.HOME) {
			if (curNav !== 'home') {
				curNav = 'home';
				syncSidebarFocus();
				return;
			}
			showExitToast('NuStream');
			return;
		} else {
			curNav = 'home';
			screen = ST.HOME;
			syncSidebarFocus();
			sidebarExpand(false);
			renderHome();
			return;
		}
	}
	if (k === 39) {
		sidebarExpand(false);
		if (screen === ST.HOME) {
			hz = heroItem ? 'hero' : 'row';
			syncAll();
		} else if (screen === ST.BROWSE || screen === ST.WATCHLIST) {
			renderBrowse();
		}
		return;
	}
}

/* ---------------- HERO NETFLIX 2025 ---------------- */
function heroFrom() {
	if (shelves.length === 1 && (shelves[0].cont || shelves[0].watch)) return null;
	var s = shelves[0];
	if (s && (s.cont || s.watch) && shelves.length > 1) s = shelves[1];
	if (!s || !s.items || !s.items.length) return null;
	var it = s.items[0];
	if (!it.isTv && !it.backdrop && !it.cover) return null;
	return it;
}
function updateWatchlistBtn(it) {
	var has = watchHas(it ? it.url : '');
	var txt = $('hwatchtext'), ico = $('hwatchico');
	if (txt) txt.textContent = has ? '✓ Nella lista' : '+ La mia lista';
	if (ico) {
		ico.innerHTML = has
			? '<polyline points="20 6 9 17 4 12"></polyline>'
			: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>';
	}
}
function renderHero() {
	heroItem = heroFrom();
	var v = $('hero');
	if (!heroItem) {
		v.className = 'hidden';
		$('main').classList.add('nohero');
		return;
	}
	$('main').classList.remove('nohero');
	if (heroUpd === heroItem.url) {
		v.className = '';
		updateWatchlistBtn(heroItem);
		return;
	}
	heroUpd = heroItem.url;
	var bg = heroItem.backdrop || heroItem.cover || heroItem.poster || '';
	$('herobg').setAttribute('style', imgCss(bg));
	$('hname').innerHTML = heroItem.logo
		? '<div id="hlogo" style="' + imgCss(heroItem.logo) + '"></div>'
		: '<h1>' + esc(heroItem.title) + '</h1>';
	var metaHtml = '<span class="hbadge ' + (heroItem.isTv ? 'tv' : 'film') + '">' + (heroItem.isTv ? 'SERIE TV' : 'FILM') + '</span>';
	if (heroItem.year) metaHtml += '<span>' + esc(heroItem.year) + '</span>';
	metaHtml += '<span class="hbadge tech">HD</span>';
	if (heroItem.score) metaHtml += '<span class="hscore">&#9733; ' + esc(heroItem.score) + '</span>';
	$('hmeta').innerHTML = metaHtml;
	var descText = heroItem.plot || 'Guarda ora in streaming su NusStream.';
	$('hdesc').textContent = descText;
	updateWatchlistBtn(heroItem);
	v.className = '';
	syncHeroFocus();
}
function syncHeroFocus() {
	$('hplay').classList.toggle('focused', hz === 'hero' && heroFocus === 0);
	$('hinfo').classList.toggle('focused', hz === 'hero' && heroFocus === 1);
	$('hwatchlist').classList.toggle('focused', hz === 'hero' && heroFocus === 2);
}
function heroAction() {
	if (!heroItem) return;
	if (heroFocus === 0) {
		if (heroItem.isTv) {
			setHint('Carico l’episodio 1…');
			apiEpisodes(heroItem, 1, function (eps) {
				if (eps && eps.length) play(eps[0]);
				else apriDettaglio(refItem(heroItem));
			});
		} else {
			play(heroItem);
		}
	} else if (heroFocus === 1) {
		apriDettaglio(refItem(heroItem));
	} else if (heroFocus === 2) {
		watchToggle(heroItem);
		updateWatchlistBtn(heroItem);
		refreshShelvesProgressOnly();
	}
}

/* ---------------- HOME ---------------- */
function renderHome() {
	var h = '', i, j, s;
	for (i = 0; i < shelves.length; i++) {
		s = shelves[i];
		if (!s.items || !s.items.length) continue;
		h += '<div class="shelf"><div class="st">' + esc(s.title) + '</div><div class="rail">';
		for (j = 0; j < s.items.length; j++)
			h += '<div class="card' + (hz === 'row' && i === fRow && j === fX ? ' focused' : '') + '" data-sh="' + i + '" data-ix="' + j + '">'
				+ cardHtml(s.items[j], false) + '</div>';
		if (s.arch) h += '<div class="card morecard' + (hz === 'row' && i === fRow && j === fX ? ' focused' : '') + '" data-sh="' + i + '" data-more="' + s.arch + '" data-mx="' + j + '"><div class="mtext">ALTRO <svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div></div>';
		h += '</div></div>';
	}
	$('shelves').innerHTML = h || '<div id="skeleton"><div class="sk sk-rail"></div><div class="sk sk-rail wide"></div><div class="sk sk-rail"></div></div>';
	scrIn(document.querySelector('#shelves .card.focused'), true);
	renderHero();
}
function firstRow() {
	for (var j = 0; j < shelves.length; j++) if (shelves[j].items && shelves[j].items.length) return j;
	return 0;
}
function clampHomeX() {
	var s = shelves[fRow]; if (!s || !s.items || !s.items.length) return;
	var n = s.items.length + (s.arch ? 1 : 0);
	if (fX >= n) fX = n - 1;
	if (fX < 0) fX = 0;
}
function keyHome(k) {
	if (hz === 'sidebar') {
		keySidebar(k);
		return;
	}
	var s = shelves[fRow];
	if (hz === 'hero') {
		if (k === 37) {
			if (heroFocus > 0) { heroFocus--; syncHeroFocus(); return; }
			hz = 'sidebar';
			sidebarExpand(true);
			syncSidebarFocus();
			setHint(HINTS.sidebar);
			return;
		}
		if (k === 39) {
			if (heroFocus < 2) { heroFocus++; syncHeroFocus(); return; }
			return;
		}
		if (k === 40) {
			hz = 'row'; fRow = firstRow(); fX = 0; syncAll(); return;
		}
		if (k === 13) { heroAction(); return; }
		if (k === 461 || k === 8 || k === 27) {
			hz = 'sidebar';
			sidebarExpand(true);
			syncSidebarFocus();
			setHint(HINTS.sidebar);
			return;
		}
		return;
	}
	/* hz = 'row' */
	if (k === 37) {
		if (fX > 0) {
			fX--; syncAll(); return;
		}
		hz = 'sidebar';
		sidebarExpand(true);
		syncSidebarFocus();
		setHint(HINTS.sidebar);
		return;
	}
	if (k === 39) {
		if (!s || !s.items || !s.items.length) return;
		var n = s.items.length + (s.arch ? 1 : 0);
		if (fX < n - 1) { fX++; syncAll(); }
		return;
	}
	if (k === 38) {
		var r = fRow - 1;
		while (r >= 0 && (!shelves[r] || !shelves[r].items || !shelves[r].items.length)) r--;
		if (r < 0) {
			hz = 'hero'; heroFocus = 0; syncAll(); return;
		}
		fRow = r; fX = 0; syncAll(); return;
	}
	if (k === 40) {
		var r2 = fRow + 1;
		while (r2 < shelves.length && (!shelves[r2] || !shelves[r2].items || !shelves[r2].items.length)) r2++;
		if (r2 < shelves.length) {
			fRow = r2; fX = 0; syncAll();
		}
		return;
	}
	if (k === 13) {
		if (!s || !s.items) return;
		if (fX >= s.items.length && s.arch) { apriBrowse(s.arch); return; }
		var it = s.items[fX]; if (!it) return;
		if (s.cont && it.kind === 'ep') { play(it); return; }
		apriDettaglio(refItem(it));
		return;
	}
	if (k === 461 || k === 8 || k === 27) {
		hz = 'hero'; syncAll(); return;
	}
}
function syncAll() {
	Array.prototype.forEach.call(document.querySelectorAll('.card'), function (c) {
		var sh = +c.getAttribute('data-sh'), ix = c.getAttribute('data-mx') != null ? +c.getAttribute('data-mx') : +c.getAttribute('data-ix');
		c.classList.toggle('focused', hz === 'row' && sh === fRow && ix === fX);
	});
	if (hz === 'row') scrIn(document.querySelector('#shelves .card.focused'), true);
	syncHeroFocus();
	setHint(hz === 'hero' ? HINTS.hero : (hz === 'sidebar' ? HINTS.sidebar : HINTS.home));
	$('shelves').classList.toggle('dim', hz === 'hero');
}
function refreshShelvesProgressOnly() {
	var cont = progShelf(), ws = watchShelf();
	var newShelves = [];
	if (cont.length) newShelves.push({ title: 'CONTINUA A GUARDARE', items: cont, cont: true });
	if (ws) newShelves.push(ws);
	for (var i = 0; i < shelves.length; i++) {
		if (!shelves[i].cont && !shelves[i].watch) newShelves.push(shelves[i]);
	}
	shelves = newShelves;
	renderHome();
}

/* ---------------- BROWSE & WATCHLIST ---------------- */
function apriBrowse(type) {
	bType = type; bPage = 1; bItems = []; bLast = 1; bIdx = 0;
	screen = ST.BROWSE;
	$('detail').className = 'hidden'; $('searchview').className = 'hidden';
	$('shelves').innerHTML = '<div id="skeleton"><div class="skgrid"></div><div class="skgrid wide"></div></div>';
	$('hero').classList.add('hidden');
	setHint(HINTS.browse);
	browsePage();
}
function browsePage() {
	var queryType = (bType === 'latest') ? 'movie' : bType;
	apiArchive(queryType, bPage, function (r) {
		if (screen !== ST.BROWSE) return;
		if (!r) { $('shelves').innerHTML = '<div class="derr">Errore di rete. Back per tornare.</div>'; return; }
		Array.prototype.push.apply(bItems, r.items);
		bLast = r.lastPage;
		renderBrowse();
	});
}
function apriWatchlistView() {
	screen = ST.WATCHLIST;
	bItems = watchGet();
	bIdx = 0;
	$('detail').className = 'hidden'; $('searchview').className = 'hidden';
	$('hero').classList.add('hidden');
	setHint(HINTS.browse);
	renderBrowse();
}
function renderBrowse() {
	var title = 'CATALOGO';
	if (screen === ST.WATCHLIST) title = 'LA MIA LISTA';
	else if (bType === 'movie') title = 'FILM';
	else if (bType === 'tv') title = 'SERIE TV';
	else if (bType === 'latest') title = 'NUOVI & POPOLARI';

	var sub = (screen === ST.WATCHLIST)
		? (' &middot; ' + bItems.length + ' titoli salvati')
		: (' &middot; ordinati per nuova uscita &middot; pagina ' + bPage + '/' + Math.max(1, bLast));

	var h = '<div class="st browse-st">' + title + '<span class="sub">' + sub + '</span></div><div class="grid">';
	if (!bItems.length) {
		h += '<div class="derr" style="padding:60px 0;width:100%">Nessun elemento presente in questa sezione.</div>';
	} else {
		for (var i = 0; i < bItems.length; i++)
			h += '<div class="card' + (i === bIdx ? ' focused' : '') + '" data-bx="' + i + '">' + cardHtml(bItems[i], true) + '</div>';
		if (screen === ST.BROWSE && bPage < bLast)
			h += '<div class="card morecard' + (bIdx === bItems.length ? ' focused' : '') + '" data-bx="' + bItems.length + '"><div class="mtext big">ALTRO <svg class="ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div></div>';
	}
	$('shelves').innerHTML = h + '</div>';
	scrIn(document.querySelector('#shelves .card.focused'), true);
}
function keyBrowse(k) {
	if (hz === 'sidebar') { keySidebar(k); return; }
	var isWl = (screen === ST.WATCHLIST);
	var n = bItems.length + (!isWl && bPage < bLast ? 1 : 0), per = 7;
	if (k === 37) {
		if (bIdx % per === 0 || bIdx === 0) {
			hz = 'sidebar';
			sidebarExpand(true);
			syncSidebarFocus();
			setHint(HINTS.sidebar);
			return;
		}
		bIdx = Math.max(0, bIdx - 1);
	} else if (k === 39) {
		bIdx = Math.min(n - 1, bIdx + 1);
	} else if (k === 38) {
		bIdx = Math.max(0, bIdx - per);
	} else if (k === 40) {
		bIdx = Math.min(n - 1, bIdx + per);
	} else if (k === 13) {
		if (!isWl && bIdx === bItems.length) {
			bPage++; setHint('Carico la pagina ' + bPage + '…'); browsePage(); return;
		}
		var it = bItems[bIdx];
		if (it) apriDettaglio(refItem(it), isWl ? 'watchlist' : 'browse');
		return;
	} else if (k === 461 || k === 8 || k === 27) {
		curNav = 'home';
		screen = ST.HOME;
		syncSidebarFocus();
		setHint(HINTS.home);
		renderHome();
		return;
	} else return;
	renderBrowse();
}

/* ---------------- DETTAGLIO ---------------- */
function apriDettaglio(item, from) {
	returnTo = from || null;
	dItem = item; dSeason = null; dEps = []; dEp = 0; dFocus = 0; dChip = 0;
	screen = ST.DETAIL;
	$('searchview').className = 'hidden';
	$('detail').className = '';
	$('detail').innerHTML = '<div id="dload"><div class="nicon" style="margin-top:28vh"></div></div>';
	setHint(HINTS.detail);
	apiDetail(item, function (d) {
		if (screen !== ST.DETAIL) return;
		if (!d) { $('detail').innerHTML = '<div class="derr">Impossibile caricare il titolo. Back per tornare.</div>'; return; }
		dItem.plot = d.plot || dItem.plot;
		dItem.genres = d.genres; dItem.cast = d.cast;
		dItem.director = d.director; dItem.runtime = d.runtime; dItem.seasons = d.seasons;
		dItem.trailer = d.trailer;
		if (d.backdrop) dItem.backdrop = d.backdrop;
		if (d.logo) dItem.logo = d.logo;
		renderDettaglio();
	});
}
function chiudiDettaglio() {
	$('detail').className = 'hidden'; $('detail').innerHTML = '';
	dItem = null;
	if (returnTo === 'search') {
		screen = ST.SEARCH;
		$('searchview').className = '';
		setHint(HINTS.search);
		returnTo = null;
		return;
	}
	if (returnTo === 'browse') {
		screen = ST.BROWSE;
		renderBrowse();
		returnTo = null;
		return;
	}
	if (returnTo === 'watchlist') {
		screen = ST.WATCHLIST;
		renderBrowse();
		returnTo = null;
		return;
	}
	screen = ST.HOME;
	returnTo = null;
	if (hz !== 'hero') clampHomeX();
	refreshShelvesProgressOnly();
}
function renderDettaglio() {
	var d = dItem, back = d.backdrop || d.cover || d.poster || '';
	var badges = '<span class="hbadge ' + (d.isTv ? 'tv' : 'film') + '">' + (d.isTv ? 'SERIE' : 'FILM') + '</span>';
	if (d.year) badges += '<span class="mbadge">' + esc(d.year) + '</span>';
	if (d.runtime) badges += '<span class="mbadge">' + d.runtime + ' min</span>';
	badges += '<span class="mbadge">HD</span>';
	if (d.score) badges += '<span class="mbadge red">&#9733; ' + esc(d.score) + '</span>';
	var h = (back ? '<div id="dback" style="' + imgCss(back) + '"></div><div id="dshade"></div>' : '');
	h += '<div id="dbody">';
	if (d.poster) h += '<div id="dposter" style="' + imgCss(d.poster) + '"></div>';
	h += '<div id="dinfo">';
	if (d.logo) h += '<div id="dlogo" style="' + imgCss(d.logo) + '"></div><div id="dtitle" class="vh">' + esc(d.title) + '</div>';
	else h += '<h1>' + esc(d.title) + '</h1>';
	h += '<div class="dmeta">' + badges + '</div>'
		+ (d.genres ? '<div class="dgen">' + esc(d.genres) + '</div>' : '')
		+ (d.plot ? '<div class="dplot">' + esc(d.plot) + '</div>' : '')
		+ (d.cast ? '<div class="dsmall"><b>Cast</b> ' + esc(d.cast) + '</div>' : '')
		+ (d.director ? '<div class="dsmall"><b>Regia</b> ' + esc(d.director) + '</div>' : '');
	h += '</div></div>'
		+ '<div id="dbtns"><div class="dbtn main" id="dplay"></div>'
		+ '<div class="dbtn" id="dwatchlist"></div>'
		+ (d.trailer ? '<div class="dbtn" id="dtrailer"><svg class="ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>Trailer</div>' : '')
		+ '</div>'
		+ '<div id="dseasons"></div><div id="deps"></div>';
	$('detail').innerHTML = h;
	renderDetInter();
}
function renderDetInter() {
	var d = dItem, pk = progGet(d.url);
	var playIco = '<svg class="ico" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
	$('dplay').innerHTML = playIco + (pk ? 'RIPRENDI ' + mmss(pk.p) : (d.isTv ? 'GUARDA S1' : 'GUARDA'));

	var hasW = watchHas(d.url);
	$('dwatchlist').innerHTML = hasW ? '✓ Nella lista' : '+ La mia lista';

	var chipN = d.seasons ? d.seasons.length : 0;
	if (d.isTv && chipN) {
		var h = '<div class="dlab">STAGIONI</div><div id="chips">';
		for (var i = 0; i < chipN; i++) {
			var s = d.seasons[i];
			h += '<div class="chip' + (s.n === dSeason ? ' active' : '') + (dFocus === 3 && dChip === i ? ' focused' : '')
				+ '" data-season="' + s.n + '">S' + s.n + (s.ep > 0 ? ' <span>&middot; ' + s.ep + ' ep</span>' : (s.ep === 0 ? ' <span>&middot; in arrivo</span>' : '')) + '</div>';
		}
		$('dseasons').innerHTML = h + '</div>';
	} else $('dseasons').innerHTML = '';
	if (dSeason && !dEps.length) $('deps').innerHTML = '<div class="dsmall" style="margin-top:18px">Carico gli episodi…</div>';
	if (dEps.length) renderDetEpisodi();

	$('dplay').classList.toggle('focused', dFocus === 0);
	$('dwatchlist').classList.toggle('focused', dFocus === 1);
	if (d.trailer) $('dtrailer').classList.toggle('focused', dFocus === 2);
}
function seasonIndex(n) { for (var i = 0; i < dItem.seasons.length; i++) if (dItem.seasons[i].n === n) return i; return 0; }
function pickSeason(n) {
	dSeason = n; dEps = []; dEp = 0;
	renderDetInter();
	apiEpisodes(dItem, n, function (eps) {
		if (screen !== ST.DETAIL) return;
		dEps = eps || [];
		renderDetEpisodi();
	});
}
function renderDetEpisodi() {
	if (!dSeason) { $('deps').innerHTML = ''; return; }
	var h = '<div class="dlab">EPISODI · STAGIONE ' + dSeason + '</div><div id="epgrid">';
	for (var i = 0; i < dEps.length; i++) {
		var e = dEps[i], pk = progGet(e.url);
		var plot = e.plot ? (e.plot.length > 120 ? e.plot.slice(0, 120) + '…' : e.plot) : '';
		h += '<div class="ep' + (dFocus === 4 && dEp === i ? ' focused' : '') + '" data-ep="' + i + '">'
			+ '<div class="eimg"' + (e.thumb ? ' style="' + imgCss(e.thumb) + '"' : '') + '></div>'
			+ '<div class="einfo"><div class="etit">' + esc(e.title) + '</div>'
			+ (plot ? '<div class="eplot">' + esc(plot) + '</div>' : '')
			+ (pk ? '<div class="pbar"><i style="width:' + pct(pk.p / (pk.d || 1)) + '%"></i></div>' : '')
			+ '</div></div>';
	}
	$('deps').innerHTML = h + '</div>';
	if (dFocus === 4) scrIn(document.querySelector('#deps .ep.focused'), true);
	else scrIn(document.querySelector('#deps .ep:first-child'), true);
}
function seasonChipCount() { return dItem && dItem.seasons ? dItem.seasons.length : 0; }
function keyDetail(k) {
	var nChip = seasonChipCount();
	if (k === 461 || k === 8 || k === 27) { chiudiDettaglio(); return; }

	if (dFocus === 0) {
		if (k === 13) {
			if (dItem.isTv) {
				if (dEps && dEps.length) { play(dEps[0]); return; }
				var sN = (dItem.seasons && dItem.seasons.length) ? dItem.seasons[0].n : 1;
				setHint('Carico l’episodio 1…');
				apiEpisodes(dItem, sN, function (eps) {
					if (eps && eps.length) { dEps = eps; play(eps[0]); }
					else play(dItem);
				});
				return;
			}
			play(dItem); return;
		}
		if (k === 39) { dFocus = 1; renderDetInter(); return; }
		if (k === 40) { if (nChip) { dFocus = 3; renderDetInter(); } return; }
	} else if (dFocus === 1) {
		if (k === 13) { watchToggle(dItem); renderDetInter(); return; }
		if (k === 37) { dFocus = 0; renderDetInter(); return; }
		if (k === 39 && dItem.trailer) { dFocus = 2; renderDetInter(); return; }
		if (k === 40 && nChip) { dFocus = 3; renderDetInter(); return; }
	} else if (dFocus === 2) {
		if (k === 13) { window.open('https://www.youtube.com/watch?v=' + dItem.trailer, '_blank'); return; }
		if (k === 37) { dFocus = 1; renderDetInter(); return; }
		if (k === 40 && nChip) { dFocus = 3; renderDetInter(); return; }
	} else if (dFocus === 3) {
		if (k === 37 && dChip > 0) { dChip--; dSeason = dItem.seasons[dChip].n; dEps = []; loadChipEps(); return; }
		if (k === 39 && dChip < nChip - 1) { dChip++; dSeason = dItem.seasons[dChip].n; dEps = []; loadChipEps(); return; }
		if (k === 38) { dFocus = 0; renderDetInter(); return; }
		if (k === 40 && dEps.length) { dFocus = 4; dEp = 0; renderDetEpisodi(); return; }
		if (k === 13) { loadChipEps(true); return; }
	} else if (dFocus === 4) {
		if (k === 37 && dEp > 0) { dEp--; renderDetEpisodi(); return; }
		if (k === 39 && dEp < dEps.length - 1) { dEp++; renderDetEpisodi(); return; }
		if (k === 38) {
			if (dEp === 0) { dFocus = 3; dEp = 0; renderDetInter(); }
			else { dEp = Math.max(0, dEp - 3); renderDetEpisodi(); }
			return;
		}
		if (k === 40) { dEp = Math.min(dEps.length - 1, dEp + 3); renderDetEpisodi(); return; }
		if (k === 13) { play(dEps[dEp]); return; }
	}
}
function loadChipEps(onOk) {
	if (!dSeason) dSeason = dItem.seasons[dChip] ? dItem.seasons[dChip].n : 1;
	if (dEps.length && dEps[0].season === dSeason) {
		if (onOk) { dFocus = 4; dEp = 0; renderDetEpisodi(); }
		else renderDetInter();
		return;
	}
	dFocus = onOk ? 4 : 3;
	pickSeason(dSeason);
}

/* ---------------- PLAYER NETFLIX 2025 ---------------- */
var hideTimer = null;
var drawerOpen = false;
var drawerIdx = 0;
var autoNextTimer = null;
var autoNextSec = 5;
var autoNextDismissed = false;

function playbarShow(dur) {
	$('playbar').classList.remove('hidden');
	$('ptopcontrols').classList.remove('hidden');
	clearTimeout(hideTimer);
	hideTimer = setTimeout(function () {
		if (drawerOpen || tracksDrawerOpen) return;
		$('playbar').classList.add('hidden');
		$('ptopcontrols').classList.add('hidden');
		var pl = $('pplot'); if (pl) pl.classList.add('hidden');
	}, dur || 5000);
}
function togglePlayInfo(show) {
	var pl = $('pplot');
	if (!pl) return;
	if (show === false) {
		pl.classList.add('hidden');
		playbarShow(4000);
		return;
	}
	if (show === true || pl.classList.contains('hidden')) {
		pl.classList.remove('hidden');
		playbarShow(9000);
	} else {
		pl.classList.add('hidden');
		playbarShow(4000);
	}
}
function openEpisodeDrawer(open) {
	drawerOpen = (open !== undefined) ? open : !drawerOpen;
	var d = $('pdrawer');
	if (!d) return;
	if (drawerOpen) {
		if (tracksDrawerOpen) openTracksDrawer(false);
		d.classList.remove('hidden');
		renderEpisodeDrawer();
	} else {
		d.classList.add('hidden');
	}
}
function renderEpisodeDrawer() {
	var el = $('pdrawerlist');
	if (!el || !dEps || !dEps.length) {
		if (el) el.innerHTML = '<div style="color:#94a3b8;padding:20px">Nessun episodio disponibile</div>';
		return;
	}
	var h = '';
	for (var i = 0; i < dEps.length; i++) {
		var ep = dEps[i];
		var isCur = (curPlayItem && curPlayItem.epId === ep.epId);
		h += '<div class="pdraw-item' + (isCur ? ' active' : '') + (i === drawerIdx ? ' focused' : '') + '" data-dix="' + i + '">'
			+ '<div class="pdraw-name">' + esc(ep.title) + '</div>'
			+ (ep.plot ? '<div class="pdraw-plot">' + esc(ep.plot) + '</div>' : '')
			+ '</div>';
	}
	el.innerHTML = h;
	scrIn(el.querySelector('.pdraw-item.focused'), false);
}

/* ---------------- Audio & Subtitles Drawer ---------------- */
function openTracksDrawer(open) {
	tracksDrawerOpen = (open !== undefined) ? open : !tracksDrawerOpen;
	var d = $('ptracksdrawer');
	if (!d) return;
	if (tracksDrawerOpen) {
		if (drawerOpen) openEpisodeDrawer(false);
		d.classList.remove('hidden');
		if (curHls) {
			tracksAudIdx = curHls.audioTrack >= 0 ? curHls.audioTrack : 0;
			tracksSubIdx = curHls.subtitleTrack;
		}
		renderTracksDrawer();
	} else {
		d.classList.add('hidden');
	}
}
function renderTracksDrawer() {
	var audList = $('ptd-audiolist'), subList = $('ptd-sublist');
	if (!audList || !subList) return;

	var audTracks = (curHls && curHls.audioTracks) ? curHls.audioTracks : [];
	var subTracks = (curHls && curHls.subtitleTracks) ? curHls.subtitleTracks : [];

	var curAud = curHls ? curHls.audioTrack : 0;
	var curSub = curHls ? curHls.subtitleTrack : -1;

	// Audio column
	var ah = '';
	if (!audTracks.length) {
		ah = '<div class="ptd-item active"><span class="ptd-name">Predefinito (Stereo)</span><span class="ptd-check">✓</span></div>';
	} else {
		for (var i = 0; i < audTracks.length; i++) {
			var isAct = (i === curAud);
			var isFoc = (tracksCol === 0 && i === tracksAudIdx);
			var tName = audTracks[i].name || audTracks[i].lang || ('Traccia ' + (i + 1));
			ah += '<div class="ptd-item' + (isAct ? ' active' : '') + (isFoc ? ' focused' : '') + '" data-aix="' + i + '">'
				+ '<span class="ptd-name">' + esc(tName) + '</span>'
				+ (isAct ? '<span class="ptd-check">✓</span>' : '')
				+ '</div>';
		}
	}
	audList.innerHTML = ah;

	// Subtitles column
	var sh = '';
	var isOffAct = (curSub === -1);
	var isOffFoc = (tracksCol === 1 && tracksSubIdx === -1);
	sh += '<div class="ptd-item' + (isOffAct ? ' active' : '') + (isOffFoc ? ' focused' : '') + '" data-six="-1">'
		+ '<span class="ptd-name">Disattivati</span>'
		+ (isOffAct ? '<span class="ptd-check">✓</span>' : '')
		+ '</div>';

	for (var j = 0; j < subTracks.length; j++) {
		var isSubAct = (j === curSub);
		var isSubFoc = (tracksCol === 1 && j === tracksSubIdx);
		var sName = subTracks[j].name || subTracks[j].lang || ('Sottotitolo ' + (j + 1));
		sh += '<div class="ptd-item' + (isSubAct ? ' active' : '') + (isSubFoc ? ' focused' : '') + '" data-six="' + j + '">'
			+ '<span class="ptd-name">' + esc(sName) + '</span>'
			+ (isSubAct ? '<span class="ptd-check">✓</span>' : '')
			+ '</div>';
	}
	subList.innerHTML = sh;

	var focusedEl = d.querySelector('.ptd-item.focused');
	if (focusedEl) scrIn(focusedEl, false);
}
function keyTracksDrawer(k) {
	var audTracks = (curHls && curHls.audioTracks) ? curHls.audioTracks : [];
	var subTracks = (curHls && curHls.subtitleTracks) ? curHls.subtitleTracks : [];

	if (k === 37) { // Left -> Audio, oppure chiudi se già su Audio
		if (tracksCol === 0) {
			openTracksDrawer(false);
			return;
		}
		tracksCol = 0;
		renderTracksDrawer();
		return;
	}
	if (k === 39) { // Right -> Subtitles
		tracksCol = 1;
		renderTracksDrawer();
		return;
	}
	if (k === 38) { // Up
		if (tracksCol === 0) {
			if (tracksAudIdx > 0) tracksAudIdx--;
		} else {
			if (tracksSubIdx > -1) tracksSubIdx--;
		}
		renderTracksDrawer();
		return;
	}
	if (k === 40) { // Down
		if (tracksCol === 0) {
			if (tracksAudIdx < audTracks.length - 1) tracksAudIdx++;
		} else {
			if (tracksSubIdx < subTracks.length - 1) tracksSubIdx++;
		}
		renderTracksDrawer();
		return;
	}
	if (k === 13) { // OK -> Apply
		if (tracksCol === 0 && curHls && audTracks.length) {
			curHls.audioTrack = tracksAudIdx;
		} else if (tracksCol === 1 && curHls) {
			curHls.subtitleTrack = tracksSubIdx;
		}
		renderTracksDrawer();
		updateRealStreamBadges();
		return;
	}
	if (k === 461 || k === 8 || k === 27 || k === 405) {
		openTracksDrawer(false);
		return;
	}
}

/* ---------------- Real Stream Metadata Badges ---------------- */
function updateRealStreamBadges() {
	var v = $('video');
	if (!v) return;
	var w = v.videoWidth || 0, h = v.videoHeight || 0;
	var curLevel = (curHls && curHls.levels && curHls.currentLevel >= 0) ? curHls.levels[curHls.currentLevel] : null;
	if ((!w || !h) && curLevel) {
		w = curLevel.width || 0;
		h = curLevel.height || 0;
	}

	var resHtml = '';
	if (h >= 2160 || w >= 3840) resHtml = '<span class="hbadge real-res real-4k">4K UHD</span>';
	else if (h >= 1080 || w >= 1920) resHtml = '<span class="hbadge real-res real-fhd">1080p FHD</span>';
	else if (h >= 720 || w >= 1280) resHtml = '<span class="hbadge real-res real-hd">720p HD</span>';
	else if (h > 0) resHtml = '<span class="hbadge real-res real-sd">' + h + 'p SD</span>';
	else resHtml = '<span class="hbadge real-res real-hd">HD</span>';

	var brHtml = '';
	if (curLevel && curLevel.bitrate) {
		brHtml = '<span class="mbadge tech">' + (curLevel.bitrate / 1000000).toFixed(1) + ' Mbps</span>';
	}

	var codHtml = '';
	if (curLevel && curLevel.attrs && curLevel.attrs.CODECS) {
		var cName = curLevel.attrs.CODECS.split(',')[0].trim();
		if (cName.indexOf('avc') === 0) cName = 'AVC / H.264';
		else if (cName.indexOf('hvc') === 0 || cName.indexOf('hev') === 0) cName = 'HEVC / H.265';
		codHtml = '<span class="mbadge tech">' + cName + '</span>';
	}

	var audHtml = '';
	if (curHls && curHls.audioTracks && curHls.audioTracks.length) {
		var aIdx = (tracksAudIdx !== undefined && tracksAudIdx >= 0) ? tracksAudIdx : curHls.audioTrack;
		var curA = curHls.audioTracks[aIdx] || curHls.audioTracks[0];
		audHtml = '<span class="mbadge tech">Audio: ' + esc(curA ? (curA.name || curA.lang) : 'Italiano') + '</span>';
	}

	var subHtml = '';
	if (curHls && curHls.subtitleTracks && curHls.subtitleTracks.length) {
		var sIdx = (tracksSubIdx !== undefined && tracksSubIdx >= -1) ? tracksSubIdx : curHls.subtitleTrack;
		var curS = (sIdx >= 0) ? curHls.subtitleTracks[sIdx] : null;
		subHtml = '<span class="mbadge tech">Sub: ' + esc(curS ? (curS.name || curS.lang) : 'Off') + '</span>';
	}

	var item = curPlayItem || {};
	var baseMeta = '<span class="hbadge ' + (item.isTv ? 'tv' : 'film') + '">' + (item.isTv ? 'SERIE TV' : 'FILM') + '</span>';
	if (item.year) baseMeta += '<span class="mbadge">' + esc(item.year) + '</span>';
	if (item.season && item.n) baseMeta += '<span class="mbadge">Stagione ' + item.season + ' · Ep ' + item.n + '</span>';
	else if (item.season) baseMeta += '<span class="mbadge">Stagione ' + item.season + '</span>';

	$('pmeta').innerHTML = baseMeta + resHtml + brHtml + codHtml + audHtml + subHtml;
}

function triggerAutoNext() {
	if (!dEps || !dEps.length || autoNextDismissed) return;
	var nextIdx = -1;
	for (var i = 0; i < dEps.length; i++) {
		if (curPlayItem && curPlayItem.epId === dEps[i].epId) { nextIdx = i + 1; break; }
	}
	if (nextIdx < 0 || nextIdx >= dEps.length) return;
	var nextEp = dEps[nextIdx];
	$('pan-epname').textContent = nextEp.title;
	$('pautonext').classList.remove('hidden');
	autoNextSec = 5;
	$('pan-sec').textContent = autoNextSec;
	clearInterval(autoNextTimer);
	autoNextTimer = setInterval(function () {
		autoNextSec--;
		if (autoNextSec <= 0) {
			clearInterval(autoNextTimer);
			$('pautonext').classList.add('hidden');
			play(nextEp);
		} else {
			$('pan-sec').textContent = autoNextSec;
		}
	}, 1000);
}
function cancelAutoNext() {
	autoNextDismissed = true;
	clearInterval(autoNextTimer);
	$('pautonext').classList.add('hidden');
}

var curPlayItem = null;
var curHls = null;
var curIframe = null;

function play(item) {
	curPlayItem = item;
	screen = ST.PLAY;
	document.body.classList.add('in-player');
	drawerOpen = false;
	tracksDrawerOpen = false;
	autoNextDismissed = false;
	clearInterval(autoNextTimer);
	$('pautonext').classList.add('hidden');
	$('pdrawer').classList.add('hidden');
	$('ptracksdrawer').classList.add('hidden');
	$('detail').className = 'hidden';
	$('searchview').className = 'hidden';
	$('playerview').className = '';
	$('playmsg').className = '';
	$('playmsg').textContent = 'Risoluzione del canale…';
	$('ptitle').textContent = item.sTitle || item.title || '';
	$('psub').textContent = item.sTitle ? item.title : '';

	if (item.isTv) $('pskipintro').classList.remove('hidden');
	else $('pskipintro').classList.add('hidden');

	if (item.isTv && dEps.length > 1) $('pepsbtn').classList.remove('hidden');
	else $('pepsbtn').classList.add('hidden');

	// Reset meta bar
	$('pmeta').innerHTML = '<span class="hbadge ' + (item.isTv ? 'tv' : 'film') + '">' + (item.isTv ? 'SERIE TV' : 'FILM') + '</span>';

	var plotText = item.plot || (dItem && dItem.plot ? dItem.plot : '');
	if (!plotText && dItem) {
		var extra = [];
		if (dItem.genres) extra.push('Genere: ' + dItem.genres);
		if (dItem.cast) extra.push('Cast: ' + dItem.cast);
		if (dItem.director) extra.push('Regia: ' + dItem.director);
		plotText = extra.join(' · ');
	}
	$('pplot').textContent = plotText || 'Nessuna sinossi disponibile.';
	$('pplot').classList.add('hidden');
	$('ptime').textContent = '00:00 / 00:00';
	$('premaining').textContent = '';
	setHint(HINTS.play);

	var v = $('video');
	v.style.display = '';
	v.muted = false;
	v.volume = 1.0;
	v.ontimeupdate = v.onpause = v.onerror = v.onloadedmetadata = v.onresize = null;
	v.src = '';
	try { v.load(); } catch (e) { }
	if (curHls) { try { curHls.destroy(); } catch (e) {} curHls = null; }
	if (curIframe) { try { curIframe.remove(); } catch (e) {} curIframe = null; }
	var pk = progGet(item.url);

	function useIframe(embUrl) {
		if (curHls) { try { curHls.destroy(); } catch (e) {} curHls = null; }
		v.style.display = 'none';
		$('playmsg').className = 'hidden';
		if (curIframe) curIframe.remove();
		var ifr = document.createElement('iframe');
		ifr.id = 'vix_iframe';
		ifr.style.position = 'absolute';
		ifr.style.top = '0';
		ifr.style.left = '0';
		ifr.style.width = '100%';
		ifr.style.height = '100%';
		ifr.style.border = 'none';
		ifr.setAttribute('allowfullscreen', 'true');
		ifr.setAttribute('webkitallowfullscreen', 'true');
		ifr.setAttribute('allow', 'autoplay; fullscreen');
		ifr.addEventListener('load', function () {
			try {
				var idoc = ifr.contentDocument || (ifr.contentWindow && ifr.contentWindow.document);
				if (idoc && !idoc._backBound) {
					idoc._backBound = true;
					idoc.addEventListener('keydown', function (evt) {
						var ik = evt.keyCode;
						if (ik === 461 || ik === 8 || ik === 27 || ik === 413) {
							evt.preventDefault();
							evt.stopPropagation();
							stopPlay();
						}
					}, true);
				}
			} catch (e) {}
		});
		ifr.src = embUrl;
		curIframe = ifr;
		$('playerview').appendChild(ifr);
	}

	resolveStream(item, 0, function (src, err, emb) {
		if (screen !== ST.PLAY) return;
		if (!src) {
			if (emb) { useIframe(emb); return; }
			$('playmsg').textContent = 'Impossibile riprodurre: ' + (err || 'errore sorgente');
			return;
		}

		if (window.Hls && Hls.isSupported()) {
			// Optimal HLS tuning for webOS 5.6 to completely eliminate video glitches
			var hls = new Hls({
				enableWorker: true,
				lowLatencyMode: false,
				backBufferLength: 20,
				maxBufferLength: 25,
				maxMaxBufferLength: 45,
				maxBufferSize: 30 * 1024 * 1024,
				nudgeOffset: 0.1,
				nudgeMaxRetry: 5,
				startFragPrefetch: true,
				defaultAudioCodec: 'mp4a.40.2'
			});
			curHls = hls;
			hls.loadSource(src);
			hls.attachMedia(v);

			hls.on(Hls.Events.MANIFEST_PARSED, function () {
				$('playmsg').className = 'hidden';
				v.muted = false;
				v.volume = 1.0;
				var p = v.play();
				if (p && p.catch) p.catch(function () {});
				updateRealStreamBadges();
				if (hls.audioTracks && hls.audioTracks.length) tracksAudIdx = hls.audioTrack;
				tracksSubIdx = hls.subtitleTrack;
			});

			hls.on(Hls.Events.LEVEL_SWITCHED, function () {
				updateRealStreamBadges();
			});
			hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, function () {
				updateRealStreamBadges();
			});
			hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, function () {
				updateRealStreamBadges();
			});

			hls.on(Hls.Events.ERROR, function (ev, data) {
				if (data && data.fatal) {
					console.warn('HLS fatal error:', data.details);
					if (emb) useIframe(emb);
					else {
						$('playmsg').className = '';
						$('playmsg').textContent = 'Errore riproduzione stream.';
					}
				}
			});
		} else if (v.canPlayType('application/vnd.apple.mpegurl')) {
			$('playmsg').className = 'hidden';
			v.onerror = function () {
				if (emb) useIframe(emb);
				else { $('playmsg').className = ''; $('playmsg').textContent = 'Il player non riesce a leggere il canale HLS.'; }
			};
			v.src = src;
			v.muted = false;
			v.volume = 1.0;
			v.play();
		} else if (emb) {
			useIframe(emb);
			return;
		} else {
			$('playmsg').textContent = 'Formato HLS non supportato dal browser.';
			return;
		}

		v.onloadedmetadata = v.onresize = updateRealStreamBadges;

		if (pk && pk.p > 5 && (!pk.d || pk.p < pk.d * PROG_END)) {
			var onm = function () {
				v.removeEventListener('loadedmetadata', onm);
				try { v.currentTime = Math.max(0, pk.p - 10); } catch (e) { }
			};
			v.addEventListener('loadedmetadata', onm);
		}

		var lastSave = 0;
		v.ontimeupdate = function () {
			if (v.duration > 0) {
				$('ptimer').style.width = pct(v.currentTime / v.duration) + '%';
				$('ptime').textContent = mmss(v.currentTime) + ' / ' + mmss(v.duration);
				var rem = v.duration - v.currentTime;
				$('premaining').textContent = '-' + mmss(rem);

				try {
					if (v.buffered && v.buffered.length > 0) {
						var bufEnd = v.buffered.end(v.buffered.length - 1);
						$('pbuffer').style.width = pct(bufEnd / v.duration) + '%';
					}
				} catch (e) {}

				if (item.isTv && v.currentTime < 150) {
					$('pskipintro').classList.remove('hidden');
				} else {
					$('pskipintro').classList.add('hidden');
				}

				if (item.isTv && rem <= 20 && rem > 2 && !autoNextDismissed && $('pautonext').classList.contains('hidden')) {
					triggerAutoNext();
				}
			}
			var now = Date.now();
			if (now - lastSave > 2500 && v.duration > 0) {
				lastSave = now;
				progSave(item, v.currentTime, v.duration);
			}
		};
		v.onpause = function () { progSave(item, v.currentTime, v.duration); playbarShow(); };
	});
	playbarShow();
}

function stopPlay() {
	clearInterval(autoNextTimer);
	if (curHls) {
		try { curHls.destroy(); } catch (e) {}
		curHls = null;
	}
	if (curIframe) {
		try { curIframe.remove(); } catch (e) {}
		curIframe = null;
	}
	var v = $('video');
	v.style.display = '';
	try { v.pause(); } catch (e) { }
	if (curPlayItem && v.duration > 0) progSave(curPlayItem, v.currentTime, v.duration);
	v.ontimeupdate = v.onpause = v.onerror = v.onloadedmetadata = v.onresize = null;
	v.src = '';
	try { v.load(); } catch (e) { }
	$('playerview').className = 'hidden';
	document.body.classList.remove('in-player');
	refreshShelvesProgressOnly();
	if (dItem) {
		screen = ST.DETAIL;
		$('detail').className = '';
		setHint(HINTS.detail);
		try {
			if (!$('dplay')) renderDettaglio();
			else renderDetInter();
		} catch (e) {
			screen = ST.HOME;
			setHint(HINTS.home);
			renderHome();
		}
	} else {
		screen = ST.HOME;
		setHint(HINTS.home);
	}
}

/* ---------------- RICERCA CON TASTIERA TV ---------------- */
function renderKbd() {
	var h = '';
	for (var r = 0; r < KBD_ROWS.length; r++) {
		h += '<div class="kbd-row">';
		for (var c = 0; c < KBD_ROWS[r].length; c++) {
			var k = KBD_ROWS[r][c];
			var isFocused = (sZone === 'kbd' && r === kbdR && c === kbdC);
			if (typeof k === 'object') {
				h += '<div class="kbd-key ' + k.w + (isFocused ? ' focused' : '') + '" data-kr="' + r + '" data-kc="' + c + '" data-act="' + k.id + '">' + esc(k.label) + '</div>';
			} else {
				h += '<div class="kbd-key' + (isFocused ? ' focused' : '') + '" data-kr="' + r + '" data-kc="' + c + '">' + esc(k) + '</div>';
			}
		}
		h += '</div>';
	}
	$('skbd').innerHTML = h;
}
function apriRicerca() {
	screen = ST.SEARCH;
	sGrid = false; sIdx = 0;
	sZone = 'kbd'; kbdR = 1; kbdC = 0;
	$('detail').className = 'hidden';
	$('searchview').className = '';
	$('smsg').textContent = 'Digita un titolo con la tastiera o usa il cursore.';
	$('sgrid').innerHTML = '';
	$('sgrid').className = 'hidden';
	$('sinput').value = sQuery;
	setHint(HINTS.search);
	renderKbd();
}
function chiudiRicerca() {
	try { $('sinput').blur(); } catch (e) { }
	$('searchview').className = 'hidden';
	curNav = 'home';
	screen = ST.HOME;
	syncSidebarFocus();
	setHint(HINTS.home);
}
var searchDebounceTimer = null;
function handleKbdKey(act, char) {
	var inp = $('sinput');
	if (act === 'space') {
		inp.value += ' ';
	} else if (act === 'del') {
		inp.value = inp.value.slice(0, -1);
	} else if (act === 'clear') {
		inp.value = '';
	} else if (char) {
		inp.value += char;
	}
	clearTimeout(searchDebounceTimer);
	searchDebounceTimer = setTimeout(function () {
		if (inp.value.trim().length >= 2) faiRicerca();
	}, 450);
}
function faiRicerca() {
	var q = $('sinput').value.replace(/^\s+|\s+$/g, '');
	if (!q) return;
	sQuery = q;
	$('smsg').textContent = 'Cerco «' + q + '»…';
	apiSearch(q, function (items) {
		if (screen !== ST.SEARCH) return;
		sItems = items || [];
		if (!sItems.length) { $('smsg').textContent = 'Nessun risultato per «' + q + '».'; return; }
		$('smsg').textContent = sItems.length + ' risultati · ↓ per scorrere';
		sGrid = true;
		var h = '';
		for (var i = 0; i < sItems.length; i++)
			h += '<div class="card' + (i === sIdx ? ' focused' : '') + '" data-sx="' + i + '">' + cardHtml(sItems[i], true) + '</div>';
		$('sgrid').innerHTML = h;
		$('sgrid').className = '';
	});
}
function keySearch(k) {
	if (k === 461 || k === 8 || k === 27) {
		if (sZone === 'grid') { sZone = 'kbd'; renderKbd(); return; }
		chiudiRicerca();
		return;
	}
	if (sZone === 'kbd') {
		var row = KBD_ROWS[kbdR];
		if (k === 37) {
			if (kbdC > 0) kbdC--;
			else {
				hz = 'sidebar';
				sidebarExpand(true);
				syncSidebarFocus();
				setHint(HINTS.sidebar);
				return;
			}
		} else if (k === 39) {
			if (kbdC < row.length - 1) kbdC++;
		} else if (k === 38) {
			if (kbdR > 0) {
				kbdR--;
				kbdC = Math.min(kbdC, KBD_ROWS[kbdR].length - 1);
			}
		} else if (k === 40) {
			if (kbdR < KBD_ROWS.length - 1) {
				kbdR++;
				kbdC = Math.min(kbdC, KBD_ROWS[kbdR].length - 1);
			} else if (sGrid && sItems.length > 0) {
				sZone = 'grid';
				sIdx = 0;
				renderKbd();
				var cards = $('sgrid').querySelectorAll('.card');
				Array.prototype.forEach.call(cards, function (c, i) { c.classList.toggle('focused', i === sIdx); });
				scrIn(cards[0], true);
				return;
			}
		} else if (k === 13) {
			var keyVal = row[kbdC];
			if (typeof keyVal === 'object') handleKbdKey(keyVal.id, null);
			else handleKbdKey(null, keyVal);
			renderKbd();
			return;
		}
		renderKbd();
		return;
	}
	if (sZone === 'grid') {
		var per = 7, n = sItems.length;
		if (k === 37) sIdx = Math.max(0, sIdx - 1);
		else if (k === 39) sIdx = Math.min(n - 1, sIdx + 1);
		else if (k === 38) {
			if (sIdx < per) {
				sZone = 'kbd';
				renderKbd();
				return;
			}
			sIdx = Math.max(0, sIdx - per);
		} else if (k === 40) {
			sIdx = Math.min(n - 1, sIdx + per);
		} else if (k === 13) {
			var it = sItems[sIdx];
			if (it) apriDettaglio(refItem(it), 'search');
			return;
		}
		var allCards = $('sgrid').querySelectorAll('.card');
		Array.prototype.forEach.call(allCards, function (c, i) { c.classList.toggle('focused', i === sIdx); });
		scrIn(allCards[sIdx], true);
		return;
	}
}

/* ---------------- Gestione Eventi Telecomando / Tastiera ---------------- */
document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	if (screen === ST.PLAY) {
		playbarShow();
		var v = $('video');

		// In Audio / Subtitles drawer mode
		if (tracksDrawerOpen) {
			keyTracksDrawer(k);
			e.preventDefault(); return;
		}

		// In episode drawer mode
		if (drawerOpen) {
			if (k === 38 && drawerIdx > 0) { drawerIdx--; renderEpisodeDrawer(); e.preventDefault(); return; }
			if (k === 40 && drawerIdx < dEps.length - 1) { drawerIdx++; renderEpisodeDrawer(); e.preventDefault(); return; }
			if (k === 13) {
				openEpisodeDrawer(false);
				play(dEps[drawerIdx]);
				e.preventDefault(); return;
			}
			if (k === 461 || k === 8 || k === 27 || k === 39) {
				openEpisodeDrawer(false);
				e.preventDefault(); return;
			}
		}

		// Auto next modal
		if (!$('pautonext').classList.contains('hidden')) {
			if (k === 13) {
				cancelAutoNext();
				var nextEp = null;
				for (var i = 0; i < dEps.length; i++) {
					if (curPlayItem && curPlayItem.epId === dEps[i].epId) { nextEp = dEps[i + 1]; break; }
				}
				if (nextEp) play(nextEp);
				e.preventDefault(); return;
			}
			if (k === 461 || k === 8 || k === 27) {
				cancelAutoNext();
				e.preventDefault(); return;
			}
		}

		// Yellow remote button (405): Toggle Audio & Subtitles Drawer
		if (k === 405) {
			openTracksDrawer();
			e.preventDefault(); return;
		}

		// OK key (13) toggles pause / play
		if (k === 13) {
			if (v.paused) { try { v.play(); } catch (er) {} }
			else { try { v.pause(); } catch (er) {} }
			e.preventDefault(); return;
		}
		// Back / Stop keys exit player
		if (k === 461 || k === 8 || k === 27 || k === 413) {
			if (!$('pinfo').classList.contains('hidden')) {
				togglePlayInfo(false);
				e.preventDefault(); return;
			}
			stopPlay();
			e.preventDefault(); return;
		}
		// Play / Pause media keys
		if (k === 415 || k === 10252) { try { v.play(); } catch (er) {} }
		else if (k === 19 || k === 10253) { try { v.pause(); } catch (er) {} }
		// D-Pad Up (38) shows content info synopsis & options
		if (k === 38) {
			togglePlayInfo(true);
			e.preventDefault(); return;
		}
		// D-Pad Down (40) hides content info synopsis
		if (k === 40) {
			togglePlayInfo(false);
			e.preventDefault(); return;
		}
		// Seeking: Left / Rewind (37, 412), Right / FastForward (39, 417)
		if (k === 37 || k === 412) { try { v.currentTime = Math.max(0, v.currentTime - 10); } catch (er) {} }
		else if (k === 39 || k === 417) { try { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 30); } catch (er) {} }
		else if (k === 421) { try { v.currentTime = Math.max(0, v.currentTime - 60); } catch (er) {} }
		else if (k === 422) { try { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 60); } catch (er) {} }
		// Blue button or shortcut for skip intro (+85s)
		else if (k === 406 || k === 428) {
			try { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 85); } catch (er) {}
		}
		e.preventDefault(); return;
	}
	if (screen === ST.DETAIL) { keyDetail(k); e.preventDefault(); return; }
	if (screen === ST.SEARCH) { keySearch(k); e.preventDefault(); return; }
	if (screen === ST.BROWSE || screen === ST.WATCHLIST) { keyBrowse(k); e.preventDefault(); return; }
	keyHome(k); e.preventDefault();
});

/* ---------------- Gestione Clic Mouse / Puntatore ---------------- */
document.addEventListener('click', function (e) {
	var el = e.target, cl = el.classList;

	// Sidebar Nav Item Clicks
	var navItem = cl.contains('nav-item') ? el : (el.closest ? el.closest('.nav-item') : null);
	if (navItem) {
		var navKey = navItem.getAttribute('data-nav');
		for (var ni = 0; ni < NAV_KEYS.length; ni++) if (NAV_KEYS[ni] === navKey) navIdx = ni;
		sidebarAction();
		return;
	}

	if (screen === ST.PLAY) {
		if (el.id === 'pclose' || (el.closest && el.closest('#pclose'))) { stopPlay(); return; }
		if (el.id === 'pskipintro' || (el.closest && el.closest('#pskipintro'))) {
			var vSkip = $('video');
			try { vSkip.currentTime = Math.min(vSkip.duration || Infinity, vSkip.currentTime + 85); } catch (er) {}
			return;
		}
		if (el.id === 'pepsbtn' || (el.closest && el.closest('#pepsbtn'))) {
			openEpisodeDrawer();
			return;
		}
		if (el.id === 'ptracksbtn' || (el.closest && el.closest('#ptracksbtn'))) {
			openTracksDrawer();
			return;
		}
		if (el.id === 'ptd-close' || (el.closest && el.closest('#ptd-close'))) {
			openTracksDrawer(false);
			return;
		}
		if (tracksDrawerOpen && (!el.closest || (!el.closest('#ptracksdrawer') && !el.closest('#ptracksbtn')))) {
			openTracksDrawer(false);
			return;
		}

		// Tracks Drawer click
		var ptdItem = cl.contains('ptd-item') ? el : (el.closest ? el.closest('.ptd-item') : null);
		if (ptdItem) {
			var aix = ptdItem.getAttribute('data-aix');
			var six = ptdItem.getAttribute('data-six');
			if (aix != null && curHls) {
				curHls.audioTrack = +aix;
				tracksAudIdx = +aix;
				renderTracksDrawer();
				updateRealStreamBadges();
				return;
			}
			if (six != null && curHls) {
				curHls.subtitleTrack = +six;
				tracksSubIdx = +six;
				renderTracksDrawer();
				updateRealStreamBadges();
				return;
			}
		}

		if (el.id === 'pan-playnow' || (el.closest && el.closest('#pan-playnow'))) {
			cancelAutoNext();
			var nextEp = null;
			for (var i = 0; i < dEps.length; i++) {
				if (curPlayItem && curPlayItem.epId === dEps[i].epId) { nextEp = dEps[i + 1]; break; }
			}
			if (nextEp) play(nextEp);
			return;
		}
		if (el.id === 'pan-cancel' || (el.closest && el.closest('#pan-cancel'))) {
			cancelAutoNext();
			return;
		}
		var dItemEl = cl.contains('pdraw-item') ? el : (el.closest ? el.closest('.pdraw-item') : null);
		if (dItemEl) {
			var dix = +dItemEl.getAttribute('data-dix');
			openEpisodeDrawer(false);
			play(dEps[dix]);
			return;
		}
		playbarShow();
		if (el.id === 'video' || el.id === 'playerview' || cl.contains('pbar') || cl.contains('pbar-rail')) {
			var v2 = $('video');
			if (v2.paused) { try { v2.play(); } catch (er) {} }
			else { try { v2.pause(); } catch (er) {} }
		}
		return;
	}
	if (screen === ST.DETAIL) {
		if (el.id === 'dplay') {
			if (dItem.isTv) {
				if (dEps && dEps.length) { play(dEps[0]); return; }
				var sN = (dItem.seasons && dItem.seasons.length) ? dItem.seasons[0].n : 1;
				setHint('Carico l’episodio 1…');
				apiEpisodes(dItem, sN, function (eps) {
					if (eps && eps.length) { dEps = eps; play(eps[0]); }
					else play(dItem);
				});
				return;
			}
			play(dItem); return;
		}
		if (el.id === 'dwatchlist' || (el.closest && el.closest('#dwatchlist'))) {
			watchToggle(dItem);
			renderDetInter();
			return;
		}
		if (el.id === 'dtrailer') { window.open('https://www.youtube.com/watch?v=' + dItem.trailer, '_blank'); return; }
		var ch = cl.contains('chip') ? el : (el.parentElement && el.parentElement.classList.contains('chip') ? el.parentElement : null);
		if (ch) { dChip = seasonIndex(+ch.getAttribute('data-season')); dSeason = +ch.getAttribute('data-season'); dFocus = 3; pickSeason(dSeason); return; }
		var ep = cl.contains('ep') ? el : (cl.contains('eimg') || cl.contains('etit') || cl.contains('eplot') ? el.parentElement : null);
		if (ep) { dEp = +ep.getAttribute('data-ep'); dFocus = 4; play(dEps[dEp]); return; }
		chiudiDettaglio(); return;
	}
	if (screen === ST.SEARCH) {
		var kbdKey = cl.contains('kbd-key') ? el : (el.closest ? el.closest('.kbd-key') : null);
		if (kbdKey) {
			var act = kbdKey.getAttribute('data-act');
			var char = kbdKey.textContent;
			handleKbdKey(act, char);
			return;
		}
		if (el.id === 'sgo') { faiRicerca(); return; }
		if (el.id === 'sclose' || cl.contains('vclose') || (el.closest && el.closest('.vclose'))) { chiudiRicerca(); return; }
		var c = cl.contains('card') ? el : (el.parentElement && el.parentElement.classList.contains('card') ? el.parentElement : null);
		if (c) { sIdx = +c.getAttribute('data-sx'); var it = sItems[sIdx]; if (it) apriDettaglio(refItem(it), 'search'); }
		return;
	}
	if (el.id === 'hplay') { heroFocus = 0; heroAction(); return; }
	if (el.id === 'hinfo') { heroFocus = 1; heroAction(); return; }
	if (el.id === 'hwatchlist' || (el.closest && el.closest('#hwatchlist'))) { heroFocus = 2; heroAction(); return; }
	var card = cl.contains('card') ? el : (!cl.contains('shelf') && el.parentElement && el.parentElement.classList.contains('card') ? el.parentElement : null);
	if (card) {
		if (card.getAttribute('data-bx') != null) { bIdx = +card.getAttribute('data-bx'); keyBrowse(13); return; }
		var mo = card.getAttribute('data-more');
		if (mo != null) { apriBrowse(mo); return; }
		var sh = +card.getAttribute('data-sh'), ix = +card.getAttribute('data-ix');
		var s = shelves[sh];
		if (!s) return;
		hz = 'row'; fRow = sh;
		if (ix >= s.items.length && s.arch) { apriBrowse(s.arch); return; }
		fX = Math.min(ix, s.items.length - 1);
		var it2 = s.items[fX];
		if (s.cont && it2.kind === 'ep') { play(it2); return; }
		apriDettaglio(refItem(it2));
	}
});

document.addEventListener('mousewheel', function (e) {
	if (screen !== ST.HOME && screen !== ST.BROWSE && screen !== ST.SEARCH && screen !== ST.WATCHLIST) return;
	var d = e.wheelDelta || -e.deltaY;
	var t = e.target, box = null;
	while (t && t !== document.body) {
		if (t.scrollHeight > t.clientHeight + 4 && window.getComputedStyle(t).overflowY !== 'visible') { box = t; break; }
		t = t.parentElement;
	}
	if (box) box.scrollTop += d > 0 ? -120 : 120;
}, false);

/* ---------------- Avvio Applicazione ---------------- */
clockTick(); setInterval(clockTick, 1000);
setHint(HINTS.home);
$('srcinfo').textContent = 'Catalogo online · StreamingCommunity · italiano';

(function avvio() {
	var cont = progShelf();
	if (cont.length) shelves.push({ title: 'CONTINUA A GUARDARE', items: cont, cont: true });
	var ws = watchShelf();
	if (ws) shelves.push(ws);

	function ordine() {
		var tag = ['CONTINUA A GUARDARE', 'LA MIA LISTA', 'TRENDING', 'NOVITÀ', 'TOP 10', 'SERIE TV · ULTIMI EPISODI', 'FILM · NUOVI'];
		var olds = shelves.slice();
		shelves = [];
		tag.forEach(function (t) {
			olds.forEach(function (s) { if (s.title === t && s.items && s.items.length) shelves.push(s); });
		});
	}

	renderHome();
	apiHome(function (res) {
		if (res) {
			if (res.trending) shelves.push({ title: 'TRENDING', items: res.trending });
			if (res.latest) shelves.push({ title: 'NOVITÀ', items: res.latest });
			if (res.top10) shelves.push({ title: 'TOP 10', items: res.top10 });
		}
		ordine();
		if (!shelves.length) $('shelves').innerHTML = '<div class="derr" style="padding-top:30vh;text-align:center">Impossibile contattare StreamingCommunity.<br><br>Riprova più tardi (Back per riavviare).</div>';
		else renderHome();
	});
	apiArchive('tv', 1, function (r) { if (r && r.items.length) shelves.push({ title: 'SERIE TV · ULTIMI EPISODI', items: r.items.slice(0, 18), arch: 'tv' }); ordine(); renderHome(); });
	apiArchive('movie', 1, function (r) { if (r && r.items.length) shelves.push({ title: 'FILM · NUOVI', items: r.items.slice(0, 18), arch: 'movie' }); ordine(); renderHome(); });
})();

window.__nus = {
	getShelves: function () { return shelves; },
	getHeroItem: function () { return heroItem; },
	getScreen: function () { return screen; },
	getHls: function () { return curHls; },
	play: play,
	apriDettaglio: apriDettaglio,
	resolveStream: resolveStream,
	toggleTracksDrawer: openTracksDrawer,
	updateRealStreamBadges: updateRealStreamBadges
};
})();
