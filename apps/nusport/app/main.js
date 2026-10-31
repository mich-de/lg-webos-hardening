/* NuSport — Risultati sport per webOS 5.x (rooted, webapp) _org.nusport.app_
 * Nessun framework, nessun build, nessun CDN: JS vanilla.
 * Target Chromium 79: niente ?. / ??, niente gap su flex, niente inset CSS.
 * Fonte dati: ESPN public API (nessuna chiave):
 *   scoreboard: https://site.api.espn.com/apis/site/v2/sports/{dir}/{slug}/scoreboard?dates=YYYYMMDD
 *   classifica: https://site.api.espn.com/apis/v2/sports/soccer/{slug}/standings
 * App parte da file:// → XHR https diretti dalla webview (http:// verso LAN bloccato).
 * Cache di lettura SOLO in memoria durante la sessione.
 */
(function () {
'use strict';

/* ---------------- Config ---------------- */
var ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
var ESPN_STD = 'https://site.api.espn.com/apis/v2/sports/';
var REFRESH_MS = 60 * 1000;
// calendario a intervallo: scoreboard rifiuta dates=A-B (400), header lo accetta ed è leggero (~25 KB/30 gg)
var ESPN_HDR = 'https://site.web.api.espn.com/apis/v2/scoreboard/header';
var APP_ID = 'org.nusport.app';
var VISIBLE = 5;          // card visibili in lista
var STD_VISIBLE = 17;     // righe classifica visibili
var CAL_VISIBLE = 12;     // righe calendario visibili
var LEADS = [5, 10, 15, 30];

// kind: team (calcio/basket) | tennis | f1. std: ha classifica.
var LEGHE = [
	{ dir: 'soccer',     slug: 'ita.1',          nome: 'Serie A',    kind: 'team', std: true },
	{ dir: 'soccer',     slug: 'ita.2',          nome: 'Serie B',    kind: 'team', std: true },
	{ dir: 'soccer',     slug: 'eng.1',          nome: 'Premier',    kind: 'team', std: true },
	{ dir: 'soccer',     slug: 'uefa.champions', nome: 'Champions',  kind: 'team', std: true },
	{ dir: 'basketball', slug: 'nba',            nome: 'NBA',        kind: 'team' },
	{ dir: 'tennis',     slug: 'atp',            nome: 'Tennis ATP', kind: 'tennis' },
	{ dir: 'tennis',     slug: 'wta',            nome: 'Tennis WTA', kind: 'tennis' },
	{ dir: 'racing',     slug: 'f1',             nome: 'Formula 1',  kind: 'f1' }
];

var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
var GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
	'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
var DAYLAB = { '-1': 'Ieri', '0': 'Oggi', '1': 'Domani' };

var SVG_BELL = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6v-5a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>';
var SVG_GEAR = '<svg class="svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54a7.4 7.4 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>';

/* ---------------- Impostazioni (localStorage) ---------------- */
function lsGet(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage pieno/bloccato: resta in memoria */ } }
var cfg = lsGet('nusport.cfg', {});
function fixCfg() {
	var all = LEGHE.map(function (l) { return l.slug; });
	var ord = (cfg.order || []).filter(function (s) { return all.indexOf(s) >= 0; });
	all.forEach(function (s) { if (ord.indexOf(s) < 0) ord.push(s); });
	cfg.order = ord;
	cfg.off = (cfg.off || []).filter(function (s) { return all.indexOf(s) >= 0; });
	if (cfg.off.length >= all.length) cfg.off = [];           // almeno una lega visibile
	if (LEADS.indexOf(cfg.lead) < 0) cfg.lead = 10;
	if (all.indexOf(cfg.start) < 0) cfg.start = 'ita.1';
}
fixCfg();
// 0.3.4: Serie A era finita nascosta per un tocco accidentale in Impostazioni; la riattiva una volta sola
if (!cfg.fixA) { cfg.off = cfg.off.filter(function (s) { return s !== 'ita.1'; }); cfg.fixA = 1; lsSet('nusport.cfg', cfg); }
var TABS = [];
function buildTabs() {
	TABS = cfg.order.filter(function (s) { return cfg.off.indexOf(s) < 0; }).map(function (s) {
		return LEGHE.filter(function (l) { return l.slug === s; })[0];
	});
}
buildTabs();
function tabOf(slug) { for (var i = 0; i < TABS.length; i++) if (TABS[i].slug === slug) return i; return -1; }

/* ---------------- Stato ---------------- */
var fTab = Math.max(0, tabOf(cfg.start)); // lega selezionata (indice in TABS)
var dayOff = 0;          // -1 ieri, 0 oggi, 1 domani
var view = 'partite';    // 'partite' | 'classifica' | 'calendario'
var zone = 'list';       // 'top' | 'tabs' | 'bar' | 'list'
var fTop = 0;            // 0 promemoria, 1 impostazioni
var panel = null;        // null | 'detail' | 'rem' | 'cfg'
var pR = 0, pC = 0;      // fuoco nel pannello (riga/colonna)
var dEv = null;          // evento nel dettaglio
var pendingOpen = null;  // id evento da aprire dopo il caricamento (lancio da promemoria)
var fBar = 0;            // bottone barra a fuoco
var fEv = 0, topEv = 0;  // evento a fuoco / prima card visibile
var topRow = 0;          // prima riga classifica visibile
var loading = false;
var cache = {};          // key -> {ts, data, err}
var lastUpdate = null;
var netErr = null;
var reqSeq = 0;          // scarta risposte vecchie se l'utente cambia tab nel frattempo

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
function toMs(v) {
	if (v == null) return null;
	var n = Date.parse(String(v));                 // ESPN: "2026-10-31T19:45Z"
	if (isNaN(n)) n = Date.parse(String(v).replace('Z', ':00Z'));
	return isNaN(n) ? null : n;
}
function dayStart(off) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + off); return d; }
function ymd(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function dayOfMs(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dataLunga(d) { return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()]; }
function dataBreve(ms) { var d = new Date(ms); return GG[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
// loghi ESPN sono 500px: il combiner ESPN li ridimensiona (meno RAM/banda sulla TV)
function logoUrl(href, px) {
	if (!href) return '';
	var m = /^https?:\/\/a\.espncdn\.com(\/i\/.+\.png)$/.exec(href);
	return m ? 'https://a.espncdn.com/combiner/i?img=' + m[1] + '&w=' + px + '&h=' + px : href;
}
function imgTag(href, px, cls) {
	if (!href) return '<span class="' + cls + ' noimg"></span>';
	return '<img class="' + cls + '" src="' + esc(logoUrl(href, px)) + '" data-orig="' + esc(href) + '">';
}
// logo combiner fallito → originale; originale fallito → nascondo
document.addEventListener('error', function (e) {
	var el = e.target;
	if (!el || el.tagName !== 'IMG') return;
	var o = el.getAttribute('data-orig');
	if (o && el.src !== o) { el.src = o; el.removeAttribute('data-orig'); }
	else el.style.visibility = 'hidden';
}, true);

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

/* ---------------- Traduzioni ---------------- */
function roundIT(s) {
	s = String(s || '');
	var m = /^Round of (\d+)$/i.exec(s);
	if (m) return m[1] === '16' ? 'Ottavi' : m[1] === '32' ? 'Sedicesimi' : 'Turno a ' + m[1];
	return s.replace(/^Final$/i, 'Finale').replace(/^Semifinals?$/i, 'Semifinale')
		.replace(/^Quarterfinals?$/i, 'Quarti').replace(/^Round (\d+)$/i, '$1° turno')
		.replace(/Qualifying/i, 'Qualificazioni');
}
function sessIT(a) {
	var m = { FP1: 'Prove libere 1', FP2: 'Prove libere 2', FP3: 'Prove libere 3', Qual: 'Qualifiche',
		Race: 'Gara', Sprint: 'Sprint', SS: 'Qualifiche Sprint', SQ: 'Qualifiche Sprint' };
	return m[a] || a || 'Sessione';
}
function detailTypeIT(d) {
	var t = String((d.type && d.type.text) || '');
	if (d.ownGoal) return { c: 'og', t: 'Autogol' };
	if (d.scoringPlay && d.penaltyKick) return { c: 'goal', t: 'Gol (rig.)' };
	if (d.scoringPlay) return { c: 'goal', t: 'Gol' };
	if (d.redCard) return { c: 'red', t: 'Espulsione' };
	if (d.yellowCard) return { c: 'yellow', t: 'Ammonizione' };
	if (/Penalty - Missed|Penalty - Saved/i.test(t)) return { c: 'miss', t: 'Rigore sbagliato' };
	if (/Substitution/i.test(t)) return { c: 'sub', t: 'Cambio' };
	return { c: 'other', t: t };
}

/* ---------------- Normalizzazione ---------------- */
function stato(status, lega) {
	status = status || {};
	var type = status.type || {};
	var name = String(type.name || '');
	var st = String(type.state || (type.completed ? 'post' : 'pre'));
	if (/POSTPON/.test(name)) return { state: 'off', big: 'Rinv.', small: 'Rinviata' };
	if (/CANCEL|ABANDON/.test(name)) return { state: 'off', big: 'Annull.', small: 'Annullata' };
	if (st === 'post') {
		var s = String(type.shortDetail || '');
		var small = /Pen/i.test(s) ? 'dopo i rigori' : /AET|OT/i.test(s) ? 'dopo i suppl.' : 'Finale';
		return { state: 'post', big: lega.dir === 'soccer' ? 'FT' : 'Fin.', small: small };
	}
	if (st === 'in') {
		var p = status.period || 0, clock = String(status.displayClock || '');
		if (/HALFTIME|HALF_TIME/.test(name) || type.shortDetail === 'HT') return { state: 'in', big: 'LIVE', small: 'Intervallo' };
		if (lega.dir === 'soccer') return { state: 'in', big: 'LIVE', small: clock || (p + '° tempo') };
		if (lega.kind === 'tennis') return { state: 'in', big: 'LIVE', small: p ? p + '° set' : 'In corso' };
		if (lega.dir === 'basketball') {
			if (/END_PERIOD/.test(name)) return { state: 'in', big: 'LIVE', small: 'Fine Q' + p };
			return { state: 'in', big: 'LIVE', small: (p > 4 ? 'OT' + (p - 4) : 'Q' + p) + (clock ? ' ' + clock : '') };
		}
		return { state: 'in', big: 'LIVE', small: clock || 'In corso' };
	}
	return { state: 'pre', big: '', small: '' };
}
function side(c, tennis) {
	if (!c) return null;
	var t = c.team || {}, at = c.athlete || {};
	var sets = (c.linescores || []).map(function (l) { return l.value; });
	return {
		id: String(t.id || at.id || c.id || ''),
		name: String(t.displayName || at.displayName || t.name || ''),
		logo: t.logo || ((t.logos && t.logos[0]) ? t.logos[0].href : '') || (at.flag ? at.flag.href : ''),
		score: tennis ? sets.join(' ') : (c.score == null || c.score === '' ? null : String(c.score)),
		sets: sets,
		winner: !!c.winner,
		form: c.form || '',
		record: (c.records && c.records[0]) ? c.records[0].summary : '',
		leaders: c.leaders || []
	};
}
function normComp(comp, lega, note) {
	var home = null, away = null;
	(comp.competitors || []).forEach(function (c) {
		if (c.homeAway === 'home') home = c; else if (c.homeAway === 'away') away = c;
	});
	if (!home || !away) { var cs = comp.competitors || []; home = cs[0]; away = cs[1]; }
	var tennis = lega.kind === 'tennis';
	var h = side(home, tennis), a = side(away, tennis);
	if (!h || !a || (!h.name && !a.name)) return null;
	var v = comp.venue || {};
	var dets = (comp.details || []).map(function (d) {
		var ty = detailTypeIT(d), ath = (d.athletesInvolved && d.athletesInvolved[0]) || {};
		return {
			c: ty.c, t: ty.t, min: (d.clock && d.clock.displayValue) || '',
			who: ath.shortName || ath.displayName || '',
			team: String((d.team && d.team.id) || '')
		};
	});
	return {
		id: String(comp.id || ''), slug: lega.slug,
		kind: lega.kind, date: toMs(comp.date || comp.startDate), st: stato(comp.status, lega),
		h: h, a: a, dets: dets,
		venue: v.fullName || v.displayName || '',
		city: (v.address && (v.address.city || '')) || v.court || '',
		note: note || '',
		home: home, away: away
	};
}
function normScoreboard(j, lega, day) {
	var out = [];
	((j && j.events) || []).forEach(function (ev) {
		if (lega.kind === 'f1') {
			var circ = ev.circuit || {};
			(ev.competitions || []).forEach(function (c) {
				var abbr = (c.type && c.type.abbreviation) || '';
				var cs = (c.competitors || []).slice().sort(function (x, y) { return (x.order || 99) - (y.order || 99); });
				out.push({
					id: String(c.id || ''), slug: lega.slug,
					kind: 'f1', date: toMs(c.date), st: stato(c.status, lega),
					title: sessIT(abbr), gp: String(ev.name || ''),
					venue: circ.fullName || '', city: (circ.address && circ.address.city) || '',
					order: cs.map(function (x) { return (x.athlete && (x.athlete.shortName || x.athlete.displayName)) || ''; })
				});
			});
			return;
		}
		if (lega.kind === 'tennis') {
			var gs = ev.groupings || [];
			var sing = gs.filter(function (g) { return /Singles/i.test((g.grouping && g.grouping.displayName) || ''); });
			(sing.length ? sing : gs).forEach(function (g) {
				(g.competitions || []).forEach(function (c) {
					var r = c.round ? roundIT(c.round.displayName) : '';
					var e = normComp(c, lega, String(ev.name || '') + (r ? ' · ' + r : ''));
					// shortcut: tennis filtrato per giorno locale lato client (scoreboard copre tutto il torneo)
					if (e && (e.date == null || dayOfMs(e.date) === day.getTime() || (dayOff === 0 && e.st.state === 'in'))) out.push(e);
				});
			});
			return;
		}
		var comp = (ev.competitions && ev.competitions[0]) || {};
		var e = normComp(comp, lega, '');
		if (e) out.push(e);
	});
	out.sort(function (x, y) {
		var lx = x.st.state === 'in' ? 0 : 1, ly = y.st.state === 'in' ? 0 : 1;
		if (lx !== ly && lega.kind === 'tennis') return lx - ly;   // tennis: tante partite, live in cima
		var dx = x.date == null ? Infinity : x.date, dy = y.date == null ? Infinity : y.date;
		return dx - dy || lx - ly;
	});
	return out;
}
function zonaIT(s) {
	return String(s || '').replace(/Relegat\w*/i, 'Retrocessione').replace(/Promot\w*/i, 'Promozione')
		.replace(/qualifying/i, '(preliminari)').replace(/Playoffs?/i, 'Playoff')
		.replace(/Round of 16/i, 'Ottavi').replace(/Knockout/i, 'Eliminazione diretta');
}
function normStandings(j) {
	var groups = [];
	((j && j.children) || [j]).forEach(function (ch) {
		var s = ch && ch.standings;
		if (!s || !s.entries) return;
		var rows = s.entries.map(function (en) {
			var st = {};
			(en.stats || []).forEach(function (x) { st[x.name] = x.displayValue != null ? x.displayValue : x.value; });
			var t = en.team || {};
			return {
				rank: +st.rank || 0, name: t.displayName || t.name || '',
				logo: (t.logos && t.logos[0]) ? t.logos[0].href : '',
				g: st.gamesPlayed, v: st.wins, n: st.ties, p: st.losses,
				gf: st.pointsFor, gs: st.pointsAgainst, dr: st.pointDifferential, pt: st.points,
				color: en.note ? en.note.color : '', zone: en.note ? zonaIT(en.note.description) : ''
			};
		});
		rows.sort(function (x, y) { return (x.rank || 999) - (y.rank || 999); });
		groups.push({ name: ch.name || '', season: s.seasonDisplayName || '', rows: rows });
	});
	return groups;
}

// header ESPN: competitors piatti (displayName/logo), stato in fullStatus
function normHeader(j, lega) {
	var lg = (j && j.sports && j.sports[0] && j.sports[0].leagues && j.sports[0].leagues[0]) || {};
	var out = [];
	(lg.events || []).forEach(function (x) {
		var cs = x.competitors || [], h = null, a = null;
		cs.forEach(function (c) { if (c.homeAway === 'home') h = c; else if (c.homeAway === 'away') a = c; });
		if (!h || !a) { h = cs[0]; a = cs[1]; }
		if (!h || !a) return;
		var sd = function (c) {
			return { id: String(c.id || ''), name: String(c.displayName || c.name || ''), logo: c.logo || '',
				score: c.score == null || c.score === '' ? null : String(c.score), sets: [], winner: !!c.winner,
				form: '', record: c.record || '', leaders: [] };
		};
		out.push({ id: String(x.id || ''), slug: lega.slug, kind: 'team', date: toMs(x.date),
			st: stato(x.fullStatus, lega), h: sd(h), a: sd(a), dets: [], venue: x.location || '', city: '', note: '' });
	});
	return out;
}
// lista piatta per il calendario: righe intestazione {hdr} + eventi futuri/in corso
function normCal(evs, lega) {
	var rows = [], last = null;
	var lim = Date.now() - 3 * 3600 * 1000;   // niente passati (es. GP annullati di aprile)
	evs.filter(function (e) { return e.date != null && (e.st.state === 'in' || (e.st.state !== 'post' && e.date > lim)); })
		.sort(function (x, y) { return x.date - y.date; })
		.forEach(function (e) {
			var k = lega.kind === 'f1' ? e.gp : String(dayOfMs(e.date));
			if (k !== last) {
				last = k;
				rows.push({ hdr: lega.kind === 'f1' ? e.gp + (e.venue ? ' · ' + e.venue : '') + (e.city ? ', ' + e.city : '') : dataLunga(new Date(e.date)) });
			}
			rows.push(e);
		});
	return rows;
}

/* ---------------- Caricamento ---------------- */
function lega() { return TABS[fTab]; }
function calDays(l) { return l.dir === 'basketball' ? 7 : 30; }
function curKey() {
	var l = lega();
	if (view === 'classifica') return l.slug + '|std';
	if (view === 'calendario') return l.slug + '|cal|' + ymd(dayStart(0));
	if (l.kind === 'team') return l.slug + '|' + ymd(dayStart(dayOff));
	return l.slug + '|' + (l.kind === 'tennis' ? ymd(dayStart(dayOff)) : 'all');
}
function curUrl() {
	var l = lega();
	if (view === 'classifica') return ESPN_STD + l.dir + '/' + l.slug + '/standings';
	var u = ESPN + l.dir + '/' + l.slug + '/scoreboard';
	// shortcut: F1 solo stagione dell'anno corrente; a dicembre dopo l'ultimo GP la lista è vuota fino al nuovo anno
	if (view === 'calendario') return l.kind === 'f1' ? u + '?dates=' + new Date().getFullYear()
		: ESPN_HDR + '?sport=' + l.dir + '&league=' + l.slug + '&dates=' + ymd(dayStart(0)) + '-' + ymd(dayStart(calDays(l) - 1));
	// shortcut: dates= usa il giorno ESPN (US Eastern); NBA notturna può cadere sul giorno dopo in Italia
	return l.kind === 'team' ? u + '?dates=' + ymd(dayStart(dayOff)) + '&limit=200' : u;
}
function curData() { var e = cache[curKey()]; return e ? e.data : null; }
function curErr() { var e = cache[curKey()]; return e ? e.err : null; }

function load(force) {
	var key = curKey(), url = curUrl(), l = lega(), v = view, day = dayStart(dayOff);
	var e = cache[key];
	var ttl = v === 'calendario' ? 10 * REFRESH_MS : REFRESH_MS;
	if (e && e.data && !force && Date.now() - e.ts < ttl) { reqSeq++; loading = false; render(); afterLoad(); return; }
	var seq = ++reqSeq;
	loading = true; render();
	getJson(url).then(function (j) {
		var data = v === 'classifica' ? normStandings(j)
			: v === 'calendario' ? normCal(l.kind === 'f1' ? normScoreboard(j, l, day) : normHeader(j, l), l)
			: normScoreboard(j, l, day);
		cache[key] = { ts: Date.now(), data: data, err: null };
		lastUpdate = Date.now(); netErr = null;
	}).catch(function (err) {
		netErr = String((err && err.message) || err).slice(0, 40);
		if (e && e.data) e.err = netErr;                   // tengo l'ultimo dato buono
		else cache[key] = { ts: 0, data: null, err: netErr };
	}).then(function () {
		if (seq !== reqSeq) return;
		loading = false;
		var d = curData();
		var n = d ? (view === 'classifica' ? 0 : d.length) : 0;
		if (fEv >= n) { fEv = Math.max(0, n - 1); }
		if (d && d[fEv] && d[fEv].hdr && d[fEv + 1]) fEv++;
		if (fEv < topEv || fEv >= topEv + visN()) topEv = Math.max(0, fEv - visN() + 1);
		render(); afterLoad();
	});
}
// lancio da promemoria: apro il dettaglio dell'evento appena la lista è pronta
function afterLoad() {
	if (!pendingOpen || loading) return;
	var id = pendingOpen; pendingOpen = null;
	var d = curData() || [];
	for (var i = 0; i < d.length; i++) if (d[i].id === id) { fEv = i; topEv = Math.max(0, i - visN() + 1); renderList(); dEv = d[i]; openDetail(); return; }
	var r = remById(id);
	if (r && r.snap) { dEv = r.snap; openDetail(); }
}

/* ---------------- Barra (giorni / vista / aggiorna) ---------------- */
function barItems() {
	var l = lega(), it = [];
	// stesse viste per tutte le leghe dello stesso tipo (team: Partite/[Classifica]/Calendario; F1: Weekend/Stagione)
	if (l.kind !== 'tennis') {
		it.push({ id: 'v-partite', lab: l.kind === 'f1' ? 'Weekend' : 'Partite', on: view === 'partite' });
		if (l.std) it.push({ id: 'v-classifica', lab: 'Classifica', on: view === 'classifica' });
		it.push({ id: 'v-calendario', lab: l.kind === 'f1' ? 'Stagione' : 'Calendario', on: view === 'calendario' });
	}
	if (view === 'partite' && l.kind !== 'f1') {
		[-1, 0, 1].forEach(function (o) {
			var d = dayStart(o);
			it.push({ id: 'd' + o, lab: DAYLAB[o] + ' <small>' + GG[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + '</small>', on: dayOff === o, day: true });
		});
	}
	it.push({ id: 'refresh', lab: '<svg class="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg> Aggiorna', on: false });
	return it;
}
function barAction(id) {
	if (id === 'refresh') { load(true); return; }
	if (id.slice(0, 2) === 'v-') {
		var nv = id.slice(2);
		if (nv !== view) { view = nv; fEv = topEv = topRow = 0; load(false); }
		return;
	}
	if (id.charAt(0) === 'd') setDay(+id.slice(1));
}
function setDay(o) {
	if (view !== 'partite' || lega().kind === 'f1') return;
	o = Math.max(-1, Math.min(1, o));
	if (o === dayOff) return;
	dayOff = o; fEv = topEv = 0; load(false);
}

/* ---------------- Render ---------------- */
function render() {
	renderTabs(); renderBar();
	if (view === 'classifica') renderStandings(); else renderList();
	updateHeader(); updateFocusUI();
}
function renderTabs() {
	var w = $('tabs'), h = '';
	TABS.forEach(function (l, i) {
		h += '<div class="leag' + (i === fTab ? ' active' : '') + '" data-tab="' + i + '">' + esc(l.nome) + '</div>';
	});
	w.innerHTML = h;
}
function renderBar() {
	var it = barItems(), h = '', sep = false;
	if (fBar >= it.length) fBar = it.length - 1;
	it.forEach(function (b, i) {
		if (h && ((b.day && !sep) || b.id === 'refresh')) h += '<span class="bsep"></span>';
		if (b.day) sep = true;
		h += '<div class="bbtn' + (b.on ? ' on' : '') + '" data-bar="' + i + '" data-id="' + b.id + '">' + b.lab + '</div>';
	});
	var t = lega().nome + (view === 'classifica' ? ' · Classifica'
		: view === 'calendario' ? (lega().kind === 'f1' ? ' · Stagione ' + new Date().getFullYear() : ' · Prossimi ' + calDays(lega()) + ' giorni')
		: lega().kind === 'f1' ? ' · Weekend di gara' : ' · ' + dataLunga(dayStart(dayOff)));
	$('bar').innerHTML = h + '<div id="bartitle">' + esc(t) + '</div>';
}
function showMsg(kind, title, sub, retry) {
	var nd = $('nulldata');
	nd.className = kind;
	nd.innerHTML = '<div class="nicon">' + (kind === 'err' ? '!' : kind === 'load' ? '' : '&#8212;') + '</div>'
		+ '<div class="ntitle">' + esc(title) + '</div>'
		+ (sub ? '<div class="nsub">' + esc(sub) + '</div>' : '')
		+ (retry ? '<div id="retry" class="bbtn' + (zone === 'list' ? ' focused' : '') + '">Riprova</div>' : '');
}
function hideMsg() { $('nulldata').className = 'hidden'; }

function renderList() {
	var w = $('eventlist'); w.innerHTML = '';
	$('standings').className = 'hidden';
	w.className = '';
	var evs = curData(), l = lega();
	if (!evs) {
		if (loading) showMsg('load', 'Caricamento ' + l.nome + '…', '', false);
		else showMsg('err', 'Impossibile caricare i dati', 'Verifica la connessione di rete' + (curErr() ? ' (' + curErr() + ')' : ''), true);
		return;
	}
	if (!evs.length) {
		if (view === 'calendario') { showMsg('empty', 'Nessun evento in programma · ' + l.nome, '', false); return; }
		showMsg('empty', 'Nessun evento ' + (l.kind === 'f1' ? 'in calendario' : DAYLAB[dayOff].toLowerCase()) + ' · ' + l.nome,
			l.kind === 'f1' ? '' : 'Usa ← → per cambiare giorno', false);
		return;
	}
	hideMsg();
	var h = '';
	if (view === 'calendario') {
		w.className = 'cal';
		var ce = Math.min(evs.length, topEv + CAL_VISIBLE);
		for (var j = topEv; j < ce; j++) h += evs[j].hdr ? '<div class="chdr">' + esc(evs[j].hdr) + '</div>' : calRow(evs[j], j);
		if (evs.length > CAL_VISIBLE) h += '<div class="pager">righe ' + (topEv + 1) + '–' + ce + ' di ' + evs.length + '</div>';
		w.innerHTML = h;
		return;
	}
	var end = Math.min(evs.length, topEv + VISIBLE);
	for (var i = topEv; i < end; i++) h += evs[i].kind === 'f1' ? cardF1(evs[i], i) : cardMatch(evs[i], i);
	if (evs.length > VISIBLE) h += '<div class="pager">' + (topEv + 1) + '–' + end + ' di ' + evs.length + '</div>';
	w.innerHTML = h;
}
function statusCol(ev) {
	var s = ev.st;
	if (s.state === 'in') return '<div class="cstat"><span class="badge-live">LIVE</span><div class="smin">' + esc(s.small) + '</div></div>';
	if (s.state === 'post') return '<div class="cstat"><div class="sbig fin">' + esc(s.big) + '</div><div class="smin dim">' + esc(s.small) + '</div></div>';
	if (s.state === 'off') return '<div class="cstat"><div class="sbig off">' + esc(s.big) + '</div><div class="smin dim">' + esc(s.small) + '</div></div>';
	var other = ev.date != null && dayOfMs(ev.date) !== dayStart(dayOff).getTime();
	return '<div class="cstat"><div class="sbig">' + (ev.date != null ? hhmm(ev.date) : '—') + '</div>'
		+ '<div class="smin dim">' + (other ? dataBreve(ev.date) : 'inizio') + '</div></div>';
}
function scorers(ev, s) {
	var g = ev.dets.filter(function (d) { return d.team === s.id && (d.c === 'goal' || d.c === 'red'); });
	// autogol: assegnato alla squadra che ne beneficia (ESPN mette team del beneficiario)
	var og = ev.dets.filter(function (d) { return d.team === s.id && d.c === 'og'; });
	g = g.concat(og);
	return g.map(function (d) {
		if (d.c === 'red') return '<span class="rc"></span>' + esc(d.who) + ' ' + esc(d.min);
		return esc(d.who) + ' ' + esc(d.min) + (d.c === 'og' ? ' (aut.)' : d.t === 'Gol (rig.)' ? ' (rig.)' : '');
	}).join(', ');
}
function teamRow(ev, s, other) {
	var pre = ev.st.state === 'pre' || ev.st.state === 'off';
	var lose = ev.st.state === 'post' && other.winner && !s.winner;
	return '<div class="crow' + (lose ? ' lose' : '') + '">'
		+ imgTag(s.logo, 80, 'logo')
		+ '<div class="tname">' + esc(s.name) + '</div>'
		+ '<div class="tscore' + (pre ? ' dim' : '') + '">' + (pre ? '' : esc(s.score == null ? '-' : s.score)) + '</div>'
		+ '<div class="tsc">' + (ev.kind === 'team' ? scorers(ev, s) : '') + '</div>'
		+ '</div>';
}
function cardMatch(ev, idx) {
	var foot = [];
	if (ev.note) foot.push(ev.note);
	if (ev.venue) foot.push(ev.venue + (ev.city && ev.venue.indexOf(ev.city) < 0 ? ', ' + ev.city : ''));
	return '<div class="card' + (ev.st.state === 'in' ? ' islive' : '') + '" data-ev="' + idx + '">'
		+ statusCol(ev)
		+ '<div class="cbody">' + teamRow(ev, ev.h, ev.a) + teamRow(ev, ev.a, ev.h)
		+ (foot.length ? '<div class="cfoot">' + esc(foot.join(' · ')) + '</div>' : '')
		+ '</div>' + bellBadge(ev) + '</div>';
}
function bellBadge(ev) { return remById(ev.id) ? '<span class="rbadge">' + SVG_BELL + '</span>' : ''; }
function calRow(ev, idx) {
	var mid = ev.kind === 'f1'
		? '<span class="cname">' + esc(ev.title) + '</span>'
		: imgTag(ev.h.logo, 40, 'clogo') + '<span class="cname">' + esc(ev.h.name) + '</span><span class="cvs">–</span>'
			+ imgTag(ev.a.logo, 40, 'clogo') + '<span class="cname">' + esc(ev.a.name) + '</span>';
	var t = ev.st.state === 'in' ? '<span class="badge-live">LIVE</span>' : ev.st.state === 'off' ? esc(ev.st.big) : hhmm(ev.date);
	return '<div class="card crow2" data-ev="' + idx + '"><span class="ctime">' + t + '</span>'
		+ (ev.kind === 'f1' ? '<span class="cday">' + dataBreve(ev.date) + '</span>' : '')
		+ mid + '<span class="cven">' + esc(ev.kind === 'f1' ? '' : ev.venue) + '</span>' + bellBadge(ev) + '</div>';
}
function cardF1(ev, idx) {
	var pod = ev.order.slice(0, 3).map(function (n, i) { return '<span class="pod p' + (i + 1) + '">' + (i + 1) + '. ' + esc(n) + '</span>'; }).join('');
	return '<div class="card f1' + (ev.st.state === 'in' ? ' islive' : '') + '" data-ev="' + idx + '">'
		+ statusCol(ev)
		+ '<div class="cbody"><div class="f1title">' + esc(ev.title) + ' <span class="dim">· ' + esc(ev.gp) + '</span></div>'
		+ '<div class="f1pod">' + (ev.st.state === 'pre' ? '<span class="dim">' + (ev.date != null ? dataLunga(new Date(ev.date)) + ' · ore ' + hhmm(ev.date) : '') + '</span>' : pod) + '</div>'
		+ '<div class="cfoot">' + esc(ev.venue + (ev.city ? ', ' + ev.city : '')) + '</div>'
		+ '</div>' + bellBadge(ev) + '</div>';
}

function stdRows() {
	var gs = curData() || [], rows = [];
	gs.forEach(function (g) {
		if (gs.length > 1) rows.push({ group: g.name });
		g.rows.forEach(function (r) { rows.push(r); });
	});
	return rows;
}
function renderStandings() {
	$('eventlist').innerHTML = '';
	$('eventlist').className = 'hidden';
	var w = $('standings');
	var gs = curData(), l = lega();
	if (!gs) {
		w.className = 'hidden';
		if (loading) showMsg('load', 'Caricamento classifica ' + l.nome + '…', '', false);
		else showMsg('err', 'Classifica non disponibile', 'Verifica la connessione di rete' + (curErr() ? ' (' + curErr() + ')' : ''), true);
		return;
	}
	var rows = stdRows();
	if (!rows.length) { w.className = 'hidden'; showMsg('empty', 'Classifica non ancora disponibile', '', false); return; }
	hideMsg(); w.className = '';
	topRow = Math.max(0, Math.min(topRow, rows.length - STD_VISIBLE));
	var h = '<div class="srow shead"><span class="spos">#</span><span class="sname">Squadra</span>'
		+ '<span>G</span><span>V</span><span>N</span><span>P</span><span>GF</span><span>GS</span><span>DR</span><span class="spt">Pt</span></div>';
	var zones = {};
	rows.forEach(function (r) { if (r.color && r.zone) zones[r.zone] = r.color; });
	rows.slice(topRow, topRow + STD_VISIBLE).forEach(function (r) {
		if (r.group) { h += '<div class="srow sgroup">' + esc(r.group) + '</div>'; return; }
		h += '<div class="srow"><span class="spos" style="border-left-color:' + esc(r.color || 'transparent') + '">' + r.rank + '</span>'
			+ '<span class="sname">' + imgTag(r.logo, 40, 'slogo') + esc(r.name) + '</span>'
			+ '<span>' + esc(r.g) + '</span><span>' + esc(r.v) + '</span><span>' + esc(r.n) + '</span><span>' + esc(r.p) + '</span>'
			+ '<span>' + esc(r.gf) + '</span><span>' + esc(r.gs) + '</span><span>' + esc(r.dr) + '</span>'
			+ '<span class="spt">' + esc(r.pt) + '</span></div>';
	});
	var leg = Object.keys(zones).map(function (z) {
		return '<span class="zleg"><span class="zdot" style="background:' + esc(zones[z]) + '"></span>' + esc(z) + '</span>';
	}).join('');
	var season = (gs[0] && gs[0].season) ? 'Stagione ' + gs[0].season : '';
	h += '<div class="sfoot">' + leg + '<span class="spager">' + esc(season) + (rows.length > STD_VISIBLE ? ' · righe ' + (topRow + 1) + '–'
		+ Math.min(rows.length, topRow + STD_VISIBLE) + ' di ' + rows.length : '') + '</span></div>';
	w.innerHTML = h;
}

function updateHeader() {
	var now = Date.now();
	$('clock').textContent = hhmmss(now);
	$('today').textContent = dataLunga(new Date(now));
	var t = [];
	if (loading) t.push('Aggiornamento…');
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
	var nr = $('remcount'); if (nr) nr.textContent = rems.length ? String(rems.length) : '';
	Array.prototype.forEach.call(q('.leag'), function (el) {
		el.classList.toggle('focused', zone === 'tabs' && +el.getAttribute('data-tab') === fTab);
	});
	Array.prototype.forEach.call(q('#bar .bbtn'), function (el) {
		el.classList.toggle('focused', zone === 'bar' && +el.getAttribute('data-bar') === fBar);
	});
	Array.prototype.forEach.call(q('.card'), function (el) {
		el.classList.toggle('focused', zone === 'list' && +el.getAttribute('data-ev') === fEv);
	});
	var r = $('retry'); if (r) r.classList.toggle('focused', zone === 'list');
	$('standings').classList.toggle('focused', zone === 'list' && view === 'classifica');
}

/* ---------------- Dettaglio ---------------- */
function leaderLabel(name) {
	var m = { points: 'Punti', rebounds: 'Rimbalzi', assists: 'Assist', rating: 'Valutazione',
		pointspergame: 'Punti a partita', reboundspergame: 'Rimbalzi a partita', assistspergame: 'Assist a partita' };
	var k = String(name || '').toLowerCase();
	return m[k] || String(name || '').replace(/_/g, ' ');
}
// dettaglio dell'evento a fuoco (o di dEv già impostato da afterLoad)
function openFocused() {
	var evs = curData(); if (!evs || view === 'classifica') return;
	var ev = evs[fEv]; if (!ev || ev.hdr) return;
	dEv = ev; openDetail();
}
function remBtn(ev) {
	if (!canRemind(ev)) return '';
	var on = !!remById(ev.id);
	return '<div class="pi rbtn' + (on ? ' on' : '') + '" data-r="0" data-c="0" data-act="rem">' + SVG_BELL
		+ (on ? ' Promemoria attivo · rimuovi' : ' Ricordamelo') + '</div>'
		+ (on && diskOk === false ? '<div class="pnote">' + esc(diskNote()) + '</div>' : '');
}
function openDetail() {
	var ev = dEv; if (!ev) return;
	var h = remBtn(ev);
	if (ev.kind === 'f1') {
		h += '<div class="dhead"><div class="dtitle">' + esc(ev.title) + ' · ' + esc(ev.gp) + '</div></div>';
		h += '<div class="dstate">' + esc(ev.st.small || (ev.date != null ? dataLunga(new Date(ev.date)) + ' · ore ' + hhmm(ev.date) : '')) + '</div>';
		h += '<div class="dvenue">' + esc(ev.venue + (ev.city ? ', ' + ev.city : '')) + '</div>';
		h += '<div id="dextra">' + (ev.order.length ? '<div class="dcat">Classifica sessione</div>'
			+ ev.order.map(function (n, i) { return '<div class="drow">' + (i + 1) + '. ' + esc(n) + '</div>'; }).join('')
			: '<div class="drow dim">Risultati non ancora disponibili.</div>') + '</div>';
	} else {
		var pre = ev.st.state === 'pre' || ev.st.state === 'off';
		h += '<div class="dhead">'
			+ '<div class="dteam">' + imgTag(ev.h.logo, 160, 'dlogo') + '<div>' + esc(ev.h.name) + '</div>'
			+ (ev.h.record ? '<div class="dsmall">' + esc(ev.h.record) + (ev.h.form ? ' · forma ' + esc(ev.h.form) : '') + '</div>' : '') + '</div>'
			+ '<div class="dscore">' + (pre ? (ev.date != null ? hhmm(ev.date) : 'vs') : esc((ev.h.score || '-') + (ev.kind === 'tennis' ? '  |  ' : ' – ') + (ev.a.score || '-'))) + '</div>'
			+ '<div class="dteam">' + imgTag(ev.a.logo, 160, 'dlogo') + '<div>' + esc(ev.a.name) + '</div>'
			+ (ev.a.record ? '<div class="dsmall">' + esc(ev.a.record) + (ev.a.form ? ' · forma ' + esc(ev.a.form) : '') + '</div>' : '') + '</div>'
			+ '</div>';
		var stt = ev.st.state === 'in' ? 'In diretta · ' + ev.st.small : ev.st.state === 'post' ? ev.st.small : ev.st.state === 'off' ? ev.st.small
			: (ev.date != null ? dataLunga(new Date(ev.date)) + ' · ore ' + hhmm(ev.date) : 'In programma');
		h += '<div class="dstate' + (ev.st.state === 'in' ? ' live' : '') + '">' + esc(stt) + (ev.note ? ' · ' + esc(ev.note) : '') + '</div>';
		if (ev.venue) h += '<div class="dvenue">Stadio: ' + esc(ev.venue + (ev.city ? ', ' + ev.city : '')) + '</div>';
		h += '<div id="dextra">' + detailExtra(ev) + '</div>';
	}
	showPanel('detail', h);
}
function detailExtra(ev) {
	var h = '';
	var evs = ev.dets.filter(function (d) { return d.c !== 'sub' && d.c !== 'other'; });
	if (evs.length) {
		h += '<div class="dcat">Cronaca</div>';
		evs.forEach(function (d) {
			var home = d.team === ev.h.id;
			h += '<div class="dev ' + (home ? 'dh' : 'da') + '"><span class="dmin">' + esc(d.min) + '</span>'
				+ '<span class="ico i-' + d.c + '"></span><span class="dwho">' + esc(d.who) + '</span>'
				+ '<span class="dtyp">' + esc(d.t) + ' · ' + esc(home ? ev.h.name : ev.a.name) + '</span></div>';
		});
	}
	var lh = ev.h.sets, la = ev.a.sets, n = Math.min(lh.length, la.length);
	if (n > 1 || (ev.kind === 'tennis' && n)) {
		var lab = ev.kind === 'tennis' ? 'Set' : 'Q';
		h += '<div class="dcat">' + (ev.kind === 'tennis' ? 'Set' : 'Parziali') + '</div><table class="lines"><tr><td></td>';
		for (var i = 0; i < n; i++) h += '<th>' + (ev.kind === 'tennis' ? (i + 1) : (i < 4 ? lab + (i + 1) : 'OT' + (i - 3))) + '</th>';
		h += '</tr><tr><td>' + esc(ev.h.name) + '</td>' + lh.slice(0, n).map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('')
			+ '</tr><tr><td>' + esc(ev.a.name) + '</td>' + la.slice(0, n).map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr></table>';
	}
	[ev.h, ev.a].forEach(function (s) {
		var rows = [];
		s.leaders.forEach(function (cat) {
			var l = (cat.leaders || [])[0];
			if (!l || rows.length >= 3) return;
			var at = l.athlete || {};
			rows.push(leaderLabel(cat.name) + ': ' + (at.displayName || at.shortName || '') + ' (' + (l.displayValue || '') + ')');
		});
		if (rows.length) h += '<div class="dcat">Migliori · ' + esc(s.name) + '</div>' + rows.map(function (r) { return '<div class="drow">' + esc(r) + '</div>'; }).join('');
	});
	return h || '<div class="drow dim">Nessun dettaglio aggiuntivo disponibile per questo evento.</div>';
}
function closeDetail() { $('detail').classList.add('hidden'); panel = null; dEv = null; updateFocusUI(); }
function scrollDetail(d) { var x = $('dextra'); if (x) x.scrollTop += d * 120; }

/* ---------------- Pannelli (dettaglio / promemoria / impostazioni) ---------------- */
function showPanel(kind, html) {
	if (panel !== kind) { pR = 0; pC = 0; }
	panel = kind;
	$('dbody').innerHTML = html;
	$('detail').classList.remove('hidden');
	panelFocus();
}
function panelItems() { return $('dbody').querySelectorAll('.pi'); }
function panelFocus() {
	var its = panelItems(), best = null;
	Array.prototype.forEach.call(its, function (el) {
		var on = +el.getAttribute('data-r') === pR && +el.getAttribute('data-c') === pC;
		el.classList.toggle('focused', on);
		if (on) best = el;
	});
	if (best && panel !== 'detail' && best.scrollIntoView) best.scrollIntoView({ block: 'nearest' });
}
function panelMove(dr, dc) {
	var its = panelItems(), maxR = -1, cols = {};
	Array.prototype.forEach.call(its, function (el) {
		var r = +el.getAttribute('data-r'), c = +el.getAttribute('data-c');
		if (r > maxR) maxR = r;
		cols[r] = Math.max(cols[r] == null ? 0 : cols[r], c);
	});
	if (maxR < 0) return;
	pR = Math.max(0, Math.min(maxR, pR + dr));
	pC = Math.max(0, Math.min(cols[pR] || 0, pC + dc));
	panelFocus();
}
function panelFocused() {
	var its = panelItems();
	for (var i = 0; i < its.length; i++) if (+its[i].getAttribute('data-r') === pR && +its[i].getAttribute('data-c') === pC) return its[i];
	return null;
}
function panelAct(el) {
	var a = el.getAttribute('data-act') || '', arg = a.slice(a.indexOf(':') + 1);
	pR = +el.getAttribute('data-r') || 0; pC = +el.getAttribute('data-c') || 0;
	if (a === 'rem') { toggleRem(dEv); openDetail(); if (view !== 'classifica') renderList(); updateFocusUI(); return; }
	if (a.indexOf('ropen:') === 0) { closeDetail(); openEvent(arg); return; }
	if (a.indexOf('rdel:') === 0) { removeRem(arg); openRemPanel(); if (view !== 'classifica') renderList(); return; }
	if (a.indexOf('cvis:') === 0) {
		var i = cfg.off.indexOf(arg);
		if (i >= 0) cfg.off.splice(i, 1);
		else if (cfg.off.length < LEGHE.length - 1) cfg.off.push(arg);
	} else if (a.indexOf('cup:') === 0 || a.indexOf('cdn:') === 0) {
		var o = cfg.order, k = o.indexOf(arg), t = k + (a.charAt(1) === 'u' ? -1 : 1);
		if (k >= 0 && t >= 0 && t < o.length) { o[k] = o[t]; o[t] = arg; pR = t; }
	} else if (a.indexOf('cstart:') === 0) cfg.start = arg;
	else if (a.indexOf('clead:') === 0) { cfg.lead = +arg; Reminders.setLead(cfg.lead).then(null, function () { /* solo in-app */ }); }
	else return;
	saveCfg(); openCfgPanel();
}
function saveCfg() {
	var cur = lega() ? lega().slug : '';
	fixCfg(); lsSet('nusport.cfg', cfg); buildTabs();
	var i = tabOf(cur);
	if (i < 0) { fTab = 0; fEv = topEv = topRow = 0; if (view === 'calendario' && lega().kind === 'tennis') view = 'partite'; load(false); }
	else { fTab = i; render(); }
}
function openCfgPanel() {
	var h = '<div class="ptitle">' + SVG_GEAR + ' Impostazioni</div><div class="plist">'
		+ '<div class="psec">Campionati: visibilità, ordine, avvio</div>';
	cfg.order.forEach(function (s, r) {
		var l = LEGHE.filter(function (x) { return x.slug === s; })[0], vis = cfg.off.indexOf(s) < 0;
		h += '<div class="prow"><span class="pname' + (vis ? '' : ' dim') + '">' + esc(l.nome) + '</span>'
			+ '<span class="pi pb' + (vis ? ' on' : '') + '" data-r="' + r + '" data-c="0" data-act="cvis:' + s + '">' + (vis ? 'Visibile' : 'Nascosto') + '</span>'
			+ '<span class="pi pb" data-r="' + r + '" data-c="1" data-act="cup:' + s + '">Su</span>'
			+ '<span class="pi pb" data-r="' + r + '" data-c="2" data-act="cdn:' + s + '">Giù</span>'
			+ '<span class="pi pb' + (cfg.start === s ? ' on' : '') + '" data-r="' + r + '" data-c="3" data-act="cstart:' + s + '">'
			+ (cfg.start === s ? 'All\'avvio' : 'Avvio') + '</span></div>';
	});
	var lr = cfg.order.length;
	h += '<div class="psec">Anticipo promemoria</div><div class="prow">';
	LEADS.forEach(function (m, c) {
		h += '<span class="pi pb' + (cfg.lead === m ? ' on' : '') + '" data-r="' + lr + '" data-c="' + c + '" data-act="clead:' + m + '">' + m + ' min</span>';
	});
	h += '</div><div class="pnote">' + esc(diskNote()) + '</div></div>';
	showPanel('cfg', h);
}
function openRemPanel() {
	pruneRems();
	var h = '<div class="ptitle">' + SVG_BELL + ' Promemoria</div><div class="plist">';
	if (!rems.length) h += '<div class="pnote">Nessun promemoria. Apri una partita o una sessione futura e scegli “Ricordamelo”.</div>';
	if (pR >= rems.length) pR = Math.max(0, rems.length - 1);
	rems.forEach(function (x, r) {
		h += '<div class="prow"><span class="ptime">' + dataBreve(x.t) + ' · ' + hhmm(x.t) + '</span><span class="pname">' + esc(x.title) + '</span>'
			+ '<span class="pi pb" data-r="' + r + '" data-c="0" data-act="ropen:' + esc(x.id) + '">Apri</span>'
			+ '<span class="pi pb del" data-r="' + r + '" data-c="1" data-act="rdel:' + esc(x.id) + '">Rimuovi</span></div>';
	});
	h += '<div class="pnote">Avviso ' + cfg.lead + ' minuti prima dell\'inizio. ' + esc(diskNote()) + '</div></div>';
	showPanel('rem', h);
}

/* ---------------- Promemoria ---------------- */
var rems = lsGet('nusport.rem', []);   // [{id, t, title, slug, snap, d: scritto su disco}]
var diskOk = null;                     // null = mai provato, true/false = esito ultima scrittura su disco
var firedInApp = {};
function remById(id) { if (!id) return null; for (var i = 0; i < rems.length; i++) if (rems[i].id === id) return rems[i]; return null; }
function canRemind(ev) { return !!(ev && ev.id && ev.date != null && ev.date > Date.now() && ev.st && ev.st.state === 'pre'); }
function remTitle(ev) {
	var l = LEGHE.filter(function (x) { return x.slug === ev.slug; })[0];
	return (l ? l.nome + ': ' : '') + (ev.kind === 'f1' ? ev.title + ' ' + String(ev.gp || '') : ev.h.name + ' - ' + ev.a.name);
}
function snapOf(ev) {
	var s = {}, k;
	for (k in ev) if (k !== 'home' && k !== 'away') s[k] = ev[k];
	if (s.h) { s.h = JSON.parse(JSON.stringify(s.h)); s.h.leaders = []; }
	if (s.a) { s.a = JSON.parse(JSON.stringify(s.a)); s.a.leaders = []; }
	s.dets = [];
	return s;
}
// promemoria: localStorage = lista dell'app; disco (demone condiviso) via Reminders.add/del, id prefissato 'ns'
function rid(id) { return 'ns' + id; }
function saveRems() { lsSet('nusport.rem', rems); }
function pruneRems() {
	var lim = Date.now() - 3 * 3600 * 1000, n = rems.length;
	rems = rems.filter(function (x) { return x.t > lim; });
	if (rems.length !== n) saveRems();
}
function rootFail() {
	diskOk = false;
	banner('Servizio root non disponibile: il promemoria scatterà solo con NuSport aperta.', null, 9000);
	refreshPanels();
}
function refreshPanels() {
	if (panel === 'rem') openRemPanel();
	if (panel === 'detail' && dEv) openDetail();
}
function pushRem(x) {
	Reminders.add(x.t / 1000, rid(x.id), APP_ID, x.title, x.slug).then(function () {
		x.d = true; diskOk = true; saveRems(); refreshPanels();
	}, rootFail);
}
function toggleRem(ev) {
	if (!ev || !ev.id) return;
	if (remById(ev.id)) { removeRem(ev.id); return; }
	if (!canRemind(ev)) return;
	var x = { id: ev.id, t: ev.date, title: remTitle(ev), slug: ev.slug, snap: snapOf(ev), d: false };
	rems.push(x);
	rems.sort(function (a, b) { return a.t - b.t; });
	saveRems(); pushRem(x);
}
function removeRem(id, local) {
	rems = rems.filter(function (x) { return x.id !== id; }); saveRems();
	if (!local) Reminders.del(rid(id)).then(null, function () { /* servizio assente: niente da cancellare */ });
}
// allineamento all'avvio: tolgo quelli annullati dalla notifica, rimando su disco quelli mai scritti
function syncRems() {
	Reminders.list().then(function (all) {
		diskOk = true;
		var on = {};
		all.forEach(function (r) { if (r.appId === APP_ID) on[r.id] = 1; });
		rems.slice().forEach(function (x) {
			if (on[rid(x.id)]) { if (!x.d) { x.d = true; saveRems(); } }
			else if (x.d) removeRem(x.id, true);
			else pushRem(x);
		});
		refreshPanels(); renderAfterRem();
	}, function () { diskOk = false; refreshPanels(); checkRems(); });
}
function renderAfterRem() { if (view !== 'classifica' && !loading) renderList(); updateFocusUI(); }
function diskNote() {
	if (diskOk === false) return 'Servizio root (Homebrew Channel) non raggiungibile: i promemoria scattano solo con NuSport aperta.';
	if (diskOk === true) return 'Avviso anche ad app chiusa (servizio root attivo).';
	return '';
}
// avviso in-app: solo se il demone root non può farlo
function checkRems() {
	if (diskOk !== false) return;
	var now = Date.now(), lead = cfg.lead * 60000;
	rems.forEach(function (x) {
		if (!firedInApp[x.id] && x.t - now <= lead && x.t - now > -60000) {
			firedInApp[x.id] = true;
			banner(x.title + ' inizia alle ' + hhmm(x.t) + ' · OK o click per aprire', x.id, 60000);
		}
	});
}
var bannerEv = null, bannerTm = null;
function banner(msg, evId, ms) {
	var b = $('banner');
	b.textContent = msg; b.className = evId ? 'ev' : '';
	bannerEv = evId;
	clearTimeout(bannerTm);
	bannerTm = setTimeout(hideBanner, ms || 6000);
}
function hideBanner() { $('banner').className = 'hidden'; bannerEv = null; }
// slug: da extra della notifica, se il promemoria non è più in localStorage
function openEvent(id, slug) {
	var r = remById(id);
	if (panel) closeDetail();
	var i = tabOf(r ? r.slug : slug);
	if (i < 0) { if (r && r.snap) { dEv = r.snap; openDetail(); } return; }   // lega nascosta: dettaglio dalla copia salvata
	fTab = i; zone = 'list'; fEv = topEv = topRow = 0;
	var off = r ? Math.round((dayOfMs(r.t) - dayStart(0).getTime()) / 86400000) : 0;
	var l = lega();
	if (l.kind === 'f1') view = off <= 3 ? 'partite' : 'calendario';
	else if (l.kind === 'tennis') { view = 'partite'; dayOff = Math.max(-1, Math.min(1, off)); }
	else if (off >= -1 && off <= 1) { view = 'partite'; dayOff = off; }
	else view = 'calendario';
	pendingOpen = id;
	load(false);
}
function onReminderOpen(r, extra) { openEvent(String(r).replace(/^ns/, ''), extra); }
function onReminderAction(act, r) { if (act === 'cancel') { removeRem(String(r).replace(/^ns/, ''), true); renderAfterRem(); } }
Reminders.onOpen = onReminderOpen;
Reminders.onAction = onReminderAction;

/* ---------------- Navigazione ---------------- */
function visN() { return view === 'calendario' ? CAL_VISIBLE : VISIBLE; }
function itemsCount() { var d = curData(); return d && view !== 'classifica' ? d.length : 0; }
function moveList(d) {
	if (view === 'classifica') {
		var n = stdRows().length;
		var nt = Math.max(0, Math.min(Math.max(0, n - STD_VISIBLE), topRow + d * 3));
		if (nt === topRow && d < 0) { zone = 'bar'; updateFocusUI(); return; }
		topRow = nt; renderStandings(); updateFocusUI(); return;
	}
	var c = itemsCount(), evs = curData();
	if (!c) { if (d < 0) { zone = 'bar'; updateFocusUI(); } return; }
	var nf = fEv + d;
	while (nf >= 0 && nf < c && evs[nf].hdr) nf += d;           // salto le intestazioni giorno/GP
	if (nf < 0) { if (d < 0) { topEv = 0; zone = 'bar'; renderList(); updateFocusUI(); } return; }
	if (nf >= c) return;
	fEv = nf;
	var vn = visN();
	if (fEv < topEv) topEv = fEv;
	if (topEv > 0 && evs[topEv - 1] && evs[topEv - 1].hdr && fEv - topEv + 1 < vn) topEv--;  // mostro l'intestazione sopra
	if (fEv >= topEv + vn) topEv = fEv - vn + 1;
	renderList(); updateFocusUI();
}
function selectTab(i) {
	fTab = (i + TABS.length) % TABS.length;
	fEv = topEv = topRow = 0;
	if ((view === 'classifica' && !lega().std) || (view === 'calendario' && lega().kind === 'tennis')) view = 'partite';
	load(false);
}
function topAction(i) { fTop = i; zone = 'top'; updateFocusUI(); if (i === 0) openRemPanel(); else openCfgPanel(); }

/* ---------------- Input Magic Remote (pointer, wheel, VK) ---------------- */
document.addEventListener('click', function (e) {
	var el = e.target;
	if (bannerEv && el && el.id === 'banner') { var bid = bannerEv; hideBanner(); openEvent(bid); e.preventDefault(); return; }
	while (el && el.nodeType === 1) {
		if (el.hasAttribute && el.hasAttribute('data-act') && panel) { panelAct(el); e.preventDefault(); return; }
		if (el.id === 'dclose' || (el.id === 'detail' && panel)) { closeDetail(); e.preventDefault(); return; }
		if (el.id === 'dbody') return;                      // click dentro pannello: niente
		if (el.id === 'retry') { load(true); e.preventDefault(); return; }
		var cl = el.classList;
		if (cl && cl.contains('tbtn')) { topAction(+el.getAttribute('data-top') || 0); e.preventDefault(); return; }
		if (cl && cl.contains('leag')) {
			if (panel) closeDetail();
			zone = 'tabs'; selectTab(+el.getAttribute('data-tab') || 0);
			e.preventDefault(); return;
		}
		if (cl && cl.contains('bbtn') && el.hasAttribute('data-id')) {
			zone = 'bar'; fBar = +el.getAttribute('data-bar') || 0;
			barAction(el.getAttribute('data-id'));
			updateFocusUI(); e.preventDefault(); return;
		}
		if (cl && cl.contains('card')) {
			zone = 'list'; fEv = +el.getAttribute('data-ev') || 0;
			updateFocusUI(); openFocused(); e.preventDefault(); return;
		}
		el = el.parentNode;
	}
});
document.addEventListener('wheel', function (e) {
	e.preventDefault();
	var d = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
	if (!d) return;
	if (panel === 'detail') { scrollDetail(d); return; }
	if (panel) { var pl = $('dbody').querySelector('.plist'); if (pl) pl.scrollTop += d * 90; return; }
	if (zone !== 'list') { zone = 'list'; updateFocusUI(); if (d < 0) return; }
	if (view !== 'classifica' && fEv === 0 && d < 0) return;  // wheel su in cima: resto in lista
	moveList(d);
}, { passive: false });

document.addEventListener('keydown', function (e) {
	var k = e.keyCode;
	if (panel) {
		var f = panelFocused();
		if (k === 461 || k === 8 || k === 27) closeDetail();
		else if (k === 13) { if (f) panelAct(f); else closeDetail(); }
		else if (k === 38 || k === 40) { if (panel === 'detail') scrollDetail(k === 38 ? -1 : 1); else panelMove(k === 38 ? -1 : 1, 0); }
		else if (k === 37 || k === 39) panelMove(0, k === 37 ? -1 : 1);
		else return;
		e.preventDefault(); return;
	}
	if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
	if (k === 13 && bannerEv && zone === 'list') { var id = bannerEv; hideBanner(); openEvent(id); e.preventDefault(); return; }
	var bi = barItems();
	switch (k) {
		case 37: case 39:
			var dd = k === 37 ? -1 : 1;
			if (zone === 'top') { fTop = dd < 0 ? 0 : 1; updateFocusUI(); }
			else if (zone === 'tabs') selectTab(fTab + dd);
			else if (zone === 'bar') { fBar = Math.max(0, Math.min(bi.length - 1, fBar + dd)); updateFocusUI(); }
			else setDay(dayOff + dd);                       // in lista: ←→ cambia giorno
			break;
		case 38:
			if (zone === 'list') moveList(-1);
			else if (zone === 'bar') { zone = 'tabs'; updateFocusUI(); }
			else if (zone === 'tabs') { zone = 'top'; updateFocusUI(); }
			break;
		case 40:
			if (zone === 'top') { zone = 'tabs'; updateFocusUI(); }
			else if (zone === 'tabs') { zone = 'bar'; updateFocusUI(); }
			else if (zone === 'bar') { zone = 'list'; updateFocusUI(); }
			else moveList(1);
			break;
		case 13:
			if (zone === 'top') topAction(fTop);
			else if (zone === 'tabs') { zone = 'bar'; updateFocusUI(); }
			else if (zone === 'bar') { if (bi[fBar]) barAction(bi[fBar].id); updateFocusUI(); }
			else if ($('retry')) load(true);
			else openFocused();
			break;
		case 461: case 8: case 27:
			if (zone !== 'tabs') { zone = 'tabs'; updateFocusUI(); break; }
			if (window.history.length > 1) window.history.back();
			else if (window.close) window.close();
			break;
		default: return;
	}
	e.preventDefault();
});

/* ---------------- Orologio + refresh ---------------- */
setInterval(updateHeader, 1000);
setInterval(function () {
	if (panel || loading) return;
	var d = curData();
	var live = d && view === 'partite' && d.some(function (x) { return x.st && x.st.state === 'in'; });
	// oggi/classifica/F1 weekend/live si aggiornano; ieri, domani e calendario solo se c'è qualcosa in corso
	if (view === 'calendario') return;
	if (dayOff === 0 || view === 'classifica' || lega().kind === 'f1' || live) load(true);
}, REFRESH_MS);
setInterval(checkRems, 30000);

$('topbtns').innerHTML = '<div class="tbtn" data-top="0">' + SVG_BELL + '<span id="remcount"></span></div><div class="tbtn" data-top="1">' + SVG_GEAR + '</div>';
pruneRems();
syncRems();                       // verifica servizio root e allinea disco/localStorage
if (!Reminders.handleLaunch(APP_ID, onReminderOpen, onReminderAction) && !pendingOpen) load(false);

})();
