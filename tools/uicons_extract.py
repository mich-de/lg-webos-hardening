# Estrae glifi da Flaticon UIcons Regular Rounded (npm @flaticon/flaticon-uicons 3.3.1) -> path SVG su griglia 24
# e un TTF locale per make_icons.py. Uso: python uicons_extract.py <package_dir> <nomi,...> [regular|solid]
import re, sys, json, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
pkg = sys.argv[1]
NAMES = sys.argv[2].split(',')
STYLE = sys.argv[3] if len(sys.argv) > 3 else 'regular'
PRE = {'regular': 'rr', 'solid': 'sr'}[STYLE]
OUT = 'paths.json' if STYLE == 'regular' else 'paths-' + STYLE + '.json'
css = open(os.path.join(pkg, 'css/' + STYLE + '/rounded.css'), encoding='utf8').read()
woff2 = [f for f in os.listdir(os.path.join(pkg, 'css')) if f.startswith('uicons-' + STYLE + '-rounded') and f.endswith('.woff2')][0]
f = TTFont(os.path.join(pkg, 'css', woff2))
f.flavor = None
here = os.path.dirname(os.path.abspath(__file__))
f.save(os.path.join(here, 'uicons', 'uicons-' + STYLE + '-rounded.ttf'))
cmap, gs, upm = f.getBestCmap(), f.getGlyphSet(), f['head'].unitsPerEm
out = {}
for n in NAMES:
	cp = int(re.search(r'\.fi-' + PRE + '-' + re.escape(n) + r':before\{content:"\\([0-9a-f]+)"', css).group(1), 16)
	g = gs[cmap[cp]]
	bp = BoundsPen(gs); g.draw(bp); x0, y0, x1, y1 = bp.bounds
	s = 24 / upm   # same scale for every glyph: keeps the pack's optical sizes
	cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
	sp = SVGPathPen(gs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
	g.draw(TransformPen(sp, (s, 0, 0, -s, 12 - cx * s, 12 + cy * s)))
	out[n] = {'cp': cp, 'path': sp.getCommands()}
assert len(out) == len(NAMES)
json.dump(out, open(os.path.join(here, 'uicons', OUT), 'w'), indent=1)
print('OK', len(out), 'glyphs, upm', upm)
