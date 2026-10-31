#!/bin/sh
# NusGuide cache EPG (root sulla TV, loop ogni 15 min) nella cartella cache/ dell'app:
#  - Rai: un JSON per canale per giorno (oggi+domani)            -> cache/<slug>-<gg-mm-aaaa>.json
#  - Sky gtv (CORS bloccato per la webview): UNA richiesta per tutti i canali Sky, env=DTT,
#    finestra UTC 49 h da mezzanotte (copre oggi+domani)          -> cache/sky-dtt-<gg-mm-aaaa>.json
APP=/media/developer/apps/usr/palm/applications/org.nusguide.app
RAI="rai-1 rai-2 rai-3 rai-4 rai-5 rai-movie rai-premium rai-gulp rai-yoyo rai-news-24 rai-storia rai-sport"
# id Sky DTT: La7, TV8, Cielo, TV2000, La7 Cinema, Super!, Sky TG24, TGCom24 (stessi id di FALLBACK_CHANNELS in main.js)
SKY="8329 8327 8773 8325 6624 8314 9313 10473"
echo "[nusepg] start $(date)" >> /tmp/nusepg.log
while true; do
  C=$APP/cache
  mkdir -p $C   # la reinstallazione dell'ipk cancella la cartella
  D1=$(date +%d-%m-%Y)
  D2=$(date -d @$(( $(date +%s) + 86400 )) +%d-%m-%Y)
  for S in $RAI; do
    for D in $D1 $D2; do
      wget -q -T 20 -O $C/$S-$D.json.tmp "https://guidatv.rai.it/palinsesto/app/$S/$D.json" && mv $C/$S-$D.json.tmp $C/$S-$D.json
    done
  done
  # mezzanotte UTC di oggi - 1 h = mezzanotte locale CET; +49 h (limite API ~49-50 h)
  T0=$(( $(date +%s) / 86400 * 86400 - 3600 ))
  U="https://apid.sky.it/gtv/v1/events?from=$(date -u -d @$T0 +%Y-%m-%dT%H:%M:%SZ)&to=$(date -u -d @$(( T0 + 176400 )) +%Y-%m-%dT%H:%M:%SZ)&pageSize=999&pageNum=0&env=DTT"
  for I in $SKY; do U="$U&channels=$I"; done
  wget -q -T 30 -O $C/sky-dtt-$D1.json.tmp "$U" && mv $C/sky-dtt-$D1.json.tmp $C/sky-dtt-$D1.json
  rm -f $C/*.tmp
  find $C -name '*.json' -mtime +1 -exec rm -f {} \;   # via i giorni passati
  # NuTV non può leggere file:// fuori dalla propria cartella app: copia la cache anche lì
  NT=/media/developer/apps/usr/palm/applications/org.nutv.app
  [ -d $NT ] && mkdir -p $NT/cache && rm -f $NT/cache/*.json && cp -f $C/*.json $NT/cache/
  echo "[nusepg] cycle done $(date)" >> /tmp/nusepg.log
  sleep 900
done
