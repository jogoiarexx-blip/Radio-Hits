'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/offline.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalogo.json'),'utf8'));
const cacheMap=new Map();
const calls=[];
const fakeCache={
  match:async key=>cacheMap.get(String(key))?.clone()||null,
  put:async(key,response)=>{cacheMap.set(String(key),response.clone());},
  delete:async key=>cacheMap.delete(String(key)),
  keys:async()=>Array.from(cacheMap.keys(),url=>new Request(url))
};
const web={
  window:{},
  document:{baseURI:'https://jogoiarexx-blip.github.io/Radio-Hits/'},
  caches:{open:async()=>fakeCache},
  navigator:{storage:{estimate:async()=>({quota:1e9,usage:0})}},
  fetch:async(url)=>{
    calls.push(String(url));
    return new Response(new Uint8Array([73,68,51,0,0,0]),{
      status:200,headers:{'content-length':'6','content-type':'audio/mpeg'}
    });
  },
  URL,Blob,Response,Request,Error,Set,Map,Number,Math,Promise,console
};
vm.createContext(web);
vm.runInContext(source,web);
const offline=web.window.RadioHitsOffline;
assert.ok(offline && !offline.isNative);
assert.equal(offline.isCatalogAudio(catalog.tracks[0].src),true);
assert.equal(offline.isCatalogAudio('https://outro-servidor.com/musicas/music.mp3'),false);
assert.equal(offline.isCatalogAudio('../admin/config.json'),false);
assert.equal(offline.isCatalogAudio('./musicas/malicioso.html'),false);
const commercial=catalog.tracks.find(t=>t.downloadAllowed===false);
const original=catalog.tracks.find(t=>t.downloadAllowed===true);
assert.ok(commercial && original,'Amostras comerciais e demonstrativas ausentes');
(async()=>{
  for(const t of [commercial,original]){
    const progress=[];
    await offline.download(t,p=>progress.push(p));
    const saved=await offline.list();
    assert.ok(saved.has(offline.absolute(t.src)),'Faixa não persistiu no Cache Storage');
    const offlineSrc=await offline.playableSource(t);
    assert.ok(offlineSrc.startsWith('blob:'),'Player não usa mídia local');
    assert.ok(progress.includes(100),'Progresso não concluiu');
  }
  assert.equal(calls.length,2,'Devem ocorrer somente downloads explícitos');
  await offline.remove(commercial);
  assert.ok(!(await offline.list()).has(offline.absolute(commercial.src)),'Remoção não funcionou');
  const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  const native=fs.readFileSync(path.join(__dirname,'../android/app/src/main/java/br/com/radiohits/app/MainActivity.java'),'utf8');
  assert.match(app,/nativeIsLocal/,'O navegador do APK precisa reconhecer mídia local');
  assert.match(native,/status\.put\("isLocal"/,'O Android precisa informar se usa arquivo salvo');
  console.log('DOWNLOAD OFFLINE OK: comercial e instrumental, Cache Storage, blob, remoção e ponte Android.');
})().catch(e=>{console.error(e);process.exitCode=1;});
