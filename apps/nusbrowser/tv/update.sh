#!/bin/sh
# Aggiornamenti di sicurezza da Debian: apt verifica le firme GPG. Pacchetti e indici su tmpfs.
set -e
B=/media/developer/nusb
R=$B/root
C=/tmp/nusb-apt

FREE=$(df -m /media/developer | tail -1 | awk '{print $(NF-2)}')
[ "$FREE" -ge 200 ] || { echo "SPAZIO INSUFFICIENTE: $FREE MB"; exit 1; }

cleanup() {
  umount "$R/var/cache/apt/archives" 2>/dev/null || true
  umount "$R/var/lib/apt/lists" 2>/dev/null || true
  umount "$R/tmp" 2>/dev/null || true
  umount "$R/dev" 2>/dev/null || true
  umount "$R/proc" 2>/dev/null || true
  rm -rf "$C"
}
trap cleanup EXIT

cp /etc/resolv.conf "$R/etc/resolv.conf"
mkdir -p "$C/archives/partial" "$C/lists/partial"
mount -t proc proc "$R/proc"
mount --bind /dev "$R/dev"
mount --bind /tmp "$R/tmp"
mount --bind "$C/archives" "$R/var/cache/apt/archives"
mount --bind "$C/lists" "$R/var/lib/apt/lists"
export DEBIAN_FRONTEND=noninteractive PATH=/usr/sbin:/usr/bin:/sbin:/bin HOME=/root LANG=C
chroot "$R" apt-get update
chroot "$R" apt-get upgrade -y --no-install-recommends
touch "$B/updated.stamp"
ls -la "$R/usr/bin/cog"
