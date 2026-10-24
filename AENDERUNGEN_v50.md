# Änderungen in Version 50 – Schatten, Gewicht, Regen

## 1. Echte Schatten (Sonne und Mond)

- Ein gerichtetes Licht steht passend zum Abendhimmel tief und warm. Es wirft einen
  langen, echten Schatten des Mechs und der Hofobjekte auf den Boden. Der Mech
  verschattet sich auch selbst.
- Nachts wird daraus kaltes, hoch stehendes Mondlicht mit schwachem Schatten.
- Bei Regen wird das Licht trüb und die Schatten werden weich und schwach.
- Unter dem Hallendach bleibt die Sonne aus. Sie blendet am Tor weich ein.
- Die Schattenkarte deckt nur 24 × 24 m um den Mech ab. Das spart Leistung und ergibt
  scharfe Kanten. Ohne Sonne (in der Halle) wird sie nicht neu gezeichnet.
- Der bisherige weiche Kontaktschatten unter dem Mech wird bei Sonne schwächer und
  bleibt nur noch als Bodenkontakt-Andeutung.
- Lichtbalance: Die Sonne trägt jetzt mehr Licht, dafür spiegelt der Boden etwas weniger
  Himmel (0,55 statt 0,85).

## 2. Gewicht beim Gehen

- Das Aufsetzen jedes Fußes wird aus der Schrittphase erkannt (links bei ganzen, rechts
  bei halben Phasen). Das ist dieselbe Taktung wie die Schrittgeräusche.
- **Kanzelstoß:** Bei jedem Aufsetzen sackt die Kanzel kurz ab, kippt minimal nach vorn
  und zur Seite des Fußes und schwingt in etwa 0,4 s aus. Das richtet sich nach der
  Einstellung SCHRITTBEWEGUNG: AUS schaltet den Stoß ab, ebenso „Bewegung reduzieren“
  im Betriebssystem.
- **Instrumente:** Die Zeigernadeln zittern nach.
- **Staubwolken** an den Füßen breiten sich schnell aus und steigen langsam auf. Nachts
  sind sie dunkler. Bei Regen gibt es stattdessen flache, dunkle Spritzer.
- **Fußabdrücke:** Stahlsohle mit Fersenplatte, drei gespreizten Zehenplatten und
  Profilstollen, an der echten Sohlenmitte und in Gehrichtung. Sie verblassen über
  zwei Minuten. Bei Regen steht Wasser darin (glänzend).

## 3. Regen – Taste X

- **Regenschleier:** 9.000 Tropfenstreifen in einem Kasten, der mit der Kamera mitwandert.
  Sie werden komplett auf der Grafikkarte bewegt, schräg im Wind.
- Im **Scheinwerferkegel** und bei den Hofscheinwerfern leuchten die Tropfen auf.
  Nachts sieht man den Regen fast nur dort.
- In der Kanzel und unter dem Hallendach regnet es nicht.
- **Nasser Boden:** Asphalt und Beton werden dunkler und glänzend. In flachen Bereichen
  bilden sich Pfützen, die spiegeln. Unter dem Dach bleibt es trocken.
- **Nasse Panzerung:** Sie wird dunkler und glänzt, die Schmutzschlieren treten hervor.
  In der Halle trocknet sie in etwa einer Minute ab.
- **Tropfen auf der Frontscheibe** (Pilotensicht): Tropfen schlagen auf, kleine bleiben
  haften, große laufen mit Spur ab. Die Scheibe trocknet nach dem Regen ab.
- **Regengeräusch** ohne Audiodatei: gefiltertes Rauschen. In der Kanzel klingt es wie
  dumpfes Trommeln auf Blech, draußen hell. Es läuft über den normalen Ton-Schalter.
- Der Himmel wird trüber, der Nebel dichter und grauer.

## Bedienung

- Neuer Knopf **REGEN [X]**.
- Die Hilfe (?) erklärt Regen und „Gewicht beim Gehen“.

## Technik

- Neue Module:
  - `lib/footfall.ts`: Aufsetzerkennung und Feder für den Kanzelstoß.
  - `lib/ground-effects.ts`: Staub und Abdrücke.
  - `lib/weather.ts`: Regen, Nässe und Scheibe.
  - `lib/rain-audio.ts`: Regengeräusch.
- Dynamische Weltobjekte werden erst nach dem Zusammenfassen der statischen Szene
  angelegt. Vorher hätte die Szene ihre Matrizen eingefroren.
- 4 neue Tests in `tests/weight-weather.test.mjs`. Damit sind es 172 von 172.
- Sichtprüfung mit Software-Rendering (Screenshots). Bildrate und Klang auf deinem
  Rechner sind nicht gemessen.

## Anpassen

- Schattenlänge und -richtung: `dir` in `updateWeather` (`lib/cockpit-scene.ts`).
- Sonnenstärke: `lerp(2.8, 0.3, n)`, an derselben Stelle.
- Kanzelstoß: `impulse()` in `lib/footfall.ts`.
- Lebensdauer der Abdrücke: `PRINT_LIFE`.
- Tropfenzahl: `DROPS` in `lib/weather.ts`.
