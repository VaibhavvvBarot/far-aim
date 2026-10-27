/// <reference lib="webworker" />
// Offline service worker: precaches the app and all regulation data.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/^v$/] });
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('activate', (e) => {
  // remove the old AI voice caches
  e.waitUntil(Promise.all(['transformers-cache', 'ort', 'kokoro-voices'].map((c) => caches.delete(c))));
});
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
