import {FLAME, type Art, type Motif} from '../lib/art';

// Three stacked SVG layers (hearth-it/ICONS.md): background motif + the glyph's cast shadow, the solid glyph, a
// highlight. Separate elements so the focus parallax only moves composited layers (CSS in global.css, .art*).

const L = 'rgba(255,255,255,.15)';
const D = 'rgba(0,0,0,.14)';
/** the glyph on the 24 grid, at 50% of the tile, centred */
const GLYPH = 'translate(25 25) scale(2.0833)';

const round = (n: number): string => n.toFixed(1);

function wedges (cx: number, cy: number, r: number): string {
	let d = '';
	for (let i = 0; i < 12; i++) {
		const a = (i * 30 - 7.5) * Math.PI / 180, b = (i * 30 + 7.5) * Math.PI / 180;
		d += 'M' + cx + ' ' + cy + 'L' + round(cx + r * Math.cos(a)) + ' ' + round(cy + r * Math.sin(a)) + 'L' + round(cx + r * Math.cos(b)) + ' ' + round(cy + r * Math.sin(b)) + 'Z';
	}
	return d;
}

function bands (): string {
	let d = '';
	for (let x = -100; x < 200; x += 28) d += 'M' + x + ' 0h14l-100 100h-14Z';
	return d;
}

const RAYS = wedges(50, 54, 95);
const STRIPES = bands();
const EPG: number[][] = [[28, 46, 34], [16, 54, 40], [42, 24, 44], [22, 38, 50]];

function rings (cx: number, cy: number, from: number, step: number, n: number, w: number, both: boolean) {
	const out = [];
	for (let i = 0; i < n; i++) out.push(<circle cx={cx} cy={cy} r={from + i * step} fill="none" stroke={both && i % 2 ? D : L} stroke-width={w} />);
	return out;
}

function motif (m: Motif, glyph: string) {
	switch (m) {
	case 'rays': return [<path d={RAYS} fill={L} />, <circle cx="50" cy="54" r="30" fill={D} />];
	case 'epg': {
		const out = [];
		let k = 0;
		for (let row = 0; row < 4; row++) {
			let x = -6;
			for (const w of EPG[row]) { out.push(<rect x={x} y={12 + row * 20} width={w} height="13" rx="6.5" fill={k++ % 2 ? D : L} />); x += w + 3; }
		}
		out.push(<rect x="58" y="0" width="3" height="100" fill={L} />);
		return out;
	}
	case 'pitch': return [
		<path d="M12.5 0h12.5v100h-12.5zM37.5 0h12.5v100h-12.5zM62.5 0h12.5v100h-12.5zM87.5 0h12.5v100h-12.5z" fill={D} />,
		<path d="M50 0v100M-3 28h20v44h-20M103 28h-20v44h20" fill="none" stroke={L} stroke-width="2.6" />,
		<circle cx="50" cy="50" r="17" fill="none" stroke={L} stroke-width="2.6" />
	];
	case 'hills': return [<circle cx="74" cy="26" r="14" fill={L} />, <circle cx="22" cy="112" r="48" fill={L} />, <circle cx="88" cy="122" r="50" fill={D} />];
	case 'grooves': return rings(84, 86, 14, 12, 8, 5, true);
	case 'waves': return rings(4, 100, 22, 18, 6, 7, false);
	case 'dots': {
		const out = [];
		for (let i = 0; i < 36; i++) out.push(<circle cx={10 + (i % 6) * 16} cy={10 + Math.floor(i / 6) * 16} r="3.4" fill={i % 3 ? L : D} />);
		return out;
	}
	case 'globe': return [
		<circle cx="70" cy="74" r="58" fill={D} />,
		<g fill="none" stroke={L} stroke-width="2.6"><ellipse cx="70" cy="74" rx="24" ry="58" /><ellipse cx="70" cy="74" rx="46" ry="58" /><path d="M12 74h116M20 46h100M20 102h100" /></g>
	];
	case 'blobs': return [<circle cx="16" cy="20" r="17" fill={L} />, <circle cx="86" cy="16" r="12" fill={D} />, <circle cx="84" cy="86" r="24" fill={L} />, <circle cx="12" cy="84" r="11" fill={D} />, <circle cx="48" cy="104" r="14" fill={D} />];
	case 'ghost': return [<path d={glyph} fill={L} transform="translate(44 38) rotate(-12) scale(3.4)" />];
	case 'flame': return [<path d={FLAME} fill={L} transform="translate(40 26) rotate(10) scale(3.5)" />];
	case 'sliders': return [
		<path d="M0 21h100v6h-100zM0 47h100v6h-100zM0 73h100v6h-100z" fill={D} />,
		<circle cx="22" cy="24" r="9" fill={L} />, <circle cx="80" cy="50" r="9" fill={L} />, <circle cx="44" cy="76" r="9" fill={L} />
	];
	case 'stripes': return [<path d={STRIPES} fill={L} />];
	}
	return [];
}

export function ArtIcon ({art, glyph}: {art: Art; glyph: string}) {
	return (
		<div class="art" aria-hidden="true">
			<svg class="art__layer art__bg" viewBox="0 0 100 100">
				{motif(art.motif, glyph)}
				<path d={glyph} fill="rgba(0,0,0,.24)" transform={'translate(1.4 2) ' + GLYPH} />
			</svg>
			<svg class="art__layer art__fg" viewBox="0 0 100 100"><path d={glyph} fill={art.ink || '#FFFFFF'} transform={GLYPH} /></svg>
			<ArtSheen />
		</div>
	);
}

/** The highlight layer; image tiles (third-party logos) get it too, shown only on focus. */
export function ArtSheen ({cls = 'art__layer art__hl'}: {cls?: string}) {
	return <svg class={cls} viewBox="0 0 100 100"><ellipse cx="22" cy="8" rx="60" ry="42" fill="rgba(255,255,255,.09)" /></svg>;
}
