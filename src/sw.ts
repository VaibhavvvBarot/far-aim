/// <reference lib="webworker" />
// Offline service worker: precaches the app and all regulation data, and serves every
// page with cross-origin isolation headers so the AI voice can use all CPU cores.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL, addPlugins } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

function isolate(r: Response | undefined | null): Response | undefined | null {
  if (!r || r.type === 'opaque' || r.status === 0) return r;
  const h = new Headers(r.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

addPlugins([{ cachedResponseWillBeUsed: async ({ cachedResponse }) => isolate(cachedResponse) as Response }]);
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/^v$/] });
cleanupOutdatedCaches();

const appShell = createHandlerBoundToURL('index.html');
registerRoute(new NavigationRoute(async (opts) => isolate(await appShell(opts)) as Response));

// The AI voice's runtime (about 22 MB) is fetched the first time it's needed, then kept
registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.includes('/ort/'),
  new CacheFirst({ cacheName: 'ort', plugins: [{ cachedResponseWillBeUsed: async ({ cachedResponse }) => isolate(cachedResponse) as Response }, { fetchDidSucceed: async ({ response }) => isolate(response) as Response }] }));

self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
