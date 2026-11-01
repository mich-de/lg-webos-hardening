'use strict';
// Unica uscita di rete del browser, fuori dal namespace vuoto. Uso: proxy.js <socket unix> <pid proprietario>.
const net = require('net');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const L = require('./lib');

const SOCK = process.argv[2];
const OWNER = Number(process.argv[3]);
const BLOCKLIST = L.parseHosts(fs.readFileSync(path.join(__dirname, 'hosts.block'), 'utf8'));

function deny(sock, code) {
  sock.end(`HTTP/1.1 ${code} Blocked\r\nContent-Length: 0\r\n\r\n`);
}

const server = net.createServer((sock) => {
  sock.on('error', () => {});
  sock.setTimeout(10000, () => sock.destroy());
  let head = Buffer.alloc(0);
  const onData = (d) => {
    head = Buffer.concat([head, d]);
    const end = head.indexOf('\r\n\r\n');
    if (end < 0) { if (head.length > 8192) sock.destroy(); return; }
    sock.removeListener('data', onData);
    sock.pause();
    const line = head.toString('latin1', 0, head.indexOf('\r\n'));
    const host = L.parseConnect(line);
    const rest = head.slice(end + 4);
    if (!host) { // niente http in chiaro: redirect a https, il resto rifiutato
      const to = L.httpsRedirect(line);
      if (!to) return deny(sock, 405);
      if (L.isListed(BLOCKLIST, new URL(to).hostname)) return deny(sock, 403);
      return sock.end(`HTTP/1.1 301 Moved Permanently\r\nLocation: ${to}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    }
    if (L.isListed(BLOCKLIST, host)) return deny(sock, 403);
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (sock.destroyed) return;
      if (err || !addrs.length) return sock.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
      // Controllo e connessione sullo stesso IP risolto: niente DNS rebinding.
      if (addrs.some((a) => L.isPrivateIp(a.address))) return deny(sock, 403);
      const addr = (addrs.find((a) => a.family === 4) || addrs[0]).address;
      const up = net.connect(443, addr, () => {
        sock.setTimeout(0);
        sock.write('HTTP/1.1 200 OK\r\n\r\n');
        if (rest.length) up.write(rest);
        sock.pipe(up); up.pipe(sock); sock.resume();
      });
      up.setTimeout(300000, () => up.destroy());
      up.on('error', () => sock.destroy());
      sock.on('close', () => up.destroy());
      up.on('close', () => sock.destroy());
    });
  };
  sock.on('data', onData);
});

try { fs.unlinkSync(SOCK); } catch (e) { /* non c'era */ }
server.listen(SOCK, () => {
  fs.chownSync(SOCK, 99, 99);
  process.setgid(99);
  process.setuid(99);
});
setInterval(() => { try { process.kill(OWNER, 0); } catch (e) { if (e.code === 'ESRCH') process.exit(0); } }, 5000);
