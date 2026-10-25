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
| Mech IV-02 | `public/models/iv-02-sister.glb` | Derived from a separately supplied FBX model (`scripts/prepare-sister-mech.mjs`) |
| Textures | `public/materials/` | Supplied texture sets, listed in `public/materials/sources.json` |
| Sound recordings | `public/audio/*.ogg`, `*.mp3` | Third-party recordings (Pixabay Content License); names, cuts and processing in `public/audio/*-sources.json` |
| Rain and thunder | `public/audio/rain-loop.ogg`, `thunder-*.ogg`, `assets-src/audio/rain-original.mp3`, `thunder-original.mp3` | Generated with ElevenLabs Sound Effects (paid plan) |
| Hydraulic sounds | `public/audio/hyd-*.ogg`, `assets-src/audio/hydraulics/` | Generated with ElevenLabs Sound Effects, paid plan (`public/audio/hydraulic-sources.json`) |

Sounds synthesised in code (Web Audio: weapons, rain noise, beeps) and all canvas-drawn
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
