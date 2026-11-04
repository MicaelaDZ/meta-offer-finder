import { adUrls, urlSummary } from './url-extraction.mjs';
import { failureDiagnostic, stopsMetaSearch } from './scrape-diagnostics.mjs';
export const COUNTRIES = { AR: 'Argentina', MX: 'México', ES: 'España', CO: 'Colombia', CL: 'Chile', PE: 'Perú', UY: 'Uruguay', BR: 'Brasil', US: 'Estados Unidos', GB: 'Reino Unido' };
export const LANGUAGES = { all: 'Todos', es: 'Español', en: 'Inglés', pt: 'Portugués' };
export const LIMITS = { searches: 6, ads: 100, searchMs: 18000, discoveryMs: 120000, pages: 5, analyses: 5 };
const CATALOG = [
  ['ebooks', 'ebook', 'ebook', 'ebook'],
  ['cursos', 'curso online', 'online course', 'curso online'],
  ['plantillas', 'plantillas digitales', 'digital templates', 'templates digitais'],
  ['imprimibles', 'imprimibles', 'printable planner', 'planner digital'],
  ['packs', 'pack digital', 'digital bundle', 'kit digital'],
  ['software', 'software suscripción', 'software subscription', 'software assinatura'],
];
export function searchOptions(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Se esperaba una configuración de búsqueda.");
  const country = body.country ?? 'AR';
  const language = body.language ?? 'all';
  if (!Object.hasOwn(COUNTRIES, country) || !Object.hasOwn(LANGUAGES, language)) {
    throw new Error('País o idioma no admitido.');
  }
  return { country, language };
}
export function discoveryQueries({ country, language }) {
  const selected = language === 'all' ? (country === 'BR' ? 'pt' : ['US', 'GB'].includes(country) ? 'en' : 'es') : language;
  const index = { es: 1, en: 2, pt: 3 }[selected];
  return CATALOG.map(row => ({ category: row[0], keyword: row[index] }));
}
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Conservative text-only estimate. Meta's interface locale is not the ad language.
export function detectLanguage(text) {
  const tokens = new Set(normalize(text).match(/[a-z]+/g) || []);
  const words = {
    es: 'el los las una para con del tus aprende compra descarga ahora nuestro recibis recibiras pago curso',
    en: 'the your with for this and learn buy download now our you get lifetime course',
    pt: 'voce sua seu com para uma nao aprenda compre baixe agora nosso receba pagamento curso',
  };
  const scores = Object.entries(words).map(([language, list]) => ({ language, score: list.split(' ').filter(word => tokens.has(word)).length })).sort((a, b) => b.score - a.score);
  return scores[0].score >= 3 && scores[0].score - scores[1].score >= 2 ? scores[0].language : 'unknown';
}
function observation(ad) {
  const { observations, discoveryCategories, ...data } = ad;
  void observations; void discoveryCategories;
  return data;
}
function mergeAd(previous, incoming) {
  const versions = [...(previous.observations || [observation(previous)]), ...(incoming.observations || [observation(incoming)])];
  const observations = [...new Map(versions.map(item => [JSON.stringify(item), item])).values()];
  const credible = observations.some(item => !item.cardScopeUnresolved) ? observations.filter(item => !item.cardScopeUnresolved) : observations;
  const ranked = [...credible].sort((a, b) =>
    Number(Boolean(a.copyTruncated)) - Number(Boolean(b.copyTruncated)) ||
    String(b.copy || '').length - String(a.copy || '').length ||
    Object.values(b).filter(Boolean).length - Object.values(a).filter(Boolean).length);
  const merged = { ...ranked[0] };
  for (const version of ranked) for (const [key, value] of Object.entries(version)) {
    if (['cardScopeUnresolved', 'copyTruncated', 'evidenceConflict'].includes(key)) continue;
    if ((merged[key] === null || merged[key] === undefined || merged[key] === '') && value !== null && value !== undefined) merged[key] = value;
  }
  const copies = [...new Set(credible.map(item => item.copy).filter(Boolean))];
  const longest = copies.reduce((best, copy) => copy.length > best.length ? copy : best, '');
  const advertisers = new Set(credible.map(item => item.advertiser?.trim().toLowerCase()).filter(Boolean));
  const urlEvidence = [...new Map(credible.flatMap(item => item.urlEvidence || []).map(item => [JSON.stringify(item), item])).values()];
  return { ...merged, id: String(incoming.id), observations, urlEvidence,
    ...(urlEvidence.length ? { urlDiagnostics: { ...(merged.urlDiagnostics || {}), status: 'url_extracted', extracted: new Set(urlEvidence.map(item => item.url)).size } } : {}),
    evidenceConflict: credible.some(item => item.evidenceConflict) || copies.some(copy => !longest.includes(copy)) || advertisers.size > 1,
    discoveryCategories: [...new Set([...(previous.discoveryCategories || []), ...(incoming.discoveryCategories || [])])] };
}
export function uniqueAds(ads) {
  const unique = new Map();
  for (const ad of ads) {
    if (!ad?.id) continue;
    const id = String(ad.id);
    unique.set(id, unique.has(id) ? mergeAd(unique.get(id), ad) : { ...ad, id });
  }
  return [...unique.values()];
}
export function categoryQuota(index) {
  return Math.floor(LIMITS.ads / LIMITS.searches) + Number(index < LIMITS.ads % LIMITS.searches);
}
export async function discover(options, search, { signal, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const started = now();
  let ads = [];
  const externalLinks = new Set();
  const searches = [];
  const queries = discoveryQueries(options);
  let sourceDiagnostic;
  for (const [index, query] of queries.entries()) {
    if (signal?.aborted || now() - started >= LIMITS.discoveryMs) break;
    const quota = categoryQuota(index);
    const remainingCategories = queries.length - index;
    const timeoutMs = Math.max(1, Math.min(LIMITS.searchMs, Math.floor((LIMITS.discoveryMs - (now() - started) - 750 * (remainingCategories - 1)) / remainingCategories)));
    try {
      const result = await search({ ...options, ...query, mode: 'automatic', timeoutMs, maxAds: LIMITS.ads, signal });
      const existingIds = new Set(ads.map(ad => ad.id));
      const candidates = uniqueAds(result.ads.map(ad => ({ ...ad, discoveryCategories: [query.category] })));
      const repeated = candidates.filter(ad => existingIds.has(ad.id));
      const selected = candidates.filter(ad => !existingIds.has(ad.id)).slice(0, quota);
      ads = uniqueAds([...ads, ...repeated, ...selected]);
      for (const url of (result.externalLinks || []).slice(0, 100)) { if (externalLinks.size < 100) externalLinks.add(url); }
      searches.push({ ...query, total: result.ads.length, retained: selected.length, quota, diagnostics: result.diagnostics || [], warnings: result.warnings || [] });
    } catch (error) {
      const detail = error.diagnostic || failureDiagnostic(error, "search");
      searches.push({ ...query, total: 0, retained: 0, quota, diagnostic: detail, error: error.message });
      if (stopsMetaSearch(detail)) {
        sourceDiagnostic = detail;
        break;
      }
    }
    if (index < queries.length - 1 && !signal?.aborted) await pause(750);
  }
  return { ...options, ads, total: ads.length, externalLinks: [...new Set([...ads.flatMap(adUrls), ...externalLinks])].slice(0, 100), urlDiagnostics: urlSummary(ads), searches, ...(sourceDiagnostic ? { sourceDiagnostic } : {}), partial: searches.length < queries.length || searches.some(s => s.error || s.warnings.length), limits: LIMITS };
}
