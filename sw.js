/* Cache só da interface. Música NÃO é baixada nem pré-armazenada no cache offline. */
const CACHE = 'radio-hits-shell-v4';
const CORE = ['./', './index.html','./css/style.css','./js/app.js?v=20261029-novas','./assets/favicon.svg','./assets/capas/padrao.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  const path=new URL(e.request.url).pathname;
  if (/\.(mp3|m4a|ogg|opus|wav|flac|aac)$/i.test(path) || path.endsWith('/catalogo.json')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type==='basic') { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
    return r;
  }).catch(()=>caches.match(e.request)));
});
