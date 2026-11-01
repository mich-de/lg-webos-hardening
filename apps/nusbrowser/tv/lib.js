'use strict';
// Funzioni pure del confine di fiducia (testate in lib.test.js). Node 8: niente BlockList.
const net = require('net');
const { URL } = require('url');

// Solo https. http diventa https; testo libero diventa ricerca. null = rifiutato.
function normalizeUrl(input) {
  let s = String(input === null || input === undefined ? '' : input).trim();
  if (!s || s.length > 4096) return null;
  if (/^http:\/\//i.test(s)) s = 'https://' + s.slice(7);
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^\s/:]+:\d+(\/|$)/.test(s);
  if (!hasScheme) {
    if (/\s/.test(s) || !/[.]/.test(s)) return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
    s = 'https://' + s;
  }
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  return u.href;
}

const V4_PRIVATE = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]
  .map(([a, p]) => [v4num(a), p]);

function v4num(s) {
  return s.split('.').reduce((n, x) => n * 256 + Number(x), 0);
}

function v4Private(n) {
  return V4_PRIVATE.some(([base, p]) => {
    const size = Math.pow(2, 32 - p);
    return Math.floor(n / size) === Math.floor(base / size);
  });
}

// IPv6 in 8 gruppi da 16 bit.
function v6groups(ip) {
  let s = ip.split('%')[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const n = v4num(dotted[1]);
    s = s.slice(0, dotted.index) + Math.floor(n / 65536).toString(16) + ':' + (n % 65536).toString(16);
  }
  const [head, tail] = s.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const fill = s.includes('::') ? new Array(8 - a.length - b.length).fill('0') : [];
  return a.concat(fill, b).map((x) => parseInt(x, 16));
}

// Indirizzi non pubblici: LAN, loopback, link-local, tunnel che incapsulano IPv4.
function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) return v4Private(v4num(ip));
  if (v !== 6) return true;
  const g = v6groups(ip);
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0) return true; // ::, ::1 e IPv4 compatibile
    return v4Private(g[6] * 65536 + g[7]); // IPv4 mappato
  }
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) return true;
  if (g[0] === 0x2002 || (g[0] === 0x2001 && g[1] === 0)) return true; // 6to4, Teredo
  return g[0] === 0x64 && g[1] === 0xff9b; // NAT64
}

// Formato di adblock/hosts.block: "0.0.0.0 dominio dominio ...".
function parseHosts(text) {
  const set = new Set();
  for (const line of text.split('\n')) {
    if (!line.startsWith('0.0.0.0 ')) continue;
    for (const h of line.slice(8).trim().split(/\s+/)) if (h) set.add(h.toLowerCase());
  }
  return set;
}

// Blocca anche i sottodomini del dominio in lista.
function isListed(set, host) {
  let h = host;
  for (;;) {
    if (set.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
}

// Riga iniziale di CONNECT. null se non è CONNECT host:443.
function parseConnect(line) {
  const m = /^CONNECT (\[[0-9a-fA-F:.]+\]|[^\s:\[\]]+):(\d+) HTTP\/1\.[01]$/.exec(line);
  if (!m || m[2] !== '443') return null;
  return m[1].replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

// Richiesta http in chiaro verso il proxy: dove ridirigere in https. null se non è GET o HEAD valida.
function httpsRedirect(line) {
  const m = /^(?:GET|HEAD) http:\/\/([A-Za-z0-9.-]+)(?::80)?(\/[\x21-\x7e]*)? HTTP\/1\.[01]$/.exec(line);
  return m ? 'https://' + m[1].toLowerCase() + (m[2] || '/') : null;
}

module.exports = { normalizeUrl, isPrivateIp, parseHosts, isListed, parseConnect, httpsRedirect };
