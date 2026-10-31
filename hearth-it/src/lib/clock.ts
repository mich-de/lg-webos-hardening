// Time-of-day text. Pure functions so they are trivially testable.

export type TimeFormat = '12h' | '24h';

const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function greeting (date: Date): string {
	const h = date.getHours();
	if (h < 12) return 'Buongiorno';
	if (h < 18) return 'Buon pomeriggio';
	return 'Buonasera';
}

export function dayName (date: Date): string {
	return DAYS[date.getDay()];
}

/** "23 settembre" */
export function dateText (date: Date): string {
	return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Domenica 11 ottobre 2026" */
export function fullDate (date: Date): string {
	return `${dayName(date)} ${dateText(date)} ${date.getFullYear()}`;
}

export interface TimeParts {
	/** "15:42" or "3:42" */
	time: string;
	/** "AM" / "PM" in 12-hour format, otherwise empty */
	period: string;
}

export function timeParts (date: Date, format: TimeFormat): TimeParts {
	const h = date.getHours();
	const m = pad(date.getMinutes());
	if (format === '24h') return {time: `${pad(h)}:${m}`, period: ''};
	return {time: `${h % 12 || 12}:${m}`, period: h < 12 ? 'AM' : 'PM'};
}

function pad (n: number): string {
	return n < 10 ? `0${n}` : String(n);
}
