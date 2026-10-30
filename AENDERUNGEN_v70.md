# Änderungen in Version 70 – Pixel-Look der 90er

Neue Einstellung **Look** im Grafikmenü (Schieberegler-Symbol oben rechts), angelehnt an
Retro-Shooter wie Doom, Duke Nukem, Quake und Mekkablood: Quarry Assault.

- **Normal**: die volle Grafik wie bisher.
- **Pixel**: Das Bild entsteht in 270 Zeilen (bei 16:9 also 480 × 270) und wird ohne
  Glättung hochgezogen. Die Farben laufen über eine Palette mit 216 Farben, sind etwas
  kräftiger und haben mehr Kontrast. Dazu kommt leichtes Dithering wie bei alten
  256-Farben-Spielen.
- **Grob**: 200 Zeilen (wie 320 × 200) und 125 Farben.

Details:

- Texturen werden im Pixel-Look ungefiltert vergrößert, aus der Nähe sieht man also die
  einzelnen Texel.
- Dunkle Töne haben mehr Farbstufen, damit Schatten im Cockpit nicht in bunte Krümel
  zerfallen.
- Der Look ist unabhängig von der Voreinstellung (Hoch/Mittel/Niedrig) und wird
  gespeichert.
- Im Pixel-Look rendert das Spiel deutlich weniger Pixel, auf schwacher Hardware läuft es
  dadurch schneller.
- Der Look gilt für Cockpit, Außenansicht und Drohne im TV-Modus. Wärmebild und Nachtsicht
  der Drohne behalten ihre eigene Darstellung.
- Schalter, Mausklicks und Zielen funktionieren unverändert.
