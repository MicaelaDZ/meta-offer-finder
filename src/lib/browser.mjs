import { chromium } from 'playwright';
const key = Symbol.for('meta-offer-finder.browser-work');
const state = globalThis[key] ||= { busy: false, lastDiscovery: 0 };
export function acquireBrowserWork(discovery = false) {
  if (state.busy || (discovery && Date.now() - state.lastDiscovery < 30000)) {
    const error = new Error('Hay una exploración en curso o en pausa. Reintentá en 30 segundos.');
    error.status = 429;
    throw error;
  }
  state.busy = true;
  if (discovery) state.lastDiscovery = Date.now();
  return () => { state.busy = false; };
}
export async function launchBrowser() {
  // Playwright does not inherit the HTTP proxy for browser navigation.
  const server = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return chromium.launch({ headless: true, timeout: 10000, ...(server ? { proxy: { server, bypass: 'localhost,127.0.0.1' } } : {}) });
}
