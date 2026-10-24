import { renderMobilityPanel } from './mobility-instruments';
import { restraintLabel } from './mobility';
import { renderServicePanel } from './service-instruments';
import { electricalReadings, sourceLabel } from './service-systems';
import {
  testRunning,
  actuatorMoving,
  startChecklist,
  nextStartInstruction,
  shutdownChecklist,
  shutdownInstruction,
  thermalRate,
  dcPowerAvailable,
  mainPowerAvailable,
  type MachineState,
} from './machine';
export type TelemetrySample = { pressure: number; temperature: number };
export type InstrumentAssets = { structureAtlas?: CanvasImageSource };
export const STRUCTURE_ATLAS = '/instruments/mech-structure-atlas.png';
const C = {
  text: '#c9ecb3',
  muted: '#83a773',
  accent: '#a3e969',
  green: '#b4ee83',
  amber: '#efbd68',
  red: '#f17c61',
  line: '#29472a',
  panel: '#101f13',
  faint: '#182e1b',
};
export function renderInstrument(
  ctx: CanvasRenderingContext2D,
  kind: string,
  s: MachineState,
  time: number,
  angle: number,
  history: TelemetrySample[],
  assets: InstrumentAssets = {},
) {
  if (kind === 'electrical') {
    renderElectrical(ctx, s);
    return;
  }
  const c = ctx,
    W = 960,
    H = 720;
  c.save();
  c.setTransform(c.canvas.width / W, 0, 0, c.canvas.height / H, 0, 0);
  c.clearRect(0, 0, W, H);
  c.shadowBlur = 0;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const text = (str: string, x: number, y: number, size = 26, color = C.text, weight = 500) => {
    c.shadowColor = color;
    c.shadowBlur = color === C.accent || color === C.green ? 4 : 0;
    c.fillStyle = color;
    c.font = weight + ' ' + size + 'px "Arial",sans-serif';
    c.fillText(str, x, y);
    c.shadowBlur = 0;
  };
  const mono = (str: string, x: number, y: number, size = 25, color = C.text) => {
    c.shadowColor = color;
    c.shadowBlur = size >= 38 ? 5 : 0;
    c.fillStyle = color;
    c.font = '500 ' + size + 'px monospace';
    c.fillText(str, x, y);
    c.shadowBlur = 0;
  };
  const line = (x: number, y: number, xx: number, yy: number, color = C.line, width = 2) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(xx, yy);
    c.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number, fill = C.panel, r = 10) => {
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  };
  const ring = (x: number, y: number, r: number, color = C.line, width = 2) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  };
  const badge = (str: string, x: number, y: number, color = C.accent) => {
    c.font = '600 22px Arial';
    const w = c.measureText(str).width + 30;
    rect(x, y - 26, w, 36, C.faint, 6);
    text(str, x + 15, y, 22, color, 600);
  };
  const progress = (x: number, y: number, w: number, p: number, color = C.accent) => {
    rect(x, y, w, 9, C.faint, 4);
    if (p > 0) rect(x, y, w * Math.min(1, Math.max(0, p)), 9, color, 4);
  };
  const wrap = (
    str: string,
    x: number,
    y: number,
    width: number,
    size = 29,
    color = C.text,
    maxLines = 3,
  ) => {
    c.font = '500 ' + size + 'px Arial';
    let row = '',
      n = 0;
    for (const word of str.split(' ')) {
      const next = row ? row + ' ' + word : word;
      if (c.measureText(next).width > width && row) {
        text(row, x, y + n * size * 1.35, size, color);
        row = word;
        if (++n >= maxLines) return;
      } else row = next;
    }
    if (row && n < maxLines) text(row, x, y + n * size * 1.35, size, color);
  };
  const chart = (
    key: keyof TelemetrySample,
    x: number,
    y: number,
    w: number,
    h: number,
    max: number,
    color = C.accent,
  ) => {
    for (let j = 0; j < 4; j++) line(x, y + (j * h) / 3, x + w, y + (j * h) / 3, C.faint, 1);
    if (history.length < 2) return;
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.beginPath();
    history.forEach((v, i) => {
      const xx = x + (i / (history.length - 1)) * w,
        yy = y + h - Math.max(0, Math.min(1, v[key] / max)) * h;
      if (i) c.lineTo(xx, yy);
      else c.moveTo(xx, yy);
    });
    c.stroke();
  };
  if (kind === 'hud') {
    if (s.stage >= 5 && s.hudEnabled) {
      line(325, 360, 435, 360, C.accent, 3);
      line(525, 360, 635, 360, C.accent, 3);
      ring(480, 360, 36, C.accent, 3);
      line(480, 303, 480, 336, C.accent, 3);
      line(480, 384, 480, 417, C.accent, 3);
      text(
        'HDG ' +
          Math.round(((((-s.walk.yaw * 180) / Math.PI) % 360) + 360) % 360)
            .toString()
            .padStart(3, '0'),
        35,
        60,
        35,
        C.accent,
      );
      text(s.mobility.restraints === 'released' ? 'WALK' : 'LOCK', 790, 60, 35, C.amber);
      text((Math.abs(s.walk.speed) * 3.6).toFixed(1) + ' km/h', 35, 675, 34, C.accent);
      text(s.walk.z < -35 ? 'YARD' : 'HANGAR', 755, 675, 34, C.accent);
    }
    c.restore();
    return;
  }
  if (kind === 'power') {
    renderServicePanel(c, s, history);
    finishScreen(c);
    c.restore();
    return;
  }
  const bg = c.createLinearGradient(0, 0, 960, 720);
  bg.addColorStop(0, '#09150c');
  bg.addColorStop(1, '#020704');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  const shutting = s.shutdownPhase !== 'idle';
  if (kind === 'preflight' && !shutting) {
    renderMobilityPanel(c, s);
    finishScreen(c);
    c.restore();
    return;
  }
  const heatColor = s.thermalLimited ? C.red : s.thermalWarning ? C.amber : C.text;
  const names: Record<string, string> = {
    armor: 'STRUKTUR',
    radar: 'TAKTIK / RADAR',
    reactor: 'REAKTOR',
    diagnostics: shutting ? 'ABSCHALTSEQUENZ' : 'STARTSEQUENZ',
    weapons: 'BORDSYSTEME',
    comm: 'SYSTEMMELDUNGEN',
    power: 'VERSORGUNG',
    preflight: shutting ? 'HERUNTERFAHREN' : 'EINSATZPRÜFUNG',
  };
  rect(0, 0, W, 81, '#142519', 0);
  text(names[kind] ?? 'SYSTEM', 35, 51, 30, C.text, 700);
  mono('IV–04', 797, 49, 24, C.muted);
  line(35, 82, 925, 82, C.accent, 2);
  const service =
    ['diagnostics', 'comm', 'power', 'preflight'].includes(kind) ||
    (kind === 'reactor' && (s.temperature > 45 || shutting));
  if (!s.stage && !service) {
    text('STANDBY', 55, 326, 58, C.muted, 600);
    text('Versorgung im Overhead aufbauen', 57, 376, 29, C.muted);
    mono('OVERHEAD [O]', 57, 432, 25, C.accent);
    finishScreen(c);
    c.restore();
    return;
  }
  line(35, 666, 925, 666);
  text(
    s.stage ? 'BUS ' + (s.stage >= 4 ? 'ONLINE' : 'AUX') : 'SERVICE / STANDBY',
    35,
    699,
    21,
    C.muted,
  );
  text('SIM · ' + s.stage + '/6 SYSTEME', 707, 699, 21, C.muted);
  if (kind === 'armor') {
    text('Integrität der Maschine', 35, 125, 27, C.muted);
    badge(
      s.stage >= 3 ? 'DIAGNOSE OK' : 'PRÜFUNG AUSSTEHEND',
      590,
      125,
      s.stage >= 3 ? C.green : C.amber,
    );
    const active = s.testPhase === 'actuators' ? Math.min(3, Math.floor(s.testElapsed / 2.5)) : -1;
    text('FRONT', 209, 178, 27, C.accent, 600);
    text('RÜCKSEITE', 630, 178, 27, C.accent, 600);
    if (assets.structureAtlas) {
      c.save();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      // Exact orthographic GLB views, equally scaled. Two cached image draws,
      // plus matching amber masks during actuator tests; no extra world render.
      for (const [row, x] of [
        [0, 70],
        [1, 528],
      ]) {
        c.drawImage(assets.structureAtlas, 0, row * 512, 512, 512, x, 190, 362, 362);
        if (active >= 0)
          c.drawImage(
            assets.structureAtlas,
            (active + 1) * 512,
            row * 512,
            512,
            512,
            x,
            190,
            362,
            362,
          );
      }
      c.restore();
    } else text('Modellansichten werden geladen …', 245, 363, 27, C.muted);
    rect(36, 577, 889, 63);
    text(
      active >= 0
        ? ['Linker Arm', 'Rechter Arm', 'Linkes Bein', 'Rechtes Bein'][active] +
            (actuatorMoving(s) ? ' · Funktionstest' : ' · Pausiert')
        : 'Strukturzustand',
      55,
      618,
      28,
      C.muted,
    );
    text(s.stage >= 3 ? '100 %' : '—', 765, 621, 35, s.stage >= 3 ? C.green : C.muted, 700);
  } else if (kind === 'radar') {
    text('Lokales Lagebild', 35, 127, 28, C.muted);
    badge(
      s.radarPaused ? 'SCAN PAUSIERT' : 'SCAN AKTIV',
      660,
      128,
      s.radarPaused ? C.amber : C.accent,
    );
    const x = 474,
      y = 380,
      r = 206;
    for (let i = 1; i <= 4; i++)
      ring(x, y, (r * i) / 4, i === 4 ? C.accent : C.line, i === 4 ? 2 : 1.5);
    line(x - r - 18, y, x + r + 18, y);
    line(x, y - r - 18, x, y + r + 18);
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      line(
        x + Math.sin(a) * r,
        y + Math.cos(a) * r,
        x + Math.sin(a) * (r + 7),
        y + Math.cos(a) * (r + 7),
        C.muted,
        1,
      );
    }
    if (s.stage >= 5 && !s.service.sensorFault) {
      for (let i = 0; i < 24; i++) {
        const a = angle - i * 0.012;
        c.strokeStyle = 'rgba(163,233,105,' + 0.5 * (1 - i / 24) + ')';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        c.stroke();
      }
      for (const [mx, my] of [
        [-125, -106],
        [175, 30],
        [-56, 191],
        [-380, 190],
        [420, -300],
      ]) {
        const xx = (mx / s.radarRange) * r,
          yy = (my / s.radarRange) * r;
        if (Math.hypot(xx, yy) < r) {
          rect(x + xx - 4, y + yy - 4, 8, 8, C.accent, 1);
        }
      }
      if (s.testPhase === 'sensors') {
        const dist = [90, 185, 420][s.testSensors];
        const a = [-0.7, -2.2, 0.6][s.testSensors];
        if (dist < s.radarRange) {
          const xx = x + ((Math.cos(a) * dist) / s.radarRange) * r,
            yy = y + ((Math.sin(a) * dist) / s.radarRange) * r;
          c.strokeStyle = C.amber;
          c.lineWidth = 3;
          c.strokeRect(xx - 13, yy - 13, 26, 26);
          text('T' + (s.testSensors + 1), xx + 20, yy + 9, 25, C.amber);
        }
        badge('TEST ' + (s.testSensors + 1) + '/3', 36, 182, C.amber);
      }
    } else {
      rect(220, 345, 515, 77);
      text(
        s.service.sensorFault ? 'SENSORFEHLER' : 'Sensoren noch offline',
        253,
        394,
        35,
        s.service.sensorFault ? C.amber : C.muted,
      );
    }
    ring(x, y, 8, C.text, 2);
    text('N', 465, 157, 21, C.muted);
    text('REICHWEITE', 37, 620, 23, C.muted);
    mono(s.radarRange + ' m', 727, 625, 38, C.text);
  } else if (kind === 'reactor') {
    const p = s.stage >= 4 ? 1 : s.busy === 3 ? s.progress : 0;
    text('Hauptantrieb', 35, 128, 28, C.muted);
    badge(
      s.thermalLimited
        ? 'LIMIT 25 %'
        : s.thermalWarning
          ? 'TEMPERATUR'
          : p
            ? 'AKTIV'
            : s.heatLoad > 0.08
              ? 'RESTWÄRME'
              : 'INAKTIV',
      660,
      128,
      s.thermalLimited ? C.red : s.thermalWarning ? C.amber : p ? C.green : C.muted,
    );
    mono(
      Math.round(p * (27 + s.throttle * 61))
        .toString()
        .padStart(2, '0'),
      42,
      278,
      112,
      C.text,
    );
    text('MW', 207, 275, 35, C.accent);
    text('REAKTORLEISTUNG', 44, 326, 24, C.muted);
    rect(377, 177, 548, 167);
    text('Leistungshebel', 404, 218, 28, C.muted);
    mono(Math.round(s.throttle * 100) + ' %', 721, 268, 47, C.text);
    progress(405, 297, 490, p * (0.25 + s.throttle * 0.75));
    const rate = thermalRate(s) * 60;
    const rows = [
      ['Kühlkreistemperatur', s.temperature.toFixed(1) + ' °C'],
      [
        'Kühlfluss · ' + (s.service.mode === 'auto' ? 'AUTO' : s.coolingLevel),
        s.coolantFlow.toFixed(1) + ' L/s',
      ],
      ['Restwärme', Math.round(s.heatLoad * 100) + ' %'],
      ['Temperaturtrend', (rate >= 0 ? '+' : '') + rate.toFixed(1) + ' °C/min'],
    ];
    rows.forEach(([label, value], i) => {
      const y = 407 + i * 65;
      text(label, 43, y, 28, C.muted);
      text(
        value,
        623,
        y,
        31,
        i === 0 ? heatColor : i === 3 ? (rate > 0 ? C.amber : C.green) : C.text,
      );
      if (i < 3) line(43, y + 23, 915, y + 23, C.faint, 1);
    });
  } else if (kind === 'diagnostics') {
    const tasks = shutting ? shutdownChecklist(s) : startChecklist(s),
      next = tasks.findIndex((t) => !t.done),
      offset = Math.max(0, Math.min(tasks.length - 6, next < 0 ? tasks.length - 6 : next - 2));
    const total = Math.round(
      (tasks.reduce((n, t) => n + (t.done ? 1 : (t.fraction ?? 0)), 0) / tasks.length) * 100,
    );
    text(shutting ? 'Abschalten / Checkliste' : 'Kaltstart / Checkliste', 36, 145, 34, C.text, 700);
    mono(total + ' %', 728, 147, 49, C.accent);
    progress(36, 173, 888, total / 100);
    tasks.slice(offset, offset + 6).forEach((task, i) => {
      const y = 237 + i * 48,
        active = offset + i === next;
      rect(36, y - 27, 40, 35, task.done ? '#243f30' : C.faint, 5);
      mono(String(offset + i + 1).padStart(2, '0'), 42, y, 22, task.done ? C.green : C.muted);
      text(task.label, 99, y, shutting ? 26 : 29, task.done ? C.text : active ? C.accent : C.muted);
      text(
        task.done
          ? 'BEREIT'
          : task.fraction
            ? Math.round(task.fraction * 100) + ' %'
            : active
              ? 'NÄCHSTER'
              : 'OFFEN',
        740,
        y,
        24,
        task.done ? C.green : active ? C.accent : C.muted,
      );
    });
    rect(36, 537, 888, 106);
    rect(36, 537, 5, 106, C.accent, 0);
    wrap(
      s.error ? s.message : shutting ? shutdownInstruction(s) : nextStartInstruction(s),
      56,
      577,
      845,
      25,
      s.error ? C.amber : C.accent,
      2,
    );
  } else if (kind === 'weapons') {
    const rows = [
      ['Kabinenlüfter', s.stage ? [0, 720, 1150, 1480][s.fanLevel] + ' RPM' : 'AUS'],
      ['Hydraulik', Math.round(s.actualPressure) + ' bar'],
      ['Displayhelligkeit', Math.round(s.displayBrightness * 100) + ' %'],
      ['Radarsuche', s.stage >= 5 ? (s.radarPaused ? 'PAUSIERT' : 'AKTIV') : 'OFFLINE'],
      ['HUD', s.stage >= 5 && s.hudEnabled ? 'AKTIV' : 'AUS'],
      ['Parkverriegelung', restraintLabel(s)],
    ];
    rows.forEach(([label, value], i) => {
      const y = 160 + i * 79;
      rect(36, y - 37, 888, 65);
      text(label, 57, y + 5, 30, C.muted);
      text(value, i === 5 ? 575 : 650, y + 5, i === 5 ? 25 : 32, i === 5 ? C.amber : C.text);
    });
  } else if (kind === 'comm') {
    badge(s.error ? 'WARNUNG' : 'SYSTEM', 36, 135, s.error ? C.amber : C.accent);
    wrap(s.message, 42, 236, 869, 47, s.error ? C.amber : C.text, 5);
  } else if (kind === 'power') {
    text('Hydraulikdruck', 36, 132, 29, C.muted);
    mono(Math.round(s.actualPressure).toString(), 39, 250, 101, C.text);
    text('bar', 249, 247, 34, C.accent);
    text('SOLL', 655, 176, 23, C.muted);
    mono((s.stage >= 2 ? s.hydraulicPressure : 0) + ' bar', 655, 224, 39, C.text);
    progress(38, 278, 884, s.actualPressure / 300);
    chart('pressure', 40, 312, 880, 88, 300);
    text('DRUCKVERLAUF · 12 s', 40, 426, 21, C.muted);
    line(36, 454, 925, 454);
    text('Kühlkreistemperatur', 39, 500, 29, C.muted);
    mono(s.temperature.toFixed(1) + ' °C', 658, 507, 43, heatColor);
    chart('temperature', 40, 535, 880, 59, 120, s.thermalWarning ? C.red : C.amber);
    text(
      'KÜHLUNG ' + s.coolingLevel + ' · ' + s.coolantFlow.toFixed(1) + ' L/s',
      40,
      637,
      23,
      s.coolantFlow > 20 ? C.green : C.muted,
    );
    text('ROTLICHT ' + Math.round(s.ceilingBrightness * 100) + ' %', 628, 637, 24, C.amber);
  } else if (kind === 'preflight' && shutting) {
    const phases = {
      idle: '',
      prepare: 'ABSCHALTEN VORBEREITEN',
      cooldown: 'NACHKÜHLUNG LÄUFT',
      isolate: 'FREIGABE ZUM TRENNEN',
      interrupted: 'NACHKÜHLUNG UNTERBROCHEN',
      complete: 'GEORDNET ABGESCHALTET',
    };
    badge(
      phases[s.shutdownPhase],
      36,
      131,
      s.shutdownPhase === 'interrupted'
        ? C.red
        : s.shutdownPhase === 'complete'
          ? C.green
          : C.amber,
    );
    text('Kühlkreis', 40, 190, 28, C.muted);
    mono(s.temperature.toFixed(1) + ' °C', 40, 267, 65, heatColor);
    text('Kühlmittelfluss', 530, 190, 28, C.muted);
    mono(s.coolantFlow.toFixed(1) + ' L/s', 530, 267, 51, s.coolantFlow >= 20 ? C.green : C.muted);
    rect(36, 301, 888, 62);
    text('Restwärme ' + Math.round(s.heatLoad * 100) + ' %', 56, 342, 28, C.text);
    text('Nachlauf ' + Math.floor(s.cooldownElapsed) + ' s', 528, 342, 28, C.text);
    const tasks = shutdownChecklist(s),
      done = tasks.filter((t) => t.done).length;
    progress(37, 386, 886, done / tasks.length);
    text(done + ' / ' + tasks.length + ' Schritte', 38, 420, 22, C.muted);
    wrap(
      s.error ? s.message : shutdownInstruction(s),
      40,
      467,
      880,
      27,
      s.shutdownPhase === 'interrupted' ? C.amber : C.text,
      2,
    );
    rect(36, 534, 888, 48, C.panel);
    text('PARKVERRIEGELUNG: ' + restraintLabel(s), 56, 566, 26, C.accent, 700);
    rect(36, 602, 432, 48, C.faint);
    text('SYSTEMTEST GESPERRT', 56, 634, 24, C.muted);
    rect(492, 602, 432, 48, C.panel);
    text(
      s.shutdownPhase === 'prepare'
        ? 'ABBRECHEN [K]'
        : s.shutdownPhase === 'complete'
          ? 'KALTSTART [K]'
          : s.shutdownPhase === 'interrupted'
            ? 'FORTSETZEN [K]'
            : 'STATUS [K]',
      512,
      634,
      26,
      C.accent,
      700,
    );
  } else if (kind === 'preflight') {
    const running = testRunning(s),
      passed = s.testPhase === 'passed';
    badge(
      passed
        ? 'BESTANDEN'
        : running
          ? 'PRÜFUNG LÄUFT'
          : s.testPhase === 'aborted'
            ? 'ABGEBROCHEN'
            : 'BEREIT',
      36,
      131,
      passed ? C.green : running ? C.accent : s.testPhase === 'aborted' ? C.amber : C.muted,
    );
    const phases = ['Hydraulik', 'Aktuatoren', 'Sensoren'];
    const phaseIndex = ['hydraulics', 'actuators', 'sensors'].indexOf(s.testPhase);
    phases.forEach((label, i) => {
      const y = 201 + i * 70;
      const done = s.testResults[i],
        active = phaseIndex === i;
      rect(36, y - 37, 888, 58);
      mono('0' + (i + 1), 53, y, 25, done ? C.green : C.muted);
      text(label, 111, y, 32, C.text);
      text(
        done ? 'BESTANDEN' : active ? 'IN PRÜFUNG' : 'OFFEN',
        704,
        y,
        23,
        done ? C.green : active ? C.accent : C.muted,
      );
    });
    let p = passed
      ? 1
      : s.testPhase === 'hydraulics'
        ? s.testHold / 3 / 3
        : s.testPhase === 'actuators'
          ? (1 + s.testElapsed / 10) / 3
          : s.testPhase === 'sensors'
            ? (2 + (s.testSensors + s.testHold / 2.5) / 3) / 3
            : 0;
    progress(37, 386, 886, p, passed ? C.green : C.accent);
    wrap(s.testMessage, 40, 443, 880, 34, s.testPhase === 'aborted' ? C.amber : C.text, 3);
    rect(36, 585, 432, 57, passed ? '#1e382b' : C.faint);
    text(
      running ? 'ABBRECHEN [T]' : passed ? 'ERNEUT PRÜFEN [T]' : 'SYSTEMTEST [T]',
      56,
      624,
      26,
      passed ? C.green : C.accent,
      700,
    );
    rect(492, 602, 432, 48, C.panel);
    text('ABSCHALTEN [K]', 512, 624, 26, C.amber, 700);
  }
  finishScreen(c);
  c.restore();
}

