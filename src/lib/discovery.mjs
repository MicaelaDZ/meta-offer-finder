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
export function uniqueAds(ads) {
  const unique = new Map();
  for (const ad of ads) {
    if (!ad?.id) continue;
    const id = String(ad.id);
    const previous = unique.get(id);
    unique.set(id, previous ? { ...previous, discoveryCategories: [...new Set([...(previous.discoveryCategories || []), ...(ad.discoveryCategories || [])])] } : { ...ad, id });
  }
  return [...unique.values()];
}
export async function discover(options, search, { signal, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const started = now();
  let ads = [];
  const externalLinks = new Set();
  const searches = [];
  for (const query of discoveryQueries(options)) {
    if (signal?.aborted || now() - started >= LIMITS.discoveryMs || ads.length >= LIMITS.ads) break;
    try {
      const result = await search({ ...options, ...query, timeoutMs: Math.min(LIMITS.searchMs, LIMITS.discoveryMs - (now() - started)), signal });
      ads = uniqueAds([...ads, ...result.ads.map(ad => ({ ...ad, discoveryCategories: [query.category] }))]).slice(0, LIMITS.ads);
      for (const url of result.externalLinks || []) if (externalLinks.size < 25) externalLinks.add(url);
      searches.push({ ...query, total: result.ads.length, warnings: result.warnings || [] });
    } catch (error) {
      searches.push({ ...query, total: 0, error: error.message });
    }
    if (searches.length < LIMITS.searches && ads.length < LIMITS.ads && !signal?.aborted) await pause(750);
  }
  return { ...options, ads, total: ads.length, externalLinks: [...externalLinks], searches, partial: searches.length < LIMITS.searches || searches.some(s => s.error || s.warnings.length), limits: LIMITS };
}
