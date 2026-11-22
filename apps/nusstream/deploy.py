# Deploy Nusstream.ipk sulla TV via telnet root (porta 23), metodo dei cmds_deploy*.
# Uso: python deploy.py <file.ipk>
import sys, time
sys.path.insert(0, r"D:\tv")
from tvrun import run

HOST = "192.168.188.80"
PC_FALLBACK = "192.168.188.81"

def detect_pc_ip(host, port=23, timeout=2.0):
    """IP LAN del PC che la TV puo' raggiungere: sorgente del socket verso la TV."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect((host, port))
            return s.getsockname()[0]
        finally:
            s.close()
    except OSError as e:
        print(f"auto-detect IP fallito ({e}), uso {PC_FALLBACK}")
        return PC_FALLBACK

PC = detect_pc_ip(HOST)
print(f"PC IP: {PC}")
ipk = sys.argv[1]
url = f"http://{PC}:8081/nusstream/{ipk}"

def tv(cmd, wait=3.0):
    out = run(HOST, cmd, wait)
    print(out.strip())
    return out

# 1) scarica ipk dal PC
print(f"== wget {url} ==")
tv(f"rm -f /tmp/nusstream.ipk; wget -q -T 30 -O /tmp/nusstream.ipk {url}; ls -l /tmp/nusstream.ipk", wait=8)

# 2) installa (luna appInstallService, subscribe) — poi verifica md5 dei file installati
print("== install ==")
tv(
    "timeout -t 40 luna-send -f -n 12 luna://com.webos.appInstallService/dev/install "
    '\'{"id":"com.ares.defaultName","ipkUrl":"/tmp/nusstream.ipk","subscribe":true}\' '
    "| tail -c 300",
    wait=22,
)

print("== verifica file installati ==")
APP = "/media/developer/apps/usr/palm/applications/org.nusstream.app"
out = tv(f"md5sum {APP}/main.css {APP}/main.js")
import hashlib, pathlib, subprocess, tempfile
local_css = hashlib.md5(pathlib.Path(r"D:\tv\nusstream\app\main.css").read_bytes()).hexdigest()
# main.js è minificato dal packager: ricalcola con lo stesso terser del CLI
tmp = pathlib.Path(tempfile.gettempdir(), "nusstream_mk.js")
terser = r"D:\CentroAI\data\npm\global\node_modules\@webos-tools\cli\node_modules\terser\bin\terser"
subprocess.run(["node", terser, r"D:\tv\nusstream\app\main.js", "-c", "-m", "-o", str(tmp)], check=True)
local_js = hashlib.md5(tmp.read_bytes()).hexdigest()
if local_css not in out.lower():
    sys.exit(f"main.css non aggiornato (atteso {local_css})")
if local_js not in out.lower():
    sys.exit(f"main.js non aggiornato (atteso {local_js})")
print("md5 verificati: css+js aggiornati")

# 3) lancia
print("== launch ==")
tv('luna-send -n 1 luna://com.webos.applicationManager/launch \'{"id":"org.nusstream.app"}\'', wait=6)
print("DEPLOY_OK")
