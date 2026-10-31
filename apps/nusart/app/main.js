/* NusArt — Galleria/salvaschermo dal Met Museum per webOS 5.x (rooted, webapp) _org.nusart.app_
 * Nessun framework, nessun build, nessun CDN: JS vanilla.
 * Target Chromium 79: niente ?. / ??, niente gap su flex, niente inset CSS.
 * Fonte dati: The Metropolitan Museum of Art — Collection API public (nessuna chiave):
 *   search:  https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=<termine>
 *   oggetto: https://collectionapi.metmuseum.org/public/collection/v1/objects/<id>
 *     → primaryImage (URL immagine), title, artistDisplayName, objectDate, objectName
 * App parte da file:// → XHR https diretti dalla webview (come NuSport).
 * Cache di lettura SOLO in memoria durante la sessione (search + oggetti già visti).
 */
(function () {
'use strict';

/* ---------------- Config ---------------- */
var MET = 'https://collectionapi.metmuseum.org/public/collection/v1/';
var NASA = 'https://images-api.nasa.gov/search?media_type=image&page_size=80&q=';
var ASPECT_MIN = 1.55;          // sfondi: tengo solo le immagini larghe (>= 1.55, tipo 16:9)
var MAX_SALVATI = 25;           // sfondi preferiti: cap evitar coledelli sullo storage del TV
var SLIDE_MS = 9000;         // avanzamento automatico (9 s; barra: #prog.run in main.css)
var FADE_MS = 1200;          // cross-fade CSS (transizione .slide in main.css)
var AVVIO_TIMEOUT = 10000;   // nessuna immagine entro 10 s → schermata di attesa
var RETRY_MS = 10000;        // ritento dopo un errore di rete

// Categorie preimpostate: solo il termine di ricerca, MAI id hard-coded.
// Gli id vengono pescati a caso tra i risultati della search a ogni ciclo (shuffle).
var CATEGORIE = [
	{ q: 'Van Gogh',   nome: 'Vincent van Gogh' },
	{ q: 'Monet',      nome: 'Claude Monet' },
	{ q: 'Renoir',     nome: 'Pierre-Auguste Renoir' },
	{ q: 'Vermeer',    nome: 'Johannes Vermeer' },
	{ q: 'Rembrandt',  nome: 'Rembrandt van Rijn' },
	{ q: 'Klimt',      nome: 'Gustav Klimt' },
	{ q: 'Hokusai',    nome: 'Katsushika Hokusai' },
	{ q: 'Caravaggio', nome: 'Caravaggio' },
	{ q: 'Seurat',     nome: 'Georges Seurat' },
	// fonti NASA in mix: paesaggi e sfondi naturali, perfetti per il 16:9
	{ q: 'earth from space', nome: 'Terre vista dallo spazio', src: 'nasa' },
	{ q: 'nebula galaxy',    nome: 'Nebula e galassie (NASA)', src: 'nasa' },
	{ q: 'aurora polar',     nome: 'Aurore (NASA)',          src: 'nasa' },
	{ q: 'mars landscape',   nome: 'Marzian landscape',      src: 'nasa' }
];

/* ---------------- Stato ---------------- */
var catIdx = -1;           // categoria in uso (indice in CATEGORIE)
var corrente = null;       // opera attualmente a schermo (per "Salva sfondo")
var coda = [];             // id opere della categoria corrente (mescolati a caso)
var pos = 0;               // posizione in coda dell'opera mostrata
var cacheSearch = {};      // q lowercase → {ts, ids}   (solo in memoria)
var cacheOggetti = {};     // id → opera normalizzata o null (senza immagine) — solo in memoria
var strato = 0;            // slide visibile (0 o 1)
var avvioOk = false;       // prima opera mostrata
var seq = 0;               // scarta risposte vecchie se l'utente salta a raffica
var timerSlide = null, timerAvvio = null, timerRetry = null, bannerTm = null;

/* ---------------- Utils ---------------- */
function $(id) { return document.getElementById(id); }
function pad(n) { return ('0' + n).slice(-2); }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function hhmmss(ms) { var d = new Date(ms); return hhmm(ms) + ':' + pad(d.getSeconds()); }
function esc(s) {
	return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
	});
}
function rand(n) { return Math.floor(Math.random() * n); }
// Fisher–Yates: mescola una copia (nessun id fisso per indice)
function shuffle(a) {
	var r = a.slice(), i, j, t;
	for (i = r.length - 1; i > 0; i--) { j = rand(i + 1); t = r[i]; r[i] = r[j]; r[j] = t; }
	return r;
}

