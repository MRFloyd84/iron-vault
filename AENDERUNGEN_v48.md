# Änderungen in Version 48 – Außenhülle, Scheinwerfer, Tag und Nacht

## Mech äußerlich überarbeitet

Die GLB-Datei bleibt unverändert. Alles passiert beim Laden im Code
(`lib/mech-details.ts`), deshalb laufen Strukturatlas und Modelltests weiter.

- **Drehkranz statt schwarzem Zylinder:** An der Hüfte sitzt jetzt ein mechanischer
  Drehkranz. Er hat einen dunklen Kern mit abgewetztem gelb-schwarzem Warnstreifen, zwei
  Stahlflansche mit Schraubenkränzen, einen ölig glänzenden Zahnkranz und sechs
  Schwenkantriebe mit rostroten Kappen. Er ist schlanker als der alte Zylinder
  (Radius 0,14 statt 0,166) und steht nicht mehr wie ein Teller ab, deckt die Hüftfuge
  aber weiter ab.
- **Kein Chrom mehr:** Die Panzerung spiegelt deutlich weniger und ist matter.
- **Verschleiß-Shader:** Er legt sich über die Originaltextur.
  - Verblasste, leicht vergilbte Farbe.
  - Dunkler Schlamm und Staub an Füßen und Beinen, nach oben ausgefranst.
  - Senkrechte Regenschlieren und fleckiger Schmutz am ganzen Körper.
  - Schmutzige Stellen sind rauer und weniger metallisch.

  Der Schmutz ist an die Ruheposition jedes Bauteils gebunden („gebacken“). Er klebt
  am Mech und wandert beim Gehen nicht mit.

## Scheinwerfer – Taste J

- Zwei Doppelscheinwerfer sitzen an den Flanken der Kanzel, mit Gehäuse, Halter und je
  zwei Linsen.
- Sie werfen echtes Licht: zwei Spotlights, rund 17° nach unten geneigt. Der Lichtfleck
  liegt etwa 20 m vor dem Mech. Die Spotlights drehen mit dem Oberkörper.
- Wie alte Lampen flackern sie beim Einschalten etwa eine Sekunde, auch wenn der Strom
  zurückkommt. Danach leuchten sie ruhig.
- Sie brauchen Bordstrom (Batterie, Hangarstrom oder Generator).
- Nachts sind in den Außenansichten die Lichtkegel in der Luft zu sehen.
- Aus der Pilotensicht sieht man den beleuchteten Boden durch die Lücken unter der Konsole.
  Die Umgebungskameras sehen das Licht ebenfalls.

## Rundumleuchte

- Eine gelbe Rundumleuchte sitzt auf dem Rücken des Mechs. Sie dreht und blitzt, solange
  sich der Mech bewegt, und läuft zwei Sekunden nach.
- Sie hat ein eigenes, schwaches gelbes Licht auf der Umgebung.
- Ohne Bordstrom bleibt sie aus.

## Tag / Nacht – Taste N

- Ein weicher Übergang von etwa 2,5 Sekunden blendet über Dunkel vom Abendhimmel zum
  Nachthimmel.
- Den Nachthimmel malt der Code selbst. Er hat rund 2.600 Sterne (einige farbig),
  einen Milchstraßen-Schleier, einen Mond mit Hof und einen schwachen warmen
  Industrieschein am Horizont. Dafür braucht es keine zusätzliche Datei.
- Nachts gibt es weniger Himmels- und Umgebungslicht, bläulich-dunkles Streulicht,
  dunkleren und etwas dichteren Nebel, kräftiger leuchtende Hoflampen und 25 % mehr
  Licht aus den Hofscheinwerfern.
- In der Mech-Außenansicht weichen die Inspektionsleuchten nachts schwachem, bläulichem
  Mondlicht.
- Die Tag-Werte entsprechen exakt dem bisherigen Aussehen. Ein Test prüft das.

## Bedienung

- Neue Knöpfe in der Leiste: **SCHEINWERFER [J]** und **TAG/NACHT [N]**.
- Beide sind auch in der Hilfe (?) erklärt.
- Im Entwicklungsmodus (`npm run dev`) ist die Szene in der Browserkonsole als
  `ironVault.scene` erreichbar, zum Ausprobieren. Beispiel:
  `ironVault.scene.setNight(true)`.

## Technik und Leistung

- 3 zusätzliche Lichtquellen: 2 Spotlights und 1 Punktlicht, ohne Schatten.
- Ausgeschaltete Lichter bleiben mit Helligkeit 0 in der Szene. So löst Ein- und
  Ausschalten keine Shader-Neuübersetzung und kein Ruckeln aus.
- Die Lichtkegel sind additive, halbtransparente Kegel ohne Tiefenschreiben.
- 5 neue Tests in `tests/mech-lights-daynight.test.mjs`. Damit sind es 168 von 168 grünen
  Tests.

## Anpassen

- `lib/mech-details.ts`:
  - `HEADLIGHT_MOUNTS`: Position der Scheinwerfer.
  - `HEADLIGHT_TILT`: Neigung der Scheinwerfer.
  - `BEACON_MOUNT`: Position der Rundumleuchte (seit v49 an der Rückenplatte).
  - `spot.intensity = 5200 * level`: Helligkeit der Scheinwerfer.
  - Im Shader-Block von `applyWear`: Schmutzfarbe und -menge.
- `lib/day-night.ts`, `dayNightParams`: alle Nachtwerte.
