# Helper telnet minimo per la TV webOS (root, porta 23).
# Uso: from tvrun import run; out = run(host, cmd, wait=3.0)
import socket
import time

IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240


def _strip_telnet(data: bytes) -> bytes:
    """Rimuove le sequenze di negoziazione telnet (IAC ...)."""
    out = bytearray()
    i, n = 0, len(data)
    while i < n:
        b = data[i]
        if b == IAC:
            if i + 1 >= n:
                break
            cmd = data[i + 1]
            if cmd in (DONT, DO, WONT, WILL):
                i += 3  # IAC + opzione + byte opzione
                continue
            if cmd == SB:  # subnegoziazione: salta fino a IAC SE
                j = i + 2
                while j + 1 < n and not (data[j] == IAC and data[j + 1] == SE):
                    j += 1
                i = j + 2
                continue
            i += 2  # IAC + comando a 1 byte
            continue
        out.append(b)
        i += 1
    return bytes(out)


def run(host: str, cmd: str, wait: float = 3.0) -> str:
    """Apre telnet su (host, 23), manda cmd, raccoglie l'output per `wait` secondi."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2.0)
    s.connect((host, 23))
    chunks = []
    try:
        # banner di benvenuto
        try:
            chunks.append(s.recv(4096))
        except socket.timeout:
            pass
        s.sendall((cmd + "\n").encode())
        deadline = time.time() + wait
        s.settimeout(max(0.2, min(1.0, wait)))
        while time.time() < deadline:
            try:
                data = s.recv(4096)
            except socket.timeout:
                continue
            if not data:
                break
            chunks.append(data)
    finally:
        s.close()
    return _strip_telnet(b"".join(chunks)).decode(errors="replace")
