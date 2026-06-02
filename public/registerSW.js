// Aggressive cleanup: unregister ALL service workers and delete ALL caches.
// Previous builds shipped a PWA SW that cached old bundles containing a
// stale Supabase anon key, causing "Invalid API key" errors after key rotation.
(function () {
  var RESET_KEY = 'vibrnd-sw-nuke-v3';

  function nukeCaches() {
    if (!('caches' in window)) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    });
  }

  function nukeServiceWorkers() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(false);
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      if (!regs.length) return false;
      return Promise.all(regs.map(function (r) { return r.unregister(); }))
        .then(function () { return true; });
    });
  }

  window.addEventListener('load', function () {
    Promise.all([nukeServiceWorkers(), nukeCaches()])
      .then(function (results) {
        var hadSW = results[0];
        if (hadSW && !sessionStorage.getItem(RESET_KEY)) {
          sessionStorage.setItem(RESET_KEY, '1');
          window.location.reload();
        }
      })
      .catch(function () { /* noop */ });
  });
})();
