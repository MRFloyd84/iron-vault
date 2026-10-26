# IRON VAULT

[English](README.md) · **Deutsch**

Eine Cockpit-Simulation eines alten, verschlissenen Lauf-Mechs – **IV-04** – in 3D. Du
sitzt in der Pilotenkapsel, fährst die Maschine Schalter für Schalter aus dem Kaltstart
hoch, läufst aus dem Hangar in die Wüste und erledigst mit Armkanonen und Drohne
Aufklärungs- und Zerstörungseinsätze. Läuft im Browser oder als Linux-Desktop-App.

**▶ [Im Browser spielen](https://mrfloyd84.github.io/iron-vault/)** – ohne Installation
(Desktop-Browser mit WebGL, Ton an). · **[Für Linux herunterladen](https://github.com/MRFloyd84/iron-vault/releases/latest)**

![Cockpit von IV-04](docs/img/cockpit.jpg)

## Funktionen

- **Echter Kaltstart:** Batterien, Kraftstoffpumpe, APU, Kühlung, Hydraulik, Reaktor,
  Gyro, Neurohelm und Systemtest – 20 Checklisten-Schritte bis zur Steuerfreigabe. Zehn
  funktionierende Cockpit-Displays mit Checklisten führen durch.
- **Simulierte Systeme:** Stromversorgung mit Batterien, APU, Hangarstrom und
  Überlastschutz; Kühlkreislauf mit Pumpen, Leck und Restwärme; Hydraulik; geordnetes
  Herunterfahren mit Nachkühlung. Übungsstörungen lassen sich gezielt auslösen.
- **Gehen:** Beine mit inverser Kinematik und fest stehenden Füßen, sichtbare
  Hydraulikzylinder, Kanzelstoß bei jedem Schritt, Staub, Fußabdrücke und Schrittgeräusche.
- **Torso und Arme:** Torso drehen, Arme anheben und beugen.
- **Waffen:** zwei 30-mm-Armkanonen mit freiem Zielen per Maus, Laser-Entfernungsmesser,
  Schießstand mit Klappzielen.
- **Aufklärungsdrohne:** Auf dem Rücken sitzt ein geflickter Quadrocopter. Starten, mit
  Tastatur und Maus fliegen – auf dem Kameramonitor im Cockpit oder im Vollbild – und Ziele
  für die Armkanonen per Laser markieren. Begrenzter Akku und Funk; sie fliegt selbst heim.
- **Wüste mit 1,5 × 1,5 km:** Pisten zu Raffinerie, Förderanlage, Funkstation auf dem
  Kamm, Munitionsdepot und Ruinensiedlung; Pipeline, Stromleitung, Tafelberge, ein
  Dünenfeld und das verschollene Wrack von IV-01. IV-04 läuft am Hang; zu steiles Gelände
  lehnt die Steuerung ab.
- **Einsätze:** sechs Aufklärungs- und Zerstörungseinsätze aus der Einsatzleitung mit
  Reliefkarte – Objekte mit der Drohne erfassen, Tanks, Radar, Lastwagen und
  Schieberstationen zerstören (Explosionen, Brand, Rauch), dann zurück in die Halle. Ein
  echtes Taktik-Display und ein Wegweiser führen.
- **Wetter und Licht:** Tag/Nacht, Scheinwerfer und Rundumleuchte, Regen mit nasser
  Panzerung, Pfützen und Tropfen auf der Scheibe, Gewitter.
- **Eine alte Maschine:** flimmernde Röhrendisplays in Giftgrün, abgenutzter Lack, Zettel
  und Klebeband in der Kanzel – und, wenn du das Modell selbst ergänzt, das
  ausgeschlachtete Schwesterschiff **IV-02** als Teilespender vor der Werkstatt (siehe
  [ASSETS.md](ASSETS.md)).
- **Deutsch und Englisch**, jederzeit umschaltbar.

| | |
| --- | --- |
| ![IV-04 im Hangar](docs/img/mech.jpg) | ![Hydraulikzylinder an den Beinen](docs/img/hydraulics.jpg) |
| ![IV-02, das abgestellte Schwesterschiff](docs/img/iv-02.jpg) | ![Die Wüste rund um das Testgelände](docs/img/desert.jpg) |
| ![Einsatzleitung mit Reliefkarte](docs/img/missions.jpg) | |

## Herunterladen (Linux-Desktop-App)

Unter [Releases](https://github.com/MRFloyd84/iron-vault/releases/latest) die neueste
`IRON_VAULT-…-x86_64.AppImage` und `install-desktop.sh` laden.

```sh
sudo pacman -S fuse2          # Arch/CachyOS, einmalig – AppImages brauchen FUSE 2
                              # (Debian/Ubuntu: sudo apt install libfuse2)
bash install-desktop.sh IRON_VAULT-0.59.0-x86_64.AppImage
```

Das installiert IRON VAULT nur für deinen Benutzer (ohne root) mit Startmenü-Eintrag. Die
App **aktualisiert sich selbst**: Beim Start prüft sie die GitHub-Releases, lädt eine
neue Version im Hintergrund und bietet einen Neustart an. Entfernen mit
`bash install-desktop.sh --remove`.

Ohne Installation: AppImage mit `chmod +x` ausführbar machen und starten.

## Aus dem Quelltext starten

Voraussetzung: Node.js 22.13 oder neuer und npm.

```sh
git clone https://github.com/MRFloyd84/iron-vault.git
cd iron-vault
npm ci
npm run dev          # http://127.0.0.1:5173
```

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung und statischer Build nach `dist/` (jeder Webserver genügt) |
| `npm run app` | Desktop-Fenster direkt aus dem Projekt öffnen |
| `npm run dist:linux` | AppImage nach `release/` bauen |
| `npm test` | alle Tests (Zustandslogik, Audio, Displays, Geometrie, Übersetzungen) |
| `npm run check` | Typen, Lint, Tests und Build zusammen |

Eine neue Versionsnummer in `package.json`, die auf `main` ankommt, baut und
veröffentlicht GitHub Actions automatisch als Release. Mehr zum Start und zu den Ordnern
steht in [`START_HIER.md`](START_HIER.md).

## Erste Schritte im Cockpit

Der **?**-Knopf oben rechts erklärt alles. Kurz:

| Taste | Aktion |
| --- | --- |
| Rechte Maustaste | umsehen |
| Linke Maustaste | Schalter bedienen, Monitore zum Heranzoomen anklicken |
| O | Overhead: BAT 1, BAT 2, FUEL PUMP, APU … |
| G | Hangarstrom verbinden (Kaltstart ohne APU) |
| 1 – 6 | Hauptstrom, Kühlung, Diagnose, Reaktor, Stabilisierung, Steuerfreigabe |
| T / K | Systemtest / Herunterfahren |
| W A S D, Leertaste | gehen, drehen, bremsen |
| Q / E, B | Torso drehen, Gelenk-Bedienfeld |
| V / H / U | Mech-Außenansicht / Hallenkamera / Testgelände |
| M, P, J | Waffen, Laser, Scheinwerfer |
| C, Tab | Drohne starten/zurückrufen, Drohnensicht |
| I | Einsatzleitung und Karte |
| F3 | Diagnoseanzeige (FPS, Bildzeit, Zeichenaufrufe, Speicher) |
| Regler-Symbol oben rechts | Grafikeinstellungen (Hoch/Mittel/Niedrig, Auflösung, Schatten, Sichtweite) |
| N, Z, L | Tag/Nacht, Regen, Kabinenlicht |
| X / Y | Oberkörper nach oben / unten neigen |
| Umschalt | Geschwindigkeitsstufe 1 / 2 |

## Technik

React 19, three.js, Vite und TypeScript; Electron und electron-builder für die
Desktop-App. Alles läuft lokal – keine CDNs zur Laufzeit. Die Displays sind
Canvas-Texturen auf echten 3D-Bildschirmen; Alterung, Verschleiß, Regen und Lack sind
Shader. Geräusche sind Aufnahmen und Web-Audio-Synthese.

Änderungen je Version: `AENDERUNGEN_v46.md` … Die Entwicklungsgeschichte bis v45 steht in
[`docs/ENTWICKLUNG_BIS_v45.md`](docs/ENTWICKLUNG_BIS_v45.md).

## Modelle, Materialien, Geräusche

- **IV-04** ist eine vereinfachte, neu geriggte Fassung eines mit Tripo erzeugten
  Mech-Modells.
- **IV-02** beruht auf „Juggernaut“ von Megalord (CGTrader, kostenloses Modell). Das
  Modell ist aus Lizenzgründen nicht enthalten; `scripts/prepare-sister-mech.mjs` wandelt
  den eigenen Download um (10 Millionen → 273.000 Dreiecke, per Shader lackiert).
- **Materialien:** bereitgestellte Textursätze, aufgeführt in
  `public/materials/sources.json`.
- **Geräusche:** Aufnahmen Dritter (Namen, Schnitte und Bearbeitung in
  `public/audio/*-sources.json`), Hydraulikgeräusche mit ElevenLabs erzeugt, alles Übrige
  mit Web Audio synthetisiert.

## Lizenz

Der Quelltext ist Open Source unter der [MIT-Lizenz](LICENSE) – nutzen, ändern,
weitergeben. Ausgenommen sind Modelle, Texturen und Geräuschaufnahmen; für sie gelten die
Bedingungen ihrer Quellen, siehe [ASSETS.md](ASSETS.md).

Beiträge, Fehlermeldungen und Ideen gern als
[Issues](https://github.com/MRFloyd84/iron-vault/issues) oder Pull Requests.
