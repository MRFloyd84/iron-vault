# IRON VAULT – vollständiges Quellprojekt, Version 45

Export vom 24.10.2026.
Quellcommit: 28f12d6f8e03781bf7ed6615d8f1fddd963dd167

Dies ist die bestehende Three.js-/React-/Vinext-Browsersimulation.
Es ist kein Unreal-Engine-Projekt und kein fertig installiertes Linux-Programm.
Die veröffentlichte Webseite wurde für diesen Export nicht verändert.

## Enthalten

Unveränderter getrackter Projektbestand mit Quellcode, verwendeten lokalen
3D-Modellen, Texturen, Sounds, vorhandenen Tests, Konfigurationen und Berichten.
Enthalten sind der Displayboot, die bereitgestellte Bootaufnahme und der
überblendete Lüfterloop aus Version 45. Der tatsächlich ausgelieferte Mech
liegt unter public/models/iron-vault-rigged.glb. Frühere, nicht getrackte
Original-Uploads und die Git-Historie gehören nicht zu diesem Export.

## Lokal starten (z.B. unter CachyOS)

Voraussetzung: Node.js mindestens 22.13.0 und npm; Node.js 24 ist geeignet.
Der erste Installationslauf braucht Internetzugriff für die npm-Abhängigkeiten.

1. ZIP vollständig entpacken.
2. Terminal im entpackten Ordner IRON_VAULT_v45 öffnen.
3. Befehle ausführen:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Danach die im Terminal ausgegebene lokale Adresse im Browser öffnen.
Nicht durch Doppelklick auf eine einzelne Quelldatei starten.
Mit Strg+C den Entwicklungsserver beenden.

Alternativ enthält das Projekt seinen bisherigen überprüften Installationsweg:

```sh
npm run install:ci
```

## Produktion und Prüfungen

Die vorhandenen Befehle stehen in package.json:

```sh
npm run build
npm start
```

Das Projekt enthält zusätzlich Cloudflare-/Sites-Konfiguration für den bisherigen
Hostingweg. Sie ist Bestandteil des unveränderten Quellstands. Die ursprüngliche
Hostingkennung in .openai/hosting.json ist keine Zugangsbefugnis; dieser Download
enthält keine Hosting-Zugangstokens. Zum eigenständigen Hosting muss die jeweilige
Zielumgebung separat eingerichtet werden.

Dieses Archiv wurde auf Vollständigkeit, Prüfsummen und ZIP-Integrität geprüft.
Der Start auf deinem Laptop wurde für diesen Download nicht neu getestet.
Die beim Entwicklungsstand dokumentierten Prüfungen und Einschränkungen stehen
unter docs/, insbesondere docs/postboot-fan-2026-10-19.md. Dort sind auch die zwei
bekannten Template-Testfehler dokumentiert. scripts/audit-audio-baseline.mjs
benötigt die Git-Historie und funktioniert deshalb nicht mit diesem reinen
Quellarchiv; die normalen Anwendungsmodule benötigen sie nicht.

## Dateien und Nutzung

Die vorhandenen Lizenz-/Herkunftshinweise im Projekt bleiben maßgeblich.
Dieser Export vergibt keine neue pauschale Open-Source-Lizenz für fremde Assets.

DATEIEN_SHA256.json enthält Prüfsummen aller exportierten Originaldateien.
