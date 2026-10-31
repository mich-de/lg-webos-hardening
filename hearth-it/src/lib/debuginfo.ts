// The Debug tab: what Hearth knows about this TV and what it has done lately, laid out to fit a screen so a photo
// of it is enough. Page 1: how to get the log files. Page 2: this TV (state, figures) and the latest events, in small type.

import type {UserConfig} from './storage';
import type {SystemStats} from './system';

export interface DebugSnapshot {
	about: string;
	rootDetail: string;
	appList: {source: string; count: number; ago: string} | null;
	weather: string;
	config: UserConfig;
	events: string[];
	/** memory and storage, once read (null when not rooted or not read) */
	stats?: SystemStats | null;
	/** the helper's log file exists only on rooted TVs with the helper on */
	userAgent: string;
}

export interface DebugPage {
	title: string;
	lines: string[];
	/** smaller type, so more lines fit */
	dense?: boolean;
	/** a second column shown to the right of `lines` (page 2: the latest events) */
	right?: {title: string; lines: string[]};
}

const WIDTH = 118;
const LEFT_WIDTH = 76;     // page 2, left column (this TV), 20px type
const RIGHT_WIDTH = 60;    // page 2, right column (events)
export const DENSE_ROWS = 22;   // event rows in the right column (28 ran off the bottom of the TV's screen)
export const LOW_RAM_MB = 100;   // below this free RAM the Debug page warns
const APP_STORAGE = '/mnt/lg/appstore';
export const REPORT_FILE = '/tmp/hearth-debug.txt';

const clip = (s: string, width: number = WIDTH): string => (s.length > width ? s.slice(0, width - 1) + '…' : s);
const gb = (mb: number): string => (mb < 0 ? '?' : mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB');
const yn = (v: boolean): string => (v ? 'on' : 'off');

export function debugPages (s: DebugSnapshot): DebugPage[] {
	const c = s.config;
	const chrome = /Chrome\/([0-9.]+)/.exec(s.userAgent);
	const state = [
		s.rootDetail ? 'Dettagli root: ' + s.rootDetail : '',
		`Web view: ${chrome ? 'Chrome ' + chrome[1] : 'sconosciuta'}   Schermo: ${typeof window !== 'undefined' ? window.innerWidth + '×' + window.innerHeight : '?'}`,
		s.appList ? `Elenco app: ${s.appList.count} app da ${s.appList.source === 'homebrew' ? 'elenco Homebrew attivo' : s.appList.source === 'tv' ? 'servizio telecomando della TV (sperimentale)' : 'elenco integrato'} (${s.appList.ago})` : 'Elenco app: non ancora letto',
		`Meteo: ${s.weather}`,
		'',
		`Tema ${c.theme}, sfondo ${c.background}, icone ${c.iconScale}%, ${c.rows} riga${c.rows === 1 ? '' : 'he'}, nomi ${yn(c.showLabels)}, essenziale ${yn(c.minimal)}`,
		`Sfondo ${c.wallpaper.mode}${c.wallpaper.path ? ' ' + c.wallpaper.path : ''}`,
		`Chiusura Home LG ${c.closeHome ? 'on' : 'disattivata (tornava sempre in primo piano)'}, script ausiliario ${yn(c.replaceHome)}, metodo SAM ${yn(c.takeoverHome)}`,
		`App nascoste ${c.hiddenIds ? c.hiddenIds.length : '?'}, ingressi mostrati ${c.sourceIds.length}, ingressi modificati ${Object.keys(c.sourceEdits).length}`,
		`Tessera Home LG ${yn(c.showLgHome)}, tessera Impostazioni sistema ${yn(c.showSystem)}`
	].filter((l, i) => l !== '' || i === 5);
	const st = s.stats;
	state.push('');
	if (st) {
		if (st.ramFreeMB >= 0 && st.ramFreeMB < LOW_RAM_MB) state.unshift('RAM LIBERA TROPPO BASSA: HEARTH POTREBBE FUNZIONARE IN MODO INASPETTATO', '');
		state.push(`Memoria: ${gb(st.ramFreeMB)} liberi su ${gb(st.ramTotalMB)}`);
		// only the app storage matters (the other mounts are read-only or temporary); other TVs without it show all
		const appStore = st.disks.filter((d) => d.mount === APP_STORAGE);
		(appStore.length ? appStore : st.disks).forEach((d) => state.push(`Archiviazione ${d.mount}: ${gb(d.freeMB)} liberi su ${gb(d.totalMB)}`));
	} else state.push('Memoria e archiviazione: non disponibili (richiede una TV con root)');
	const help = [
		'Per inviare il rapporto, fotografare la pagina 2 (il file del rapporto contiene tutti gli eventi, non solo questi).',
		'',
		'TV con root, via SSH: apri questa scheda una volta, poi esegui da un computer',
		`   ssh root@<indirizzo TV> cat ${REPORT_FILE}`,
		'   ssh root@<indirizzo TV> cat /tmp/launcher-homehook.log      (il log dello script ausiliario, se attivo)',
		'   <indirizzo TV> è mostrato nelle impostazioni dell\'Homebrew Channel. Il primo file viene scritto quando questa scheda si apre.',
		'',
		'Nessun client SSH? webOS Dev Manager ha un\'opzione terminale che dà accesso SSH alla TV:',
		'   aprilo, usa il terminale, ed esegui gli stessi comandi cat di sopra.',
		'',
		'Senza root: resta solo la foto (un\'app della TV non può salvare file tu possa raggiungere).',
		'',
		'Usa ↑ e ↓ per cambiare pagina.'
	].map((l) => clip(l));
	// a long event continues on a second, indented row instead of being cut (no flatMap: Chrome 53)
	const wrapped = s.events.reduce((rows: string[], e) => rows.concat(e.length <= RIGHT_WIDTH ? [e] : [e.slice(0, RIGHT_WIDTH), '  ' + e.slice(RIGHT_WIDTH, RIGHT_WIDTH * 2 - 2)]), []);
	const events = wrapped.length ? wrapped.slice(-DENSE_ROWS) : ['Non è ancora successo niente.'];
	return [
		{title: 'Debug 1 di 2: come condividere i log', lines: help},
		{
			title: 'Debug 2 di 2: questa TV e gli eventi recenti',
			lines: state.map((l) => clip(l, LEFT_WIDTH)),
			dense: true,
			right: {title: 'Ultimi eventi', lines: events.map((l) => clip(l, RIGHT_WIDTH))}
		}
	];
}

/** The pages as plain text, for the report file. */
export function reportText (pages: DebugPage[], allEvents?: string[], beforeRestart?: string[]): string {
	const base = pages.map((p) => p.title + '\n' + p.lines.join('\n') + (p.right ? '\n\n' + p.right.title + '\n' + p.right.lines.join('\n') : '')).join('\n\n') + '\n';
	const earlier = beforeRestart && beforeRestart.length ? '\nPrima dell\'ultimo riavvio (fine del vecchio file)\n' + beforeRestart.join('\n') + '\n' : '';
	return (allEvents && allEvents.length ? base + '\nTutti gli eventi da questo avvio (dal più vecchio in su)\n' + allEvents.join('\n') + '\n' : base) + earlier;
}
