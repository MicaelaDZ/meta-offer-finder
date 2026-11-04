import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, discoveryQueries, detectLanguage, searchOptions, uniqueAds, LIMITS } from '../src/lib/discovery.mjs';
import { classifyOffer } from '../src/lib/evidence.mjs';
import { parseMetaText } from '../src/lib/meta-parser.mjs';

// Synthetic examples exercise the parser and never enter application results.
test('validates country/language and selects six categories without a keyword', () => {
  assert.throws(() => searchOptions(null));
  assert.throws(() => searchOptions({ country: 'ZZ' }));
  assert.throws(() => searchOptions({ language: 'fr' }));
  assert.deepEqual(searchOptions({}), { country: 'AR', language: 'all' });
  const queries = discoveryQueries({ country: 'US', language: 'all' });
  assert.equal(queries.length, 6);
  assert.equal(new Set(queries.map(q => q.category)).size, 6);
  assert.equal(queries[1].keyword, 'online course');
  assert.equal(discoveryQueries({ country: 'BR', language: 'all' })[2].keyword, 'templates digitais');
});
test('estimates text language conservatively, including unknown/mixed copy', () => {
  assert.equal(detectLanguage('Comprá ahora el ebook con una descarga para tus recetas'), 'es');
  assert.equal(detectLanguage('Buy now and download your ebook with our course'), 'en');
  assert.equal(detectLanguage('Compre agora seu ebook com acesso para voce'), 'pt');
  assert.equal(detectLanguage('ebook PDF'), 'unknown');
  assert.equal(detectLanguage('the your with el los las'), 'unknown');
});
test('deduplicates IDs across categories without inflating ad counts', () => {
  const ads = uniqueAds([{ id: 1, discoveryCategories: ['ebooks'] }, { id: '1', discoveryCategories: ['packs'] }, { id: '2' }, null]);
  assert.equal(ads.length, 2);
  assert.deepEqual(ads[0].discoveryCategories, ['ebooks', 'packs']);
});
test('paid signals require digital, purchase and nonzero price; excludes conflicting evidence', () => {
  for (const text of ['Comprá ebook PDF por $19', 'Buy online course USD 20', 'Compre ebook R$ 29']) assert.equal(classifyOffer(text).classification, 'candidato_digital_pago');
  assert.equal(classifyOffer('Descargá ebook gratis').classification, 'posible_digital_gratuito');
  assert.equal(classifyOffer('Comprar libro físico $40 con envío a domicilio').classification, 'posible_producto_fisico');
  assert.equal(classifyOffer('Servicio de consultoría por $99').classification, 'posible_servicio');
  for (const text of ['ebook $19', 'Comprar ebook $0', 'Comprar ebook $19 gratis', 'Comprar ebook $19 con pago contra entrega', 'Comprar software $19 free trial']) assert.equal(classifyOffer(text).isCandidate, false, text);
});
test('parser only accepts explicit IDs, retains Unicode, rejects absent copy language', () => {
  const content = 'Library ID: 123\nStarted running on Jan 1, 2026\nExample\nSponsored\nBuy now and download your ebook with our course\nLibrary ID: 123\nExample\nSponsored\nDuplicate';
  const ads = parseMetaText(content);
  assert.equal(ads.length, 1);
  assert.equal(ads[0].id, '123');
  assert.equal(ads[0].language, 'en');
  assert.equal(parseMetaText('Consentimiento. Iniciar sesión.').length, 0);
  assert.equal(parseMetaText('ID da biblioteca: 456\nJoão\nPatrocinado\nCompre agora seu ebook com acesso para voce')[0].advertiser, 'João');
});
test('discovery runs sequentially, retains partial successes and query provenance', async () => {
  let active = 0, peak = 0, calls = 0;
  const result = await discover({ country: 'MX', language: 'es' }, async options => {
    peak = Math.max(peak, ++active); calls++;
    assert.equal(options.country, 'MX'); assert.equal(options.language, 'es');
    active--;
    if (calls === 2) throw new Error('Meta unavailable');
    return { ads: [{ id: '123', copy: 'example' }], externalLinks: ['https://example.org/'], warnings: [] };
  }, { pause: async () => {} });
  assert.equal(calls, 6); assert.equal(peak, 1); assert.equal(result.total, 1);
  assert.equal(result.searches[1].error, 'Meta unavailable'); assert.ok(result.partial);
  assert.equal(result.ads[0].discoveryCategories.length, 5);
  assert.deepEqual(result.externalLinks, ['https://example.org/']);
});
test('discovery stops at ad budget, elapsed budget and cancellation', async () => {
  let calls = 0;
  const search = async () => { calls++; return { ads: Array.from({ length: 150 }, (_, i) => ({ id: String(i + 1) })) }; };
  assert.equal((await discover({ country: 'AR', language: 'all' }, search)).ads.length, LIMITS.ads);
  assert.equal(calls, 6);
  let clock = 0;
  const timed = await discover({ country: 'AR', language: 'all' }, async () => { clock = LIMITS.discoveryMs; return { ads: [] }; }, { now: () => clock, pause: async () => {} });
  assert.equal(timed.searches.length, 1); assert.ok(timed.partial);
  const canceled = await discover({ country: 'AR', language: 'all' }, search, { signal: AbortSignal.abort() });
  assert.equal(canceled.searches.length, 0);
});
