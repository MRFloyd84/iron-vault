# Durchgehender Lüfterklang nach dem Displayboot

Ausgang: Version 44, Commit `1efc70729b20eef5b5fdcea043393205d0fd13b2`. Auftrag: bereitgestellte leise Luftstromaufnahme nach dem Boot dauerhaft als Lüfterschleife verwenden und den Übergang glätten.

## Aufnahme / Bearbeitung

Eingabe: `old_pc_airflow_quiet_#2-1792422002306.mp3`, MP3, Stereo, 48 kHz. Containerdauer 12,312 Sekunden; vollständig decodierter Inhalt 12,28 Sekunden. Original-Upload bleibt unverändert. SHA-256: `c83d5d50bb4baf45efbe478b32462baa6e39c6f8865399a575261d8981a301df`.

`scripts/prepare-display-fan.py` erzeugt mit Python-Standardbibliothek und FFmpeg eine kontinuierliche Schleife: Kanal-Gleichanteil entfernen, Kopf und Ende über 1,2 Sekunden mit gleichleistungsgewichteten Sinus-/Kosinuskurven überblenden und die fertige periodische Aufnahme an eine gemeinsame Stelle nahe dem Nulldurchgang rotieren. Es gibt kein Ausblenden auf Stille an jeder Wiederholung. Ogg Vorbis vermeidet die zusätzliche MP3-Rahmenauffüllung bei erneuter Speicherung und nutzt das bereits im Projekt vorhandene Audioformat.

Ergebnis: `public/audio/display-fan-loop.ogg`, 11,08 Sekunden, 531.840 Stereo-Frames bei 48 kHz, 134.912 Byte. SHA-256: `46cbc0fc5705ddd28acbc3c2ef1652f77e567dd6f6de8d4295c4af6c35e551ba`.

Nach vollständiger erneuter Decodierung geprüft: exakte erwartete Samplezahl, keine Übersteuerung (Spitze 0,05038), RMS −32,45 dBFS. Der gemittelte Sample-Sprung über die Dateigrenze beträgt 0,00004697; innerhalb der Aufnahme beträgt der RMS aufeinanderfolgender Sample-Unterschiede 0,00018042. Die Grenze liegt damit bei rund 26 % des normalen RMS-Sampleunterschieds. Das ist ein objektiver Test gegen einen harten Schnitt, keine subjektive Hörabnahme im Zielbrowser.

Reproduktion aus dem Projektordner:

```sh
python scripts/prepare-display-fan.py /pfad/zur/originalaufnahme.mp3 public/audio/display-fan-loop.ogg
```

## Ursprüngliches Verhalten / gezielte Lösung

Vorher spielte der vorhandene Lüfterkanal die industrielle Aufnahme abhängig von technischer Startstufe 1. Die neue Aufnahme soll bereits nach dem Displayboot laufen. Deshalb wird der vorhandene Kanal wiederverwendet; keine zweite Lüfteraufnahme oder Soundengine ergänzt.

- `lib/machine-audio.ts`, Konstruktor / `enable()`: vorhandenen Lüfter auf `display-fan-loop.ogg` umgestellt; ein einmal decodierter `AudioBufferSourceNode` mit `loop=true`. Keine JS-Timer, Netzabrufe oder Decodierung je Schleifenrunde. Die bisherige Datei `industrial-fan-loop.ogg` bleibt für Rücknahme erhalten.
- `setDisplayBoot()` / `syncFan()`: während off/boot stumm, ab ready und verfügbarem Steuerstrom sanft einblenden. Damit läuft der Lüfter auch bei Startstufe 0 nach beendetem Displayboot. Reglerstufen einschließlich AUS, bisherige Geschwindigkeitsänderungen, gemeinsamer Master/Mute und Warnungsabsenkung bleiben bestehen. Bei Stromverlust oder erneutem Boot ausblenden. Gain-/Rate-Ziele werden nur bei tatsächlicher Änderung neu geplant, nicht je Renderframe.
- `tests/machine-audio.test.mjs`: Beginn nach 13 Sekunden mit Batteriestrom, Stille während Boot, native Schleifenwiedergabe ohne erneuten Start, Regler, Mute, Stromverlust sowie verspätetes Laden/Entsorgung geprüft. Die aktiven Abrufe bleiben bei 19; eine Aufnahme wurde ersetzt, keine zusätzlich parallel gespielt.
- `scripts/audit-audio-baseline.mjs`: der absichtlich ersetzte Lüfter wird ausdrücklich vom historischen Gleichheitsvergleich ausgenommen. Die übrigen Kanäle werden weiterhin verglichen; es wird keine vollständige Audioidentität einschließlich des neuen Lüfters behauptet.

Bootaufnahme, Displaydauer, technische Startfreigaben, Reaktorkühlung und mechanische Funktionen bleiben erhalten. Dies ändert den Klang und den hörbaren Einschaltpunkt des vorhandenen Kabinenlüfters; es implementiert kein neues physikalisches Kühlmodell.

## Prüfungen / Grenzen

63/63 gezielte Audio-/Display-/Renderingtests bestanden, keine übersprungen. 15 historische Zustandsaufnahmen bestätigen identische Ansteuerung der beibehaltenen Audiokanäle; der neue Lüfter ist ausdrücklich ausgenommen. Produktionsbuild und `git diff --check` bestanden. Vollständige Suite: 162/164 bestanden, nur die bekannten Preview-Meta-/Scrollbar-Templateprüfungen schlagen fehl. Typecheck weiterhin ausschließlich mit den drei bekannten fehlenden Cloudflare-Typen.

Die Zustands-/Audio-Graph-Tests verwenden ein Testdouble. Die Übergangsanalyse wurde an real decodierten Audiosamples ausgeführt. Eine interaktive Browser-Hörprobe ist hier nicht verfügbar; die subjektive Übergangsqualität und Lautstärke auf dem Zielgerät bleiben zu prüfen. Die Schleife läuft bei den bisherigen Lüfterstufen und endet akustisch beim Abschalten mit dem vorhandenen Ausblenden. Keine zusätzlichen Produktionsabhängigkeiten, Renderpässe oder Audiokontexte.

## Vollständige Sicherung / Wiederherstellung

Nach Öffnen des aktuellen Quellstands und vor allen Projektänderungen wurde der vollständige Projektordner gesichert und mit `tar -dzf` ohne Unterschiede verglichen:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_postboot_fan_verified_2026-10-19.tar.gz`

SHA-256: `618b90c85183f26aa96db6f954958eef18a1751e2f46f75a232cecf7e1ee5f3e`.

Lokal in einen neuen leeren Ordner entpacken. Online bleibt Version 44 als Rückkehrstand erhalten: `appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_df45bc6ec6ec81919d7c52fb18be683f`.
