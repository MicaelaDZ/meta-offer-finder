import { normalize } from './discovery.mjs';

const DIGITAL = /\b(e-?book|pdf|recetario digital|curso(?: (?:online|grabado))?|online course|video course|plantillas? digital(?:es)?|digital templates?|templates? digitais|imprimibles?|printable|planner digital|pack digital|digital bundle|kit digital|software|descarga digital|digital download)\b/;
const MONEY = /(?:ARS|USD|EUR|BRL|US\$|R\$|\$|€)\s*\d(?:[\d.,]*\d)?/gi;
export function classifyOffer(value, { incomplete = false, evidenceConflict = false } = {}) {
  const original = String(value ?? '');
  const text = normalize(original);
  const kinds = [
    ['ebook', /\b(e-?book|recetario digital)\b/], ['curso', /\b(curso(?: (?:online|grabado))?|online course|video course)\b/],
    ['plantilla', /\b(plantillas? digital(?:es)?|digital templates?|templates? digitais)\b/], ['imprimible', /\b(imprimibles?|printable|planner digital)\b/],
    ['pack', /\b(pack digital|digital bundle|kit digital)\b/], ['software', /\bsoftware\b/],
  ].filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
  const productType = kinds.length === 1 ? kinds[0] : kinds.length === 0 && /\bpdf\b/.test(text) ? 'ebook' : null;
  const hasDigitalSignal = DIGITAL.test(text);
  const hasPurchaseSignal = /\b(comprar?|compra|compralo|compre|buy|purchase|checkout|carrito|cart|pago unico|un solo pago|one.time payment|pagamento|precio|price|preco|suscripcion|subscription|assinatura)\b/.test(text);
  const hasPhysicalSignal = /\b(camisetas?|remeras?|zapatos?|tapa dura|tapa blanda|libro (?:impreso|fisico)|envios?|pago contra entrega|paga al recibir|shipping|physical (?:book|product)|produto fisico|frete|bandejas? de silicona)\b/.test(text);
  const hasServiceSignal = /\b(servicios?|consultori[ao]|asesoria|sesiones? individuales?|diseno (?:web|de software)|done for you|consulting|coaching|mentoria)\b/.test(text);
  const hasFreeDigitalSignal = /\b(gratis|gratuit[oa]s?|free|sin (?:costo|coste|cargo)|sin pagar|de regalo|regalamos|sem custo|sem pagar|brinde)\b/.test(text);
  const historicalPrice = /\b(antes|anterior(?:es)?|habitual|tachad[oa]|original|precio de lista|regular price|list price|previous|formerly|was|de\s+[$€]|valor anterior)\b/.test(text) || /<(?:del|s|strike)\b|~~/.test(original);
  const multipleOffers = /\b(otro producto|otra oferta|tambien|ademas|incluye|incluido|bundle with|another product|other product|por separado|vendido por|a partir de|desde\s*[$€])\b/.test(text);
  const priceMatches = [...original.matchAll(MONEY)];
  const positive = price => Number(price.replace(/[^\d]/g, '')) > 0;
  // Require exactly one price, explicitly next to the named digital offer, in
  // the same clause. A price elsewhere on the page is never borrowed.
  const linked = priceMatches.length === 1 && positive(priceMatches[0][0]) && (() => {
    const before = normalize(original.slice(0, priceMatches[0].index));
    const clause = before.split(/[\n;!?]|\.(?!\d)/).at(-1);
    const match = DIGITAL.exec(clause);
    if (!match) return false;
    const between = clause.slice(match.index + match[0].length).trim();
    return (between === "" || /(?:por|for|precio|price|preco|:)\s*$/.test(between) || /^(?:pdf|digital)$/.test(between)) && between.length <= 100 && between.split(/\s+/).filter(Boolean).length <= 10 &&
      !/\b(libro|camiseta|producto|servicio|otro|otra|pack fisico|valorado|valued|worth|compra|comprar|buy|purchase|junto|incluid[oa])\b/.test(between);
  })();
  const conflict = Boolean(evidenceConflict || kinds.length > 1 || historicalPrice || multipleOffers ||
    (hasDigitalSignal && (hasPhysicalSignal || hasServiceSignal)) ||
    (hasFreeDigitalSignal && hasPurchaseSignal && priceMatches.some(m => positive(m[0]))));
  const hasPaymentSignal = Boolean(linked && hasPurchaseSignal && !conflict && !hasFreeDigitalSignal && !incomplete);
  const pricesFound = hasPaymentSignal ? [priceMatches[0][0]] : [];
  const hasDeliverySignal = /\b(descarga inmediata|acceso inmediato|entrega automatica|instant download|instant access|acesso imediato|download imediato)\b/.test(text);
  let classification = 'sin_evidencia_suficiente';
  if (!conflict && !incomplete) {
    if (hasPhysicalSignal) classification = 'posible_producto_fisico';
    else if (hasServiceSignal) classification = 'posible_servicio';
    else if (hasFreeDigitalSignal && hasDigitalSignal) classification = 'posible_digital_gratuito';
    else if (hasDigitalSignal && hasPaymentSignal) classification = 'candidato_digital_pago';
  }
  return { classification, productType, conflict, incomplete, historicalPrice, multipleOffers, hasDigitalSignal, hasPurchaseSignal, hasPaymentSignal, hasPhysicalSignal, hasServiceSignal, hasFreeDigitalSignal, hasDeliverySignal, pricesFound, isCandidate: classification === 'candidato_digital_pago' };
}
export function classifyAd(ad) {
  return classifyOffer(ad?.copy, { incomplete: Boolean(ad?.copyTruncated || ad?.cardScopeUnresolved), evidenceConflict: Boolean(ad?.evidenceConflict) });
}
