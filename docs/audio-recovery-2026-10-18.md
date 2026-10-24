# Audioaktivierung und Wiederaufnahme

Ausgang: veröffentlichte Version 40, Commit `72dedc9006272241887ae10a1ed2003086e872e2`. Nutzer meldet vollständige Stille einschließlich Schaltern und Warntönen nach funktionierendem Displaystart.

## Nachgewiesene Befunde

Die Displaykorrektur änderte keine Audiodateien oder Maschinenklangbedingungen. Schalterklick und Lüfter wurden direkt von der veröffentlichten Website mit HTTP 200 heruntergeladen und als gültige MP3-/Ogg-Vorbis-Dateien erkannt. Das beweist ihre Erreichbarkeit, nicht die Wiedergabe im Nutzerbrowser.

Die bisherige Oberfläche initialisierte `muted=false`, ohne den tatsächlichen AudioContext-Zustand zu berücksichtigen. Der erste Lautsprecherklick führte erst `enable()` und danach blind einen Mute-Wechsel aus: Ein zuvor blockiertes oder noch nicht aktiviertes Audio konnte so direkt nach dem Freischalten stummgeschaltet werden. Fehler beim Aktivieren wurden ohne sichtbare Rückmeldung geschluckt. `enable()` behandelte nur `suspended`, nicht weitere nicht laufende Zustände wie `interrupted`. Ob diese Befunde den vollständigen Tonausfall auf dem Nutzergerät verursachten, ist ohne dessen Laufzeitdaten offen.

## Gezielte Lösung / Dateien

- `lib/machine-audio.ts`: optionaler Status-Callback für idle/active/muted/blocked/error. Status folgt dem bestehenden Audiokontext über `onstatechange`. `toggleSound()` aktiviert bei noch nicht laufendem Ton und gibt nach erfolgreicher Aktivierung einen kurzen vorhandenen Bestätigungston aus; nur bereits aktives, nicht stummes Audio wird stummgeschaltet. `enable()` versucht die Wiederaufnahme eines nicht laufenden, nicht geschlossenen Kontexts. Bewusstes Mute bleibt bei Wiederaufnahme erhalten. Bestehender Audiograph, Aufnahmen, Lautstärkemischung und Maschinenzustände bleiben erhalten. Callback wird beim Entsorgen entfernt.
- `app/cockpit.tsx`: Lautsprecher folgt dem tatsächlichen Audiostatus. Sichtbarer Aktivierungs-/Blockadehinweis statt vermeintlichem „Ton an“. Pointerup im 3D-Bereich ermöglicht eine erneute Aktivierung innerhalb einer Benutzerinteraktion, sofern nicht bewusst stummgeschaltet. Listener wird beim Entfernen der Oberfläche abgemeldet.
- `app/globals.css`: bestehende Audiohinweis-Klasse als bedienbare Schaltfläche, einschließlich kleiner Bildschirmbreiten.
- `tests/machine-audio.test.mjs`: Erstaktivierung, Bestätigungston, Mute/Unmute, Unterbrechung und fehlgeschlagene Wiederaufnahme mit anschließendem erneutem Versuch.

## Prüfungen / Grenzen

39/39 gezielte Audio-/Displaytests bestanden, keine übersprungen. Audiotests verwenden einen Web-Audio-Testdouble und prüfen Graph, Zustände, Wiedergabebefehle und Mute; sie sind keine Hörprobe. Produktionsbuild bestanden. Gesamtsuite: 147/149 bestanden, nur die bekannten Preview-Meta-/Scrollbar-Templateprüfungen schlagen fehl. Separater Typecheck meldet nur die drei bekannten fehlenden Cloudflare-Typen.

Interaktive Browser-/Web-Audio-Prüfung ist in dieser Umgebung nicht verfügbar. Ein als running gemeldeter AudioContext beweist keinen hörbaren Systemausgang. Stumme Browser-Tabs, Betriebssystem-Lautstärke und Ausgabegeräte können nicht erkannt oder verändert werden. Der Bestätigungston dient der gezielten Prüfung auf dem Nutzergerät. Keine zusätzlichen Aufnahmen, Bibliotheken oder Renderpässe.

## Sicherung und Wiederherstellung

Vor allen Projektänderungen wurde der vollständige Projektordner gesichert und das Archiv per `tar -dzf` ohne Unterschiede gegen den Ausgangsordner geprüft:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_audio_recovery_2026-10-18.tar.gz`

SHA-256: `7c78bd7d59e89605415eed3c5e442920312bf527e7d2b3411aac401abcf669cf`.

Zur lokalen Wiederherstellung in einen neuen leeren Ordner entpacken. Online kann die unveränderte Version 40 erneut veröffentlicht werden: `appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_a39820c918a88191b588062c6f6d1fe5`.
