import { verificationState } from './verification-state.mjs';
import { inferProduct } from './product-inference.mjs';
import { uniqueAds } from "./discovery.mjs";
import { adGroupKey } from "./identity.mjs";
import { classifyAd } from './evidence.mjs';
import { pageSignals, verifiedAssociation } from './association.mjs';

export function evidencePriority(status) {
  return ({ candidato_digital_pago: 3, candidato_por_anuncio: 2, sin_evidencia_suficiente: 1 })[status] || 0;
}
export function sortRanking(ranking, order = 'evidencia') {
  return [...ranking].sort((a, b) => {
    if (order === 'antiguedad') return (b.ageDays || 0) - (a.ageDays || 0);
    if (order === 'anuncios') return (b.adsCount || 0) - (a.adsCount || 0);
    if (order === 'puntaje') return (b.score || 0) - (a.score || 0);
    return evidencePriority(b.status) - evidencePriority(a.status) || (b.score || 0) - (a.score || 0);
  });
}
// Only duplicate records of the same group are removed. A shared URL, title or
// advertiser does not establish that two groups are the same product.
export function deduplicateRanking(ranking) {
  return [...new Map(ranking.map((offer, index) => [offer.groupId || `row:${index}`, offer])).values()];
}
function ageScore(days) {
  if (!Number.isFinite(days) || days < 0) return 0;
  return days >= 180 ? 25 : days >= 90 ? 20 : days >= 60 ? 15 : days >= 30 ? 10 : days >= 14 ? 5 : 0;
}
function countScore(count) {
  return count >= 10 ? 10 : count >= 5 ? 8 : count >= 3 ? 6 : count >= 2 ? 4 : count === 1 ? 2 : 0;
}
export function rankGroups(groups, pages = []) {
  return sortRanking(groups.map(group => {
    const ads = uniqueAds(group.ads || []);
    const representative = ads[0] || { copy: group.exampleCopy };
    const adSignals = classifyAd(representative);
    const mixed = new Set(ads.map(adGroupKey)).size > 1;
    if (mixed) Object.assign(adSignals, { classification: 'sin_evidencia_suficiente', conflict: true, isCandidate: false });
    // Recompute association; never trust client-submitted match flags or a
    // page's claimed status. Every ad in a group must describe this product.
    const page = pages.find(candidate => !mixed && ads.length > 0 && ads.every(ad => verifiedAssociation(ad, candidate)));
    const signals = page ? pageSignals(page) : null;
    const status = page ? 'candidato_digital_pago' : adSignals.isCandidate ? 'candidato_por_anuncio' : adSignals.classification;
    const canScore = status === 'candidato_digital_pago' || status === 'candidato_por_anuncio';
    const breakdown = { digitalPurchase: page ? 30 : 0, delivery: page && signals.hasDeliverySignal ? 25 : 0,
      age: canScore ? ageScore(group.ageDays) : 0, ads: canScore ? countScore(ads.length) : 0, association: page ? 10 : 0 };
    return { groupId: group.groupId, advertiser: group.advertiser, product: page?.productTitle || null,
      url: page?.finalUrl || page?.url || null, status, score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      adSignals, inferredProductName: inferProduct(representative).probableName, nameInferred: !page && inferProduct(representative).nameInferred, category: inferProduct(representative).category, verification: verificationState(representative, pages), urlDiagnostics: representative.urlDiagnostics || null, adsCount: ads.length, ageDays: group.ageDays, oldestAdDate: group.oldestAdDate,
      hasDigitalSignal: Boolean(signals?.hasDigitalSignal), hasPurchaseSignal: Boolean(signals?.hasPaymentSignal),
      hasDeliverySignal: Boolean(signals?.hasDeliverySignal), pricesFound: signals?.pricesFound || [], scoreBreakdown: breakdown };
  }));
}
