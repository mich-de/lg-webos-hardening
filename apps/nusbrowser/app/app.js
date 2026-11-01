'use strict';
// Avvia il motore WPE nativo sopra questa finestra. Lo ferma il watchdog di start.sh quando si cambia app.
(function () {
  var EXEC = 'luna://org.webosbrew.hbchannel.service/exec';
  var bridges = [];

  function exec(command) {
    if (typeof window.PalmServiceBridge !== 'function') return;
    var b = new window.PalmServiceBridge();
    bridges.push(b); // un bridge senza riferimenti puo' sparire prima della risposta
    b.onservicecallback = function () { bridges.splice(bridges.indexOf(b), 1); };
    b.call(EXEC, JSON.stringify({ command: command }));
  }

  var start = function () { exec('setsid sh /media/developer/nusb/start.sh >/dev/null 2>&1 &'); };
  var stop = function () { exec('pkill -f /media/developer/nusb/ns.py'); };

  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 461) { stop(); window.close(); }
  });
  window.addEventListener('unload', stop);
  if (!document.hidden) start();
})();
