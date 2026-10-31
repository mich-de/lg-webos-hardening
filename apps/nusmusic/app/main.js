/* NusMusic — Music player MP3/FLAC dal NAS Brume via HTTP, per webOS 5.x (rooted, webapp) _org.nusmusic.app_
 * Nessun framework, nessun build, nessun CDN: JS vanilla. Dati solo da http://192.168.188.56:8080/ (lighttpd autoindex).
 * Target Chromium 79: niente ?. / ??, niente gap su flex, niente inset CSS.
 * Pattern UI identico a NuSport (org.nusport.app): topbar + barra + lista, zone di fuoco,
 * Magic Remote (click, rotella, VK 13 OK / 461 8 27 Back / frecce), messaggi di errore in italiano.
 */

(function () {
'use strict';

/* ---------------- Config ---------------- */
var NAS = 'http://192.168.188.56:8080/';
var NAS_LABEL = 'NAS Brume';
var MAX_DEPTH = 4;        // ricorsione max 4 livelli di sotto-cartelle
var CONC = 3;             // richieste autoindex in parallelo
var VISIBLE = 14;         // righe di playlist visibili
var EXT = ['mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg'];
var APP_KEY = 'nusmusic.cfg';

/* ---------------- localStorage ---------------- */
function lsGet(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage pieno/bloccato: resta in memoria */ } }
var cfg = lsGet(APP_KEY, {});
cfg.search = typeof cfg.search === 'string' ? cfg.search : '';
cfg.shuffle = !!cfg.shuffle;
cfg.loop = !!cfg.loop;
cfg.lastTrack = String(cfg.lastTrack || '');
cfg.lastTime = +cfg.lastTime || 0;
function saveCfg() { lsSet(APP_KEY, cfg); }

/* ---------------- Stato ---------------- */
var tracks = [];          // [{name, dir, path, ext, size, url}]
var view = [];            // indici in tracks visibili (filtro attivo)
var loading = true;
var netErr = null;        // errore root del crawl
var crawlSeq = 0;         // scarta risposte di crawl vecchi se si preme Aggiorna
var zone = 'list';        // 'bar' | 'list'
var fBar = 0;             // barra: -1 ricerca, 0..2 bottoni
var searching = false;    // input ricerca a fuoco
var curIdx = 0;           // brano a fuoco in view
var topIdx = 0;           // prima riga visibile
var player = null;        // null | {ti: indice in tracks, i: indice in view}
var fBtn = 2;             // bottone HUD a fuoco (HUD order)
var toastTm = null;

/* ---------------- Utils ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
	return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
	});
}
function pad(n) { return ('0' + n).slice(-2); }
function hhmmss(v) { v = Math.max(0, Math.floor(v || 0)); return Math.floor(v / 60) + ':' + pad(v % 60); }
function fmtSize(b) {
	b = +b; if (!b || b < 0) return '';
	if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
	if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
	return Math.round(b / 1024) + ' KB';
}
function extOf(name) {
	var i = String(name).lastIndexOf('.');
	return i < 0 ? '' : String(name).slice(i + 1).toLowerCase();
}
function baseOf(p) { var s = String(p).replace(/\/+$/, ''); var i = s.lastIndexOf('/'); return i < 0 ? s : s.slice(i + 1); }
function encSeg(segments) {
	return segments.filter(Boolean).map(encodeURIComponent).join('/');
}
function dirUrl(dir) {
	return NAS + encSeg(String(dir || '').split('/')) + '/';
}
function trackUrl(t) {
	return NAS + encSeg(String(t.dir || '').split('/')) + '/' + encodeURIComponent(t.name);
}
function toast(msg, isErr, ms) {
	var t = $('toast');
	t.textContent = msg;
	t.className = isErr ? 'err' : '';
	clearTimeout(toastTm);
	toastTm = setTimeout(function () { t.className = 'hidden'; }, ms || 4500);
}

/* ---------------- HTTP (XHR) ---------------- */
function httpGet(url, timeoutMs) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = timeoutMs || 12000;
		xhr.onload = function () {
			if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
			else reject(new Error('HTTP ' + xhr.status));
		};
		xhr.onerror = function () {
			reject(new Error('richiesta bloccata dal TV (pagina file:// verso HTTP di rete locale / CORS assente sul NAS) o rete assente'));
		};
		xhr.ontimeout = function () { reject(new Error('timeout')); };
		try { xhr.send(null); } catch (e) { reject(new Error('eccezione XHR')); }
	});
}

