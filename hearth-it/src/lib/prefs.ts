// The settings screens as data: every option on the Look, Clock, Wallpaper and Options tabs,
// how it reads the config, and how OK / ← → change it. The app builds the Settings lists
// from this table and applies a change with `applyPref`.

import type {OptionItem} from '../components/OptionList';
import {LIGHT_THEMES, type ThemeName} from '../theme/tokens';
import {BACKGROUND_IDS, NATURE_SHOW, backgroundLabel} from './backgrounds';
import {
	DEFAULT_CLOCK, DEFAULT_WALLPAPER, DEFAULT_WEATHER, INTERVAL_VALUES, RANGES, rangeValues, stepValue,
	type ClockFormat, type ClockWeight, type RangeName, type UserConfig
} from './storage';
import {CLOCK_FONT_IDS, fontLabel} from './clockfont';
import {TILE_SHAPE_IDS, tileShapeText} from './tileshape';
import {CLOCK_COLOR_IDS, LABEL_COLOR_IDS, colorInfo, labelColorText, type ClockColor} from './clockcolor';
import {baseName} from './wallpaper';
import {WEATHER_ENABLED} from '../config/features';
import type {TempUnit} from './weather';
import {lastFailure, rootState, type RootState} from './failure';
import type {LogoState} from './system';
import type {TakeoverStatus} from './takeovercmd';

export type PrefTab = 'look' | 'clock' | 'weather' | 'wallpaper' | 'options';

/** Facts about the TV (not user settings) that some rows display. */
export interface SystemInfo {
	/** the hand-over watcher: running, and whether it starts at boot (null while unknown) */
	homeHook: {running: boolean; linked: boolean} | null;
	/** Hearth in LG Home's own place ("Replace LG Home with a script and SAM"): what is in place (null while unknown) */
	takeover?: TakeoverStatus | null;
	/** the launcher is in the TV's input list (null while unknown) */
	tvInput?: boolean | null;
	/** the TV's "show the LG logo at start" setting (null while unknown) */
	logo?: LogoState | null;
	/** can this TV run commands through the Homebrew Channel (rooted)? */
	root?: RootState;
	/** free memory in MB (-1: could not be read; undefined: not read yet) */
	/** what the TV said when it could not (shown under a greyed-out row) */
	rootDetail?: string;
}

/** The options that run shell commands, so they can't work without root. */
export const ROOT_OPTIONS = ['takeover', 'replaceHome', 'tvInput', 'lgLogo'];

/** The two ways of replacing LG Home cannot be on together: the helper script reacts to LG Home coming to the front, the
 *  SAM method keeps LG Home from ever starting. Each greys the other out. */
function helperIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	return !!(config && config.replaceHome) || !!(info && info.homeHook && (info.homeHook.running || info.homeHook.linked));
}

function takeoverIsOn (info?: SystemInfo, config?: UserConfig): boolean {
	return !!(config && config.takeoverHome) || !!(info && info.takeover && info.takeover.enabled);
}

/** Why a row is greyed out, or null when it is usable. */
export function disabledReason (id: string, info?: SystemInfo, config?: UserConfig): string | null {
	if (id === 'lgLogo' && info && info.logo === 'unsupported') return "Questa TV non ha un'impostazione per il logo LG all'avvio.";
	if (id === 'takeover' && helperIsOn(info, config)) return 'Disattiva prima "Sostituisci Home LG con uno script ausiliario". I due metodi farebbero conflitto sul pulsante Home.';
	if (id === 'replaceHome' && takeoverIsOn(info, config)) return 'Non usato finché "Sostituisci Home LG con uno script e SAM" è attivo, che impedisce già ad Home LG di apparire. Disattivalo per usare lo script ausiliario.';
	if (!info || info.root !== 'no' || ROOT_OPTIONS.indexOf(id) === -1) return null;
	const kind = lastFailure();
	const why = kind === 'denied' ? 'la TV ha rifiutato il comando. Se questa TV ha root, aggiornare l\'Homebrew Channel può aiutare. Su webOS 11, esegui una volta via SSH: sh /media/developer/apps/usr/palm/applications/tld.my.customlauncher/tools/webos11-permission.sh (vedi "webOS 11" nel README).' : 'il servizio Homebrew Channel non è in esecuzione. Se la TV ha root, apri una volta l\'Homebrew Channel, poi riapri Impostazioni.';
	return 'Richiede una TV con root: ' + why + (info.rootDetail ? ` (la TV ha detto: ${info.rootDetail})` : '');
}

