const cacheName = 'nutrition-tracker-v2';
const assets = ['./','./index.html','./style.css','./core.js','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nutrition-tracker-') && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !assets.some(asset => new URL(asset,self.registration.scope).href === url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});
