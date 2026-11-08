/* Radio Hits: cache da interface sem cache automatico de audio. */
const CACHE = 'radio-hits-shell-v26';
const CORE = ['./assets/branding/radio-hits-mark.svg','./assets/branding/hero-radio-hits.svg','./assets/capas/genero-80-90.svg','./assets/capas/genero-rock.svg','./assets/capas/genero-hiphop.svg','./assets/capas/genero-malhacao.svg','./assets/capas/genero-radio-hits.svg','./','./index.html','./css/style.css?v=vinyl-4','./js/native-bridge.js?v=bridge-2','./js/offline.js?v=stream-3','./js/app.js?v=vinyl-4','./catalogo.json','./assets/branding/radio-hits-icon-192.png','./assets/branding/radio-hits-icon-512.png','./js/install.js?v=1','./js/sleep-timer.js?v=1','./assets/favicon.svg','./assets/capas/padrao.svg'];
const AUDIO_EXT=/\.(mp3|m4a|ogg|opus|wav|flac|aac)$/i;
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('radio-hits-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function cacheFirst(request) {
  const cached=await caches.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok&&response.type==='basic') {
    const copy=response.clone();
    caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{});
  }
  return response;
}
async function networkFirst(request,fallback) {
  try {
    const response=await fetch(request);
    if(response.ok&&response.type==='basic') {
      const copy=response.clone();
      caches.open(CACHE).then(c=>c.put(fallback||request,copy)).catch(()=>{});
    }
    return response;
  }catch(_){return await caches.match(fallback||request)||Response.error();}
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  const path=url.pathname;
  if(AUDIO_EXT.test(path)||path.includes('/musicas-leves/'))return;
  if(path.endsWith('/app-version.json')){
    e.respondWith(fetch(e.request,{cache:'no-store'}));return;
  }
  if(path.endsWith('/catalogo.json')){
    e.respondWith(networkFirst(e.request,'./catalogo.json'));return;
  }
  if(e.request.mode==='navigate'||path.endsWith('/index.html')){
    e.respondWith(networkFirst(e.request,'./index.html'));return;
  }
  if(/\/(assets|css|js)\//.test(path)||path.endsWith('/manifest.webmanifest')){
    e.respondWith(cacheFirst(e.request));
  }
});
