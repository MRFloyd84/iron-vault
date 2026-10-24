# Änderungen in Version 52 – Waffensystem und Schießstand

## Armkanonen

- Zwei **30-mm-Maschinenkanonen** sitzen vorn in den Unterarmen. Die Mündungen sind am
  echten Modell an der Laufspitze ausgemessen.
- **Bedienung:**
  - **WAFFEN [M]** ist der Hauptschalter (MASTER ARM).
  - Gefeuert wird in der Pilotensicht mit der linken Maustaste. Das Fadenkreuz folgt
    frei der Maus.
  - Schalter und Knöpfe bleiben auch scharf geschaltet anklickbar. Ein Klick auf einen
    Monitor zoomt dann nicht mehr, sondern feuert.
- **Zielen:** Ein Strahl durch den Mauszeiger bestimmt den Zielpunkt. Beide Kanonen
  richten sich darauf aus (Parallaxe zwischen Kanzel und Armen wird berücksichtigt).
  - Die Lafette schwenkt etwa ±24° seitlich, 13° nach oben und 22° nach unten.
  - Liegt das Ziel weiter außen, dreht der **Torso automatisch nach**. Das geht mit der
    vorhandenen Gelenksteuerung und ihren Geschwindigkeitsgrenzen und braucht eine
    gelöste Parkverriegelung.
  - Bei verriegeltem Mech zeigt das Fadenkreuz „SCHWENKGRENZE“.
- **Freigaben (Waffensperre):** Feuern geht nur mit Bordstrom, MASTER ARM und
  Steuerfreigabe [6] und nur außerhalb der Halle. Am Fadenkreuz steht jeweils der Grund
  für eine Sperre, zum Beispiel „WAFFENSPERRE HALLE“.
- **Feuertakt:** Je Kanone 5 Schuss pro Sekunde, abwechselnd links und rechts. Je Kanone
  gibt es 150 Schuss.
- **Laufhitze:** Nach etwa 7 s Dauerfeuer überhitzen die Läufe und sperren, bis sie
  abgekühlt sind. Eine einzelne heiße Kanone wird übersprungen.
- **Nachladen:** Gesichert, in der Halle am Serviceplatz und mit geschlossener
  Parkverriegelung lädt der Mech 25 Schuss pro Sekunde je Kanone nach.
- **Ballistik:** Mündungsgeschwindigkeit 880 m/s mit Schwerkraft und leichter Streuung
  der alten Läufe. Jede zweite Patrone ist Leuchtspur.
- **Wirkung:**
  - Mündungsfeuer (Sternflamme plus Lichtblitz, nachts hell auf dem Boden, in der Kanzel
    gedämpft).
  - Rückstoß: Der Unterarm schlägt aus, die Kanzel stößt, die Nadeln zittern.
  - Messinghülsen werden ausgeworfen und springen auf dem Boden.
  - Einschläge mit Funken, auf dem Boden mit Staub, dazu Einschlagspuren, die über drei
    Minuten verblassen.
- **Klang:** Bis du eine Aufnahme hast, ist er synthetisch: Knall, tiefer Druckstoß und
  das Klacken des Verschlusses. Einschläge klingen auf Stahl hell nachklingend und auf
  dem Boden dumpf, und ihr Schall kommt verzögert nach Entfernung an. In der Kanzel ist
  alles gedämpft. Wie beim Regen kann ich eine echte Aufnahme einbauen.

## Laser-Entfernungsmesser – Taste P

- Ein roter Strahl läuft von der Kanzelunterkante zum Zielpunkt unter dem Fadenkreuz, mit
  Leuchtpunkt am Ziel.
- Die Entfernung steht am Fadenkreuz und im HUD.
- Nachts und im Regen ist der Strahl von außen gut zu sehen.

## HUD

- Bei Steuerfreigabe zeigt das Head-up-Display an der Frontscheibe:
  - Waffenstatus oder Sperrgrund.
  - Munition und Laufhitze je Kanone.
  - „NACHLADEN …“ während des Nachladens.
  - Laserentfernung.
  - Trefferbilanz (Treffer/Schüsse).

## Schießstand im Testgelände

- **Klappziele:** Sieben Stahlziele (2,4 × 3 m) mit Zielscheibe und alten Einschüssen
  stehen hinter der Streckenbegrenzung am Ende der Prüfstrecke. Bei Treffer klappen sie
  nach hinten um und richten sich nach 6 s wieder auf.
- **Wracks:** Zwei ausgeschlachtete Radpanzer stehen neben der Strecke. Sie haben einen
  abgeknickten Turm, es fehlen Räder, und sie sind Gehhindernisse wie Container.
- Entfernung von der Strecke zu den Zielen: etwa 10 bis 190 m.

## Technik

- Neue Module:
  - `lib/weapons.ts`: Freigaben, Takt, Munition, Hitze, Schwenkbereich. Reine Logik und
    getestet.
  - `lib/weapon-system.ts`: Geschosse, Effekte, Laser.
  - `lib/firing-range.ts`: Ziele, Wracks, Trefferprüfung.
  - `lib/weapon-hud.ts`
  - `lib/weapon-audio.ts`
- 5 neue Tests in `tests/weapons.test.mjs`. Damit sind es 178 von 178.
- Im Browser geprüft: 11 Schuss auf 71 m ergaben 10 Treffer, die Klappziele fallen, und es
  gibt keine Konsolenfehler.

## Anpassen

- `WEAPON` in `lib/weapons.ts`: Kadenz, Magazin, Hitze, Schwenkbereich, Streuung,
  Mündungsgeschwindigkeit.
- Ziele: `PLATE_XS` und `PLATE_Z` in `lib/firing-range.ts`.
- Wracks: `WRECKS` in `lib/walking.ts`.
