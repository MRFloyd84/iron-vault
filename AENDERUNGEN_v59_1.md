# Änderungen in Version 59.1 – Lizenzbereinigung

- **IV-02 nicht mehr öffentlich:** Das Modell von IV-02 stammt aus dem kostenlosen
  CGTrader-Modell „Juggernaut“ von Megalord. Die Standardlizenz von CGTrader erlaubt keine
  offene Weitergabe der Modelldaten. `public/models/iv-02-sister.glb` ist deshalb aus dem
  Repository und seiner Historie entfernt; die öffentlichen Releases kommen ohne IV-02.
- **IV-02 ist jetzt optional:** Liegt die Datei lokal vor (erzeugt mit
  `scripts/prepare-sister-mech.mjs`), erscheint IV-02 wie bisher. Sie wird von git
  ignoriert. Fehlt die Datei, bleibt der Stellplatz leer und begehbar, ohne Fehlermeldung.
- **Pixabay-Originale entfernt:** Die unbearbeiteten Pixabay-Originale sind aus dem
  Repository entfernt (Lizenz: keine Einzelweitergabe). Das Spiel nutzt weiter die
  bearbeiteten Fassungen.
- **Open Source:** MIT-Lizenz für den Quelltext; `ASSETS.md` listet das Fremdmaterial
  mit Quellen und Bedingungen.
- **Tests:** Ein Test prüft, dass IV-02 nur dann ein Hindernis ist, wenn das Modell
  geladen wurde. Die Prüfung der Modelldatei läuft nur, wenn die Datei vorhanden ist.
