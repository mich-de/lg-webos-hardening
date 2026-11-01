#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_ipk.py — NuHome
Pacchettizza l'app webOS TV in un .ipk valido (formato ar: debian-binary,
control.tar.gz, data.tar.gz) usando SOLO la stdlib (tarfile, gzip, struct, hashlib).

Path installato: /media/developer/apps/usr/palm/applications/org.nuhome.launcher/
Output:          <script dir>/org.nuhome.launcher_0.1.2_all.ipk
Alla fine stampa lo sha256 dell'ipk.

Uso:  python build_ipk.py
"""

import io
import os
import tarfile
import hashlib
import sys

# ---------- Configurazione ----------

APP_ID = "org.nuhome.launcher"
VERSION = "0.1.2"
HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(HERE, "app")
OUT_IPK = os.path.join(HERE, f"{APP_ID}_{VERSION}_all.ipk")

# Percorso dentro data.tar.gz -> risulterà /media/developer/apps/usr/palm/applications/<id>/
DATA_PREFIX = f"./usr/palm/applications/{APP_ID}"

def read_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()

def make_tar_gz(entries, prefix: str = "") -> bytes:
    """Crea un tar.gz in memoria. entries = [(arcname, data|path, is_file)]."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for arcname, src, is_file in entries:
            full = (prefix + arcname) if prefix else arcname
            if is_file:
                info = tarfile.TarInfo(name=full)
                data = read_bytes(src) if src else b""
                info.size = len(data)
                info.mtime = 0
                info.uid = 0; info.gid = 0; info.uname = "root"; info.gname = "root"
                tar.addfile(info, io.BytesIO(data))
            else:
                info = tarfile.TarInfo(name=full)
                info.type = tarfile.DIRTYPE
                info.mtime = 0
                info.uid = 0; info.gid = 0; info.uname = "root"; info.gname = "root"
                tar.addfile(info)
    return buf.getvalue()

def ar_member(name: str, data: bytes) -> bytes:
    """Un membro del formato ar (GNU). Header 60 byte + dati."""
    hdr  = name.encode().ljust(16)              # nome, 16 byte
    hdr += b"0".ljust(12)                       # mtime
    hdr += b"0".ljust(6)                        # uid
    hdr += b"0".ljust(6)                        # gid
    hdr += b"100644".ljust(8)                   # mode
    hdr += str(len(data)).encode().ljust(10)    # size
    hdr += b"`\n"                               # magic
    out = hdr + data
    if len(out) % 2:                            # padding a 2 byte con \n
        out += b"\n"
    return out

def main() -> int:
    if not os.path.isdir(APP_DIR):
        print(f"ERRORE: manca la cartella app: {APP_DIR}", file=sys.stderr)
        return 1

    # ---- file dell'app (tutti quelli presenti in app/) ----
    app_files = sorted(fn for fn in os.listdir(APP_DIR)
                       if os.path.isfile(os.path.join(APP_DIR, fn)))

    # ---- control.tar.gz (contiene ./control) ----
    installed_size = sum(os.path.getsize(os.path.join(APP_DIR, fn)) for fn in app_files)
    control = (
        f"Package: {APP_ID}\n"
        f"Version: {VERSION}\n"
        f"Section: web\n"
        f"Priority: optional\n"
        f"Architecture: all\n"
        f"Installed-Size: {installed_size}\n"
        f"Maintainer: NuHome\n"
        f"Description: NuHome - launcher home moderno per webOS TV (dark glassmorphism)\n"
    ).encode("utf-8")
    cbuf = io.BytesIO()
    with tarfile.open(fileobj=cbuf, mode="w:gz") as tar:
        info = tarfile.TarInfo(name="./control")
        info.size = len(control); info.mtime = 0
        info.uid = 0; info.gid = 0; info.uname = "root"; info.gname = "root"
        tar.addfile(info, io.BytesIO(control))
    control_tgz = cbuf.getvalue()

    # ---- data.tar.gz (./usr/palm/applications/<id>/*) ----
    entries = [(f"{DATA_PREFIX}/{fn}", os.path.join(APP_DIR, fn), True) for fn in app_files]
    data_tgz = make_tar_gz(entries, prefix="")

    # ---- ar archive: debian-binary, control.tar.gz, data.tar.gz ----
    ipk = b"!<arch>\n"
    ipk += ar_member("debian-binary", b"2.0\n")
    ipk += ar_member("control.tar.gz", control_tgz)
    ipk += ar_member("data.tar.gz", data_tgz)

    with open(OUT_IPK, "wb") as f:
        f.write(ipk)

    # ---- verifica rapida dei membri ----
    names = []
    with open(OUT_IPK, "rb") as f:
        magic = f.read(8)
        assert magic == b"!<arch>\n", "magic ar non valido"
        while True:
            hdr = f.read(60)
            if len(hdr) < 60:
                break
            names.append(hdr[:16].decode("ascii", "replace").strip())
            size = int(hdr[48:58].split()[0])
            f.seek(size + (size % 2), 1)   # salto i dati (con padding)
    print("membri ar:", names)
    sha = hashlib.sha256(ipk).hexdigest()
    print(f"ipk: {OUT_IPK} ({len(ipk)} byte)")
    print(f"sha256: {sha}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
