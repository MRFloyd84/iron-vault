# Automatische Verbesserungen

Kurze Notizen zu den Änderungen, die die geplante Aufgabe aus `ROADMAP.md` umsetzt.
Neueste Einträge oben.

## A2 – Einheitliche Formatierung (Prettier)

- Für Spieler ändert sich nichts.
- Neun Dateien wichen von der Prettier-Formatierung ab: sechs Hilfsskripte unter `scripts/`,
  zwei Tests und die englische Übersetzung `lib/i18n-en.ts`. Sie sind jetzt mit
  `npm run format` umformatiert, nur Zeilenumbrüche und Einrückung, kein Inhalt.
- `npm run format:check` meldet damit keine Abweichungen mehr.
