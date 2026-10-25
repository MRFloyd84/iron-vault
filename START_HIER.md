# IRON VAULT – Quellprojekt, Version 59

Stand: 24.10.2026. v46: Aufräumen und neue Oberfläche, v47: Röhren-Look der Displays, v48: Außenhülle, Scheinwerfer, Tag/Nacht, v49: Rundumleuchte am Rücken, v50: Schatten, Schrittgewicht, Regen, v51: Regen-/Donneraufnahmen, Gewitter, v52: Armkanonen, Laser, Schießstand, v53: gealterte Kanzel, giftgrüne Displays, v54: Schwesterschiff IV-02, v55: Füße fest am Boden, Hydraulik an den Beinen, v56: Hydraulikgeräusche, v57: Desktop-App (AppImage), v58: automatische Updates über GitHub, v59: Englisch und Sprachmenü, v59.1: Lizenzbereinigung (IV-02 optional), v59.2: Rundumleuchte sitzt fest.
Was sich geändert hat, steht in `AENDERUNGEN_v46.md` bis `AENDERUNGEN_v59_2.md`.

Das ist eine Three.js-/React-Browsersimulation. Seit v46 ist sie ein reines
**Vite-Projekt** ohne Server-Anteil: `npm run build` erzeugt einen statischen Ordner
`dist/`, den jeder einfache Webserver ausliefern kann (z. B. ein Raspberry Pi mit nginx).

## Lokal starten (z. B. unter CachyOS)

Voraussetzung: Node.js 22.13 oder neuer (Node 24 passt) und npm. Für die erste
Installation braucht es Internet.

```sh
cd IRON_VAULT_v59
npm ci
npm run dev
```

Danach <http://127.0.0.1:5173> im Browser öffnen. Mit Strg+C beendest du den Server.

## Als Desktop-App (AppImage)

```sh
npm run dist:linux                                   # baut release/IRON_VAULT-…-x86_64.AppImage
sudo pacman -S fuse2                                 # einmalig
bash scripts/install-desktop.sh                      # Startmenü-Eintrag „IRON VAULT“
```

`npm run app` öffnet das Desktop-Fenster direkt aus dem Projekt. Details in
`AENDERUNGEN_v57.md`. Die installierte App aktualisiert sich selbst über GitHub Releases;
ein neues Release entsteht auf GitHub, sobald auf `main` eine höhere Version in
`package.json` ankommt (siehe `AENDERUNGEN_v58.md`).

## Produktion

```sh
npm run build      # Typprüfung + statischer Build nach dist/
npm start          # dist/ lokal unter http://127.0.0.1:4173 ansehen
```

`dist/` kannst du direkt auf einen Webserver kopieren. Wichtig: Die Seite muss
über HTTP ausgeliefert werden; ein Doppelklick auf `dist/index.html` funktioniert nicht,
weil Browser dann keine Texturen und Sounds laden.

## Prüfen und Pflegen

| Befehl                 | Zweck                                                    |
| ---------------------- | -------------------------------------------------------- |
| `npm test`             | alle 190 Tests (Zustandslogik, Audio, Displays, Geometrie) |
| `npm run typecheck`    | TypeScript-Prüfung                                       |
| `npm run lint`         | ESLint                                                   |
| `npm run format`       | Code einheitlich mit Prettier formatieren                |
| `npm run check`        | alles zusammen: Typen, Lint, Tests, Build                |

## Ordner

- `app/` – React-Oberfläche (`main.tsx` ist der Einstieg, `cockpit.tsx` die Hauptansicht,
  `globals.css` das gesamte Styling).
- `lib/` – Simulation und 3D-Szene. `machine.ts` ist die Zustandsmaschine,
  `cockpit-scene.ts` die Three.js-Szene. Ihre großen Bauabschnitte liegen in `lib/scene/`.
- `public/` – ausgelieferte Modelle, Texturen und Sounds.
- `assets-src/audio/` – unbearbeitete Original-Aufnahmen. Sie werden nicht ausgeliefert,
  sondern nur von den `scripts/prepare-*-audio.py`-Skripten gelesen. Die Pixabay-Originale
  sind aus Lizenzgründen nicht im GitHub-Repo, nur die eigenen ElevenLabs-Aufnahmen
  (siehe `ASSETS.md`).
- `scripts/` – Werkzeuge zur Asset-Aufbereitung (Mech-Modell, Strukturatlas, Audio,
  Materialien). Nach neuen Materialien `node scripts/compress-material-maps.mjs` ausführen.
- `tests/` – Node-Test-Runner-Tests.
- `docs/` – Prüfberichte früherer Versionen.

## Hinweise

Die Lizenz- und Herkunftshinweise im Projekt (`public/materials/sources.json`,
`public/audio/system-effects-sources.json`, `public/audio/hydraulic-sources.json`, `docs/ENTWICKLUNG_BIS_v45.md`) gelten unverändert. Die README gibt es auf Englisch (`README.md`) und Deutsch (`README.de.md`).
`scripts/audit-audio-baseline.mjs` braucht die Git-Historie des alten Hostingprojekts und
funktioniert mit diesem Archiv nicht. Für die App selbst ist das ohne Bedeutung.
