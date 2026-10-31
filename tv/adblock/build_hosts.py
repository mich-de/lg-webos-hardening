"""Genera hosts.block (formato compatto, 9 domini per riga) dalla lista StevenBlack unified.
Uso: python build_hosts.py  -> scarica la lista e scrive hosts.block accanto allo script."""
import os, re, urllib.request

URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'
# Domini che le app del progetto o la TV usano: mai bloccarli
ALLOW = re.compile(r'(^|\.)(hbbtv\.[^ ]+|rai\.it|raiplay\.it|mediaset\.(it|net)|espn\.com|sky\.it|youtube\.com|'
                   r'googlevideo\.com|ytimg\.com|github\.com|githubusercontent\.com|webosbrew\.org)$')

text = urllib.request.urlopen(URL, timeout=60).read().decode('utf-8', 'replace')
doms = []
for line in text.splitlines():
    f = line.split('#')[0].split()
    if len(f) >= 2 and f[0] == '0.0.0.0' and f[1] != '0.0.0.0':
        d = f[1]
        if not d.startswith('hbbtv.') and not ALLOW.search(d):
            doms.append(d)
out = ['# hbv-adblock StevenBlack unified (ads+malware) - %d domini' % len(doms)]
out += ['0.0.0.0 ' + ' '.join(doms[i:i + 9]) for i in range(0, len(doms), 9)]
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hosts.block')
with open(p, 'w', newline='\n') as fh:
    fh.write('\n'.join(out) + '\n')
assert len(doms) > 1000, 'lista sospettosamente corta'
print(len(doms), 'domini ->', p)
