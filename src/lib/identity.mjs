// Preserve product selectors, path case, query parameters and fragments.
export function productUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function explicitProductUrls(ad) {
  return [...new Set((String(ad?.copy || '').match(/https?:\/\/[^\s<>]+/g) || [])
    .map(value => productUrl(value.replace(/[),.;]+$/, ''))).filter(Boolean))];
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
  if (!ad.copy || ad.copyTruncated || ad.evidenceConflict || !urls.length) return `ad:${ad.id}`;
  return JSON.stringify([String(ad.advertiser || '').trim().toLowerCase(), ad.copy.trim().replace(/\s+/g, ' '), urls, productUrl(ad.destinationUrl)]);
}