/** How a key press changes a setting: OK steps and wraps round; ← → nudge and stop at the ends. */
export type Press = 'ok' | 'left' | 'right';

export interface Pref {
	id: string;
	tab: PrefTab;
	label: string;
	description: string;
	kind: 'toggle' | 'choice' | 'action';
	/** toggle: is it on */
	on?: (c: UserConfig) => boolean;
	/** choice / action: the current value as text */
	text?: (c: UserConfig, info?: SystemInfo) => string;
	/** the new config after a key press (toggle: any press flips it) */
	change?: (c: UserConfig, press: Press) => UserConfig;
	/** false hides the row for this config (default: always shown) */
	visible?: (c: UserConfig) => boolean;
}

const isSlideshow = (c: UserConfig): boolean => c.wallpaper.mode === 'folder' || (c.wallpaper.mode === 'gradient' && c.background === NATURE_SHOW);
const delta = (press: Press): number => (press === 'left' ? -1 : 1);

function toggle (id: string, tab: PrefTab, label: string, description: string, get: (c: UserConfig) => boolean, set: (c: UserConfig, v: boolean) => UserConfig): Pref {
	return {
		id, tab, label, description, kind: 'toggle',
		on: get,
		change: (c, press) => (press === 'ok' ? set(c, !get(c)) : c)       // arrows leave switches alone
	};
}

function choice<T> (id: string, tab: PrefTab, label: string, description: string, values: readonly T[], get: (c: UserConfig) => T, set: (c: UserConfig, v: T) => UserConfig, text: (v: T) => string): Pref {
	return {
		id, tab, label, description, kind: 'choice',
		text: (c) => text(get(c)),
		change: (c, press) => set(c, stepValue(values, get(c), delta(press), press === 'ok'))
	};
}

function range (id: string, tab: PrefTab, label: string, description: string, name: RangeName, get: (c: UserConfig) => number, set: (c: UserConfig, v: number) => UserConfig, text: (v: number) => string): Pref {
	return choice(id, tab, label, description, rangeValues(name), get, set, text);
}

export function intervalText (seconds: number): string {
	if (seconds < 60) return `${seconds} secondi`;
	if (seconds < 3600) return seconds === 60 ? '1 minuto' : `${seconds / 60} minuti`;
	return seconds === 3600 ? '1 ora' : `${seconds / 3600} ore`;
}

const THEMES: readonly ThemeName[] = ['black', 'grey', 'midnight', 'forest', 'cloud', 'sand', 'mist'];
const CLOCK_FORMATS: readonly ClockFormat[] = ['12h', '24h', 'tv'];
const WEIGHTS: readonly ClockWeight[] = [200, 300, 400, 500, 600, 700];
const UNITS: readonly TempUnit[] = ['c', 'f'];

const THEME_TEXT: Record<ThemeName, string> = {black: 'Nero OLED', grey: 'Blu-grigio calmo', midnight: 'Blu notte', forest: 'Verde bosco', cloud: 'Chiaro: nuvola', sand: 'Chiaro: sabbia', mist: 'Chiaro: nebbia'};
const FORMAT_TEXT: Record<ClockFormat, string> = {'12h': '12 ore (AM/PM)', '24h': '24 ore', tv: 'Come la TV'};
const WEIGHT_TEXT: Record<ClockWeight, string> = {200: 'Sottile', 300: 'Leggero', 400: 'Normale', 500: 'Medio', 600: 'Semi-grassetto', 700: 'Grassetto'};

