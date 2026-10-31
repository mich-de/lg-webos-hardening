// Hearth IT layered icons (hearth-it/ICONS.md): every drawn tile has its own saturated colour and a background motif
// taken from its subject; ArtIcon stacks motif, solid glyph and highlight as three layers that move apart on focus.

export type Motif = 'rays' | 'epg' | 'pitch' | 'hills' | 'grooves' | 'dots' | 'globe' | 'blobs' | 'ghost' | 'flame' | 'sliders' | 'stripes' | 'waves';

export interface Art {
	bg: string;
	motif: Motif;
	/** glyph colour when white would be weak (yellow plates) */
	ink?: string;
}

const Y = '#FFB800', DARK = '#2B1D00', TEAL = '#0BB5A5';

/** Keyed by source/app glyph id; Hearth's own fixed tiles use 'g-' + their Glyph name. */
export const ART: Record<string, Art> = {
	nutv: {bg: '#FF5A14', motif: 'rays'}, nusguide: {bg: '#5B3DF5', motif: 'epg'}, nusport: {bg: '#0FA554', motif: 'pitch'},
	nusgallery: {bg: '#14A3FF', motif: 'hills'}, nusmusic: {bg: '#F0146E', motif: 'grooves'}, nusart: {bg: '#FFC400', motif: 'blobs', ink: DARK},
	nuslive: {bg: '#E5141B', motif: 'waves'},
	photo: {bg: '#FF3D6E', motif: 'hills'}, music: {bg: '#B81EE0', motif: 'grooves'}, homedash: {bg: '#12B5CB', motif: 'dots'},
	browser: {bg: '#1F6FFF', motif: 'globe'}, gallery: {bg: '#FF8A00', motif: 'blobs'}, sports: {bg: '#E11D2E', motif: 'rays'},
	'g-house': {bg: '#A50034', motif: 'ghost'}, 'g-tv': {bg: '#3B4A63', motif: 'sliders'}, 'g-gear': {bg: '#D9481C', motif: 'flame'},
	hdmi: {bg: Y, motif: 'stripes', ink: DARK}, usb: {bg: Y, motif: 'stripes', ink: DARK}, input: {bg: Y, motif: 'stripes', ink: DARK},
	tv: {bg: TEAL, motif: 'waves'}, settop: {bg: TEAL, motif: 'waves'}, antenna: {bg: TEAL, motif: 'waves'},
	console: {bg: '#2F4BFF', motif: 'dots'}, controller: {bg: '#6A2BFF', motif: 'dots'},
	desktop: {bg: '#2477C9', motif: 'stripes'}, laptop: {bg: '#3E6DB5', motif: 'stripes'}, tvbox: {bg: '#7B2FF7', motif: 'rays'},
	disc: {bg: '#1A73E8', motif: 'grooves'}, speaker: {bg: '#00897B', motif: 'grooves'},
	phone: {bg: '#2EB85C', motif: 'dots'}, camera: {bg: '#FF3D6E', motif: 'hills'}
};

/** Flaticon UIcons Solid Rounded "fire-flame-curved" (Freepik): Hearth's own settings sit on an ember flame. */
export const FLAME = 'M12 24H11.92Q9.28 24 6.96 22.64Q4.64 21.28 3.32 19Q2 16.72 2 14Q2 12.56 2.48 11Q2.96 9.44 3.84 8Q4.24 7.36 4.84 7.12Q5.44 6.88 6.12 7.08Q6.8 7.28 7.2 7.8Q7.6 8.32 7.6 8.96Q7.68 11.52 8.32 12.96Q9.2 14.96 10.96 15.04Q11.76 15.04 12.32 14.52Q12.88 14 12.96 13.28Q13.04 12.56 12.8 11.84Q12.72 11.36 12.24 10.4Q11.68 9.12 11.44 8.32Q10.96 6.96 10.96 5.52Q10.96 4.32 11.2 3.12Q11.44 1.92 11.68 1.2Q11.84 0.64 12.28 0.32Q12.72 0 13.28 0Q13.84 0 14.28 0.28Q14.72 0.56 15.04 1.04Q15.52 2.08 16.4 3.36Q16.96 4.08 18 5.52H18.08Q20 8.08 20.8 9.52Q22 11.84 22 14Q22 16.72 20.64 19Q19.28 21.28 17 22.64Q14.72 24 12 24Z';