/* ---------------- Parser lighttpd autoindex ----------------
 * Righe <tr class="d"> = directory, <tr> = file con <a href> e size in td[data-value].
 */
function parseIndex(text, dirPath) {
	var out = { dirs: [], files: [] };
	var doc = new DOMParser().parseFromString(text, 'text/html');
	var rows = doc.querySelectorAll('tr');
	for (var i = 0; i < rows.length; i++) {
		var tr = rows[i];
		var a = tr.querySelector('a[href]');
		if (!a) continue;
		var href = a.getAttribute('href') || '';
		if (!href || href.charAt(0) === '#' || href.charAt(0) === '?' || href.indexOf('://') >= 0) continue;
		var cls = tr.className || '';
		var isDir = /(^|\s)d(\s|$)/.test(cls) || href.slice(-1) === '/';
		var dec = href;
		try { dec = decodeURIComponent(href); } catch (e) { /* href con % non codificati: uso com'è */ }
		dec = dec.replace(/^(?:[.][.]?\/)+/, '').replace(/\/+$/, '') + (isDir ? '/' : '');
		var name = baseOf(dec);
		if (!name || name === '..' || name === '.') continue;
		if (isDir) {
			out.dirs.push(name + '/');
		} else {
			if (EXT.indexOf(extOf(name)) < 0) continue;      // solo audio
			var szEl = tr.querySelector('[data-value]');
			out.files.push({ name: name, dir: dirPath, size: szEl ? szEl.getAttribute('data-value') : '' });
		}
	}
	return out;
}

/* ---------------- Crawl BFS in background ---------------- */
var scanHint = $('scanhint');
function updateScan(done, tot, extra) {
	scanHint.textContent = NAS_LABEL + ': cartelle ' + done + '/' + tot + ' · ' + tracks.length + ' brani' + (extra ? ' · ' + extra : '');
	scanHint.className = 'hint' + (extra ? ' err' : '');
}
function crawl() {
	var seq = ++crawlSeq;
	loading = true; netErr = null;
	tracks = []; view = [];
	render();
	var visited = {};
	var dirs = ['', 0];              // [path, depth] — root
	var queue = [dirs];
	var qi = 0, active = 0, dirsDone = 0, dirsTotal = 1, lastDirErr = false;
	updateScan(dirsDone, dirsTotal);

	function maybeFinish() {
		if (active > 0 || qi < queue.length) return;
		if (seq !== crawlSeq) return;                 // Aggiorna ha ripreso il crawl
		loading = false;
		tracks.sort(function (x, y) {
			return String(x.dir).localeCompare(String(y.dir), undefined, { numeric: true, sensitivity: 'base' })
				|| String(x.name).localeCompare(String(y.name), undefined, { numeric: true, sensitivity: 'base' });
		});
		updateScan(dirsDone, dirsTotal, '');          // reset hint in fondo
		finishLoad();
		return;
	}
	function step() {
		if (seq !== crawlSeq) return;
		while (qi < queue.length && active < CONC) {
			(function (item) {                        // cattura per iterazione (var non basta)
				var dirPath = item[0], depth = item[1];
				if (visited[dirPath]) { maybeFinish(); return; }
				visited[dirPath] = 1;
				active++;
				httpGet(dirUrl(dirPath)).then(function (text) {
					if (seq !== crawlSeq) return;
					var p = parseIndex(text, dirPath);
					for (var k = 0; k < p.dirs.length; k++) {
						if (depth + 1 <= MAX_DEPTH) { queue.push([dirPath + p.dirs[k], depth + 1]); dirsTotal++; }
					}
					for (var j = 0; j < p.files.length; j++) {
						tracks.push({ name: p.files[j].name, dir: dirPath, path: dirPath + p.files[j].name,
							ext: extOf(p.files[j].name), size: p.files[j].size });
					}
				}).catch(function (err) {
					if (depth === 0) {
						// la root deve rispondere, altrimenti niente playlist
						netErr = String((err && err.message) || err).slice(0, 60);
					} else {
						lastDirErr = true;            // solo un hint: la root invece deve rispondere
					}
				}).then(function () {
					active--; dirsDone++;
					updateScan(dirsDone, dirsTotal, lastDirErr ? 'alcune cartelle non raggiungibili' : '');
					step();
				});
			})(queue[qi]);
			qi++;
		}
		maybeFinish();
	}
	step();
}

