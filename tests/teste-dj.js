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
for (const id of ['mode','smart','beatgrid','trimintro','waves','wave0','wave1','vu0','vu1','level0','level1','beat0','beat1','play','skip','cross','genre','bpm0','bpm1','upnext','loop0','loop1']) {
  assert.ok(ids.has(id), 'Required DJ control missing: ' + id);
}

// Test beat-aware entry math separately from browser audio timing.
const begin=script.indexOf('function nextBeatDelayMs('),end=script.indexOf('async function next(){',begin);
assert.ok(begin>=0&&end>begin,'Beat-alignment function must exist');
const beatFn=script.slice(begin,end);
const beatOptions={beatgrid:{checked:true},smart:{checked:true},fade:{value:'10'}};
const beatContext=vm.createContext({$:id=>beatOptions[id]});
vm.runInContext(beatFn,beatContext);
const beatChannel={bpm:120,beats:[1,2,3,4,5,6,7,8],lastBeat:8,el:{currentTime:8.2,duration:60,playbackRate:1}};
assert.ok(Math.abs(vm.runInContext('nextBeatDelayMs',beatContext)(beatChannel)-300)<1,
  'With 120 BPM, onset at 8 s and current time 8.2 s should wait about 300 ms');
beatChannel.el.currentTime=49.2;
assert.equal(vm.runInContext('nextBeatDelayMs',beatContext)(beatChannel),0,'stale beat phase must fall back');
beatChannel.el.currentTime=8.2;beatChannel.beats.length=0;
assert.equal(vm.runInContext('nextBeatDelayMs',beatContext)(beatChannel),0,'insufficient beat evidence must fall back');
beatChannel.beats=[1,2,3,4,5,6,7,8];beatOptions.beatgrid.checked=false;
assert.equal(vm.runInContext('nextBeatDelayMs',beatContext)(beatChannel),0,'user can disable quantization');

const elements = new Map();
const drawings = [];
const canvasContext = {fillRect(){drawings.push('fill');},beginPath(){},moveTo(){},lineTo(){},stroke(){drawings.push('stroke');}};
const frames = [];
const options = {mode:'auto',genre:'',volume:'75',bass:'0',filter:'18000',cross:'0',fade:'10',rate0:'100',rate1:'100'};
for (const id of ids) {
  elements.set(id,{
    id, value:options[id]||'',checked:id==='smart'||id==='waves'||id==='beatgrid'||id==='trimintro',textContent:'',style:{},items:[],
    width:384,height:72,getContext:()=>canvasContext,
    classList:{toggle(){}},replaceChildren(){this.items=[];this.value='';},appendChild(o){this.items.push(o);if(!this.value)this.value=o.value;}
  });
}
const sounds=[];
class FakeAudio {
  constructor(){this.paused=true;this.src='';this.duration=180;this.currentTime=20;this.readyState=1;this.playbackRate=1;this.handlers={};sounds.push(this);}
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
  getByteTimeDomainData(a){a.fill(128);}
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
  {id:'test-1',title:'Track A',artist:'Artist A',genre:'Dance',src:'./musicas/test-a.mp3',lowSrc:'./musicas-leves/test-a.m4a',duration:180,djIntroSec:2.25},
  {id:'test-2',title:'Track B',artist:'Artist B',genre:'Dance',src:'./musicas/test-b.mp3',lowSrc:'./musicas-leves/test-b.m4a',duration:180,djIntroSec:2.25},
  {id:'test-3',title:'Track C',artist:'Artist C',genre:'Rock',src:'./musicas/test-c.mp3',duration:180,djIntroSec:2.25}
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
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
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
  assert.equal(elements.get('choose').items.length,3,'Library should display the three test songs');
  await elements.get('play').onclick();
  assert.equal(sounds.length,2,'Two audio decks should be created');
  assert.ok(sounds.some(s=>!s.paused),'A deck should play on start');
  assert.ok(sounds.every(s=>Math.abs(s.currentTime-2.25)<.01),'Auto DJ should cue each loaded song after leading silence');
  assert.ok(frames.length>0,'Visualizer should schedule an animation frame');
  frames.shift()(150);
  assert.ok(drawings.includes('stroke'),'Visualizer should draw the deck waveforms');
  elements.get('waves').checked=false;elements.get('waves').onchange();
  assert.equal(elements.get('scope0').hidden,true,'Visualization toggle should hide deck scopes');
  elements.get('waves').checked=true;elements.get('waves').onchange();
  assert.ok(sounds.every(s=>s.src),'Automatic mode should preload the next deck');
  assert.notEqual(sounds[0].src,sounds[1].src,'Auto DJ should not immediately queue the same track');
  await elements.get('skip').onclick();
  assert.match(elements.get('status').textContent,/Mixando:/,'Skip should trigger crossfade');
  assert.ok(timeouts.length>0,'A crossfade completion should be scheduled');
  timeouts.at(-1)();
  elements.get('trimintro').checked=false;elements.get('trimintro').onchange();
  assert.equal(sounds.some(s=>s.paused&&s.currentTime===0),true,'Intro skip toggle should restore the waiting track');
  elements.get('mode').value='manual';
  elements.get('mode').onchange();
  elements.get('cross').oninput({target:{value:'50'}});
  elements.get('beatgrid').checked=false;elements.get('beatgrid').onchange();
  assert.match(elements.get('status').textContent,/Entrada imediata/);
  elements.get('smart').checked=false;elements.get('smart').onchange();
  assert.match(elements.get('status').textContent,/aleatória/);
  elements.get('search').value='Artist C';elements.get('search').oninput();
  assert.equal(elements.get('choose').items.length,1,'Manual song search should filter the catalog');
  elements.get('send0').onclick();
  assert.match(elements.get('status').textContent,/Track C carregada/);
  assert.equal(sounds[0].currentTime,0,'Manual deck must start at the beginning');
  assert.equal(elements.get('mode').value,'manual');
  console.log('DJ Mix: syntax, DOM, catalog, dual deck, preload, mix, auto intro cue, live waveforms, search and manual controls OK.');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
