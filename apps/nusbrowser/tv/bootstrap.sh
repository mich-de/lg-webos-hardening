#!/bin/sh
# Installazione sulla TV: base Debian armhf ufficiale (SHA256) + WPE WebKit da apt (firme GPG). Pacchetti su tmpfs.
# Si annulla con: sh /media/developer/nusb/uninstall.sh
B=/media/developer/nusb; R=$B/root; C=/tmp/nusb-apt
LAYER=sha256:2040c133c8745155688a29a07cc3f1868977ae5f2844eb1893b054c5667a82b7
HEX=${LAYER#sha256:}; TMP=/tmp/nusb-layer.tgz
TRIPLET=arm-linux-gnueabihf
cleanup() { for m in var/cache/apt/archives var/lib/apt/lists tmp dev proc; do umount "$R/$m" 2>/dev/null; done; rm -rf "$C" "$TMP"; }
trap cleanup EXIT
for m in var/cache/apt/archives var/lib/apt/lists sys tmp dev proc; do umount "$R/$m" 2>/dev/null; done
if mount | grep -q "$R"; then echo "MONTAGGI ATTIVI, NON CANCELLO"; mount | grep "$R"; echo BOOT_END; exit 1; fi
rm -rf "$R"; mkdir -p "$R"
FREE=$(df -m /media/developer | tail -1 | awk '{print $(NF-2)}')
[ "$FREE" -ge 650 ] || { echo "SPAZIO INSUFFICIENTE: $FREE MB"; echo BOOT_END; exit 1; }
U='https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/debian:pull'
T=$(curl -s "$U" | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -sL -H "Authorization: Bearer $T" -o "$TMP" "https://registry-1.docker.io/v2/library/debian/blobs/$LAYER"
echo "$HEX  $TMP" | sha256sum -c - || { echo BOOT_END; exit 1; }
tar xzf "$TMP" -C "$R"; rm -f "$TMP"
cp /etc/resolv.conf "$R/etc/resolv.conf"
mkdir -p "$R/etc/dpkg/dpkg.cfg.d" "$C/archives/partial" "$C/lists/partial" "$R/var/cache/apt/archives" "$R/var/lib/apt/lists"
printf 'path-exclude=/usr/share/doc/*\npath-exclude=/usr/share/man/*\npath-exclude=/usr/share/info/*\npath-exclude=/usr/share/locale/*\n' > "$R/etc/dpkg/dpkg.cfg.d/99nusb"
mount -t proc proc "$R/proc"; mount --bind /dev "$R/dev"; mount --bind /tmp "$R/tmp"
mount --bind "$C/archives" "$R/var/cache/apt/archives"; mount --bind "$C/lists" "$R/var/lib/apt/lists"
export DEBIAN_FRONTEND=noninteractive PATH=/usr/sbin:/usr/bin:/sbin:/bin HOME=/root LANG=C
chroot "$R" apt-get update 2>&1 | tail -1 | cut -c1-80
chroot "$R" apt-get install -y --no-install-recommends cog ca-certificates fonts-dejavu-core libgles2 libegl1 libegl-mesa0 libgl1-mesa-dri gcc libc6-dev 2>&1 | tail -1 | cut -c1-100
cp "$B/webos-shim.c" "$R/tmp/webos-shim.c"
chroot "$R" gcc -O2 -Wall -shared -fPIC -o /usr/local/lib/nusb-webos.so /tmp/webos-shim.c /usr/lib/$TRIPLET/libwayland-client.so.0 -ldl 2>&1 | head -8 | cut -c1-130
ls -la "$R/usr/local/lib/nusb-webos.so" | cut -c1-70
chroot "$R" apt-get purge -y --auto-remove gcc libc6-dev 2>&1 | tail -1 | cut -c1-70
touch "$B/updated.stamp"
df -m /media/developer | tail -1
ls "$R/usr/bin/cog" "$R/usr/lib/$TRIPLET/libGLESv2.so.2" | wc -l
echo BOOT_END
