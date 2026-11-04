import { classifyAd, classifyOffer } from './evidence.mjs';
import { explicitProductUrls, isProductUrl, productUrl } from './identity.mjs';
import { normalize } from './discovery.mjs';

const COMMON = new Set('comprar compra buy purchase ebook pdf digital curso online course plantilla templates software pack bundle precio price por para con the and your our este esta producto product acceso inmediato instant access descarga download ahora now oferta offer'.split(' '));
function productWords(text) {
  return new Set(normalize(String(text).replace(/https?:\/\/\S+/g, '')).match(/[a-z]{3,}/g)?.filter(word => !COMMON.has(word)) || []);
}
export function pageSignals(page) {
  const flags = { incomplete: !page?.evidenceText || Boolean(page?.textTruncated) };
  const signals = classifyOffer(page?.evidenceText, flags);
  const offer = page?.productOffer;
  if (signals.isCandidate || signals.conflict || signals.incomplete || signals.hasPhysicalSignal || signals.hasServiceSignal || signals.hasFreeDigitalSignal) return signals;
  if (offer?.scope !== 'single_product_dom' || offer.productTitle !== page.productTitle || !offer.purchaseAction || !signals.hasDigitalSignal) return signals;
  const scoped = classifyOffer(offer.text);
  const prices = offer.text.match(/(?:ARS|USD|EUR|BRL|US\$|R\$|\$|€)\s*\d(?:[\d.,]*\d)?/gi) || [];
  if (!scoped.hasDigitalSignal || scoped.conflict || scoped.hasPhysicalSignal || scoped.hasServiceSignal || scoped.hasFreeDigitalSignal || prices.length !== 1 || prices[0] !== offer.currentPrice || Number(offer.currentPrice.replace(/[^\d]/g, '')) <= 0) return signals;
  return { ...signals, hasPaymentSignal: true, hasPurchaseSignal: true, pricesFound: [offer.currentPrice], classification: 'candidato_digital_pago', isCandidate: true, hasDeliverySignal: scoped.hasDeliverySignal, paymentSource: 'single_product_dom' };
}
function observedRedirect(ad, page, requested, final) {
  if (requested === final) return true;
  const cta = (ad.urlEvidence || []).some(item => String(item.adId) === String(ad.id) && item.scope === 'single_ad_card' && productUrl(item.url) === requested);
  if (!cta || !page.redirectChain?.length) return false;
  let current = requested;
  for (const hop of page.redirectChain) {
    if (productUrl(hop.from) !== current || ![301, 302, 303, 307, 308].includes(hop.status) || !productUrl(hop.to)) return false;
    current = productUrl(hop.to);
  }
  return current === final;
}
export function associationReason(ad, page) {
  const adSignals = classifyAd(ad), signals = pageSignals(page);
  if (!adSignals.hasDigitalSignal || adSignals.conflict || adSignals.incomplete || adSignals.hasPhysicalSignal || adSignals.hasServiceSignal || adSignals.hasFreeDigitalSignal) return 'AD_EVIDENCE_INSUFFICIENT';
  if (!(page.httpStatus >= 200 && page.httpStatus < 400) || page.lifecycle?.accessible === false) return 'PAGE_NOT_ACCESSIBLE';
  const requested = productUrl(page.url), final = productUrl(page.finalUrl || page.url);
  if (!isProductUrl(requested) || !explicitProductUrls(ad).includes(requested)) return 'URL_NOT_ATTRIBUTED_TO_AD';
  if (!observedRedirect(ad, page, requested, final)) return 'REDIRECT_NOT_VERIFIED';
  if (signals.productType && adSignals.productType !== signals.productType) return 'PRODUCT_TYPE_MISMATCH';
  const titleWords = productWords(page.productTitle || ''), adWords = productWords(ad.copy);
  if ([...titleWords].filter(word => adWords.has(word)).length < 2) return 'PRODUCT_NAME_MISMATCH';
  return null;
}
export function verifiedAssociation(ad, page) { return !associationReason(ad, page) && pageSignals(page).isCandidate; }
export function matchPages(ads, pages) {
  return pages.map(page => {
    const matchingAds = ads.filter(ad => !associationReason(ad, page));
    const sameAdvertiser = matchingAds.length > 0 && matchingAds.every(ad => ad.advertiser === matchingAds[0].advertiser);
    return { url: page.finalUrl || page.url, title: page.title || null, status: page.status || 'pendiente',
      advertiser: sameAdvertiser ? matchingAds[0].advertiser : null,
      matchedAdIds: sameAdvertiser ? matchingAds.map(ad => String(ad.id)) : [],
      matchStatus: sameAdvertiser ? 'coincidencia_url_y_producto' : 'sin_asociacion_verificada' };
  });
}
