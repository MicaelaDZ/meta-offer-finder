import { classifyAd, classifyOffer } from './evidence.mjs';
import { explicitProductUrls, isProductUrl, productUrl } from './identity.mjs';
import { normalize } from './discovery.mjs';

const COMMON = new Set('comprar compra buy purchase ebook pdf digital curso online course plantilla templates software pack bundle precio price por para con the and your our este esta este producto product acceso inmediato instant access descarga download ahora now oferta offer recetasde'.split(' '));
function productWords(text) {
  return new Set(normalize(String(text).replace(/https?:\/\/\S+/g, '')).match(/[a-z]{3,}/g)?.filter(word => !COMMON.has(word)) || []);
}
export function pageSignals(page) {
  return classifyOffer(page?.evidenceText, { incomplete: !page?.evidenceText || Boolean(page?.textTruncated) });
}
export function verifiedAssociation(ad, page) {
  const adSignals = classifyAd(ad);
  if (!adSignals.hasDigitalSignal || adSignals.conflict || adSignals.incomplete || adSignals.hasPhysicalSignal || adSignals.hasServiceSignal || adSignals.hasFreeDigitalSignal) return false;
  if (!(page.httpStatus >= 200 && page.httpStatus < 400) || !pageSignals(page).isCandidate || adSignals.productType !== pageSignals(page).productType) return false;
  const requested = productUrl(page.url);
  const final = productUrl(page.finalUrl || page.url);
  // Product identity must survive a redirect. Do not accept a cross-product,
  // cross-origin, query-changing or fragment-changing redirect as evidence.
  if (!isProductUrl(requested) || requested !== final || !explicitProductUrls(ad).includes(requested)) return false;
  const titleWords = productWords(page.productTitle || '');
  const adWords = productWords(ad.copy);
  return [...titleWords].filter(word => adWords.has(word)).length >= 2;
}
export function matchPages(ads, pages) {
  return pages.map(page => {
    const matchingAds = ads.filter(ad => verifiedAssociation(ad, page));
    const sameAdvertiser = matchingAds.length > 0 && matchingAds.every(ad => ad.advertiser === matchingAds[0].advertiser);
    return { url: page.finalUrl || page.url, title: page.title || null, status: page.status || 'pendiente',
      advertiser: sameAdvertiser ? matchingAds[0].advertiser : null,
      matchedAdIds: sameAdvertiser ? matchingAds.map(ad => String(ad.id)) : [],
      matchStatus: sameAdvertiser ? 'coincidencia_url_y_producto' : 'sin_asociacion_verificada' };
  });
}