/* ---------------- Filtro + ricerca libera ---------------- */
function rebuild() {
	var q = cfg.search.trim().toLowerCase();
	view = [];
	for (var i = 0; i < tracks.length; i++) {
		if (!q || (tracks[i].name + ' ' + tracks[i].dir).toLowerCase().indexOf(q) >= 0) view.push(i);
	}
	if (curIdx >= view.length) curIdx = Math.max(0, view.length - 1);
	if (topIdx > curIdx) topIdx = Math.max(0, curIdx);
	if (topIdx > Math.max(0, view.length - VISIBLE)) topIdx = Math.max(0, view.length - VISIBLE);
}
function currentTrack() { return view.length ? tracks[view[curIdx]] : null; }

/* ---------------- Render: barra / lista / stati ---------------- */
var BAR = [
	{ id: 'shuffle', lab: '&#9863; Casuale', on: function () { return cfg.shuffle; } },
	{ id: 'loop',    lab: '&#8635; Ripeti',  on: function () { return cfg.loop; } },
	{ id: 'refresh', lab: '&#x21bb; Aggiorna', on: function () { return false; } }
];
function renderBar() {
	var h = '';
	BAR.forEach(function (b, i) {
		h += '<div class="bbtn' + (b.on() ? ' on' : '') + '" data-bar="' + i + '" data-id="' + b.id + '">' + b.lab + '</div>';
	});
	$('barbtns').innerHTML = h;
	var t = tracks.length ? (view.length === tracks.length ? view.length + ' brani' : view.length + ' di ' + tracks.length + ' brani') : 'nessun brano';
	if (cfg.search.trim()) t = 'Filtro "' + cfg.search.trim() + '" · ' + t;
	$('bartitle').textContent = t;
}
function showMsg(kind, title, sub, retry) {
	var nd = $('nulldata');
	nd.className = kind;
	nd.innerHTML = '<div class="nicon">' + (kind === 'err' ? '!' : kind === 'load' ? '' : '&#9834;') + '</div>'
		+ '<div class="ntitle">' + esc(title) + '</div>'
		+ (sub ? '<div class="nsub">' + esc(sub) + '</div>' : '')
		+ (retry ? '<div id="retry">Riprova</div>' : '');
}
function hideMsg() { $('nulldata').className = 'hidden'; }

