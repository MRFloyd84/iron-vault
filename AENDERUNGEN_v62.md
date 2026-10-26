# Änderungen in Version 62 – Stabilitäts- und Performance-Audit

Ziel: gleichmäßige Bildzeiten und stabiler Langzeitbetrieb, ohne Abstriche bei Grafik, Ton
oder dem schweren Bewegungsgefühl. Lichter, Schatten, Auflösung, Sichtweite, Display-Effekte,
Sounds und Startsequenzen sind unverändert.

## Schneller

- **Weniger Zeichenaufrufe:** Halle, Testgelände und Bauten werden in größeren Blöcken
  gezeichnet. Im Cockpit 38–49 % weniger Zeichenaufrufe pro Bild, außen 36 %.
- **Kameramonitor:** nimmt die Welt höchstens etwa 25-mal pro Sekunde auf statt in jedem Bild.
  Vorher wurde die Welt im Cockpit praktisch zweimal pro Bild gezeichnet.
- **Kein Stocken beim ersten Ansichtswechsel:** alle Shader (Cockpit, Außensicht, Monitor,
  Drohne, Explosionen) werden beim Laden übersetzt statt mitten im Spiel.
- Das Wrack von IV-01 ist zu wenigen Teilen zusammengefasst.

## Stabiler

- Waffen-, Regen- und Donnergeräusche geben ihre Audio-Knoten nach dem Abspielen vollständig frei.
- Nach einem Grafiktreiber-Reset (WebGL-Kontext wiederhergestellt) bauen sich Displays und
  Kameramonitor neu auf.
- Beim Drohnenflug zeichnet die Oberfläche nicht mehr zehnmal pro Sekunde unnötig neu; das
  Taktik-Lagebild wird nur noch so oft berechnet, wie das Display es zeigt.

## Diagnosemodus (F3)

- **F3** (oder Hilfe → Werkzeuge → „Diagnose anzeigen“, oder `?diag=1`) blendet eine
  Messanzeige ein: Bilder/s, Bildzeit Ø/max, 1 % Low, CPU-Zeit je Abschnitt, GPU-Zeit (wenn
  der Browser sie misst), Zeichenaufrufe, Dreiecke, JS-Heap, geschätzter Grafikspeicher,
  Objekte, Lichter, Shader, aktive Audioquellen.
- Jeder Wert ist gekennzeichnet: gemessen, **geschätzt** oder **nicht verfügbar**.
- Ausgeschaltet kostet die Messung praktisch nichts.

## Bericht

Der vollständige Auditbericht (Befunde, Ursachen, Messwerte vorher/nachher, Langzeittest,
Risiken, Empfehlungen) liegt als Dokument vor. Bilder/s und GPU-Zeit konnten nur im
Software-Renderer gemessen werden; auf der echten Grafikkarte bitte mit F3 nachmessen.
