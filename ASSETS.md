# Assets / Fremdmaterial

**English:** The MIT licence in `LICENSE` covers the source code only. The assets listed
below are not covered by it; they keep the terms of their sources. If you reuse the code,
replace or re-check these assets for your own use.

**Deutsch:** Die MIT-Lizenz in `LICENSE` gilt nur für den Quelltext. Die unten
aufgeführten Dateien fallen nicht darunter; für sie gelten die Bedingungen ihrer Quellen.
Wer den Code weiterverwendet, sollte diese Dateien ersetzen oder für den eigenen Zweck
selbst prüfen.

| Assets | Files | Source / Quelle |
| --- | --- | --- |
| Mech IV-04 | `public/models/iron-vault-rigged.glb`, `public/instruments/mech-structure-atlas.png` | Mech model generated with Tripo, simplified and re-rigged for this project |
| Mech IV-02 | `public/models/iv-02-sister.glb` – **not included** | “Juggernaut” by [Megalord](https://www.cgtrader.com/designers/megalord), CGTrader free model #907117, standard CGTrader licence (see below) |
| Textures | `public/materials/` | Supplied texture sets, listed in `public/materials/sources.json` |
| Sound recordings | `public/audio/*.ogg`, `*.mp3` | Third-party recordings (Pixabay Content License); names, cuts and processing in `public/audio/*-sources.json` |
| Rain and thunder | `public/audio/rain-loop.ogg`, `thunder-*.ogg`, `assets-src/audio/rain-original.mp3`, `thunder-original.mp3` | Generated with ElevenLabs Sound Effects (paid plan) |
| Hydraulic sounds | `public/audio/hyd-*.ogg`, `assets-src/audio/hydraulics/` | Generated with ElevenLabs Sound Effects, paid plan (`public/audio/hydraulic-sources.json`) |
| Recon drone | `public/models/iv-04-drone.glb` | Drone model generated with Tripo by Rene, merged into one textured part with `scripts/prepare-drone-model.mjs` (rotor blades are built in code) |
| Drone sounds | `public/audio/drone-*.ogg`, `assets-src/audio/drone/` | Generated with ElevenLabs Sound Effects, paid plan (`public/audio/drone-sources.json`) |

Sounds synthesised in code (Web Audio: weapons, rain noise, beeps, warning tones) and all canvas-drawn
displays, labels and textures are part of the source code and covered by the MIT licence.

**Unprocessed Pixabay originals are not in this repository.** The Pixabay licence does not
allow distributing its files unchanged on a standalone basis, so only the cut, looped and
mixed versions used by the game are included. To re-run
`scripts/prepare-service-audio.py`, `prepare-mobility-audio.py` or
`prepare-walking-audio.py`, download the recordings named in
`public/audio/*-sources.json` from Pixabay yourself and place them in `assets-src/audio/`.

**Die unbearbeiteten Pixabay-Originale sind nicht im Repository.** Die Pixabay-Lizenz
erlaubt nicht, ihre Dateien unverändert einzeln weiterzugeben. Enthalten sind nur die
geschnittenen, geloopten und abgemischten Fassungen, die das Spiel nutzt. Wer die
Aufbereitungsskripte neu ausführen will, lädt die in `public/audio/*-sources.json`
genannten Aufnahmen selbst bei Pixabay und legt sie in `assets-src/audio/`.

## IV-02 (“Juggernaut” by Megalord)

**English:** The parked sister mech IV-02 is built from the free model “Juggernaut” by
Megalord on CGTrader (model #907117). CGTrader's standard licence allows using it in a
game, but not distributing the model data openly. The converted model is therefore not
part of this repository or of the public releases; the parking spot outside the workshop
stays empty there. To get IV-02 in your own build, download the model yourself from
CGTrader and convert it:

```sh
node --max-old-space-size=8000 scripts/prepare-sister-mech.mjs PATH/122.fbx
```

This writes `public/models/iv-02-sister.glb` (ignored by git); the game picks it up
automatically. Thanks to Megalord – https://ko-fi.com/megalord

**Deutsch:** Das abgestellte Schwesterschiff IV-02 entsteht aus dem kostenlosen Modell
„Juggernaut“ von Megalord auf CGTrader (Modell #907117). Die Standardlizenz von CGTrader
erlaubt die Nutzung im Spiel, aber keine offene Weitergabe der Modelldaten. Das
umgewandelte Modell ist deshalb weder im Repository noch in den öffentlichen Releases;
dort bleibt der Stellplatz vor der Werkstatt leer. Wer IV-02 im eigenen Build haben will,
lädt das Modell selbst bei CGTrader und wandelt es mit dem Befehl oben um. Die Datei
`public/models/iv-02-sister.glb` wird von git ignoriert; das Spiel lädt sie automatisch.
