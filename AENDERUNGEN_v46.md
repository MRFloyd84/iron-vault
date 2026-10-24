# Änderungen in Version 46

Ausgangspunkt: IRON VAULT v45 (Quellcommit 28f12d6). Ziel war ein schlankeres, leichter
pflegbares Projekt mit aufgeräumter Oberfläche. Simulation, Startlogik, Gehen, Gelenke,
Audio und Displays verhalten sich wie in v45.

## Aufräumen und Verschlanken

- **Reines Vite-Projekt statt Vinext/Next/Cloudflare.** Die App war vollständig
  clientseitig. Der Server-Unterbau (Vinext, Cloudflare-Worker, Wrangler, D1/Drizzle,
  ChatGPT-Anmeldung, Hosting-Plugin) war ungenutzt und wurde entfernt. Neuer Einstieg:
  `index.html` → `app/main.tsx`.
- **Abhängigkeiten:** von 693 auf rund 250 installierte Pakete (fast alle nur Entwicklungswerkzeuge). Zur Laufzeit gibt es nur
  noch vier Abhängigkeiten: react, react-dom, three und lucide-react. Entfernt wurden ~60
  ungenutzte shadcn-UI-Komponenten, Tailwind, Recharts, Zod, Formularbibliotheken usw.
  Das Styling war ohnehin reines CSS.
- **Texturen:** Normal- und ORM-Karten von PNG nach WebP umgestellt (near-lossless, also
  nahezu ohne Qualitätsverlust): 23,1 MB → 12,6 MB. Das Skript
  `scripts/compress-material-maps.mjs` wiederholt das bei neuen Materialien.
- **Audio:** 8 unbenutzte Originalaufnahmen und den ersetzten alten Lüfterloop (~1,2 MB)
  nach `assets-src/audio/` verschoben. Sie werden nicht mehr ausgeliefert. Die
  Aufbereitungsskripte lesen sie dort.
- **Ausgelieferte Assets:** 45,9 MB → 34,2 MB (−25 %).
- **Three.js-Warnungen behoben:** veraltetes `PCFSoftShadowMap` → `PCFShadowMap`
  (Three.js hatte ohnehin schon so gerendert). Die Blur-Stärke der Umgebungsbeleuchtung
  liegt jetzt im erlaubten Bereich, sodass der Clipping-Hinweis entfällt.
- three.js liegt in einem eigenen JS-Chunk, den der Browser getrennt zwischenspeichern kann.

## Code lesbarer

- Gesamter Code mit Prettier formatiert. Vorher gab es Zeilen mit über 400 Zeichen, jetzt
  höchstens 100. `npm run format` hält das so.
- `lib/cockpit-scene.ts` (vorher ~2.300 Zeilen nach Formatierung) aufgeteilt in:
  - `lib/scene/hangar-build.ts`: Hangarhalle
  - `lib/scene/cabin-shell.ts`: Kabinenhülle, Deckenlampe, Streben, Seitenwände
  - `lib/scene/cabin-controls.ts`: Konsole, Schalter, Overhead, Monitore, Sitz, Instrumente

  Die Klasse `CockpitScene` behält gleichnamige Methoden, die an diese Module weiterleiten.
- Statusanzeige in `cockpit.tsx` als zwei kleine Funktionen (`statusText`, `statusTone`)
  statt einer zehnfach verschachtelten Bedingung.
- ESLint neu eingerichtet (TypeScript + React Hooks), ohne Fehler. Toter Code
  (`apuShutdownSupplyHint`) und ungenutzte Importe entfernt. Mit `tsc` gibt es keine
  Typfehler mehr; vorher fehlten drei Cloudflare-Typen.
- `globals.css` neu geordnet und kommentiert. Vorher hatten sich Regeln mehrfach
  gegenseitig überschrieben. Es gibt jetzt Farbvariablen, und tote Regeln der alten
  Startleiste wurden entfernt.

## Oberfläche

- Die Kamera-Leiste und die Standortanzeige liegen in einem gemeinsamen HUD-Container und
  können sich nicht mehr überlagern. Bei mittleren Fensterbreiten steht die Leiste
  oben über die volle Breite, bei schmalen umbricht sie.
- Die Kamera-Leiste ist optisch gruppiert: Mech/Gelenke · Außenkameras · Cockpitblicke.
  Das geöffnete Gelenkpanel ist markiert.
- Bessere Lesbarkeit vor hellem Hintergrund (Himmel im Testgelände): Textschatten und ein
  dezenter Verlauf hinter der Standortanzeige.
- Der Knopf **AUDIOPRÜFUNG** hängt nicht mehr dauerhaft im Bild. Er ist jetzt in der Hilfe
  (?) als „Audioprüfung öffnen“ erreichbar. Escape schließt die Hilfe und die Audioprüfung.
- Die Hilfe hat einen Schließen-Knopf.
- Der Ladebildschirm zeigt einen Fortschrittsbalken (bei reduzierter Bewegung statisch).

## Abhängigkeiten aktualisiert

- Vite 8.0.13 → 8.3.5 und sharp 0.34.5 → 0.35.5, wegen bekannter Sicherheitslücken in diesen
  Entwicklungswerkzeugen. `npm audit` meldet jetzt 0 Probleme.

## Tests

- v45: 164 Tests. Davon waren 157 grün, 5 übersprungen (fehlendes Canvas-Paket) und 2 rot
  (Template-Prüfungen).
- v46: **159 von 159 grün, keiner übersprungen.** Die zwei Template-Testdateien gehörten
  zum entfernten Starter und sind mit ihm entfallen. `@napi-rs/canvas` und `sharp` sind
  jetzt als devDependencies eingetragen, sodass auch die Pixel- und Strukturatlas-Tests
  laufen.
- Produktionsbuild im Browser geladen: keine Konsolenfehler, keine fehlenden Dateien.
  Geprüft wurde mit Software-Rendering. Echte Bildraten auf deinem Laptop sind damit
  nicht gemessen.

## Bewusst nicht geändert

- Das Mech-Modell (`iron-vault-rigged.glb`, 5,9 MB). Komprimieren würde die Prüfsummen
  ändern, an denen Strukturatlas und Tests hängen. Das wäre ein eigener Schritt mit
  Neuerzeugung des Atlas.
- Der HDR-Himmel (8 MB). Für eine deutliche Verkleinerung bräuchte es ein anderes Format
  (z. B. Ultra-HDR-JPEG), und das sollte man vorher am echten Bildschirm vergleichen.
- `lib/machine.ts` (Zustandsmaschine) ist nur formatiert und nicht umgebaut. Sie ist
  komplett durch Tests abgedeckt, und ein Umbau ohne konkreten Anlass brächte Risiko ohne
  Nutzen.
