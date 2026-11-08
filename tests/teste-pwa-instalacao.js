'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('manifest.webmanifest'));
const html=read('index.html'),js=read('js/install.js'),sw=read('sw.js'),builder=read('scripts/preparar_site.py');
const android=read('android/app/src/main/java/br/com/radiohits/app/MainActivity.java');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.id,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
for(const size of [192,512]){
 const icon=manifest.icons.find(i=>i.sizes===size+'x'+size&&i.type==='image/png');
 assert.ok(icon,'Icone PNG '+size);
 const bytes=fs.readFileSync(path.join(root,icon.src));
 assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
 assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
}
assert.match(html,/id="pwa-install-button"/);
assert.match(html,/id="pwa-update-notice"/);
assert.match(html,/js\/install\.js\?v=1/);
assert.match(js,/beforeinstallprompt/);
assert.match(js,/appinstalled/);
assert.match(js,/controllerchange/);
assert.match(js,/registration\.update/);
assert.match(js,/RadioHitsMayReload/);
assert.match(js,/cache:'no-store'/);
assert.match(builder,/app-version\.json/);
assert.match(builder,/GITHUB_SHA/);
assert.match(builder,/radiohits-revision/);
assert.match(android,/setCacheMode\(WebSettings\.LOAD_NO_CACHE\)/);
assert.match(sw,/radio-hits-shell-v25/);
assert.match(sw,/js\/sleep-timer\.js\?v=1/);
const listeners={},buttons={},reloads=[];
function element(id){
 if(!buttons[id])buttons[id]={hidden:true,handlers:{},textContent:'',
  addEventListener(name,fn){this.handlers[name]=fn},click(){return this.handlers.click?.()},
  showModal(){this.open=true},close(){this.open=false}};
 return buttons[id];
}
const doc={hidden:false,getElementById:element,
 querySelector(sel){return sel==='meta[name="radiohits-revision"]'?{content:'old-sha'}:null},
 addEventListener(name,fn){listeners['document:'+name]=fn}};
const worker={controller:{},addEventListener(name,fn){listeners['sw:'+name]=fn},
 async register(){return {async update(){}}}};
const win={RadioHitsMayReload:()=>false,matchMedia:()=>({matches:false}),
 addEventListener(name,fn){listeners['window:'+name]=fn},setInterval(){}};
const location={protocol:'https:',hostname:'example.com',reload(){reloads.push(true)}};
const ctx={window:win,document:doc,navigator:{userAgent:'Android Chrome',onLine:true,serviceWorker:worker},
 location,sessionStorage:{getItem(){return null},setItem(){}},Date,
 fetch:async()=>({ok:true,json:async()=>({revision:'new-sha'})})};
vm.runInNewContext(js,ctx);
assert.equal(element('pwa-install-banner').hidden,false);
(async()=>{
 await listeners['window:load']();
 assert.equal(reloads.length,0,'nao cortar musica ativa');
 assert.equal(element('pwa-update-notice').hidden,false);
 win.RadioHitsMayReload=()=>true;
 element('audio').handlers.pause();
 assert.equal(reloads.length,1,'aplicar apos pausa');
 console.log('PWA OK: instalacao, icones, revisao e atualizacao segura.');
})().catch(e=>{console.error(e);process.exitCode=1});
