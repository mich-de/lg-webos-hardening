#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_icon.py — NusMusic
Genera icon.png (128x128, entry launcher) e largeIcon.png (230x230, griglia grande)
SENZA librerie esterne: PNG scritto a mano con solo struct + zlib (stdlib Python).

Disegno: tile scuro con gradiente notte + glow azzurro + nota musicale
(testa ellittica + gambo + bandierina ottava), palette identica al tema dell'app.

Uso:  python make_icon.py
"""

import struct
import zlib
import math
import os

W_LARGE = H_LARGE = 230      # largeIcon.png (convenzione webOS)
W_SMALL = H_SMALL = 128     # icon.png
RENDER = 512                # dimensione di rendering, poi downscale

SC = RENDER / 512.0         # scala geometria (disegnata su 512)


def png_chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, w, h, pixels):
    raw = b"".join(b"\x00" + pixels[y * w * 3:(y + 1) * w * 3] for y in range(h))
    png = (b"\x89PNG\r\n\x1a\n"
           + png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + png_chunk(b"IDAT", zlib.compress(raw, 9))
           + png_chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("scritto %s (%d byte, %dx%d)" % (path, os.path.getsize(path), w, h))


def blend(base, top, a):
    return base * (1 - a) + top * a


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))


def make_note_buffer():
    """Render 512x512 RGB: tile scuro + glow azzurro + nota musicale cromata."""
    W = RENDER
    px = bytearray(W * W * 3)

    # Nota: testa ellittica pendenata, gambo verticale destro, bandiera arco.
    stem_x = 315      # asse del gambo
    head_r = 62       # semiassi testa
    stem_top = 120
    stem_w = 22

    def in_head(x, y):
        # ellisse ruotata -20 gradi centrata in (226, 380)
        cx, cy = 226, 380
        dx, dy = x - cx, y - cy
        ang = math.radians(-20)
        ca, sa = math.cos(ang), math.sin(ang)
        u = dx * ca + dy * sa
        v = -dx * sa + dy * ca
        return (u / head_r) ** 2 + (v / (head_r * 0.72)) ** 2 <= 1.0

    def in_stem(x, y):
        return stem_x - stem_w <= x <= stem_x and stem_top <= y <= 396

    def in_flag(x, y):
        # bandiera: arco dal gambo verso sinistra-alto
        cx, cy = stem_x, stem_top
        d = math.hypot(x - cx, y - cy)
        if d > 110 or d < 48:
            return False
        # solo il settore in alto a sinistra dell'arco
        return x <= stem_x + 6 and y <= cy + 26

    for y in range(W):
        t = y / W
        for x in range(W):
            # gradiente di sfondo notte (top #0d1421 -> bottom #0a1020)
            r = blend(13, 10, t)
            g = blend(20, 16, t)
            b = blend(33, 32, t)
            # glow radiale azzurro alto-sinistra
            d = math.hypot(x - 160, y - 150) / (W * 0.70)
            glow = max(0.0, 1 - d) ** 2 * 0.40
            r = blend(r, 103, glow)
            g = blend(g, 209, glow)
            b = blend(b, 255, glow)
            # nota: gradiente azzurro -> bianco dall'alto al basso
            if in_head(x, y) or in_stem(x, y) or in_flag(x, y):
                tt = max(0.0, min(1.0, (y - 110) / 300.0))
                r = blend(103, 224, tt)
                g = blend(209, 240, tt)
                b = blend(255, 252, tt)
            i = (y * W + x) * 3
            px[i] = clamp(r)
            px[i + 1] = clamp(g)
            px[i + 2] = clamp(b)
    return bytes(px), W


def downscale(buf, w_src, w_dst):
    """Nearest-neighbor (aliasing accettabile su tile piatto)."""
    h_src = w_src
    h_dst = w_dst
    out = bytearray(w_dst * h_dst * 3)
    for y in range(h_dst):
        sy = min(h_src - 1, y * h_src // h_dst)
        for x in range(w_dst):
            sx = min(w_src - 1, x * w_src // w_dst)
            j = (sy * w_src + sx) * 3
            i = (y * w_dst + x) * 3
            out[i] = buf[j]
            out[i + 1] = buf[j + 1]
            out[i + 2] = buf[j + 2]
    return bytes(out)


def main():
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
    buf, w = make_note_buffer()
    write_png(os.path.join(here, "icon.png"), W_SMALL, H_SMALL,
              downscale(buf, w, W_SMALL))
    write_png(os.path.join(here, "largeIcon.png"), W_LARGE, H_LARGE,
              downscale(buf, w, W_LARGE))


if __name__ == "__main__":
    main()
