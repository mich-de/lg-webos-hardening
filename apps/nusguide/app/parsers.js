/* NusGuide parser EPG (ES5, Chromium 79). Usati da main.js e testati in node (D:\tv\epg_samples\test_parsers.js).
 * Output programma: {title, start (ms), end (ms), desc, img}
 * parseSky(text)          -> {<channelId>: [prog]}  risposta https://apid.sky.it/gtv/v1/events?... (multi-canale)
 * parseAurora(text)       -> [prog]                 https://public.aurora.enhanced.live/site/page/<page>/?include=default&filter[environment]=<env>&v=2 (7 giorni)
 * parseMediaset(html)     -> {<slug>: [prog]}       https://mediasetinfinity.mediaset.it/guidatv (HTML SSR, solo oggi)
 * Fonti/id: D:\tv\epg_sources_dtt.md */

var SKY_IMG_BASE = 'https://guidatv.sky.it';

function parseSky(text) {
	var j = JSON.parse(text), ev = j.events || [], out = {}, i, e, img, k, imgs, ch;
	for (i = 0; i < ev.length; i++) {
		e = ev[i];
		ch = e.channel && e.channel.id;
		if (ch == null) continue;
		img = null;
		imgs = (e.content && e.content.imagesMap) || [];
		// 16:9 ridimensionabile lato server con &w=&h= (vedi imgUrl in main.js)
		for (k = 0; k < imgs.length; k++) {
			if (imgs[k].key === 'scene' || (!img && imgs[k].key === 'background')) img = SKY_IMG_BASE + imgs[k].img.url;
		}
		(out[ch] = out[ch] || []).push({
			start: Date.parse(e.starttime), // ISO UTC "2026-10-31T01:30:00Z"
			end: Date.parse(e.endtime),
			title: unent((e.content && e.content.contentTitle) || e.eventTitle || ''),
			desc: unent(e.eventSynopsis || ''),
			img: img || '',
			sized: !!img
		});
	}
	for (ch in out) out[ch].sort(function (a, b) { return a.start - b.start; });
	return out;
}

// Aurora: "*_dt" sono ora LOCALE italiana etichettata "+00:00"; i programmi a cavallo di mezzanotte
// compaiono in due giorni, troncati a 00:00 (start_time/end_time = orari veri, duration = durata vera).
function auroraLocal(s) {
	var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
	return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

function parseAurora(text) {
	var j = JSON.parse(text), blocks = j.blocks || [], out = [], seen = {}, b, c, d, p, i, ci, di, pi, start, title, key;
	for (i = 0; i < blocks.length; i++) {
		b = blocks[i];
		if (b.type !== 'epgBlock') continue;
		for (ci = 0; ci < b.channels.length; ci++) {
			c = b.channels[ci];
			for (di = 0; di < c.days.length; di++) {
				d = c.days[di].programs || [];
				for (pi = 0; pi < d.length; pi++) {
					p = d[pi];
					if (p.start_dt.substr(11, 5) === p.start_time) start = auroraLocal(p.start_dt);
					else start = auroraLocal(p.end_dt) - p.duration * 60000; // testa troncata a 00:00
					title = p.show_name || p.title || '';
					if (p.show_name && p.title) title += ' - ' + p.title;
					key = start + '|' + title;
					if (seen[key]) continue;
					seen[key] = 1;
					out.push({
						start: start,
						end: start + p.duration * 60000,
						title: title,
						desc: p.description || p.show_description || '',
						img: p.show_image || ''
					});
				}
			}
		}
	}
	out.sort(function (a, b) { return a.start - b.start; });
	return out;
}

function unent(s) {
	return s.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
		.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
		.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Mediaset SSR: dopo ogni href="/diretta/<slug>" la riga del canale; 2 occorrenze di --epg-card-width per card
// (ora ">HH:MM<" + titolo "text-headline-8b-m"). Solo oggi, niente durata: fine = inizio del successivo.
function parseMediaset(html) {
	var rows = html.split('href="/diretta/'), out = {}, slugRe = /^[a-zA-Z0-9_]+/, now = new Date();
	for (var i = 1; i < rows.length; i++) {
		var m = slugRe.exec(rows[i]);
		if (!m || out[m[0]]) continue;
		var cards = rows[i].split('--epg-card-width'), progs = [], last = 0;
		for (var k = 1; k + 1 < cards.length; k += 2) {
			var slice = cards[k + 1] || '';
			var mt = />(\d{1,2}):(\d{2})</.exec(slice);
			var mtit = /text-headline-8b-m[^>]*>([^<]{2,80})</.exec(slice);
			if (!mt || !mtit) continue;
			var st = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +mt[1], +mt[2]).getTime();
			if (st < last - 12 * 3600000) st += 86400000;   // dopo mezzanotte
			last = st;
			progs.push({ title: unent(mtit[1]).trim(), start: st, end: st + 30 * 60000, desc: '' });
		}
		progs.sort(function (a, b) { return a.start - b.start; });
		for (var p = 0; p + 1 < progs.length; p++) progs[p].end = progs[p + 1].start;
		out[m[0]] = progs;
	}
	return out;
}

if (typeof module !== 'undefined') module.exports = { parseSky: parseSky, parseAurora: parseAurora, parseMediaset: parseMediaset };