function finishScreen(c: CanvasRenderingContext2D) {
  c.shadowBlur = 0;
  const shade = c.createRadialGradient(480, 340, 190, 480, 360, 600);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,.26)');
  c.fillStyle = shade;
  c.fillRect(0, 0, 960, 720);
  c.strokeStyle = '#2c4c29';
  c.lineWidth = 2;
  c.strokeRect(12, 12, 936, 696);
}

function renderElectrical(c: CanvasRenderingContext2D, s: MachineState) {
  c.save();
  c.setTransform(c.canvas.width / 1440, 0, 0, c.canvas.height / 140, 0, 0);
  c.clearRect(0, 0, 1440, 140);
  c.fillStyle = '#050e07';
  c.fillRect(0, 0, 1440, 140);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const o = s.overhead,
    powered = dcPowerAvailable(s);
  const apu =
    o.apuPhase === 'running'
      ? 'AVAIL · 100 %'
      : o.apuPhase === 'starting'
        ? Math.round(o.apuProgress * 100) + ' % RPM'
        : o.apuPhase === 'preparing'
          ? 'FLAP OPENING'
          : o.apuPhase === 'ready'
            ? 'READY / START'
            : 'OFF';
  const r = electricalReadings(s),
    source = sourceLabel(r.source);
  const values = [
    ['BAT 1', r.batteryVoltage[0].toFixed(1) + ' V · ' + (o.battery1 ? 'ON' : 'OFF')],
    ['BAT 2', r.batteryVoltage[1].toFixed(1) + ' V · ' + (o.battery2 ? 'ON' : 'OFF')],
    ['APU', apu],
    ['POWER SOURCE', source],
  ];
  values.forEach(([label, value], i) => {
    const x = 26 + i * 354;
    c.fillStyle = C.muted;
    c.font = '600 22px Arial';
    c.fillText(label, x, 36);
    c.fillStyle = !powered
      ? '#5b7354'
      : value === 'OFF'
        ? C.muted
        : i === 2 && o.apuPhase === 'starting'
          ? C.amber
          : C.accent;
    c.font = '600 30px monospace';
    c.fillText(value, x, 94);
    if (i < 3) {
      c.fillStyle = C.line;
      c.fillRect(x + 324, 24, 1, 91);
    }
  });
  c.restore();
}
