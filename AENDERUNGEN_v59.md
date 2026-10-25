# Änderungen in Version 59 – Englisch und Sprachmenü

IRON VAULT gibt es jetzt auf Deutsch und Englisch.

## Sprachmenü

- **Wo:** Oben rechts in der Werkzeugleiste sitzt ein neuer Knopf (Sprachsymbol mit
  „DE“ bzw. „EN“). Er öffnet ein kleines Menü: **Deutsch** und **English**.
- **Umschalten:** Der Wechsel wirkt sofort, ohne Neustart. Die Simulation läuft einfach
  weiter.
- **Speicherung:** Die Wahl wird gespeichert, im Browser und in der Desktop-App.
- **Erster Start:** Ohne gespeicherte Wahl richtet sich die Sprache nach Browser bzw.
  System. Deutsch bleibt Deutsch, alles andere startet auf Englisch.

## Was übersetzt ist

- **Oberfläche:** Kopfzeile, Ansichtsknöpfe, Gelenk-Bedienfeld, Audioprüfung, Ladebildschirm
  und Fehlermeldungen.
- **Hilfe:** Die komplette Hilfe ist neu auf Englisch geschrieben (`app/help-content.ts`).
- **Displays:** Alle zehn Cockpit-Displays mit Checklisten, Systemtest, Kühlung, Elektrik,
  Hydraulik, Freigabe, Kameras und Bootsequenz.
- **Meldungen:** Alle Meldungen der Maschine, auch zusammengesetzte wie „Gehen gesperrt:
  Parkverriegelung zuerst lösen.“ → „Walking locked: Release the parking lock first.“
- **Kanzel:** Hover-Texte der Schalter und Beschriftungen in der Kanzel.
- **Zettel und Schilder:** Die handschriftlichen Zettel, die Prüfplakette und das Schild an
  IV-02 („OUT OF SERVICE · PARTS DONOR FOR IV-04“). Sie werden beim Wechsel neu gezeichnet.
- **Zahlen:** Im Englischen steht ein Dezimalpunkt statt eines Kommas (3,0 s → 3.0 s).
- **Unverändert:** Was schon englisch war, bleibt so, z. B. das Overhead (FUEL PUMP,
  APU MASTER …) und die Schalterbeschriftungen.

## Technik

- **Übersetzungskern (`lib/i18n.ts`):** Der Quelltext bleibt deutsch. `tr()` übersetzt erst
  beim Anzeigen. Zustandslogik und Tests sind dadurch unberührt.
- **Wörterbuch (`lib/i18n-en.ts`):** Rund 600 Einträge. Zusammengesetzte Meldungen stehen
  dort als Muster mit Platzhaltern (`'Gehen gesperrt: {0}'`); die eingesetzten Teile werden
  ihrerseits übersetzt.
- **Fehlende Einträge:** Fehlt eine Übersetzung, bleibt der deutsche Text stehen. Es
  erscheint nie ein leeres Feld.
- **Sprachwechsel:** Displays werden sofort neu gezeichnet. Feste Beschriftungen (Texturen)
  melden sich über `onLangChange` an und zeichnen sich neu (`lib/i18n-canvas.ts`).
- **Sprachmenü:** `app/language-menu.tsx`.

## Weitere Sprache hinzufügen

1. `lib/i18n-xx.ts` nach dem Muster von `i18n-en.ts` anlegen.
2. In `LANGUAGES` und im Typ `Lang` in `lib/i18n.ts` eintragen.
3. Die Hilfe in `app/help-content.ts` ergänzen.

## Tests

Neue Tests (189 von 189):

- **Vollständigkeit:** Jeder deutsche Anzeigetext im Quelltext hat eine Übersetzung. Das
  prüft der Test automatisch über den TypeScript-Syntaxbaum. Neue Texte ohne Übersetzung
  lassen ihn rot werden.
- **Wörterbuch:** Die Übersetzungen enthalten keine Umlaute, und die Platzhalter stimmen.
- **Meldungen:** Zusammengesetzte Meldungen und Zahlen werden richtig übersetzt.
- **Hilfe:** Sie ist in beiden Sprachen gleich gegliedert.
