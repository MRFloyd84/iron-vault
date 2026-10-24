# Änderungen in Version 55 – Rig: Füße fest am Boden, sichtbare Hydraulik

## Füße fest am Boden (Foot-Locking, `FootPlanting` in `lib/mech-exterior.ts`)

- **Vorher:** Die Füße folgten einem festen Gangmuster relativ zum Rumpf. Beim Drehen,
  Bremsen, Anfahren und in Kurven rutschten sie über den Boden.
- **Jetzt:**
  - Ein Fuß, der Last trägt, bleibt an seiner Weltposition stehen. Das gilt auch, wenn der
    Rumpf dabei dreht oder seine Geschwindigkeit ändert.
  - In der Schwungphase fliegt der Fuß von der Abhebestelle zum Aufsetzpunkt.
  - Bleibt der Mech mitten im Schritt stehen, setzt der Fuß dort ab, wo er gerade ist.
    Beim Anfahren beendet er den Schritt von dort aus.
- **Sicherungen:**
  - Läuft das Gangmuster mehr als 0,9 m vom stehenden Fuß weg, rutscht er am Rand nach.
    Das passiert nur kurz beim Umkehren von vorwärts auf rückwärts.
  - Ein stehender Fuß verdreht sich höchstens 20° gegen den Rumpf.
  - Nach Zurücksetzen oder Ansichtswechsel stellen sich die Füße neu ein.
- **Drehen im Stand:** Der Mech macht jetzt kürzere Trippelschritte (`turnStepFactor` in
  `lib/walking.ts`). So wird ein stehender Fuß beim Drehen nicht zu weit verdreht. Beim
  Gehen bleibt die Schrittfolge wie bisher.

## Sichtbare Hydraulik (`lib/mech-hydraulics.ts`)

- **Zylinder:** Vier Hydraulikzylinder sitzen auf der Panzerung, an jedem Bein zwei:
  - **Kniestrecker vorn:** vom Oberschenkel zum Schienbein.
  - **Fersenzylinder hinten:** von der Wade zur Fußplatte.
- **Bewegung:** Zylinderrohr und Kolbenstange haben feste Längen und schieben sich
  ineinander. Beim Gehen fährt jede Stange ungefähr zwischen 40 % und 70 % ihres Hubs aus
  und ein.
- **Aufbau:** Dunkles Rohr mit Kopf- und Bodenring, Lageraugen, eine geölte, nicht mehr
  blanke Stange und je zwei Hydraulikleitungen außen am Rohr.
- **Sitz auf dem Modell:** Die Anlenkpunkte sucht ein Strahl von außen auf der echten
  Modelloberfläche. Kein Zylinder schwebt in der Luft oder steckt im Blech.
- **Schatten:** Die Zylinder werfen Schatten.

## Tests

Drei neue Tests (184 von 184):

- **Kein Rutschen:** Stehende Füße bewegen sich beim Anfahren, Gehen, in der Kurve und beim
  Bremsen nicht, bei 60 Bildern/s mit dem echten Modell. Beim Rückwärts-Umkehren ist
  höchstens kurzes Nachrutschen erlaubt.
- **Drehen im Stand:** kein Rutschen, keine Sprünge.
- **Hydraulik:** Alle vier Zylinder sitzen auf der Oberfläche. Keine Stange verschwindet im
  Rohr oder fährt aus ihm heraus.
