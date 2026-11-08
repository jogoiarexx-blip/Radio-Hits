'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('js/app.js'),html=read('index.html'),sw=read('sw.js');
const cat=JSON.parse(read('catalogo.json')),songs=cat.tracks.filter(t=>!t.isJingle);
assert.ok(songs.length>=150,'desativar seis demos não deve afetar as músicas comerciais válidas');
assert.equal(songs.filter(t=>t.lowSrc).length,songs.length);
for(const t of songs) {
  assert.ok(t.lowSrc.startsWith('./musicas-leves/'),t.lowSrc);
  assert.match(t.lowSrc,/\.m4a$/);
}
assert.match(app,/dataSaver: typeof saved\.dataSaver/);
assert.match(app,/streamSrc:streamSource\(t\)/);
assert.match(app,/offlineSources\.has\(original\)/);
assert.match(html,/id="data-saver-toggle"/);
assert.match(sw,/function cacheFirst/);
assert.match(sw,/AUDIO_EXT/);
const a=app.indexOf('  function streamSource(t) {');
const b=app.indexOf('\n  }',a);
assert.ok(a>=0 && b>a);
const fragment=app.slice(a,b+4);
const base='https://jogoiarexx-blip.github.io/Radio-Hits/';
const original=base+'musicas/a.mp3',low=base+'musicas-leves/a.m4a';
function check(dataSaver,downloaded) {
 const ctx={URL,document:{baseURI:base},state:{dataSaver},
  offlineSources:new Set(downloaded?[original]:[])};
 vm.createContext(ctx);vm.runInContext(fragment,ctx);
 return ctx.streamSource({src:'./musicas/a.mp3',lowSrc:'./musicas-leves/a.m4a'});
}
assert.equal(check(true,false),low,'economia usa AAC');
assert.equal(check(false,false),original,'modo normal usa original');
assert.equal(check(true,true),original,'original offline tem prioridade');
assert.match(read('android/app/src/main/java/br/com/radiohits/app/MainActivity.java'),/approvedLowStream/);
console.log('ECO OK: modo móvel, URLs comprimidas, offline e cache.');
