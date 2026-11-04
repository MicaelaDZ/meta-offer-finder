import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAd, classifyOffer } from '../src/lib/evidence.mjs';
import { discover, uniqueAds, detectLanguage, LIMITS } from '../src/lib/discovery.mjs';
import { groupAds } from '../src/lib/grouping.mjs';
import { matchPages, verifiedAssociation } from '../src/lib/association.mjs';
import { rankGroups, deduplicateRanking, sortRanking } from '../src/lib/ranking.mjs';
import { parseMetaText } from '../src/lib/meta-parser.mjs';
import { productUrl } from '../src/lib/identity.mjs';
import { SEARCH_PROFILES } from '../src/lib/search-policy.mjs';
import { verificationBatch, CANCELLATION_NOTICE, LANGUAGE_NOTICE } from '../src/lib/verification.mjs';

const ad = { id: '1', advertiser: 'Tienda', copy: 'Comprar ebook Recetas Veganas por $19 https://shop.example.com/ebook?id=vegan', date: '1 ene 2026' };
const page = { url: 'https://shop.example.com/ebook?id=vegan', finalUrl: 'https://shop.example.com/ebook?id=vegan', httpStatus: 200,
  evidenceText: 'Comprar ebook Recetas Veganas por $19. Acceso inmediato', productTitle: 'Recetas Veganas', title: 'Tienda' };

for (const text of [
  'Comprar libro de tapa dura $29 con ebook de regalo',
  'Precio habitual del ebook $29. Descarga sin costo',
  'Comprar servicio profesional de diseño de software por $500',
  'Comprar ebook PDF. La camiseta tiene precio $29',
  'Comprar ebook con la compra de pelota por $29',
  'Comprar ebook junto a camiseta por $29',
  'Comprar ebook antes $49',
  'Comprar ebook <s>$49</s>',
  'Comprar ebook ~~$49~~',
  'Comprar ebook antes $49 ahora $19',
  'Comprar ebook gratis valorado en $19',
]) test(`commercial counterexample stays under review: ${text}`, () => {
  const result = classifyOffer(text);
  assert.equal(result.isCandidate, false);
  assert.equal(result.classification, 'sin_evidencia_suficiente');
  assert.deepEqual(result.pricesFound, []);
});

