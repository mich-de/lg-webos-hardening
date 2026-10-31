import urllib.request, re
req = urllib.request.Request('https://www.open-epg.com/app/epgguide.php', headers={'User-Agent':'Mozilla/5.0'})
h = urllib.request.urlopen(req, timeout=30).read().decode('utf8','replace')
print('---- files links')
for m in sorted(set(re.findall(r'href="([^"]*files[^"]*)"', h))):
    print(m)
print('---- any italy mention')
for m in re.findall(r'[a-zA-Z0-9_/.-]*ital[a-zA-Z0-9_/.-]*\.xml[a-zA-Z0-9_/.-]*', h, re.I):
    print(m)
print('---- cors test germany')
req2 = urllib.request.Request('https://www.open-epg.com/files/germany.xml', headers={'User-Agent':'Mozilla/5.0'})
r = urllib.request.urlopen(req2, timeout=30)
print(r.status, r.headers.get('Content-Type'), r.headers.get('Access-Control-Allow-Origin'), len(r.read()))