/* ---------------- HTTP (XHR) ---------------- */
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
function getJson(url) { return httpGet(url).then(function (t) { return JSON.parse(t); }); }

/* ---------------- Met Museum ---------------- */
function cerca(q) {
	var k = String(q).toLowerCase();
	var c = cacheSearch[k];
	if (c && c.ids && c.ids.length) return Promise.resolve(c.ids);
	return getJson(MET + 'search?hasImages=true&isPublicDomain=true&q=' + encodeURIComponent(q))
		.then(function (j) {
			var ids = (j && j.objectIDs) ? j.objectIDs.slice() : [];
			if (!ids.length) throw new Error('nessun risultato');
			cacheSearch[k] = { ts: Date.now(), ids: ids };   // cache in memoria, non mescolata qui
			return ids;
		});
}
function norm(j) {
	if (!j || !j.primaryImage || j.isPublicDomain === false) return null;
	return {
		id: String(j.objectID || ''),
		img: String(j.primaryImage),
		title: String(j.title || '').trim() || String(j.objectName || '').trim() || 'Senza titolo',
		artista: String(j.artistDisplayName || '').trim() || 'Artista anonimo',
		data: String(j.objectDate || '').trim(),
		tipo: String(j.objectName || '').trim()
	};
}
// oggetto Met → opera; senza primaryImage → null (scartata e ricordata come tale)
function opera(id) {
	if (cacheOggetti[id] !== undefined) return Promise.resolve(cacheOggetti[id]);
	return getJson(MET + 'objects/' + id).then(function (j) {
		var a = norm(j);
		cacheOggetti[id] = a;
		return a;
	});
}

/* ---------------- NASA images API (mix sfondi) ---------------- */
// la search restituisce direttamente le opere (niente passo /objects):
// item.data[0] = metadata, item.links[0].href = preview ~thumb → sostituisco ~medium
function nasaLista(q) {
	return getJson(NASA + encodeURIComponent(q)).then(function (j) {
		var items = (j && j.collection && j.collection.items) || [], n, it, out = [], d;
		for (n = 0; n < items.length && out.length < 30; n++) {
			it = items[n];
			d = (it.data && it.data[0]) || {};
			var href = (it.links && it.links[0] && it.links[0].href) || '';
			if (!d.nasa_id || !href) continue;
			out.push({
				id: 'nasa-' + d.nasa_id,
				img: href.replace('~thumb', '~medium'),
				title: String(d.title || '').trim() || 'Senza titolo',
				artista: 'NASA · immagini di dominio pubblico',
				data: String(d.date_created || '').slice(0, 10),
				tipo: 'Fotografia'
			});
		}
		if (!out.length) throw new Error('nessun risultato NASA');
		return out;
	});
}

