# Untersuchung des vollständigen Audiopfads nach Display-Update

## Ergebnis und Abgrenzung

Ausgang: veröffentlichte Version 41, Commit `a0a6d958fdcd88d594cba749e7f1a7bbf61b39d0`. Vergleich mit Version 38 vor dem Displayboot, Commit `7b16f505746d0e539ce3fd566bb730ea2ea8a1f2` (kurz `7b16f50`). Nutzer meldet vollständige Stille, auch bei Schaltern und Bestätigungston. „Ton aktivieren“ verschwindet nach Klick, Tab ist laut Nutzer nicht stummgeschaltet, keine roten Konsolenfehler.

Es ist **keine konkrete Ursache des vollständigen Tonausfalls auf dem Nutzergerät nachgewiesen**. Die vorherige Reparatur der Aktivierungsbedienung hat diesen Ausfall laut Nutzer nicht behoben. Ein laufender AudioContext beweist keine hörbare Ausgabe. Die bisherige Prüfung darf deshalb nicht als erfolgreiche Tonwiederherstellung gelten.

Geprüft wurden sämtliche Audio-Module, ihre Aufrufe und Lebenszyklen in der Oberfläche, der vollständige Versionsunterschied seit vor dem Displayboot, die geänderten Rendering-/Touchpfade, Maschinenzustände und Versorgung als Audioeingaben, Assetpfade, Build-/Workerkonfiguration sowie alle 18 tatsächlich verwendeten Audioaufnahmen. Dies ist ein Audioregressionsaudit, keine erneute vollständige Abnahme aller Mech-Funktionen.

## Nachweise

1. Alle 18 verwendeten Audiodateien sind seit `7b16f50` unverändert. Alle wurden lokal mit FFmpeg vollständig ohne Decoderfehler gelesen. Alle 18 öffentlichen URLs lieferten bei der Prüfung mit curl HTTP 200 und bytegleich den jeweiligen Quellbestand (SHA-256-Vergleich). Eine erste andere HTTP-Client-Prüfung wurde mit 403 abgewiesen; das belegt einen clientabhängigen Zugriffsunterschied, nicht einen 403 im Nutzerbrowser. Die nachfolgende vollständige curl-Prüfung bestand.
2. Das Displayboot-Update `37b85c8` und die Batteriekorrektur `72dedc9` änderten weder `machine-audio.ts`, `machine-effects.ts`, `service-audio.ts`, `step-audio.ts`, `audio-mix.ts` noch die Audio-Assets oder Maschinenlogik. Der Audio-Status-/Aktivierungsumbau kam anschließend mit `a0a6d95`.
3. Ein ausgeführter Vergleich der alten und aktuellen `MachineAudio`-Implementierung mit identischen Eingaben ergibt in **15 Zustandsaufnahmen identische Audioansteuerung**: kalt, BAT 1, BAT 2, APU-Start/Betrieb, Startstufen 1/2/4/5/6, Last/Gehen/Gelenke, Druckentlastung, Mute/Unmute und Abschalten. Verglichen wurden Master-/Lüfter-/Brummpegel, Aufnahmen, Loopflags, Wiedergaberaten, Stopbefehle und Oszillatorfrequenzen. Die Zustände sind Testeingaben, keine im Nutzerbrowser gefahrene Startsequenz.
4. Dieser Vergleich sowie die Audiotests verwenden ein Web-Audio-Testdouble. Sie beweisen Ansteuerung und Verknüpfung, **keine tatsächlich gerenderten Audiowellen oder Hörbarkeit**. FFmpeg ist ebenfalls kein Ersatz für den Decoder des Zielbrowsers.

## Prüfung der Verknüpfungen

