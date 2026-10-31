#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_ipk.py — NusGuide
Pacchettizza l'app webOS TV in un .ipk valido identico al ciò che produce
ares-package (webOS SDK), usando SOLO la stdlib (tarfile, gzip, struct, hashlib).

Layout replicato dall'ipk di Hearth installato con successo:
  data.tar.gz: usr/ → usr/palm/ → usr/palm/applications/<id>/* (file)
               usr/palm/packages/<id>/packageinfo.json
  control:     Package/Version/… + webOS-Package-Format-Version: 2

Path installato: /media/developer/apps/usr/palm/applications/org.nusguide.app/
Output:          <script dir>/org.nusguide.app_0.1.0_all.ipk
Alla fine stampa lo sha256 dell'ipk.

Uso:  python build_ipk.py
"""

import io
import os
import tarfile
import hashlib
import sys

# ---------- Configurazione ----------

APP_ID = "org.nusguide.app"
VERSION = "0.1.0"
HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(HERE, "app")
OUT_IPK = os.path.join(HERE, f"{APP_ID}_{VERSION}_all.ipk")

DATA_PREFIX = f"usr/palm/applications/{APP_ID}"
PKG_PREFIX = f"usr/palm/packages/{APP_ID}"

def read_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()

def add_dir(tar, name):
    info = tarfile.TarInfo(name=name)
    info.type = tarfile.DIRTYPE
    info.mtime = 0
    info.uid = 0; info.gid = 0; info.uname = "root"; info.gname = "root"
    tar.addfile(info)

def add_file(tar, name, data):
    info = tarfile.TarInfo(name=name)
    info.size = len(data)
    info.mtime = 0
    info.uid = 0; info.gid = 0; info.uname = "root"; info.gname = "root"
    tar.addfile(info, io.BytesIO(data))

def make_data_tgz(app_files, packageinfo):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        add_dir(tar, "usr")
        add_dir(tar, "usr/palm")
        add_dir(tar, "usr/palm/applications")
        add_dir(tar, DATA_PREFIX)
        add_dir(tar, PKG_PREFIX)
        add_file(tar, f"{PKG_PREFIX}/packageinfo.json", packageinfo)
        for fn in app_files:
            add_file(tar, f"{DATA_PREFIX}/{fn}", read_bytes(os.path.join(APP_DIR, fn)))
    return buf.getvalue()

def make_control_tgz(control):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        add_file(tar, "./control", control)
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

    app_files = sorted(fn for fn in os.listdir(APP_DIR)
                       if os.path.isfile(os.path.join(APP_DIR, fn)))
    installed_size = sum(os.path.getsize(os.path.join(APP_DIR, fn))
                         for fn in app_files) + len(PKG_PREFIX) + 64

    packageinfo = (
        "{\n"
        f'  "id": "{APP_ID}",\n'
        f'  "version": "{VERSION}",\n'
        f'  "app": "{APP_ID}"\n'
        "}\n"
    ).encode("utf-8")

    control = (
        f"Package: {APP_ID}\n"
        f"Version: {VERSION}\n"
        f"Section: misc\n"
        f"Priority: optional\n"
        f"Architecture: all\n"
        f"Installed-Size: {installed_size}\n"
        f"Maintainer: NusGuide <nobody@example.com>\n"
        f"Description: NusGuide - guida TV moderna per webOS TV (EPG locale o fallback)\n"
        f"webOS-Package-Format-Version: 2\n"
        f"webOS-Packager-Version: x.y.x\n"
    ).encode("utf-8")

    ipk  = b"!<arch>\n"
    ipk += ar_member("debian-binary", b"2.0\n")
    ipk += ar_member("control.tar.gz", make_control_tgz(control))
    ipk += ar_member("data.tar.gz", make_data_tgz(app_files, packageinfo))

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
