# Änderungen in Version 54 – IV-02, das Schwesterschiff

Aus deinem Modell `122.fbx` wird **IV-02**: ein abgestellter, ausgeschlachteter Mech
derselben Klasse. Er ist der Teilespender, aus dem der rot grundierte Ersatzrahmen in der
Kanzel von IV-04 stammt („ERSATZ · IV-02“).

## Aufbereitung (`scripts/prepare-sister-mech.mjs`)

- **Quelle:** 48 Teile, rund **10,1 Millionen Dreiecke**, ohne Skelett und ohne
  mitgelieferte Texturen. Die FBX verweist auf .jpg- und .tif-Dateien, die nicht dabei
  waren.
- **Vereinfacht** mit meshoptimizer auf **273.000 Dreiecke**. Das ist eine ähnliche
  Größenordnung wie IV-04 und damit browsertauglich. Die Datei
  `public/models/iv-02-sister.glb` ist 6,6 MB groß.
- **Abgetrennter Arm:** Der rechte Arm wird als eigener Teil abgelegt. Die Quelle fasst
  linke und rechte Seite jeweils in einem Teil zusammen, deshalb erfolgt die Trennung über
  die Lage der Dreiecke.
- **Normierung:** Höhe auf 1, die Fußsohle liegt bei y = 0. Quell-Prüfsumme und
  Dreieckszahlen stehen in den GLB-Extras.
- **Die 223-MB-FBX ist nicht im Projekt enthalten.** Neu erzeugen:
  `node --max-old-space-size=8000 scripts/prepare-sister-mech.mjs PFAD/122.fbx`

## Im Testgelände

- **Standort:** vor der Werkstatt (Actuator Lab), rechts der Prüfstrecke etwa auf Höhe
  der 50-m-Marke, Blick zur Strecke. Höhe 9,1 m.
- **Abmontierter Arm:** Er liegt auf Holzbohlen daneben.
- **Absperrung:** Absperrband, dazu ein Schild „AUSSER DIENST · IV-02 · TEILESPENDER FÜR
  IV-04 · KEIN ZUTRITT · KEIN STROM“.
- **Lack per Shader (keine Texturen):**
  - Verblasstes, fleckig ausgeblichenes Oliv.
  - Rot grundierte Flicken an ersetzten oder ausgebauten Teilen.
  - Rostläufer, Schlamm von unten und abgeplatzte Kanten mit blankem Metall.
- **Wetter und Licht:** Er wirft Schatten, wird im Regen nass wie der Boden, und man kann
  nicht durch ihn hindurchlaufen.

## Tests

- Ein neuer Test prüft: IV-02 blockiert, die Strecke daneben bleibt frei, die GLB liegt
  unter 300.000 Dreiecken und enthält Körper und Arm. Damit sind es 181 von 181.

## Wenn du die Texturen findest

Lade die .jpg- und .tif-Dateien hoch. Dann können die Originaltexturen statt des
Shader-Lacks verwendet werden, sofern die UV-Koordinaten nach der Vereinfachung
brauchbar bleiben. Das müsste man ausprobieren.