| Pfad / Funktionen | Befund |
|---|---|
| `app/cockpit.tsx`: `operate.current`, `sendJoint`, `apply`, Timer | Physische Schalter und Tastatur lösen weiterhin Audioaktivierung und bestehende Tonaufrufe aus. Die Zustandsaktualisierung ruft `MachineAudio.update()` auf; React-Zustandsoptimierung entfernt diesen Aufruf nicht. |
| `lib/cockpit-scene.ts`: `down`, `target`, `cameraAction`, `animate` | Displayboot sperrt markierte Touchflächen. Physische Schalter und ihre IDs bleiben vorhanden. Der Renderingloop besitzt keine Audio-Stummschaltung und verändert keine Audiozustände. Nur BAT 1 kann Displays starten; laufende Displays implizieren keine laufende APU oder Hauptantrieb. |
| `lib/machine-audio.ts`: `enable`, `update` | Gemeinsamer Master ist mit `AudioContext.destination` verbunden. Lüfter, Antrieb und Brummton führen auf diesen Master. Lüfter bleibt vor Startstufe 1 aus, Hauptantrieb bis Reaktorstart; dies war schon vor dem Displayupdate so. |
| `MachineAudio.playSwitch`, `playAirRelease`, `beep` | Schalteraufnahme und synthetischer Bestätigungston benötigen keine Hauptstromstufe. Fehlender Hauptstrom erklärt deren vollständige Stille nicht. |
| `lib/machine-effects.ts`: `MachineEffects.update`, `EffectChannel.set/stop/dispose` | APU und Gyro folgen bestehenden Phasen, nicht der Displayphase. Späte Decodergebnisse werden gegen abgebrochene Starts abgesichert. Alle Effektkanäle führen auf den gemeinsamen Master. |
| `lib/service-audio.ts`: `contacts`, `ServiceAudio.update` | Batterie-/Generatorschütze, Pumpen, Warnungen, Kalibrierung, Parkverriegelung und Tor folgen technischen Zuständen. Quittieren repariert keine Störung. Kein Displayboot-Filter. |
| `lib/step-audio.ts`: `StepAudio.update` | Schritte folgen Stützwechseln. Keine Schritte im Stillstand; keine nachgeholten Schritte nach Audio-Unterbrechung. Gemeinsamer Master und begrenzte überlappende Stimmen. |
| `lib/audio-mix.ts`: `AUDIO_LEVELS`, `ambientGain` | Bestehende Pegel unverändert. Warnung/Kalibrierung reduzieren Hintergrund auf 50 %, nicht auf null. Keine displayabhängige Stummschaltung. |
| `app/cockpit.tsx` / `MachineAudio.dispose` | Audio wird bei Entfernung der Oberfläche geschlossen. Statusänderungen allein sind keine Effektabhängigkeit und initialisieren die Oberfläche nicht neu. Keine nachgewiesene durch Displayboot verursachte Schließung. |
| `worker/index.ts`, `vite.config.ts`, `build/sites-vite-plugin.ts`, Buildskripte | Keine seit dem Displayupdate hinzugekommene Audio-/Autoplay-Sperre im Projektcode. Externe Hosting-/Browserrichtlinien können ohne Zielbrowserdaten nicht abgenommen werden. |

## Nachgewiesene Schwächen und gezielte Änderungen

### Hoch: stille, dauerhaft gespeicherte Ladefehler

Vorher wandelten die Preloader und Decoder Fehler in `null` um. Die einmaligen Ladepromises blieben danach ohne Ton; erneutes Schalterbetätigen wiederholte den Download nicht. Deshalb schließen fehlende rote Fehler Audiofehler ausdrücklich nicht aus.

`lib/audio-assets.ts` ergänzt einen gemeinsamen kleinen Lade-/Decoderhelfer: ein begrenzter Wiederholungsversuch nach fehlgeschlagenem Abruf, beim zweiten Versuch mit Cache-Neuladen. Leere Dateien werden erkannt. Dauerhafte Lade- und Decoderfehler werden mit Dateinamen als Warnung und in einem auslesbaren Fehlerregister erfasst. Erfolgreiche Aufrufe löschen den jeweiligen alten Fehler. Kein dauernder Wiederholungsloop.

Die vorhandenen Preloader in `machine-audio.ts`, `machine-effects.ts`, `service-audio.ts` und `step-audio.ts` verwenden den Helfer. Dateinamen, Tonaufnahmen, Wiedergabebedingungen, Kanäle und Lautstärken bleiben erhalten. Das korrigiert einen reproduzierbaren Fehlerbehandlungsmangel, belegt aber nicht, dass dieser auf dem Nutzergerät auftrat. Ein dauerhaft fehlgeschlagener Decoder wird durch den normalen Klangpfad weiterhin nicht endlos neu versucht; Fehler werden nun sichtbar und der manuelle Codec-Test prüft erneut.

### Hoch: Status „läuft“ ohne Signalnachweis

Die bisherige Statusanzeige unterscheidet aktiv/blockiert/stumm, misst aber keinen Signalpegel. Der Status ist damit keine Audioabnahme.

`lib/audio-diagnostics.ts` ergänzt eine ausschließlich manuell gestartete Prüfung des bestehenden Audiokontexts und Masterbusses. Ein 660-Hz-Prüfton läuft ungefähr eine Sekunde über denselben Master; ein temporärer Analyser misst das Signal dahinter. Erfasst werden Audiozustand, Fortschritt der Audio-Uhr, Masterpegel, Mute und Signalspitze. Die normalen Verbindungen bleiben bestehen; Testknoten und nur die zusätzliche Messverbindung werden auch bei Abbruch entfernt. Eine bewusste Stummschaltung wird nicht aufgehoben. Kein zweiter Audiokontext und keine permanente Messlast.

