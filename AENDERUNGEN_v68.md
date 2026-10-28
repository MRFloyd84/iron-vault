# Änderungen in Version 68 – Neuer Mech, Schritt 1

Der IV-04 wird Teil für Teil durch Renes neue Tripo-Modelle ersetzt. Gelenke, Gang,
Autopilot und Drohne bleiben unverändert, weil Knotennamen und Gelenkpunkte gleich sind.

## Neu

- **Rumpf**: gepanzerter Oberkörper mit Schulterringen, sitzt auf dem Drehkranz der Hüfte.
  Die Scheinwerfer sitzen jetzt direkt auf der neuen Front (Auflage per Strahltest).
- **Becken**: eigener Antriebsblock zwischen den Hüftgelenken. Er bewegt sich mit der Hüfte,
  nicht mit dem drehenden Oberkörper.
- **Füße**: dreizehige Füße mit runder Aufnahme. Die Sohle liegt auf der alten Sohle,
  deshalb stehen die Füße weiter fest auf dem Boden.
- **Hydraulikzylinder**: Rohr und Kolbenstange sind jetzt echte Modelle statt einfacher
  Röhren. Länge und Hub stellt das Spiel je Zylinder ein.
- **Pilotensitz** im Cockpit mit Seitenhebeln (aus dem Cockpit-Modell, nur der Sitz).
  Fällt das Modell beim Laden aus, wird der alte Sitz gebaut.
- **Strukturanzeige** (STRUCTURE / IV-04) zeigt den neuen Mech, mit den Farben jedes Teils.

## Noch alt

- **Beine** (Oberschenkel, Schienbein) und **Arme** (Oberarm mit Schulter, Unterarm mit
  Kanone) sind noch die des ersten Modells. Sie werden ersetzt, sobald die neuen
  Tripo-Teile da sind.

## Technik

- Neues Modell `public/models/iv-04-mech.glb` (12,6 MB), Einzelteile in
  `assets-src/mech-parts/`. Das erste Modell liegt dort als Bauvorlage und wird nicht mehr
  mit dem Spiel ausgeliefert.
- Skripte: `simplify-mech-part.mjs` (Teile vereinfachen), `assemble-mech.mjs` (Mech
  zusammensetzen), `prepare-hydraulic.mjs`, `prepare-seat.mjs`.
