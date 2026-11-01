'use strict';
const assert = require('assert');
const L = require('./lib');

assert.equal(L.normalizeUrl('example.com'), 'https://example.com/');
assert.equal(L.normalizeUrl('http://example.com/a?b=1'), 'https://example.com/a?b=1');
assert.equal(L.normalizeUrl('HTTP://example.com'), 'https://example.com/');
assert.equal(L.normalizeUrl('example.com:8443/x'), 'https://example.com:8443/x');
assert.ok(/^https:\/\/duckduckgo\.com\/\?q=gatti%20neri$/.test(L.normalizeUrl('gatti neri')));
for (const bad of ['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'data:text/html,x',
  'about:blank', 'view-source:https://a.it', 'https://u:p@a.it/', '', null]) {
  assert.equal(L.normalizeUrl(bad), null, String(bad));
}

for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.188.80', '172.31.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
  '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', 'ff02::1', '::ffff:192.168.188.80',
  '::ffff:c0a8:bc50', '::ffff:127.0.0.1', '::127.0.0.1', '64:ff9b::c0a8:bc50', '2002:c0a8:bc50::1', '2001:0:1::1', 'boh']) {
  assert.equal(L.isPrivateIp(ip), true, ip);
}
for (const ip of ['1.1.1.1', '93.184.216.34', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:1.1.1.1', '2001:db8::1']) {
  assert.equal(L.isPrivateIp(ip), false, ip);
}

const s = L.parseHosts('# c\n0.0.0.0 ads.it Track.Com\n0.0.0.0 x.y\nfoo bar\n');
assert.equal(s.size, 3);
assert.ok(L.isListed(s, 'ads.it') && L.isListed(s, 'a.b.ads.it') && L.isListed(s, 'track.com'));
assert.ok(!L.isListed(s, 'bads.it') && !L.isListed(s, 'it'));

assert.equal(L.parseConnect('CONNECT Example.com:443 HTTP/1.1'), 'example.com');
assert.equal(L.parseConnect('CONNECT example.com.:443 HTTP/1.1'), 'example.com');
assert.equal(L.parseConnect('CONNECT [::1]:443 HTTP/1.1'), '::1');
assert.equal(L.parseConnect('CONNECT example.com:23 HTTP/1.1'), null);
assert.equal(L.parseConnect('GET http://a.it/ HTTP/1.1'), null);
assert.equal(L.parseConnect('CONNECT a b:443 HTTP/1.1'), null);
assert.equal(L.httpsRedirect('GET http://Example.com/a?b=1 HTTP/1.1'), 'https://example.com/a?b=1');
assert.equal(L.httpsRedirect('HEAD http://a.it:80 HTTP/1.1'), 'https://a.it/');
assert.equal(L.httpsRedirect('POST http://a.it/ HTTP/1.1'), null);
assert.equal(L.httpsRedirect('GET http://a.it:8080/ HTTP/1.1'), null);
assert.equal(L.httpsRedirect('GET http://a.it/x\r\nSet-Cookie: y HTTP/1.1'), null);
assert.equal(L.httpsRedirect('GET ftp://a.it/ HTTP/1.1'), null);
console.log('lib.test PASS', process.version);