function renderList() {
	var w = $('tracklist');
	if (!tracks.length) {
		w.innerHTML = '';
		if (loading) showMsg('load', 'Scansione ' + NAS_LABEL + '…', 'cartelle di rete in lettura · max ' + MAX_DEPTH + ' livelli', false);
		else if (netErr) showMsg('err', 'Impossibile raggiungere il NAS', netErr, true);
		else showMsg('empty', 'Nessun file audio trovato',
			'Nessun brano MP3/FLAC/M4A/AAC/WAV/OGG su ' + NAS_LABEL + ' nelle prime ' + MAX_DEPTH + ' cartelle · prova Aggiorna', false);
		return;
	}
	if (!view.length) {
		showMsg('empty', 'Nessun brano corrisponde alla ricerca', 'Filtro: "' + cfg.search.trim() + '" · premi Back per cancellarlo', false);
		return;
	}
	hideMsg();
	var end = Math.min(view.length, topIdx + VISIBLE);
	var h = '', lastDir = null;
	for (var r = topIdx; r < end; r++) {
		var t = tracks[view[r]];
		if (t.dir !== lastDir) {
			lastDir = t.dir;
			h += '<div class="thead">/' + esc(t.dir) + '</div>';
		}
		var playing = player && tracks[player.ti] === t;
		h += '<div class="card' + (playing ? ' playing' : '') + '" data-idx="' + r + '">'
			+ '<span class="tnum">' + (r + 1) + '</span>'
			+ '<span class="tname' + (playing ? ' nowplaying' : '') + '">' + esc(t.name) + '</span>'
			+ '<span class="text">' + esc(t.ext.toUpperCase()) + (t.size ? ' · ' + esc(fmtSize(t.size)) : '') + '</span>'
			+ '</div>';
	}
	if (view.length > VISIBLE) h += '<div class="pager">brani ' + (topIdx + 1) + '\u2013' + end + ' di ' + view.length + '</div>';
	w.innerHTML = h;
}
function render() {
	rebuild();
	renderBar();
	renderList();
	updateFocusUI();
}

/* ---------------- Fuoco / evidenziazione ---------------- */
function updateFocusUI() {
	$('search').classList.toggle('focused', searching || (zone === 'bar' && fBar === -1));
	Array.prototype.forEach.call(document.querySelectorAll('#barbtns .bbtn'), function (el) {
		el.classList.toggle('focused', zone === 'bar' && +el.getAttribute('data-bar') === fBar);
	});
	Array.prototype.forEach.call(document.querySelectorAll('#tracklist .card'), function (el) {
		el.classList.toggle('focused', !searching && zone === 'list' && +el.getAttribute('data-idx') === curIdx);
	});
	var r = $('retry'); if (r) r.classList.toggle('focused', zone === 'list' && !searching);
	Array.prototype.forEach.call(document.querySelectorAll('#phud .hbtn'), function (el) {
		el.classList.toggle('focused', !!player && +el.getAttribute('data-hud') === fBtn);
	});
}

/* ---------------- Player ---------------- */
function renderPlayerInfo() {
	if (!player) return;
	var t = tracks[player.ti];
	$('ptitle').textContent = t.name;
	$('pdir').textContent = '/' + t.dir;
	$('pinfo').innerHTML = '<span class="stamp">' + fmtSize(t.size) + '</span><span class="dim"> · </span>' + t.ext.toUpperCase()
		+ '<span class="dim"> · </span>brano ' + (player.i + 1) + ' di ' + view.length;
}
function openPlayer(i) {
	if (i < 0 || i >= view.length) return;
	var t = tracks[view[i]];
	player = { ti: view[i], i: i };
	var a = $('audio');
	a.src = trackUrl(t);
	a.play().then(null, function () { /* autoplay negato: l'utente preme Play */ });
	$('player').classList.remove('hidden');
	fBtn = 2;
	updateFocusUI();
	renderPlayerInfo();
	renderList();
	updateFocusUI();
	saveLast(t, 0);
	toast('▶ ' + t.name.replace(/\.[^.]+$/, '') + '  (' + (i + 1) + '/' + view.length + ')', false);
}
function closePlayer() {
	var a = $('audio'), t = tracks[player.ti];
	saveLast(t, a.currentTime);
	a.pause();
	var was = t;
	player = null;
	$('player').classList.add('hidden');
	renderList();
	updateFocusUI();
	toast('Player chiuso · a ripresa "' + was.name + '" resta a fuoco', false, 2600);
}
function nextTrack(dir) {
	if (!player) return;
	var i;
	if (cfg.shuffle && view.length > 1) {
		do { i = Math.floor(Math.random() * view.length); } while (i === player.i);
	} else {
		i = player.i + dir;
		if (i >= view.length) { toast('Ultimo brano della playlist', false); return; }
		if (i < 0) { toast('Primo brano della playlist', false); return; }
	}
	openPlayer(i);
}
function togglePlay() {
	var a = $('audio');
	if (!player) return;
	if (a.paused) { a.play().then(null, function () { toast('Riproduzione non ripartita: usa il Play sul remote', true); }); }
	else { a.pause(); saveLast(tracks[player.ti], a.currentTime); }
}
function hudAction(id) {
	if (!player) return;
	var a = $('audio');
	if (id === 'prev' || id === 'next') nextTrack(id === 'prev' ? -1 : 1);
	else if (id === 'back10' || id === 'fwd10') a.currentTime = Math.max(0, Math.min(a.duration || 1e9, a.currentTime + (id === 'fwd10' ? 10 : -10)));
	else if (id === 'playpause') togglePlay();
}
function saveLast(t, time) {
	cfg.lastTrack = t.dir + t.name;
	cfg.lastTime = time;
	saveCfg();
}

