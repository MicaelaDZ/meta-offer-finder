import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { extractPageEvidence } from '../src/lib/page-evidence.mjs';
import { classifyOffer } from '../src/lib/evidence.mjs';

const executablePath = process.env.TEST_CHROMIUM_EXECUTABLE_PATH;
const launch = () => chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
test('DOM extraction excludes semantic and CSS-struck historical prices; only current price counts', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    for (const markup of ['<s>$49</s>', '<del>$49</del>', '<span style="text-decoration:line-through">$49</span>', '<span style="display:none">$49</span>']) {
      await page.setContent(`<h1>Recetas Veganas</h1><p>Comprar ebook ${markup}</p>`);
      const obsolete = await page.evaluate(extractPageEvidence);
      assert.equal(classifyOffer(obsolete.evidenceText).isCandidate, false);
      assert.doesNotMatch(obsolete.evidenceText, /49/);
      await page.setContent(`<h1>Recetas Veganas</h1><p>Comprar ebook ${markup} $19</p>`);
      const current = await page.evaluate(extractPageEvidence);
      assert.equal(current.productTitle, 'Recetas Veganas');
      assert.equal(classifyOffer(current.evidenceText).isCandidate, true);
      assert.deepEqual(classifyOffer(current.evidenceText).pricesFound, ['$19']);
    }
  } finally { await browser.close(); }
});

test('real UI continues manual verification through 12 URLs and keeps manual controls and notices', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const urls = Array.from({ length: 12 }, (_, i) => `https://shop.example.com/product?id=${i}`);
    const batches = [];
    // Synthetic API fixtures are confined to this isolated browser test.
    await page.route('**/api/search', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.keyword, 'recetas'); assert.equal(body.country, 'MX'); assert.equal(body.language, 'es');
      await route.fulfill({ json: { ads: [{ id: 'test-only', advertiser: 'Fixture', copy: 'Comprar ebook Recetas Veganas por $19' }], externalLinks: urls } });
    });
    await page.route('**/api/verify-pages', async route => {
      const batch = route.request().postDataJSON().urls;
      batches.push(batch);
      await route.fulfill({ json: { results: batch.map(url => ({ url, status: 'error', reason: 'Synthetic inaccessible fixture' })) } });
    });
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => Object.keys(document.querySelector('select') || {}).some(key => key.startsWith('__reactProps')));
    await page.getByText('Opciones avanzadas', { exact: true }).click();
    await page.getByLabel('País', { exact: true }).selectOption('MX');
    await page.getByLabel('Idioma del anuncio', { exact: true }).selectOption('es');
    await page.getByLabel('Palabra clave', { exact: true }).fill('recetas');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByText('Anuncios recuperados: 1').waitFor();
    await page.getByRole('button', { name: 'Verificar páginas de venta (5)', exact: true }).click();
    await page.getByText('Páginas procesadas: 5/12.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Verificar siguientes páginas (5)', exact: true }).click();
    await page.getByText('Páginas procesadas: 10/12.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Verificar siguientes páginas (2)', exact: true }).click();
    await page.getByText('Páginas procesadas: 12/12.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Reiniciar verificación (5)', exact: true }).waitFor();
    assert.deepEqual(batches.flat(), urls);
    await page.getByText('Sólo se conservan las respuestas ya recibidas;', { exact: false }).waitFor();
    await page.getByText('Puede fallar en textos breves o mixtos.', { exact: false }).waitFor();
  } finally { await browser.close(); }
});

