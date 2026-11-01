#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_icon.py — NuHome
Genera icon.png (512x512) e bg.png (1920x1080) SENZA librerie esterne:
PNG scritto a mano con solo struct + zlib (stdlib Python).

- icon.png: tile con gradiente scuro + glow azzurro + lettera "N"
- bg.png:   sfondo scuro con leggero gradiente (immagine di background opzionale)

Uso:  python make_icon.py
"""

import struct
import zlib
import math
import os

W_ICON = H_ICON = 512
W_BG = 1920
H_BG = 1080

def png_chunk(tag: bytes, data: bytes) -> bytes:
    """Chunk PNG: [len][type][data][crc]."""
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

def write_png(path: str, w: int, h: int, pixels: bytes) -> None:
    """pixels: byte row-major RGB (3 per pixel)."""
    # Ogni riga PNG è preceduta dal byte "filter type" (0 = None).
    raw = b"".join(b"\x00" + pixels[y * w * 3:(y + 1) * w * 3] for y in range(h))
    png = (b"\x89PNG\r\n\x1a\n"
           + png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + png_chunk(b"IDAT", zlib.compress(raw, 9))
           + png_chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"scritto {path} ({os.path.getsize(path)} byte, {w}x{h})")

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def blend(base, top, a):
    return base * (1 - a) + top * a

def make_icon() -> None:
    """512x512: gradiente scuro verticale + glow radiale azzurro + 'N'."""
    px = bytearray(W_ICON * H_ICON * 3)
    # Geometria della "N": due montanti verticali + diagonale spessa.
    x0, y0, x1, y1 = 150, 130, 362, 382   # area lettera
    bar = int(46)                          # spessore montanti
    # Diagonale: segmento da (x0, y1) a (x1, y0), spessore
    dxs, dys, dxe, dye = x0, y1, x1, y0
    seg_len = math.hypot(dxe - dxs, dye - dys)

    def in_bar(x, y):
        if x0 <= x <= x0 + bar and y0 <= y <= y1:
            return True
        if x1 - bar <= x <= x1 and y0 <= y <= y1:
            return True
        return False

    def in_diag(x, y):
        # distanza punto-segmento <= mezzo spessore (45 gradi ca.)
        t = ((x - dxs) * (dxe - dxs) + (y - dys) * (dye - dys)) / (seg_len * seg_len)
        t = max(0.0, min(1.0, t))
        cxp, cyp = dxs + t * (dxe - dxs), dys + t * (dye - dys)
        return math.hypot(x - cxp, y - cyp) <= 30

    for y in range(H_ICON):
        for x in range(W_ICON):
            # Gradiente scuro di sfondo (alto piu' viola-ncore, basso blu notte)
            t = y / H_ICON
            r = blend(16, 10, t) + 4 * math.sin(t * 3.0)
            g = blend(18, 11, t) + 4 * math.sin(t * 3.0 + 1)
            b = blend(28, 18, t) + 6 * math.sin(t * 2.0 + 2)
            # Glow radiale azzurro in alto a destra
            gx, gy = W_ICON * 0.78, H_ICON * 0.22
            d = math.hypot(x - gx, y - gy) / (W_ICON * 0.62)
            glow = max(0.0, 1 - d) ** 2 * 0.45
            r = blend(r, 33, glow); g = blend(g, 150, glow); b = blend(b, 243, glow)
            # Lettera "N" con leggero gradiente interno (azzurro -> viola)
            if in_bar(x, y) or in_diag(x, y):
                tt = (y - y0) / (y1 - y0)
                r, g, b = blend(66, 126, tt), blend(165, 87, tt), blend(243, 194, tt)
            px[(y * W_ICON + x) * 3]     = clamp(r)
            px[(y * W_ICON + x) * 3 + 1] = clamp(g)
            px[(y * W_ICON + x) * 3 + 2] = clamp(b)
    write_png(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "app", "icon.png"), W_ICON, H_ICON, bytes(px))

def make_bg() -> None:
    """1920x1080: sfondo scuro con leggero gradiente diagonale."""
    px = bytearray(W_BG * H_BG * 3)
    for y in range(H_BG):
        ty = y / H_BG
        for x in range(W_BG):
            tx = x / W_BG
            t = (tx + ty) / 2
            # gradiente quasi impercettibile blu-scuro
            r = 11 + 6 * t
            g = 14 + 8 * t
            b = 23 + 12 * t
            i = (y * W_BG + x) * 3
            px[i] = clamp(r); px[i + 1] = clamp(g); px[i + 2] = clamp(b)
    write_png(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "app", "bg.png"), W_BG, H_BG, bytes(px))

if __name__ == "__main__":
    make_icon()
    # bg.png: molto lento in puro python (2M pixel) -> generato solo se richiesto
    import sys
    if "--bg" in sys.argv:
        make_bg()
