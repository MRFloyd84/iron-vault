# Änderungen in Version 60.1 – eigenes Drohnenmodell und echte Drohnengeräusche

## Modell

- Die Drohne ist jetzt Renes mit Tripo erzeugtes Modell: rostig-olivgrüner Rumpf mit
  Nietenblechen und Gewebeband, vier Motorarme, Kufen, Kamerakugel vorn unten, Antenne
  und rote Kappe hinten.
- `scripts/prepare-drone-model.mjs` fasst die 37 Einzelteile mit je eigenen Texturen zu
  einem Teil mit einem Texturatlas zusammen (9,3 MB → 2,5 MB, rund 25.000 Dreiecke, ein
  Zeichenaufruf). Das automatisch angelegte Tripo-Skelett fällt weg.
- Die Rotorblätter fehlen im Modell absichtlich; sie werden im Code gebaut und drehen
  sich, dazu die Unschärfe-Scheibe bei Drehzahl. Das rote Licht auf der Kappe blinkt.
- Die Halterung auf dem Rücken ist an die Kufen des neuen Modells angepasst.
- Rund 1,1 m Rumpfbreite, mit Rotoren etwa 1,6 m.

## Geräusche

Mit ElevenLabs erzeugt (Rene), aufbereitet mit `scripts/prepare-drone-audio.py`.
Sie ersetzen das synthetische Rotorsurren:

| Geräusch | Wann | Prompt |
| --- | --- | --- |
| Schwebeflug (Schleife) | solange die Rotoren laufen, Tonhöhe leicht mit dem Tempo | Seamless loop of a heavy military quadcopter drone hovering, four large propellers, deep buzzing rotor hum with slight pulsing, worn electric motors with faint mechanical rattle, steady, no doppler, close perspective |
| Hochlaufen | Start (Taste C) | Large quadcopter drone motors spinning up from standstill to full hover speed, rising electric whine and propeller whoosh, old worn motors, ends at steady speed |
| Auslaufen | nach der Landung | Large quadcopter drone motors powering down from hover to a stop, falling pitch electric whine, propellers slowing and fading out, slight rattle at the end |
| Entriegeln | Drohne hebt aus der Halterung ab | Heavy metal locking clamps releasing on a drone cradle, hydraulic hiss and two mechanical clacks, industrial |
| Andocken | Kufen setzen auf | Drone landing skids touching down on a metal cradle, rubber thud followed by two metal locking clamps snapping shut, short hydraulic hiss |
| Zielmarkierung | Linksklick markiert ein Ziel | Short military targeting laser lock-on sound, electronic chirp with rising tone and a soft confirmation beep, old analog equipment |
| Funkrauschen (Schleife) | nur in der Drohnensicht, lauter bei schwachem Funk | Seamless loop of analog radio video link static, crackling white noise with dropouts and interference buzz |

In der Kanzel klingt alles gedämpft durch den Rumpf; je weiter die Drohne weg ist, desto
leiser. Bricht der Start ab (Strom weg), laufen die Motoren nur aus, ohne Andock-Geräusch.
