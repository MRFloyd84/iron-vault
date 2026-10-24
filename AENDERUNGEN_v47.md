# Änderungen in Version 47 – Röhren-Look für einen alten Mech

IV-04 ist ein alter Mech, und seine Displays sehen jetzt auch so aus: müde Bildröhren,
die beim Einschalten erst einmal kämpfen und im Betrieb ab und zu kurz stören.
Startlogik, Bootdauer (13 s) und Bedienbarkeit bleiben unverändert.

## Einschalten

Jedes Display durchläuft beim Hochfahren:

1. **Zündverzögerung:** Die Röhren springen nicht gleichzeitig an, sondern um bis zu
   0,7 s versetzt.
2. **Strahl öffnet sich:** Erst erscheint ein greller Strich in der Mitte, der sich in
   knapp einer halben Sekunde zum vollen Bild aufzieht.
3. **Aufwärmen:** Das Bild ist zunächst dunkel und wird über rund drei Sekunden voll hell.
4. **Synchronisation sucht:** Bei den meisten Röhren rollt das Bild ein paar Mal durch und
   rastet dann ein, mit schwarzem Austastbalken an der Nahtstelle.
5. **Instabilität:** Helligkeitsflackern, seitlich zitternde Zeilenbänder, Rauschlinien
   und Schnee. Das klingt nach etwa 4,5 s ab.
6. **Sorgenkinder:** Die zwei ältesten Röhren verlieren kurz das Signal (nur Schnee) und
   fangen sich wieder.

## Im Betrieb

- Gelegentlich gibt es kurze Störungen von 0,2–0,7 s: **Helligkeitseinbruch**, **Bildriss**
  (ein Streifen verrutscht seitlich), **Zeilenzittern** (wellige Bildverzerrung),
  **Rauschen** oder ein **einmaliges Durchrollen**.
- Insgesamt passiert alle paar Sekunden irgendwo etwas, an einem einzelnen Display etwa
  alle ein bis zwei Minuten.
- Jedes Display hat ein eigenes „Alter“. Ältere Röhren stören häufiger, leuchten etwas
  trüber und haben dunklere Ränder.
- Ein kaum sichtbares Netzbrummen lässt die Helligkeit leicht atmen. Auch das grüne
  Streulicht der Displays im Cockpit flackert mit.

## Technik

- Neues Modul `lib/display-aging.ts`. Alles wird deterministisch aus Zeit und
  Displaynummer berechnet: kein Zufallszustand, gleiche Eingabe, gleiches Bild.
- **Helligkeitsflackern** läuft jedes Bild über die Materialhelligkeit des 3D-Displays.
  Das ist flüssig und kostet praktisch nichts.
- **Bildstörungen** werden beim normalen, gedrosselten Neuzeichnen der Displaytextur
  aufgetragen. Im Browser kopiert eine Hilfscanvas die Bildbereiche, ohne Pixel
  zurückzulesen (etwa 2–3 ms pro Display-Neuzeichnung im Software-Rendering).
- **Reduzierte Bewegung** (Betriebssystem-Einstellung): Flackern und Störungen entfallen.
  Es bleiben nur das sanfte Aufhellen beim Start und die Randabdunklung.
- Die Außenkamerabilder flackern mit dem Monitor in der Helligkeit, werden aber nicht
  zerrissen, weil sie live aus der 3D-Szene kommen.
- Vier neue Tests in `tests/display-aging.test.mjs`: Zündung, Flackern und Einschwingen,
  reduzierte Bewegung, Störungshäufigkeit, durchsichtiges HUD, ruhiges Bild ohne Störung.
  Damit sind es 163 von 163 grünen Tests.

## Anpassen

In `lib/display-aging.ts`:

- `AGE`: Alter jeder Röhre (0 = neu, 1 = am Ende). Höher heißt mehr Störungen und
  trüberes Bild.
- In `glitchAt` steht die Häufigkeit (`0.035 + 0.11 * age` pro 6-Sekunden-Fenster).
  Größere Werte bedeuten öfter Störungen.
- `SETTLE_SECONDS`: wie lange die Röhren nach dem Einschalten instabil sind.
