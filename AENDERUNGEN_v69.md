# Änderungen in Version 69 – Neuer Mech komplett, Cockpit geprüft

Mit Renes letzten Tripo-Teilen ist der IV-04 jetzt vollständig neu. Gelenkpunkte, Gang,
Autopilot, Drohne und Kollisionskreis bleiben wie gehabt.

## Neue Teile

- **Oberschenkel** mit Hüftlager, Panzerplatte und Hydraulik an der Rückseite.
- **Schienbein** mit Knie- und Sprunggelenklager. Beide Beinteile sitzen exakt zwischen
  den bisherigen Gelenkpunkten und sind etwas kräftiger gemacht als im Original.
- **Oberarm mit Schulter**: Schultergelenk innen am Rumpf, Panzerplatte außen, Ellbogenlager
  unten. Der rechte Arm ist gedreht, damit das Gelenk auch dort innen liegt.
- **Unterarm = Kanone**: Die Läufe zeigen jetzt nach vorn statt nach unten. Die
  Ellbogentrommel ist das Gelenk; GELENKE [B] hebt die Kanonen wie bisher an.
  - Die Läufe sind leicht nach innen gerichtet (auf einen Punkt vor dem Mech). So bleibt
    der Mech im alten Kollisionskreis von 4,65 m und passt weiter an der
    Wartungsplattform vorbei und durchs Tor.
  - Schüsse und Laser kommen jetzt aus der echten Laufmündung.
- Die **Füße** sind ohne sichtbaren Unterschied leichter geworden (30 000 statt 52 000
  Dreiecke).

## Kleinere Datei

- Die Geometrie ist gepackt (meshopt), Normalen und UVs sind quantisiert. Das Modell hat
  jetzt 10,1 MB statt 18,8 MB, obwohl alle Teile neu sind. Der Spielstart lädt es wie
  bisher, three.js entpackt es beim Laden.
- Die Kanone hatte im Original 1,36 Mio. Dreiecke, jetzt sind es 18 000. Dafür gibt es das
  neue Skript `scripts/reduce-mech-part.mjs`: Es vereinfacht über UV-Nähte hinweg, solange
  die Textur passt.

## Cockpit geprüft

Alle 143 Bedienelemente im Cockpit wurden im Browser geprüft:

- Jedes Element ist vom Pilotensitz aus anklickbar, und kein anderes Element liegt davor,
  auch nicht der neue Sitz oder das größere MCDU-Feld.
- Jede Aktion wurde im kalten und im startbereiten Zustand ausgelöst. Keine löste einen
  Fehler aus, alle wirken (oder zeigen die passende Sperrmeldung).
- Der MCDU-Ablauf DIR → Ziel → INSERT → AP → PERF → MSG → AP aus funktioniert.
- Keine Konsolenfehler.

## Technik

- `assemble-mech.mjs` setzt jetzt alle Teile ein. Gelenkpunkte der Tripo-Teile stehen
  dort in `JOINT`. Die Mündung steht als `extras.muzzle` am Unterarm, `weapon-system.ts`
  liest sie von dort.
- Strukturanzeige (STRUCTURE / IV-04) neu aus dem fertigen Modell.