test('current price explicitly bound to a single digital offer remains a candidate', () => {
  assert.equal(classifyOffer(ad.copy).isCandidate, true);
  assert.equal(classifyOffer('Comprar libro físico por $40').classification, 'posible_producto_fisico');
  assert.equal(classifyOffer('Servicio de consultoría por $99').classification, 'posible_servicio');
  assert.equal(classifyOffer('Descargá ebook sin costo').classification, 'posible_digital_gratuito');
});
test('a shirt never inherits evidence, price or points from an ebook landing on the same domain', () => {
  const shirt = { ...ad, copy: 'Comprar camiseta $30 en https://shop.example.com/camiseta' };
  const groups = groupAds([shirt]).groups;
  const baseline = rankGroups(groups)[0];
  const ranking = rankGroups(groups, [page])[0];
  assert.equal(verifiedAssociation(shirt, page), false);
  assert.equal(matchPages([shirt], [page])[0].matchStatus, 'sin_asociacion_verificada');
  assert.deepEqual(ranking, baseline);
  assert.notEqual(ranking.status, 'candidato_digital_pago');
  assert.equal(ranking.scoreBreakdown.association, 0);
  assert.deepEqual(ranking.pricesFound, []);
});
test('same domain, another path/query/product name, redirect or HTTP error never promotes', () => {
  const groups = groupAds([ad]).groups;
  for (const changed of [
    { ...page, url: 'https://shop.example.com/shirt', finalUrl: 'https://shop.example.com/shirt' },
    { ...page, url: 'https://shop.example.com/ebook?id=other', finalUrl: 'https://shop.example.com/ebook?id=other' },
    { ...page, productTitle: 'Marketing Industrial' },
    { ...page, evidenceText: 'Comprar software Recetas Veganas por $19' },
    { ...page, finalUrl: 'https://shop.example.com/another-product' },
    { ...page, httpStatus: 403 },
    { ...page, textTruncated: true },
    { ...page, evidenceText: 'Precio habitual ebook $49' },
    { ...page, evidenceText: null, status: 'candidato_digital_pago', hasDigitalSignal: true, pricesFound: ['$19'] },
  ]) {
    assert.equal(verifiedAssociation(ad, changed), false);
    const [{ verification, ...actual }] = rankGroups(groups, [changed]);
    const [{ verification: baselineVerification, ...baseline }] = rankGroups(groups);
    assert.deepEqual(actual, baseline);
    assert.equal(verification.digitalPaidVerified, false);
    assert.equal(baselineVerification.digitalPaidVerified, false);
  }
});
test('exact product URL plus distinctive title and current evidence allow promotion', () => {
  assert.equal(verifiedAssociation(ad, page), true);
  assert.equal(matchPages([ad], [page])[0].matchStatus, 'coincidencia_url_y_producto');
  const ranked = rankGroups(groupAds([ad]).groups, [page])[0];
  assert.equal(ranked.status, 'candidato_digital_pago');
  assert.equal(ranked.scoreBreakdown.association, 10);
  assert.deepEqual(ranked.pricesFound, ['$19']);
});
test('every category receives an independent quota even when the first has 150 results', async () => {
  const calls = [];
  let clock = 0;
  const result = await discover({ country: 'AR', language: 'all' }, async options => {
    calls.push(options); clock += options.timeoutMs;
    return { ads: Array.from({ length: 150 }, (_, i) => ({ id: `${options.category}-${i}`, copy: options.keyword })) };
  }, { now: () => clock, pause: async ms => { clock += ms; } });
  assert.equal(new Set(calls.map(call => call.category)).size, 6);
  assert.equal(result.searches.length, 6);
  assert.equal(result.ads.length, LIMITS.ads);
  assert.deepEqual(result.searches.map(s => s.retained), [17, 17, 17, 17, 16, 16]);
  assert.ok(clock <= LIMITS.discoveryMs);
});
test('richer duplicate wins in either order, filling complementary data and retaining observations', () => {
  const partial = { id: '1', advertiser: null, copy: null, date: '1 ene 2026', discoveryCategories: ['ebooks'] };
  const full = { ...ad, date: null, language: 'es', discoveryCategories: ['packs'] };
  for (const records of [[partial, full], [full, partial]]) {
    const [merged] = uniqueAds(records);
    assert.equal(merged.copy, full.copy);
    assert.equal(merged.advertiser, 'Tienda');
    assert.equal(merged.date, partial.date);
    assert.equal(merged.language, 'es');
    assert.equal(merged.observations.length, 2);
    assert.deepEqual(new Set(merged.discoveryCategories), new Set(['ebooks', 'packs']));
    assert.equal(merged.evidenceConflict, false);
  }
});
test('a conflicting duplicate is retained but cannot supply paid evidence', () => {
  const [merged] = uniqueAds([ad, { ...ad, copy: 'Descargar ebook gratis' }]);
  assert.equal(merged.observations.length, 2);
  assert.equal(merged.evidenceConflict, true);
  assert.equal(classifyAd(merged).isCandidate, false);
});
test('later categories enrich IDs even after filling their new-ad quota', async () => {
  let index = 0;
  const result = await discover({ country: 'AR', language: 'all' }, async () => ({ ads: index++ === 0 ? [{ id: 'one', copy: null }] : [{ id: 'one', copy: ad.copy, advertiser: ad.advertiser }] }), { pause: async () => {} });
  assert.equal(result.ads.length, 1);
  assert.equal(result.ads[0].copy, ad.copy);
  assert.equal(result.ads[0].discoveryCategories.length, 6);
});
test('full introductions, exact URLs and missing product identity do not merge different offers', () => {
  const intro = 'Conocé nuestras ofertas especiales de la temporada y descubrí novedades para vos. '.repeat(3);
  assert.equal(groupAds([{ ...ad, copy: intro + ad.copy }, { ...ad, id: '2', copy: intro + 'Servicio de consultoría gratuito' }]).totalGroups, 2);
  assert.equal(groupAds([ad, { ...ad, id: '2', copy: ad.copy.replace('id=vegan', 'id=shirt') }]).totalGroups, 2);
  assert.equal(groupAds([{ id: 'a' }, { id: 'b' }]).totalGroups, 2);
  assert.equal(groupAds([ad, { ...ad, id: '2' }, ad]).groups[0].adsCount, 2);
});
test('query and fragment product selectors survive URL identity and UI deduplication', () => {
  const urls = ['https://shop.example.com/product?id=ebook', 'https://shop.example.com/product?id=shirt', 'https://shop.example.com/#ebook', 'https://shop.example.com/#shirt'];
  assert.equal(new Set(urls.map(productUrl)).size, 4);
  const rows = urls.map((url, i) => ({ url, advertiser: 'Store', groupId: String(i), adsCount: 2 }));
  assert.equal(deduplicateRanking([...rows, rows[0]]).length, 4);
  assert.equal(deduplicateRanking(rows).reduce((sum, row) => sum + row.adsCount, 0), 8);
});
test('disclosures beyond eleven lines remain in copy; very long text is explicitly incomplete', () => {
  const prefix = 'Identificador de la biblioteca: 123\nTienda\nPublicidad\nComprar ebook $19\n';
  const [parsed] = parseMetaText(prefix + Array.from({ length: 20 }, (_, i) => `Detalle ${i}`).join('\n') + '\nEste es un recurso gratuito; el precio anterior ya no aplica');
  assert.match(parsed.copy, /gratuito/);
  assert.equal(classifyAd(parsed).isCandidate, false);
  const [long] = parseMetaText(prefix + 'x'.repeat(20010));
  assert.equal(long.copyTruncated, true);
  assert.equal(classifyAd(long).isCandidate, false);
  assert.equal(long.language, 'unknown');
});
test('manual continuation visits all URLs in bounded batches and permits restarting', () => {
  const urls = Array.from({ length: 12 }, (_, i) => `https://example.com/product/${i}`);
  let cursor = 0; const visited = [];
  for (let i = 0; i < 3; i++) { const batch = verificationBatch(urls, cursor); visited.push(...batch.urls); cursor = batch.nextCursor; assert.ok(batch.urls.length <= 5); }
  assert.deepEqual(visited, urls);
  assert.equal(cursor, 12);
  assert.equal(verificationBatch(urls, cursor).start, 0);
});
test('manual navigation and scrolling match the original coverage policy', () => {
  assert.equal(SEARCH_PROFILES.manual.navigationMs, 60000);
  assert.equal(SEARCH_PROFILES.manual.markerMs, 15000);
  assert.equal(SEARCH_PROFILES.manual.scrolls, 4);
  assert.equal(SEARCH_PROFILES.manual.scrollDelayMs, 1500);
  assert.ok(SEARCH_PROFILES.manual.timeoutMs >= 60000 + 15000 + 4 * 1500 + 10000);
});
test('evidence priority remains the default; explicit score/age/count sorts are honored', () => {
  const rows = [{ groupId: 'unknown', status: 'sin_evidencia_suficiente', score: 80, ageDays: 500, adsCount: 10 }, { groupId: 'ad', status: 'candidato_por_anuncio', score: 2, ageDays: 1, adsCount: 1 }, { groupId: 'landing', status: 'candidato_digital_pago', score: 40, ageDays: 2, adsCount: 2 }];
  assert.deepEqual(sortRanking(rows).map(r => r.groupId), ['landing', 'ad', 'unknown']);
  for (const order of ['puntaje', 'antiguedad', 'anuncios']) assert.equal(sortRanking(rows, order)[0].groupId, 'unknown');
});
test('cancel and language messages explicitly disclose their limitations', () => {
  assert.match(CANCELLATION_NOTICE, /respuestas ya recibidas/);
  assert.match(CANCELLATION_NOTICE, /no se recuperan/);
  assert.match(LANGUAGE_NOTICE, /Puede fallar/);
  assert.match(LANGUAGE_NOTICE, /desconocidos se excluyen/);
  assert.equal(detectLanguage('Discover amazing downloadable templates designed especially to simplify everyday planning.'), 'unknown');
});

test('ranking deduplicates IDs and refuses mixed-product groups submitted by a client', () => {
  const group = groupAds([ad]).groups[0];
  assert.equal(rankGroups([{ ...group, ads: [ad, ad] }])[0].adsCount, 1);
  const mixed = rankGroups([{ ...group, ads: [ad, { ...ad, id: '2', copy: 'Servicio de consultoría gratuito' }] }], [page])[0];
  assert.equal(mixed.status, 'sin_evidencia_suficiente');
  assert.equal(mixed.score, 0);
});