/* ---------------- Caricamento completato ---------------- */
function finishLoad() {
	// ripresa: porta a fuoco l'ultimo brano (playlist si riprende dalla cartella corrente)
	var resumed = false;
	if (cfg.lastTrack) {
		for (var i = 0; i < tracks.length && !resumed; i++) {
			if (tracks[i].path === cfg.lastTrack) {
				for (var r = 0; r < view.length; r++) {
					if (view[r] === i) { curIdx = r; topIdx = Math.max(0, r - Math.floor(VISIBLE / 2) + 1); resumed = true; break; }
				}
			}
		}
	}
	if (!resumed) { curIdx = 0; topIdx = 0; }
	renderList(); renderBar(); updateFocusUI();
	if (netErr) {
		showMsg('err', 'Impossibile raggiungere il NAS', netErr, true);
		toast('Errore: ' + NAS_LABEL + ' non risponde', true, 6000);
	} else if (tracks.length) {
		toast('Playlist pronta: ' + tracks.length + ' brani' + (resumed ? ' · ultima traccia a fuoco' : ''), false, 5000);
	}
}

/* ---------------- Navigazione lista ---------------- */
function moveList(d) {
	var n = view.length;
	if (!n) { if (d < 0) { zone = 'bar'; fBar = BAR.length - 1; updateFocusUI(); } return; }
	var nf = curIdx + d;
	if (nf < 0) { topIdx = 0; zone = 'bar'; fBar = BAR.length - 1; renderList(); updateFocusUI(); return; }
	if (nf >= n) return;
	curIdx = nf;
	if (curIdx < topIdx) topIdx = curIdx;
	if (curIdx >= topIdx + VISIBLE) topIdx = curIdx - VISIBLE + 1;
	renderList(); renderBar(); updateFocusUI();
}
function pageList(d) {
	var n = view.length;
	if (!n) return;
	curIdx = Math.max(0, Math.min(n - 1, curIdx + d * VISIBLE));
	topIdx = Math.max(0, Math.min(Math.max(0, n - VISIBLE), Math.floor(curIdx / VISIBLE) * VISIBLE));
	renderList(); renderBar(); updateFocusUI();
}

