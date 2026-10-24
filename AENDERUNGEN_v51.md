# Änderungen in Version 51 – echter Regenklang, Gewitter, dezentere Tropfen

## Deine Aufnahmen im Regenmodus

- **Regen:** „Gentle rain falling #2“ ist nur 2,4 s lang. Als Schleife würde man die
  Wiederholung hören. `scripts/prepare-rain-audio.py` baut daraus eine 16-s-Schleife
  (`public/audio/rain-loop.ogg`):
  - Vier versetzte Lagen aus zufällig gewählten, weich überblendeten Stücken.
  - Die Kanäle werden teils getauscht, damit es räumlich wirkt.
  - Die Nahtstelle ist überblendet.
  - Der Pegel bleibt gleichmäßig (Schwankung unter 1,5 dB pro halbe Sekunde).
- **Donner:** „thunder #4“ enthält zwei Schläge. Daraus werden `thunder-1.ogg`
  (ferner Roll, 5,0 s) und `thunder-2.ogg` (schwerer Schlag, 5,1 s), beide sauber
  ausgeblendet.
- Die Originale liegen unverändert in `assets-src/audio/`. Prüfsummen und Pegel stehen in
  `public/audio/weather-sources.json`.
- In der **Kanzel** klingt der Regen gedämpft (Tiefpass), dazu kommt ein leises Trommeln
  auf dem Blech. **Draußen** klingt er offen und hell. Der bisherige synthetische
  Rauschteppich bleibt nur noch leise als Unterlage.
- Die Dateien werden erst beim ersten Regen geladen und verlängern den Start nicht.

## Gewitter

- Bei vollem Regen kommt der erste Blitz 6–14 s nach Regenbeginn, danach alle 15–45 s
  einer.
- **Blitz:** Himmel und Umgebung flackern kurz bläulich-hell auf, als Doppelblitz. Nachts
  wirkt er deutlich stärker als am Tag. Bei „Bewegung reduzieren“ gibt es nur ein
  sanftes Aufhellen ohne Flackern.
- **Donner:** Er folgt mit Verzögerung nach Entfernung, nah nach 0,6 s und fern nach bis
  zu 5,6 s.
  - Nahe Einschläge nutzen den schweren Schlag: laut und hell.
  - Ferne nutzen den Roll: leiser, dumpfer und etwas tiefer abgespielt.
  - In der Kanzel klingt der Donner zusätzlich gedämpft.
- Den Takt der Blitze stellst du in `Storm` in `lib/weather.ts` ein.

## Tropfen auf der Scheibe

- Die Tropfen sind deutlich kleiner (Radius etwa 1–4 statt 2–8,5 Pixel der
  Scheibentextur) und weniger.
- Sie sind dezenter gezeichnet, die Laufspuren sind kürzer und schwächer.
- Erst größere Tropfen fangen an abzulaufen.

## Tests

- Neuer Test für das Gewitter: Blitze gibt es nur bei starkem Regen, Häufigkeit und
  Donnerverzögerung stimmen, ebenso Doppelflackern und reduzierte Bewegung.
- Damit sind es 173 von 173 grünen Tests.
- Im Browser geprüft: Die drei neuen Dateien laden (HTTP 200) und lassen sich dekodieren
  (16,00 s / 5,00 s / 5,10 s). Der Blitz ist sichtbar. Wie der Klang auf deinen
  Lautsprechern wirkt, ist nicht abgehört.
