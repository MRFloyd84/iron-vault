# Änderungen in Version 70.1 – Neustart nach Grafikkartenwechsel

- Nach dem Wechsel der Grafikkarte im Grafikmenü startete das AppImage beim Klick auf
  „Neu starten“ nicht wieder, sondern meldete „Cannot mount AppImage, please check your
  FUSE setup“.
- Der Neustart startet jetzt die AppImage-Datei selbst als neuen Prozess, so wie es auch
  das automatische Update tut. Der alte Einhängepunkt wird dabei sauber freigegeben.
- Die gewählte Grafikkarte war schon vorher gespeichert: Wer die Meldung gesehen hat,
  startet das Spiel einfach normal neu.
