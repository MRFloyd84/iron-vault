// MCDU-Bildschirm (ehemals UPLINK) im Stil eines Airbus-Navigationsrechners:
// Seitentitel, sechs Zeilen mit kleiner Beschriftung und großem Wert, Notizzeile unten.
// Farben wie im Vorbild: weiß Beschriftung, grün Daten, cyan wählbar, magenta aktiver
// Wegpunkt, gelb vorläufiger Plan, bernstein Hinweis/Warnung.
import type { MachineState } from './machine';
import {
  DIR_PAGE,
  FPLN_ROWS,
  MSG_ROWS,
  courseTo,
  crossTrack,
  cruiseSpeed,
  destinations,
  remaining,
  type FlightPlan,
} from './autopilot';
import { sectorName } from './terrain';
import { tr } from './i18n';

const W = 1440,
  H = 720;
const COL = {
  white: '#e6efe2',
  label: '#a9bba5',
  green: '#78ff6c',
  cyan: '#6fe2ff',
  magenta: '#ff78f4',
  yellow: '#fff06a',
  amber: '#ffb54a',
  dim: '#5d7a5a',
};
type Cell = { text: string; color?: string };
type Row = { labelL?: string; dataL?: Cell; labelR?: string; dataR?: Cell };

const metres = (m: number) => (m >= 1000 ? (m / 1000).toFixed(2) + ' KM' : Math.round(m) + ' M');
const deg = (d: number) => String(Math.round(d) % 360).padStart(3, '0') + '°';
const clock = (s: number) => {
  if (!isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(Math.round(s % 60)).padStart(2, '0');
};
const waypointName = (p: FlightPlan, i: number) =>
  i === 0 ? 'POS' : i === p.points.length - 1 ? p.dest.name : 'WP' + String(i).padStart(2, '0');

export function renderMcdu(c: CanvasRenderingContext2D, s: MachineState, time: number) {
  const f = s.fms;
  c.save();
  c.setTransform(c.canvas.width / W, 0, 0, c.canvas.height / H, 0, 0);
  c.fillStyle = '#020604';
  c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';
  const font = (size: number, weight = 500) =>
    (c.font = weight + ' ' + size + 'px "DejaVu Sans Mono","Consolas",monospace');
  const put = (str: string, x: number, y: number, size: number, color: string, align = 'left') => {
    font(size);
    c.textAlign = align as CanvasTextAlign;
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 6;
    // Wählbar-Zeichen und Sternchen bleiben, der Text dazwischen wird übersetzt
    const pre = str.startsWith('‹') ? '‹' : '',
      post = str.endsWith('›') ? '›' : str.endsWith('*') ? '*' : '';
    let t = pre + tr(str.slice(pre.length, str.length - post.length)) + post;
    // Zu lang: kürzen statt überlaufen
    while (t.length > 1 && c.measureText(t).width > 1320) t = t.slice(0, -2) + '…';
    c.fillText(t, x, y);
    c.shadowBlur = 0;
  };
  const pos = { x: s.walk.x, z: s.walk.z };
  const plan = f.tmpy ?? f.plan;
  const tmpy = !!f.tmpy;
  let title = '',
    titleColor = COL.white,
    pageInfo = '';
  let rows: Row[] = [];
  const speed = cruiseSpeed(s) * 0.92;

  if (f.page === 'dir') {
    title = 'DIR TO';
    const list = destinations(f);
    const pages = Math.ceil(list.length / DIR_PAGE);
    pageInfo = pages > 1 ? f.scroll + 1 + '/' + pages : '';
    rows = list.slice(f.scroll * DIR_PAGE, f.scroll * DIR_PAGE + DIR_PAGE).map((d, i) => ({
      labelL: i === 0 && f.scroll === 0 ? 'ZIEL WÄHLEN' : undefined,
      dataL: { text: '‹' + d.name, color: COL.cyan },
      labelR: i === 0 && f.scroll === 0 ? 'KURS   ENTF' : undefined,
      dataR: { text: deg(courseTo(pos, d)) + '  ' + metres(Math.hypot(d.x - pos.x, d.z - pos.z)) },
    }));
    while (rows.length < DIR_PAGE) rows.push({});
    if (pages > 1) rows.push({ dataR: { text: 'WEITERE›', color: COL.cyan } });
  } else if (f.page === 'fpln') {
    title = tmpy ? 'TMPY F-PLN' : 'F-PLN';
    titleColor = tmpy ? COL.yellow : COL.white;
    if (!plan) {
      rows = [
        { labelL: 'KEIN FLUGPLAN', dataL: { text: 'DIR ODER RTB DRÜCKEN', color: COL.amber } },
      ];
    } else {
      const n = plan.points.length;
      pageInfo = n > FPLN_ROWS ? f.scroll + 1 + '/' + (n - FPLN_ROWS + 1) : '';
      for (let r = 0; r < FPLN_ROWS; r++) {
        const i = f.scroll + r;
        if (i >= n) {
          rows.push(i === n ? { dataL: { text: '---- ENDE F-PLN ----', color: COL.white } } : {});
          continue;
        }
        const active = !tmpy && f.ap !== 'off' && i === f.leg;
        const color = tmpy ? COL.yellow : active ? COL.magenta : COL.green;
        const prev = plan.points[Math.max(0, i - 1)],
          p = plan.points[i];
        rows.push({
          labelL: i === 0 ? 'FROM' : active ? 'TO' : undefined,
          dataL: { text: waypointName(plan, i), color },
          labelR: i === 0 ? 'KURS   ABSCHN' : undefined,
          dataR:
            i === 0
              ? { text: sectorName(p.x, p.z), color }
              : {
                  text:
                    deg(courseTo(prev, p)) + '  ' + metres(Math.hypot(p.x - prev.x, p.z - prev.z)),
                  color,
                },
        });
      }
      const rest = tmpy ? plan.length : remaining(f, pos);
      rows.push({
        labelL: 'ZIEL',
        dataL: { text: plan.dest.name, color: tmpy ? COL.yellow : COL.green },
        labelR: 'DIST    ZEIT',
        dataR: {
          text: metres(rest) + '  ' + clock(rest / speed),
          color: tmpy ? COL.yellow : COL.green,
        },
      });
      rows.push(
        tmpy
          ? {
              labelL: 'CLR = VERWERFEN',
              labelR: 'ÜBERNEHMEN',
              dataR: { text: 'INSERT*', color: COL.amber },
            }
          : f.ap === 'off'
            ? { dataR: { text: 'AP DRÜCKEN ZUM START', color: COL.white } }
            : {},
      );
    }
  } else if (f.page === 'prog') {
    title = 'PROG';
    const active = f.plan && f.ap !== 'off';
    const to = active ? f.plan!.points[f.leg] : null;
    const rest = active ? remaining(f, pos) : 0;
    const xtk = active ? crossTrack(f, pos) : 0;
    rows = [
      {
        labelL: 'AUTOPILOT',
        dataL:
          f.ap === 'nav'
            ? { text: 'AP1 NAV', color: COL.green }
            : f.ap === 'hold'
              ? { text: 'AP1 HOLD', color: COL.cyan }
              : { text: 'AUS', color: COL.amber },
        labelR: 'STUFE',
        dataR: { text: String(s.walk.gear), color: COL.green },
      },
      {
        labelL: 'TO',
        dataL: to ? { text: waypointName(f.plan!, f.leg), color: COL.magenta } : { text: '----' },
        labelR: 'KURS   ENTF',
        dataR: to
          ? { text: deg(courseTo(pos, to)) + '  ' + metres(Math.hypot(to.x - pos.x, to.z - pos.z)) }
          : { text: '----' },
      },
      {
        labelL: 'ZIEL',
        dataL: f.plan ? { text: f.plan.dest.name } : { text: '----' },
        labelR: 'REST    ZEIT',
        dataR: active ? { text: metres(rest) + '  ' + clock(rest / speed) } : { text: '----' },
      },
      {
        labelL: 'GESCHW',
        dataL: { text: (Math.abs(s.walk.speed) * 3.6).toFixed(1) + ' KM/H' },
        labelR: 'XTK',
        dataR: {
          text: active ? Math.abs(xtk).toFixed(1) + (xtk >= 0 ? ' R' : ' L') : '----',
          color: Math.abs(xtk) > 8 ? COL.amber : COL.green,
        },
      },
      {
        labelL: 'POSITION',
        dataL: {
          text: sectorName(pos.x, pos.z) + '  ' + Math.round(pos.x) + ' / ' + Math.round(-pos.z),
        },
        labelR: 'KURS',
        dataR: { text: deg((((-s.walk.yaw * 180) / Math.PI) % 360) + 360) },
      },
      f.ap === 'off'
        ? {}
        : { dataR: { text: f.ap === 'hold' ? 'WEITER*' : 'HOLD*', color: COL.cyan } },
    ];
  } else if (f.page === 'perf') {
    title = 'PERF';
    rows = [
      {
        labelL: 'AP-STUFE',
        dataL: {
          text: '‹' + (f.gear === 2 ? '2  EILMARSCH 14 KM/H' : '1  SCHRITT 8 KM/H'),
          color: COL.cyan,
        },
      },
      {
        labelL: 'PISTEN BEVORZUGEN',
        dataL: { text: '‹' + (f.preferRoads ? 'JA' : 'NEIN'), color: COL.cyan },
      },
      {
        labelL: 'HALT VOR ZIEL',
        dataL: { text: '‹' + f.stopDistance + ' M', color: COL.cyan },
      },
      {
        labelL: 'PLANUNG',
        dataL: { text: 'ABSTAND 6 M · HANG MAX 15°', color: COL.green },
      },
      {
        labelL: 'LEISTUNGSHEBEL',
        dataL: {
          text: Math.round(s.throttle * 100) + ' %',
          color: s.throttle > 0 ? COL.green : COL.amber,
        },
      },
    ];
  } else {
    title = 'MELDUNGEN';
    const log = f.log.length ? f.log : s.message ? [{ text: s.message, error: s.error }] : [];
    pageInfo = log.length > MSG_ROWS ? f.scroll + 1 + '/' + (log.length - MSG_ROWS + 1) : '';
    rows = log.slice(f.scroll, f.scroll + MSG_ROWS).map((m) => ({
      dataL: { text: m.text, color: m.error ? COL.amber : COL.green },
    }));
    if (!log.length) rows = [{ dataL: { text: 'KEINE MELDUNGEN', color: COL.dim } }];
    while (rows.length < MSG_ROWS) rows.push({});
    if (f.log.length) rows.push({ dataR: { text: 'LÖSCHEN*', color: COL.cyan } });
  }

  // Kopfzeile: AP-Anzeige links, Titel, Seitenzahl rechts
  if (f.ap !== 'off') {
    const label = f.ap === 'hold' ? 'AP HOLD' : 'AP NAV';
    const color = f.ap === 'hold' ? COL.cyan : COL.green;
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.strokeRect(28, 22, 200, 54);
    put(label, 128, 62, 32, color, 'center');
  }
  put(title, W / 2, 66, 50, titleColor, 'center');
  if (pageInfo) put(pageInfo, W - 40, 62, 30, COL.white, 'right');

  // Sechs Zeilen; links die Nummer der Zeilentaste unter dem Bildschirm
  rows.forEach((r, i) => {
    const yl = 122 + i * 88,
      yd = 164 + i * 88;
    const selectable =
      r.dataL?.color === COL.cyan || r.dataR?.color === COL.cyan || r.dataR?.text.endsWith('*');
    put(String(i + 1), 18, yd, 24, selectable ? COL.cyan : COL.dim);
    if (r.labelL) put(r.labelL, 64, yl, 26, COL.label);
    if (r.labelR) put(r.labelR, W - 40, yl, 26, COL.label, 'right');
    if (r.dataR && r.dataL && f.page !== 'msg') {
      put(r.dataL.text, 64, yd, 42, r.dataL.color ?? COL.green);
      put(r.dataR.text, W - 40, yd, 42, r.dataR.color ?? COL.green, 'right');
    } else if (r.dataL) {
      if (f.page === 'msg') {
        // Meldungen: zweizeilig umbrechen
        font(30);
        const words = tr(r.dataL.text).split(' ');
        let line = '',
          n = 0;
        for (const w of words) {
          const next = line ? line + ' ' + w : w;
          if (c.measureText(next).width > 1330 && line) {
            put(line, 64, yl + 4 + n * 38, 30, r.dataL.color ?? COL.green);
            line = w;
            if (++n > 1) break;
          } else line = next;
        }
        if (n <= 1 && line) put(line, 64, yl + 4 + n * 38, 30, r.dataL.color ?? COL.green);
      } else put(r.dataL.text, 64, yd, 42, r.dataL.color ?? COL.green);
    }
    if (r.dataR && !r.dataL) put(r.dataR.text, W - 40, yd, 42, r.dataR.color ?? COL.green, 'right');
  });

  // Notizzeile: letzte Meldung (auf der Meldungsseite der AP-Status)
  c.strokeStyle = '#1d3a1c';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(20, 640);
  c.lineTo(W - 20, 640);
  c.stroke();
  if (f.page !== 'msg' && s.message) put(s.message, 24, 690, 32, s.error ? COL.amber : COL.white);
  else
    put(
      f.ap === 'off'
        ? 'AP AUS · STUFE ' + s.walk.gear
        : 'AP ' + (f.ap === 'hold' ? 'HOLD' : 'NAV') + ' · ' + (f.plan?.dest.name ?? ''),
      24,
      690,
      32,
      f.ap === 'off' ? COL.dim : COL.green,
    );
  // Leichtes Flimmern der Röhre und Helligkeit (BRT/DIM)
  c.fillStyle = 'rgba(0,0,0,' + (0.04 + 0.02 * Math.sin(time * 9)).toFixed(3) + ')';
  for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 2);
  if (f.brightness < 1) {
    c.fillStyle = 'rgba(0,0,0,' + (1 - f.brightness).toFixed(2) + ')';
    c.fillRect(0, 0, W, H);
  }
  c.restore();
}
