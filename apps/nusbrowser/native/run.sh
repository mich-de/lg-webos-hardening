#!/bin/sh
# App nativa: una sola finestra, quella del motore. Il processo resta vivo finche' il sistema tiene aperta l'app.
luna-send -n 1 -a org.nusbrowser.app luna://org.webosbrew.hbchannel.service/exec '{"command":"setsid sh /media/developer/nusb/start.sh >/dev/null 2>&1 &"}'
while :; do sleep 5; done
