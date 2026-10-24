import { hydraulicReadings } from './hydraulics';
import type { MachineState } from './machine';
import {
  electricalReadings,
  auxiliaryLoads,
  sourceLabel,
  selectedPump,
  effectiveCoolingLevel,
  unacknowledgedServiceAlerts,
  serviceAlerts,
  SERVICE_CONTROLS,
  leakRate,
} from './service-systems';

export function renderServicePanel(
  c: CanvasRenderingContext2D,
  s: MachineState,
  history: { pressure: number; temperature: number }[],
) {
  const ink = '#c9ecb3',
    green = '#a3e969',
    muted = '#83a773',
    amber = '#efbd68',
    red = '#f17c61',
    panel = '#101f13';
  const text = (value: string, x: number, y: number, size = 26, color = ink) => {
    c.fillStyle = color;
    c.font = '500 ' + size + 'px Arial';
    c.fillText(value, x, y);
  };
  const mono = (value: string, x: number, y: number, size = 38, color = ink) => {
    c.fillStyle = color;
    c.font = '500 ' + size + 'px monospace';
    c.fillText(value, x, y);
  };
  const rect = (x: number, y: number, w: number, h: number, color = panel) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const line = (x: number, y: number, xx: number, yy: number, color = '#29472a') => {
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(xx, yy);
    c.stroke();
  };
  const service = s.service,
    r = electricalReadings(s),
    pump = selectedPump(s);
  rect(0, 0, 960, 720, '#050e07');
  rect(0, 0, 960, 81, '#142519');
  text('VERSORGUNG / SYSTEME', 35, 51, 30);
  text('IV–04', 797, 49, 24, muted);
  line(35, 82, 925, 82, green);
  const controlLabels: Record<number, string> = {
    60: 'KÜHLUNG',
    61: 'ELEKTRIK',
    62: 'HYDRAULIK',
    63: service.mode === 'auto' ? 'MODUS: AUTO' : 'MODUS: HAND',
    64: 'PUMPE A',
    65: 'PUMPE B',
    66: service.pumpAFault ? 'STÖRUNG A ZURÜCKSETZEN' : 'STÖRUNG A SIMULIEREN',
    67:
      !unacknowledgedServiceAlerts(s).length && serviceAlerts(s).length
        ? 'QUITTIERT'
        : service.page !== 'cooling'
          ? 'QUITTIEREN'
          : 'WARNUNG QUITTIEREN',
    68: service.groundConnected ? 'HANGARSTROM AUS' : 'HANGARSTROM EIN',
    69: 'SCHUTZ RESET',
    70: 'STÖRUNGEN',
    71: service.coolantLeak ? 'LECK AKTIV' : 'LECK AUSLÖSEN',
    72: service.leakIsolated ? 'LECKZWEIG ÖFFNEN' : 'LECKZWEIG ABSPERREN',
    73: 'LECK REPARIEREN',
    74: 'VORRAT AUFFÜLLEN',
    75: service.hydraulicFault ? 'HYD-FEHLER RESET' : 'HYD-AUSFALL',
    76: service.sensorFault ? 'SENSORFEHLER RESET' : 'SENSORFEHLER',
  };
  for (const b of SERVICE_CONTROLS) {
    if (b.page && b.page !== service.page) continue;
    const active =
      (b.action === 60 && service.page === 'cooling') ||
      (b.action === 61 && service.page === 'electrical') ||
      (b.action === 62 && service.page === 'hydraulics') ||
      (b.action === 70 && service.page === 'faults') ||
      (b.action === 64 && service.pump === 'A') ||
      (b.action === 65 && service.pump === 'B');
    const fault = b.action === 64 && service.pumpAFault;
    rect(b.x, b.y, b.w, b.h, fault ? '#42261e' : active ? '#294027' : '#16281a');
    if (active) rect(b.x, b.y + b.h - 3, b.w, 3, green);
    const label = controlLabels[b.action];
    c.font = '600 ' + (b.action >= 66 ? 23 : 25) + 'px Arial';
    c.fillStyle = fault ? red : active ? green : ink;
    c.fillText(label, b.x + (b.w - c.measureText(label).width) / 2, b.y + 32);
  }
  if (service.page === 'faults') {
    text('ÜBUNGSSTÖRUNGEN · MANUELL AUSLÖSEN', 36, 186, 27, amber);
    const rows = [
      [
        'Kühlmittelleck',
        service.coolantLeak ? (service.leakIsolated ? 'ABGESPERRT' : 'AKTIV') : 'DICHT',
      ],
      [
        'Verlust / Vorrat',
        leakRate(s).toFixed(2) + ' L/s · ' + service.reservoirLitres.toFixed(0) + ' L',
      ],
      ['Hilfshydraulik', service.hydraulicFault ? 'AUSGEFALLEN' : 'VERFÜGBAR'],
      ['Lagesensor', service.sensorFault ? 'FEHLER' : 'VERFÜGBAR'],
    ];
    rows.forEach(([label, value], i) => {
      text(label, 36, 233 + i * 40, 26, muted);
      text(value, 548, 233 + i * 40, 26);
    });
    text('Absperren → nachkühlen → kalt reparieren → auffüllen', 36, 403, 24, amber);
  } else if (service.page === 'cooling') {
    text('RÜCKLAUF · WARM', 36, 190, 23, muted);
    mono(s.temperature.toFixed(1) + ' °C', 36, 245, 54, s.thermalWarning ? amber : ink);
    text('VORLAUF · GEKÜHLT', 512, 190, 23, muted);
    mono(service.outletTemperature.toFixed(1) + ' °C', 512, 245, 54, green);
    line(36, 267, 924, 267);
    text('Wärmetauscher → Pumpe → Maschine → Rücklauf', 36, 298, 25, muted);
    const rows = [
      ['Kühlmittelfluss', s.coolantFlow.toFixed(1) + ' L/s'],
      ['Kühlkreisdruck', (s.coolantFlow * 0.075).toFixed(1) + ' bar'],
      ['Vorrat / Nennvolumen', service.reservoirLitres.toFixed(0) + ' / 240 L'],
    ];
    rows.forEach(([label, value], i) => {
      text(label, 36, 338 + i * 41, 27, muted);
      mono(value, 610, 338 + i * 41, 30);
    });
    rect(36, 441, 888, 75);
    text(
      'A: ' + (service.pumpAFault ? 'STÖRUNG' : pump === 'A' ? 'LÄUFT' : 'BEREIT'),
      51,
      471,
      25,
      service.pumpAFault ? red : pump === 'A' ? green : muted,
    );
    text('B: ' + (pump === 'B' ? 'LÄUFT' : 'RESERVE'), 360, 471, 25, pump === 'B' ? green : muted);
    text('Stufe ' + effectiveCoolingLevel(s).toFixed(1) + ' / 3', 658, 471, 25, ink);
    text(
      service.pumpAFault
        ? service.faultAcknowledged
          ? 'Störung quittiert · Ursache bleibt bestehen.'
          : service.mode === 'auto'
            ? 'AUTO: Reservepumpe B übernimmt.'
            : 'HAND: Pumpe B wählen; dann Warnung quittieren.'
        : 'AUTO regelt die Temperatur · COOLING rechts wählt HAND.',
      51,
      502,
      23,
      service.pumpAFault ? amber : muted,
    );
  } else if (service.page === 'electrical') {
    text('28-V-HILFSNETZ · ' + sourceLabel(r.source), 36, 189, 27, green);
    mono(r.voltage.toFixed(1) + ' V', 36, 240, 46);
    mono(r.loadKW.toFixed(2) + ' kW', 355, 240, 43);
    text(r.capacityKW ? 'von ' + r.capacityKW + ' kW' : 'auf Batterie', 685, 236, 27, muted);
    rect(36, 259, 888, 78);
    s.service.batteryAh.forEach((ah, i) => {
      const x = 51 + i * 444,
        connected = i ? s.overhead.battery2 : s.overhead.battery1,
        current = r.batteryAmps[i];
      text(
        'BAT ' +
          (i + 1) +
          ' · ' +
          r.batteryVoltage[i].toFixed(1) +
          ' V · ' +
          Math.round(r.soc[i] * 100) +
          ' %',
        x,
        287,
        25,
        connected ? ink : muted,
      );
      text(
        connected
          ? current < -0.01
            ? 'LADEN ' + (-current).toFixed(1) + ' A'
            : current > 0.01
              ? 'ENTLADEN ' + current.toFixed(1) + ' A'
              : 'BEREIT'
          : 'GETRENNT · RUHESPANNUNG',
        x,
        319,
        23,
        current < 0 ? green : muted,
      );
    });
    auxiliaryLoads(s).forEach((row, i) => {
      text(row.label, 38, 366 + i * 25, 23, muted);
      text(row.kw.toFixed(2) + ' kW', 782, 366 + i * 25, 23);
    });
    const trips = Object.entries(service.trips)
      .filter(([, v]) => v)
      .map(([k]) => k.toUpperCase())
      .join(' / ');
    text(
      trips
        ? 'SCHUTZ AUSGELÖST: ' +
            trips +
            (unacknowledgedServiceAlerts(s).length ? '' : ' · QUITTIERT')
        : r.lowBattery
          ? 'BATTERIE SCHWACH · EXTERN / APU VERBINDEN'
          : r.remainingMinutes !== null
            ? 'Batteriereserve bei aktueller Last: ' + Math.floor(r.remainingMinutes) + ' min'
            : 'Versorgung inkl. Ladung: ' + r.inputKW.toFixed(2) + ' kW',
      36,
      557,
      25,
      trips || r.lowBattery ? amber : green,
    );
    text('Priorität: MAIN → HANGAR → APU · Batterie: Steuerbus', 36, 585, 22, muted);
  } else {
    text('HILFSHYDRAULIK', 36, 190, 25, muted);
    mono(Math.round(s.actualPressure) + ' bar', 36, 255, 68);
    text('SOLL ' + s.hydraulicPressure + ' bar', 605, 250, 31);
    const x = 36,
      y = 290,
      w = 888,
      h = 96;
    for (let j = 0; j < 4; j++) line(x, y + (j * h) / 3, x + w, y + (j * h) / 3);
    c.strokeStyle = green;
    c.lineWidth = 3;
    c.beginPath();
    history.forEach((v, i) => {
      const xx = x + (i / Math.max(1, history.length - 1)) * w,
        yy = y + h - Math.min(1, v.pressure / 300) * h;
      if (i) c.lineTo(xx, yy);
      else c.moveTo(xx, yy);
    });
    c.stroke();
    const hyd = hydraulicReadings(s);
    text('DRUCKVERLAUF · 12 s', 36, 418, 23, muted);
    text(
      hyd.powered
        ? 'PUMPE REGELT'
        : hyd.dumping
          ? 'SPEICHER ENTLASTET'
          : service.hydraulicFault
            ? 'PUMPENSTÖRUNG'
            : 'PUMPE AUS · RESTDRUCK',
      490,
      418,
      24,
      hyd.powered ? green : amber,
    );
    text('Förderstrom / Verbrauch', 36, 465, 26, muted);
    mono(hyd.pumpFlow.toFixed(1) + ' / ' + hyd.demand.toFixed(1) + ' L/min', 510, 465, 28);
    text('Pumpenleistung', 36, 510, 26, muted);
    mono(hyd.powerKW.toFixed(2) + ' kW', 650, 510, 30);
    text('Speicherreserve über 140 bar', 36, 555, 26, muted);
    mono(
      (hyd.reserveLitres * 1000).toFixed(0) + ' mL',
      650,
      555,
      30,
      hyd.reserveLitres > 0.05 ? green : amber,
    );
    text('Druckwahl links: 150 / 210 / 280 bar', 36, 601, 25, ink);
    text('Bewegung braucht Ölfluss · Speicher puffert Lastspitzen', 36, 638, 23, muted);
  }
  line(35, 666, 925, 666);
  text(
    'SIM · ' + (r.source === 'off' ? 'SERVICE / STANDBY' : sourceLabel(r.source)),
    35,
    699,
    21,
    muted,
  );
  text('LINKS: SYSTEMSEITEN', 680, 699, 21, muted);
}
