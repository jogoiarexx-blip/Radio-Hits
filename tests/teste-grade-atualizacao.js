'use strict';
/* Verifica que atualizar o catálogo não corta a faixa no meio. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const cat=JSON.parse(fs.readFileSync(path.join(root,'catalogo.json'),'utf8'));
const start=app.indexOf('  function playableTracks()');
const stop=app.indexOf('  function queueFutureRadio(',start);
assert.ok(start>=0&&stop>start);
const epoch=Date.UTC(2026,0,1);
const state={
  tracks:cat.tracks, radioOrder:cat.radioOrder,
  radioSchedule:cat.radioSchedule||{epochMs:epoch,revision:'legacy'},
  radioPlayback:null, mode:'radio'
};
const ctx={state,EPOCH:epoch,Date,Math,Number,radioWantsPlayback:true};
vm.createContext(ctx);
vm.runInContext(app.slice(start,stop),ctx);
const live=ctx.radioTracks();
const when=epoch+27_333_000;
const old=ctx.getRadioInfo(when);
assert.ok(old&&old.track);
state.radioPlayback={tracks:live,epochMs:epoch,revision:'antes'};
state.radioOrder=[...cat.radioOrder].reverse();
state.radioSchedule={epochMs:epoch+86_400_000,revision:'depois'};
const safe=ctx.getRadioInfo(when);
assert.equal(safe.track.id,old.track.id,'update não pode mudar a música tocando');
assert.equal(safe.index,old.index,'update não pode mudar índice ao vivo');
assert.equal(safe.offset,old.offset,'update não deve alterar offset');
assert.equal(ctx.radioTracks().length,live.length);
ctx.radioWantsPlayback=false;
const afterPause=ctx.radioTracks();
assert.equal(afterPause[0].id,state.radioOrder[0],'após pausa pode usar nova programação');
state.radioPlayback=null;
ctx.radioWantsPlayback=true;
const newSchedule=ctx.getRadioInfo(when);
assert.ok(newSchedule,'nova programação precisa existir');
assert.equal(ctx.radioTracks()[0].id,state.radioOrder[0]);
assert.match(app,/state\.radioPlayback = null/);
assert.match(app,/Nova programação disponível/);
assert.match(app,/state\.radioPlayback=null/);
assert.match(app,/scheduleRevision:state\.radioPlayback\?\.revision/);
console.log('ATUALIZAÇÃO AO VIVO OK: a grade atual não pula e o reinício adere à revisão nova.');
