# Python 2.7 della TV. Crea i namespace di rete, mount e PID: la unshare di Debian vuole pidfd_open (kernel >= 5.3).
import ctypes
import os
import signal
import sys

CLONE_NEWNS, CLONE_NEWPID, CLONE_NEWNET = 0x00020000, 0x20000000, 0x40000000
MS_REC, MS_PRIVATE = 16384, 1 << 18
PR_SET_PDEATHSIG = 1

libc = ctypes.CDLL('libc.so.6', use_errno=True)
if libc.unshare(CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWNET) != 0:
    sys.exit('unshare fallita: %d' % ctypes.get_errno())
if libc.mount('none', '/', None, MS_REC | MS_PRIVATE, None) != 0:
    sys.exit('mount privato fallito: %d' % ctypes.get_errno())

pid = os.fork()
if pid == 0:
    libc.prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0)
    os.execv('/bin/sh', ['/bin/sh'] + sys.argv[1:])

# Morto il PID 1 del namespace, il kernel uccide tutti i processi al suo interno.
signal.signal(signal.SIGTERM, lambda *a: os.kill(pid, signal.SIGKILL))
while True:
    try:
        _, status = os.waitpid(pid, 0)
        break
    except OSError:
        pass
sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1)
