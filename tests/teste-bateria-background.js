'use strict';
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
const service=load('android/app/src/main/java/br/com/radiohits/app/PlaybackService.java');
const activity=load('android/app/src/main/java/br/com/radiohits/app/MainActivity.java');
const app=load('js/app.js');
const manifest=load('android/app/src/main/AndroidManifest.xml');
assert.match(service,/ACTIVE_INTERVAL_MS=15000L/);
assert.match(service,/if\(player==null \|\| !player\.isPlaying\(\)\) return;/);
assert.match(service,/private void stopActivePulse\(\)/);
assert.match(service,/handler\.removeCallbacks\(activePulse\)/);
assert.match(service,/scheduleActivePulse\(\)/);
assert.match(service,/Log\.i\("RadioHitsQA"/);
assert.match(service,/if\(\+\+activePulseCount%4==0\)/);
assert.doesNotMatch(service,/handler\.postDelayed\(periodicSave/,'polling ao pausar nao pode continuar');
assert.match(activity,/handler\.postDelayed\(this, 1200\)/);
assert.match(activity,/uiForeground=false;/);
assert.match(activity,/web\.onPause\(\)/);
assert.match(activity,/web\.onResume\(\)/);
assert.match(activity,/if \(controller == null \|\| !uiForeground\) return;/);
assert.match(manifest,/FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
assert.match(service,/setWakeMode\(C\.WAKE_MODE_LOCAL\)/);
assert.match(app,/if \(!state\.loaded \|\| \(nativeBridge && document\.hidden\)\) return;/);
assert.match(app,/if\(state\.loaded && state\.mode==='radio' && !document\.hidden\)/);
const sectionStart=app.indexOf('  function tick() {');
const sectionEnd=app.indexOf('  setInterval(tick, 1000);',sectionStart);
assert.ok(sectionStart>=0 && sectionEnd>sectionStart);
const tickCode=app.slice(sectionStart,sectionEnd);
function makeContext(nativeBridge,hidden) {
  const calls=[];
  const ctx={
    state:{loaded:true,mode:'radio',currentId:'x'},
    nativeBridge,document:{hidden},calls,
    getRadioInfo:()=>{calls.push('clock');return null;},
    audio:{paused:true,ended:false,readyState:0},
    radioWantsPlayback:false,
    prepareNextAudio:()=>calls.push('preload'),
    renderRadio:()=>calls.push('render'),
    renderPlayer:()=>calls.push('player'),
    renderQueue:()=>calls.push('queue'),
    updateProgress:()=>calls.push('progress'),
    $:()=>({textContent:''}),Date,
  };
  vm.createContext(ctx);
  vm.runInContext(tickCode,ctx);
  ctx.tick();
  return calls;
}
assert.deepEqual(makeContext(true,true),[],
  'WebView Android oculta nao pode continuar calculando a UI');
assert.deepEqual(makeContext(true,false),['clock'],
  'WebView Android visivel deve atualizar a radio');
assert.deepEqual(makeContext(false,true),['clock'],
  'PWA no navegador deve manter relogio mesmo em segundo plano');
const script=load('tools/qa_android_4h07.sh');
assert.match(script,/DURATION_SEC="\$\{DURATION_SEC:-14820\}"/);
assert.match(script,/adb shell dumpsys meminfo/);
assert.match(script,/adb shell dumpsys battery/);
assert.match(script,/adb logcat/);
assert.doesNotMatch(script,/batterystats --reset|logcat -c|force-stop/,
  'coleta nao deve apagar diagnosticos ou interromper outros apps');
console.log('BATERIA QA OK: UI suspensa, player ativo e PWA preservado; roteiro ADB nao destrutivo.');
