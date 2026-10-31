/* NusGallery — sfoglia il NAS Brume via HTTP (autoindex lighttpd) per webOS 5.x _org.nusgallery.app_
 * Nessun framework, nessun build, nessun CDN: JS vanilla ES5. Sola rete = NAS locale su HTTP.
 * Target Chromium 79: niente ?. / ??, niente gap su flex, niente inset CSS.
 * Fonte dati: http://192.168.188.56:8080/ — listing HTML di lighttpd (mod_dirlisting):
 *   <tr class="d"> = directory, <tr> = file; <a href>, td.s[data-value] (size byte), td.t (MIME).
 * Cache delle directory in localStorage (chiave unica, TTL 10 min, max 60 voci).
 * Griglia a pagine da MAX 40 elementi (PAGE); pagine successive con focus/rotella.
 */
(function () {
'use strict';

/* ---------------- Config ---------------- */
var NAS = 'http://192.168.188.56:8080/';
var NASNOME = 'NAS Brume';
var PAGE = 40;              // MAX elementi per schermata
var COLS = 5;               // colonne griglia (movimento focus ↑↓)
var TTL = 10 * 60 * 1000;   // vita della cache localStorage (ms)
var LS_MAX = 60;            // quante directory tenere in cache
var LS_KEY = 'nusgallery.tree';
var LS_KEY_SRC = 'nusgallery.src';     // { url, nome } sorgente scelta + ultima scansione
var SUBNET = '192.168.188.';           // range di scansione (zona LAN /24)
var SCAN_TMO = 1800;                   // timeout per singolo host (ms)
var SCAN_BATCH = 24;

var TIPI = [
	{ id: 'foto',  lab: 'FOTO',  ext: { jpg: 1, jpeg: 1, png: 1, gif: 1, webp: 1 } },
	{ id: 'video', lab: 'VIDEO', ext: { mp4: 1, mkv: 1, avi: 1, mov: 1, webm: 1, m4v: 1 } },
	{ id: 'audio', lab: 'AUDIO', ext: { mp3: 1, flac: 1, aac: 1, m4a: 1, wav: 1, ogg: 1 } }
];
var TIPO_OF = function () {
	var m = {};
	TIPI.forEach(function (t, i) {
		m[t.id] = i;
		for (var e in t.ext) m[e] = i;
	});
	return m;
}();

var SVG_FOLDER = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z"/></svg>';
var SVG_IMG    = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/></svg>';
var SVG_VIDEO  = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>';
var SVG_AUDIO  = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>';
var SVG_RELOAD = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24L13 11h7V4z"/></svg>';
var SVG_SERVER = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 3h16v7H4zm1 1v5h14V4zM6 5h5v2H6zM4 14h16v7H4zm1 1v5h14v-5zM6 16h5v2H6z"/></svg>';

/* ---------------- Utils ---------------- */
function $(id) { return document.getElementById(id); }
function pad(n) { return ('0' + n).slice(-2); }
function hhmmss(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
function esc(s) {
	return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
	});
}
function lsGet(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function extOf(name) {
	var n = String(name || ''), i = n.lastIndexOf('.');
	return i < 0 ? '' : n.slice(i + 1).toLowerCase();
}
function tipoId(name) {
	var t = TIPO_OF[extOf(name)];
	return t == null ? null : TIPI[t].id;
}
function sizeOf(n) {								// data-value = byte
	if (n == null || n < 0) return '—';
	if (n === 0) return '0 B';
	var u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'], i = 0, v = n;
	while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
	return (i === 0 ? v : v.toFixed(1)) + ' ' + u[i];
}
// encoda ogni segmento: URL sicuri anche con spazi, &, % nel nome di file/cartella
function encSeg(s) { return encodeURIComponent(String(s)).replace(/'/g, '%27'); }
function pathUrl(p, name) {
	var segs = p ? p.split('/') : [];
	if (name) segs.push(name);
	for (var i = 0; i < segs.length; i++) segs[i] = encSeg(segs[i]);
	return NAS + segs.join('/');
}
// thumbnail <img> col indice: lazy + async per non saturare la RAM della TV
function thumbTag(p, name) {
	return '<img class="thumb" loading="lazy" decoding="async" src="' + esc(pathUrl(p, name)) + '" alt="">';
}
// immagine rotta (file mancino/permessi): nascosto, resta l'icona
document.addEventListener('error', function (e) {
	if (e.target && e.target.tagName === 'IMG' && e.target.className.indexOf('thumb') >= 0) {
		e.target.classList ? e.target.classList.add('bad') : (e.target.style.visibility = 'hidden');
	}
}, true);

/* ---------------- Cache tree (localStorage) ---------------- */
function treeRead() { var t = lsGet(LS_KEY, {}); return (t && typeof t === 'object' && !t.length) ? t : {}; }
function treeGet(p) {
	var e = treeRead()[p];
	return (e && e.it && Date.now() - e.ts < TTL) ? e.it : null;
}
function treePut(p, its) {
	var t = treeRead();
	t[p] = { ts: Date.now(), it: its };
	var ks = Object.keys(t);
	while (ks.length > LS_MAX) {			// scarta la più vecchia
		var old = null, k;
		for (var i = 0; i < ks.length; i++) { k = ks[i]; if (!old || t[k].ts < t[old].ts) old = k; }
		if (!old) break;
		delete t[old]; ks = Object.keys(t);
	}
	lsSet(LS_KEY, t);
}

/* ---------------- HTTP (XHR, come NuSport) ---------------- */
function httpGet(url, timeoutMs) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = timeoutMs || 15000;
		xhr.onload = function () {
			if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
			else reject(new Error('HTTP ' + xhr.status));
		};
		xhr.onerror = function () { reject(new Error('errore di rete')); };
		xhr.ontimeout = function () { reject(new Error('timeout')); };
		try { xhr.send(null); } catch (e) { reject(new Error('eccezione XHR')); }
	});
}

/* ---------------- Parse listing lighttpd ---------------- */
function parseListing(html) {
	var doc = new DOMParser().parseFromString(html, 'text/html');
	var rows = doc.querySelectorAll('tr'), out = [];
	for (var r = 0; r < rows.length; r++) {
		var tr = rows[r], a = tr.querySelector('a');
		if (!a) continue;
		var href = a.getAttribute('href') || '';
		if (!href || href.charAt(0) === '?' || href === '..' || href === '../' || href.indexOf('../') === 0) continue;
		var name = href;
		try { name = decodeURIComponent(href); } catch (e) { /* nome strano: tengo href */ }
		if (name.slice(-1) === '/') name = name.slice(0, -1);
		if (!name || name.charAt(0) === '.') continue;			// niente dotfile/link sistema
		var isDir = (/(^|\s)d(\s|$)/.test(tr.className || '')) || href.slice(-1) === '/';
		var size = -1, s = tr.querySelector('td.s');
		if (s && s.getAttribute('data-value') != null) {
			size = parseInt(s.getAttribute('data-value'), 10);
			if (isNaN(size)) size = -1;
		}
		out.push({ name: name, dir: !!isDir, size: size });
	}
	out.sort(function (x, y) {									// directory prima, poi nome (case-insens)
		if (x.dir !== y.dir) return x.dir ? -1 : 1;
		return x.name.toLowerCase().localeCompare(y.name.toLowerCase());
	});
	return out;
}

/* ---------------- Stato ---------------- */
var fTab = 0;            // 0 foto, 1 video, 2 audio
var path = '';           // percorso directory corrente relativo alla radice ('' = root)
var raw = null;          // listing completo della directory corrente (dirs + file)
var zone = 'grid';       // 'top' | 'tabs' | 'crumb' | 'grid'
var fTop = 0;
var cIdx = 0;            // segmento breadcrumb a fuoco
var fIdx = 0;            // elemento a fuoco (indice globale in items())
var page = 0;            // pagina corrente (PAGE elementi)
var loading = false;
var netErr = null;
var lastUpdate = null;
var reqSeq = 0;          // scarta risposte vecchie se l'utente naviga nel frattempo
var vList = null, vIdx = 0;  // navigazione tra foto nel viewer (indici in items())

function segs() { return path ? path.split('/') : []; }
function segPath(k) { var s = segs(); return k <= 0 ? '' : s.slice(0, k).join('/'); }

// elementi della vista corrente: sempre le directory, i file filtrati per tab
function items() {
	if (!raw) return null;
	var ext = TIPI[fTab].ext, out = [], i;
	for (i = 0; i < raw.length; i++) {
		var it = raw[i];
		if (it.dir || ext[extOf(it.name)]) out.push(it);
	}
	return out;
}

/* ---------------- Caricamento directory ---------------- */
function fetchDir(p, force) {
	var c = treeGet(p);
	if (c && !force) return Promise.resolve(c);
	return httpGet(pathUrl(p, '')).then(function (html) {
		var its = parseListing(html);
		treePut(p, its);
		return its;
	});
}
function loadDir(force) {
	var p = path, seq = ++reqSeq;
	loading = true; netErr = null;
	raw = treeGet(p);                        // cache fresca: la mostro subito
	if (raw) applyItems(); else render();    // altrimenti schermata caricamento/errore
	fetchDir(p, force).then(function (its) {
		if (seq !== reqSeq) return;
		raw = its; lastUpdate = Date.now(); netErr = null;
		loading = false;
		applyItems();
	}).catch(function (err) {
		if (seq !== reqSeq) return;
		netErr = String((err && err.message) || err).slice(0, 40);
		loading = false;
		render();                                // tengo l'ultimo listing buono di QUESTA directory, se c'era
	});
}
function applyItems() {
	var n = items() ? items().length : 0;
	if (fIdx >= n) fIdx = Math.max(0, n - 1);
	page = n ? Math.floor(fIdx / PAGE) : 0;
	render();
}

/* ---------------- Navigazione ---------------- */
function nav(p) {
	if (p == null) return;
	path = p; raw = null; fIdx = 0; page = 0;
	loadDir(false);
}
function gotoSeg(k) { nav(segPath(k)); }

function tabSelect(i) {
	if (i === TIPI.length) { apriSorgenti(); return; }       // tab SORGENTI = overlay sorgenti
	fTab = (i + TIPI.length) % TIPI.length;
	fIdx = 0; page = 0;
	render();
}

function toCrumb() {
	zone = 'crumb';
	var n = segs().length + 1;
	if (cIdx >= n) cIdx = n - 1;
	updateFocusUI();
}
function moveGrid(d) {
	var its = items(), n = its ? its.length : 0;
	if (!n) { if (d < 0) toCrumb(); updateFocusUI(); return; }
	var nf = fIdx + d;
	if (nf < 0) { fIdx = 0; toCrumb(); return; }
	if (nf >= n) nf = n - 1;
	fIdx = nf;
	page = Math.floor(fIdx / PAGE);
	renderGrid(); updateFocusUI();
}
function crumbMove(d) {
	var n = segs().length + 1;
	cIdx = Math.max(0, Math.min(n - 1, cIdx + d));
	updateFocusUI();
}

/* ---------------- Render ---------------- */
function render() {
	renderTabs(); renderCrumb();
	var its = items();
	if (!its) {
		$('grid').innerHTML = ''; $('grid').className = 'hidden';
		if (loading) showMsg('load', 'Caricamento ' + NASNOME + '…', '', false);
		else showMsg('err', 'Impossibile contattare il NAS', MSG_ERR, true);
	} else {
		hideMsg(); $('grid').className = '';
		renderGrid();
	}
	updateHeader(); updateFocusUI();
}
var MSG_ERR = 'Verifica che ' + NASNOME + ' sia acceso e che il server HTTP (PC/PCCH) sia attivo su '
	+ NAS.replace('http://', '').replace(/\/$/, '') + ': senza il servizio a PC/PCCH la web app non vede i file.';

function showMsg(kind, title, sub, retry) {
	var nd = $('nulldata');
	nd.className = kind;
	nd.innerHTML = '<div class="nicon">' + (kind === 'err' ? '!' : kind === 'load' ? '' : '&#8212;') + '</div>'
		+ '<div class="ntitle">' + esc(title) + '</div>'
		+ (sub ? '<div class="nsub">' + esc(sub) + '</div>' : '')
		+ (retry ? '<div id="retry"' + (zone === 'grid' ? ' class="focused"' : '') + '>Riprova</div>' : '');
}
function hideMsg() { $('nulldata').className = 'hidden'; }

function renderTabs() {
	var h = '';
	TIPI.forEach(function (t, i) {
		h += '<div class="titem' + (i === fTab ? ' active' : '') + '" data-tab="' + i + '">' + esc(t.lab) + '</div>';
	});
	h += '<div class="titem' + (document.getElementById('srcview').className !== 'hidden' ? ' active' : '')
		+ '" data-tab="' + TIPI.length + '">SORGENTI</div>';
	$('tabs').innerHTML = h;
}

function renderCrumb() {
	var s = segs(), h = '<div class="crumb-it' + (zone === 'crumb' && cIdx === 0 ? ' focused' : '') + '" data-seg="0">' + esc(NASNOME) + '</div>';
	for (var i = 0; i < s.length; i++) {
		h += '<span class="csep">&#x203a;</span>'
			+ '<div class="crumb-it' + (zone === 'crumb' && cIdx === i + 1 ? ' focused' : '') + '" data-seg="' + (i + 1) + '">' + esc(s[i]) + '</div>';
	}
	h += '<div id="crumbtail">' + (path || '') + '</div>';
	$('crumb').innerHTML = h;
}

function tileHTML(it, i) {
	var tp = tipoId(it.name);
	var cls = 'tile ' + (it.dir ? 'dir' : tp === 'foto' ? 'img' : tp === 'video' ? 'vid' : 'aud');
	var body;
	if (!it.dir && tp === 'foto') body = thumbTag(path, it.name);
	else body = '<div class="tbig">' + (it.dir ? SVG_FOLDER : tp === 'video' ? SVG_VIDEO : tp === 'audio' ? SVG_AUDIO : SVG_IMG) + '</div>';
	return '<div class="' + cls + '" data-ix="' + i + '">' + body
		+ '<span class="tname">' + esc(it.name) + '</span>'
		+ (it.dir ? '' : '<span class="tsize">' + sizeOf(it.size) + '</span>') + '</div>';
}
function renderGrid() {
	var its = items(); if (!its) return;
	var n = its.length;
	page = Math.max(0, Math.min(page, Math.floor(Math.max(0, n - 1) / PAGE)));
	var start = page * PAGE, end = Math.min(n, start + PAGE);
	var h = '<div id="tiles">';
	for (var i = start; i < end; i++) h += tileHTML(its[i], i);
	h += '</div>';
	if (n > PAGE) h += '<div id="pager">' + NASNOME + ' · ' + (start + 1) + '–' + end + ' di ' + n
		+ ' · pagina ' + (page + 1) + '/' + Math.ceil(n / PAGE) + '</div>';
	$('grid').innerHTML = h;
}

function updateHeader() {
	$('clock').textContent = hhmmss(Date.now());
	var t = [NASNOME + ' · ' + NAS.replace('http://', '').replace(/\/$/, '')];
	if (loading) t.push('Caricamento…');
	else if (lastUpdate) t.push('Aggiornato alle ' + hhmmss(lastUpdate));
	if (netErr) t.push('Errore: ' + netErr);
	var sh = $('sourcehint');
	sh.textContent = t.join(' · ');
	sh.className = 'hint' + (netErr ? ' err' : '');
}
function updateFocusUI() {
	var q = function (s) { return document.querySelectorAll(s); };
	Array.prototype.forEach.call(q('.tbtn'), function (el) {
		el.classList.toggle('focused', zone === 'top' && +el.getAttribute('data-top') === fTop);
	});
	Array.prototype.forEach.call(q('.titem'), function (el) {
		el.classList.toggle('focused', zone === 'tabs' && +el.getAttribute('data-tab') === fTab);
	});
	Array.prototype.forEach.call(q('.crumb-it'), function (el) {
		el.classList.toggle('focused', zone === 'crumb' && +el.getAttribute('data-seg') === cIdx);
	});
	Array.prototype.forEach.call(q('.tile'), function (el) {
		el.classList.toggle('focused', zone === 'grid' && +el.getAttribute('data-ix') === fIdx);
	});
	var r = $('retry'); if (r) r.classList.toggle('focused', zone === 'grid');
	var g = $('grid');
	if (g) g.classList.toggle('focused', zone === 'grid');
	// porta il tile a fuoco in vista
	var f = $('grid').querySelector('.tile.focused');
	if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
}

/* ---------------- Sorgenti: scansione LAN + scelta ---------------- */
var srcScanning = false;
function srcMem() { var m = lsGet(LS_KEY_SRC, {}); return (m && typeof m === 'object' && !m.length) ? m : {}; }
function treePutCacheReset() { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ok */ } }
// XHR che risolve anche sui falliti (offline/CORS): per la scansione in batch
function httpProbe(url, tmo) {
	return new Promise(function (resolve) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = tmo;
		xhr.onload = function () { resolve({ ok: xhr.status >= 200 && xhr.status < 300, text: xhr.responseText || '' }); };
		xhr.onerror = xhr.ontimeout = function () { resolve({ ok: false, text: '' }); };
		try { xhr.send(null); } catch (e) { resolve({ ok: false, text: '' }); }
	});
}
// scansione 192.168.188.1–254 su :8080 (lighttpd autoindex): riconosce il marker 'Index of'
function scanRete(onProg) {
	return new Promise(function (done) {
		var found = [], fatti = 0, from = 1;
		function cella(num) {
			httpProbe('http://' + SUBNET + num + ':8080/', SCAN_TMO).then(function (r) {
				fatti++;
				if (r.ok && r.text.indexOf('Index of') >= 0 && r.text.indexOf('class="d"') >= 0) {
					found.push({ ip: num, url: 'http://' + SUBNET + num + ':8080/',
						nome: 'NAS 192.168.188.' + num + ' · condiviso usb (disco remoto)' });
				}
				if (onProg) onProg(fatti, found.length);
			});
		}
		function passi() {
			if (!srcScanning) return done(found);                    // overlay chiuso: abort
			if (fatti >= 254 || found.length >= 6) {
				lsSet(LS_KEY_SRC, { list: found, ts: Date.now() });
				done(found); return;
			}
			var to = Math.min(254, from + SCAN_BATCH - 1), n;
			for (n = from; n <= to; n++) cella(n);
			from = to + 1;
			setTimeout(passi, 1400);                                 // lascia respirare le XHR
		}
		passi();
	});
}
function apriSorgenti() { $('srcview').className = ''; srcScanning = false; renderShellSorgenti(); renderListaSorgenti(''); }
function chiudiSorgenti() { srcScanning = false; $('srcview').className = 'hidden'; }
function renderShellSorgenti() {
	$('srcbody').innerHTML =
		'<div class="stitle">Sorgenti sulla rete</div>'
		+ '<div class="ssub">In uso: <b>' + esc(NASNOME) + '</b> · ' + esc(NAS.replace('http://', '').replace(/\/$/, '')) + '</div>'
		+ '<div id="doscan" class="srow">' + SVG_RELOAD + ' <span id="doscanlab">SCANSIONE RETE · :8080 · file server max 6</span></div>'
		+ '<div id="srcmsg" class="smsg dim2"></div>'
		+ '<div id="srclist" class="slist"></div>'
		+ '<div class="ssub dim2">Il browser del TV vede i file server HTTP (autoindex). SMB/NFS/FTP non sono parlabili dalle web app webOS: la stessa ivisione del disco NAS arriva qui come cartelle (la share \\\\192.168.188.56\\usb &egrave; la radice :8080 del Brume).</div>';
	$('doscan').onclick = startScan;
}
function renderListaSorgenti(msg) {
	var mem = srcMem();
	var lista = (mem && mem.list && mem.list.length) ? mem.list.slice()
		: [{ ip: 56, url: 'http://192.168.188.56:8080/', nome: 'NAS Brume · 192.168.188.56 · condiviso usb (default)' }];
	var ih = '', e, lab, slug;
	for (var i = 0; i < lista.length; i++) {
		e = lista[i];
		lab = e.nome || ('Server file · ' + String(e.url).replace('http://', '').replace(/\/$/, ''));
		slug = String(e.url).replace('http://', '').replace(/\/$/, '');
		ih += '<div class="sitem' + (slug === NAS.replace('http://', '').replace(/\/$/, '') ? ' cur' : '')
			+ '" data-url="' + esc(e.url) + '" data-nome="' + esc(lab) + '">'
			+ '<div class="snome">' + esc(lab) + '</div><div class="surl">' + esc(e.url) + '</div></div>';
	}
	$('srclist').innerHTML = ih;
	$('srcmsg').textContent = msg || '';
}
function startScan() {
	if (srcScanning) return;
	srcScanning = true;
	$('doscanlab').textContent = 'Scansione in corso… 0/254';
	renderListaSorgenti('Scansione in corso… la TV interroga tutti gli host LAN su :8080');
	scanRete(function (fatti, trov) {
		var sp = $('doscanlab');
		if (sp) sp.textContent = 'Scansione in corso… ' + fatti + '/254 · trovati: ' + trov;
	}).then(function (found) {
		srcScanning = false;
		renderListaSorgenti('Scansione finita: ' + found.length + ' file server HTTP trovati. Richiama per passare sorgente.');
	});
}
function selSorgente(url, nome) {
	NAS = url.indexOf('://') >= 0 ? url : ('http://' + url + '/');
	NASNOME = nome || 'NAS';
	lsSet(LS_KEY_SRC, { url: NAS, nome: NASNOME, ts: Date.now() });
	chiudiSorgenti();
	treePutCacheReset();
	path = ''; raw = null; fIdx = 0; page = 0;
	loadDir(false);
}
function openFocused() {
	var its = items(); if (!its) return;
	var it = its[fIdx]; if (!it) return;
	if (it.dir) { nav(path ? path + '/' + it.name : it.name); return; }
	openMedia(it);
}
function openMedia(it) {
	var its = items(), list = [], i;
	for (i = 0; i < its.length; i++) if (!its[i].dir && tipoId(its[i].name) === 'foto') list.push(i);
	vList = tipoId(it.name) === 'foto' ? list : null;
	vIdx = vList ? list.indexOf(fIdx) : -1;
	renderViewer(it);
}
function renderViewer(it) {
	var url = pathUrl(path, it.name), tp = tipoId(it.name), h = '<div id="vwrap">';
	if (tp === 'foto') {
		h += '<img id="vimg" class="thumb" loading="lazy" decoding="async" src="' + esc(url) + '" alt="">';
		if (vList && vList.length > 1) {
			if (vIdx > 0) h += '<div id="vprev" class="vnav">&#x276e;</div>';
			if (vIdx < vList.length - 1) h += '<div id="vnext" class="vnav">&#x276f;</div>';
		}
	} else if (tp === 'video') {
		h += '<video id="vmedia" controls autoplay preload="auto" src="' + esc(url) + '"></video>';
	} else {
		h += '<div class="audwrap"><div class="audicon">' + SVG_AUDIO + '</div>'
			+ '<audio id="vmedia" controls autoplay preload="auto" src="' + esc(url) + '"></audio></div>';
	}
	h += '<div id="vname">' + esc(it.name) + '</div><div class="vclose" id="vclose">&#x2715; Chiudi (Back)</div></div>';
	var v = $('viewer');
	v.innerHTML = h;
	v.className = '';
}
function closeViewer() {
	var m = $('vmedia');
	if (m) { try { m.pause(); } catch (e) { /* già fermo */ } }
	var v = $('viewer');
	v.className = 'hidden';
	v.innerHTML = '';
}
function viewerMove(d) {
	if (!vList) return;                                  // solo foto: video/audio hanno i controlli nativi
	var k = vIdx + d;
	if (k < 0 || k >= vList.length) return;
	vIdx = k; fIdx = vList[k];
	renderViewer(items()[fIdx]);
}

