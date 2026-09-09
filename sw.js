/* Capture service worker: offline shell + share target intake */
const CACHE = 'capture-v5';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('capture', 2);
    r.onupgradeneeded = e => { const d = e.target.result; if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'clientId' }); if (!d.objectStoreNames.contains('share')) d.createObjectStore('share', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function storeShare(rec) {
  const d = await openDB();
  return new Promise((res, rej) => { const t = d.transaction('share', 'readwrite'); t.objectStore('share').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Share target: Android posts here from the share sheet
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = [];
        for (const f of fd.getAll('files')) { if (f && f.size !== undefined) files.push({ name: f.name || 'shared', type: f.type || 'application/octet-stream', blob: f }); }
        await storeShare({ id: 'share-' + Date.now(), title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', files });
      } catch (err) { /* fall through to open the app anyway */ }
      return Response.redirect('./index.html?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // Same-origin shell: network first so a new deploy shows up on the next open;
  // fall back to the cached copy when offline.
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
