'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const cat=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalogo.json'),'utf8'));
const begin=app.indexOf('  // Executado próximo ao fim da faixa.');
const end=app.indexOf('  function loadTrack(t, seekTo=0)',begin);
assert.ok(begin>0 && end>begin,'Funções de pré-carregamento não encontradas');
function fakeAudio(src, time=0, duration=60){
  return {src,readyState:3,currentTime:time,duration,volume:0.8,paused:false,ended:false,
    pause(){this.paused=true},removeAttribute(k){if(k==='src')this.src=''},
    load(){this.loadCount=(this.loadCount||0)+1;}};
}
const active=fakeAudio('primeira',48,60);
const standby=fakeAudio('proxima',0,60);
const state={
  loaded:true,shuffle:false,repeat:'off',mode:'ondemand',
  queue:cat.radioOrder,queueIndex:0,currentId:cat.radioOrder[0],
  volume:0.65,pendingSeek:null,
};
const context={
  state,audio:active,standby,primedTrackId:null,preloadGeneration:0,
  lastPreloadAttempt:0,offline:{playableSource:t=>Promise.resolve(t.src)},
  nativeBridge:false,gainFactor:()=>1,navigator:{connection:{saveData:false}},
  getRadioInfo:()=>null,trackById:id=>cat.tracks.find(t=>t.id===id),
  console,Date
};
vm.createContext(context);
vm.runInContext(app.slice(begin,end),context);
const firstNext=cat.radioOrder[1];
assert.equal(context.nextToPrepare().id,firstNext,'Não preparou a próxima faixa na ordem fixa');
context.state.shuffle=true;
assert.equal(context.nextToPrepare(),null,'Não pode prever ordem aleatória');
context.state.shuffle=false;
context.state.repeat='one';
assert.equal(context.nextToPrepare(),null,'Repetir uma faixa não deve pré-carregar outra');
context.state.repeat='off';
context.audio.currentTime=3;
assert.equal(context.nextToPrepare(),null,'Não deve baixar a música seguinte cedo demais');
context.audio.currentTime=48;
context.primedTrackId=firstNext;
const success=context.usePreparedAudio(context.trackById(firstNext),3);
assert.equal(success,true,'A faixa preparada não foi ativada');
assert.equal(context.audio,standby,'Não trocou os elementos de áudio');
assert.equal(context.standby,active,'Não reutilizou o elemento anterior');
assert.equal(context.audio.currentTime,3,'Não respeitou a posição sincronizada');
assert.equal(context.audio.volume,state.volume,'Volume do player não foi preservado');
assert.equal(context.primedTrackId,null,'A identidade da prévia não foi liberada');
assert.equal(context.state.pendingSeek,null,'Seek pendente não finalizado');
assert.equal(context.usePreparedAudio(cat.tracks[2],0),false,'Não deve trocar para prévia incorreta');
context.state.mode='radio';
context.state.repeat='off';
context.getRadioInfo=()=>({remaining:15,index:0,tracks:cat.tracks});
assert.equal(context.nextToPrepare().id,cat.tracks[1].id,'Rádio não aponta próxima música');
context.getRadioInfo=()=>({remaining:40,index:0,tracks:cat.tracks});
assert.equal(context.nextToPrepare(),null,'Rádio não deve antecipar faixa fora da janela');
console.log('TRANSIÇÕES OK: ordem fixa, modo aleatório, repetir uma, janela de pré-carga, troca e posição.');