/* ---------------- Barra azioni ---------------- */
function barAction(id) {
	if (id === 'refresh') { crawl(); return; }
	if (id === 'shuffle') { cfg.shuffle = !cfg.shuffle; saveCfg(); toast('Casuale ' + (cfg.shuffle ? 'attivo' : 'disattivato'), false, 2600); renderBar(); updateFocusUI(); return; }
	if (id === 'loop') {
		cfg.loop = !cfg.loop; saveCfg();
		$('audio').loop = cfg.loop;
		if (player && cfg.loop) toast('Ripeti brano corrente: attivo', false, 2600);
		else toast('Ripeti ' + (cfg.loop ? 'attivo' : 'disattivato'), false, 2600);
		renderBar(); updateFocusUI();
	}
}
function clearSearch() {
	cfg.search = '';
	$('search').value = '';
	saveCfg();
	curIdx = 0; topIdx = 0;
	toast('Ricerca cancellata', false, 2200);
	render(); renderBar();
}

/* ---------------- Click (puntatore Magic Remote) ---------------- */
document.addEventListener('click', function (e) {
	var el = e.target;
	while (el && el.nodeType === 1) {
		if (el.id === 'retry') { crawl(); e.preventDefault(); return; }
		if (el.id === 'search') { searching = true; zone = 'list'; updateFocusUI(); return; }
		if (el.classList.contains('bbtn') && el.hasAttribute('data-bar')) {
			searching = false; zone = 'bar'; fBar = +el.getAttribute('data-bar');
			barAction(el.getAttribute('data-id'));
			updateFocusUI(); e.preventDefault(); return;
		}
		if (el.classList.contains('card') && el.hasAttribute('data-idx')) {
			searching = false; zone = 'list'; curIdx = +el.getAttribute('data-idx') || 0;
			if (curIdx < topIdx) topIdx = curIdx;
			if (curIdx >= topIdx + VISIBLE) topIdx = curIdx - VISIBLE + 1;
			renderList(); updateFocusUI(); openPlayer(curIdx); e.preventDefault(); return;
		}
		if (el.classList.contains('hbtn')) { hudAction(el.getAttribute('data-id')); e.preventDefault(); return; }
		if (el.id === 'pclose') { e.preventDefault(); if (player) closePlayer(); return; }
		el = el.parentNode;
	}
});

/* ---------------- Rotella Magic Remote ---------------- */
document.addEventListener('wheel', function (e) {
	e.preventDefault();
	var d = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
	if (!d) return;
	if (player) {                                   // nel player la rotella regola il volume
		var a = $('audio');
		a.volume = Math.max(0, Math.min(1, a.volume + (d > 0 ? -0.05 : 0.05)));
		toast('Volume ' + Math.round(a.volume * 100) + '%', false, 1600);
		return;
	}
	if (searching) return;
	if (zone !== 'list') { zone = 'list'; updateFocusUI(); if (d < 0) return; }
	if (curIdx === 0 && d < 0) return;              // in cima: resto in lista
	moveList(d);
}, { passive: false });

