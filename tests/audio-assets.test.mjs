import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadAudio,decodeAudio,audioAssetErrors} from '../lib/audio-assets.ts';

test('transient load failure retries once without the cached error response',async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)return {ok:false,status:503};return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};};
  const bytes=await loadAudio('retry-test.ogg');assert.equal(bytes.byteLength,3);assert.equal(calls.length,2);
  assert.equal(calls[1].options.cache,'reload');assert.equal(audioAssetErrors()['load:retry-test.ogg'],undefined);
  const url=new URL(calls[0].url,'https://example.test');assert.equal(url.pathname,'/audio/retry-test.ogg');assert.ok(url.searchParams.get('v'));
  assert.equal(calls[0].url,calls[1].url);
 }finally{globalThis.fetch=original;}
});

test('permanent HTTP and decoder errors retain filename and reason instead of silent nulls',async()=>{
 const original=globalThis.fetch,warn=console.warn,messages=[];
 try{
  console.warn=(message)=>messages.push(message);globalThis.fetch=async()=>({ok:false,status:403});
  assert.equal(await loadAudio('blocked-test.ogg'),null);assert.equal(audioAssetErrors()['load:blocked-test.ogg'],'HTTP 403');
  const ctx={state:'running',decodeAudioData:async()=>{throw new Error('EncodingError');}};
  assert.equal(await decodeAudio(ctx,new ArrayBuffer(2),'invalid-test.ogg'),null);
  assert.equal(audioAssetErrors()['decode:invalid-test.ogg'],'EncodingError');assert.equal(messages.length,2);
  ctx.decodeAudioData=async()=>({duration:1});await decodeAudio(ctx,new ArrayBuffer(2),'invalid-test.ogg');
  assert.equal(audioAssetErrors()['decode:invalid-test.ogg'],undefined);
 }finally{globalThis.fetch=original;console.warn=warn;}
});

test('empty recordings are rejected; a closed context does not decode',async()=>{
 const original=globalThis.fetch,warn=console.warn;
 try{
  console.warn=()=>{};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
  assert.equal(await loadAudio('empty-test.ogg'),null);assert.match(audioAssetErrors()['load:empty-test.ogg'],/Leere/);
  assert.equal(await decodeAudio({state:'closed',decodeAudioData(){throw new Error('must not run');}},new ArrayBuffer(2),'closed-test.ogg'),null);
 }finally{globalThis.fetch=original;console.warn=warn;}
});
