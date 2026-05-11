export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((err) => {
        console.warn('[sw] cleanup failed', err);
      });

    if ('caches' in window) {
      window.caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('synthnews-')).map((key) => window.caches.delete(key))))
        .catch((err) => {
          console.warn('[sw] cache cleanup failed', err);
        });
    }
  });
}
