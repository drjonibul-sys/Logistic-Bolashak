'use strict';
/* Service worker: полный офлайн. Файлы и версия подставляются сборкой (tools/build_web.py). */
const VERSION = '0.12.1';
const CACHE = 'lg-shell-' + VERSION;
const FILES = ["./", "manifest.webmanifest", "app-files.json", "css/style.css", "index.html", "calc.html", "trucks.html", "drive.html", "drive480.html", "scraper.html", "mining.html", "locos.html", "calcs.html", "nodes.html", "animation.html", "kpi.html", "charts.html", "scheme.html", "reference.html", "import.html", "admin.html", "settings.html", "updates.html", "update-source.html", "help.html", "js/params-data.js", "js/blocks.js", "js/drawings.js", "js/drive.js", "js/drive480.js", "js/scraper.js", "js/mining.js", "js/dayplan.js", "js/plan480.js", "js/engine.js", "js/local-api.js", "js/common.js", "js/draw.js", "js/pwa.js", "js/zip.js", "js/updater.js", "js/p-index.js", "js/p-calc.js", "js/p-trucks.js", "js/p-drive.js", "js/p-drive480.js", "js/p-scraper.js", "js/p-mining.js", "js/p-locos.js", "js/p-calcs.js", "js/p-nodes.js", "js/p-animation.js", "js/p-kpi.js", "js/p-charts.js", "js/p-scheme.js", "js/p-reference.js", "js/p-import.js", "js/p-admin.js", "js/p-settings.js", "js/p-updates.js", "js/p-update-source.js", "js/p-help.js", "js/p-dayplan.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

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
