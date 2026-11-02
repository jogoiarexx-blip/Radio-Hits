'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/offline.js'),'utf8');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'catalogo.json'),'utf8'));
const tracks=catalogue.tracks.filter(t=>!t.isJingle);
assert.ok(tracks.length>=64,'a rádio precisa manter ao menos as 64 faixas iniciais');
assert.ok(tracks.every(Boolean),'Ordem da radio contem faixa ausente');
const cached=new Map();
const transfer=[];
let fetchCount=0,created=0,revoked=0;
let incomplete=false;
class MockURL extends URL {
  static createObjectURL() { return 'blob:radio-' + (++created); }
  static revokeObjectURL() { revoked++; }
}
const cache={
  match:async key=>cached.get(String(key))?.clone()||null,
  put:async(key,response)=>{
    // A escrita so termina quando todo o fluxo e recebido.
    const bytes=await response.arrayBuffer();
    cached.set(String(key),new Response(bytes,{status:200,headers:response.headers}));
  },
  delete:async key=>cached.delete(String(key)),
  keys:async()=>Array.from(cached.keys(),url=>new Request(url))
};
const BATCH=1024,CHUNKS=8;
const fetch=async url=>{
  fetchCount++;
  const size=BATCH*CHUNKS;
  let count=0;
  const stream=new ReadableStream({
    pull(controller) {
      if(count>=CHUNKS) {controller.close();return;}
      count++;
      controller.enqueue(new Uint8Array(BATCH));
    }
  });
  return new Response(stream,{status:200,headers:{
    'content-length':String(size+(incomplete?1:0)),
    'content-type':'audio/mpeg'
  }});
};
const environment={
  window:{caches:{}},
  document:{baseURI:'https://jogoiarexx-blip.github.io/Radio-Hits/'},
  caches:{open:async()=>cache},
  navigator:{storage:{estimate:async()=>({quota:1e9,usage:0})}},
  fetch,URL:MockURL,Blob,Response,Request,ReadableStream,
  Error,Set,Map,Number,Math,Promise,console
};
vm.createContext(environment);
vm.runInContext(source,environment);
const offline=environment.window.RadioHitsOffline;
(async()=>{
  // Duas chamadas simultaneas para a mesma faixa geram um unico blob.
  let firstProgress=[];
  await offline.download(tracks[0],(percent,bytes)=>firstProgress.push([percent,bytes]));
  assert.ok(firstProgress.some(([p])=>p===100),'streaming deve progredir ate 100%');
  assert.equal(cached.size,1);
  const [first,duplicate]=await Promise.all([
    offline.playableSource(tracks[0]),offline.playableSource(tracks[0])
  ]);
  assert.equal(first,duplicate,'mesma faixa deve compartilhar objeto URL');
  assert.equal(created,1,'uma unica URL para duas chamadas concorrentes');
  offline.releaseUnused([first]);
  for(let i=1;i<tracks.length;i++){
    await offline.download(tracks[i]);
    const current=await offline.playableSource(tracks[i]);
    offline.releaseUnused([current]);
    assert.ok(offline.activeObjectURLCount()<=2,
      'URLs temporarias nao devem crescer com a playlist: '+i);
  }
  assert.equal(cached.size,tracks.length,'todos os downloads permaneceram no disco');
  assert.equal(fetchCount,tracks.length,'sem downloads implicitos em segundo plano');
  assert.ok(revoked>=tracks.length-1,'URLs antigas devem ser revogadas apos cada transicao');
  assert.equal(offline.activeObjectURLCount(),1,'somente ultimo objeto URL ativo');
  // Uma transferencia truncada nao pode entrar na biblioteca offline.
  incomplete=true;
  const bad={src:'./musicas/erro.mp3',id:'erro'};
  await assert.rejects(()=>offline.download(bad),/incompleto|terminated|erro|fetch/i);
  assert.ok(!cached.has(offline.absolute(bad.src)),'parcial nao deve parecer concluido');
  console.log('MEMORIA/STREAM OK: '+tracks.length+' faixas, leituras em fluxo, '+revoked+' revogacoes e truncamento recusado.');
})().catch(error=>{console.error(error);process.exitCode=1;});
