'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/style.css'),'utf8');
const js=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
assert.match(html,/id="vinyl-deck"/);
assert.match(html,/id="vinyl-record"/);
assert.match(html,/id="vinyl-cover"/);
assert.match(html,/class="vinyl-tonearm"/);
assert.match(html,/class="mini-vinyl"/);
assert.match(css,/@keyframes radiohits-vinyl-spin/);
assert.match(css,/\.vinyl-deck\.is-playing \.vinyl-record\{animation-play-state:running\}/);
assert.match(css,/\.player-shell\.is-playing \.mini-vinyl\{animation-play-state:running\}/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(sw,/radio-hits-shell-v20/);
const begin=js.indexOf('  function setPlayVisuals() {');
const end=js.indexOf('  function renderPlayer() {',begin);
assert.ok(begin>=0&&end>begin,'setPlayVisuals encontrada');
function element(){
  const classes=new Set(), attributes={};
  return {
    classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)},contains(name){return classes.has(name)}},
    innerHTML:'', setAttribute(name,value){attributes[name]=value},
    getAttribute(name){return attributes[name]??null}
  };
}
const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const state={currentId:'faixa1',mode:'ondemand'};
const audio={paused:false,ended:false};
const tracks={faixa1:{cover:'./assets/capas/um.svg'},faixa2:{cover:'./assets/capas/dois.svg'}};
const ctx={state,audio,$,icon:()=>'<svg/>',trackById:id=>tracks[id],getRadioInfo:()=>null,
  document:{querySelector:()=>$('station-card')}};
vm.createContext(ctx);
vm.runInContext(js.slice(begin,end),ctx);
const active=id=>$(id).classList.contains('is-playing');
ctx.setPlayVisuals();
assert.equal(active('vinyl-deck'),true,'LP gira quando o player está tocando');
assert.equal(active('player-shell'),true,'mini-LP acompanha reprodução');
assert.equal($('vinyl-cover').getAttribute('src'),tracks.faixa1.cover);
audio.paused=true;ctx.setPlayVisuals();
assert.equal(active('vinyl-deck'),false,'pausa precisa parar disco');
assert.equal(active('player-shell'),false,'pausa precisa parar mini-LP');
audio.paused=false;audio.ended=true;ctx.setPlayVisuals();
assert.equal(active('vinyl-deck'),false,'fim da música precisa parar LP');
audio.ended=false;state.currentId='faixa2';state.mode='radio';ctx.setPlayVisuals();
assert.equal($('vinyl-cover').getAttribute('src'),tracks.faixa2.cover,'capa muda junto com a faixa');
assert.equal(active('vinyl-deck'),true);
assert.equal(active('station-card'),true);
state.currentId=null;ctx.setPlayVisuals();
assert.equal(active('vinyl-deck'),false);
console.log('VINIL OK: capa, rotação, pausa, fim, rádio, sob demanda, mobile e movimento reduzido.');
