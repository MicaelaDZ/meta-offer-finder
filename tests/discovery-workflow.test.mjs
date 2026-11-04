import test from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoveryWorkflow } from '../src/lib/discovery-workflow.mjs';
import { partitionOffers, associatedLanding } from '../src/lib/result-presentation.mjs';

const ad = { id: 'one', copy: 'Comprar ebook Recetas Veganas por $19', advertiser: 'Example' };
function harness(overrides = {}) {
  const calls = [], updates = [], progress = [], warnings = [];
  const responses = {
    '/api/group': { groups: [{ groupId: 'g', ads: [{ id: ad.id }] }] },
    '/api/analyze': { results: [{ id: ad.id, categoria: 'ebook' }] },
    '/api/verify-pages': { results: [{ url: 'https://example.org/product', status: 'pendiente' }] },
    '/api/match-pages': { matches: [] },
    '/api/rank': { ranking: [{ groupId: 'g', status: 'candidato_por_anuncio', score: 2 }] },
  };
  return { calls, updates, progress, warnings, options: {
    post: async (path, body) => { calls.push({ path, body }); if (Object.hasOwn(overrides, path)) return overrides[path](body); return responses[path]; },
    onUpdate: value => updates.push(value), onProgress: value => progress.push(value), onWarning: (message, detail) => warnings.push({ message, detail }),
  } };
}
test('one workflow invokes every stage once, deduplicates and prepares ranking', async () => {
  const run = harness();
  const result = await runDiscoveryWorkflow({ ads: [ad, ad], externalLinks: ['https://example.org/product'] }, run.options);
  assert.deepEqual(run.calls.map(call => call.path), ['/api/group', '/api/analyze', '/api/verify-pages', '/api/match-pages', '/api/rank']);
  assert.equal(run.calls[0].body.ads.length, 1);
  assert.equal(result.ads.length, 1);
  assert.equal(result.ranking.length, 1);
  assert.equal(run.warnings.length, 0);
  assert.deepEqual([...new Set(run.progress)], ['Analizando ofertas', 'Verificando páginas', 'Preparando resultados']);
});
for (const failure of ['unavailable', 'timeout', 'item-error']) test(`Ollama ${failure} does not block verification, association or ranking`, async () => {
  const run = harness({ '/api/analyze': async () => {
    if (failure === 'item-error') return { results: [{ id: ad.id, error: 'model unavailable' }] };
    throw new Error(failure);
  } });
  const result = await runDiscoveryWorkflow({ ads: [ad], externalLinks: ['https://example.org/product'] }, run.options);
  assert.equal(result.ranking.length, 1);
  assert.equal(run.calls.at(-1).path, '/api/rank');
  assert.match(run.warnings[0].message, /IA no estuvo disponible/);
  assert.equal(Object.values(result.analyses).filter(item => !item.error).length, 0);
});
test('partial landing errors remain visible while baseline ranking still runs', async () => {
  const run = harness({ '/api/verify-pages': async () => ({ results: [{ url: 'https://example.org/product', status: 'error' }] }) });
  const result = await runDiscoveryWorkflow({ ads: [ad], externalLinks: Array.from({ length: 12 }, (_, i) => `https://example.org/product/${i}`) }, run.options);
  assert.equal(run.calls.find(call => call.path === '/api/verify-pages').body.urls.length, 5);
  assert.equal(result.pages[0].status, 'error');
  assert.equal(result.ranking.length, 1);
  assert.match(run.warnings[0].message, /páginas no pudieron verificarse/);
});
test('no candidate URLs skips browser work without blocking ad-based ranking', async () => {
  const run = harness();
  const result = await runDiscoveryWorkflow({ ads: [ad], externalLinks: [] }, run.options);
  assert.equal(result.ranking.length, 1);
  assert.equal(run.calls.some(call => call.path === '/api/verify-pages'), false);
  assert.match(run.warnings[0].message, /pendientes/);
});
test('empty search and grouping failure have explicit outcomes, without fabricated ranking', async () => {
  const empty = harness();
  assert.equal((await runDiscoveryWorkflow({ ads: [] }, empty.options)).ranking.length, 0);
  assert.equal(empty.calls.length, 0);
  const run = harness({ '/api/group': async () => { throw new Error('group failed'); } });
  const result = await runDiscoveryWorkflow({ ads: [ad] }, run.options);
  assert.equal(result.ads.length, 1);
  assert.equal(result.ranking.length, 0);
  assert.match(run.warnings[0].message, /agrupar/);
});
test('cancel stops subsequent stages and preserves received stage updates', async () => {
  const controller = new AbortController();
  const run = harness();
  run.options.signal = controller.signal;
  run.options.onUpdate = value => { run.updates.push(value); if (value.groups) controller.abort(); };
  await assert.rejects(runDiscoveryWorkflow({ ads: [ad] }, run.options), /cancelada/);
  assert.deepEqual(run.calls.map(call => call.path), ['/api/group']);
  assert.equal(run.updates.find(update => update.ads).ads.length, 1);
  assert.equal(run.updates.find(update => update.groups).groups.length, 1);
});
test('presentation keeps paid, pending and discarded distinct, exposing only associated landing links', () => {
  const rows = [{ status: 'candidato_digital_pago', url: 'https://example.org/product' }, { status: 'candidato_por_anuncio', url: 'https://example.org/unverified' }, { status: 'sin_evidencia_suficiente' }, { status: 'posible_producto_fisico' }, { status: 'posible_servicio' }, { status: 'posible_digital_gratuito' }];
  const sections = partitionOffers(rows);
  assert.equal(sections.paid.length, 1); assert.equal(sections.pending.length, 2); assert.equal(sections.discarded.length, 3);
  assert.equal(associatedLanding(rows[1]), null);
  assert.equal(associatedLanding({ ...rows[0], url: 'javascript:alert(1)' }), null);
  assert.equal(associatedLanding(rows[0]), rows[0].url);
});
