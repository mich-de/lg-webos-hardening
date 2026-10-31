#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_icon.py — NusGuide
Genera icon.png (512x512) SENZA librerie esterne: PNG scritto a mano con solo
struct + zlib (stdlib Python).

- icon.png: tile con gradiente scuro + glow azzurro + lettera "G"
  (anello + barra orizzontale + asta discendente, con anti-alias 2x2)

Uso:  python make_icon.py
"""

import struct
import zlib
import math
import os

W_ICON = H_ICON = 512
CX, CY, RING_MID, RING_HALF = 256, 256, 127.0, 23.0   # anello "G"
BAR_H = 46.0                                           # spessore barra/asta

def png_chunk(tag: bytes, data: bytes) -> bytes:
    """Chunk PNG: [len][type][data][crc]."""
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

def write_png(path: str, w: int, h: int, pixels: bytes) -> None:
    """pixels: byte row-major RGB (3 per pixel)."""
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

# --- shape "G": anello + barra orizzontale + asta discendente ---------------
def in_shape(x, y):
    d = math.hypot(x - CX, y - CY)
    if abs(d - RING_MID) <= RING_HALF:
        return True                       # anello pieno (G aperta in su: ok, stilizzata)
    # barra: da (CX, CY-HALF) fino al bordo destro esterno
    if CX <= x <= CX + RING_MID + RING_HALF and abs(y - CY) <= BAR_H / 2:
        return True
    # asta: dal fondo barra scende fino al bordo esterno (quadrante basso-destra)
    xx = CX + RING_MID + RING_HALF - BAR_H
    if xx <= x <= xx + BAR_H and CY <= y <= CY + RING_MID + RING_HALF:
        return True
    return False

def make_icon() -> None:
    """512x512: gradiente scuro + glow radiale + 'G' con anti-aliasing 2x2."""
    px = bytearray(W_ICON * H_ICON * 3)
    offs = ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))
    for y in range(H_ICON):
        for x in range(W_ICON):
            # gradiente scuro di sfondo (blu notte)
            t = y / H_ICON
            r = blend(15, 10, t) + 4 * math.sin(t * 3.0)
            g = blend(19, 12, t) + 4 * math.sin(t * 3.0 + 1)
            b = blend(28, 19, t) + 6 * math.sin(t * 2.0 + 2)
            # glow radiale azzurro in alto a destra
            gx, gy = W_ICON * 0.76, H_ICON * 0.22
            d = math.hypot(x - gx, y - gy) / (W_ICON * 0.62)
            glow = max(0.0, 1 - d) ** 2 * 0.45
            r = blend(r, 33, glow); g = blend(g, 150, glow); b = blend(b, 243, glow)
            # lettera "G": campiono 2x2 sub-pixel → alpha, gradiente ciano→azzurro
            hits = sum(1 for ox, oy in offs if in_shape(x + ox, y + oy))
            if hits:
                a = hits / 4.0
                tt = (y - (CY - 150)) / 300.0
                lr = blend(103, 67, tt); lg = blend(209, 165, tt); lb = blend(255, 243, tt)
                r = blend(r, lr, a); g = blend(g, lg, a); b = blend(b, lb, a)
            px[(y * W_ICON + x) * 3]     = clamp(r)
            px[(y * W_ICON + x) * 3 + 1] = clamp(g)
            px[(y * W_ICON + x) * 3 + 2] = clamp(b)
    write_png(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "app", "icon.png"), W_ICON, H_ICON, bytes(px))

if __name__ == "__main__":
    make_icon()