/** The look, margins, clock and weather back to their defaults (apps, sources and wallpaper are left alone). */
export function resetLook (c: UserConfig): UserConfig {
	return {
		...c,
		theme: 'black',
		iconScale: RANGES.iconScale.def,
		iconOpacity: RANGES.iconOpacity.def,
		iconGap: RANGES.iconGap.def,
		wallpaperOpacity: RANGES.wallpaperOpacity.def,
		fadeStrength: RANGES.fadeStrength.def,
		fadeHeight: RANGES.fadeHeight.def,
		tileShape: 'rounded',
		recentsW: RANGES.recentsW.def,
		recentsH: RANGES.recentsH.def,
		oledShift: true,
		labelColor: 'theme',
		showLabels: true,
		minimal: false,
		rows: 1,
		sideMargin: RANGES.sideMargin.def,
		bottomMargin: RANGES.bottomMargin.def,
		clockFormat: 'tv',
		clock: {...DEFAULT_CLOCK},
		weather: {...DEFAULT_WEATHER}
	};
}

/** The Weather tab's rows (left out of builds made without the weather widget). */
const WEATHER_PREFS: Pref[] = [
	toggle('weatherOn', 'weather', 'Mostra il meteo', 'Temperatura e condizioni meteo sotto la data.',
		(c) => c.weather.on, (c, v) => ({...c, weather: {...c.weather, on: v && c.weather.city !== null}})),
	{
		id: 'weatherCity', tab: 'weather', label: 'Città', kind: 'action',
		description: "Scegli una città dall'elenco, o cerca qualsiasi località per nome. Richiede la connessione a internet.",
		text: (c) => (c.weather.city ? c.weather.city.name : 'Non impostata')
	},
	choice('weatherUnit', 'weather', 'Unità di temperatura', 'Celsius o Fahrenheit.',
		UNITS, (c) => c.weather.unit, (c, v) => ({...c, weather: {...c.weather, unit: v}}), (v) => (v === 'f' ? 'Fahrenheit (°F)' : 'Celsius (°C)')),
	toggle('weatherCityName', 'weather', 'Mostra il nome della città', 'Il nome della città prima della temperatura.',
		(c) => c.weather.showCity, (c, v) => ({...c, weather: {...c.weather, showCity: v}})),
	toggle('weatherRange', 'weather', 'Mostra massimo e minimo di oggi', 'Ad esempio H 31°  L 25°.',
		(c) => c.weather.showRange, (c, v) => ({...c, weather: {...c.weather, showRange: v}}))
];

