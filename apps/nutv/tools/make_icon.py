# Genera icon.png 80x80 per NuTV (webOS webapp) — solo stdlib.
# Sfondo #2196f3, lettera "N" bianca da bitmap 5x7 scalata. struct+zlib, niente PIL.
import zlib, struct

W = H = 80
BG = (0x6A, 0x3C, 0xE0)
FG = (0xFF, 0xFF, 0xFF)

# bitmap 5x7 lalettera "N"
N = [
	"10001",
	"11001",
	"11001",
	"10101",
	"10011",
	"10011",
	"10001",
]

SCALE = 10          # 7 righe -> 70 px, centrata in 80
OFF_X = 15
OFF_Y = 5

rows = b""
for y in range(H):
	row = b"\x00"           # filter type 0
	for x in range(W):
		sx = (x - OFF_X) // SCALE
		sy = (y - OFF_Y) // SCALE
		on = 0 <= sx < 5 and 0 <= sy < 7 and N[sy][sx] == "1"
		row += bytes(FG if on else BG)
	rows += row

def chunk(tag, data):
	crc = zlib.crc32(tag + data) & 0xFFFFFFFF
	return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))  # RGB 8-bit
png += chunk(b"IDAT", zlib.compress(rows, 9))
png += chunk(b"IEND", b"")

with open(__import__("os").path.join(__import__("os").path.dirname(__file__), "..", "app", "icon.png"), "wb") as f:
	f.write(png)
print("OK icon.png", len(png), "bytes")

