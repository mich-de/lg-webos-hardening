import sys
import telnetlib
import time

HOST = sys.argv[1]
CMDFILE = sys.argv[2]
WAIT = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
WAIT2 = float(sys.argv[4]) if len(sys.argv) > 4 else 20.0

with open(CMDFILE, "r", encoding="utf8") as f:
    lines = [ln.rstrip("\n") for ln in f.readlines()]
cmd = "\n".join(lines)

tn = telnetlib.Telnet()
tn.open(HOST, 23, timeout=10)
time.sleep(2.0)

def readrest(deadline_gap=1.5):
    global tn
    deadline = time.time() + deadline_gap
    out = b""
    while time.time() < deadline:
        try:
            c = tn.read_very_eager()
        except EOFError:
            break
        if c:
            out += c
            deadline = time.time() + deadline_gap
    return out

for i, ln in enumerate(lines, 1):
    tn.write((ln + "\n").encode("utf8"))
    if i == len(lines):
        time.sleep(WAIT)
    else:
        time.sleep(1.0)
    out = readrest(3.0).decode("utf8", "replace")
    sys.stdout.reconfigure(encoding="utf8", errors="replace")
    print(out)
