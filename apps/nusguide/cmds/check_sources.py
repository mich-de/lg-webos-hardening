import urllib.request, json
def head(u):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0'})
    try:
        r = urllib.request.urlopen(req, timeout=30)
        d = r.read(1200)
        print(u, '->', r.status, r.headers.get('Content-Type'), 'CORS:', r.headers.get('Access-Control-Allow-Origin'), 'len-head:', len(d))
        print(d[:200])
    except Exception as e:
        print(u, 'ERR', e)

head('https://epg.pw/0.xml')
head('https://raw.githubusercontent.com/iptv-org/epg/master/sites/sky.it/sky.it.channels.xml')
# github api search for italian epg repos
req = urllib.request.Request('https://api.github.com/search/repositories?q=xmltv+epg+italia&per_page=10', headers={'User-Agent':'Mozilla/5.0'})
try:
    r = urllib.request.urlopen(req, timeout=30)
    j = json.loads(r.read().decode('utf8'))
    for it in j.get('items', []):
        print('REPO:', it['full_name'], '|', it['description'], '|', it['pushed_at'])
except Exception as e:
    print('API ERR', e)
