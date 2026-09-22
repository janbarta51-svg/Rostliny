'use strict';

const VERSION = 'atlas-pwa-a12f558c8ae8';
const PACK_VERSION = 'photos-e15c7ec12061';
const CORE_CACHE = `atlas-core-${VERSION}`;
const IMAGE_CACHE = 'atlas-images-v1';
const META_CACHE = 'atlas-meta-v1';
const PACK_MARKER = new URL('__offline_pack_complete__', self.registration.scope).href;

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './data/plants.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('atlas-core-') && name !== CORE_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CORE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return new Response('', {status: 504, statusText: 'Offline image not cached'});
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (url.pathname.includes('/images/') && /\.(?:webp|jpe?g|png)$/i.test(url.pathname)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (url.pathname.endsWith('/data/plants.json') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/style.css') || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CORE_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});

async function postTo(source, message) {
  if (source && typeof source.postMessage === 'function') source.postMessage(message);
}

async function downloadOfflinePack(assets, source) {
  const unique = [...new Set(assets)].filter(path => typeof path === 'string' && path.startsWith('images/') && /\.(?:webp|jpe?g|png)$/i.test(path));
  const cache = await caches.open(IMAGE_CACHE);
  let done = 0;
  let failed = 0;
  let downloaded = 0;
  let alreadyCached = 0;
  const total = unique.length;
  let cursor = 0;

  await postTo(source, {type:'OFFLINE_PACK_PROGRESS', done, total, failed, downloaded, alreadyCached});

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const path = unique[index];
      const url = new URL(path, self.registration.scope).href;
      try {
        const hit = await cache.match(url);
        if (hit) {
          alreadyCached++;
        } else {
          const response = await fetch(url, {cache:'no-cache'});
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await cache.put(url, response.clone());
          downloaded++;
        }
      } catch (error) {
        failed++;
      }
      done++;
      if (done === total || done % 20 === 0) {
        await postTo(source, {type:'OFFLINE_PACK_PROGRESS', done, total, failed, downloaded, alreadyCached});
      }
    }
  }

  const concurrency = 6;
  await Promise.all(Array.from({length: concurrency}, () => worker()));

  const meta = await caches.open(META_CACHE);
  if (failed === 0) {
    await meta.put(PACK_MARKER, new Response(JSON.stringify({version: VERSION, packVersion: PACK_VERSION, total, completedAt: new Date().toISOString()}), {headers:{'Content-Type':'application/json'}}));
  } else {
    await meta.delete(PACK_MARKER);
  }
  await postTo(source, {type:'OFFLINE_PACK_DONE', done, total, failed, downloaded, alreadyCached, complete: failed === 0});
}

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CHECK_OFFLINE_PACK') {
    event.waitUntil((async () => {
      const meta = await caches.open(META_CACHE);
      const marker = await meta.match(PACK_MARKER);
      let info = null;
      if (marker) {
        try { info = await marker.json(); } catch (_) {}
      }
      const complete=Boolean(marker)&&info?.packVersion===PACK_VERSION&&(!data.expectedTotal||info?.total===data.expectedTotal);
      await postTo(event.source, {type:'OFFLINE_PACK_STATUS', complete, info});
    })());
    return;
  }
  if (data.type === 'DOWNLOAD_OFFLINE_PACK' && Array.isArray(data.assets)) {
    event.waitUntil(downloadOfflinePack(data.assets, event.source));
  }
});
