# Änderungen in Version 72 – Lesbare Beschriftungen, Comic-Look

## Schalterbeschriftungen lesbar

- Im Pixel-Look sind jetzt auch alle Beschriftungen in der Kanzel scharf: Schalter, Regler,
  Feldtitel wie POWER / AUX, FLIGHT / AUX und CONTROL STICK sowie OFF/ON und +/−.
- Sie werden wie die Anzeigen nach dem stilisierten Bild in voller Auflösung
  darübergelegt, mit derselben Beleuchtung wie sonst.
- Die verpixelte Kopie darunter ist ausgeblendet, es gibt also keinen unscharfen
  Doppeltext.

## Neuer Look „Comic“

- Grafikmenü → **Look** → **Comic**: Das Spiel sieht aus wie eine Tuschezeichnung.
  - Schwarze Konturen an Kanten und Silhouetten.
  - Flache Farbflächen in vier Helligkeitsstufen bei gleichem Farbton, kräftigere Farben.
  - Rasterpunkte in den Schatten wie im Heftdruck.
- In der Ferne werden die Linien dünner, damit Dünen nicht zu Gekritzel werden.
- Anzeigen und Beschriftungen bleiben auch hier scharf und lesbar.
- **F4** wechselt zwischen normalem Bild und dem zuletzt gewählten Look, also Pixel, Grob
  oder Comic.

## Technik

- `retro-pass.ts` rendert alle drei Stile. Beschriftungen der Kanzel liegen auf einer
  eigenen Ebene (`LABEL_LAYER`), die Hauptkamera sieht sie immer mit.
- Die Überlagerung berechnet die Schattenkarten nicht ein zweites Mal.
- Neuer Test: Die Renderziele lassen sich für alle Looks anlegen.
