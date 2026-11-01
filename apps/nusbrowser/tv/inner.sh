#!/bin/sh
# Gira come PID 1 in namespace nuovi di rete, mount e PID: alla fine tmpfs e profilo spariscono da soli.
set -e
B=/media/developer/nusb
R=$B/root
echo 900 > /proc/self/oom_score_adj # con poca RAM muore prima il browser, non la TV
/sbin/ip link set lo up
mount -t proc proc "$R/proc"
mount -t tmpfs -o size=256m,mode=1777,nosuid,nodev tmpfs "$R/tmp"
mount -t tmpfs -o size=1m,mode=755,nosuid tmpfs "$R/dev"
mknod -m 666 "$R/dev/null" c 1 3
mknod -m 666 "$R/dev/zero" c 1 5
mknod -m 666 "$R/dev/urandom" c 1 9
mknod -m 666 "$R/dev/random" c 1 8
mkdir -m 1777 "$R/dev/shm"
mount -t tmpfs -o size=128m,nosuid,nodev tmpfs "$R/dev/shm"
# Solo il socket del compositor, non il resto di /tmp della TV.
mkdir -m 700 "$R/tmp/xdg"
chown 65534:65534 "$R/tmp/xdg"
touch "$R/tmp/xdg/wayland-0"
mount --bind /tmp/xdg/wayland-0 "$R/tmp/xdg/wayland-0"
/usr/bin/node "$B/forward.js" "$B/run/p.sock" &
# Node 8 impiega secondi ad avviarsi: il motore senza proxy pronto fallisce la prima pagina.
n=0
until grep -q ':22C3 ' "$R/proc/net/tcp"; do
  n=$((n+1)); [ "$n" -gt 30 ] && exit 1
  sleep 1 # BusyBox: niente decimali
done
# La sandbox interna di WPE (bwrap) non puo' girare sul kernel 4.4: l'isolamento e' questo script.
chroot "$R" /usr/bin/setpriv --reuid=65534 --regid=65534 --groups=505 --no-new-privs --bounding-set=-all --inh-caps=-all \
  /usr/bin/env -i HOME=/tmp LANG=it_IT.UTF-8 PATH=/usr/bin:/bin XDG_RUNTIME_DIR=/tmp/xdg WAYLAND_DISPLAY=wayland-0 \
  COG_PLATFORM_NAME=wl LIBGL_ALWAYS_SOFTWARE=1 APPID=org.nusbrowser.app WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 \
  COG_PLATFORM_WL_VIEW_WIDTH=1280 COG_PLATFORM_WL_VIEW_HEIGHT=720 LD_PRELOAD=/usr/local/lib/nusb-webos.so \
  /usr/bin/cog -P wl --proxy=http://127.0.0.1:8899 file:///usr/local/nusb/home.html &
wait $!
