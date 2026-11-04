import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { extractMetaCards } from '../src/lib/meta-dom.mjs';
import { extractAdUrls } from '../src/lib/url-extraction.mjs';
import { searchMetaAds } from '../src/lib/meta-search.mjs';
import { verifyLanding } from '../src/lib/landing-verification.mjs';
import { verifiedAssociation, pageSignals } from '../src/lib/association.mjs';
import { verificationState } from '../src/lib/verification-state.mjs';
// These provider tests intercept every browser request before navigation.
process.env.META_AUTOMATED_ACCESS_AUTHORIZED = '1';
const launch = () => chromium.launch({ headless: true, ...(process.env.TEST_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.TEST_CHROMIUM_EXECUTABLE_PATH } : {}) });
const card = (id, target = '', copy = 'Comprar curso Huerta Urbana por $19 para tus plantas con una guía') => `<article><span>Library ID: ${id}</span><div>Editorial</div><div>Sponsored</div><p>${copy}</p>${target}</article>`;

test('DOM supports scoped CTA attributes and wrappers, never page navigation or onclick execution', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const url = 'https://shop.example.org/product?id=1';
    const targets = [`<a href="${url}">Comprar</a>`, `<a href="https://l.facebook.com/l.php?u=${encodeURIComponent(url)}">Comprar</a>`, `<button data-href="${url}">Comprar</button>`, `<div role="button" data-url="${url}">Comprar</div>`, `<a data-lynx-uri="${url}">Comprar</a>`];
    await page.setContent(`<nav><a href="https://unrelated.example.org/">Outside card</a></nav>${targets.map((target, i) => card(i + 1, target)).join('')}${card(6)}${card(7, '<a href="https://facebook.com/ads/library/?id=7">Meta</a>')}${card(8, `<button onclick='location.href="${url}"'>Comprar</button>`)}${card(9, '<p>tienda.example.org</p>')}`);
    const dom = await page.evaluate(extractMetaCards);
    assert.equal(dom.cards.length, 9);
    const results = dom.cards.map(card => extractAdUrls(card));
    for (const result of results.slice(0, 5)) { assert.equal(result.urlEvidence[0].url, url); assert.equal(result.urlDiagnostics.status, 'url_extracted'); }
    assert.equal(results[5].urlDiagnostics.status, 'no_visible_url');
    assert.equal(results[6].urlDiagnostics.status, 'meta_or_non_commercial_url');
    assert.equal(results[7].urlDiagnostics.status, 'url_present_not_extracted');
    assert.equal(results[8].urlDiagnostics.status, 'url_present_not_extracted');
    assert.equal(JSON.stringify(results).includes('unrelated.example.org'), false);
    assert.equal(page.url(), 'about:blank');
  } finally { await browser.close(); }
});

test('provider recovers 55 distinct CTA URLs with Spanish filtering, without printing raw targets', async () => {
  const html = Array.from({ length: 55 }, (_, i) => card(i + 1, `<button data-href="https://shop.example.org/product?id=${i}&amp;token=TEST_ONLY_SECRET">Comprar</button>`)).join('');
  const result = await searchMetaAds({ keyword: 'curso online', country: 'AR', language: 'es', mode: 'automatic' }, { launch, beforeNavigate: page => page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html })) });
  assert.equal(result.ads.length, 55);
  assert.equal(result.externalLinks.length, 55);
  assert.equal(result.urlDiagnostics.url_extracted, 55);
  assert.equal(result.ads.every(ad => ad.urlEvidence[0].adId === ad.id), true);
  assert.doesNotMatch(JSON.stringify(result.diagnostics), /TEST_ONLY_SECRET|token=|shop\.example|Sponsored/);
});

test('provider distinguishes navigation HTTP errors, login/consent and unrecognized empty markup', async () => {
  for (const [html, status, code] of [
    ['Blocked', 403, 'META_ACCESS_REFUSED'],
    ['Rate limited', 429, 'META_RATE_LIMITED'],
    ['<form><input type="password"></form>', 200, 'LOGIN_REQUIRED'],
    ['<div role="dialog">Consentimiento de cookies</div>', 200, 'CONSENT_REQUIRED'],
    ['<div>Unknown markup</div>', 200, 'MARKERS_NOT_FOUND'],
  ]) {
    const action = () => searchMetaAds({ keyword: 'ebook', language: 'all', mode: 'automatic' }, { launch, beforeNavigate: page => page.route('**/*', route => route.fulfill({ status, contentType: 'text/html', body: html })) });
    if (code === 'MARKERS_NOT_FOUND') { const result = await action(); assert.equal(result.total, 0); assert.equal(result.diagnostics[0].code, code); }
    else await assert.rejects(action(), error => error.diagnostic?.code === code);
  }
});