Die Prüfung lädt zusätzlich eine bestehende MP3- und eine Ogg-Aufnahme und prüft deren Decodergebnis im Zielbrowser. Dieser Teil hat ein Zeitlimit von acht Sekunden pro Probe. Fehler anderer tatsächlich verwendeter Audiodateien sind im Fehlerregister enthalten. „Signal erkannt“ belegt nur den internen Pegel vor dem Systemausgang.

`app/audio-check.tsx`, Einbindung in `app/cockpit.tsx` und Ergänzungen in `app/globals.css`: Schaltfläche AUDIOPRÜFUNG, Prüfergebnis als kopierbarer Text und nativer Browserplayer mit vorhandener MP3-Druckluftaufnahme als unabhängigem Vergleichspfad. Keine ersetzte Cockpitsteuerung oder Startlogik. Der Browserplayer hat eigene Lautstärke-/Playkontrollen und dient ausschließlich der Fehlereingrenzung.

### Mittel: Ogg-Direktlink ist als Nutzertest ungeeignet

Der Server liefert Ogg-Aufnahmen teils als `application/octet-stream`; direkte Navigation kann deshalb einen Download öffnen. Das erklärt den beobachteten Download. `fetch()` plus `decodeAudioData()` liest Audiodaten unabhängig von diesem Navigationseffekt; der Download ist kein Nachweis der Ursache für stumme Web-Audio-Wiedergabe. Der neue Vergleichstest verwendet einen eingebetteten MP3-Player statt eines Ogg-Downloadlinks. Keine globale Serverkonfiguration auf Verdacht geändert.

## Prüfungen

- 45/45 gezielte Tests bestanden, keine übersprungen: sämtliche vorhandenen Audio-Tests, Displayboot, HTTP-Wiederholung, Dateifehler, Decoderfehler, stiller Messkanal, Uhrfortschritt und Aufräumen bei Abbruch.
- 15/15 historische Zustandsaufnahmen mit identischer Audioansteuerung vor/nach dem Displayupdate.
- Produktionsbuild bestanden. Gesamtsuite: 153/155 bestanden, nur die bekannten Preview-Meta-/Scrollbar-Templateprüfungen schlagen fehl. Typecheck: weiterhin ausschließlich die drei bekannten fehlenden Cloudflare-Typen.
- Keine interaktive WebGL-/Web-Audio-Hörprobe verfügbar. Kein behaupteter erfolgreicher Ton auf dem Nutzergerät.

Reproduzierbare Befehle aus dem Projektordner:

```sh
node --experimental-strip-types --loader ./tests/ts-loader.mjs scripts/audit-audio-baseline.mjs
node --experimental-strip-types --loader ./tests/ts-loader.mjs --test tests/audio-assets.test.mjs tests/audio-diagnostics.test.mjs tests/machine-audio.test.mjs tests/service-audio.test.mjs tests/machine-effects.test.mjs tests/step-audio.test.mjs tests/display-boot.test.mjs
git diff 7b16f50..HEAD -- public/audio lib/audio-mix.ts
```

`scripts/audit-audio-baseline.mjs` benötigt die vorhandene Git-Historie. Optional nimmt es als einziges Argument einen Ausgabeweg für den JSON-Vergleich an. Es erzeugt den alten Code nur in einem temporären Ordner und entfernt ihn nach dem Import.

Nächster notwendiger Nachweis auf dem Zielgerät: AUDIOPRÜFUNG öffnen, Prüfton starten und das angezeigte Ergebnis auslesen. Falls intern Signal und Uhrfortschritt vorliegen, aber weder Prüfton noch nativer Player hörbar sind, ist die Ausgabe nach dem gemessenen Bus weiter zu prüfen. Diese Diagnose wird nicht vorweggenommen.

## Sicherung und Wiederherstellung

Vor sämtlichen Änderungen dieses Änderungssatzes vollständiges Archiv des Projektordners erstellt und mit `tar -dzf` ohne Unterschiede gegen den Ausgangsordner geprüft:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_audio_audit_2026-10-18.tar.gz`

SHA-256: `5342a8e53579df28c7ee11dc8782b9ec56e2160b3b13773686b68bc5f38547ad`.

Lokal in einen neuen leeren Ordner entpacken. Online ist Version 41 als Rückkehrstand erhalten: `appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_d4ceacd205848191a3a2317d526b7723`.
