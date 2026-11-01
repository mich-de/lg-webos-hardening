#!/bin/sh
# Lanciato dall'app quando si apre, via Homebrew Channel. Finisce quando il motore si chiude: nulla resta in esecuzione.
B=/media/developer/nusb
pgrep -f "$B/ns.py" >/dev/null && exit 0
mkdir -p "$B/run"
chown 99:99 "$B/run"
chmod 700 "$B/run"
cd "$B" || exit 1
[ "$(wc -c < host.log 2>/dev/null || echo 0)" -gt 200000 ] && : > host.log
{
  /usr/bin/node proxy.js "$B/run/p.sock" $$ &
  sleep 1
  # La finestra del motore nasconde quella WAM della stessa app: conta solo il primo piano reale.
  (
    sleep 15; miss=0
    while pgrep -f "$B/ns.py" >/dev/null; do
      if luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}' | grep -q '"org.nusbrowser.app"'; then miss=0; else miss=$((miss+1)); fi
      [ "$miss" -ge 2 ] && pkill -f "$B/ns.py"
      sleep 3
    done
  ) &
  /usr/bin/python "$B/ns.py" "$B/inner.sh"
  echo "motore chiuso, codice $?"
  # Aggiornamenti di sicurezza a browser chiuso, al massimo una volta a settimana.
  if [ -z "$(find "$B/updated.stamp" -mtime -7 2>/dev/null)" ]; then sh "$B/update.sh"; fi
} >> host.log 2>&1
