import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measureAudioBus} from '../lib/audio-diagnostics.ts';

function fixture(peak=.04){
 const disconnected=[],master={gain:{value:.38},connect(node){this.tap=node;},disconnect(node){disconnected.push(['master',node]);}};
 const analyser={fftSize:0,getFloatTimeDomainData(data){data.fill(peak);},disconnect(){disconnected.push(['analyser']);}};
 const tone={frequency:{value:0},connect(node){this.output=node;},start(){this.started=true;},stop(){this.stopped=true;},disconnect(){disconnected.push(['tone']);}};
 const gain={gain:{value:0},connect(node){this.output=node;},disconnect(){disconnected.push(['gain']);}};
 const ctx={state:'running',currentTime:0,createAnalyser:()=>analyser,createOscillator:()=>tone,createGain:()=>gain};
 return {ctx,master,muted:false,disposed:false,analyser,tone,gain,disconnected,pause:async()=>{ctx.currentTime+=.12;}};
}
test('diagnostic measures the existing master bus, advances clock and removes only its temporary branch',async()=>{
 const f=fixture(),r=await measureAudioBus(f,f.pause);
 assert.equal(r.signalDetected,true);assert.equal(r.clockSeconds,.96);assert.equal(f.gain.output,f.master);
 assert.equal(f.tone.output,f.gain);assert.equal(f.tone.started,true);assert.equal(f.tone.stopped,true);
 assert.deepEqual(f.disconnected.find(v=>v[0]==='master'),['master',f.analyser]);assert.equal(f.disconnected.length,4);
 assert.equal(f.master.gain.value,.38);
});
test('running context with silent samples is not reported as a successful output signal',async()=>{
 const f=fixture(0);f.muted=true;f.master.gain.value=0;
 const r=await measureAudioBus(f,async()=>{});assert.equal(r.signalDetected,false);assert.equal(r.clockSeconds,0);
 assert.equal(r.muted,true);assert.equal(f.master.gain.value,0);
});
test('interrupted diagnostic cleans up its nodes even when the machine is disposed',async()=>{
 const f=fixture();await assert.rejects(measureAudioBus(f,async()=>{f.disposed=true;}),/unterbrochen/);
 assert.equal(f.disconnected.length,4);assert.equal(f.tone.stopped,true);
});
