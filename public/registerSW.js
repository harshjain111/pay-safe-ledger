if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.update())))
      .then(() => {
        if (!sessionStorage.getItem('vibrnd-cache-reset-v1') && navigator.serviceWorker.controller) {
          sessionStorage.setItem('vibrnd-cache-reset-v1', 'done');
          window.location.reload();
        }
      })
      .catch(() => {
        return;
      });
  });
}
