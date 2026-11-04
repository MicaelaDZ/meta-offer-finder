import { NextResponse } from 'next/server';
import { launchBrowser, acquireBrowserWork } from '../../../lib/browser.mjs';
import { verifyLanding } from '../../../lib/landing-verification.mjs';
import { failureDiagnostic, diagnostic } from '../../../lib/scrape-diagnostics.mjs';
export async function POST(request) {
  let browser, release, timer, abort;
  let urls = [];
  try {
    const body = await request.json();
    urls = Array.isArray(body.urls) ? [...new Set(body.urls)].slice(0, 5) : [];
    if (!urls.length) return NextResponse.json({ error: 'No se recibieron URLs.' }, { status: 400 });
    release = acquireBrowserWork();
    browser = await launchBrowser();
    const deadline = Date.now() + 40000;
    abort = () => { void browser.close().catch(() => {}); };
    timer = setTimeout(abort, 40000);
    request.signal.addEventListener('abort', abort, { once: true });
    const results = [];
    for (const url of urls) {
      if (request.signal.aborted || Date.now() >= deadline) {
        results.push({ url, status: 'error', reason: 'Límite de tiempo alcanzado; no se intentó esta página.', lifecycle: { attempted: false, downloaded: false, accessible: false }, diagnostic: diagnostic('TIMEOUT', 'budget') });
        continue;
      }
      let page;
      try { page = await browser.newPage(); results.push(await verifyLanding(page, url, { deadline, signal: request.signal })); }
      catch (error) { const details = failureDiagnostic(error, 'launch_page'); results.push({ url, status: 'error', reason: details.message, diagnostic: details, lifecycle: { attempted: false, downloaded: false, accessible: false } }); }
      finally { await page?.close().catch(() => {}); }
    }
    return NextResponse.json({ total: results.length, processed: results.filter(r => r.lifecycle.attempted).length, downloaded: results.filter(r => r.lifecycle.downloaded).length, accessible: results.filter(r => r.lifecycle.accessible).length, results });
  } catch (error) {
    const details = failureDiagnostic(error, 'verify');
    if (urls.length && !error.status) return NextResponse.json({ total: urls.length, processed: 0, downloaded: 0, accessible: 0, results: urls.map(url => ({ url, status: 'error', reason: details.message, diagnostic: details, lifecycle: { attempted: false, downloaded: false, accessible: false } })) });
    return NextResponse.json({ error: details.message, diagnostic: details }, { status: error.status || 500 });
  } finally { clearTimeout(timer); if (abort) request.signal.removeEventListener('abort', abort); await browser?.close().catch(() => {}); release?.(); }
}