/* ---------------- Sfondi salvati (IndexedDB, dentro l'app) ---------------- */
var dbsf = null, favMode = false, favCoda = [], favPos = 0;
function dbOpen() {
	return new Promise(function (res, rej) {
		if (dbsf) return res(dbsf);
		var r = indexedDB.open('nusart-db', 1);
		r.onupgradeneeded = function () { r.result.createObjectStore('sfondi', { keyPath: 'id' }); };
		r.onsuccess = function () { dbsf = r.result; res(dbsf); };
		r.onerror = r.onblocked = function () { rej(new Error('IndexedDB non disponibile')); };
	});
}
function dbTx(mode) { return dbsf.transaction('sfondi', mode).objectStore('sfondi'); }
function dbConta() {
	return dbOpen().then(function (db) {
		return new Promise(function (res, rej) {
			var rr = dbTx('readonly').count();
			rr.onsuccess = function () { res(rr.result); };
			rr.onerror = function () { rej(new Error('count ko')); };
		});
	});
}
function dbAggiornaChip() {
	dbConta().then(function (n) { $('fav').textContent = '★ ' + n; }, function () {});
}
function dbPut(o) {
	return dbOpen().then(function (db) {
		return new Promise(function (res, rej) {
			var rr = dbTx('readwrite').put(o);
			rr.onsuccess = res; rr.onerror = function () { rej(new Error('write ko')); };
		});
	});
}
function dbTutti() {
	return dbOpen().then(function (db) {
		return new Promise(function (res, rej) {
			var rr = dbTx('readonly').getAll();
			rr.onsuccess = function () { res(rr.result || []); };
			rr.onerror = function () { rej(new Error('read ko')); };
		});
	});
}
function dbTrim() {
	return dbConta().then(function (n) {
		if (n <= MAX_SALVATI) return null;
		return dbTutti().then(function (tutti) {
			tutti.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
			var daTogli = tutti.slice(0, n - MAX_SALVATI);
			daTogli.forEach(function (o) {
				dbsf.transaction('sfondi', 'readwrite').objectStore('sfondi').delete(o.id);
			});
			return null;
		});
	});
}
// download dell'immagine corrente come blob (richiede CORS dal server immagini)
function httpBin(url) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';
		xhr.timeout = 20000;
		xhr.onload = function () {
			if (xhr.status >= 200 && xhr.status < 300 && xhr.response) resolve(xhr.response);
			else reject(new Error('HTTP ' + xhr.status));
		};
		xhr.onerror = xhr.ontimeout = function () { reject(new Error('errore download')); };
		try { xhr.send(null); } catch (e) { reject(new Error('eccezione XHR')); }
	});
}
function salvaSfondo() {
	if (favMode) { banner('Sei già nei preferiti: torna agli sfondi (↑ ↓) per salvarne altri', 4000); return; }
	if (!corrente) { banner('Nessuna opera da salvare', 3000); return; }
	banner('Salvo lo sfondo…', 4000);
	httpBin(corrente.img).then(function (buf) {
		var o = {
			id: corrente.id || ('x' + Date.now()),
			ts: Date.now(),
			blob: new Blob([buf]),
			title: corrente.title, artista: corrente.artista,
			data: corrente.data, tipo: corrente.tipo
		};
		return dbPut(o).then(dbTrim).then(dbAggiornaChip);
	}).then(function () { banner('★ Sfondo salvato nei preferiti di NusArt', 4000); },
		function (e) { banner('Salvataggio non riuscito (' + (e.message || '') + ')', 5000); });
}
// preferiti in lista: blob → object URL; niente rete, parte sempre
function apriFavoriti() {
	return dbTutti().then(function (tutti) {
		if (!tutti.length) { banner('Nessuno sfondo salvato: premi il tasto Play ★ per salvarne', 5000); return false; }
		tutti.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
		favCoda = tutti.map(function (o) {
			return { id: o.id, img: URL.createObjectURL(o.blob), title: o.title, artista: o.artista, data: o.data, tipo: o.tipo };
		});
		favMode = true; favPos = 0;
		$('cat').textContent = '★ Sfondi salvati';
		return true;
	});
}

/* ---------------- Banner / attesa ---------------- */
function banner(msg, ms) {
	var b = $('banner');
	b.textContent = msg;
	b.className = '';
	clearTimeout(bannerTm);
	bannerTm = setTimeout(function () { b.className = 'hidden'; }, ms || 5000);
}
function attivaAttesa(titolo, sub) {
	$('wait').querySelector('.wtitle').textContent = titolo;
	$('wait').querySelector('.wsub').textContent = sub;
	$('wait').classList.remove('hidden');
	$('caption').classList.add('hidden');
	fermaSlide();
}
function nascondiAttesa() { $('wait').classList.add('hidden'); }

/* ---------------- Slide / render ---------------- */
function aggiornaCat() {
	$('cat').textContent = catIdx >= 0 ? CATEGORIE[catIdx].nome : '…';
}
function didascalia(a) {
	var m = [a.artista, a.data, a.tipo, (pos + 1) + ' di ' + coda.length], out = [], i;
	for (i = 0; i < m.length; i++) if (m[i]) out.push(m[i]);
	$('ctitle').textContent = a.title;
	$('cmeta').textContent = out.join(' · ');
	$('caption').classList.remove('hidden');
}
function riavviaProg() {
	var p = $('prog');
	p.classList.remove('run');
	void p.offsetWidth;                       // riparte l'animazione da 0
	p.classList.add('run');
}
function fermaSlide() {
	if (timerSlide) { clearTimeout(timerSlide); timerSlide = null; }
	if (timerRetry) { clearTimeout(timerRetry); timerRetry = null; }
}
function startSlide() {
	fermaSlide();
	timerSlide = setTimeout(function () { timerSlide = null; avanza(1); }, SLIDE_MS);
}
// mostra l'opera già precaricata: cross-fade + didascalia + barra 9 s
function mostra(a, dir) {
	avvioOk = true;
	corrente = a;
	if (timerAvvio) { clearTimeout(timerAvvio); timerAvvio = null; }
	nascondiAttesa();
	var arr = $('s' + (1 - strato)), val = $('s' + strato);
	arr.onload = function () {
		arr.classList.add('vis');
		val.classList.remove('vis');
		strato = 1 - strato;
		didascalia(a);
		riavviaProg();
		startSlide();
	};
	arr.onerror = null;
	arr.alt = a.title;
	arr.src = a.img;                          // cache del preload → onload immediato
}