test('landing navigation records actual redirect chain and separates downloaded/accessed/associated/paid stages', async () => {
  const browser = await launch();
  const server = createServer((request, response) => {
    if (request.url.startsWith('/go')) { response.writeHead(302, { location: '/course' }); response.end(); }
    else if (request.url === '/blocked') { response.writeHead(403); response.end('Forbidden'); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<title>Curso</title><main><h1>Huerta Urbana</h1><p>Curso online para cultivar en casa</p><p class="price"><s>$49</s> $19</p><button>Comprar</button></main>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const initial = origin + '/go?id=course', final = origin + '/course';
  // Local fixture permission is injected only into this test, never an API option.
  const allowUrl = value => new URL(value).origin === origin;
  const ad = { id: '1', advertiser: 'Editorial', copy: 'Comprar curso Huerta Urbana por $19', urlEvidence: [{ url: initial, adId: '1', source: 'href', scope: 'single_ad_card' }] };
  try {
    const page = await browser.newPage();
    const result = await verifyLanding(page, initial, { allowUrl });
    assert.deepEqual(result.lifecycle, { attempted: true, downloaded: true, accessible: true });
    assert.equal(result.finalUrl, final);
    assert.deepEqual(result.redirectChain, [{ from: initial, to: final, status: 302 }]);
    assert.equal(pageSignals(result).isCandidate, true);
    assert.deepEqual(result.pricesFound, ['$19']);
    assert.equal(verifiedAssociation(ad, result), true);
    assert.equal(verificationState(ad, [result]).digitalPaidVerified, true);
    await page.close();
    const blocked = await browser.newPage();
    const failed = await verifyLanding(blocked, origin + '/blocked', { allowUrl });
    assert.equal(failed.lifecycle.downloaded, true); assert.equal(failed.lifecycle.accessible, false);
    assert.equal(failed.diagnostic.code, 'HTTP_ERROR');
    const pending = verificationState({ ...ad, urlEvidence: [{ ...ad.urlEvidence[0], url: origin + "/blocked" }] }, [failed]);
    assert.equal(pending.digitalPaidVerified, false); assert.equal(pending.reasonCode, 'HTTP_ERROR');
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('separated product DOM price cannot be borrowed from another product or obsolete text', async () => {
  const browser = await launch();
  try {
    for (const body of [
      '<main><h1>Huerta Urbana</h1><p>Curso online</p><h2>Camiseta</h2><p class="price">$19</p><button>Comprar</button></main>',
      '<main><h1>Huerta Urbana</h1><p>Curso online</p><p class="price"><s>$19</s></p><button>Comprar</button></main>',
      '<header>Ebook de otro producto</header><main><h1>Huerta Urbana</h1><p>Producto sin formato identificado</p><p class="price">$19</p><button>Comprar</button></main>',
      '<main><h1>Huerta Urbana</h1><p>Curso online gratis</p><p class="price">$19</p><button>Comprar</button></main>',
    ]) {
      const page = await browser.newPage();
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body }));
      const result = await verifyLanding(page, 'https://shop.example.org/course');
      assert.equal(result.lifecycle.accessible, true);
      assert.equal(pageSignals(result).isCandidate, false);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('course enrollment CTA with a current scoped price can supply payment evidence', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<main><h1>Huerta Urbana</h1><p>Curso online para cultivar</p><span itemprop="price">$19</span><button>Inscribirme</button></main>' }));
    const result = await verifyLanding(page, 'https://shop.example.org/course');
    assert.equal(result.lifecycle.accessible, true);
    assert.equal(pageSignals(result).isCandidate, true);
    assert.deepEqual(pageSignals(result).pricesFound, ['$19']);
  } finally { await browser.close(); }
});
