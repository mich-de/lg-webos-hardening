import {WALLPAPER} from '../config/constants';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {failureText, whySuffix} from '../lib/failure';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {
	baseName, INTERNAL_ROOT, joinPath, listDir, listRoots, parentPath,
	type DirEntry, type StorageRoot
} from '../lib/wallpaper';

/** What the user picked. */
export type WallpaperChoice =
	| {mode: 'gradient'}
	| {mode: 'image'; path: string}
	| {mode: 'folder'; path: string}
	| {mode: 'nature'};

interface Props {
	/** choosing one picture for a source's icon: no default-background or slideshow rows */
	forIcon?: boolean;
	onChoose: (choice: WallpaperChoice) => void;
	onClose: () => void;
}

type RowKind = 'gradient' | 'nature' | 'root' | 'folder' | 'picture' | 'slideshow' | 'info' | 'retry';

interface PickerRow {
	key: string;
	kind: RowKind;
	label: string;
	detail?: string;
	path?: string;
}

const VISIBLE_ROWS = 9;

const HINTS = {
	roots: 'Scegli dove sono le tue immagini · Indietro torna alle impostazioni',
	folder: 'OK apre una cartella o imposta un\'immagine · Indietro risale'
} as const;

/** Advice shown at the top level of the wallpaper picker (not in the icon picker): a warning, then how to copy files. */
const MB = 1048576;
const WALLPAPER_WARNING: readonly string[] = [
	'Le immagini grandi rallentano il launcher quando le carica: minore è il file, più veloce è l\'avvio.',
	`Limite rigoroso: ${Math.round(WALLPAPER.maxBytes / MB)} MB e ${WALLPAPER.maxPixels / 1000000} megapixel per immagine (un'immagine 4K è circa 8 megapixel). Le immagini oltre il limite vengono saltate in una presentazione e rifiutate come sfondo singolo.`
];
const WALLPAPER_HOWTO: readonly string[] = [
	'Per usare le tue immagini, mettile in /media/developer (mostrata più sotto come Memoria interna), o collega una unità USB.',
	'Via SSH, da un computer:  scp photo.jpg root@<indirizzo TV>:/media/developer/   (se scp non funziona, prova scp -O)',
	'Con webOS Dev Manager: collega la TV e usa la sua opzione file o terminale per copiare in /media/developer.',
	'<indirizzo TV> è il numero "IP:" in basso a destra delle Impostazioni, o nelle impostazioni di rete della TV.'
];

/** Long paths keep their end (the current folder) and lose the start. */
function shortPath (path: string): string {
	return path.length > 90 ? `…${path.slice(path.length - 89)}` : path;
}

function pictureCount (entries: DirEntry[]): number {
	return entries.filter((e) => !e.isDir).length;
}

function buildRows (path: string | null, roots: StorageRoot[], entries: DirEntry[], failed: boolean): PickerRow[] {
	if (failed) {
		const rows: PickerRow[] = [{key: 'retry', kind: 'retry', label: 'Riprova', detail: 'Rileggi la memoria'}];
		if (path === null) rows.unshift({key: 'gradient', kind: 'gradient', label: 'Sfondo integrato', detail: 'Nessuna immagine. Scegli quale con ← → sulla riga Sfondo'}, {key: 'nature', kind: 'nature', label: 'Presentazione foto natura', detail: 'Le 11 foto incluse in Hearth, una dopo l\'altra. Nessun root o USB richiesti'});
		return rows;
	}
	if (path === null) {
		const rows: PickerRow[] = [{key: 'gradient', kind: 'gradient', label: 'Sfondo integrato', detail: 'Nessuna immagine. Scegli quale con ← → sulla riga Sfondo'}, {key: 'nature', kind: 'nature', label: 'Presentazione foto natura', detail: 'Le 11 foto incluse in Hearth, una dopo l\'altra. Nessun root o USB richiesti'}];
		roots.forEach((r) => rows.push({key: `root:${r.path}`, kind: 'root', label: r.label, detail: r.path, path: r.path}));
		if (!roots.some((r) => r.path !== INTERNAL_ROOT.path)) {
			rows.push({key: 'no-usb', kind: 'info', label: 'Nessuna unità USB trovata', detail: 'Collegane una, poi riapri questa schermata'});
		}
		return rows;
	}
	const rows: PickerRow[] = [];
	const count = pictureCount(entries);
	if (count > 0) {
		rows.push({
			key: 'slideshow', kind: 'slideshow', label: 'Riproduci questa cartella come presentazione',
			detail: `${count} ${count === 1 ? 'immagine' : 'immagini'} in ${baseName(path)}`
		});
	}
	entries.forEach((e) => rows.push({
		key: `${e.isDir ? 'dir' : 'pic'}:${e.name}`,
		kind: e.isDir ? 'folder' : 'picture',
		label: e.name,
		path: joinPath(path, e.name)
	}));
	if (!rows.length) rows.push({key: 'empty', kind: 'info', label: 'Niente qui', detail: 'Questa cartella non ha immagini né cartelle'});
	return rows;
}

