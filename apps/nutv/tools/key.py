# Tasto finto via /dev/uinput (percorso input reale, come il telecomando). Uso: python key.py <linux_keycode> [ripetizioni]
# 402 KEY_CHANNELUP, 403 KEY_CHANNELDOWN, 115 KEY_VOLUMEUP, 114 KEY_VOLUMEDOWN, 113 KEY_MUTE
import os, sys, struct, fcntl, time
code = int(sys.argv[1]); n = int(sys.argv[2]) if len(sys.argv) > 2 else 1
fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
fcntl.ioctl(fd, 0x40045564, 1)          # UI_SET_EVBIT EV_KEY
fcntl.ioctl(fd, 0x40045565, code)       # UI_SET_KEYBIT
dev = struct.pack('80sHHHHi', b'nutv-test-key', 3, 1, 1, 1, 0) + b'\0' * (64 * 4 * 4)
os.write(fd, dev)
fcntl.ioctl(fd, 0x5501)                 # UI_DEV_CREATE
time.sleep(1.5)                          # lascio che il sistema registri il device
def ev(t, c, v): os.write(fd, struct.pack('llHHi', 0, 0, t, c, v))
for i in range(n):
    ev(1, code, 1); ev(0, 0, 0); time.sleep(0.08); ev(1, code, 0); ev(0, 0, 0); time.sleep(1.0)
time.sleep(0.5)
fcntl.ioctl(fd, 0x5502)                 # UI_DEV_DESTROY
os.close(fd)
print('ok', code, n)
