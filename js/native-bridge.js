/* Adaptador por mensagens para o player Android. Sem JavaScriptInterface. */
'use strict';
(() => {
  const native = window.RadioHitsNative;
  if (!native || typeof native.postMessage !== 'function') return;
  const waiting = new Map();
  let nextId = 0;
  native.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (!Number.isInteger(message.id)) return;
      const done = waiting.get(message.id);
      if (done) { waiting.delete(message.id); done(message.value); }
    } catch (_) { /* resposta inesperada: ignorar */ }
  };
  const send = (method, value) => {
    native.postMessage(JSON.stringify({method, value}));
  };
  const request = (method, value) => new Promise(resolve => {
    const id = ++nextId;
    waiting.set(id, resolve);
    native.postMessage(JSON.stringify({method, id, value}));
    setTimeout(() => {
      if (waiting.has(id)) { waiting.delete(id); resolve('[]'); }
    }, 3000);
  });
  window.RadioHitsAndroid = Object.freeze({
    listDownloads() { return request('listDownloads'); },
    listDownloadJobs() { return request('listDownloadJobs'); },
    state() { return request('state'); },
    saveOffline: value => send('saveOffline', value),
    pauseOffline: value => send('pauseOffline', value),
    cancelOffline: value => send('cancelOffline', value),
    deleteOffline: value => send('deleteOffline', value),
    saveCatalog: value => send('saveCatalog', value),
    playQueue: value => send('playQueue', value),
    resume: () => send('resume'),
    pause: () => send('pause'),
    seek: value => send('seek', value),
    volume: value => send('volume', value),
    setLeveling: value => send('setLeveling', value),
    setSleepTimer: minutes => request('setSleepTimer', minutes),
    cancelSleepTimer: () => request('cancelSleepTimer'),
    sleepTimerState: () => request('sleepTimerState')
  });
})();
