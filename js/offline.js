/* Radio Hits offline: downloads explícitos, sem pré-carregar a biblioteca. */
'use strict';
(() => {
  const CACHE = 'radio-hits-offline-audio-v1';
  const blobURLs = new Map();
  const pendingSources = new Map();
  // No máximo os dois players da aplicação (ativo + pré-carga) devem
  // manter URLs blob. Cache Storage preserva os downloads no disco.
  let protectedSources = new Set();
  function releaseUnused(keep=[]) {
    protectedSources = new Set(keep.filter(src => typeof src === 'string' && src.startsWith('blob:')));
    for (const [url, src] of blobURLs) {
      if (!protectedSources.has(src)) {
        URL.revokeObjectURL(src);
        blobURLs.delete(url);
      }
    }
  }
  function limitObjectURLs(newest) {
    while (blobURLs.size > 2) {
      const stale = [...blobURLs].find(([url,src]) => url !== newest && !protectedSources.has(src));
      if (!stale) break; // Preserve o áudio em uso durante a troca.
      URL.revokeObjectURL(stale[1]);
      blobURLs.delete(stale[0]);
    }
  }
  const isNative = Boolean(window.RadioHitsAndroid && typeof window.RadioHitsAndroid.saveOffline === 'function');
  const supportsJobs = isNative && ['listDownloadJobs','pauseOffline','cancelOffline']
    .every(method => typeof window.RadioHitsAndroid[method] === 'function');
  let listener = null;
  const absolute = (source) => new URL(source, document.baseURI).href;
  const notify = (event) => { if (listener) listener(event); };
  async function cacheOpen() {
    if (!('caches' in window)) throw Error('Armazenamento offline indisponível neste navegador.');
    return caches.open(CACHE);
  }
  async function list() {
    if (isNative) {
      try { return new Set(JSON.parse(await window.RadioHitsAndroid.listDownloads())); }
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
    if (!response.ok || response.status !== 200)
      throw Error('Falha ao baixar áudio: HTTP ' + response.status);
    const expected = Number(response.headers.get('content-length')) || 0;
    const MAX_BYTES = 95 * 1024 * 1024;
    if (expected > MAX_BYTES) throw Error('Arquivo grande demais para download offline.');
    const mime = response.headers.get('content-type') || 'audio/mpeg';
    let bytes = 0;
    let body;
    if (typeof ReadableStream === 'function' && response.body?.getReader) {
      // Cache Storage consome o fluxo gradualmente: não materializamos
      // faixas de até 95 MB numa lista de chunks em memória JS.
      const reader = response.body.getReader();
      body = new ReadableStream({
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              if (!bytes || (expected && bytes !== expected))
                throw Error('Arquivo incompleto. Tente novamente.');
              controller.close();
              return;
            }
            if (!part.value?.byteLength) return;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES) throw Error('O arquivo excede 95 MB.');
            controller.enqueue(part.value);
            progress(expected ? Math.min(100, Math.floor(bytes / expected * 100)) : null,bytes);
          } catch (error) {
            await reader.cancel().catch(()=>{});
            controller.error(error);
          }
        },
        cancel(reason) { return reader.cancel(reason); }
      });
    } else {
      // Compatibilidade para navegadores sem streaming do Response.
      const blob = await response.blob();
      bytes = blob.size;
      if (!bytes || bytes > MAX_BYTES || (expected && bytes !== expected))
        throw Error('Arquivo offline inválido ou incompleto.');
      body = blob;
      progress(100,bytes);
    }
    try {
      await store.put(url,new Response(body,{headers:{'Content-Type':mime}}));
      if (!bytes || (expected && bytes !== expected))
        throw Error('Arquivo incompleto. Tente novamente.');
    } catch (error) {
      await store.delete(url).catch(()=>{});
      throw error;
    }
    notify({type:'done',url,bytes});
  }
  async function jobs() {
    if (!supportsJobs) return [];
    try {
      const response = await window.RadioHitsAndroid.listDownloadJobs();
      const data = JSON.parse(response);
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }
  async function pause(track) {
    if (!supportsJobs || !track || !isCatalogAudio(track.src)) return;
    const url = absolute(track.src);
    window.RadioHitsAndroid.pauseOffline(url);
    notify({type:'paused',url});
  }
  async function cancel(track) {
    if (!isNative || !track || !isCatalogAudio(track.src)) return;
    const url = absolute(track.src);
    window.RadioHitsAndroid.cancelOffline(url);
    notify({type:'canceled',url});
  }
  async function remove(track) {
    const url = absolute(track.src);
    if (isNative) {
      window.RadioHitsAndroid.deleteOffline(url);
    } else {
      const store = await cacheOpen();
      await store.delete(url);
      if (blobURLs.has(url)) {
        const objectURL = blobURLs.get(url);
        URL.revokeObjectURL(objectURL);
        protectedSources.delete(objectURL);
        blobURLs.delete(url);
      }
    }
    notify({type:'deleted',url});
  }
  async function playableSource(track) {
    const url = absolute(track.src);
    if (isNative) return url;
    if (blobURLs.has(url)) return blobURLs.get(url);
    if (pendingSources.has(url)) return pendingSources.get(url);
    const promise = (async () => {
      const store = await cacheOpen();
      const response = await store.match(url);
      if (!response) return url;
      const blob = await response.blob();
      if (!blob.size) throw Error('Arquivo offline vazio.');
      const objectURL = URL.createObjectURL(blob);
      blobURLs.set(url,objectURL);
      limitObjectURLs(url);
      return objectURL;
    })();
    pendingSources.set(url,promise);
    try { return await promise; }
    finally { pendingSources.delete(url); }
  }
  function activeObjectURLCount() { return blobURLs.size; }
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
  window.RadioHitsOffline = {isNative,supportsJobs,list,jobs,download,pause,cancel,remove,
    playableSource,releaseUnused,activeObjectURLCount,usage,isCatalogAudio,onChange(callback){listener=callback;},absolute};
})();