/* ---------------- Input Magic Remote (pointer, wheel, VK) ---------------- */
document.addEventListener('click', function (e) {
	var el = e.target;
	while (el && el.nodeType === 1) {
		if (el.id === 'viewer' || el.id === 'vclose') { closeViewer(); e.preventDefault(); return; }
		if (el.id === 'vmedia') return;                     // click su video/audio nativo: lascio i controlli
		if (el.id === 'vprev') { viewerMove(-1); e.preventDefault(); return; }
		if (el.id === 'vnext') { viewerMove(1); e.preventDefault(); return; }
		if (el.id === 'retry') { loadDir(true); e.preventDefault(); return; }
		var cl = el.classList;
		if (cl && cl.contains('tbtn')) {
			zone = 'top';
			if (+el.getAttribute('data-top') === 1) apriSorgenti();
			else loadDir(true);
			e.preventDefault(); return;
		}
		if (el.id === 'srcclose' || el.id === 'srcview') { chiudiSorgenti(); e.preventDefault(); return; }
		if (el.id === 'srclist') return;
		if (cl && cl.contains('sitem')) {
			selSorgente(el.getAttribute('data-url'), el.getAttribute('data-nome'));
			e.preventDefault(); return;
		}
		if (cl && cl.contains('titem')) {
			zone = 'tabs';
			tabSelect(+el.getAttribute('data-tab') || 0);
			e.preventDefault(); return;
		}
		if (cl && cl.contains('crumb-it')) {
			zone = 'crumb';
			gotoSeg(+el.getAttribute('data-seg') || 0);
			e.preventDefault(); return;
		}
		if (cl && cl.contains('tile')) {
			zone = 'grid';
			fIdx = +el.getAttribute('data-ix') || 0;
			page = Math.floor(fIdx / PAGE);
			updateFocusUI();
			openFocused();
			e.preventDefault(); return;
		}
		el = el.parentNode;
	}
});
document.addEventListener('wheel', function (e) {
	e.preventDefault();
	var d = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
	if (!d) return;
	if ($('viewer').className !== 'hidden') return;
	if (zone !== 'grid') { zone = 'grid'; updateFocusUI(); if (d < 0) return; }
	moveGrid(d * COLS);                     // tacca rotella = riga intera
}, { passive: false });

