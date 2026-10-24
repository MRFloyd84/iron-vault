# Cockpitdisplays: Scanlines und dezentes Flimmern

## Nachkorrektur nach Rückmeldung zur Sichtbarkeit

Version 37 wurde veröffentlicht; die Rückmeldung lautete, dass keine Änderung erkennbar sei. Die ursprüngliche Distanz-Ausblendung entfernte bei 720 Quellzeilen und 180 Linien den Effekt vollständig unter etwa 277 dargestellten Pixeln Bildschirmhöhe. Diese Shaderbedingung ist rechnerisch belegt; eine GPU-Aufnahme liegt weiterhin nicht vor.

Die Nachkorrektur verwendet eine adaptive Liniendichte mit mindestens 3,5 gerenderten Pixeln Abstand. Dadurch bleiben die Linien auch in der Pilotensicht erhalten, statt vollständig ausgeblendet zu werden. Maximaler Linienkontrast jetzt 14 Prozent, Helligkeitsflimmern maximal ±1,8 Prozent. Reduzierte Bewegung deaktiviert weiterhin das Flimmern. Shader-Cachekennung auf v2 erhöht. Keine zusätzlichen Renderpässe, Texturen oder Canvasuploads.

Vor dieser Korrektur wurde der vollständige verfügbare Projektordner gesichert und per `tar -dzf` ohne Abweichungen verglichen: `/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_visible_scanlines_2026-10-18.tar.gz`. Wiederherstellung durch Entpacken in einen neuen leeren Ordner; veröffentlichte Version 37 bleibt zusätzlich als Rückkehrstand erhalten. Die folgenden Abschnitte beschreiben die ursprüngliche Fassung; für die Effektstärken gilt diese Nachkorrektur.

Stand: 18.10.2026. Entwicklungsänderung, nicht veröffentlicht.

## Ausgangspunkt und Sicherung

Der in dieser Sitzung verfügbare Checkout steht auf `d2cb56ce13d72c9d6565beed615a22185cfec497`. Der zuvor im Chat beschriebene lokale Startfreigaben-Commit ist hier nicht verfügbar. Diese Änderung betrifft ausschließlich die Displaydarstellung und enthält keine Rekonstruktion dieser separaten Startkorrektur.

Vor Projektänderungen wurde der vollständige Ordner einschließlich Git, Assets, Dependencies, Build und lokalem Zusatzbestand gesichert:

`/workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_display_effects_2026-10-18.tar.gz`

SHA-256: `69f090acabc595cd0b4d1dc2279cd676e6894945b8a6f389cbd07d528fac4bff`

`tar -dzf` hat das vollständige Archiv ohne Abweichungen mit dem damaligen Originalordner verglichen. Der Archivbefehl und die Vergleichsprüfung endeten erfolgreich.

## Dateien und Lösung

- `lib/display-surface.ts`: gemeinsamer Effekt für bestehende MeshBasicMaterial-Displays, Shader-Erweiterung über `onBeforeCompile`.
- `lib/cockpit-scene.ts`: Installation auf allen zehn registrierten Displays und Aktualisierung einer gemeinsamen Zeituniform im bestehenden Renderloop.
- `tests/display-surface.test.mjs`: Shaderintegration mit der installierten Three-Version, HUD-Erhaltung, Uniformaktualisierung ohne Upload/Recompile und Wechsel des Kameramonitors zwischen Renderziel und Systemtextur.

Der vorhandene Displaypfad zeigte bislang keine Scanlines. Hinzugefügt werden feine horizontale Linien im Abstand von vier Quellpixeln. Die maximale lokale Abdunklung beträgt 5,5 Prozent. `fwidth` blendet nicht mehr auflösbare Linien aus, damit beim Verkleinern und bei schrägen Blickwinkeln möglichst kein Moiré entsteht.

Zwei schwache, je Display phasenversetzte Sinusschwingungen modulieren die Helligkeit um zusammen höchstens ±0,9 Prozent. Es gibt keine Bildaussetzer, Verzerrung oder zusätzliche Blitzimpulse. Bei bestehender Einstellung für reduzierte Bewegung wird nur diese zeitliche Modulation deaktiviert; statische Scanlines bleiben erhalten.

Der Effekt wird auf die letzte Bildschirmoberfläche angewendet. Daher wirken Scanlines und Flimmern gleichermaßen auf Instrumente, HUD, elektrische Overheadleiste sowie die Livekamerabilder inklusive deren Beschriftung. Änderungen des Display-Dimmers und der Stromzustände bleiben wirksam. HUD-Transparenz bleibt erhalten. Bedienelemente, Modelle und Anzeigeninhalte werden nicht verändert.

Es werden keine zusätzlichen Meshes, Texturen, Canvasuploads, Renderziele oder Renderpässe angelegt. Die GPU führt zusätzliche einfache Rechenoperationen je Displayfragment aus. Tatsächliche Frametimes wurden nicht gemessen.

## Prüfungen

- Produktionsbuild: bestanden.
- `display-surface`, `cockpit-rendering`, `surround-cameras`, `structure-display`: **21/21 Tests bestanden**.
- `git diff --check`: bestanden.
- Separater Typecheck: die drei bereits bekannten Fehler zu `cloudflare:workers`, `Fetcher` und `D1Database`; keine Meldung in den geänderten Dateien.
- Keine echte Browser-/GPU-Abnahme verfügbar. Die Shaderquelle und Materialintegration sind getestet; Shaderkompilierung auf einer GPU und der subjektive Bildeindruck sind nicht bestätigt.

Wiederholung im Projektverzeichnis:

```bash
npm run build
node --experimental-strip-types --loader ./tests/ts-loader.mjs --test tests/display-surface.test.mjs tests/cockpit-rendering.test.mjs tests/surround-cameras.test.mjs tests/structure-display.test.mjs
```

Visuell noch zu prüfen: alle zehn Displays aus Pilotensicht und herangezoomt; Livekameras/Einzelbild/Systemseite; Display-Dimmer; HUD-Transparenz; reduzierte Bewegung; schräge Blickwinkel auf schwächerer Hardware.

## Wiederherstellung

Das Vollarchiv in einen neuen, leeren Ordner entpacken. Nicht über den geänderten Stand entpacken, da sonst neue Dateien verbleiben können:

```bash
mkdir -p /workspace/scratch/f74ba4035e29/iron-vault-before-display-effects
tar -xzf /workspace/scratch/f74ba4035e29/iron-vault-backups/IRON_VAULT_before_display_effects_2026-10-18.tar.gz \
  -C /workspace/scratch/f74ba4035e29/iron-vault-before-display-effects
```

Alternativ den isolierten Displaycommit mit `git revert` zurücknehmen. Vor einer späteren Rücknahme erneut sichern. Die produktive Site wurde weder aktualisiert noch überschrieben.