const BASE_PREFS: Pref[] = [
	// ----- Look -----
	choice('theme', 'look', 'Tema', 'I colori delle tessere, del testo e dello sfondo. Il nero OLED tiene spenti i pixel non usati. Nei temi chiari un orologio bianco diventa grigio scuro per restare leggibile (modificabile sotto Sfondo).',
		THEMES, (c) => c.theme, (c, v) => ({...c, theme: v, clock: {...c.clock, color: LIGHT_THEMES.indexOf(v) !== -1 && c.clock.color === 'white' ? 'charcoal' : LIGHT_THEMES.indexOf(c.theme) !== -1 && LIGHT_THEMES.indexOf(v) === -1 && c.clock.color === 'charcoal' ? 'white' : c.clock.color}}), (v) => THEME_TEXT[v]),
	choice('quietSec', 'look', 'Modalità silenzio', 'Nasconde le app (l\'orologio resta) quando non viene premuto alcun tasto per questa durata. Un tasto qualsiasi le riporta; quel primo tasto non fa altro. ← → o OK lo modificano.',
		rangeValues('quietSec'), (c) => c.quietSec, (c, v) => ({...c, quietSec: v}), (v) => (v === 0 ? 'Off' : `${v} secondi`)),
	toggle('minimal', 'look', 'Icone essenziali', 'Nessun bordo attorno alle icone e nessuna cornice bianca o nera sulla selezionata. L\'icona selezionata è semplicemente più grande.',
		(c) => c.minimal, (c, v) => ({...c, minimal: v})),
	range('iconScale', 'look', 'Dimensione icone', 'Le icone delle app più piccole o più grandi. ← → regola.',
		'iconScale', (c) => c.iconScale, (c, v) => ({...c, iconScale: v}), (v) => `${v}%`),
	range('iconGap', 'look', 'Spaziatura icone', 'Lo spazio tra le icone sulla riga principale, dal 50% al 200% del normale. ← → regola.',
		'iconGap', (c) => c.iconGap, (c, v) => ({...c, iconGap: v}), (v) => `${v}%`),
	choice('tileShape', 'look', 'Forma icone', 'La forma delle icone sulla riga principale: quadrato arrotondato, quadrato netto, squircle, cerchio, foglia, arco o goccia.',
		TILE_SHAPE_IDS, (c) => c.tileShape, (c, v) => ({...c, tileShape: v}), tileShapeText),
	choice('rows', 'look', 'Righe di app', 'Mostra le app in una riga, o divise su due righe (su/giù passa da una all\'altra).',
		[1, 2] as const, (c) => c.rows, (c, v) => ({...c, rows: v}), (v) => (v === 1 ? '1 riga' : '2 righe')),
	toggle('showLabels', 'look', 'Mostra nomi app', 'Il nome sotto ogni icona della riga principale. Disattiva per avere solo le icone.',
		(c) => c.showLabels, (c, v) => ({...c, showLabels: v})),
	choice('labelColor', 'look', 'Colore nomi', 'Il colore dei nomi delle app sotto le icone. "Del tema" segue il tema.',
		LABEL_COLOR_IDS, (c) => c.labelColor, (c, v) => ({...c, labelColor: v}), labelColorText),
	toggle('showLgHome', 'look', 'Mostra la tessera Home LG', 'La tessera Home LG in fondo alla riga. Se Hearth è la tua schermata Home (con lo script ausiliario), questa tessera è la via di ritorno alla Home di LG.',
		(c) => c.showLgHome, (c, v) => ({...c, showLgHome: v})),
	toggle('showSystem', 'look', 'Mostra la tessera Impostazioni sistema', 'La tessera che apre le impostazioni della TV. La tessera Impostazioni di Hearth resta sempre, così puoi sempre tornare qui.',
		(c) => c.showSystem, (c, v) => ({...c, showSystem: v})),
	range('sideMargin', 'look', 'Margine laterale', 'Spazio a sinistra e a destra della riga di app. ← → regola.',
		'sideMargin', (c) => c.sideMargin, (c, v) => ({...c, sideMargin: v}), (v) => `${v} px`),
	range('bottomMargin', 'look', 'Margine inferiore', 'Spazio sotto la riga di app. ← → regola.',
		'bottomMargin', (c) => c.bottomMargin, (c, v) => ({...c, bottomMargin: v}), (v) => `${v} px`),

	range('recentsW', 'look', 'Larghezza pannello app recenti', 'Quanto è largo il pannello che Indietro apre sulla schermata Home, come quota dello schermo. ← → regola.',
		'recentsW', (c) => c.recentsW, (c, v) => ({...c, recentsW: v}), (v) => `${v}%`),
	range('recentsH', 'look', 'Altezza pannello app recenti', 'Quanto è alto quel pannello, come quota dello schermo. Le icone dentro crescono con l\'altezza. ← → regola.',
		'recentsH', (c) => c.recentsH, (c, v) => ({...c, recentsH: v}), (v) => `${v}%`),
	toggle('oledShift', 'look', 'Spostamento OLED', 'Sposta l\'orologio e le app di qualche pixel ogni minuto, così nulla resta fermo in un punto e brucia lo schermo. Ripristina aspetto e orologio lo riattiva.',
		(c) => c.oledShift, (c, v) => ({...c, oledShift: v})),

	{
		id: 'resetLook', tab: 'look', label: 'Ripristina aspetto e orologio', kind: 'action',
		description: 'Tema, dimensione icone, margini e orologio tornano ai valori predefiniti.',
		text: () => 'Ripristina'
	},

	// ----- Clock -----
	choice('clockFormat', 'clock', 'Formato ora', '12 ore, 24 ore, o come la TV.',
		CLOCK_FORMATS, (c) => c.clockFormat, (c, v) => ({...c, clockFormat: v}), (v) => FORMAT_TEXT[v]),
	range('clockSize', 'clock', 'Dimensione orologio', 'Quanto è grande l\'ora. ← → regola.',
		'clockSize', (c) => c.clock.size, (c, v) => ({...c, clock: {...c.clock, size: v}}), (v) => `${v}`),
	choice('clockFont', 'clock', 'Font orologio', 'Il tipo di carattere di ora e data. "Font TV" è quello proprio della TV; gli altri sono inclusi nel launcher.',
		CLOCK_FONT_IDS, (c) => c.clock.font, (c, v) => ({...c, clock: {...c.clock, font: v}}), (v) => fontLabel(v)),
	choice('clockWeight', 'clock', 'Spessore orologio', 'Da sottile a grassetto. Un font con meno spessori usa il più vicino (o un grassetto sintetico).',
		WEIGHTS, (c) => c.clock.weight, (c, v) => ({...c, clock: {...c.clock, weight: v}}), (v) => WEIGHT_TEXT[v]),
	range('clockTop', 'clock', 'Posizione orologio (verticale)', 'Quanto in basso dal bordo superiore dello schermo (0% è il bordo in alto). ← → regola.',
		'clockTop', (c) => c.clock.top, (c, v) => ({...c, clock: {...c.clock, top: v}}), (v) => `${v}%`),
	range('clockLeft', 'clock', 'Posizione orologio (orizzontale)', 'Sposta l\'orologio a sinistra o a destra (50% è il centro). ← → regola.',
		'clockLeft', (c) => c.clock.left, (c, v) => ({...c, clock: {...c.clock, left: v}}), (v) => `${v}%`),
	toggle('showDate', 'clock', 'Mostra la data', 'Il giorno e la data sotto l\'ora.',
		(c) => c.clock.showDate, (c, v) => ({...c, clock: {...c.clock, showDate: v}})),
	toggle('showPeriod', 'clock', 'Mostra AM / PM', 'Il piccolo AM o PM accanto all\'ora (solo 12 ore).',
		(c) => c.clock.showPeriod, (c, v) => ({...c, clock: {...c.clock, showPeriod: v}})),

	// ----- Wallpaper -----
	{
		// ← → step the built-in backgrounds (and switch back to one from a picture or slideshow); OK opens the picture picker
		id: 'wallpaper', tab: 'wallpaper', label: 'Sfondo', kind: 'choice',
		description: '← → Scegli uno sfondo integrato (colori pieni, gradienti, alcune foto della natura). OK sceglie la tua immagine, una cartella di immagini per una presentazione, o la presentazione delle foto della natura incluse in Hearth. Il selettore dà consigli sulle dimensioni e su come copiare i file.',
		text: (c) => c.wallpaper.mode === 'image' ? `Immagine: ${baseName(c.wallpaper.path)}`
			: c.wallpaper.mode === 'folder' ? `Presentazione: ${baseName(c.wallpaper.path)}` : `Integrato: ${backgroundLabel(c.background)}`,
		change: (c, press) => {
			if (press === 'ok') return c;
			if (c.wallpaper.mode !== 'gradient') return {...c, wallpaper: {...DEFAULT_WALLPAPER, intervalSec: c.wallpaper.intervalSec, shuffle: c.wallpaper.shuffle}};
			return {...c, background: stepValue(BACKGROUND_IDS, c.background, delta(press), false)};
		}
	},
	{...choice('interval', 'wallpaper', 'Cambia immagine ogni', 'Quanto a lungo resta in mostra ogni immagine di una presentazione.',
		INTERVAL_VALUES, (c) => c.wallpaper.intervalSec, (c, v) => ({...c, wallpaper: {...c.wallpaper, intervalSec: v}}), intervalText), visible: isSlideshow},
	{...toggle('shuffle', 'wallpaper', 'Ordine casuale', 'Ordine casuale. Disattivato, le immagini scorrono dalla A alla Z.',
		(c) => c.wallpaper.shuffle, (c, v) => ({...c, wallpaper: {...c.wallpaper, shuffle: v}})), visible: isSlideshow},
	choice('clockColor', 'wallpaper', 'Colore widget (orologio, data, meteo)', 'Il bianco è difficile da leggere su un\'immagine chiara. Per sfondi chiari scegli un colore scuro o uno dei gradienti; per quelli scuri i colori chiari rendono meglio.',
		CLOCK_COLOR_IDS, (c) => c.clock.color, (c, v) => ({...c, clock: {...c.clock, color: v}}), (v: ClockColor) => colorInfo(v).label),
	toggle('clockShadow', 'wallpaper', 'Ombra widget', 'Una lieve ombra dietro a ora, data e meteo, così restano leggibili su un\'immagine luminosa. Non usata con i colori scuri.',
		(c) => c.clock.shadow, (c, v) => ({...c, clock: {...c.clock, shadow: v}})),
	{...range('clockShadowStrength', 'wallpaper', 'Intensità ombra widget', 'Quanto è forte l\'ombra, dal 10% al 100%. ← → regola.',
		'clockShadow', (c) => c.clock.shadowStrength, (c, v) => ({...c, clock: {...c.clock, shadowStrength: v}}), (v) => `${v}%`), visible: (c) => c.clock.shadow},
	range('clockOpacity', 'wallpaper', 'Opacità widget', 'Quanto sono solidi orologio, data e meteo, dal 10% al 100%. Riducila se un colore scuro pesa troppo. ← → regola.',
		'clockOpacity', (c) => c.clock.opacity, (c, v) => ({...c, clock: {...c.clock, opacity: v}}), (v) => `${v}%`),
	range('wallpaperOpacity', 'wallpaper', 'Opacità sfondo', 'Quanto è solida la tua immagine o presentazione, dal 30% al 100%. Riducila per scurire o attenuare rispetto allo sfondo del tema. Gli sfondi integrati non cambiano. ← → regola.',
		'wallpaperOpacity', (c) => c.wallpaperOpacity, (c, v) => ({...c, wallpaperOpacity: v}), (v) => `${v}%`),
	range('fadeStrength', 'wallpaper', 'Sfumatura in basso: scurezza', 'Quanto scuro diventa lo sfondo al bordo inferiore, sfumando poco più in alto, così le icone restano leggibili su immagini luminose. 0% la disattiva. ← → regola.',
		'fadeStrength', (c) => c.fadeStrength, (c, v) => ({...c, fadeStrength: v}), (v) => (v === 0 ? 'Off' : `${v}%`)),
	range('fadeHeight', 'wallpaper', 'Sfumatura in basso: quanto risale', 'Quanto schermo, dal basso, copre la sfumatura. Conta solo se la scurezza è sopra lo 0%. ← → regola.',
		'fadeHeight', (c) => c.fadeHeight, (c, v) => ({...c, fadeHeight: v}), (v) => `${v}%`),
	range('iconOpacity', 'wallpaper', 'Opacità icone', 'Quanto sono solidi le icone di app ed ingressi sulla riga principale, dal 30% al 100%. Riducila per lasciar vedere lo sfondo. ← → regola.',
		'iconOpacity', (c) => c.iconOpacity, (c, v) => ({...c, iconOpacity: v}), (v) => `${v}%`),

	// ----- Options -----
	{
		id: 'takeover', tab: 'options', label: 'Sostituisci Home LG con uno script e SAM', kind: 'action',
		description: 'Mette un surrogato nero al posto di Home LG e apre questo launcher appena la TV lo mostra, così Home LG non si disegna mai. Riavvia una volta il gestore app della TV (SAM), lo schermo può lampeggiare. Non insieme allo script ausiliario. OK attiva o disattiva.',
		text: (c, info) => {
			if (info && info.takeover) return info.takeover.enabled ? (info.takeover.web ? 'On' : 'On (non ancora attivo)') : 'Off';
			return c.takeoverHome ? 'On' : info ? 'Off' : 'Sconosciuto';
		}
	},
	{
		id: 'replaceHome', tab: 'options', label: 'Sostituisci Home LG con uno script ausiliario', kind: 'action',
		description: 'Un piccolo helper di sfondo, avviato all\'accensione, apre questo launcher ogni volta che Home LG torna in primo piano (Home, Indietro). Home LG può lampeggiare un istante prima: l\'app Input Hook lo evita. Non insieme al metodo SAM. OK attiva o disattiva.',
		text: (_c, info) => (!info || !info.homeHook ? 'Sconosciuto' : info.homeHook.running ? 'On' : 'Off')
	},
	{
		id: 'tvInput', tab: 'options', label: 'Aggiungi il launcher come ingresso TV (accendi la TV su di esso)', kind: 'action',
		description: 'Aggiunge questo launcher all\'elenco degli ingressi della TV, come HDMI 1. Poi imposta la TV per accendersi sull\'ultimo ingresso e scegli questo: la TV parte direttamente nel launcher. OK lo aggiunge o lo toglie.',
		text: (_c, info) => (!info || info.tvInput === null || info.tvInput === undefined ? 'Sconosciuto' : info.tvInput ? 'Aggiunto' : 'Non aggiunto')
	},
	{
		id: 'lgLogo', tab: 'options', label: 'Mostra il logo LG all\'accensione della TV', kind: 'action',
		description: 'L\'interruttore di LG (di norma nascosto): disattivalo per un avvio pulito direttamente in questo launcher. OK lo attiva o lo disattiva.',
		text: (_c, info) => (!info || info.logo === null || info.logo === undefined || info.logo === 'unsupported' ? 'Sconosciuto' : info.logo === 'on' ? 'On' : 'Off')
	},
	{
		id: 'tvApps', tab: 'options', label: 'Carica le app dalla TV (sperimentale, senza root)', kind: 'action',
		description: 'Per le TV senza root: chiede alla TV stessa il suo elenco completo di app. Richiede "LG Connect Apps" attivo nelle impostazioni della TV. OK avvia l\'abbinamento: la TV chiede di consentire la connessione, premi OK. Potrebbe non funzionare su ogni TV. In tal caso aggiungi le app a mano: vedi la guida su app e icone personalizzate su github.com/partridgeworks/webos-launcher. Ancora OK lo disattiva.',
		text: (c) => (c.tvApps ? 'On' : 'Off'),
		visible: (c) => rootState() !== 'yes' || c.tvApps       // not for rooted users (kept while on, so it can be turned off)
	},
	toggle('showDebug', 'options', 'Mostra la scheda Debug',
		'Aggiunge a Impostazioni la scheda Debug (informazioni su questa TV e gli eventi recenti) e la scheda Test (verifiche di ciò che questa TV consente), per segnalare un problema. OK lo attiva o lo disattiva.',
		(c) => c.showDebug, (c, v) => ({...c, showDebug: v}))
];

