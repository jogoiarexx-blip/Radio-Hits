/* Radio Hits offline: downloads explícitos, sem pré-carregar a biblioteca. */
'use strict';
(() => {
  const CACHE = 'radio-hits-offline-audio-v1';
  const blobURLs = new Map();
  const isNative = Boolean(window.RadioHitsAndroid && typeof window.RadioHitsAndroid.saveOffline === 'function');
  let listener = null;
  const absolute = (source) => new URL(source, document.baseURI).href;
  const notify = (event) => { if (listener) listener(event); };
  async function cacheOpen() {
    if (!('caches' in window)) throw Error('Armazenamento offline indisponível neste navegador.');
    return caches.open(CACHE);
  }
  async function list() {
    if (isNative) {
      try { return new Set(JSON.parse(window.RadioHitsAndroid.listDownloads())); }
      catch (_) { return new Set(); }
    }
    const store = await cacheOpen();
    return new Set((await store.keys()).map(request => request.url));
  }
  const isCatalogAudio = (source) => {
    try {
      const url = new URL(source, document.baseURI);
      const root = new URL('./musicas/',document.baseURI);
      return url.origin === root.origin && url.pathname.startsWith(root.pathname)
        && /\.(mp3|m4a|ogg|opus|wav|flac|aac)$/i.test(url.pathname);
    } catch (_) { return false; }
  };
  async function download(track, progress=()=>{}) {
    if (!track || !track.src || !isCatalogAudio(track.src)) {
      throw Error('Arquivo de música inválido ou fora do catálogo Radio Hits.');
    }
    const url = absolute(track.src);
    if (isNative) {
      window.RadioHitsAndroid.saveOffline(JSON.stringify({
        id:track.id,src:url,title:track.title,artist:track.artist
      }));
      notify({type:'started',url});
      return;
    }
    const store = await cacheOpen();
    if (await store.match(url)) { notify({type:'done',url}); return; }
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok || (response.status !== 200)) throw Error('Falha ao baixar áudio: HTTP ' + response.status);
    const expected = Number(response.headers.get('content-length')) || 0;
    if (expected > 95 * 1024 * 1024) throw Error('Arquivo grande demais para download offline.');
    const chunks = [];
    let bytes = 0;
    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        if (!result.value) continue;
        bytes += result.value.byteLength;
        if (bytes > 95 * 1024 * 1024) {
          reader.cancel();
          throw Error('O arquivo excede 95 MB.');
        }
        chunks.push(result.value);
        progress(expected > 0 ? Math.min(100,Math.round(bytes/expected*100)) : null,bytes);
      }
    } else {
      const b = await response.blob();
      bytes = b.size;
      chunks.push(b);
    }
    if (!bytes || (expected && bytes !== expected)) throw Error('Arquivo incompleto. Tente novamente.');
    const mime = response.headers.get('content-type') || 'audio/mpeg';
    const blob = new Blob(chunks,{type:mime});
    await store.put(url,new Response(blob,{headers:{'Content-Type':mime,'Content-Length':String(bytes)}}));
    notify({type:'done',url,bytes});
  }
  async function remove(track) {
    const url = absolute(track.src);
    if (isNative) {
      window.RadioHitsAndroid.deleteOffline(url);
    } else {
      const store = await cacheOpen();
      await store.delete(url);
      if (blobURLs.has(url)) {
        URL.revokeObjectURL(blobURLs.get(url));
        blobURLs.delete(url);
      }
    }
    notify({type:'deleted',url});
  }
  async function playableSource(track) {
    const url = absolute(track.src);
    if (isNative) return url;
    if (blobURLs.has(url)) return blobURLs.get(url);
    const store = await cacheOpen();
    const response = await store.match(url);
    if (!response) return url;
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    blobURLs.set(url,objectURL);
    return objectURL;
  }
  async function usage() {
    if (navigator.storage && navigator.storage.estimate) {
      const q=await navigator.storage.estimate();
      return {used:q.usage||0, quota:q.quota||0};
    }
    return {used:0,quota:0};
  }
  window.RadioHitsOfflineEvent = function(event) {
    if (event && typeof event==='object') notify(event);
  };
  window.RadioHitsOffline = {isNative,list,download,remove,playableSource,usage,isCatalogAudio,onChange(callback){listener=callback;},absolute};
})();
