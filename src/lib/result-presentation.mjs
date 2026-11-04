export const CATEGORY_LABELS = { ebook: 'Ebook', curso: 'Curso', plantilla: 'Plantilla', imprimible: 'Imprimible', pack: 'Pack digital', software: 'Software' };
const DISCARDED = new Set(['posible_producto_fisico', 'posible_servicio', 'posible_digital_gratuito']);
export function partitionOffers(offers) {
  return {
    paid: offers.filter(offer => offer.status === 'candidato_digital_pago'),
    pending: offers.filter(offer => !DISCARDED.has(offer.status) && offer.status !== 'candidato_digital_pago'),
    discarded: offers.filter(offer => DISCARDED.has(offer.status)),
  };
}
export function associatedLanding(offer) {
  if (offer.status !== 'candidato_digital_pago' || !offer.url) return null;
  try { const url = new URL(offer.url); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
