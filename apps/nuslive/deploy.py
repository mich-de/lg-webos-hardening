import sys
sys.path.insert(0, r"D:\tv")
from tvrun import run

HOST, PC = "192.168.188.80", "192.168.188.81"
ipk = sys.argv[1] if len(sys.argv) > 1 else "org.nuslive.app_0.2.1_all.ipk"
url = f"http://{PC}:8081/nuslive/{ipk}"

print(f"Downloading {url}...")
out = run(HOST, f"rm -f /tmp/nuslive.ipk; wget -q -T 30 -O /tmp/nuslive.ipk {url}; ls -l /tmp/nuslive.ipk", 8)
print(out.strip())

print("Installing on TV...")
cmd = (
    "timeout -t 40 luna-send -f -n 12 luna://com.webos.appInstallService/dev/install "
    '\'{"id":"com.ares.defaultName","ipkUrl":"/tmp/nuslive.ipk","subscribe":true}\' '
    "| tail -c 300"
)
out = run(HOST, cmd, 22)
print(out.strip())
print("Deployed nuslive!")
