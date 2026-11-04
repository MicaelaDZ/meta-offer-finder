import test from 'node:test';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3000';
async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
test('live API preserves groups, exact product association and conservative ranking', async () => {
  const ad = { id: '1', advertiser: 'Tienda', copy: 'Comprar ebook Recetas Veganas por $19 https://shop.example.com/product?id=vegan', date: '1 ene 2026' };
  const grouped = await post('/api/group', { ads: [ad, { ...ad, id: '2' }, ad] });
  assert.equal(grouped.status, 200);
  assert.equal(grouped.data.totalAdsReceived, 2);
  assert.equal(grouped.data.totalGroups, 1);
  const groups = grouped.data.groups;
  const baseline = await post('/api/rank', { groups });
  assert.equal(baseline.data.ranking[0].status, 'candidato_por_anuncio');
  const pages = [{ url: 'https://shop.example.com/product?id=vegan', finalUrl: 'https://shop.example.com/product?id=vegan', httpStatus: 200, productTitle: 'Recetas Veganas', evidenceText: 'Comprar ebook Recetas Veganas por $19. Acceso inmediato' }];
  const matches = await post('/api/match-pages', { ads: [ad], pages });
  assert.equal(matches.data.matches[0].matchStatus, 'coincidencia_url_y_producto');
  const promoted = await post('/api/rank', { groups, pages, matches: matches.data.matches });
  assert.equal(promoted.data.ranking[0].status, 'candidato_digital_pago');
  for (const page of [{ ...pages[0], evidenceText: 'Ebook sin costo, precio anterior $19' }, { ...pages[0], httpStatus: 403 }, { ...pages[0], url: 'https://shop.example.com/product?id=shirt' }]) {
    const result = await post('/api/rank', { groups, pages: [page], matches: matches.data.matches });
    assert.deepEqual(result.data, baseline.data);
  }
  const shirt = { ...ad, copy: 'Comprar camiseta $30 en https://shop.example.com/shirt' };
  const shirtGroups = await post('/api/group', { ads: [shirt] });
  const shirtRank = await post('/api/rank', { groups: shirtGroups.data.groups, pages });
  assert.equal(shirtRank.data.ranking[0].status, 'posible_producto_fisico');
  assert.equal(shirtRank.data.ranking[0].score, 0);
  for (const [path, body] of [['/api/search', { keyword: 'ebook', country: 'ZZ' }], ['/api/discover', { country: 'AR', language: 'invalid' }], ['/api/search', { keyword: '' }]]) assert.equal((await post(path, body)).status, 400);
});
