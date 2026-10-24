# IRON VAULT – Quellprojekt, Version 46

Stand: 24.10.2026, aufbauend auf Version 45.
Was sich gegenüber v45 geändert hat, steht in `AENDERUNGEN_v46.md`.

Das ist eine Three.js-/React-Browsersimulation. Seit v46 ist sie ein reines
**Vite-Projekt** ohne Server-Anteil: `npm run build` erzeugt einen statischen Ordner
`dist/`, den jeder einfache Webserver ausliefern kann (z. B. ein Raspberry Pi mit nginx).

## Lokal starten (z. B. unter CachyOS)

Voraussetzung: Node.js 22.13 oder neuer (Node 24 passt) und npm. Für die erste
Installation braucht es Internet.

```sh
cd IRON_VAULT_v46
npm ci
npm run dev
```

Danach <http://127.0.0.1:5173> im Browser öffnen. Mit Strg+C beendest du den Server.

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
| `npm test`             | alle 159 Tests (Zustandslogik, Audio, Displays, Geometrie) |
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
  sondern nur von den `scripts/prepare-*-audio.py`-Skripten gelesen.
- `scripts/` – Werkzeuge zur Asset-Aufbereitung (Mech-Modell, Strukturatlas, Audio,
  Materialien). Nach neuen Materialien `node scripts/compress-material-maps.mjs` ausführen.
- `tests/` – Node-Test-Runner-Tests.
- `docs/` – Prüfberichte früherer Versionen.

## Hinweise

Die Lizenz- und Herkunftshinweise im Projekt (`public/materials/sources.json`,
`public/audio/system-effects-sources.json`, README) gelten unverändert.
`scripts/audit-audio-baseline.mjs` braucht die Git-Historie des alten Hostingprojekts und
funktioniert mit diesem Archiv nicht. Für die App selbst ist das ohne Bedeutung.
