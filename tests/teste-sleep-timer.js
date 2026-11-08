'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),app=read('js/app.js'),native=read('js/native-bridge.js');
const activity=read('android/app/src/main/java/br/com/radiohits/app/MainActivity.java');
const service=read('android/app/src/main/java/br/com/radiohits/app/PlaybackService.java');
const js=read('js/sleep-timer.js');
assert.match(html,/id="sleep-timer-dialog"/);
assert.match(html,/id="sleep-timer-open"/);
for (const minutes of [15,30,60]) assert.match(html,new RegExp('data-sleep-minutes="'+minutes+'"'));
assert.match(html,/js\/sleep-timer\.js\?v=1/);
assert.match(app,/RadioHitsPauseForSleep/);
assert.match(native,/sleepTimerState/);
assert.match(activity,/case "setSleepTimer"/);
assert.match(activity,/case "cancelSleepTimer"/);
assert.match(activity,/case "sleepTimerState"/);
assert.match(service,/SleepTimerClock\.expired/);
assert.match(service,/pauseIfSleepExpired/);

function scenario(isNative) {
  let clock=1_800_000_000_000, paused=0;
  const els=new Map();
  function el(id) {if(!els.has(id))els.set(id,{
    id,hidden:false,disabled:false,textContent:'',dataset:{},open:false,attrs:{},listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn},
    classList:{toggle(){}},
    setAttribute(name,value){this.attrs[name]=value},
    showModal(){this.open=true},close(){this.open=false}
  });return els.get(id);}
  const buttons=[15,30,60].map(m=>{let b=el('m'+m);b.dataset.sleepMinutes=String(m);return b;});
  const document={hidden:false,getElementById:el,querySelectorAll:()=>buttons,
    addEventListener(){}};
  let stored='';
  const store={getItem:()=>stored,setItem:(k,value)=>{stored=value},removeItem:()=>{stored=''}};
  let nativeDeadline=0;
  const radio=isNative?{
    async setSleepTimer(m){nativeDeadline=clock+m*60_000;return String(nativeDeadline)},
    async cancelSleepTimer(){nativeDeadline=0;return '0'},
    async sleepTimerState(){return String(nativeDeadline)}
  }:undefined;
  const window={
    RadioHitsAndroid:radio,
    RadioHitsPauseForSleep:()=>paused++,
    addEventListener(){},setInterval(){}
  };
  class FakeDate extends Date {static now(){return clock;}}
  vm.runInNewContext(js,{window,document,localStorage:store,Date:FakeDate,Number,Math,Promise,console});
  return {el,buttons,window,advance:n=>{clock+=n},paused:()=>paused,nativeDeadline:()=>nativeDeadline};
}
(async()=>{
 const browser=scenario(false);
 await browser.window.RadioHitsSleepTimer.start(15);
 assert.equal(browser.el('sleep-timer-chip').textContent,'15m');
 browser.advance(15*60_000);
 await browser.window.RadioHitsSleepTimer.refresh();
 assert.equal(browser.paused(),1,'PWA precisa pausar na hora de expirar');
 assert.equal(browser.el('sleep-timer-chip').hidden,true);
 await browser.window.RadioHitsSleepTimer.start(30);
 await browser.window.RadioHitsSleepTimer.cancel();
 assert.equal(browser.window.RadioHitsSleepTimer.getDeadline(),0);
 const android=scenario(true);
 await android.window.RadioHitsSleepTimer.start(60);
 assert.ok(android.nativeDeadline()>0);
 assert.equal(android.el('sleep-timer-chip').textContent,'60m');
 android.advance(60*60_000);
 await android.window.RadioHitsSleepTimer.refresh();
 assert.equal(android.paused(),0,'O servico Media3 controla a pausa nativa');
 console.log('TEMPORIZADOR OK: PWA, Android, 15/30/60, prazo, cancelamento e UI.');
})().catch(error=>{console.error(error);process.exitCode=1});
