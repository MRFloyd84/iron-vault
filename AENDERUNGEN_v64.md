# Änderungen in Version 64 – Navigationsrechner (MCDU) und Marschautopilot

## MCDU unten in der Konsole

Das Feld COMM / NAVIGATION ist jetzt ein Navigationsrechner im Stil eines Airbus-MCDU. Der
Bildschirm (früher UPLINK) heißt MCDU / NAV, die 18 Tasten haben Funktionen:

| Reihe | Tasten |
| --- | --- |
| 1 | DIR · PROG · PERF · F-PLN · MSG · MAP |
| 2 | ◄ · ► · ▲ · ▼ · CLR · RTB |
| 3 | AP · HOLD · SPD 1 · SPD 2 · BRT · DIM |

- Die **sechs Tasten unter dem Bildschirm** sind die Zeilentasten 1–6 (die Nummer steht links
  an jeder Zeile). In der vergrößerten Ansicht kann man die Zeilen auch direkt anklicken.
- **Farben wie im Vorbild:** weiß Beschriftung, grün Daten, cyan wählbar, magenta aktiver
  Wegpunkt, gelb vorläufiger Plan, bernstein Hinweise.
- **Seiten:**
  - **DIR TO:** Ziele mit Kurs und Entfernung – nächstes Einsatzziel, Kartenpunkt, Raffinerie,
    Förderanlage, Funkstation, Depot 4, Siedlung, Kontrollpunkt, Testgelände, Halle.
  - **F-PLN:** Wegpunkte mit Kurs und Abschnittslänge, Ziel, Restweg und Zeit. Ein neues Ziel
    erscheint als **TMPY F-PLN** (gelb) und wird mit **INSERT** (Zeilentaste 6) übernommen;
    CLR verwirft den Entwurf.
  - **PROG:** Autopilot-Modus, aktiver Wegpunkt, Restweg und Zeit, Geschwindigkeit,
    Querablage (XTK), Position und Kurs.
  - **PERF:** Autopilot-Stufe, Pisten bevorzugen, Halteabstand vor dem Ziel (10/25/50 m).
  - **MSG:** Meldungsverlauf (die bisherigen Systemmeldungen). Die letzte Meldung steht
    außerdem auf jeder Seite in der Notizzeile unten.
- **MAP** öffnet die Einsatzkarte, **BRT/DIM** regeln die Helligkeit des Bildschirms.

## Marschautopilot

- **AP** startet den Autopiloten auf dem übernommenen Plan, **AP** erneut schaltet ihn ab.
- Er steuert ausschließlich über die normale Laufsteuerung (wie W/A/D). Anfahren, Bremsen,
  Wenden, Hangneigung und Kollision sind dieselben wie beim Pilotenbetrieb – der Mech bleibt
  schwer. Vor Kurven nimmt er Tempo heraus, am Ziel bremst er rechtzeitig ab.
- **Stufe 1 und 2:** SPD 1 = Schritt (bis 8 km/h), SPD 2 = Eilmarsch (bis 14 km/h).
- **Route:** Bevorzugt die Pisten, umgeht Gebäude, Felsen, Zäune und zu steile Hänge
  (Sicherheitsabstand 6 m, höchstens etwa 15° Neigung). Bleibt er trotzdem hängen, sperrt er
  die Stelle und plant neu; ohne Fortschritt trennt er sich mit Meldung.
- **HOLD** hält den Mech an und setzt den Marsch fort. **RTB** plant zurück vor die Halle.
- **Übernahme:** Jede eigene Lenk-, Gas- oder Bremseingabe (W, A, S, D, Leertaste) trennt
  den Autopiloten sofort. Ein Warnton meldet die Trennung, ein heller Doppelton das Ziel.
- Nur außerhalb der Halle, mit gelöster Parkverriegelung, Leistungshebel über 0 und
  eingezogenen Armen. Torso drehen und Oberkörper neigen gehen während der Fahrt.
- Fliegt die Drohne, läuft der Autopilot weiter – der Mech marschiert, während du die Drohne
  steuerst.

## Karte und Taktik-Display

- Die Route erscheint auf dem **Taktik-Display** und in der **Einsatzkarte** (magenta;
  vorläufig gelb gestrichelt).
- **Klick auf die Einsatzkarte** setzt einen Kartenpunkt; er steht dann ganz oben in DIR.

## Sonstiges

- Das alte Foto klemmt jetzt am Rahmen neben dem Bildschirm statt auf den Zeilen.