for (const aiAvailable of [true, false]) test(`one primary action completes all stages with AI ${aiAvailable ? 'available' : 'unavailable'}`, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const calls = [];
    let releaseDiscovery;
    let discoveryStarted;
    const gate = new Promise(resolve => { releaseDiscovery = resolve; });
    const started = new Promise(resolve => { discoveryStarted = resolve; });
    const ads = [
      { id: 'paid', advertiser: 'Editorial de prueba', copy: 'Comprar ebook Recetas Veganas por $19 https://shop.example.com/product?id=vegan', date: '1 ene 2026' },
      { id: 'pending', advertiser: 'Escuela de prueba', copy: 'Comprar curso online Huerta Urbana por $40 https://shop.example.com/product?id=garden', date: '1 ene 2026' },
      { id: 'shirt', advertiser: 'Tienda de prueba', copy: 'Comprar camiseta $30 https://shop.example.com/product?id=shirt', date: '1 ene 2026' },
    ];
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/')) calls.push(path); });
    await page.route('**/api/discover', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.country, 'MX'); assert.equal(body.language, 'es'); assert.equal(Object.hasOwn(body, 'keyword'), false);
      discoveryStarted(); await gate;
      await route.fulfill({ json: { ads: [...ads, ads[0]], externalLinks: ['https://shop.example.com/product?id=vegan'], searches: Array.from({ length: 6 }, (_, i) => ({ category: `test-category-${i}`, total: 1, warnings: [] })) } });
    });
    await page.route('**/api/analyze', async route => {
      await route.fulfill(aiAvailable ? { json: { results: ads.map(ad => ({ id: ad.id, categoria: 'desconocido' })) } } : { status: 503, json: { error: 'Synthetic Ollama timeout' } });
    });
    await page.route('**/api/verify-pages', async route => {
      await route.fulfill({ json: { results: [{ url: 'https://shop.example.com/product?id=vegan', finalUrl: 'https://shop.example.com/product?id=vegan', httpStatus: 200, productTitle: 'Recetas Veganas', title: 'Editorial', evidenceText: 'Comprar ebook Recetas Veganas por $19. Acceso inmediato', status: 'candidato_digital_pago' }] } });
    });
    // Search/model/landing responses are synthetic; group, association and rank
    // requests use the running application's real APIs and conservative rules.
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => Object.keys(document.querySelector('select') || {}).some(key => key.startsWith('__reactProps')));
    await page.getByRole('heading', { name: 'Descubridor de productos digitales', exact: true }).waitFor();
    assert.equal(await page.locator('select:visible').count(), 2);
    assert.equal(await page.getByLabel('Palabra clave', { exact: true }).isVisible(), false);
    assert.equal(await page.getByRole('main').getByRole('button').count(), 1);
    await page.getByLabel('País', { exact: true }).selectOption('MX');
    await page.getByLabel('Idioma del anuncio', { exact: true }).selectOption('es');
    const button = page.getByRole('button', { name: 'Descubrir oportunidades', exact: true });
    await button.click(); await started;
    assert.equal(await button.isDisabled(), true);
    await page.getByRole('status').filter({ hasText: 'Buscando anuncios' }).waitFor();
    // Even a second programmatic submit before a render cannot create a run.
    await page.getByRole('form', { name: 'Descubrimiento automático' }).evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    releaseDiscovery();
    await page.getByRole('heading', { name: 'Candidatos digitales pagos (1)', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Pendientes de verificación (1)', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('form[aria-label="Descubrimiento automático"] button').disabled);
    assert.deepEqual(calls, ['/api/discover', '/api/group', '/api/analyze', '/api/verify-pages', '/api/match-pages', '/api/rank']);
    assert.equal(await page.locator('article:visible').count(), 2);
    const paid = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recetas Veganas', exact: true }) });
    await paid.getByText('Ebook', { exact: true }).waitFor();
    await paid.getByText('Editorial de prueba', { exact: true }).waitFor();
    await paid.getByText('Anuncios observados', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Ver landing asociada', exact: false }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Generar ranking', exact: true }).isVisible(), false);
    if (!aiAvailable) await page.getByRole('complementary', { name: 'Advertencias' }).getByText('El análisis con IA no estuvo disponible', { exact: false }).waitFor();
    await page.getByText('Opciones avanzadas', { exact: true }).click();
    await page.getByRole('heading', { name: 'Productos descartados (1)', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Generar ranking', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Analizar con IA', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Analizar antigüedad y anuncios', exact: true }).isVisible(), true);
  } finally { await browser.close(); }
});

test('failed discovery shows a clear error without fake results and permits retry', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.route('**/api/discover', route => route.fulfill({ status: 503, json: { error: 'Synthetic Meta access failure', searches: [{ category: 'ebooks', total: 0, error: 'Synthetic failure' }] } }));
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => Object.keys(document.querySelector('select') || {}).some(key => key.startsWith('__reactProps')));
    await page.getByRole('button', { name: 'Descubrir oportunidades', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No se pudo completar la búsqueda' }).waitFor();
    assert.equal(await page.locator('article:visible').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Descubrir oportunidades', exact: true }).isEnabled(), true);
    await page.getByText('Opciones avanzadas', { exact: true }).click();
    await page.getByText('Synthetic Meta access failure', { exact: true }).waitFor();
  } finally { await browser.close(); }
});

test('cancel before the discovery response shows the retention limit and stops later stages', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const calls = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let notify;
    const started = new Promise(resolve => { notify = resolve; });
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/')) calls.push(path); });
    await page.route('**/api/discover', async route => { notify(); await gate; await route.abort().catch(() => {}); });
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => Object.keys(document.querySelector('select') || {}).some(key => key.startsWith('__reactProps')));
    await page.getByRole('button', { name: 'Descubrir oportunidades', exact: true }).click(); await started;
    await page.getByText('Sólo se conservan las respuestas ya recibidas;', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Exploración cancelada' }).waitFor();
    release();
    assert.deepEqual(calls, ['/api/discover']);
    assert.equal(await page.locator('article:visible').count(), 0);
  } finally { await browser.close(); }
});
