#!/bin/sh
# volosd: restyled volume OSD via bind mounts over compositor QML. usage: volosd.sh on|off|status [norestart]
D=/media/developer/volosd
Q=/usr/lib/qml/WebOSCompositor/views/volume
FILES="StarfishVolume.qml StarfishVolumeMute.qml"
restart() {
  [ "$1" = norestart ] && return 0
  systemctl restart surface-manager-daemon.service
}
mounted() { grep -q " $Q/$1 " /proc/mounts; }
case "$1" in
on)
  for f in $FILES; do
    [ -s "$D/new/$f" ] || { echo "missing $D/new/$f"; exit 1; }
    mounted $f || mount --bind "$D/new/$f" "$Q/$f"
  done
  restart "$2" ;;
off)
  for f in $FILES; do while mounted $f; do umount "$Q/$f" || break; done; done
  restart "$2" ;;
status)
  for f in $FILES; do mounted $f && echo "$f: on" || echo "$f: off"; done ;;
*) echo "usage: $0 on|off|status [norestart]"; exit 1 ;;
esac
