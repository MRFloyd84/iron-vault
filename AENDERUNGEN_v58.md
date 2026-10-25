# Änderungen in Version 58 – Automatische Updates über GitHub

Die Desktop-App holt sich neue Versionen jetzt selbst. Die Updates kommen als Releases
aus dem GitHub-Repo `MRFloyd84/iron-vault`.

## So läuft ein Update

1. **Prüfen:** Einige Sekunden nach dem Start, wenn das Spiel geladen ist, fragt die App
   leise bei GitHub nach, ob es ein neueres Release gibt.
2. **Laden:** Gibt es eins, lädt sie es im Hintergrund. Den Fortschritt zeigt das
   Taskleisten-Symbol als Balken.
3. **Einspielen:** Danach erscheint der Hinweis „Update auf Version … ist bereit“.
   - **Jetzt neu starten:** Die App ersetzt sich selbst und startet in der neuen Version.
   - **Später:** Das Update wird beim nächsten Beenden eingespielt.
4. **Ohne Internet oder ohne Release** startet die App ganz normal. Es kommt keine
   Fehlermeldung.

- **Dateiname:** Das AppImage ersetzt sich unter seinem bisherigen Namen,
  `~/Applications/IRON_VAULT.AppImage` aus dem Installationsskript. Der Startmenü-Eintrag
  bleibt dadurch gültig.
- **Datenmenge:** Updates werden nach Möglichkeit nur in den geänderten Blöcken geladen
  (Blockmap im AppImage), sonst komplett.

**Einmalig:** Version 57 hatte noch keinen Update-Mechanismus. v58 muss deshalb einmal von
Hand installiert werden (`bash install-desktop.sh IRON_VAULT-0.58.0-x86_64.AppImage`). Ab
dann kommen alle Updates von allein.

## Neues Release veröffentlichen

Das übernimmt GitHub selbst (`.github/workflows/release.yml`):

1. **Version erhöhen:** in `package.json`, z. B. auf `0.59.0`.
2. **Hochladen:** committen und nach `main` pushen.
3. **Prüfen auf GitHub:** Typen, Lint, alle Tests und der Build laufen.
4. **Veröffentlichen:** Nur ein grünes Projekt kommt als Release `v0.59.0` heraus, mit
   AppImage, `latest-linux.yml` und Installationsskript.

- **Doppelt veröffentlichen geht nicht:** Gibt es das Release zur Version schon, passiert
  nichts.
- **Per Hand:** Auf GitHub unter Actions → Release → „Run workflow“.
- **Kein Token nötig:** Den Zugang stellt GitHub dem Bau selbst bereit.
- **Lokal:** `npm run dist:linux` baut weiterhin nur lokal.

## Eigener Update-Server statt GitHub

Mit der Umgebungsvariable `IRON_VAULT_UPDATE_URL=http://pi.local/iron-vault/` fragt die App
einen eigenen Webserver. Dort müssen dieselben Dateien liegen wie in einem Release.

## Technik

- **Bibliothek:** `electron-updater` (in `electron/main.cjs`). Sie ist die einzige
  Laufzeit-Abhängigkeit; alles andere bündelt Vite.
- **Quelle:** Die Update-Quelle steht in `package.json` → `build.publish` (GitHub,
  `MRFloyd84/iron-vault`, nur echte Releases, keine Entwürfe).
- **Nur im AppImage:** Geprüft wird nur im installierten AppImage, nicht bei `npm run app`.

## Geprüft (Ende-zu-Ende)

- **Aufbau:** Die App wurde als v0.58.0 gebaut und installiert. Daneben wurde eine v0.58.1
  über einen lokalen Webserver angeboten.
- **Ablauf:** Die alte App fand das Update, lud es und meldete „bereit“. Beim Beenden ersetzte
  sie `IRON_VAULT.AppImage` durch die neue Version; die Prüfsumme stimmte mit v0.58.1 überein.
- **Einschränkung:** Der anschließende Neustart der neuen Version braucht FUSE. Das ließ sich
  im Testsystem nicht prüfen, unter CachyOS mit `fuse2` ist es vorhanden.
