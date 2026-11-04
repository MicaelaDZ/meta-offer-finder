import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDestination, extractAdUrls, adUrls } from '../src/lib/url-extraction.mjs';
import { uniqueAds, discover } from '../src/lib/discovery.mjs';
import { inferProduct } from '../src/lib/product-inference.mjs';
import { groupAds } from '../src/lib/grouping.mjs';
import { rankGroups } from '../src/lib/ranking.mjs';
import { associationReason, verifiedAssociation, pageSignals } from '../src/lib/association.mjs';
import { verificationState } from '../src/lib/verification-state.mjs';
import { failureDiagnostic } from '../src/lib/scrape-diagnostics.mjs';
import { aiFailure, analyzeBatch } from '../src/lib/ai-failure.mjs';
const url = 'https://shop.example.com/product?id=vegan';
const cta = { url, adId: '1', source: 'data-href', scope: 'single_ad_card' };
const ad = { id: '1', advertiser: 'Tienda', copy: 'Comprar ebook Recetas Veganas por $19', urlEvidence: [cta] };
const page = { url, finalUrl: url, httpStatus: 200, evidenceText: 'Comprar ebook Recetas Veganas por $19', productTitle: 'Recetas Veganas', lifecycle: { attempted: true, downloaded: true, accessible: true } };
test('known Meta wrappers decode only explicit targets and preserve product parameters', () => {
  for (const wrapper of ['https://l.facebook.com/l.php', 'https://lm.facebook.com/l.php', 'https://www.facebook.com/l.php']) assert.equal(decodeDestination(wrapper + '?u=' + encodeURIComponent(url)).url, url);
  assert.equal(decodeDestination('example.com').kind, 'meta'); // never invent https://example.com
  assert.equal(decodeDestination('https://l.facebook.com/l.php').kind, 'meta');
  assert.equal(decodeDestination('javascript:location.href="https://shop.example.com"').kind, 'invalid');
  assert.equal(decodeDestination('https://wa.me/12345').kind, 'non_commercial');
});
test('per-ad diagnostics distinguish no visible URL, unextracted, external and Meta/contact', () => {
  assert.equal(extractAdUrls({ id: '1', scope: 'single_ad_card', targets: [] }).urlDiagnostics.status, 'no_visible_url');
  assert.equal(extractAdUrls({ id: '1', urlHints: true }).urlDiagnostics.status, 'url_present_not_extracted');
  assert.equal(extractAdUrls({ id: '1', scope: 'single_ad_card', targets: [{ source: 'href', value: 'https://facebook.com/ads/library/?id=1' }] }).urlDiagnostics.status, 'meta_or_non_commercial_url');
  const extracted = extractAdUrls({ id: '1', scope: 'single_ad_card', targets: [{ source: 'data-url', value: url }] });
  assert.equal(extracted.urlDiagnostics.status, 'url_extracted');
  assert.deepEqual(adUrls({ ...ad, ...extracted }), [url]);
  assert.deepEqual(adUrls({ ...ad, urlEvidence: [{ ...cta, adId: 'other' }] }), []);
  assert.equal(extractAdUrls({ id: '1', scope: 'unknown', targets: [{ source: 'href', value: url }] }).urlDiagnostics.status, 'url_present_not_extracted');
});
test('all links survive discovery aggregation; language filtering need not lose scoped CTAs', async () => {
  const result = await discover({ country: 'AR', language: 'es' }, async ({ category }) => ({ ads: Array.from({ length: 10 }, (_, i) => ({ id: `${category}-${i}`, urlEvidence: [{ url: `https://shop.example.com/${category}/${i}`, adId: `${category}-${i}`, source: 'href', scope: 'single_ad_card' }] })), externalLinks: Array.from({ length: 10 }, (_, i) => `https://shop.example.com/${category}/${i}`) }), { pause: async () => {} });
  assert.equal(result.total, 60);
  assert.equal(result.externalLinks.length, 60);
  assert.equal(result.urlDiagnostics.uniqueExternalUrls, 60);
});
test('duplicate observations preserve later CTA evidence, not only copy', () => {
  const [merged] = uniqueAds([{ ...ad, urlEvidence: [] }, ad]);
  assert.deepEqual(adUrls(merged), [url]);
  assert.equal(merged.urlDiagnostics.status, 'url_extracted');
});
test('category and probable name are inferred from product text, never search category', () => {
  for (const [copy, category, name] of [['Curso de Huerta Urbana por $20', 'curso', 'Huerta Urbana'], ['Software Facturas Claras por $20', 'software', 'Facturas Claras'], ['Ebook Recetas Veganas por $20', 'ebook', 'Recetas Veganas'], ['Plantilla digital Agenda Escolar por $20', 'plantilla', 'Agenda Escolar'], ['Pack digital Huerta Urbana por $20', 'pack', 'Huerta Urbana']]) {
    const inferred = inferProduct({ copy, discoveryCategories: ['imprimibles'] });
    assert.equal(inferred.category, category); assert.equal(inferred.probableName, name); assert.equal(inferred.nameInferred, true);
  }
});
test('different creatives group only with explicit destination, matching product name and price', () => {
  const variant = { ...ad, id: '2', copy: 'Descubrí nuestro ebook Recetas Veganas por $19. Comprar ahora.', urlEvidence: [{ ...cta, adId: '2' }] };
  assert.equal(groupAds([ad, variant]).totalGroups, 1);
  assert.equal(groupAds([ad, { ...variant, urlEvidence: [{ ...cta, adId: '2', url: url + '2' }] }]).totalGroups, 2);
  assert.equal(groupAds([ad, { ...variant, copy: 'Ebook Cocina Italiana por $19. Comprar ahora.' }]).totalGroups, 2);
});
test('a CTA can associate without URL in copy; domain-only and other products cannot', () => {
  assert.equal(verifiedAssociation(ad, page), true);
  assert.equal(verifiedAssociation({ ...ad, urlEvidence: [] }, page), false);
  assert.equal(verifiedAssociation({ ...ad, copy: 'Comprar camiseta $19' }, page), false);
  assert.equal(verifiedAssociation(ad, { ...page, productTitle: 'Facturas Claras' }), false);
});
test('recorded CTA redirects require a continuous observed chain and matching product', () => {
  const redirect = { ...page, finalUrl: 'https://checkout.example.org/recetas', redirectChain: [{ from: url, to: 'https://checkout.example.org/recetas', status: 302 }] };
  assert.equal(verifiedAssociation(ad, redirect), true);
  assert.equal(verifiedAssociation(ad, { ...redirect, redirectChain: [] }), false);
  assert.equal(verifiedAssociation(ad, { ...redirect, redirectChain: [{ from: 'https://unrelated.example.org', to: redirect.finalUrl, status: 302 }] }), false);
  assert.equal(verifiedAssociation(ad, { ...redirect, productTitle: 'Otro Producto' }), false);
});
test('lifecycle distinguishes URL, downloaded/accessed, associated and paid evidence', () => {
  assert.equal(verificationState(ad, []).reasonCode, 'VERIFICATION_NOT_ATTEMPTED');
  const failed = verificationState(ad, [{ ...page, httpStatus: 403, lifecycle: { attempted: true, downloaded: true, accessible: false }, diagnostic: { code: 'HTTP_ERROR', message: 'HTTP 403' } }]);
  assert.equal(failed.pageDownloaded, true); assert.equal(failed.pageAccessible, false); assert.equal(failed.digitalPaidVerified, false);
  const noPrice = { ...page, evidenceText: 'Ebook Recetas Veganas, acceso inmediato' };
  assert.equal(associationReason(ad, noPrice), null);
  const state = verificationState(ad, [noPrice]);
  assert.equal(state.productAssociated, true); assert.equal(state.digitalEvidence, true); assert.equal(state.paymentEvidence, false); assert.equal(state.digitalPaidVerified, false);
  assert.equal(state.reasonCode, 'PAYMENT_EVIDENCE_MISSING');
  assert.equal(verificationState(ad, [page]).digitalPaidVerified, true);
  assert.equal(rankGroups(groupAds([ad]).groups, [page])[0].verification.digitalPaidVerified, true);
});
test('page status cannot substitute for real price evidence', () => {
  assert.equal(pageSignals({ ...page, evidenceText: 'Ebook Recetas Veganas', status: 'candidato_digital_pago', pricesFound: ['$19'] }).isCandidate, false);
});
test('technical diagnostics and AI failures never retain secret-bearing error text', () => {
  const failure = failureDiagnostic(new Error('net::ERR_TUNNEL_CONNECTION_FAILED https://user:password@example.org/private?token=SECRET email@example.org'), 'navigate');
  assert.equal(failure.code, 'NETWORK_ACCESS_DENIED'); assert.equal(failure.engineCode, 'ERR_TUNNEL_CONNECTION_FAILED');
  assert.doesNotMatch(JSON.stringify(failure), /SECRET|password|private|email@/);
  assert.equal(aiFailure(new Error('signal timed out')).code, 'AI_TIMEOUT');
  assert.equal(aiFailure(new Error('signal timed out')).terminal, true);
});

