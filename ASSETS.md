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
| Sound recordings | `public/audio/*.ogg`, `*.mp3`, `assets-src/audio/` | Third-party recordings; names, cuts and processing in `public/audio/*-sources.json` |
| Hydraulic sounds | `public/audio/hyd-*.ogg`, `assets-src/audio/hydraulics/` | Generated with ElevenLabs Sound Effects (`public/audio/hydraulic-sources.json`) |

Sounds synthesised in code (Web Audio: weapons, rain noise, beeps) and all canvas-drawn
displays, labels and textures are part of the source code and covered by the MIT licence.
