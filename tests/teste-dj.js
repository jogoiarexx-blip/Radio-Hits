'use strict';
// Smoke test for the standalone DJ page. Runs without browser dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dj.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script, 'dj.html must contain an inline DJ controller');
new vm.Script(script, {filename: 'dj.html'}); // catches syntax errors before publishing

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
for (const [,id] of script.matchAll(/\$\('([a-z][a-z0-9-]*)'\)/g)) {
  assert.ok(ids.has(id), 'Missing DOM control: ' + id);
}
for (const id of ['mode','smart','play','skip','cross','genre','bpm0','bpm1','upnext','loop0','loop1']) {
  assert.ok(ids.has(id), 'Required DJ control missing: ' + id);
}

const elements = new Map();
const options = {mode:'auto',genre:'',volume:'75',bass:'0',filter:'18000',cross:'0',fade:'10',rate0:'100',rate1:'100'};
for (const id of ids) {
  elements.set(id,{
    id, value:options[id]||'',checked:id==='smart',textContent:'',style:{},items:[],
    classList:{toggle(){}},appendChild(o){this.items.push(o);}
  });
}
const sounds=[];
class FakeAudio {
  constructor(){this.paused=true;this.src='';this.duration=180;this.currentTime=20;this.playbackRate=1;this.handlers={};sounds.push(this);}
  pause(){this.paused=true;}
  load(){this.paused=true;this.currentTime=0;}
  async play(){if(!this.src)throw new Error('Missing audio source');this.paused=false;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  fire(name){this.handlers[name]?.();}
  removeAttribute(name){if(name==='src')this.src='';}
}
class Param {
  constructor(){this.value=0;}
  cancelScheduledValues(){}
  setValueAtTime(n){this.value=n;}
  linearRampToValueAtTime(n){this.value=n;}
  setTargetAtTime(n){this.value=n;}
}
class Node {
  constructor(){this.gain=new Param();this.frequency=new Param();this.fftSize=2048;this.frequencyBinCount=1024;}
  connect(){return this;}
  getByteFrequencyData(a){a.fill(0);}
}
class FakeContext{
  constructor(){this.destination={};this.currentTime=20;this.sampleRate=44100;}
  createGain(){return new Node();}
  createBiquadFilter(){return new Node();}
  createAnalyser(){return new Node();}
  createMediaElementSource(){return new Node();}
  async resume(){}
}
const sample = [
  {id:'test-1',title:'Track A',artist:'Artist A',genre:'Dance',src:'./musicas/test-a.mp3',lowSrc:'./musicas-leves/test-a.m4a',duration:180},
  {id:'test-2',title:'Track B',artist:'Artist B',genre:'Dance',src:'./musicas/test-b.mp3',lowSrc:'./musicas-leves/test-b.m4a',duration:180},
  {id:'test-3',title:'Track C',artist:'Artist C',genre:'Rock',src:'./musicas/test-c.mp3',duration:180}
];
const timeouts=[];
const mock={
  document:{getElementById:id=>{assert.ok(elements.has(id),'Unknown element '+id);return elements.get(id);},createElement:()=>({})},
  window:{AudioContext:FakeContext,addEventListener(){}},
  Audio:FakeAudio,
  location:{href:'https://example.test/Radio-Hits/dj.html'},
  URL,
  fetch:async()=>({ok:true,json:async()=>({tracks:sample})}),
  localStorage:{getItem:()=>null,setItem(){}},
  setInterval:()=>1,
  setTimeout:fn=>{timeouts.push(fn);return timeouts.length;},
  clearTimeout:()=>{},
  console
};
async function main(){
  vm.runInNewContext(script,mock,{filename:'dj.html'});
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.match(elements.get('status').textContent,/3 músicas/);
  assert.equal(elements.get('genre').items.length,2);
  await elements.get('play').onclick();
  assert.equal(sounds.length,2,'Two audio decks should be created');
  assert.ok(sounds.some(s=>!s.paused),'A deck should play on start');
  assert.ok(sounds.every(s=>s.src),'Automatic mode should preload the next deck');
  assert.notEqual(sounds[0].src,sounds[1].src,'Auto DJ should not immediately queue the same track');
  await elements.get('skip').onclick();
  assert.match(elements.get('status').textContent,/Mixando:/,'Skip should trigger crossfade');
  assert.ok(timeouts.length>0,'A crossfade completion should be scheduled');
  timeouts.at(-1)();
  elements.get('mode').value='manual';
  elements.get('mode').onchange();
  elements.get('cross').oninput({target:{value:'50'}});
  elements.get('smart').checked=false;elements.get('smart').onchange();
  assert.equal(elements.get('mode').value,'manual');
  assert.match(elements.get('status').textContent,/aleatória/);
  console.log('DJ Mix: syntax, DOM, catalog, dual deck, preload, mix and manual controls OK.');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
