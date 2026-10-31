import urllib.request, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8', errors='replace')
def probe(u, head_bytes=300):
    try:
        req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0','Origin':'file://','Origin':'http://localhost'})
        r = urllib.request.urlopen(req, timeout=40)
        d = r.read(head_bytes)
        print(u)
        print('   status', r.status, '| CORS:', r.headers.get('Access-Control-Allow-Origin'), '| type:', r.headers.get('Content-Type'), '| len?:', r.headers.get('Content-Length'))
        print('   head:', d[:250])
    except Exception as e:
        print(u, 'ERR', e)

probe('https://tvit.leicaflorianrobert.dev/epg/list.json')
probe('https://tvit.leicaflorianrobert.dev/epg/list.xml')
probe('https://tvit.leicaflorianrobert.dev/iptv/list.json')
probe('https://guidatv.lazzy.live/dati/giorni/2026-10-31.json')
