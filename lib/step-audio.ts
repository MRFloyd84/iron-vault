import {loadAudio,decodeAudio} from './audio-assets';
import type {MachineState} from './machine';
import {AUDIO_LEVELS} from './audio-mix';

export const preloadStep=()=>loadAudio('mech-step.ogg');
type Voice={source:AudioBufferSourceNode;gain:GainNode};
export class StepAudio{
 private buffer:AudioBuffer|null=null;
 private previous:number|null=null;
 private voices=new Set<Voice>();
 private disposed=false;
 private ctx:AudioContext;private output:AudioNode;
 constructor(ctx:AudioContext,output:AudioNode,bytes:Promise<ArrayBuffer|null>){
  this.ctx=ctx;this.output=output;
  void bytes.then(data=>!this.disposed?decodeAudio(ctx,data,'mech-step.ogg'):null).then(buffer=>{if(!this.disposed)this.buffer=buffer;}).catch(()=>{});
 }
 update(s:MachineState){
  const step=s.walk.step,previous=this.previous;this.previous=step;
  // Never queue old impacts during loading/resume, or burst after a clock gap.
  if(this.disposed||previous===null||step<=previous||!this.buffer||this.ctx.state!=='running')return;
  const ctx=this.ctx,source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffer;
  source.playbackRate.setValueAtTime(step%2?.98:1.02,ctx.currentTime);
  gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(AUDIO_LEVELS.step,ctx.currentTime+.003);
  source.connect(gain);gain.connect(this.output);const voice={source,gain};
  // Three short tails suffice at maximum pace; abandoned voices cannot accumulate.
  if(this.voices.size>=3){const old=this.voices.values().next().value!;old.gain.gain.setTargetAtTime(0,ctx.currentTime,.015);old.source.stop(ctx.currentTime+.07);this.voices.delete(old);}
  this.voices.add(voice);source.onended=()=>{source.disconnect();gain.disconnect();this.voices.delete(voice);};source.start();
 }
 dispose(){this.disposed=true;this.buffer=null;for(const v of this.voices){v.source.stop();v.source.disconnect();v.gain.disconnect();}this.voices.clear();}
}
