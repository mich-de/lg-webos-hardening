#!/bin/sh
# Rimuove tutto. Non cancella se qualcosa è ancora montato dentro la cartella: /dev e /proc veri.
B=/media/developer/nusb
pkill -f "$B/ns.py"
sleep 2
for m in var/cache/apt/archives var/lib/apt/lists tmp dev proc; do umount "$B/root/$m" 2>/dev/null; done
if mount | grep -q "$B"; then
  echo "MONTAGGI ATTIVI, NON CANCELLO:"; mount | grep "$B"; exit 1
fi
rm -rf "$B"
luna-send -n 1 luna://com.webos.appInstallService/remove '{"id":"org.nusbrowser.app"}'
echo RIMOSSO
