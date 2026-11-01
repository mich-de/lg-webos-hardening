'use strict';
// Dentro il namespace di rete vuoto: 127.0.0.1:8899 -> socket unix del proxy. Nessun'altra via d'uscita.
const net = require('net');

const SOCK = process.argv[2];
net.createServer((c) => {
  const u = net.connect(SOCK);
  c.on('error', () => u.destroy());
  u.on('error', () => c.destroy());
  c.pipe(u); u.pipe(c);
}).listen(8899, '127.0.0.1', () => {
  process.setgid(99);
  process.setuid(99);
});
