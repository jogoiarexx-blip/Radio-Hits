'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalogo.json'),'utf8'));
const start=app.indexOf('  function playableTracks()'),stop=app.indexOf('  function queueFutureRadio(',start);
assert.ok(start>=0 && stop>start);
const epoch=Date.UTC(2026,0,1,0,0,0);
const state={tracks:catalog.tracks,radioOrder:catalog.radioOrder};
const ctx={state,EPOCH:epoch,Date,Math,Number};
vm.createContext(ctx);
vm.runInContext(app.slice(start,stop),ctx);
const order=ctx.radioTracks();
assert.equal(order.length,64,'simulacao de 64 faixas em ordem');
assert.equal(new Set(order.map(t=>t.id)).size,64,'nao deve repetir ID na programacao');
const total=order.reduce((n,t)=>n+Number(t.duration),0);
assert.ok(total>0);
let elapsed=0;
for(let i=0;i<order.length;i++){
  const duration=Number(order[i].duration);
  assert.ok(duration>2,'faixa pequena demais: '+order[i].id);
  const oneSecond=ctx.getRadioInfo(epoch+(elapsed+1)*1000);
  assert.equal(oneSecond.index,i,'faixa correta em horario fixo: '+i);
  assert.equal(oneSecond.track.id,order[i].id);
  assert.ok(Math.abs(oneSecond.offset-1)<0.001,'offset no começo da faixa: '+i);
  const beforeEnd=ctx.getRadioInfo(epoch+(elapsed+duration-1)*1000);
  assert.equal(beforeEnd.index,i,'nao trocar antecipadamente: '+i);
  elapsed+=duration;
}
for(const cycles of [1,3,7]){
  const info=ctx.getRadioInfo(epoch+(total*cycles+1)*1000);
  assert.equal(info.index,0,'o ciclo da radio deve reiniciar apos '+cycles+' voltas');
}
const service=fs.readFileSync(path.join(__dirname,'../android/app/src/main/java/br/com/radiohits/app/PlaybackService.java'),'utf8');
assert.match(service,/synchronizeRadioClock\(\)/);
assert.match(service,/PlaybackClock\.at\(System\.currentTimeMillis\(\),durations\)/);
assert.match(service,/drift>4000L/);
assert.match(service,/player\.seekTo\(clock\.index,clock\.offsetMs\)/);
console.log('RADIO 64 OK: todas as 64 janelas horarias, limites de faixa e 7 voltas do ciclo.');
