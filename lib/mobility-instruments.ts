import {walkBlock} from './walking';
import {gateLabel} from './hangar';
import type {MachineState} from './machine';
import {MOBILITY_CONTROLS,releaseBlock,restraintLabel} from './mobility';

export function renderMobilityPanel(c:CanvasRenderingContext2D,s:MachineState){
 const ink='#c9ecb3',green='#a3e969',muted='#83a773',amber='#efbd68';
 const text=(v:string,x:number,y:number,size=26,color=ink)=>{c.fillStyle=color;c.font='500 '+size+'px Arial';c.fillText(v,x,y);};
 const box=(x:number,y:number,w:number,h:number,color='#101f13')=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 const wrap=(v:string,y:number)=>{c.font='500 24px Arial';let line='';for(const word of v.split(' ')){if(c.measureText(line+' '+word).width>860){text(line,48,y,24,amber);line=word;y+=29;if(y>448)return;}else line+=(line?' ':'')+word;}text(line,48,y,24,amber);};
 const m=s.mobility,testing=['hydraulics','actuators','sensors'].includes(s.testPhase);
 box(0,0,960,720,'#050e07');box(0,0,960,81,'#142519');text('MOBILITÄT / FREIGABE',35,51,30);text('IV–04',797,49,24,muted);
 if(m.page==='release'){
  const rows=[['Neurohelm',m.helmet?'VERBUNDEN':'GETRENNT'],['Kalibrierung',m.calibration==='ready'?'SYNCHRON':m.calibration==='running'?Math.round(m.elapsed/8*100)+' %':'AUSSTEHEND'],['Gelenke / Sensoren',s.testPhase==='passed'?'GEPRÜFT':'TEST [T]'],['Steuerverbindung',s.stage===6?'LINK ONLINE':'LINK [6]'],['Parkverriegelung',restraintLabel(s)]];
  rows.forEach(([label,value],i)=>{const y=187+i*43;box(36,y-25,888,38);text(label,52,y,26,muted);text(value,619,y,26);});
  // Travel indicator is tied to the actual locking state, including fail-safe closure.
  const cx=479,travel=m.travel*48;
  box(cx-20,329,40,16,muted);box(cx-40-travel,324,13,26,green);box(cx+27+travel,324,13,26,green);
  box(36,383,888,6);box(36,383,888*(m.calibration==='ready'?1:m.elapsed/8),6,green);
  wrap(m.calibration==='running'?['Nullpunkt erfassen …','Lagesensor und Gyro abgleichen …','Verbindung stabilisieren …'][Math.min(2,Math.floor(m.elapsed/3))]:m.restraints==='released'?'Parkverriegelung gelöst. Tor öffnen, dann GEHEN wählen.':releaseBlock(s)??'Freigabe erteilt. Parkverriegelung kann gelöst werden.',421);
 }else if(m.page==='hangar'){
  text('HANGARTOR 07',36,195,32);text(gateLabel(s),568,195,30,green);
  box(170,224,620,150,'#060b08');const gap=s.hangar.position*300;box(170-gap,230,305,138,'#294027');box(485+gap,230,305,138,'#294027');
  box(0,214,150,177,'#050e07');box(810,214,150,177,'#050e07');text(Math.round(s.hangar.position*100)+' % OFFEN',365,410,30,green);
  text('Toröffnung: Freigabe, Parkverriegelung gelöst, 0 %.',36,450,24,muted);text('TESTGELÄNDE [U]: Außenkamera · W/S im Cockpit',36,491,24,muted);
 }else if(m.page==='walk'){
  const w=s.walk;const heading=(((-w.yaw*180/Math.PI)%360)+360)%360;
  text((Math.abs(w.speed)*3.6).toFixed(1),42,231,66,green);text('km/h',245,225,25,muted);
  text(Math.abs(w.speed)<.02?'STILLSTAND':w.speed>0?'VORWÄRTS':'RÜCKWÄRTS',370,196,25);
  text('KURS '+Math.round(heading).toString().padStart(3,'0')+'°',688,196,26);
  text('LEISTUNGSLIMIT '+Math.round(s.throttle*100)+' %',370,238,25,muted);
  box(36,259,888,64);text('NEIGUNG '+(w.pitch*180/Math.PI).toFixed(1)+'°',52,298,24);text('QUER '+(w.roll*180/Math.PI).toFixed(1)+'°',353,298,24);text(w.distance.toFixed(1)+' m WEG',662,298,24);
  const left=Math.floor(w.phase*2)%2===0;
  text(Math.abs(w.speed)+Math.abs(w.turnRate)<.02?'BEIDE FÜSSE GESTÜTZT':left?'SCHRITT: LINKS → RECHTS':'SCHRITT: RECHTS → LINKS',40,364,25,green);
  wrap(w.blocked||walkBlock(s)||'W/S gehen · A/D drehen · Leertaste bremsen',416);
 }else{
  text(s.testPhase==='passed'?'ALLE PRÜFUNGEN BESTANDEN':testing?'SYSTEMTEST LÄUFT':'SYSTEMTEST / 0 % LEISTUNG',36,191,29,s.testPhase==='passed'?green:ink);
  ['Hilfshydraulik · 210 bar','Gelenke · 4 Aktuatoren','Sensoren · 125 / 250 / 500 m'].forEach((v,i)=>{const y=252+i*58;box(36,y-34,888,49);text(v,52,y,26);text(s.testResults[i]?'OK':['hydraulics','actuators','sensors'][i]===s.testPhase?'PRÜFUNG':'OFFEN',756,y,23,s.testResults[i]?green:muted);});
  const p=s.testPhase==='passed'?1:s.testPhase==='hydraulics'?s.testHold/9:s.testPhase==='actuators'?(1+s.testElapsed/10)/3:s.testPhase==='sensors'?(2+(s.testSensors+s.testHold/2.5)/3)/3:0;
  box(36,392,888,8);box(36,392,888*Math.min(1,p),8,green);wrap(s.testMessage,437);
  text('Prüfstand verriegelt · kein Vortrieb',36,538,25,muted);
 }
 const labels:Record<number,string>={80:'FREIGABE',81:'SYSTEMTEST',85:'HANGAR',93:'GEHEN',94:'SCHRITTBEWEGUNG: '+(s.walk.sway===0?'AUS':s.walk.sway===.4?'DEZENT':'STARK'),95:'LEISTUNG − [BILD AB]',96:'LEISTUNG + [BILD AUF]',90:'TOR ÖFFNEN',91:'STOP',92:'TOR SCHLIESSEN',82:m.helmet?'HELM TRENNEN':'HELM VERBINDEN',83:m.calibration==='running'?'KALIBRIERUNG LÄUFT':'KALIBRIEREN',84:m.restraints==='locked'?'PARKVERRIEGELUNG LÖSEN':m.restraints==='locking'?'VERRIEGELUNG SCHLIESST …':'PARKVERRIEGELUNG SCHLIESSEN',30:testing?'TEST ABBRECHEN [T]':'SYSTEMTEST [T]',35:'ABSCHALTEN [K]'};
 for(const b of MOBILITY_CONTROLS){if('page'in b&&b.page!==m.page)continue;const active=b.action===(m.page==='release'?80:m.page==='test'?81:m.page==='walk'?93:85);box(b.x,b.y,b.w,b.h,active?'#294027':'#16281a');const label=labels[b.action];c.font='600 24px Arial';c.fillStyle=active?green:ink;c.fillText(label,b.x+(b.w-c.measureText(label).width)/2,b.y+32);}
 text('W/S GEHEN · A/D DREHEN',36,699,21,muted);text('LEERTASTE: BREMSE',675,699,21,muted);
}
