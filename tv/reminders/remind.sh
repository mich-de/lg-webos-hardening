#!/bin/sh
# Demone promemoria condiviso (NuSport, Guida TV). Root, busybox sh. Gira sul TV in /media/developer/reminders/.
#   reminders.txt  <epoch_inizio>|<id>|<appId>|<titolo>|<extra>   (scritto SOLO da add/del, sotto lock)
#   notified       <id>|<epoch_inizio>    già avvisati
#   snooze         <id>|<epoch_avviso>    avviso rimandato
#   lead_min       anticipo in minuti (default 10)
#   onclick_launch se esiste: "Rimanda"/"Annulla" lanciano l'app con reminderAction invece di exec hbchannel
# Uso: remind.sh start|stop|status|run|once|list|add <epoch> <id> <appId> <titolo> [extra]|del <id>|snooze <id> [min]|lead <min>
D=${REMIND_DIR:-/media/developer/reminders}
R=$D/reminders.txt
N=$D/notified
Z=$D/snooze
LK=$D/.lock
P=${REMIND_PID:-/tmp/reminders.pid}
SELF=$(readlink -f "$0" 2>/dev/null || echo "$0")
HB=luna://org.webosbrew.hbchannel.service/exec
AM=luna://com.webos.applicationManager/launch
TCH='A-Za-z0-9 .,:()+/&!?-'

clean() { printf '%s' "$1" | tr -cd "$2"; }
running() { [ -f "$P" ] && kill -0 "$(cat "$P")" 2>/dev/null; }
lock() {
	i=0
	until mkdir "$LK" 2>/dev/null; do
		i=$((i + 1))
		[ "$i" -gt 25 ] && rm -rf "$LK"          # lock orfano (processo ucciso a metà)
		usleep 200000 2>/dev/null || sleep 1
	done
}
unlock() { rmdir "$LK" 2>/dev/null; }
# filtra file $1 tenendo le righe per cui l'espressione awk $2 è vera (var n=now, id=$3)
keep() { [ -f "$1" ] || return 0; awk -F'|' -v n="$now" -v id="$3" "$2" "$1" > "$1.tmp" && mv -f "$1.tmp" "$1"; }
drop() { keep "$R" '$2 != id' "$1"; keep "$N" '$1 != id' "$1"; keep "$Z" '$1 != id' "$1"; }

notify() { # $1 t, $2 id, $3 appId, $4 titolo, $5 extra — già sanificati da add
	hm=$(date -d "@$1" +%H:%M 2>/dev/null)
	if [ "$1" -lt "$(date +%s)" ]; then msg="$4 e' iniziato${hm:+ alle $hm}"; else msg="$4 inizia${hm:+ alle $hm}"; fi
	if [ -f "$D/onclick_launch" ]; then
		b2="\"onclick\":\"$AM\",\"params\":{\"id\":\"$3\",\"params\":{\"reminderAction\":\"snooze\",\"reminder\":\"$2\"}}"
		b3="\"onclick\":\"$AM\",\"params\":{\"id\":\"$3\",\"params\":{\"reminderAction\":\"cancel\",\"reminder\":\"$2\"}}"
	else
		b2="\"onclick\":\"$HB\",\"params\":{\"command\":\"sh $SELF snooze $2 5\"}"
		b3="\"onclick\":\"$HB\",\"params\":{\"command\":\"sh $SELF del $2\"}"
	fi
	out=$(luna-send -n 1 -f luna://com.webos.notification/createAlert "{\"title\":\"Promemoria\",\"message\":\"$msg\",\"buttons\":[{\"label\":\"Guarda\",\"onclick\":\"$AM\",\"params\":{\"id\":\"$3\",\"params\":{\"reminder\":\"$2\",\"extra\":\"$5\"}}},{\"label\":\"Rimanda 5 min\",$b2},{\"label\":\"Annulla\",$b3}]}" 2>&1)
	echo "$out" | grep -q '"returnValue": *true' && return 0
	luna-send -n 1 luna://com.webos.notification/createToast "{\"message\":\"$msg\"}" >/dev/null 2>&1
}

tick() {
	[ -f "$R" ] || return 0
	now=$(date +%s)
	lead=$(cat "$D/lead_min" 2>/dev/null)
	case "$lead" in ''|*[!0-9]*) lead=10 ;; esac
	win=$((lead * 60))
	old=0
	while IFS='|' read -r t id app ti ex; do
		case "$t" in ''|*[!0-9]*) continue ;; esac
		d=$((t - now))
		[ "$d" -lt -10800 ] && { old=1; continue; }
		z=$(awk -F'|' -v id="$id" '$1 == id { print $2 }' "$Z" 2>/dev/null | head -n 1)
		if [ -n "$z" ]; then
			[ "$now" -ge "$z" ] || continue
			notify "$t" "$id" "$app" "$ti" "$ex"
			lock; keep "$Z" '$1 != id' "$id"; echo "$id|$t" >> "$N"; unlock
		elif [ "$d" -le "$win" ] && [ "$d" -ge -60 ] && ! grep -q "^$id|$t\$" "$N" 2>/dev/null; then
			notify "$t" "$id" "$app" "$ti" "$ex"
			lock; echo "$id|$t" >> "$N"; unlock
		fi
	done < "$R"
	if [ "$old" = 1 ]; then
		lock; keep "$R" '$1 ~ /^[0-9]+$/ && n - $1 <= 10800'; keep "$N" 'n - $2 <= 10800'; unlock
	fi
}