export const PREFS: Pref[] = WEATHER_ENABLED ? BASE_PREFS.concat(WEATHER_PREFS) : BASE_PREFS;

export function findPref (id: string): Pref | undefined {
	return PREFS.find((p) => p.id === id);
}

/** The order of the Options tab (anything not listed goes last). */
const OPTIONS_ORDER = ['tvInput', 'takeover', 'replaceHome', 'lgLogo', 'tvApps', 'showDebug'];

function orderOf (tab: PrefTab, id: string): number {
	if (tab !== 'options') return 0;
	const i = OPTIONS_ORDER.indexOf(id);
	return i === -1 ? OPTIONS_ORDER.length : i;
}

/** The Settings list for one tab. */
export function optionsFor (tab: PrefTab, config: UserConfig, info?: SystemInfo): OptionItem[] {
	return PREFS.filter((p) => p.tab === tab && (!p.visible || p.visible(config))).sort((a, b) => orderOf(tab, a.id) - orderOf(tab, b.id)).map((p) => ({
		id: p.id,
		label: p.label,
		description: p.description,
		disabled: disabledReason(p.id, info, config) || undefined,
		value: p.kind === 'toggle' && p.on ? p.on(config) : undefined,
		valueText: p.kind !== 'toggle' && p.text ? p.text(config, info) : undefined,
		stepper: p.kind === 'choice'
	}));
}

/** The config after pressing OK / ← / → on option `id`; the same config when nothing changes. */
export function applyPref (config: UserConfig, id: string, press: Press): UserConfig {
	const pref = findPref(id);
	return pref && pref.change ? pref.change(config, press) : config;
}
