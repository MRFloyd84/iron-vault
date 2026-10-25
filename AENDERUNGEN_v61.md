# Änderungen in Version 61 – Wüste, Industrieanlagen und Einsätze

## Die Karte: 1,5 × 1,5 km Wüste

- Rund um Halle und Testgelände liegt jetzt eine Wüste mit echtem Relief: weite
  Bodenwellen, ein Dünenfeld im Nordwesten, drei Tafelberge, ein Hügel im Nordosten und ein
  Randwall. Der alte Hügelring um das Testgelände ist weg.
- **Ausfahrt:** am Südende des Testgeländes, östlich an den Zielscheiben vorbei (Wegweiser
  „AUSFAHRT WÜSTE“). Die Seitenzäune des Testgeländes sind jetzt echte Hindernisse.
- **Pisten** führen vom Testgelände zum Kreuzweg (Kontrollpunkt mit Blinklicht) und weiter zu
  fünf Anlagen:
  - **Raffinerie Asche-7** – Tanklager, Destillationskolonnen, brennende Fackel, Rohrbrücken
  - **Förderanlage Ost** – Bunkergebäude, Förderband, Halden, Bagger- und Kipperwrack
  - **Funkstation Kamm** – roter Gittermast, drehende Radaranlage, Bunker (auf dem Hügel)
  - **Depot 4** – Lagerhalle, Containerreihen, Lastwagen
  - **Siedlung Kreuzweg** – Ruinen, Wasserturm, Autowracks
- Dazu eine Pipeline (an Pisten unterirdisch), eine Stromleitung mit Masten, über 500 Felsen,
  ausgebrannte Fahrzeuge und – irgendwo in den Dünen – das Wrack von **IV-01**.
- **Gehen im Gelände:** IV-04 steht und läuft auf Hängen (Füße, Neigung, Schatten folgen dem
  Boden). Zu steile Hänge und Dünen lehnt die Steuerung ab („Hang zu steil“); Bewegungen,
  die die Neigung verringern, bleiben möglich. Gebäude, Tanks, Felsblöcke und der Kartenrand
  sind Hindernisse.
- **Sicht:** heller, warmer Wüstendunst statt dunklem Nebel, Sichtweite bis 2,6 km, ferne
  Bergkette am Horizont. Kameramonitore und Drohne sehen ebenfalls weiter.

## Einsätze (Taste I)

- **EINSATZ [I]** öffnet die Einsatzleitung: Liste der Einsätze, Lagekarte mit Relief und
  Planquadraten (A–F / 1–6 à 250 m), Auftragstext, Ziele, Start und Abbruch.
- Sechs Einsätze:
  1. **Erster Außeneinsatz** – Kontrollpunkt erreichen, Wasserturm mit der Drohne aufklären
  2. **Treibstofflager Asche-7** – drei Tanks zerstören
  3. **Verschollen: IV-01** – Wrack im Dünenfeld mit der Drohne suchen
  4. **Funkstation Kamm** – Radar und Bunker aufklären, Radar und Sendemast zerstören
  5. **Depot 4** – drei versteckte Lastwagen finden, dann zerstören
  6. **Pipeline** – vier Schieberstationen zerstören
- Jeder Einsatz endet mit der Rückkehr in die Halle. Erfüllte Einsätze merkt sich der
  Browser; jeder Einsatz lässt sich wiederholen (Ziele werden dafür wieder aufgebaut).
- **Wegweiser** links unter der Ortsanzeige: nächstes Ziel, Entfernung, Kompassrichtung und
  ein Pfeil relativ zur Blickrichtung. Die Ortsanzeige zeigt draußen das Planquadrat.
- **Aufklären:** das Objekt mit der Drohne mittig ins Bild nehmen, bis „ERFASSE …“ voll ist –
  oder es mit Linksklick markieren. Unbekannte Lagen erscheinen als gestrichelte Suchgebiete.
- **Taktik-Display** (Mitte der Konsole): zeigt jetzt das echte Lagebild – Pisten,
  Bauwerke, Ziele, Drohne, Einsatzziel (bzw. Pfeil am Rand, wenn es weiter weg ist).

## Zerstören

- Ziele haben Trefferpunkte; die Armkanonen treffen jetzt auch Gebäude, Felsen und Ziele der
  Außenwelt (Funken, Einschläge), der Boden folgt dem Gelände.
- Explosionen mit Feuerball, Lichtblitz, Trümmern, Brandfleck und Rauchsäule; Tanks brennen
  zweieinhalb Minuten. Ziele verkohlen und sacken zusammen, der Sendemast kippt um, die
  Radarschüssel stürzt ab. Explosionen beschädigen Ziele in der Nähe.
- Explosionsgeräusch (synthetisch) mit Schallverzögerung: aus 700 m Entfernung kommt der
  Knall rund zwei Sekunden nach dem Blitz.

## Drohne

- Funkreichweite rund 300 m (vorher 200 m), die Drohne darf über die ganze Karte fliegen
  und hält über Dächern und Türmen Abstand.

## Technik

- `lib/terrain.ts` (Höhenfunktion), `lib/world-layout.ts` (Anlagen, Kollision, Ziele als
  Daten), `lib/world-terrain.ts` und `lib/world-scene.ts` (Grafik; Gelände in 144 Kacheln
  mit drei Detailstufen, Anlagen je Material zusammengefasst), `lib/targets.ts`,
  `lib/world-targets.ts`, `lib/explosions.ts`, `lib/missions.ts`,
  `lib/mission-director.ts`, `lib/map-render.ts`, `app/mission-panel.tsx`.
- Neue Tests für Gelände, Weltaufbau, Treffer, Ziele, Missionen und Taktik-Display.
