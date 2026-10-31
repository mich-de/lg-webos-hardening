/* EPG parser nuovi (ES5, Chromium 79). Output: [{start: Date, end: Date, title, desc, image}]
 * parseSky(text)    -> risposta https://apid.sky.it/gtv/v1/events?... (JSON)
 * parseAurora(text) -> risposta https://public.aurora.enhanced.live/site/page/<page>/?include=default&filter[environment]=<env>&v=2 (JSON, 7 giorni)
 * Vedi D:\tv\epg_sources_dtt.md per URL/id. */

var SKY_IMG_BASE = 'https://guidatv.sky.it';

function parseSky(text) {
  var j = JSON.parse(text), ev = j.events || [], out = [], i, e, img, k, imgs;
  for (i = 0; i < ev.length; i++) {
    e = ev[i];
    img = null;
    imgs = (e.content && e.content.imagesMap) || [];
    for (k = 0; k < imgs.length; k++) {
      if (imgs[k].key === 'cover' || (!img && imgs[k].key === 'scene')) img = SKY_IMG_BASE + imgs[k].img.url;
    }
    out.push({
      start: new Date(e.starttime), // ISO UTC "2026-10-31T01:30:00Z"
      end: new Date(e.endtime),
      title: (e.content && e.content.contentTitle) || e.eventTitle || '',
      desc: e.eventSynopsis || '',
      image: img
    });
  }
  out.sort(function (a, b) { return a.start - b.start; });
  return out;
}

// Aurora: "*_dt" sono ora LOCALE italiana etichettata "+00:00"; i programmi a cavallo di mezzanotte
// compaiono in due giorni, troncati a 00:00 (start_time/end_time = orari veri, duration = durata vera).
function auroraLocal(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
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
          else start = new Date(auroraLocal(p.end_dt).getTime() - p.duration * 60000); // testa troncata a 00:00
          title = p.show_name || p.title || '';
          if (p.show_name && p.title) title += ' - ' + p.title;
          key = start.getTime() + '|' + title;
          if (seen[key]) continue;
          seen[key] = 1;
          out.push({
            start: start,
            end: new Date(start.getTime() + p.duration * 60000),
            title: title,
            desc: p.description || p.show_description || '',
            image: p.show_image || null
          });
        }
      }
    }
  }
  out.sort(function (a, b) { return a.start - b.start; });
  return out;
}

if (typeof module !== 'undefined') module.exports = { parseSky: parseSky, parseAurora: parseAurora };
