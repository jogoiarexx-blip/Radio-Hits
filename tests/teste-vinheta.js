'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const catalog=JSON.parse(get('catalogo.json'));
const app=get('js/app.js');
const android=get('android/app/src/main/java/br/com/radiohits/app/OfflineStore.java');
const snapshot=get('android/app/src/main/java/br/com/radiohits/app/PlaybackSnapshot.java');
const activity=get('android/app/src/main/java/br/com/radiohits/app/MainActivity.java');
const songs=catalog.tracks.filter(t=>!t.isJingle);
const jingles=catalog.tracks.filter(t=>t.isJingle);
assert.ok(songs.length>=110,'musicas nao podem sumir da biblioteca');
assert.equal(jingles.length,Math.floor(songs.length/5),'uma vinheta a cada cinco musicas');
const byId=new Map(catalog.tracks.map(t=>[t.id,t]));
assert.equal(byId.size,catalog.tracks.length,'ID unico no Media3');
assert.equal(catalog.radioOrder.length,catalog.tracks.length,'programacao cobre todos os itens');
assert.ok(jingles.every(t=>t.duration>=5&&t.duration<=30),'vinheta curta');
const names=['radio-hits-cada-5.mp3','radio-hits-alto-astral.mp3','radio-hits-classicos.mp3'];
assert.ok(jingles.every((t,i)=>t.src==='./vinhetas/'+names[i%3]),
  'as 3 vinhetas devem alternar sem perder blocos de cinco');
assert.ok(new Set(jingles.map(t=>t.src)).size===3,'variantes de rádio ausentes');
assert.ok(jingles.every(t=>t.downloadAllowed===false),'vinheta nao eh musica baixavel');
assert.ok(jingles.every(t=>t.gainDb<=0),'jingle nao amplifica volume');
const sequence=catalog.radioOrder.map(id=>byId.get(id)).filter(t=>!t.isJingle);
assert.equal(sequence.length,songs.length);
assert.ok(sequence.every((t,i)=>i===0||t.artist!==sequence[i-1].artist),
  'curadoria não pode encadear o mesmo artista');
assert.ok(sequence.every((t,i)=>i<2||t.genre!==sequence[i-1].genre||t.genre!==sequence[i-2].genre),
  'não manter três músicas consecutivas do mesmo estilo');
assert.match(catalog.radioSchedule.revision,/^[a-f0-9]{16}$/);
for(let i=0,musicCount=0;i<catalog.radioOrder.length;i++){
  const id=catalog.radioOrder[i],t=byId.get(id);
  assert.ok(t,'faixa em ordem deve existir '+id);
  if(t.isJingle) {
    assert.equal(musicCount%5,0,'vinheta nao pode aparecer antes da quinta musica');
    assert.equal(id,'vinheta-radio-hits-'+String(musicCount/5).padStart(3,'0'));
  }else{
    musicCount++;
    assert.equal(Boolean(byId.get(catalog.radioOrder[i+1])?.isJingle),musicCount%5===0,
      'exatamente uma vinheta apos 5 musicas');
  }
}
const start=app.indexOf('  function playableTracks()');
const stop=app.indexOf('  function queueFutureRadio(',start);
assert.ok(start>0&&stop>start);
const state={tracks:catalog.tracks,radioOrder:catalog.radioOrder,radioSchedule:catalog.radioSchedule};
const ctx={state,EPOCH:Date.UTC(2026,0,1),Date,Math,Number};
vm.createContext(ctx);vm.runInContext(app.slice(start,stop),ctx);
const playlist=ctx.radioTracks();
const total=playlist.reduce((sum,t)=>sum+t.duration,0);
assert.ok(total>0);
const epoch=Date.UTC(2026,0,1);
let time=0;
for(let i=0;i<playlist.length;i++){
  const t=playlist[i];
  const actual=ctx.getRadioInfo(epoch+(time+0.5)*1000);
  assert.equal(actual.track.id,t.id,'sincronismo nao pode pular a vinheta');
  time+=t.duration;
}
const nextCycle=ctx.getRadioInfo(epoch+(total+0.5)*1000);
assert.equal(nextCycle.index,0,'ciclo reinicia no primeiro hit');
assert.match(app,/function libraryTracks\(\) \{ return state\.tracks\.filter\(t => !t\.isJingle\); \}/);
assert.match(app,/if \(!t \|\| t\.isJingle\) return;/,'bloqueio da vinheta sob demanda');
assert.match(android,/static boolean validStreamUrl\(String src\)/);
assert.match(android,/\/Radio-Hits\/vinhetas\/radio-hits-cada-5\.mp3/);
assert.match(android,/\/Radio-Hits\/vinhetas\/radio-hits-alto-astral\.mp3/);
assert.match(android,/\/Radio-Hits\/vinhetas\/radio-hits-classicos\.mp3/);
assert.match(activity,/return OfflineStore\.validStreamUrl\(url\)/);
assert.match(snapshot,/OfflineStore\.validStreamUrl\(url\)/);
const media=get('scripts/preparar_site.py');
assert.match(media,/'vinhetas'/,'asset de vinheta precisa ser publicado');
console.log('VINHETAS ALTERNADAS OK (3 versões): '+songs.length+' musicas, '+jingles.length+
  ' entradas (a cada 5 hits), UTC, retorno de ciclo, isolamento sob demanda e Android.');
