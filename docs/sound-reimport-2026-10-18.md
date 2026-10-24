# Erneute Übernahme der 18 hochgeladenen Sounds

Ausgang: veröffentlichte Version 42, Commit `1b58ecc435dffff7d0f4ca5718990d7d6cefe353`. Auftrag: alle hochgeladenen Sounds wieder mit ihrem ursprünglichen Einsatz übernehmen. Keine Klangbearbeitung, Normalisierung, Codec-Konvertierung oder neue Soundengine.

## Eingaben und Ergebnis

Alle 18 Uploads wurden lokal gelesen und mit den bisherigen Dateien verglichen: sie sind jeweils bytegleich. Die Dateien wurden erneut aus `upload/` nach `public/audio/` kopiert und anschließend einzeln per SHA-256 gegen den Upload geprüft. Deshalb ist kein inhaltlicher Git-Unterschied der Audiodateien zu erwarten. Es wurden keine neuen Aufnahmen erfunden oder die Sounds künstlich lauter gemacht.

| Datei in `public/audio/` | Ursprünglicher Einsatz / bestehender Aufrufer |
|---|---|
| `switch-flip.mp3` | Schalterbedienung, `MachineAudio.playSwitch()` |
| `air-release.mp3` | Druckentlastung / Verriegelungsbewegung, `MachineAudio.playAirRelease()` / `update()` |
| `industrial-fan-loop.ogg` | Kabinenlüfter, `MachineAudio.update()` |
| `main-drive-loop.ogg` | Hauptantrieb / Belastung / Gelenke, `MachineAudio.update()` |
| `mech-step.ogg` | Stützwechsel beim Gehen, `StepAudio.update()` |
| `apu-start.ogg` | APU-Anlauf, `MachineEffects.update()` |
| `apu-running-loop.ogg` | APU-Betrieb, `MachineEffects.update()` |
| `apu-shutdown.ogg` | APU-Abstellen, `MachineEffects.update()` |
| `systems-power-down.ogg` | Hauptsysteme herunterfahren, `MachineEffects.update()` |
| `gyro-running-loop.ogg` | Gyro / Stabilisierung, `MachineEffects.update()` |
| `coolant-pump-loop.ogg` | Kühlmittelpumpen A/B, `ServiceAudio.update()` |
| `contactor-on.ogg` | Versorgungsschütz einschalten, `ServiceAudio.update()` |
| `contactor-off.ogg` | Versorgungsschütz ausschalten, `ServiceAudio.update()` |
| `service-warning-loop.ogg` | Nicht quittierte Systemwarnung, `ServiceAudio.update()` |
| `coolant-leak-loop.ogg` | Aktiver Kühlmittelverlust, `ServiceAudio.update()` |
| `neuro-calibration-loop.ogg` | Neurohelm-Kalibrierung, `ServiceAudio.update()` |
| `parking-lock-latch.ogg` | Abgeschlossener Verriegelungsweg, `ServiceAudio.update()` |
| `hangar-door-loop.ogg` | Laufender Hangartorantrieb, `ServiceAudio.update()` |

## Gezielt geänderte Dateien

- `lib/audio-assets.ts`: `audioUrl()` versieht Audioabrufe mit `?v=reimport-20261018`. `loadAudio()` verwendet diese URL. Das löst einen frischen Abruf gegenüber den vorherigen URLs aus und erlaubt anschließend normales Caching. Der vorhandene einmalige Wiederholungsversuch bleibt erhalten. Kein dauerhaftes Abschalten des Browsercaches.
- `app/audio-check.tsx`: der vorhandene Vergleichsplayer verwendet dieselbe neue URL-Funktion.
- `tests/audio-assets.test.mjs`, `tests/machine-audio.test.mjs`: Versionskennung, unveränderte Dateipfade, begrenzter Wiederholungsversuch und alle 18 tatsächlich vorab geladenen Sounds geprüft. Der Audio-Testdouble identifiziert Dateien über den URL-Pfad, so wie tatsächliche Audiodaten vom Queryparameter unabhängig sind.
- `scripts/audit-audio-baseline.mjs`: URL-Pfadnormalisierung im Testdouble, damit ein anderer Cacheparameter nicht als andere Tonaufnahme gewertet wird.

Auslöser, ursprüngliche Lautstärken, vorhandener Audiograph, Mute, Displayboot und sämtliche technischen Maschinenzustände bleiben erhalten. Ein Rollback des Displayupdates oder eine zweite Tonsteuerung erfolgte nicht.

## Prüfungen / Einschränkungen

46/46 gezielte Audio-/Displaytests bestanden, keine übersprungen. Alle 15 historischen Audio-Zustandsaufnahmen weiterhin identisch mit dem Stand vor dem Displayupdate. Produktionsbuild bestanden, `git diff --check` bestanden. Die versionierte APU-Audio-URL lieferte HTTP 200 und bytegleich die Projektdatei.

Die vollständige Suite wurde für diese begrenzte Änderung nicht erneut ausgeführt; beim vorherigen Lauf waren ausschließlich zwei bekannte Templateprüfungen fehlgeschlagen. Keine interaktive Browser-Hörprobe verfügbar. Die vorangegangene Nutzerdiagnose hatte ein internes Audiosignal, erfolgreiche MP3-/Ogg-Decodierung und keine erfassten Assetfehler gezeigt; auch der native Player blieb laut Nutzer stumm. Daher ist ausdrücklich **nicht nachgewiesen, dass dieser Neuimport die fehlende hörbare Ausgabe behebt**. Er stellt die hochgeladenen Originalaufnahmen samt ihren ursprünglichen Zuordnungen bereit und erneuert die Abruf-URLs.

## Vollständige Sicherung / Wiederherstellung

Vor jeder Projektänderung dieses Änderungssatzes den vollständigen Projektordner gesichert und per `tar -dzf` ohne Unterschiede geprüft:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_sound_reimport_2026-10-18.tar.gz`

SHA-256: `4049ee7792dd4a1e828b52379f97526cdab54c1beab4f62480144b61c53893ff`.

Archiv lokal in einen neuen leeren Ordner entpacken. Online kann Version 42 erneut veröffentlicht werden: `appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_b3ea96a632c8819184ed79a368eacadf`.
