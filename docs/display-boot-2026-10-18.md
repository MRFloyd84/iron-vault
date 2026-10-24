# Kaltzustand und Displayboot

## Korrektur: Anzeigen reagieren bereits auf Batteriestrom

Nach Nutzerrückmeldung wurde die Einschaltbedingung der veröffentlichten Version 39 (Commit `37b85c87830324c527a580b31f03c9ed5fdc5fd0`) geprüft. Ursache: `DisplayBoot.update()` verlangte sowohl Startstufe 1 als auch Hauptstrom. BAT 1 oder BAT 2 versorgten den vorhandenen Steuerbus bereits korrekt, die Anzeige blieb trotzdem schwarz. Die nachfolgende ältere Beschreibung des Hauptstrom-Triggers ist damit überholt.

- `lib/display-boot.ts`: Der Boot verwendet jetzt die bestehende Funktion `dcPowerAvailable()`. Eine geladene, verbundene Batterie oder Hangar-/Generatorversorgung startet sofort die 13 Sekunden. Die Kaltlichtunterdrückung und blinkende BAT-1-Orientierung enden ebenfalls bei verfügbarem Bordstrom. Keine Änderung an technischen Startstufen, Mechanik oder Bewegungsfreigaben.
- `app/cockpit.tsx`: Bedienhilfe nennt den korrigierten Einschaltpunkt.
- `tests/display-boot.test.mjs`: echte BAT-1-/BAT-2-Schaltbefehle, leere Batterien, Quellenwechsel, letzter Versorgungsverlust und erneuter Boot geprüft. Pixelprüfung aller zehn Anzeigen erfolgt nun ausdrücklich mit BAT 1 allein bei Startstufe 0.

Prüfungen: Produktionsbuild bestanden; 29/29 gezielte Tests bestanden, keine übersprungen. Die vollständige Suite besteht 144/146 Tests; dieselben zwei bekannten Templateprüfungen (Preview-Meta und Scrollbar-CSS) schlagen fehl. Typecheck weiterhin nur mit den drei bekannten fehlenden Cloudflare-Typen. Keine neue Produktionsabhängigkeit und keine zusätzlichen Renderpässe. Eine interaktive WebGL-Prüfung ist hier nicht verfügbar; Canvaspixel und Zustandslogik wurden ausgeführt, die vollständige Browserdarstellung bleibt ungeprüft.

Vor Änderungen vollständige Sicherung angelegt und mit `tar -dzf` ohne Unterschiede geprüft:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_battery_display_start_2026-10-18.tar.gz`

SHA-256: `aad1a597553099424a2e43619c1069d2ada53cb094d098998a5964fd979550ab`.

Wiederherstellung: Archiv in einen neuen leeren Ordner entpacken; es enthält den vollständigen Ausgangsordner `iron-vault-publish`. Für eine Online-Rücknahme ist die vorherige veröffentlichte Version 39 erhalten: `appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_e2d893a3c3c88191bbd012403f0f9a78`.

18.10.2026 – gezielte Änderung auf Basis der veröffentlichten Version 38, Commit `7b16f505746d0e539ce3fd566bb730ea2ea8a1f2`.

## Gewünschtes Verhalten

- Alle zehn Displays sind bei Kaltstart schwarz. Das unbeleuchtete HUD bleibt transparent.
- Nur die vorhandene kleine BAT-1-LED blinkt grün als Orientierung. Diese gewünschte optische Orientierung ist keine Batterie-Ladestandsanzeige. Bei reduzierter Bewegung leuchtet sie ruhig.
- Batterie/APU allein aktivieren die Bildschirme nicht. Nach Freigabe von Hauptstrom [1] booten alle Anzeigen 13 Sekunden lang.
- Die Bootbilder zeigen Anzeigeninitialisierung und übernehmen dann die bestehenden Instrumentenseiten. Sie behaupten keine zusätzlichen bestandenen Hydraulik- oder Mechaniktests.
- Stromverlust löscht alte Inhalte sofort. Ein neuer Start durchläuft wieder die vollen 13 Sekunden. Quellenwechsel ohne Busverlust startet die Anzeigen nicht neu.
- Touchflächen sind bei ausgeschalteten/bootenden Displays blockiert. Physische Schalter und technische Startlogik bleiben vorhanden.
- Hangarstrom bleibt über G auch vor dem Displayboot anschließbar. Es wird derselbe vorhandene `serviceCommand(68)` mit denselben Sicherheitsbedingungen aufgerufen.

## Technische Änderung / Dateien

`lib/display-boot.ts`: separate Präsentationszustände off/boot/ready, 13-Sekunden-Timer, BAT-1-Orientierung, native Bootdarstellung für normale Monitore, HUD und schmale elektrische Leiste. Keine Änderung des MachineState-Schemas oder der sechs technischen Startphasen.

`lib/display-surface.ts`: Der nach Nutzerrückmeldung zweimal nicht erkennbare Shaderpfad wurde gezielt durch direkte Canvaszeichnung ersetzt. Scanlines liegen nun in den bereits hochgeladenen Displaytexturen. Transparenz des HUD bleibt durch source-atop erhalten. Bewegte leichte Abdunklung und eine langsame Refreshzone erzeugen das Flimmern. Bei reduzierter Bewegung bleiben nur statische Linien.

`lib/cockpit-scene.ts`: verbindet Versorgung, Boot, unmittelbare Löschung, Kamera-/Canvasumschaltung und Touchsperre. Cockpitbeleuchtung bleibt im kalten Stand aus; Umgebungslicht des Hangars bleibt erhalten. Warnungen bei heißer unterbrochener Abschaltung werden nicht als Kaltzustand behandelt.

`lib/surround-cameras.ts`: zeichnet dieselben Linien in das bestehende Kameraoverlay und verwirft alte Kamerabilder bei Stromverlust. Während des Boots werden keine Livekameras aufgenommen.

`app/cockpit.tsx`: G als zusätzliche Bedienung des bestehenden Hangarstromanschlusses; Hilfe auf Kaltzustand/Boot angepasst.

`tests/display-boot.test.mjs`, `tests/display-surface.test.mjs`, `tests/canvas-fixture.mjs`, `tests/surround-cameras.test.mjs`: Tests der Versorgung, Dauer, Neustarts, Kameralöschung, reduzierter Bewegung und der tatsächlich gezeichneten Pixel. Native Canvas-Pixeltests verwenden ein vorhandenes optionales QA-Paket; keine Produktionsabhängigkeit wurde hinzugefügt. Auf Hosts ohne dieses Paket werden die Pixeltests ausdrücklich übersprungen; hier wurden sie ausgeführt.

## Sicherung und Rücknahme

Vor jeder Projektänderung dieses Änderungssatzes wurde der vollständige verfügbare Projektordner gesichert:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_display_boot_2026-10-18.tar.gz`

