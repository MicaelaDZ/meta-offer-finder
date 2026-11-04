import { classifyAd } from './evidence.mjs';
import { adUrls } from './url-extraction.mjs';
import { inferProduct } from './product-inference.mjs';
// Preserve product selectors, path case, query parameters and fragments.
export function productUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function explicitProductUrls(ad) {
  return adUrls(ad);
}
export function isProductUrl(value) {
  const canonical = productUrl(value);
  if (!canonical) return false;
  const url = new URL(canonical);
  return url.pathname !== '/' || Boolean(url.search || url.hash);
}
export function adGroupKey(ad) {
  const urls = explicitProductUrls(ad).filter(isProductUrl);
  // Unknown product identity is not permission to combine ads.
  if (!ad.copy || ad.copyTruncated || ad.cardScopeUnresolved || ad.evidenceConflict || !urls.length) return `ad:${ad.id}`;
  const inferred = inferProduct(ad);
  // Different creatives can describe the same product only with an explicit,
  // single product destination, the same distinctive name and matching prices.
  const prices = ad.copy.match(/(?:ARS|USD|EUR|BRL|US\$|R\$|\$|€)\s*\d(?:[\d.,]*\d)?/gi) || [];
  if (urls.length === 1 && prices.length <= 1 && !classifyAd(ad).conflict && !classifyAd(ad).hasFreeDigitalSignal && inferred.probableName && inferred.category) return JSON.stringify(['product', String(ad.advertiser || '').trim().toLowerCase(), urls[0], inferred.category, inferred.probableName.toLowerCase(), prices]);
  return JSON.stringify([String(ad.advertiser || '').trim().toLowerCase(), ad.copy.trim().replace(/\s+/g, ' '), urls, productUrl(ad.destinationUrl)]);
}
