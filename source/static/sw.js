'use strict';
/* Service worker: полный офлайн. Файлы и версия подставляются сборкой (tools/build_web.py). */
const VERSION = '__VERSION__';
const CACHE = 'lg-shell-' + VERSION;
const FILES = __FILES__;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('lg-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (/\/version\.(json|js)$/.test(url.pathname)) return;   // проверка обновлений всегда идёт в сеть
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(req).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }));
});