document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	// sorgenti: Back chiude, tutto bloccato (uso solo pointer, stile LG)
	if ($('srcview').className !== 'hidden') {
		if (k === 461 || k === 8 || k === 27) chiudiSorgenti();
		else return;
		e.preventDefault(); return;
	}
	// viewer: Back chiude; ←→ sfoglia le foto della directory
	if ($('viewer').className !== 'hidden') {
		if (k === 461 || k === 8 || k === 27) closeViewer();
		else if (k === 37) viewerMove(-1);
		else if (k === 39) viewerMove(1);
		else return;
		e.preventDefault(); return;
	}
	if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
	switch (k) {
		case 37: case 39:
			var dd = k === 37 ? -1 : 1;
			if (zone === 'top') fTop = Math.max(0, Math.min(0, fTop + dd));       // un solo tasto: resta
			else if (zone === 'tabs') tabSelect(fTab + dd);
			else if (zone === 'crumb') crumbMove(dd);
			else moveGrid(dd);
			break;
		case 38:
			if (zone === 'grid') moveGrid(-COLS);
			else if (zone === 'crumb') { zone = 'tabs'; updateFocusUI(); }
			else if (zone === 'tabs') { zone = 'top'; updateFocusUI(); }
			break;
		case 40:
			if (zone === 'top') { zone = 'tabs'; updateFocusUI(); }
			else if (zone === 'tabs') { zone = 'crumb'; toCrumb(); }
			else if (zone === 'crumb') { zone = 'grid'; updateFocusUI(); }
			else moveGrid(COLS);
			break;
		case 13:
			if (zone === 'top') loadDir(true);
			else if (zone === 'tabs') { zone = 'grid'; updateFocusUI(); }
			else if (zone === 'crumb') { gotoSeg(cIdx); zone = 'grid'; }
			else if ($('retry')) loadDir(true);
			else openFocused();
			break;
		case 461: case 8: case 27:
			if (path !== '') { gotoSeg(segs().length - 1); zone = 'grid'; break; }   // Back = directory sopra
			if (zone !== 'tabs') { zone = 'tabs'; updateFocusUI(); break; }
			if (window.history.length > 1) window.history.back();
			else if (window.close) window.close();
			break;
		default: return;
	}
	e.preventDefault();
});

/* ---------------- Orologio ---------------- */
setInterval(updateHeader, 1000);

/* ---------------- Avvio ---------------- */
var srcSalvata = srcMem() || {};
if (srcSalvata.url && String(srcSalvata.url).indexOf('://') >= 0) {
	NAS = srcSalvata.url; NASNOME = srcSalvata.nome || NASNOME;
}
$('topbtns').innerHTML = '<div class="tbtn" data-top="1" title="Sorgenti">' + SVG_SERVER + '</div>'
	+ '<div class="tbtn" data-top="0">' + SVG_RELOAD + '</div>';
loadDir(false);

})();
