/* ==========================================================================
   离线缓存 / SERVICE WORKER

   目的只有一个：在俱乐部信号差的时候，#/quick 还能打开。
   策略：导航走网络优先（拿到新版本），静态资源走缓存优先（快）。
   改完前端记得同步 VERSION —— 否则老访客会继续吃旧缓存。
   ========================================================================== */

const VERSION = 'em-home-v3';
const CORE = [
  './index.html',
  './styles.css',
  './styles-edm.css',
  './styles-studio.css',
  './styles-listen.css',
  './styles-home.css',
  './data/kb.js',
  './data/curated.js',
  './data/web.js',
  './data/course.js',
  './data/fingerprints.js',
  './data/listen.js',
  './audio.js',
  './share.js',
  './app.js',
  './studio.js',
  './vendor/floating-ui-1.8.0-umd/floating-ui.core.umd.min.js',
  './vendor/floating-ui-1.8.0-umd/floating-ui.dom.umd.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 逐个 put：某个文件 404 不应该让整次安装失败
    await Promise.allSettled(CORE.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(request);
    if (hit) return hit;
    try {
      return await fetch(request);
    } catch {
      return Response.error();
    }
  })());
});
