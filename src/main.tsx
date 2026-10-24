import { render } from 'preact';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';
import { App } from './app';
import { loadState, updateReady } from './store';
import { persist } from './db';
import { registerSW } from 'virtual:pwa-register';
import { searchIndex } from './data';

loadState();
persist();
render(<App />, document.getElementById('app')!);

// Service worker: keeps everything offline; tells us when new text arrives
const update = registerSW({
  onNeedRefresh() { updateReady.value = () => update(true); },
});
// Check for new text whenever the app comes back to the foreground
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') (await navigator.serviceWorker?.getRegistration())?.update();
});

// Build the search index in the background once the first screen is up
const idle = (window as any).requestIdleCallback || ((f: () => void) => setTimeout(f, 1200));
idle(() => searchIndex());
