/* Cache só da interface. Música NÃO é baixada nem pré-armazenada no cache offline. */
const CACHE = 'radio-hits-shell-v11';
const CORE = ['./assets/branding/radio-hits-mark.svg','./assets/branding/hero-radio-hits.svg','./assets/capas/genero-80-90.svg','./assets/capas/genero-rock.svg','./assets/capas/genero-hiphop.svg','./assets/capas/genero-malhacao.svg','./assets/capas/genero-radio-hits.svg','./', './index.html','./css/style.css?v=downloads-2','./js/offline.js?v=offline-todas-1','./js/app.js?v=downloads-todas-1','./catalogo.json','./assets/favicon.svg','./assets/capas/padrao.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('radio-hits-shell-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  const path=new URL(e.request.url).pathname;
  if (/\.(mp3|m4a|ogg|opus|wav|flac|aac)$/i.test(path)) return;
  if (path.endsWith('/catalogo.json')) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy=r.clone(); caches.open(CACHE).then(c=>c.put('./catalogo.json',copy)); }
      return r;
    }).catch(()=>caches.match('./catalogo.json')));
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type==='basic') { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
    return r;
  }).catch(()=>caches.match(e.request, {ignoreSearch: true})));
});
