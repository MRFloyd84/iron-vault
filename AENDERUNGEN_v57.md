# Änderungen in Version 57 – IRON VAULT als Desktop-App (AppImage)

IRON VAULT läuft jetzt auch als eigenständiges Programm, ohne Browser und ohne Webserver.
Getestet ist es unter Linux (x86_64), gedacht für CachyOS/Arch.

## Installieren (CachyOS)

```sh
sudo pacman -S fuse2                        # einmalig, AppImages brauchen FUSE 2
bash install-desktop.sh IRON_VAULT-0.57.0-x86_64.AppImage
```

- **Was das Skript macht:** Es kopiert das Programm nach `~/Applications/`, legt einen
  Startmenü-Eintrag „IRON VAULT“ unter Spiele an und installiert das Symbol. Es braucht kein
  root.
- **Entfernen:** `bash install-desktop.sh --remove`
- **Ohne Installation:** Das AppImage geht auch direkt, mit `chmod +x` und Doppelklick.

## Bedienung

- **F11:** Vollbild (zusätzlich zum Vollbild-Knopf oben rechts).
- **Fenster:** Ein zweiter Start öffnet kein zweites Fenster, sondern holt das laufende nach
  vorn.
- **Ton:** Er darf ohne vorherigen Klick starten.
- **Wayland:** Unter KDE- oder GNOME-Wayland läuft das Programm nativ.

## Selbst bauen

```sh
npm ci
npm run app          # Desktop-Fenster direkt aus dem Projekt starten (zum Ausprobieren)
npm run dist:linux   # baut release/IRON_VAULT-<version>-x86_64.AppImage
```

## Technik

- **Gerüst:** Electron 45 (`electron/main.cjs`), verpackt mit electron-builder.
- **Laden:** Der fertige Vite-Build wird über ein eigenes Protokoll `app://iron-vault/`
  geladen. Modelle, Texturen und Sounds laden damit genau wie auf einem Webserver; mit
  `file://` ginge das nicht.
- **Ordnerschutz:** Ausgeliefert wird nur, was in `dist/` liegt.
- **Abhängigkeiten:** React, three.js und lucide-react stehen jetzt unter
  `devDependencies`. Vite bündelt sie ohnehin, und so landen sie nicht ein zweites Mal im
  Paket. Die App selbst (`app.asar`) ist 43 MB groß, das AppImage mit Chromium rund 150 MB.
- **Symbol:** `build/icon.svg` ist das IV-Wappen als gealterte Platte, mit Kratzern und
  rotem Grundierungsfleck.
- **Browser-Version:** Sie bleibt unverändert: `npm run dev`, `npm run build` und `dist/`
  auf einem Webserver funktionieren wie bisher.

## Geprüft

- Das gebaute Programm wurde automatisch gestartet (Playwright-Electron).
- Startseite, Mech-Außenansicht und das Laden von Sounds und Modellen über `app://`
  funktionieren, ohne Konsolenfehler.
- Das AppImage selbst lief 60 s stabil.
- Das Installationsskript wurde in einem Test-Home installiert und wieder entfernt.