now=$(date +%s)
case "$1" in
	start)
		if running; then echo "gia attivo (pid $(cat "$P"))"; exit 0; fi
		mkdir -p "$D"
		nohup sh "$SELF" run </dev/null >/dev/null 2>&1 &
		echo $! > "$P"
		echo "avviato (pid $!)" ;;
	run)
		echo $$ > "$P"
		while :; do tick; sleep 30; done ;;
	stop)
		if running; then kill "$(cat "$P")"; echo "fermato"; else echo "non attivo"; fi
		rm -f "$P" ;;
	status)
		if running; then echo "attivo (pid $(cat "$P"))"; else echo "fermo"; fi
		echo "promemoria: $(grep -c '|' "$R" 2>/dev/null || echo 0)"
		running ;;
	once) tick ;;
	list) [ -f "$R" ] && grep '|' "$R"; exit 0 ;;
	add)
		t=$(clean "$2" '0-9'); id=$(clean "$3" 'A-Za-z0-9_-'); app=$(clean "$4" 'A-Za-z0-9._-')
		ti=$(clean "$5" "$TCH" | cut -c1-80); ex=$(clean "$6" 'A-Za-z0-9._:-')
		if [ -z "$t" ] || [ -z "$id" ] || [ -z "$app" ]; then echo "uso: add <epoch> <id> <appId> <titolo> [extra]"; exit 2; fi
		mkdir -p "$D"; lock; drop "$id"; echo "$t|$id|$app|$ti|$ex" >> "$R"; unlock; echo ok ;;
	del)
		id=$(clean "$2" 'A-Za-z0-9_-'); [ -n "$id" ] || exit 2
		lock; drop "$id"; unlock; echo ok ;;
	snooze)
		id=$(clean "$2" 'A-Za-z0-9_-'); m=$(clean "$3" '0-9'); [ -n "$id" ] || exit 2
		lock; keep "$Z" '$1 != id' "$id"; keep "$N" '$1 != id' "$id"; echo "$id|$((now + ${m:-5} * 60))" >> "$Z"; unlock; echo ok ;;
	lead)
		m=$(clean "$2" '0-9'); [ -n "$m" ] || exit 2
		mkdir -p "$D"; echo "$m" > "$D/lead_min"; echo ok ;;
	*) echo "uso: $0 start|stop|status|once|list|add <epoch> <id> <appId> <titolo> [extra]|del <id>|snooze <id> [min]|lead <min>"; exit 2 ;;
esac
