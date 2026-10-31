# icon.png di Guida TV / NuSport / NuTV: composizione v2 di ICONS.md appiattita (griglia 100x100).
# Fondo pieno + motivo (luce/ombra su layer RGBA) + ombra glifo + glifo UIcons Solid Rounded + riflesso.
# Pillow, supersampling 4x. Uso: python -I make_icons.py
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TTF = os.path.join(HERE, 'uicons', 'uicons-solid-rounded.ttf')
with open(os.path.join(HERE, 'uicons', 'paths-solid.json'), encoding='utf8') as f:
	CP = {k: v['cp'] for k, v in json.load(f).items()}
SS = 4
LIGHT, SHADE = (255, 255, 255, round(255 * .13)), (0, 0, 0, round(255 * .14))
WHITE, DARK = (255, 255, 255, 255), (0x2B, 0x1D, 0x00, 255)
APPS = {  # dir: (fondo, glifo, motivo, colore glifo, [(path relativo ad app/, lato px)])
	'nutv': ('#FF5A14', 'tv-retro', 'rays', WHITE, [('icon.png', 512)]),
	'nusguide': ('#5B3DF5', 'calendar-clock', 'epg', WHITE, [('icon.png', 512)]),
	'nusport': ('#0FA554', 'football', 'field', WHITE, [('icon.png', 512)]),
	'nusgallery': ('#14A3FF', 'images', 'hills', WHITE, [('images/icon.png', 80), ('images/largeIcon.png', 130)]),
	'nusmusic': ('#F0146E', 'headphones', 'grooves', WHITE, [('icon.png', 128), ('largeIcon.png', 230)]),
	'nusart': ('#FFC400', 'brush', 'blobs', DARK, [('icon.png', 80), ('largeIcon.png', 130)]),
	'nuslive': ('#E5141B', 'live', 'waves', WHITE, [('icon.png', 256)]),
}


def motif(kind, u):
	"""Ritorna [ombra, luce] come layer RGBA separati; u = px per unità."""
	S = round(100 * u)
	lit, sh = Image.new('RGBA', (S, S)), Image.new('RGBA', (S, S))
	dl, ds = ImageDraw.Draw(lit), ImageDraw.Draw(sh)
	box = lambda x0, y0, x1, y1: [x0 * u, y0 * u, x1 * u, y1 * u]
	if kind == 'rays':
		cx, cy, r = 50, 54, 95
		for i in range(12):
			a = i * 30 - 7.5
			dl.pieslice(box(cx - r, cy - r, cx + r, cy + r), a, a + 15, fill=LIGHT)
		ds.ellipse(box(cx - 30, cy - 30, cx + 30, cy + 30), fill=SHADE)
	elif kind == 'epg':
		rows = [[28, 46, 34], [16, 54, 40], [42, 24, 44], [22, 38, 50]]
		for ri, (y, ws) in enumerate(zip((12, 32, 52, 72), rows)):
			x = -6
			for bi, w in enumerate(ws):
				d = dl if (ri + bi) % 2 == 0 else ds
				d.rounded_rectangle(box(x, y, x + w, y + 13), radius=6.5 * u, fill=LIGHT if d is dl else SHADE)
				x += w + 3
		dl.rectangle(box(58, 0, 61, 100), fill=LIGHT)
	elif kind == 'field':
		for i in range(1, 8, 2):
			ds.rectangle(box(i * 12.5, 0, (i + 1) * 12.5, 100), fill=SHADE)
		t = 2.6 * u
		dl.rectangle(box(50 - 1.3, 0, 50 + 1.3, 100), fill=LIGHT)
		dl.ellipse(box(33, 33, 67, 67), outline=LIGHT, width=round(t))
		dl.rectangle(box(-3, 28, 17, 72), outline=LIGHT, width=round(t))
		dl.rectangle(box(83, 28, 103, 72), outline=LIGHT, width=round(t))
	elif kind in ('hills', 'blobs'):
		discs = {'hills': [(74, 26, 14, dl), (22, 112, 48, dl), (88, 122, 50, ds)],
			'blobs': [(16, 20, 17, dl), (86, 16, 12, ds), (84, 86, 24, dl), (12, 84, 11, ds), (48, 104, 14, ds)]}[kind]
		for x, y, r, d in discs:
			d.ellipse(box(x - r, y - r, x + r, y + r), fill=LIGHT if d is dl else SHADE)
	elif kind in ('grooves', 'waves'):
		# cerchi solo contorno, tratto centrato sul raggio come stroke SVG
		(cx, cy), w, rings = ((84, 86), 5, [(14 + 12 * i, dl if i % 2 == 0 else ds) for i in range(8)]) if kind == 'grooves' \
			else ((4, 100), 7, [(22 + 18 * i, dl) for i in range(6)])
		for r, d in rings:
			R = r + w / 2
			d.ellipse(box(cx - R, cy - R, cx + R, cy + R), outline=LIGHT if d is dl else SHADE, width=round(w * u))
	return [sh, lit]


def glyph_layer(ch, font, S, u, dx, dy, fill):
	im = Image.new('RGBA', (S, S))
	d = ImageDraw.Draw(im)
	l, t, r, b = d.textbbox((0, 0), ch, font=font)
	# centra sul bbox reale del glifo, non sulle metriche del font
	d.text(((S - (r - l)) / 2 - l + dx * u, (S - (b - t)) / 2 - t + dy * u), ch, font=font, fill=fill)
	return im


def render(size, bg, glyph, kind, fg):
	S = size * SS
	u = S / 100
	im = Image.new('RGBA', (S, S), bg)
	for layer in motif(kind, u):
		im.alpha_composite(layer)
	ch = chr(CP[glyph])
	font = ImageFont.truetype(TTF, round(S * .5))
	im.alpha_composite(glyph_layer(ch, font, S, u, 1.4, 2, (0, 0, 0, round(255 * .24))))
	im.alpha_composite(glyph_layer(ch, font, S, u, 0, 0, fg))
	refl = Image.new('RGBA', (S, S))
	ImageDraw.Draw(refl).ellipse([(22 - 60) * u, (8 - 42) * u, (22 + 60) * u, (8 + 42) * u], fill=(255, 255, 255, round(255 * .09)))
	im.alpha_composite(refl)
	return im.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
	for app, (bg, glyph, kind, fg, outs) in APPS.items():
		for rel, size in outs:
			im = render(size, bg, glyph, kind, fg)
			assert im.size == (size, size) and im.mode == 'RGB'
			path = os.path.join(os.path.dirname(HERE), app, 'app', *rel.split('/'))
			im.save(path, optimize=True)
			print('OK', path, im.size)
