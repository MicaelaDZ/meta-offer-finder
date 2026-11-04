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
    await page.getByLabel('Modo de búsqueda').selectOption('manual');
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
