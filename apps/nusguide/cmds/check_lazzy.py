import urllib.request, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8', errors='replace')
def get(u):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=30).read()

print('== lazzy oggi')
try:
    d = get('https://guidatv.lazzy.live/dati/giorni/2026-10-31.json')
    print(len(d))
    print(d[:1500].decode('utf8','replace'))
except Exception as e:
    print('ERR', e)

print('== lazzy CORS/etc headers')
try:
    req = urllib.request.Request('https://guidatv.lazzy.live/dati/giorni/2026-11-01.json', headers={'User-Agent':'Mozilla/5.0'})
    r = urllib.request.urlopen(req, timeout=30)
    for k in ['Content-Type','Access-Control-Allow-Origin','Content-Encoding']:
        print(k, r.headers.get(k))
    print('len', len(r.read()))
except Exception as e:
    print('ERR', e)

print('== tvit README saved')
try:
    open(r'D:\tv\nusguide\cmds\tvit_readme.txt','wb').write(get('https://raw.githubusercontent.com/leicaflorian/tvit/main/README.md'))
except Exception as e:
    print('ERR', e)
