# IRON VAULT – Roadmap für automatische Verbesserungen

Von Rene am 29.10.2026 abgesegnet. Eine geplante Aufgabe arbeitet diese Liste alle
zwei Tage ab: **pro Lauf genau ein Punkt**, immer der oberste offene.

## Regeln

- Jeder Punkt bekommt einen eigenen Branch `auto/<kurzname>` und einen Pull Request.
- Vor jedem PR muss `npm run check` lokal grün sein (Typen, Lint, Tests, Build).
- **Risikoarm** (Tests, Doku, Übersetzungen, CI, Formatierung): bei grüner Prüfung selbst
  auf `main` mergen. Markierung in der Liste: `[auto]`.
- **Gameplay, Grafik, Umbauten**: nur PR öffnen, Rene testet und mergt. Markierung: `[PR]`.
- Die Versionsnummer in `package.json` wird **nie** geändert. Releases (AppImage,
  Auto-Update) löst nur Rene aus.
- Modelle, Sounds, Texturen und Lizenzdateien werden nicht verändert.
- Jede Änderung bekommt einen kurzen Abschnitt in `AENDERUNGEN_AUTO.md` (deutsch,
  im Stil der bisherigen Änderungsnotizen).
- Braucht ein Punkt eine Designentscheidung, wird ein Vorschlag als PR-Beschreibung bzw.
  Datei unter `docs/vorschlaege/` eingereicht statt Code.
- Erledigte Punkte werden hier abgehakt (`[x]`) mit PR-Nummer.

## Phase A – Sicherheitsnetz

- [x] A1 `[auto]` PR-Prüfung als GitHub Action (`.github/workflows/check.yml`)
- [ ] A2 `[auto]` Prettier-Abweichungen in den 9 Skripten beheben
- [ ] A3 `[auto]` `START_HIER.md` (Überschrift „Version 59“) und Testanzahl in den READMEs aktualisieren

## Phase B – Tests für ungetestete Kernlogik

- [ ] B4 `[auto]` Tests für Missionen und Missionsablauf (`missions.ts`, `mission-director.ts`)
- [ ] B5 `[auto]` Tests für Routenplaner und Waffensystem (`route-planner.ts`, `weapon-system.ts`)
- [ ] B6 `[auto]` Übersetzungs-Check: Test findet angezeigte Texte ohne englischen Eintrag; fehlende Übersetzungen ergänzen

## Phase C – Inhalt

- [ ] C7 `[PR]` 2–3 neue Einsätze in der bestehenden Welt (feste Ziele, nur vorhandene Modelle), z. B. Nachteinsatz mit Wärmebild, Aufklärung unter Zeitdruck
- [ ] C8 `[PR]` Einsatzbericht nach jeder Mission (Zeit, Munition, Schäden, Bestzeiten)
- [ ] C9 `[PR]` Alterung: Display- und Systemstörungen je nach Abnutzung häufiger

## Phase D – Technik

- [ ] D10 `[PR]` Ladezeit: Nebenpanels erst bei Bedarf laden (Haupt-Bundle 455 kB)
- [ ] D11 `[PR]` `cockpit-scene.ts` und `cockpit.tsx` in kleinere Module aufteilen, ohne Verhaltensänderung
- [ ] D12 `[PR]` Abhängigkeiten aktualisieren (monatlich wiederkehrend, u. a. ESLint 9 → aktuell)

## Wenn die Liste leer ist

Keine eigenmächtigen neuen Punkte umsetzen. Stattdessen einen PR mit Vorschlägen für
die nächste Phase öffnen und auf Renes Freigabe warten.
