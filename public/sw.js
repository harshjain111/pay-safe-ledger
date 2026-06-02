// Tombstone service worker — unregisters itself and clears all caches.
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll(); })
      .then(function (clients) {
        clients.forEach(function (c) {
          if (c.navigate) c.navigate(c.url);
        });
      })
  );
});

// Network-only: never serve cached responses.
self.addEventListener('fetch', function () { return; });