test('first AI timeout stops the batch instead of delaying landing work five times', async () => {
  let calls = 0;
  const results = await analyzeBatch(Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1) })), async () => { calls++; throw new Error('signal timed out'); });
  assert.equal(calls, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].errorCode, 'AI_TIMEOUT');
  assert.equal(results[0].posibleOportunidad, false);
});

test('unresolved card scope cannot promote a paid product even with a copied URL', () => {
  const unresolved = { ...ad, copy: ad.copy + ' ' + url, cardScopeUnresolved: true };
  assert.equal(verifiedAssociation(unresolved, page), false);
  assert.equal(rankGroups(groupAds([unresolved]).groups, [page])[0].score, 0);
});

test('a scoped duplicate wins over a longer unscoped fallback without inheriting its links', () => {
  const unscoped = { ...ad, copy: ad.copy + ' ruido de otro producto gratuito', cardScopeUnresolved: true, urlEvidence: [{ ...cta, url: 'https://unrelated.example.org/product', scope: 'copy' }] };
  const [merged] = uniqueAds([unscoped, ad]);
  assert.equal(merged.copy, ad.copy);
  assert.notEqual(merged.cardScopeUnresolved, true);
  assert.deepEqual(adUrls(merged), [url]);
  assert.equal(verifiedAssociation(merged, page), true);
  assert.equal(merged.observations.length, 2);
});
