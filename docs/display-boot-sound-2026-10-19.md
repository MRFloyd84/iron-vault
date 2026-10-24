# Aufnahme für den vorhandenen Displayboot

Ausgang: veröffentlichte Version 43, Commit `b362f835dbb14abd06253b01b41a37c4daa2c9a9`. Nutzerauftrag: bereitgestellte Computer-/Displayaufnahme als Bootsound verwenden, bei Bedarf anpassen.

## Aufnahme und Einpassung

Die Datei `old_pc_and_displays__#2-1792421083883.mp3` wurde mit ffprobe und FFmpeg geprüft: MP3, 48 kHz, Stereo, Containerdauer 12,312 Sekunden, gemessener Mittelwert −26,1 dBFS und Spitzenwert −0,6 dBFS. Sie passt ohne Strecken oder Kürzen in die bereits vorhandene 13-Sekunden-Bootsequenz. Die letzten ungefähr 0,7 Sekunden der Anzeigeinitialisierung bleiben ohne diese Aufnahme.

Als `public/audio/display-boot.mp3` unverändert übernommen; SHA-256 von Upload und Projektdatei identisch: `f03dc5f4f2cd364cdec7df7da22ec932e7a5bc234d02008d5c195c7d06c91d3a`. Keine erneute verlustbehaftete Codierung oder Pegelnormalisierung. Der bestehende Masterregler und die normale Effektkanal-Einblendung steuern die Wiedergabe. Der Aufnahmepegel wurde gemessen; die subjektive Lautstärke im Zielbrowser ist noch nicht abgenommen.

## Ursprüngliches Problem und Lösung

Der vorhandene Displayboot hatte bislang keine zugeordnete Aufnahme. Ein Ton pro Bildschirm würde zehn überlagerte Stimmen erzeugen. Deshalb gibt es genau einen gemeinsamen Bootkanal, der dem bestehenden Displaytimer folgt.

| Datei / Funktionen | Änderung |
|---|---|
| `lib/display-boot.ts`: `DisplayBoot.update()` | Ergänzt eine fortlaufende Zyklusnummer bei neuem Displaystart. Dauer, Stromabhängigkeit und vorhandene Phasen bleiben bestehen. |
| `lib/cockpit-scene.ts`: Konstruktor, `animate()` | Optionaler Callback übergibt den vorhandenen Displayboot mit Phase, Zeit und Zyklus. Kein zweiter Timer oder zusätzlicher Renderpass. Vier bisherige Konstruktorargumente bleiben kompatibel. |
| `app/cockpit.tsx`: Erzeugung von `CockpitScene` | Leitet den gemeinsamen Displayboot an `MachineAudio.setDisplayBoot()` weiter. Keine zusätzliche React-Aktualisierung je Frame. |
| `lib/machine-audio.ts`: `setDisplayBoot()`, `enable()`, `update()`, `dispose()` | Neue Aufnahme wird über den vorhandenen Loader und `EffectChannel` geladen. Eine Stimme je Zyklus; verspätetes Laden/Aktivieren beginnt am aktuellen Offset. Bei Stromverlust, Ende, Audio-Unterbrechung oder Entsorgung wird der Kanal gestoppt. Nach Audio-Wiederaufnahme wird die aktuelle Displayposition verwendet. |
| `lib/audio-mix.ts`: `AUDIO_LEVELS.displayBoot` | Relativer Bootpegel 1 vor dem vorhandenen Master. Bestehendes Absenken von Hintergrundgeräuschen bei Warnung/Kalibrierung gilt auch hier. |
| `tests/machine-audio.test.mjs` | Erwartet die 18 vorhandenen Sounds plus Bootaufnahme; prüft neue Bootfälle gemeinsam mit den vorhandenen Displayphasen. |

## Verhalten

- BAT 1, BAT 2 oder Hangarstrom starten die Aufnahme mit dem vorhandenen Displayboot. Kein Ton im stromlosen Kaltzustand.
- Die Aufnahme läuft einmal für das gesamte Cockpit, ohne Loop. Ein zweiter Batterieschalter oder unterbrechungsfreier Quellenwechsel startet sie nicht neu.
- Stromverlust stoppt den Ton bereits bei der Zustandsaktualisierung, spätestens folgt die Displayphase im nächsten Frame. Ein tatsächlich neuer Displayzyklus beginnt die Aufnahme wieder von vorn.
- Spätes Decodergebnis kann einen abgebrochenen oder abgeschlossenen Boot nicht nachträglich hörbar machen.
- Bewusste Stummschaltung bleibt erhalten. Spätes Aktivieren oder Wiederaufnehmen von Browseraudio setzt an der aktuellen Displayposition ein und spielt keinen alten Beginn nach.
- Kein Umbau von APU, Hauptantrieb, technischen Startchecks oder Bewegungsfreigaben. Die bestehenden 18 Aufnahmen bleiben erhalten.

## Ausgeführte Prüfungen / Grenzen

60/60 gezielte Audio-/Display-/Renderingtests bestanden, keine übersprungen. Geprüft: erster Batteriestrom, nur eine Stimme, Quellenwechsel, Ende bei 13 Sekunden, Abschalten, neuer Zyklus, Mute, verspätete Aktivierung, verzögerte Decodergebnisse, Entsorgung sowie Browser-Audio-Unterbrechung. Die Tests verwenden ein Web-Audio-Testdouble; sie sind keine Hörprobe.

15 historische Zustandsaufnahmen für die bisherigen Maschinenklänge bleiben identisch mit dem Stand vor dem Displayupdate. Produktionsbuild und `git diff --check` bestanden. Vollständige Suite: 159/161 bestanden; ausschließlich die bekannten Preview-Meta-/Scrollbar-Templateprüfungen schlagen weiterhin fehl. Typecheck meldet nur die drei bekannten fehlenden Cloudflare-Typen. Keine interaktive WebGL-/Browser-Hörprüfung verfügbar. Keine gemessene FPS-Behauptung; ein zusätzlicher Audioabruf und vorübergehend eine Stimme, keine neue Audiobibliothek oder zusätzlicher Audiokontext.

Der frühere vollständige Tonausfall war laut abschließender Nutzerrückmeldung eine systemweite Stummschaltung von Brave und ist kein nachgewiesener Fehler dieses Bootkanals.

## Sicherung und Wiederherstellung

Vor den Änderungen wurde der vollständig verfügbare, frisch geöffnete Projektstand gesichert und mit `tar -dzf` ohne Unterschiede geprüft:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_boot_sound_2026-10-19.tar.gz`

SHA-256: `1dc580c966d0fe1a70092b636867dea42b48f913adf0004e6a9ab94e9580bf42`.

Lokal in einen neuen leeren Ordner entpacken. Online ist Version 43 als Rückkehrstand erhalten: `appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_c4bb24ad14448191b4964294ac4cd7c2`.