/* ---------------- Tastiera Magic Remote (VK webOS) ---------------- */
document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	/* --- player aperto --- */
	if (player) {
		var a = $('audio');
		switch (k) {
			case 13: togglePlay(); break;
			case 37: a.currentTime = Math.max(0, a.currentTime - 10); toast('−10s · ' + hhmmss(a.currentTime), false, 1800); break;
			case 39: a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 10); toast('+10s · ' + hhmmss(a.currentTime), false, 1800); break;
			case 38: a.volume = Math.min(1, a.volume + 0.05); toast('Volume ' + Math.round(a.volume * 100) + '%', false, 1600); break;
			case 40: a.volume = Math.max(0, a.volume - 0.05); toast('Volume ' + Math.round(a.volume * 100) + '%', false, 1600); break;
			case 412: nextTrack(-1); break;                        // VK_REWIND
			case 417: nextTrack(1); break;                         // VK_FFWD
			case 415: if (a.paused) a.play(); break;               // VK_PLAY
			case 19: case 413:                                     // VK_PAUSE / VK_STOP
				if (!a.paused) { a.pause(); saveLast(tracks[player.ti], a.currentTime); }
				else if (k === 413) closePlayer();
				break;
			case 461: case 8: case 27: closePlayer(); break;       // Back
			default: return;
		}
		e.preventDefault(); return;
	}
	/* --- input ricerca a fuoco --- */
	if (searching) {
		if (k === 461 || k === 27) { searching = false; $('search').blur(); updateFocusUI(); e.preventDefault(); return; }
		if (k === 13) { searching = false; $('search').blur(); zone = 'list'; curIdx = 0; topIdx = 0; renderList(); updateFocusUI(); e.preventDefault(); return; }
		if (k >= 37 && k <= 40) e.preventDefault();   // frecce: non muoiono il cursore di testo
		return;                                      // lettere e backspace vanno all'input
	}
	/* --- zone lista / barra --- */
	switch (k) {
		case 37: case 39:
			if (zone === 'bar') {
				fBar = Math.max(-1, Math.min(BAR.length - 1, fBar + (k === 37 ? -1 : 1)));
				if (fBar === -1) { searching = true; $('search').focus(); }
				updateFocusUI();
			} else pageList(k === 37 ? -1 : 1);
			break;
		case 38:
			if (zone === 'list') { if (curIdx === 0) { zone = 'bar'; fBar = BAR.length - 1; renderList(); updateFocusUI(); } else moveList(-1); }
			break;
		case 40:
			if (zone === 'bar') { zone = 'list'; updateFocusUI(); }
			else moveList(1);
			break;
		case 13:
			if (zone === 'bar') {
				if (fBar >= 0) barAction(BAR[fBar].id);
				else { searching = true; $('search').focus(); updateFocusUI(); }
			} else if (currentTrack()) openPlayer(curIdx);
			break;
		case 461: case 8: case 27:                     // Back
			if (cfg.search) clearSearch();
			else if (zone !== 'bar') { zone = 'bar'; fBar = -1; updateFocusUI(); }
			else if (window.history.length > 1) window.history.back();
			else if (window.close) window.close();
			break;
		default: return;
	}
	e.preventDefault();
});

/* ---------------- Eventi <audio> ---------------- */
var audio = $('audio');
audio.loop = cfg.loop;
audio.addEventListener('ended', function () {
	if (!player) return;
	if (cfg.loop) { /* loop del brano: lo gestisce audio.loop */ return; }
	if (!cfg.shuffle && player.i >= view.length - 1) {
		toast('Playlist completata', false);
		renderList(); updateFocusUI();
		return;
	}
	nextTrack(1);
});
audio.addEventListener('error', function () {
	if (!player) return;
	var t = tracks[player.ti];
	toast('Errore riproduzione: "' + (t ? t.name : 'brano') + '" non raggiungibile o formato non supportato dal TV', true, 6000);
});
audio.addEventListener('timeupdate', function () {
	if (!player) return;
	if (Math.floor(audio.currentTime) % 5 === 0) saveLast(tracks[player.ti], audio.currentTime);
});
	audio.addEventListener('play', function () { playBtn().innerHTML = '&#9208; Pausa'; });
	audio.addEventListener('pause', function () { playBtn().innerHTML = '&#9654; Play'; });
	function playBtn() { return document.querySelector('#phud [data-id="playpause"]'); }

/* ---------------- Ricerca libera ---------------- */
$('search').value = cfg.search;
$('search').addEventListener('input', function () {
	cfg.search = this.value;
	saveCfg();
	curIdx = 0; topIdx = 0;
	rebuild(); renderList(); renderBar(); updateFocusUI();
});
$('search').addEventListener('blur', function () {
	searching = false;
	updateFocusUI();
});

/* ---------------- Orologio + salvataggio in uscita ---------------- */
function tick() {
	var d = new Date();
	$('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
setInterval(tick, 1000);
tick();
window.addEventListener('beforeunload', function () {
	if (player) saveLast(tracks[player.ti], $('audio').currentTime);
	else if (view.length) saveLast(tracks[view[curIdx]], cfg.lastTime || 0);
});

/* ---------------- Avvio ---------------- */
renderBar(); updateFocusUI();
crawl();

})();
