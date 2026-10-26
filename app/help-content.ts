// Hilfetexte (Fragezeichen oben rechts) je Sprache. Abschnitt = [Überschrift, Text].
import type { Lang } from '../lib/i18n';

type Help = { title: string; sections: [string, string][]; notes: string[] };
export const HELP: Record<Lang, Help> = {
  de: {
    title: 'Deine Pilotenkanzel',
    sections: [
      [
        'Kaltstart / Anzeigen',
        'Im Kaltzustand sind alle Bildschirme und Cockpitleuchten aus; nur BAT 1 hat eine grün blinkende Orientierungslampe. Sobald BAT 1, BAT 2 oder Hangarstrom den Steuerbus versorgt, starten alle zehn Anzeigen mit einer 13-sekündigen Bootsequenz. Erst danach sind die Touchflächen bedienbar. Taste G verbindet oder trennt den Hangarstrom auch bei schwarzen Displays; die bisherigen Standort- und Verriegelungssperren gelten weiter.',
      ],
      [
        'Gehen / WASD',
        'Nach LINK und gelöster Parkverriegelung: Hangartor öffnen, im rechten Display GEHEN wählen und Leistung auf mindestens 25 % stellen. W vorwärts, S rückwärts, A/D drehen. Loslassen bremst sanft; Leertaste hält die Schnellbremse. Bild auf/ab verändert die Leistungsbegrenzung. Maximal rund 8 km/h vorwärts, 4 km/h rückwärts. Umschalt wechselt in Stufe 2 (Eilmarsch, bis 14 km/h vorwärts) und zurück; Stufe 2 wirkt erst außerhalb der Halle. Mauern, Tore, Container und Streckenbarrieren blockieren den Weg. Die Rampe mittig und gerade anfahren.',
      ],
      [
        'Torso und Arme / B',
        'GELENKE [B] öffnet die Steuerung. Q/E dreht den Torso bis 45° nach links/rechts, unabhängig von der Laufrichtung. Das Cockpit und seine Kameras drehen mit. X neigt den Oberkörper leicht nach oben (bis 8°), Y nach unten (bis 10°) – praktisch für Ziele am Hang. Im Bedienfeld linken oder rechten Arm wählen, dann Schulter und Ellenbogen getrennt einstellen. R fährt alle Gelenke langsam in Grundstellung. LINK, gesunde Hydraulik und gelöste Parkverriegelung sind nötig. Arme nur im freien Testgelände ausfahren und vor engen Durchfahrten wieder einziehen. Bei Strom- oder Freigabeverlust halten die Gelenke; alte Bewegungsziele werden verworfen. Die Waffenarme besitzen noch keine Greifer.',
      ],
      [
        'Schrittbewegung',
        'Rechtes Display → GEHEN → SCHRITTBEWEGUNG: AUS / DEZENT / STARK. Die Einstellung ändert nur die Kopfbewegung, nicht die Bewegung oder Neigung der Maschine. Bei reduzierter Bewegung im Betriebssystem entfällt die Schrittbewegung.',
      ],
      ['Rechte Maustaste halten', 'Im Cockpit umsehen.'],
      [
        'Linke Maustaste',
        'Beschriftete Schalter bedienen. Monitore anklicken, um sie näher anzusehen.',
      ],
      [
        'Mausrad / Taste F',
        'Mit dem Mausrad stark hineinzoomen; auch nach einem Klick auf ein Display weiter zoomen. F stellt die Pilotensicht wieder her.',
      ],
      [
        'Hangar / Taste H',
        'Die Hallenkamera zeigt Tor, Wartungsplattformen und Kran ohne verdeckende Cockpitwände. Rechte Maustaste und Mausrad funktionieren auch hier. H, F oder Escape führen zurück; die Systeme laufen weiter. Schalter werden im Cockpit bedient.',
      ],
      [
        'Außenbereich / Taste U',
        'TESTGELÄNDE zeigt den Industriehof mit Rampen, Prüfspur und Abendhimmel. U oder F bringt dich zurück ins Cockpit. Beim Wechsel der Kamera wird die Gehsteuerung losgelassen und der Mech bremst ab. Rechts am Zusatzdisplay: HANGAR → TOR ÖFFNEN / STOP / TOR SCHLIESSEN. Öffnen verlangt gültige Steuerfreigabe, gelöste Parkverriegelung und 0 % Leistung. Die Torsteuerung benötigt Steuerstrom; der Torantrieb wird unabhängig vom Hangar versorgt.',
      ],
      [
        'Overhead / Taste O',
        'BAT 1 und BAT 2 → FUEL PUMP → APU MASTER. Nach READY auf START drücken, AVAIL abwarten und APU GEN zuschalten. Erst dann Hauptstrom [1].',
      ],
      [
        'Kühlung / Elektrik links',
        'Im linken Zusatzdisplay zwischen KÜHLUNG, ELEKTRIK, HYDRAULIK und STÖRUNGEN umschalten. AUTO regelt den Kühlfluss und übernimmt bei Ausfall A mit Pumpe B. HAND nutzt die gewählte Pumpe und die COOLING-Stufe rechts. STÖRUNG A simuliert einen Ausfall. Die Warnaufnahme wiederholt sich bis zum Quittieren oder bis die Ursache behoben ist. Quittieren auf KÜHLUNG oder ELEKTRIK beendet den Ton, behebt die Ursache aber nicht. Derselbe Knopf setzt die Übungsstörung zurück.',
      ],
      [
        'Störungen / Wartung',
        'Links STÖRUNGEN: Kühlmittelleck, Hilfshydraulikausfall und Lagesensorfehler gezielt auslösen. Ein Leck reduziert den Vorrat. LECKZWEIG ABSPERREN beendet den Verlust, der Bypass liefert 70 % Kühlfluss. Leistung senken und nachkühlen. Reparieren und Auffüllen erst kalt, mit gestopptem Reaktor, weniger als 1 L/s Restfluss und geschlossener Parkverriegelung. Danach Leckzweig öffnen. Hydraulik- und Sensorfehler über denselben Knopf zurücksetzen und Prüfungen wiederholen.',
      ],
      [
        'Bewegungsfreigabe rechts',
        'Nach GYRO [5]: HELM VERBINDEN → KALIBRIEREN. Acht Sekunden Nullpunkt- und Lageabgleich abwarten. Systemtest bestehen, dann LINK [6]. Hangarstrom trennen, Leistung auf 0 %, PARKVERRIEGELUNG LÖSEN. Bei Verlust der Freigabe bremst der Mech automatisch; erst im Stillstand schließen die Parkverriegelungen. Beim Zurückkehren an den Serviceplatz lassen sich die Verriegelung und der Hangarstrom wieder anschließen.',
      ],
      [
        'Hangarstrom / Batterien',
        'Taste G oder ELEKTRIK → HANGARSTROM EIN erlaubt einen Kaltstart ohne APU. BAT 1/2 verbinden, um sie zu laden. Die Anzeige zeigt Ladezustand, Lade-/Entladestrom und Verbraucherlast. MAIN GEN hat Vorrang vor Hangarstrom und APU GEN. Bei Ausfall übernimmt eine verfügbare Quelle; Batterien versorgen nur den Steuerbus. Der Überlastschutz trennt eine überlastete Quelle nach zwei Sekunden. QUITTIEREN beendet den Warnton; SCHUTZ RESET setzt den Schutz zurück. Ein- und Ausschalten der Versorgung begleitet ein Schützklacken.',
      ],
      [
        'Versorgungsfreigaben',
        'COOLANT VALVE einschalten, dann Kühlung [2]. HYD PUMP versorgt die unabhängige Hilfshydraulik. AVIONICS vor Diagnose [3], REACTOR ARM vor Reaktor [4]. Die Diagnose wartet auf mindestens 140 bar; der Reaktorstart benötigt mindestens 20 L/s Kühlfluss.',
      ],
      [
        'Generatorübernahme',
        'Nach dem Reaktorstart MAIN GEN zuschalten. Danach APU MASTER und FUEL PUMP ausschalten; der Hauptgenerator versorgt den Mech. Anschließend Stabilisierung [5]. Rechts FREIGABE: Neurohelm verbinden und kalibrieren. Systemtest [T] bestehen, dann Steuerfreigabe [6].',
      ],
      [
        'Tasten 1–6',
        '1 Hauptstrom · 2 Kühlung · 3 Diagnose · 4 Reaktor · 5 Stabilisierung · 6 Steuerfreigabe. Hauptstrom [1] trennt die Hauptsysteme. APU und Batterien werden separat im Overhead ausgeschaltet.',
      ],
      [
        'Linke Konsole',
        'Lüfterstufe, Hydraulikdruck und Instrumentenhelligkeit. RED LIGHT regelt die rote Deckenlampe von 0 bis 100 % in 10-%-Schritten, ab verfügbarem Bordstrom. Minus/Plus oder Drehknopf anklicken. Den Prozentwert siehst du im linken Versorgungsdisplay.',
      ],
      [
        'Rechte Konsole',
        'Radarreichweite, Radarsuche und HUD. COOLING regelt die Reaktorkühlung in drei Stufen (24 / 42,8 / 62 L/s); unabhängig vom Kabinenlüfter. Ab 85 °C erscheint eine Warnung. Ab 100 °C begrenzt der Temperaturschutz die Leistung bis zur Abkühlung unter 78 °C.',
      ],
      [
        'Abschalten / Taste K',
        'SHUTDOWN [K] am rechten Zusatzdisplay startet die Anleitung: Leistung 0 %, Parkverriegelung schließen, LINK [6] und GYRO [5] aus. Hangarstrom verbinden oder APU starten und APU GEN einschalten. MAIN GEN aus. REACTOR [4] aus; Nachkühlfreigabe im Display abwarten. Danach COOLANT [2], Hauptstrom [1] und die Overhead-Versorgung ausschalten. Der Engineering-Monitor zeigt die Checkliste. Erneutes K kann die Anleitung vor dem Reaktorstopp beenden.',
      ],
      [
        'Unterbrochene Nachkühlung',
        'Restwärme verschwindet bei Stromverlust nicht. APU-Versorgung, Hauptstrom und Kühlung wiederherstellen; mit K die Nachkühlung fortsetzen. Erst nach Freigabe ist ein neuer Kaltstart möglich.',
      ],
      [
        'Systemtest / Taste T',
        'Ab GYRO [5], vor LINK [6], bei 0 % Leistung und verriegeltem Prüfstand: Testknopf am rechten Zusatzdisplay drücken. 210 bar einstellen, Aktuatortest abwarten, Radar nacheinander auf 125 / 250 / 500 m stellen. Erneutes Drücken bricht ab.',
      ],
      [
        'Umgebungskameras',
        'Oberer rechter Monitor: sechs Außenkameras, drei vorne und drei hinten. Hauptstrom und AVIONICS einschalten. Die sechs nummerierten Tasten unter dem Monitor wählen ein Einzelbild; 6 BILDER öffnet die Übersicht, SYSTEME die bisherigen Bordsysteme. Monitor anklicken vergrößert die Sicht. Rückansichten sind ungespiegelt; links/rechts bezeichnet die Mechseite.',
      ],
      [
        'Scheinwerfer / Taste J',
        'Zwei Doppelscheinwerfer an der Kanzel leuchten den Weg aus. Sie brauchen Bordstrom (Batterie, Hangarstrom oder Generator) und flackern beim Einschalten kurz wie alte Lampen. Nachts sind die Lichtkegel in der Außenansicht zu sehen. Die gelbe Rundumleuchte auf dem Rücken dreht automatisch, solange sich der Mech bewegt.',
      ],
      [
        'Tag / Nacht / Taste N',
        'Wechselt weich zwischen Abendlicht und Nacht mit Sternenhimmel. Nachts leuchten die Hofscheinwerfer kräftiger, Umgebung und Nebel werden dunkel.',
      ],
      [
        'Waffen / Taste M',
        'WAFFEN [M] ist der Hauptschalter (MASTER ARM). Gefeuert wird in der Pilotensicht mit der linken Maustaste, das Fadenkreuz folgt der Maus. Die beiden 30-mm-Kanonen in den Unterarmen schießen abwechselnd; die Lafette schwenkt rund ±24° seitlich, liegt das Ziel weiter außen, dreht der Torso automatisch nach (dafür muss die Parkverriegelung gelöst sein). Freigabe nur mit Steuerfreigabe [6] und außerhalb der Halle. Je Kanone 150 Schuss; Dauerfeuer überhitzt die Läufe, dann ist kurz Pause. Nachladen: gesichert in der Halle am Serviceplatz mit geschlossener Parkverriegelung. Schalter und Knöpfe lassen sich auch scharf geschaltet weiter anklicken.',
      ],
      [
        'Drohne / Taste C',
        'Auf dem Rücken sitzt eine kleine Aufklärungsdrohne. C startet sie (braucht Hauptstrom und AVIONICS), nach dem Hochlaufen der Rotoren steigt sie von der Halterung. Tab wechselt zwischen Cockpit und Drohnensicht; das Bild läuft außerdem auf dem Kameramonitor. Fliegen: W/S vor und zurück, A/D seitwärts, Q/E drehen, Leertaste steigen, Umschalt sinken; rechte Maustaste schwenkt die Kamera. Linksklick in der Drohnensicht markiert einen Punkt mit dem Laser – die Armkanonen richten sich dann auf dieses Ziel aus. Linksklick ins Leere löscht die Markierung. Der Akku reicht etwa drei Minuten, die Funkreichweite rund 300 m; bei leerem Akku oder Funkverlust kehrt die Drohne selbst zurück. C ruft sie zurück, angedockt lädt sie wieder. In der Halle geht es nur durchs offene Tor hinaus.',
      ],
      [
        'Laser / Taste P',
        'Laser-Entfernungsmesser: roter Strahl zum Zielpunkt unter dem Fadenkreuz, Entfernung im HUD und am Fadenkreuz. Nachts und im Regen ist der Strahl draußen gut zu sehen.',
      ],
      [
        'Wüste und Karte',
        'Rund um das Testgelände liegt eine Wüste von 1,5 × 1,5 km: Pisten zum Kreuzweg und zu fünf Anlagen (Raffinerie, Förderanlage, Funkstation, Depot, Siedlung), Pipeline, Stromleitung, Tafelberge und ein Dünenfeld. Hinaus geht es am Südende des Testgeländes östlich an den Zielscheiben vorbei. IV-04 läuft auf Pisten sicher; zu steile Hänge und Dünen lehnt die Steuerung ab („Hang zu steil“). Das Taktik-Display zeigt das echte Lagebild (Reichweite mit dem RANGE-Knopf bis 1000 m): Pisten, Bauwerke, Ziele, Drohne und das Einsatzziel; liegt es außerhalb, zeigt ein Pfeil am Rand die Richtung.',
      ],
      [
        'Einsätze / Taste I',
        'EINSATZ [I] öffnet die Einsatzleitung mit Lagekarte (Norden oben, Planquadrate A–F / 1–6 à 250 m). Einsatz wählen, Auftrag lesen, starten. Links unter der Ortsanzeige steht dann das nächste Ziel mit Entfernung, Kompassrichtung und Richtungspfeil. Aufklären: das Objekt mit der Drohne mittig ins Bild nehmen, bis es erfasst ist (oder mit Linksklick markieren). Zerstören: mit den Armkanonen beschießen, bis es explodiert; Tanks brennen lange und heftig. Ist alles erledigt, zurück in die Halle – erst dort ist der Einsatz erfüllt. Munition reicht für einen Einsatz, nachladen in der Halle. Erfüllte Einsätze merkt sich der Browser.',
      ],
      [
        'Schießstand',
        'Am Ende des Testgeländes stehen sieben Klappziele aus Stahl (fallen bei Treffer um und richten sich nach sechs Sekunden wieder auf), daneben zwei alte Fahrzeugwracks. Treffer und Schüsse zählt das HUD.',
      ],
      [
        'Regen / Taste Z',
        'Lässt es regnen: Regenschleier, der im Scheinwerferkegel aufleuchtet, nasser Asphalt mit Pfützen, nasse Panzerung (trocknet in der Halle langsam), Tropfen auf der Frontscheibe und Regenrauschen – in der Kanzel dumpf trommelnd, draußen hell. Bei starkem Regen zieht ein Gewitter auf: Blitze erhellen den Himmel, der Donner folgt je nach Entfernung. Unter dem Hallendach bleibt es trocken. Licht und Schatten werden trüber, der Nebel dichter.',
      ],
      [
        'Gewicht beim Gehen',
        'Jeder Schritt stößt die Kanzel kurz an und lässt die Instrumentennadeln nachzittern. Die Füße wirbeln Staub auf (bei Regen Spritzer) und hinterlassen Abdrücke, die nach zwei Minuten verblassen. SCHRITTBEWEGUNG AUS schaltet den Kanzelstoß ab.',
      ],
      [
        'Taste L',
        'Warmes Kabinenlicht ein-/ausschalten. Die rote Deckenlampe wird unabhängig über RED LIGHT links eingestellt. Die grünen Leisten neben den Seitenstreben leuchten automatisch ab verfügbarem Bordstrom.',
      ],
    ],
    notes: [
      'Der obere linke Monitor zeigt die erweiterte Kaltstart-Checkliste und den nächsten Schritt. Links außen bedienst du Kühlung und Stromversorgung und siehst Druck und Temperatur, rechts außen den Systemtest. Meldungen stehen im unteren Kommunikationsdisplay.',
      'Beim Senken des Hydraulikdrucks hörst du die Druckentlastung. Der Hauptantrieb ist ab Reaktorstart hörbar; nach der Steuerfreigabe verändert der linke Leistungshebel Leistung und Maschinenklang. Bei gelöster Parkverriegelung begrenzt der Hebel das Gehtempo. Im verriegelten Zustand bleibt der stationäre Lasttest verfügbar.',
      'F3 blendet eine Diagnoseanzeige ein: Bilder pro Sekunde, Bildzeit, 1 %-Low, CPU-Zeit je Abschnitt, Zeichenaufrufe, Dreiecke, GPU-Zeit (wenn der Browser sie misst), Speicher, Objekte, Shader und Audioquellen. Geschätzte und nicht verfügbare Werte sind gekennzeichnet.',
      'Das Regler-Symbol oben rechts öffnet die Grafikeinstellungen: Voreinstellung Hoch/Mittel/Niedrig oder einzeln Auflösung, Schatten, Sichtweite und Kameramonitor. „Hoch“ ist die volle Qualität; die Wahl wirkt sofort und wird gespeichert.',
      'Prototyp: Anzeigen simulieren die Bordsysteme. Die Startlogik ist für diesen Mech entworfen. Overhead und beschriftete Seitenregler sind bedienbar; weitere kleine Tasten bleiben Dekoration.',
    ],
  },
  en: {
    title: 'Your cockpit',
    sections: [
      [
        'Cold start / displays',
        'In the cold state every screen and cockpit light is off; only BAT 1 has a blinking green orientation lamp. As soon as BAT 1, BAT 2 or hangar power feeds the control bus, all ten displays run a 13-second boot sequence. Only then do the touch areas respond. Key G connects or disconnects hangar power even with dark displays; the usual location and lock restrictions still apply.',
      ],
      [
        'Walking / WASD',
        'After LINK and with the parking lock released: open the hangar door, select WALK on the right display and set power to at least 25 %. W forward, S reverse, A/D turn. Releasing the keys brakes gently; holding Space applies the emergency brake. Page Up/Down changes the power limit. Top speed is about 8 km/h forward, 4 km/h in reverse. Shift switches to gear 2 (forced march, up to 14 km/h forward) and back; gear 2 only takes effect outside the hall. Walls, doors, containers and track barriers block the way. Approach the ramp centred and straight.',
      ],
      [
        'Torso and arms / B',
        'JOINTS [B] opens the controls. Q/E turns the torso up to 45° left/right, independent of the walking direction. The cockpit and its cameras turn with it. X tilts the upper body slightly up (up to 8°), Y down (up to 10°) – handy for targets on slopes. Select the left or right arm in the panel, then set shoulder and elbow separately. R slowly returns all joints to the neutral position. LINK, healthy hydraulics and a released parking lock are required. Only extend the arms in the open test ground and retract them before narrow passages. On loss of power or clearance the joints hold; old motion targets are discarded. The weapon arms have no grippers yet.',
      ],
      [
        'Step motion',
        'Right display → WALK → STEP MOTION: OFF / SUBTLE / STRONG. The setting only changes the head movement, not the movement or tilt of the machine. With reduced motion enabled in the operating system, step motion is disabled.',
      ],
      ['Hold right mouse button', 'Look around in the cockpit.'],
      ['Left mouse button', 'Operate labelled switches. Click monitors to take a closer look.'],
      [
        'Mouse wheel / key F',
        'Zoom far in with the mouse wheel; keep zooming even after clicking a display. F restores the pilot view.',
      ],
      [
        'Hangar / key H',
        'The hall camera shows the door, maintenance platforms and crane without cockpit walls in the way. Right mouse button and mouse wheel work here too. H, F or Escape take you back; the systems keep running. Switches are operated in the cockpit.',
      ],
      [
        'Outside / key U',
        'TEST GROUND shows the industrial yard with ramps, test lane and evening sky. U or F takes you back to the cockpit. Changing the camera releases the walking controls and the mech brakes. On the right auxiliary display: HANGAR → OPEN DOOR / STOP / CLOSE DOOR. Opening requires valid control clearance, a released parking lock and 0 % power. The door control needs control power; the door drive is powered independently by the hangar.',
      ],
      [
        'Overhead / key O',
        'BAT 1 and BAT 2 → FUEL PUMP → APU MASTER. After READY press START, wait for AVAIL and connect APU GEN. Only then main power [1].',
      ],
      [
        'Cooling / electrics left',
        'On the left auxiliary display switch between COOLING, ELECTRICS, HYDRAULICS and FAULTS. AUTO controls the coolant flow and takes over with pump B if A fails. MANUAL uses the selected pump and the COOLING stage on the right. FAULT A simulates a failure. The warning recording repeats until acknowledged or until the cause is fixed. Acknowledging on COOLING or ELECTRICS stops the tone but does not fix the cause. The same button resets the training fault.',
      ],
      [
        'Faults / maintenance',
        'Left FAULTS: trigger a coolant leak, auxiliary hydraulics failure or attitude sensor fault on purpose. A leak reduces the reserve. ISOLATE LEAK BRANCH stops the loss, the bypass delivers 70 % coolant flow. Reduce power and cool down. Repair and refill only when cold, with the reactor stopped, less than 1 L/s residual flow and the parking lock engaged. Then reopen the leak branch. Reset hydraulic and sensor faults with the same button and repeat the checks.',
      ],
      [
        'Motion clearance right',
        'After GYRO [5]: CONNECT HELMET → CALIBRATE. Wait eight seconds for zero-point and attitude alignment. Pass the system test, then LINK [6]. Disconnect hangar power, power to 0 %, RELEASE PARKING LOCK. If clearance is lost the mech brakes automatically; the parking locks only engage at standstill. Back at the service bay the lock and hangar power can be connected again.',
      ],
      [
        'Hangar power / batteries',
        'Key G or ELECTRICS → HANGAR POWER ON allows a cold start without the APU. Connect BAT 1/2 to charge them. The display shows charge level, charge/discharge current and consumer load. MAIN GEN takes priority over hangar power and APU GEN. If one fails, an available source takes over; batteries only feed the control bus. Overload protection disconnects an overloaded source after two seconds. ACKNOWLEDGE stops the warning tone; PROTECTION RESET resets the protection. Switching the supply on and off comes with a contactor clack.',
      ],
      [
        'Supply clearances',
        'Switch on COOLANT VALVE, then cooling [2]. HYD PUMP feeds the independent auxiliary hydraulics. AVIONICS before diagnostics [3], REACTOR ARM before reactor [4]. Diagnostics wait for at least 140 bar; the reactor start needs at least 20 L/s coolant flow.',
      ],
      [
        'Generator takeover',
        'After the reactor start connect MAIN GEN. Then switch off APU MASTER and FUEL PUMP; the main generator powers the mech. Then stabilisation [5]. Right CLEARANCE: connect and calibrate the neuro helmet. Pass the system test [T], then control clearance [6].',
      ],
      [
        'Keys 1–6',
        '1 main power · 2 cooling · 3 diagnostics · 4 reactor · 5 stabilisation · 6 control clearance. Main power [1] disconnects the main systems. APU and batteries are switched off separately in the overhead.',
      ],
      [
        'Left console',
        'Fan stage, hydraulic pressure and instrument brightness. RED LIGHT sets the red ceiling lamp from 0 to 100 % in 10 % steps once on-board power is available. Click minus/plus or the knob. The percentage is shown on the left supply display.',
      ],
      [
        'Right console',
        'Radar range, radar sweep and HUD. COOLING sets reactor cooling in three stages (24 / 42.8 / 62 L/s), independent of the cabin fan. A warning appears from 85 °C. From 100 °C thermal protection limits power until it cools below 78 °C.',
      ],
      [
        'Shutdown / key K',
        'SHUTDOWN [K] on the right auxiliary display starts the guide: power 0 %, engage the parking lock, LINK [6] and GYRO [5] off. Connect hangar power or start the APU and switch on APU GEN. MAIN GEN off. REACTOR [4] off; wait for the cool-down clearance on the display. Then switch off COOLANT [2], main power [1] and the overhead supply. The engineering monitor shows the checklist. Pressing K again can end the guide before the reactor stops.',
      ],
      [
        'Interrupted cool-down',
        'Residual heat does not vanish when power is lost. Restore APU supply, main power and cooling; continue the cool-down with K. A new cold start is only possible after clearance.',
      ],
      [
        'System test / key T',
        'From GYRO [5], before LINK [6], at 0 % power and with the test stand locked: press the test button on the right auxiliary display. Set 210 bar, wait for the actuator test, then set the radar to 125 / 250 / 500 m in turn. Pressing again aborts.',
      ],
      [
        'Surround cameras',
        "Upper right monitor: six external cameras, three front and three rear. Switch on main power and AVIONICS. The six numbered keys below the monitor select a single view; 6 VIEWS opens the overview, SYSTEMS the regular on-board systems. Clicking the monitor enlarges the view. Rear views are not mirrored; left/right refers to the mech's side.",
      ],
      [
        'Headlights / key J',
        'Two twin headlights on the cabin light the way. They need on-board power (battery, hangar power or generator) and flicker briefly when switched on, like old lamps. At night the light cones are visible in the outside view. The yellow beacon on the back rotates automatically while the mech moves.',
      ],
      [
        'Day / night / key N',
        'Fades smoothly between evening light and a starry night. At night the yard floodlights shine brighter, surroundings and fog turn dark.',
      ],
      [
        'Weapons / key M',
        'WEAPONS [M] is the master switch (MASTER ARM). Fire in the pilot view with the left mouse button; the crosshair follows the mouse. The two 30 mm cannons in the forearms fire alternately; the mount swivels about ±24° sideways, and if the target is further out the torso follows automatically (the parking lock must be released for this). Only cleared with control clearance [6] and outside the hall. 150 rounds per cannon; sustained fire overheats the barrels, then there is a short pause. Reloading: safed, in the hall at the service bay with the parking lock engaged. Switches and buttons can still be clicked while armed.',
      ],
      [
        'Drone / key C',
        'A small reconnaissance drone rides on the back. C launches it (needs main power and AVIONICS); once the rotors have spun up it lifts off its cradle. Tab switches between the cockpit and the drone view; the feed also runs on the camera monitor. Flying: W/S forward and back, A/D sideways, Q/E turn, Space climb, Shift descend; the right mouse button pans the camera. Left click in the drone view marks a point with the laser – the arm cannons then aim at that target. Left click into empty space clears the mark. The battery lasts about three minutes, the radio range is around 300 m; with a flat battery or lost signal the drone returns on its own. C recalls it, docked it recharges. Inside the hall the only way out is through the open gate.',
      ],
      [
        'Laser / key P',
        'Laser rangefinder: red beam to the aim point under the crosshair, distance in the HUD and at the crosshair. At night and in the rain the beam is clearly visible outside.',
      ],
      [
        'Desert and map',
        'Around the test ground lies a desert of 1.5 × 1.5 km: tracks to the crossroads and to five sites (refinery, mine, radio station, depot, settlement), a pipeline, a power line, mesas and a dune field. The way out is at the south end of the test ground, past the targets on the east side. IV-04 walks safely on the tracks; slopes and dunes that are too steep are refused by the controls (“Slope too steep”). The tactical display shows the real situation (range up to 1000 m with the RANGE knob): tracks, structures, targets, the drone and the mission objective; if it lies outside, an arrow at the edge shows the direction.',
      ],
      [
        'Missions / key I',
        'MISSION [I] opens mission control with a situation map (north up, grid squares A–F / 1–6 of 250 m). Choose a mission, read the briefing, start it. The next objective then appears at the left below the location display, with distance, compass bearing and a direction arrow. Recon: keep the object centred in the drone image until it is identified (or mark it with a left click). Destroy: fire the arm cannons at it until it explodes; tanks burn long and fiercely. When everything is done, return to the hall – only there is the mission complete. Ammunition lasts for one mission; reload in the hall. The browser remembers completed missions.',
      ],
      [
        'Firing range',
        'At the end of the test ground stand seven steel knock-down targets (they fall when hit and rise again after six seconds), next to them two old vehicle wrecks. The HUD counts hits and shots.',
      ],
      [
        'Rain / key Z',
        'Makes it rain: rain curtain lighting up in the headlight beams, wet asphalt with puddles, wet armour (dries slowly in the hall), drops on the windscreen and the sound of rain – a dull drumming in the cabin, bright outside. In heavy rain a thunderstorm rolls in: lightning lights up the sky, the thunder follows depending on distance. Under the hall roof it stays dry. Light and shadows become duller, the fog denser.',
      ],
      [
        'Weight when walking',
        'Every step jolts the cabin briefly and makes the instrument needles tremble. The feet kick up dust (splashes in the rain) and leave footprints that fade after two minutes. STEP MOTION OFF disables the cabin jolt.',
      ],
      [
        'Key L',
        'Switch the warm cabin light on/off. The red ceiling lamp is set independently via RED LIGHT on the left. The green strips next to the side struts light up automatically once on-board power is available.',
      ],
    ],
    notes: [
      'The upper left monitor shows the extended cold-start checklist and the next step. On the far left you operate cooling and power supply and see pressure and temperature, on the far right the system test. Messages appear on the lower communication display.',
      'When lowering hydraulic pressure you hear the pressure release. The main drive is audible from the reactor start; after control clearance the left power lever changes power and engine sound. With the parking lock released the lever limits walking speed. With it engaged the stationary load test remains available.',
      'F3 shows a diagnostics overlay: frames per second, frame time, 1 % low, CPU time per stage, draw calls, triangles, GPU time (if the browser measures it), memory, objects, shaders and audio sources. Estimated and unavailable values are marked.',
      'The slider icon at the top right opens the graphics settings: preset High/Medium/Low, or resolution, shadows, view distance and camera monitor individually. “High” is full quality; changes apply instantly and are saved.',
      'Prototype: the displays simulate the on-board systems. The start-up logic is designed for this mech. The overhead and labelled side controls can be operated; other small buttons are decoration.',
    ],
  },
};
