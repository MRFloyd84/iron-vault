# Änderungen in Version 53 – die Kanzel wird alt

## 1. Verschleiß auf allen Kanzelflächen

Ein Shader-Zusatz (`lib/cabin-wear.ts`) wirkt auf alle undurchsichtigen Kanzelmaterialien
außer Leuchtmitteln, Displays und Beschriftungen. Er arbeitet in Kanzelkoordinaten, damit
Schmutz und Abrieb fest an der Kanzel kleben, auch beim Gehen und Torso-Drehen.

- **Kantenabrieb:** An abgerundeten Kanten platzt der Lack ab, darunter liegt mattes,
  blankes Metall. Erkannt wird das über die echte Krümmung der Fläche, unabhängig vom
  Blickabstand.
- **Schmutz:** Er wird zum Fußraum hin dichter, dazu kommen fleckige Ablagerungen.
- **Farben:** verblasst und leicht vergilbt, mit feinen Kratzern.
- **Abgegriffene Bedienzone:** Vor dem Sitz auf Konsolenhöhe ist der Lack dezent blank
  gewetzt.

## 2. Gealtertes Licht

- **Leuchtleisten:** Die grünen Leisten sind jetzt alte Leuchtstoffröhren, vergilbt,
  trüb und schwächer.
  - **Backbord unten:** Diese Röhre hat einen **Wackelkontakt**. Sie zuckt
    gelegentlich, fällt etwa alle 20–40 s für 1–3 s aus und stottert beim Wiederzünden.
  - **Steuerbord oben:** Das Ende dieser Röhre ist **ausgebrannt** und dunkel angerußt.
- **Rote Deckenleuchte:** Sie ist weniger knallig.
- **Dunkle Ecken:** In der Pilotensicht sind die Ränder abgedunkelt, weil das Licht nicht
  bis in die Ecken reicht.

## 3. Displays

- **Giftgrün:** Alle Grüntöne der Displays haben einen einheitlichen, gelbstichigen
  Neongrün-Ton bei höherer Sättigung. Die Helligkeiten bleiben gleich, Warnfarben (Amber,
  Rot) sind unverändert. Das Streulicht der Displays in der Kanzel ist ebenfalls
  giftgrün. Das Werkzeug dazu ist `scripts/toxic-green.py`.
- **Flackern und Flimmern im Betrieb:**
  - Die Helligkeit atmet ständig unruhig.
  - Kurze Einbrüche durch einen Wackelkontakt im Hochspannungsteil.
  - Ein schwaches Interferenzband wandert langsam durchs Bild.
  - Einzelne Zeilen zittern.
  - Größere Störungen (Bildriss, Durchrollen, Rauschen, Einbrüche) kommen gut doppelt so
    oft wie in v47.
  - Ältere Röhren flimmern stärker.
  - Bei „Bewegung reduzieren“ fällt alles Bewegte weg.
- **Verschmutzte Scheiben:** Staubkörner, Wischspuren eines Lappens, Fingerabdrücke
  (meist am Rand, wo man hinlangt), Kratzer und Schmutzränder in den Ecken. Das Muster
  ist für jedes Display anders und bei älteren Röhren stärker.

## 4. Gebrauchsspuren (`lib/scene/cabin-clutter.ts`)

- **Handschriftliche Zettel:**
  - Am Reaktordisplay: „NICHT ÜBER 80 % !! — K.“
  - Am Strukturdisplay: „Schulter R knackt – beobachten“
  - Am Engineering-Display: „APU: 2x starten!“
- **Gewebeband:** über Kreuz über einem Riss am Radar-Rahmen und „DEFEKT?“ am
  Kamera-Monitor.
- **Prüfplakette:** „WARTUNG GEPRÜFT 11/2019 – NÄCHSTE: 11/2020“, also längst abgelaufen.
- **Ersatzrahmen:** Der Kamera-Monitor hat einen Rahmen aus einem anderen Mech, in rotem
  Grundierlack mit Schablonenschrift „ERSATZ · IV-02“.
- **Kabelbündel:** nachgerüstet, mit vier Adern und Kabelbindern an der rechten Strebe.
- **Altes Foto:** ausgeblichen und in den Rahmen des Kommunikationsdisplays geklemmt
  („IV-04 · 1. Einsatz“).
- **Anhänger am Dachrahmen:** Erkennungsmarke an einer Kugelkette mit rotem Wimpel
  „REMOVE BEFORE FLIGHT“. Er schwingt bei jedem Schritt und beim Drehen nach.

## Tests

- 2 neue Tests: Röhre mit Wackelkontakt, sowie Flimmern im Betrieb (sichtbar, aber im
  Mittel lesbar). Damit sind es 180 von 180.
- Sichtprüfung im Browser ohne Konsolenfehler.
