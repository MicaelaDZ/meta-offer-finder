import { searchMetaAds } from '../src/lib/meta-search.mjs';
import { discoveryQueries, searchOptions } from '../src/lib/discovery.mjs';
import { failureDiagnostic } from '../src/lib/scrape-diagnostics.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const options = searchOptions({ country: option('--country', 'AR'), language: option('--language', 'es') });
const category = option('--category', 'ebooks');
const query = discoveryQueries(options).find(query => query.category === category);
if (!query) throw new Error('Categoría no admitida: ebooks, cursos, plantillas, imprimibles, packs o software.');
try {
  const result = await searchMetaAds({ ...options, ...query, mode: 'automatic' });
  console.log(JSON.stringify({ category, ads: result.total, urls: result.urlDiagnostics, diagnostics: result.diagnostics }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ category, diagnostic: error.diagnostic || failureDiagnostic(error, 'search') }, null, 2));
  process.exitCode = 1;
}