/* ---------------- Motore: opera successiva ---------------- */
// precarica fuori dallo stage: se l'URL muore si passa avanti senza bloccare
// filtro sfondo 16:9: solo immagini larghe (ASPECT_MIN), le verticali vengono saltate
function precarica(url, ok, ko) {
	var im = new Image();
	im.onload = function () {
		var r = im.naturalWidth / (im.naturalHeight || 1);
		if (r < ASPECT_MIN) return ko();           // troppo alta: non va bene come sfondo TV
		ok(im);
	};
	im.onerror = ko;
	im.src = url;
}
// categoria nuova: precisa = usa catIdx già impostato, altrimenti pesca a caso tra le altre
function nuovaCategoria(s, precisa) {
	var i = catIdx;
	if (!precisa) {
		if (CATEGORIE.length > 1) { while (i === catIdx) i = rand(CATEGORIE.length); }
		else i = 0;
	}
	var t = CATEGORIE[i].src === 'nasa'
		? nasaLista(CATEGORIE[i].q).then(function (op) {
			if (s !== seq) return null;
			catIdx = i; aggiornaCat();
			coda = shuffle(op); pos = 0;         // le opere NASA arrivano già normalizzate
			return true;
		})
		: cerca(CATEGORIE[i].q).then(function (ids) {
			if (s !== seq) return null;
			catIdx = i; aggiornaCat();
			coda = shuffle(ids);                  // ordine a caso ad ogni visita della categoria
			pos = 0;
			return true;
		});
	return t;
}
// risolve l'elemento della coda: stringa = id Met, oggetto = opera già pronta (NASA/favoriti)
function elemOpera(e) {
	if (typeof e === 'string') return opera(e);
	return Promise.resolve(e);
}
// trova la prossima opera (dir: 1 avanti, -1 indietro); scarta quelle senza immagine
function trova(dir, tent, s) {
	if (s !== seq) return Promise.resolve(null);
	if (tent > 40) return Promise.reject(new Error('troppe opere senza immagine di fila'));
	if (!coda.length)
		return nuovaCategoria(s, catIdx >= 0).then(function (r) {
			return (s !== seq || !r) ? null : trova(dir, tent + 1, s);
		});
	if (dir > 0 && pos >= coda.length - 1)    // coda finita → altra categoria a caso
		return nuovaCategoria(s, false).then(function (r) {
			return (s !== seq || !r) ? null : trova(dir, tent + 1, s);
		});
	var np = dir > 0 ? pos + 1 : (pos <= 0 ? coda.length - 1 : pos - 1);
	return elemOpera(coda[np]).then(function (a) {
		if (s !== seq) return null;
		if (!a) return trova(dir, tent + 1, s);
		return { opera: a, pos: np };
	}, function () { return trova(dir, tent + 1, s); });   // errore fetch: salto l'opera
}
function erroreRete(err) {
	var msg = String((err && err.message) || err || 'errore').slice(0, 60);
	var src = (catIdx >= 0 && CATEGORIE[catIdx].src === 'nasa') ? 'NASA' : 'Met Museum';
	$('fonte').textContent = src + ' · errore: ' + msg;
	$('fonte').className = 'hint err';
	if (!avvioOk) {
		attivaAttesa('Connessione non riuscita (' + src + ')',
			'Non riesco a scaricare le opere (' + src + '): ' + msg + '. ' +
			'Verifica la connessione internet del TV: riprovo tra 10 secondi.');
	} else {
		banner('Errore di rete (' + msg + '): riprovo tra 10 secondi', 9000);
	}
	if (timerRetry) clearTimeout(timerRetry);
	timerRetry = setTimeout(function () { timerRetry = null; avanza(1); }, RETRY_MS);
}
// avanza di dir: seq cresce a ogni salto → le risposte vecchie vengono scartate
function avanza(dir) {
	if (favMode) return avanzaFav(dir);
	var s = ++seq;
	if (timerRetry) { clearTimeout(timerRetry); timerRetry = null; }
	fermaSlide();
	trova(dir, 0, s).then(function (t) {
		if (s !== seq || !t) return;
		pos = t.pos;
		precarica(t.opera.img,
			function () { if (s === seq) mostra(t.opera, dir); },
			function () { if (s === seq) avanza(dir); });   // immagine rotta: la successiva
	}, function (err) { if (s === seq) erroreRete(err); });
}

