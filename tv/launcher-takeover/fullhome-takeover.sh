#!/bin/sh
# fullhome takeover: mounts the shim over com.webos.app.fullhome (webOS 5.6's Home/Back app)
# All the logic lives in takeover.sh; this run only differs by APP_DIR/STAGE/SHIM_ID/LINK.
APP_DIR=/usr/palm/applications/com.webos.app.fullhome
STAGE=/media/developer/launcher-takeover/stage-fh
SHIM_ID=com.webos.app.fullhome
LINK=/var/lib/webosbrew/init.d/46-fullhome-takeover
export APP_DIR STAGE SHIM_ID LINK
exec sh /media/developer/launcher-takeover/takeover.sh "$@"
