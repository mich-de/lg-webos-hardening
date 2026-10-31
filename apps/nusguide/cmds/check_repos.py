import urllib.request, json
def get(u):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0','Accept':'application/vnd.github+json'})
    return urllib.request.urlopen(req, timeout=30).read().decode('utf8','replace')

for repo in ['leicaflorian/tvit','LordTruffle/Epg-Italia']:
    try:
        j = json.loads(get(f'https://api.github.com/repos/{repo}/contents/'))
        print('==== ROOT', repo)
        for it in j:
            print(it['name'], it['size'], it['type'])
    except Exception as e:
        print(repo, 'ERR', e)
    try:
        j = json.loads(get(f'https://api.github.com/repos/{repo}/releases?per_page=2'))
        for rel in j:
            print('== release', rel.get('tag_name'), rel.get('published_at'))
            for a in rel.get('assets', []):
                print('   asset:', a['name'], a['size'], a['browser_download_url'])
    except Exception as e:
        print(repo, 'rel ERR', e)
