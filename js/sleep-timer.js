/* Radio Hits: temporizador para dormir no PWA e no Media3 Android. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const native = window.RadioHitsAndroid;
  const hasNativeTimer = !!(native && native.setSleepTimer && native.sleepTimerState);
  const key = 'radiohits-sleep-deadline-v1';
  const dialog = $('sleep-timer-dialog');
  const indicator = $('sleep-timer-chip');
  const status = $('sleep-timer-status');
  let deadlineMs = 0;
  let busy = false;
  const normalize = value => {
    const n=Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  };
  function readLocal() {
    try {return normalize(localStorage.getItem(key));}catch(_){return 0;}
  }
  function writeLocal(value) {
    try {
      if(value) localStorage.setItem(key,String(value));
      else localStorage.removeItem(key);
    } catch(_) {}
  }
  if(!hasNativeTimer) deadlineMs=readLocal();
  function display() {
    const remaining=Math.max(0,deadlineMs-Date.now());
    const minutes=Math.ceil(remaining / 60_000);
    if(indicator) {
      indicator.hidden = !remaining;
      if(remaining) indicator.textContent=minutes+'m';
    }
    const launch=$('sleep-timer-open');
    if(launch) {
      launch.classList.toggle('is-active',remaining>0);
      launch.setAttribute('aria-label',remaining>0
        ? 'Temporizador para dormir: '+minutes+' minutos restantes'
        : 'Configurar temporizador para dormir');
    }
    if(status) status.textContent=remaining
      ? 'A música será pausada em aproximadamente '+minutes+' minuto(s).'
      : 'Nenhum temporizador ativo.';
    const cancel=$('sleep-timer-cancel');
    if(cancel) cancel.disabled=!remaining;
  }
  function stopWhenDue() {
    if(!deadlineMs || Date.now()<deadlineMs) return;
    if(hasNativeTimer) {deadlineMs=0; display(); return;}
    deadlineMs=0;
    writeLocal(0);
    try {window.RadioHitsPauseForSleep?.();}catch(_) {}
    display();
  }
  async function refresh() {
    if(hasNativeTimer && !busy) {
      try {deadlineMs=normalize(await native.sleepTimerState());} catch(_) {}
    } else if(!hasNativeTimer) deadlineMs=readLocal();
    stopWhenDue();
    display();
  }
  async function start(minutes) {
    if(![15,30,60].includes(minutes) || busy) return;
    busy=true;
    try {
      if(hasNativeTimer) deadlineMs=normalize(await native.setSleepTimer(minutes));
      else {deadlineMs=Date.now()+minutes*60_000;writeLocal(deadlineMs);}
      display();
      if(dialog?.open) dialog.close();
    } finally {busy=false;}
  }
  async function cancel() {
    if(busy) return;
    busy=true;
    try {
      if(hasNativeTimer) await native.cancelSleepTimer();
      else writeLocal(0);
      deadlineMs=0;
      display();
      if(dialog?.open) dialog.close();
    } finally {busy=false;}
  }
  $('sleep-timer-open')?.addEventListener('click',()=>{refresh();dialog?.showModal();});
  $('sleep-timer-close')?.addEventListener('click',()=>dialog?.close());
  $('sleep-timer-cancel')?.addEventListener('click',cancel);
  document.querySelectorAll('[data-sleep-minutes]').forEach(button =>
    button.addEventListener('click',()=>start(Number(button.dataset.sleepMinutes)))
  );
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  // A interface exibe minutos, evitando atualizar o DOM a cada segundo.
  window.setInterval(()=>{if(!document.hidden || !hasNativeTimer){stopWhenDue();display();}},10_000);
  // No navegador, timeupdate serve como redundancia caso o intervalo seja adiado.
  $('audio')?.addEventListener('timeupdate',()=>{if(!hasNativeTimer)stopWhenDue();});
  window.RadioHitsSleepTimer=Object.freeze({start,cancel,refresh,getDeadline:()=>deadlineMs});
  refresh();
})();