SHA-256: `b4ea19e020f3700b5f026452f75c75abc2b614d7d48142331df2e77477f04ab4`.

Das Archiv wurde per `tar -dzf` vollständig und ohne Unterschiede mit dem Ausgangsordner verglichen. Für eine lokale Wiederherstellung in einen neuen leeren Ordner entpacken, niemals über den aktuellen Stand. Die veröffentlichte Version 38 bleibt zusätzlich als Rückkehrversion erhalten:

`appgprj_6a973bc9d2f08191bfd2684e4c359b83~appgver_15a1a3cf46948191a69d1aab807f0564`.

## Prüfungen und Grenzen

Gezielte Tests prüfen echte Canvaspixel aller zehn Displays auf Schwarz/Transparenz, Boottext und Löschung. Scanline-Kontrast, zeitliche Änderung, HUD-Transparenz und reduzierte Bewegung wurden ebenfalls an Pixeln geprüft. Zwei gerenderte Bootbilder (normaler Monitor und elektrische Leiste) wurden zusätzlich visuell inspiziert.

Ergebnisse vor dem Verpacken: Produktionsbuild bestanden; 27/27 gezielte Tests bestanden, keine übersprungen. Vollständige Suite: 142/144 bestanden. Es fehlen nur die bereits bekannten zwei Templateverträge (Preview-Meta und CSS-Katalogutility). Der separate Typecheck meldet weiterhin nur die bekannten drei Cloudflare-Typfehler. Es wird kein vollständig grünes Gesamtqualitätsgate behauptet.

Es gibt keine zusätzlichen Renderpässe, Texturen oder Renderziele. Das bestehende Maximum von einem regulären Displayupload je Frame bleibt erhalten. Bei Stromverlust werden einmalig alle zehn Displaytexturen gelöscht/aktualisiert, um alte Inhalte sicher zu entfernen. Das bestehende Kameraoverlay wird zusätzlich mit einfachen Linien gezeichnet. Frametimes auf echter Hardware wurden nicht gemessen.

Echte WebGL-/Browserprüfung ist weiterhin nicht verfügbar. Die gezeichneten Canvaspixel wurden nachgewiesen; der gesamte dreidimensionale Bildeindruck auf Zielbrowsern ist damit noch nicht abgenommen.

Der Boot ist eine Anzeigeinitialisierung. Er ersetzt weder technische Startchecks noch die vorhandene Bewegungsfreigabe und fügt keine zweite Physik-/Startzustandsmaschine hinzu. Die Hauptsysteme laufen während des Displayboots entsprechend ihrer bestehenden Zustände weiter.
