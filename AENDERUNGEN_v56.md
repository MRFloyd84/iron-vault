# Änderungen in Version 56 – Hydraulikgeräusche beim Gehen

Renes eigene Aufnahmen, mit ElevenLabs Sound Effects erzeugt (19 Dateien), sind jetzt
im Spiel eingebaut.

## Aufbereitung (`scripts/prepare-hydraulic-audio.py`)

- **Originale:** Sie liegen unverändert in `assets-src/audio/hydraulics/` und werden
  nicht mit ausgeliefert.
- **Je Aufnahme:** Mono, Stille am Anfang entfernt, kurz ein- und weich ausgeblendet.
  Jede Gruppe ist auf die gleiche Lautheit gebracht, Spitzen sind begrenzt.
- **Pumpe:** Beide Aufnahmen sind zu einer nahtlosen Schleife von 13,8 s zusammengeblendet.
- **Ergebnis:** 17 OGG-Dateien in `public/audio/hyd-*.ogg`, zusammen etwa 300 KB.
  Herkunft und Prüfsummen stehen in `public/audio/hydraulic-sources.json`.

## Im Spiel (`lib/hydraulic-audio.ts`)

Die Geräusche hängen am Gangzyklus jedes Beins, im selben Takt wie die Zylinder aus v55:

| Moment im Schritt | Geräusch |
| --- | --- |
| Fuß hebt ab | Druckablass, danach fährt ein Zylinder ein |
| Bein schwingt nach vorn | Zylinder fährt aus |
| Fuß setzt auf | Ventil schließt, Federn (kurz nach dem Schrittaufprall) |
| manchmal beim Aufsetzen | Knie knarzt, im Regen etwa viermal so oft |
| immer, solange der Antrieb läuft | Hydraulikpumpe, lauter und etwas höher bei Last (Gehen, Armbewegung) |

- **Varianten:** Jedes Geräusch hat 3 oder 4 Varianten, dazu leicht verschiedene Tonhöhen.
  Aufeinanderfolgende Schritte klingen dadurch nie gleich.
- **Lautstärke:** Leise Schritte beim Anfahren erzeugen leisere Geräusche. Im Stand ist die
  Hydraulik still, nur die Pumpe läuft leise weiter.
- **Kanzel:** Alles kommt gedämpft durch den Rumpf, fast mittig.
- **Außenansichten:** Klar und links/rechts nach Bein verteilt.
- **Pegel:** Die Ereignisse liegen etwa 6 dB unter dem Schrittaufprall, die Pumpe knapp
  unter dem Antrieb (`AUDIO_LEVELS` in `lib/audio-mix.ts`).
- **Nach Zurücksetzen oder Pause** spielt keine Salve alter Schritte nach.

## Die Prompts (ElevenLabs Sound Effects)

| Datei | Länge | Prompt |
| --- | --- | --- |
| extend | 1 s | Heavy industrial hydraulic cylinder extending under load, pressurized oil rushing through a valve, short rising pump whine, thick metallic body, old worn machinery, close-up, dry, no reverb, no music |
| retract | 1 s | Heavy hydraulic piston retracting, oil flowing back with a low falling hiss, soft metal slide and a dull clunk at the end, old industrial machine, close-up, dry, no reverb, no music |
| vent | 0,7 s | Short sharp pneumatic pressure release hiss from a heavy walking machine, quick burst of air from a valve, metallic, close-up, dry, no reverb |
| settle | 0,8 s | Heavy steel valve snapping shut followed by a short hydraulic shock absorber settling, metallic clack and low groan of loaded steel joint, giant robot leg, close-up, dry, no reverb, no footstep impact |
| creak | 1,5 s | Old rusty heavy steel joint creaking under enormous weight, slow metallic groan and squeak of a huge worn hinge, giant machine, close-up, dry, no reverb, no music |
| pump | 7,5 s | Continuous hydraulic power unit running inside a heavy machine, steady electric pump whine with oil pressure hum, slight rhythmic pulsing, old industrial equipment, seamless loop, dry, no reverb, no music |

**Neue Varianten nachlegen:**

1. Als `assets-src/audio/hydraulics/<gruppe>-<buchstabe>.mp3` ablegen.
2. In `GROUPS` im Skript und in `HYDRAULIC_VARIANTS` in `lib/hydraulic-audio.ts` eintragen.
3. Skript ausführen: `python scripts/prepare-hydraulic-audio.py`

## Tests

- **Gangzyklus:** Je Bein und Doppelschritt fällt jedes Ereignis genau einmal.
- **Stille:** Im Stand und bei Sprüngen entstehen keine Geräusche.
- **Knarzen:** Bei Nässe deutlich häufiger.
- **Dateien:** Alle sind vorhanden.
- **Audio-Mock:** Er kennt jetzt Filter und Stereo-Panner. Die Zahl der vorgeladenen
  Geräusche steigt von 19 auf 36.
- **Ergebnis:** 185 von 185.