/* ---------------- Preferiti (sfondi salvati) ---------------- */
function avanzaFav(dir) {
	var s = ++seq;
	fermaSlide();
	favPos = (favPos + dir + favCoda.length) % favCoda.length;
	precarica(favCoda[favPos].img,
		function () { if (s === seq) mostra(favCoda[favPos], dir); },
		function () { if (s === seq) avanzaFav(dir); });
}
function esciFav() {
	if (!favMode) return;
	favMode = false;
	favCoda.forEach(function (o) { URL.revokeObjectURL(o.img); });
	favCoda = [];
}

/* ---------------- Categoria (↑ ↓ o click sul chip) ---------------- */
function cambiaCat(d) {
	esciFav();
	catIdx = (catIdx + d + CATEGORIE.length) % CATEGORIE.length;
	coda = []; pos = 0; aggiornaCat();
	banner('Categoria: ' + CATEGORIE[catIdx].nome, 3000);
	avanza(1);
}

/* ---------------- Orologio ---------------- */
function aggiornaOra() { $('clock').textContent = hhmmss(Date.now()); }
setInterval(aggiornaOra, 1000);

/* ---------------- Immagini rotte a runtime (capture, come NuSport) ---------------- */
document.addEventListener('error', function (e) {
	var el = e.target;
	if (!el || !el.classList || !el.classList.contains('slide')) return;
	avanza(1);                                // l'opera successiva, senza bloccare
}, true);

/* ---------------- Magic Remote (pointer, wheel, VK) ---------------- */
document.addEventListener('click', function (e) {
	var el = e.target;
	while (el && el.nodeType === 1) {
		if (el.id === 'retry') {
			nascondiAttesa(); banner('Ritento il collegamento…', 4000); avanza(1);
			e.preventDefault(); return;
		}
		if (el.id === 'cat') { cambiaCat(1); e.preventDefault(); return; }
		if (el.id === 'save') { salvaSfondo(); e.preventDefault(); return; }
		if (el.id === 'fav') {
			if (favMode) { esciFav(); aggiornaCat(); avanza(1); }
			else {
				apriFavoriti().then(function (ok) {
					if (ok) { banner('★ Preferiti: ' + favCoda.length + ' sfondi salvati', 3500); avanza(1); }
				});
			}
			e.preventDefault(); return;
		}
		el = el.parentNode;
	}
	var w = $('wait');
	if (w && !w.classList.contains('hidden')) return;   // durante l'attesa: solo Riprova
	// attività non necessaria: interfaccia on/off (modalità salvaschermo)
	document.body.classList.toggle('noui');
	e.preventDefault();
});
document.addEventListener('wheel', function (e) {
	e.preventDefault();
	var d = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
	if (d) avanza(d);                          // rotella: cambio manuale opera
}, { passive: false });
document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
	switch (k) {
		case 37: avanza(-1); break;            // ← opera precedente
		case 39: avanza(1); break;             // → opera successiva
		case 38: cambiaCat(-1); break;         // ↑ categoria precedente
		case 40: cambiaCat(1); break;          // ↓ categoria successiva
		case 13: avanza(1); break;             // VK OK: salta
		case 415: salvaSfondo(); break;        // VK Play/Pause: salva lo sfondo corrente
		case 461: case 8: case 27:             // Back / Backspace / Esc: esci
			if (window.history.length > 1) window.history.back();
			else if (window.close) window.close();
			break;
		default: return;
	}
	e.preventDefault();
});

/* ---------------- Avvio ---------------- */
aggiornaOra();
aggiornaCat();
dbAggiornaChip();
banner('NusArt · sfondi dal Met Museum + NASA — caricamento…', 5000);
// fallback: se entro 10 s non arriva nessuna immagine → schermata di attesa
timerAvvio = setTimeout(function () {
	if (!avvioOk) {
		attivaAttesa('La galleria non risponde',
			'Nessuna immagine dal Met Museum entro 10 secondi. Verifica la connessione ' +
			'internet del TV, poi premi Riprova (oppure riprovo automaticamente tra poco).');
	}
}, AVVIO_TIMEOUT);
// prima categoria a caso (nessun id hard-coded, nessuna posizione fissa)
catIdx = rand(CATEGORIE.length);
avanza(1);

})();
