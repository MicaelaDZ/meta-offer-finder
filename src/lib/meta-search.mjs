import { extractPageEvidence } from './page-evidence.mjs';
import { extractMetaCards } from './meta-dom.mjs';
import { searchProfile } from './search-policy.mjs';
import { launchBrowser } from './browser.mjs';
import { parseMetaText, LIBRARY_MARKER } from './meta-parser.mjs';
import { extractAdUrls, adUrls, urlSummary } from './url-extraction.mjs';
import { diagnostic, failureDiagnostic } from './scrape-diagnostics.mjs';
import { inferProduct } from './product-inference.mjs';
import { uniqueAds } from './discovery.mjs';

export async function searchMetaAds({ keyword, country = 'AR', language = 'all', mode = 'manual', timeoutMs = searchProfile(mode).timeoutMs, signal }, { launch = launchBrowser, beforeNavigate = async () => {} } = {}) {
  const policy = searchProfile(mode), started = Date.now();
  let browser, timer, abort, browserVersion;
  let stage = 'launch', expired = false;
  try {
    if (signal?.aborted) {
      const error = new Error('Search cancelled');
      error.diagnostic = diagnostic('CANCELLED', stage);
      throw error;
    }
    if (process.env.META_AUTOMATED_ACCESS_AUTHORIZED !== '1') {
      const error = new Error('Meta source disabled');
      error.diagnostic = diagnostic('META_SOURCE_DISABLED', 'authorization');
      throw error;
    }
    const url = new URL('https://www.facebook.com/ads/library/');
    for (const [key, value] of Object.entries({ active_status: 'active', ad_type: 'all', country, locale: 'es_LA', q: keyword, search_type: 'keyword_unordered' })) url.searchParams.set(key, value);
    browser = await launch();
    browserVersion = browser.version();
    abort = () => { void browser.close().catch(() => {}); };
    timer = setTimeout(() => { expired = true; abort(); }, Math.max(1, timeoutMs - (Date.now() - started)));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const page = await browser.newPage({ locale: 'es-AR' });
    await beforeNavigate(page);
    stage = 'navigate';
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: Math.min(policy.navigationMs, timeoutMs) });
    const httpStatus = response?.status() ?? null;
    const finalUrl = new URL(page.url());
    const navigation = { httpStatus, finalHost: finalUrl.host, redirected: finalUrl.href !== url.href };
    if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
      const error = new Error('Meta navigation refused');
      error.diagnostic = diagnostic(httpStatus === 429 ? 'META_RATE_LIMITED' : 'META_ACCESS_REFUSED', stage, navigation);
      throw error;
    }
    if (httpStatus >= 400) {
      const error = new Error('HTTP failure');
      error.diagnostic = diagnostic('HTTP_ERROR', stage, navigation); throw error;
    }
    stage = 'wait_identifiers';
    await page.getByText(LIBRARY_MARKER).first().waitFor({ timeout: Math.min(policy.markerMs, timeoutMs) }).catch(() => {});
    const initialAdsCount = await page.getByText(LIBRARY_MARKER).count();
    stage = 'scroll';
    for (let i = 0; i < policy.scrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(policy.scrollDelayMs);
    }
    stage = 'extract';
    const dom = await page.evaluate(extractMetaCards);
    const context = { httpStatus, markerCount: dom.markerCount, cardCount: dom.cards.length, scopeFailures: dom.scopeFailures, elapsedMs: Date.now() - started };
    if (!dom.markerCount && dom.challenge) {
      const error = new Error('Meta access gate');
      error.diagnostic = diagnostic(dom.challenge.toUpperCase(), stage, context); throw error;
    }
    const records = [];
    for (const card of dom.cards) {
      for (const ad of parseMetaText(card.text).filter(ad => ad.id === card.id)) {
        const truncated = Boolean(ad.copyTruncated || card.truncated);
        records.push({ ...ad, copyTruncated: truncated, language: truncated ? 'unknown' : ad.language, ...extractAdUrls(card, ad.copy || ''), inferredProduct: inferProduct(ad) });
      }
    }
    // Retain ads whose card boundary is unknown, but never attach page-wide CTAs.
    const visible = await page.evaluate(extractPageEvidence);
    const scopedIds = new Set(records.map(ad => ad.id));
    for (const ad of parseMetaText(visible.evidenceText).filter(ad => !scopedIds.has(ad.id))) {
      records.push({ ...ad, cardScopeUnresolved: true, copyTruncated: Boolean(ad.copyTruncated || visible.textTruncated), ...extractAdUrls({ id: ad.id, scope: 'unknown' }, ad.copy || ''), inferredProduct: inferProduct(ad) });
    }
    const ads = uniqueAds(records).filter(ad => language === 'all' || ad.language === language).slice(0, 100);
    context.parsedAds = records.length;
    context.adsWithoutCopy = records.filter(ad => !ad.copy).length;
    const diagnostics = [{ ...diagnostic(records.length ? 'EXTRACTION_COMPLETE' : dom.noResults ? 'NO_RESULTS' : dom.markerCount ? 'PARSE_FAILED' : 'MARKERS_NOT_FOUND', stage, context), urls: urlSummary(ads) }];
    const externalLinks = [...new Set(ads.flatMap(adUrls))].slice(0, 100);
    return { keyword, country, language, total: ads.length, ads, externalLinks, externalLinksCount: externalLinks.length,
      initialAdsCount, loadedAdsCount: dom.markerCount, diagnostics, urlDiagnostics: urlSummary(ads),
      warnings: !records.length ? [diagnostics[0].message] : dom.scopeFailures ? ['Algunos anuncios no tienen un contenedor inequívoco; sus CTA no se atribuyeron por seguridad.'] : [] };
  } catch (error) {
    const details = { elapsedMs: Date.now() - started, budgetMs: timeoutMs, ...(browserVersion ? { browserVersion } : {}) };
    const safe = expired ? diagnostic('TIMEOUT', stage, details) : error.diagnostic ? { ...error.diagnostic, ...details } : failureDiagnostic(error, stage, details);
    const reported = new Error(`${safe.code}: ${safe.message}`);
    reported.diagnostic = safe;
    throw reported;
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    await browser?.close().catch(() => {});
  }
}
