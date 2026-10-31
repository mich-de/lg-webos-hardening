import urllib.request
def get(u, rng=None):
    h = {'User-Agent':'Mozilla/5.0'}
    if rng: h['Range'] = rng
    req = urllib.request.Request(u, headers=h)
    return urllib.request.urlopen(req, timeout=30).read()

print('== LordTruffle epg.xml')
print(get('https://raw.githubusercontent.com/LordTruffle/Epg-Italia/main/epg.xml'))
print('== LordTruffle epg.xml.gz')
print(get('https://raw.githubusercontent.com/LordTruffle/Epg-Italia/main/epg.xml.gz')[:200])
print('== LordTruffle generate_epg.py (head)')
print(get('https://raw.githubusercontent.com/LordTruffle/Epg-Italia/main/generate_epg.py')[:4000].decode('utf8','replace'))
print('== tvit README')
print(get('https://raw.githubusercontent.com/leicaflorian/tvit/main/README.md')[:8000].decode('utf8','replace'))
