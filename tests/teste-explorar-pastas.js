'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('js/app.js');
const html=read('index.html');
const css=read('css/style.css');
const catalog=JSON.parse(read('catalogo.json'));
const start=app.indexOf('  function libraryTracks() {');
const stop=app.indexOf('  function renderOffline() {',start);
assert.ok(start>=0 && stop>start,'funções das pastas devem ser carregadas');
assert.match(html,/id="music-folder-grid"/);
assert.match(html,/id="explore-selection-title"/);
assert.match(html,/id="track-catalog-section"/);
assert.match(html,/<symbol id="i-folder"/);
assert.match(html,/data-action="play-selection"/);
assert.match(html,/data-action="back-to-folders"/);
assert.match(app,/case 'play-selection':/);
assert.match(app,/selectSong\(tracks\[0\]\.id,tracks\.map\(t=>t\.id\)\)/);
assert.match(app,/case 'back-to-folders':/);
assert.ok(html.indexOf('id="music-folders"')<html.indexOf('id="track-catalog-section"'),
  'pastas devem aparecer antes da lista filtrada');
assert.ok(html.indexOf('id="track-catalog-section"')<html.indexOf('id="offline-available"'),
  'downloads não devem separar as pastas das suas músicas');
assert.match(css,/\.folder-grid/);
assert.match(css,/\.folder-card\.is-active/);
assert.match(css,/@media\(max-width:690px\)/);
assert.match(app,/case 'folder':/);
assert.match(app,/state\.folder='Todas';\s+state\.genre=el\.dataset\.genre/);
assert.match(app,/case 'folder':[\s\S]+?scrollIntoView/);
const elements=new Map();
const $=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',scrollIntoView:()=>{}});
  return elements.get(id);
};
const state={tracks:catalog.tracks,folder:'Todas',genre:'Todos',query:'',favorites:new Set()};
const ctx={
  state,$,Map,Set,decodeURIComponent,
  escapeHtml:value=>String(value).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])),
  icon:name=>'<svg>'+name+'</svg>',
  card:t=>'<div data-card="'+t.id+'"></div>',
  songRow:t=>'<div data-track="'+t.id+'"></div>',
  libraryDuration:seconds=>seconds+' s',
  empty:()=>'<div>empty</div>',
  renderOffline:()=>{},
};
vm.createContext(ctx);
vm.runInContext(app.slice(start,stop),ctx);
const folders=ctx.musicFolders();
assert.ok(folders.length>=10,'pelo menos 10 pastas musicais devem existir');
assert.equal(folders.reduce((n,f)=>n+f.count,0),catalog.tracks.filter(t=>!t.isJingle).length,'cada musica deve estar em uma pasta; vinhetas nunca');
assert.ok(folders.some(f=>f.id==='Avulsas'&&f.count>=6),'6 demos devem ficar em Avulsas');
assert.ok(!folders.some(f=>f.label==='Vinheta'),'vinheta nunca aparece nas pastas');
assert.ok(folders.some(f=>f.id==='Hip Hop'&&f.count>0),'Hip Hop precisa aparecer');
assert.ok(folders.some(f=>f.id==='rock'&&f.count>0),'Rock precisa aparecer');
if (catalog.tracks.some(t=>t.genre==='Música Religiosa'))
  assert.ok(folders.some(f=>f.id==='religiosas'&&f.count===6&&f.label==='Música Religiosa'),
    'a pasta religiosa deve conter os seis uploads');

assert.ok(folders.some(f=>f.id==='as melhores 80 e 90'&&f.count>0),'Anos 80 e 90 precisam aparecer');
assert.equal(ctx.trackFolder({src:'./musicas/Hip%20Hop/Faixa%20nova.mp3'}),'Hip Hop');
assert.equal(ctx.trackFolder({src:'./musicas/rock/musica.mp3'}),'rock');
assert.equal(ctx.trackFolder({src:'./musicas/sol-de-vidro.mp3'}),'Avulsas');
assert.equal(ctx.folderLabel('as melhores 80 e 90'),'Anos 80 e 90');
assert.equal(ctx.folderLabel('classicos'),'Clássicos');
state.folder='rock';state.genre='Todos';
const rock=ctx.visibleTracks();
assert.ok(rock.length>=15,'Rock não deve desaparecer');
assert.ok(rock.every(t=>ctx.trackFolder(t)==='rock'));
ctx.renderExplore();
assert.equal($('explore-selection-title').textContent,'Rock');
assert.equal($('play-selection').disabled,false);
assert.ok($('music-folder-grid').innerHTML.includes('data-folder="rock"'));
assert.ok($('all-tracks').innerHTML.includes('data-track="'+rock[0].id+'"'));
const rockCount=$('all-tracks').innerHTML.match(/data-track=/g)?.length||0;
assert.equal(rockCount,rock.length,'lista precisa respeitar a pasta ativa');
state.query='metallica';
assert.ok(ctx.visibleTracks().some(t=>t.artist==='Metallica'),'busca deve funcionar dentro da pasta');
assert.ok(ctx.visibleTracks().every(t=>ctx.trackFolder(t)==='rock'));
state.query='hip hop';assert.equal(ctx.visibleTracks().length,0,'não misturar pastas no filtro');
state.query='';state.folder='Hip Hop';
ctx.renderExplore();
assert.equal($('explore-selection-title').textContent,'Hip Hop');
assert.equal($('all-tracks').innerHTML.match(/data-track=/g)?.length,ctx.visibleTracks().length);
state.folder='Todas';state.query='hip hop';
assert.equal(ctx.visibleTracks().length,folders.find(f=>f.id==='Hip Hop').count,'busca global encontra pasta');
state.query='';state.genre='Rock';state.folder='Todas';
assert.ok(ctx.visibleTracks().every(t=>t.genre==='Rock'),'filtro de gênero original ainda funciona');
state.genre='Todos';
state.folder='pasta que não existe';
ctx.renderExplore();
assert.equal(state.folder,'Todas','pasta removida deve voltar a Todas');
assert.equal($('play-selection').disabled,false);
assert.equal(ctx.visibleTracks().length,catalog.tracks.filter(t=>!t.isJingle).length,'Todas mostra todas as musicas, nao vinhetas');
const malicious={src:'./musicas/%3Cimg%20onerror%3Dalert(1)%3E/x.mp3',id:'fake',title:'fake',artist:'fake',genre:'Outros',duration:10};
state.tracks=[...catalog.tracks,malicious];
ctx.renderFolders();
assert.ok($('music-folder-grid').innerHTML.includes('&lt;img'));
assert.ok(!$('music-folder-grid').innerHTML.includes('<img onerror'));
console.log('EXPLORAR PASTAS OK: '+folders.length+' pastas, '+catalog.tracks.length+' faixas, pesquisa, gênero e layout responsivo.');
