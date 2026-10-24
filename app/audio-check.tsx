import {useState} from 'react';
import type {MachineAudio} from '../lib/machine-audio';
import {inspectAudio} from '../lib/audio-diagnostics';
import {audioUrl} from '../lib/audio-assets';

export default function AudioCheck({read,close}:{read:()=>MachineAudio|null;close:()=>void}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState('');
 async function run(){
  const audio=read();if(!audio||busy)return;setBusy(true);setResult('Prüfung läuft …');
  try{
   // Resume synchronously in the click gesture, before measuring or fetching.
   await audio.enable();setResult(JSON.stringify(await inspectAudio(audio),null,2));
  }catch(error){setResult('Audioprüfung fehlgeschlagen: '+(error instanceof Error?error.message:String(error)));}
  finally{setBusy(false);}
 }
 return <aside className="audio-check" aria-label="Audioprüfung">
  <div className="audio-check-heading"><h2>Audioprüfung</h2><button onClick={close} aria-label="Audioprüfung schließen">×</button></div>
  <p>Die Prüfung erzeugt etwa eine Sekunde lang einen Ton über denselben Audioweg wie die Maschine. Eine bewusste Stummschaltung bleibt erhalten.</p>
  <button disabled={busy} onClick={run}>{busy?'Wird geprüft …':'Prüfton und Signalweg prüfen'}</button>
  <p>Vergleich: vorhandene Druckluftaufnahme direkt im Browserplayer abspielen. Kein Download erforderlich.</p>
  <audio controls preload="none" src={audioUrl('air-release.mp3')} aria-label="Druckluftaufnahme als Audiotest"/>
  {result&&<><label htmlFor="audio-check-result">Prüfergebnis – anklicken zum Markieren und Kopieren</label><textarea id="audio-check-result" readOnly rows={12} value={result} onFocus={e=>e.currentTarget.select()}/></>}
  <p>„signalDetected: true“ bestätigt ein Signal vor dem Systemausgang. Ob Lautsprecher oder Kopfhörer es wiedergeben, kann die Seite nicht messen.</p>
 </aside>;
}
