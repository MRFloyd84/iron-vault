# Änderungen in Version 63 – Grafikeinstellungen

## Grafikmenü (Regler-Symbol oben rechts)

- Neues Menü neben der Sprachwahl. Die Schaltfläche zeigt die aktive Voreinstellung
  (HOCH, MITTEL, NIEDRIG oder EIGENE).
- **Voreinstellung:** Hoch, Mittel oder Niedrig mit einem Klick.
- Einzeln einstellbar:
  - **Auflösung:** 100 %, 85 %, 70 %, 50 % der bisherigen Renderauflösung
  - **Schatten:** Hoch (wie bisher), Mittel, Niedrig (kleinere Schattenkarten) oder Aus
  - **Sichtweite:** Weit 2,6 km (wie bisher), Mittel 1,5 km, Nah 0,9 km. Der Dunst wird
    passend dichter, damit die Welt am Rand weich verschwindet statt abgeschnitten zu werden.
  - **Kameramonitor:** Flüssig (wie bisher, ca. 25 Bilder/s) oder Sparsam (ca. 10 Bilder/s)
- Änderungen wirken sofort und werden im Browser bzw. in der App gespeichert.
- **„Hoch“ ist genau der bisherige Stand und die Voreinstellung.** Ohne eigene Wahl ändert
  sich am Bild nichts.
- Mit **F3** siehst du direkt, was eine Einstellung bringt (Bildzeit, GPU-Zeit,
  Zeichenaufrufe).
- Schatten ein- oder ausschalten übersetzt die Materialien neu; das kann einmal kurz stocken.

| Voreinstellung | Auflösung | Schatten | Sichtweite | Kameramonitor |
| --- | --- | --- | --- | --- |
| Hoch | 100 % | Hoch | Weit | Flüssig |
| Mittel | 85 % | Mittel | Mittel | Flüssig |
| Niedrig | 70 % | Niedrig | Nah | Sparsam |

## Diagnose (F3)

- Hänger über eine Sekunde werden jetzt mitgezählt (Bildzeit max, 1 % Low). Nur Pausen bei
  verdecktem Tab bleiben außen vor.
