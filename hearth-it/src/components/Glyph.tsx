// Inline SVG line icons used by the Misc row and the settings badge.

export type GlyphName = 'house' | 'gear' | 'tv';

/** Small icons for the wallpaper picker. */
export function PickerIcon ({kind}: {kind: 'folder' | 'picture' | 'drive' | 'slideshow' | 'default' | 'info' | 'search' | 'pin'}) {
	return (
		<svg class="picker__icon" viewBox="0 0 24 24" aria-hidden="true">
			{kind === 'folder' && <path d="M3 7.5h6.2l2 2.3H21v9.7H3z" />}
			{kind === 'picture' && <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3L16 12l4 4.5" /></>}
			{kind === 'drive' && <><rect x="7.5" y="3.5" width="9" height="17" rx="2" /><path d="M10.5 7v3M13.5 7v3" /></>}
			{kind === 'slideshow' && <><rect x="6" y="7" width="14" height="11" rx="2" /><path d="M3.5 9.5v8.5a2 2 0 0 0 2 2H16" /></>}
			{kind === 'default' && <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 15l17-7" /></>}
			{kind === 'info' && <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.2" /></>}
			{kind === 'search' && <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>}
			{kind === 'pin' && <><path d="M12 21s6.5-6.1 6.5-11A6.5 6.5 0 0 0 5.5 10C5.5 14.9 12 21 12 21z" /><circle cx="12" cy="10" r="2.3" /></>}
		</svg>
	);
}

/** Hearth's own tiles: Flaticon UIcons Solid Rounded (home, settings-sliders, settings), filled. */
export function Glyph ({name}: {name: GlyphName}) {
	return (
		<svg class="tile__glyph uicon" viewBox="0 0 24 24" aria-hidden="true">
			<path d={name === 'house' ? HOUSE : name === 'tv' ? SLIDERS : GEAR} />
		</svg>
	);
}

const HOUSE = 'M12 14.96Q10.72 14.96 9.88 15.84Q9.04 16.72 9.04 18V24H15.04V18Q15.04 16.72 14.16 15.84Q13.28 14.96 12 14.96ZM17.04 18V24H21.04Q22.24 24 23.12 23.12Q24 22.24 24 20.96V11.84Q24 11.04 23.44 10.48L14.96 1.28Q13.84 0.08 12.16 0Q10.48 -0.08 9.28 1.04L0.56 10.48Q0 11.04 0 11.92V20.96Q0 22.24 0.88 23.12Q1.76 24 3.04 24H6.96V18Q7.04 16.64 7.68 15.52Q8.32 14.4 9.44 13.72Q10.56 13.04 11.88 13Q13.2 12.96 14.4 13.6Q15.6 14.24 16.28 15.44Q16.96 16.64 17.04 18ZM12 14.96Q10.72 14.96 9.88 15.84Q9.04 16.72 9.04 18V24H15.04V18Q15.04 16.72 14.16 15.84Q13.28 14.96 12 14.96Z';
const SLIDERS = 'M1.04 4.72H3.76Q4.16 6.24 5.48 7Q6.8 7.76 8.32 7.36Q9.28 7.12 9.96 6.4Q10.64 5.68 10.96 4.72H22.96Q23.44 4.72 23.72 4.44Q24 4.16 24 3.76Q24 3.36 23.72 3.04Q23.44 2.72 22.96 2.72H10.96Q10.56 1.28 9.2 0.52Q7.84 -0.24 6.32 0.16Q5.36 0.4 4.68 1.08Q4 1.76 3.76 2.72H1.04Q0.56 2.72 0.28 3.04Q0 3.36 0 3.76Q0 4.16 0.28 4.44Q0.56 4.72 1.04 4.72ZM22.96 11.04H20.24Q19.84 9.52 18.52 8.76Q17.2 8 15.68 8.4Q14.72 8.64 14.04 9.36Q13.36 10.08 13.04 11.04H1.04Q0.56 11.04 0.28 11.32Q0 11.6 0 12Q0 12.4 0.28 12.68Q0.56 12.96 1.04 12.96H13.04Q13.44 14.48 14.8 15.24Q16.16 16 17.68 15.6Q18.56 15.36 19.28 14.64Q20 13.92 20.24 12.96H22.96Q23.44 12.96 23.72 12.68Q24 12.4 24 12Q24 11.6 23.72 11.32Q23.44 11.04 22.96 11.04ZM22.96 19.28H10.96Q10.56 17.76 9.2 17Q7.84 16.24 6.32 16.64Q5.36 16.88 4.68 17.6Q4 18.32 3.76 19.28H1.04Q0.56 19.28 0.28 19.56Q0 19.84 0 20.24Q0 20.64 0.28 20.96Q0.56 21.28 1.04 21.28H3.76Q4.16 22.72 5.48 23.48Q6.8 24.24 8.32 23.84Q9.28 23.6 9.96 22.92Q10.64 22.24 10.96 21.28H22.96Q23.44 21.28 23.72 20.96Q24 20.64 24 20.24Q24 19.84 23.72 19.56Q23.44 19.28 22.96 19.28Z';
const GEAR = 'M1.6 18Q2.24 19.04 3.44 19.4Q4.64 19.76 5.68 19.12L6.16 18.88Q7.44 19.92 9.04 20.48V20.96Q8.96 22.24 9.84 23.12Q10.72 24 12 24Q13.28 24 14.16 23.12Q15.04 22.24 14.96 20.96V20.48Q16.56 19.92 17.84 18.88L18.32 19.12Q19.36 19.76 20.56 19.4Q21.76 19.04 22.4 18Q23.04 16.96 22.72 15.76Q22.4 14.56 21.28 13.92L20.88 13.68Q21.12 12 20.88 10.32L21.28 10.08Q22.4 9.44 22.72 8.24Q23.04 7.04 22.4 6Q21.76 4.96 20.56 4.6Q19.36 4.24 18.32 4.88L17.84 5.12Q16.56 4.08 14.96 3.52V2.96Q14.96 1.76 14.12 0.88Q13.28 0 12 0Q10.72 0 9.88 0.88Q9.04 1.76 9.04 3.04V3.52Q7.44 4.08 6.16 5.12L5.68 4.88Q4.64 4.24 3.44 4.6Q2.24 4.96 1.6 6Q0.96 7.04 1.28 8.24Q1.6 9.44 2.72 10.08L3.12 10.32Q2.88 12 3.12 13.68L2.72 13.92Q1.6 14.56 1.28 15.76Q0.96 16.96 1.6 18ZM12 8Q13.68 8 14.84 9.16Q16 10.32 16 12Q16 13.68 14.84 14.84Q13.68 16 12 16Q10.32 16 9.16 14.84Q8 13.68 8 12Q8 10.32 9.16 9.16Q10.32 8 12 8Z';

/** A source's icon (see lib/sourceicons.ts), drawn in the theme's text colour. */
export function SourceGlyph ({path, cls = 'tile__glyph'}: {path: string; cls?: string}) {
	return (
		<svg class={cls + ' uicon'} viewBox="0 0 24 24" aria-hidden="true">
			<path d={path} />
		</svg>
	);
}

export function CheckMark () {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</svg>
	);
}

/** The small weather picture beside the temperature (line art, drawn in the text colour). */
export function WeatherGlyph ({icon}: {icon: 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'}) {
	const cloud = 'M7 18.5h9.5a3.7 3.7 0 0 0 .4-7.4 5.3 5.3 0 0 0-10.2 1.3A3.1 3.1 0 0 0 7 18.5z';
	return (
		<svg class="clock__weather-icon" viewBox="0 0 24 24" aria-hidden="true">
			{icon === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>}
			{icon === 'moon' && <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />}
			{icon === 'partly' && <><path d="M8 4.5v1.6M3.3 9H4.9M4.7 5.7l1.1 1.1M11.3 5.7l-1.1 1.1" /><circle cx="8" cy="9" r="2.6" /><path d="M9 19h8.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.2 1.1A2.9 2.9 0 0 0 9 19z" /></>}
			{icon === 'cloud' && <path d={cloud} />}
			{icon === 'fog' && <><path d="M7 14.5h9.5a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.4 1.2A2.8 2.8 0 0 0 7 14.5z" /><path d="M5 18h14M8 21h8" /></>}
			{icon === 'rain' && <><path d="M7 14.5h9.5a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.4 1.2A2.8 2.8 0 0 0 7 14.5z" /><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" /></>}
			{icon === 'snow' && <><path d="M7 14.5h9.5a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.4 1.2A2.8 2.8 0 0 0 7 14.5z" /><path d="M8.5 18v.2M12.5 19.5v.2M16.5 18v.2" /></>}
			{icon === 'storm' && <><path d="M7 14.5h9.5a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.4 1.2A2.8 2.8 0 0 0 7 14.5z" /><path d="M12.5 14.5l-2 3.2h3l-2 3.3" /></>}
		</svg>
	);
}

/** The paths behind Glyph names, for the layered tile art (components/ArtIcon.tsx). */
export const GLYPH_PATHS: Record<GlyphName, string> = {house: HOUSE, tv: SLIDERS, gear: GEAR};