/** Folder browser for choosing a wallpaper picture or a slideshow folder.
 *  Top level: the default gradient, USB drives, internal storage. Inside a folder: sub-folders,
 *  pictures, and (when it has pictures) a row that plays the whole folder as a slideshow. */
export function Picker ({forIcon, onChoose, onClose}: Props) {
	const [roots, setRoots] = useState<StorageRoot[]>([]);
	const [path, setPath] = useState<string | null>(null);
	const [entries, setEntries] = useState<DirEntry[]>([]);
	const [index, setIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [attempt, setAttempt] = useState(0);
	const remembered = useRef<Record<string, number>>({});

	const rows = buildRows(path, roots, entries, !loading && error !== '').filter((r) => !forIcon || (r.kind !== 'gradient' && r.kind !== 'nature' && r.kind !== 'slideshow'));
	const pathKey = path === null ? '' : path;

	// Roots load once; a folder's contents load whenever the path changes.
	useEffect(() => {
		let cancelled = false;
		if (path === null) {
			setLoading(true);
			setError('');
			listRoots().then(
				(r) => { if (!cancelled) { setRoots(r); setLoading(false); } },
				(e) => { if (!cancelled) { setRoots([]); setError(failureText(e, 'leggere la memoria')); setLoading(false); } }
			);
		} else {
			setLoading(true);
			setError('');
			listDir(path).then(
				(list) => { if (!cancelled) { setEntries(list); setLoading(false); } },
				() => { if (!cancelled) { setEntries([]); setError(`Impossibile leggere questa cartella${whySuffix() || ''}`); setLoading(false); } }
			);
		}
		return () => { cancelled = true; };
	}, [path, attempt]);

	const goTo = (next: string | null, restoreIndex: number) => {
		remembered.current[pathKey] = index;
		setEntries([]);
		setIndex(restoreIndex);
		setPath(next);
	};

	const goUp = () => {
		if (path === null) { onClose(); return; }
		const atRoot = roots.some((r) => r.path === path);
		const target = atRoot ? null : parentPath(path);
		const restore = remembered.current[target === null ? '' : target] || 0;
		remembered.current[pathKey] = 0;
		setEntries([]);
		setIndex(restore);
		setPath(target);
	};

	const activate = (i: number) => {
		const row = rows[i];
		if (!row || loading) return;
		switch (row.kind) {
			case 'gradient': onChoose({mode: 'gradient'}); break;
			case 'nature': onChoose({mode: 'nature'}); break;
			case 'retry': setIndex(0); setAttempt((n) => n + 1); break;
			case 'root':
			case 'folder': if (row.path) goTo(row.path, 0); break;
			case 'picture': if (row.path) onChoose({mode: 'image', path: row.path}); break;
			case 'slideshow': if (path) onChoose({mode: 'folder', path}); break;
			default: break;
		}
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, Math.max(0, rows.length - 1))); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, Math.max(0, rows.length - 1))); break;
			case 'enter': activate(index); break;
			case 'back': goUp(); break;
			default: break;
		}
		return true;
	}, [rows.length, index, path, roots, loading, entries]);

	useKeys(handleKey, true);

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);
	const iconFor = (row: PickerRow) => row.kind === 'gradient' ? 'default' : row.kind === 'nature' ? 'slideshow' : row.kind === 'retry' ? 'info' : row.kind === 'root' ? (row.path === INTERNAL_ROOT.path ? 'folder' : 'drive') : row.kind;

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{forIcon ? 'Scegli un\'immagine per l\'icona' : 'Scegli lo sfondo'}</h1>
				<p class="settings__hint">{path === null ? HINTS.roots : HINTS.folder}</p>
				{path === null && !forIcon && (
					<div class="picker__note">
						<div class="picker__note-title">Prima di scegliere</div>
						<div class="picker__note-para">{WALLPAPER_WARNING.map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
						<div class="picker__note-para">{WALLPAPER_HOWTO.map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					</div>
				)}
				<div class="picker__path">{path === null ? 'Posizioni' : shortPath(path)}</div>
				<div class="picker">
					{loading && <div class="picker__status">Caricamento…</div>}
					{!loading && error && <div class="picker__status picker__status--error">{error}</div>}
					{!loading && visible.map((row, n) => {
						const i = start + n;
						return (
							<div
								key={row.key}
								class={`picker__row${i === index ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}`}
								onMouseEnter={() => setIndex(i)}
								onClick={() => { setIndex(i); activate(i); }}
							>
								<PickerIcon kind={iconFor(row)} />
								<div class="picker__text">
									<div class="picker__label">{row.label}</div>
									{row.detail && <div class="picker__detail">{row.detail}</div>}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
