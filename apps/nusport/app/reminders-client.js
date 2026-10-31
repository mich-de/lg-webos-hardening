/* reminders-client.js — client ES5 del demone promemoria condiviso (/media/developer/reminders/remind.sh).
 * Usato da NuSport e Guida TV: copiare nella cartella dell'app e includere prima di main.js.
 * Nessuna dipendenza. Scrive SOLO tramite i comandi add/del/snooze/lead dello script (exec Homebrew Channel, root).
 *   Reminders.add(epochSec, id, appId, titolo, extra) -> Promise
 *   Reminders.del(id) / Reminders.snooze(id, min) / Reminders.setLead(min) -> Promise
 *   Reminders.list() -> Promise<[{t, id, appId, title, extra}]>   (rifiuta se il servizio root non risponde)
 *   Reminders.launch() -> {reminder, extra, reminderAction} dai parametri di lancio webOS
 *   Reminders.handleLaunch(appId, onOpen, onAction) -> true se il lancio era un'azione (snooze/cancel) e l'app si chiude
 */
var Reminders = (function () {
	'use strict';
	var EXEC = 'luna://org.webosbrew.hbchannel.service/exec';
	var SCRIPT = '/media/developer/reminders/remind.sh';

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
	function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }   // quoting POSIX
	function clean(s, re) { return String(s == null ? '' : s).replace(re, ''); }
	// stessi insiemi di caratteri dello script (che sanifica di nuovo: difesa doppia)
	function title(s) {
		s = String(s || '');
		if (s.normalize) s = s.normalize('NFD');                    // à -> a + accento, poi l'accento cade
		return clean(s, /[^A-Za-z0-9 .,:()+\/&!?-]/g).replace(/\s+/g, ' ').trim().slice(0, 80);
	}
	function sh(args, timeoutMs) {
		return luna(EXEC, { command: 'sh ' + SCRIPT + ' ' + args.map(q).join(' ') }, timeoutMs).then(function (r) {
			return String(r.stdoutString || '');
		});
	}
	function add(epochSec, id, appId, txt, extra) {
		return sh(['add', Math.floor(epochSec), clean(id, /[^A-Za-z0-9_-]/g), clean(appId, /[^A-Za-z0-9._-]/g),
			title(txt), clean(extra, /[^A-Za-z0-9._:-]/g)]);
	}
	function del(id) { return sh(['del', clean(id, /[^A-Za-z0-9_-]/g)]); }
	function snooze(id, min) { return sh(['snooze', clean(id, /[^A-Za-z0-9_-]/g), Math.max(1, +min || 5)]); }
	function setLead(min) { return sh(['lead', Math.max(1, +min || 10)]); }
	function list() {
		return sh(['list']).then(function (out) {
			return out.split('\n').filter(function (l) { return l.indexOf('|') > 0; }).map(function (l) {
				var f = l.split('|');
				return { t: +f[0], id: f[1], appId: f[2], title: f[3] || '', extra: f[4] || '' };
			});
		});
	}
	function launch() {
		try {
			var p = window.PalmSystem && window.PalmSystem.launchParams;
			p = typeof p === 'string' ? (p ? JSON.parse(p) : {}) : (p || {});
			return { reminder: p.reminder ? String(p.reminder) : '', extra: p.extra ? String(p.extra) : '', reminderAction: p.reminderAction || '' };
		} catch (e) { return { reminder: '', extra: '', reminderAction: '' }; }
	}
	function closeApp() { try { window.close(); } catch (e) { /* ignora */ } }
	// azione dai pulsanti della notifica in modalità onclick_launch: eseguo e chiudo
	function handleLaunch(appId, onOpen, onAction) {
		var p = launch();
		if (p.reminderAction && p.reminder) {
			var job = p.reminderAction === 'snooze' ? snooze(p.reminder, 5) : del(p.reminder);
			if (onAction) onAction(p.reminderAction, p.reminder);
			job.then(closeApp, closeApp);
			return true;
		}
		if (p.reminder && onOpen) onOpen(p.reminder, p.extra);
		return false;
	}
	document.addEventListener('webOSRelaunch', function () {
		var p = launch();
		if (p.reminderAction && p.reminder) {
			var job = p.reminderAction === 'snooze' ? snooze(p.reminder, 5) : del(p.reminder);
			if (Reminders.onAction) Reminders.onAction(p.reminderAction, p.reminder);
			// app già aperta: non la chiudo, eseguo e basta
			job.then(null, function () {});
		} else if (p.reminder && Reminders.onOpen) Reminders.onOpen(p.reminder, p.extra);
	});

	return { add: add, del: del, snooze: snooze, setLead: setLead, list: list, launch: launch, handleLaunch: handleLaunch,
		title: title, luna: luna, onOpen: null, onAction: null };
})();
