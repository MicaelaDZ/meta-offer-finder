import { normalize } from './discovery.mjs';

export function classifyOffer(value) {
  const text = normalize(value);
  const hasDigitalSignal = /\b(e-?book|pdf|recetario digital|curso (online|grabado)|online course|video course|plantillas? digitales?|digital templates?|templates? digitais|imprimibles?|printable|planner digital|pack digital|digital bundle|kit digital|software|descarga digital|digital download)\b/.test(text);
  const hasPurchaseSignal = /\b(comprar?|compra|compralo|compre|buy|purchase|checkout|carrito|cart|pago unico|un solo pago|one.time payment|pagamento|precio|price|preco|suscripcion|subscription|assinatura)\b/.test(text);
  const hasPhysicalSignal = /\b(envio a domicilio|pago contra entrega|paga al recibir|shipping|physical book|libro fisico|producto fisico|produto fisico|frete|bandejas? de silicona)\b/.test(text);
  const hasServiceSignal = /\b(consultoria|asesoria personalizada|sesiones individuales|servicio de|done for you|consulting|coaching individual|mentoria individual)\b/.test(text);
  const hasFreeDigitalSignal = /\b(gratis|gratuit[oa]|free|sem custo)\b/.test(text);
  const pricesFound = [...new Set(String(value ?? '').match(/(?:ARS|USD|EUR|BRL|US\$|R\$|\$|€)\s*\d[\d.,]*/gi) || [])].filter(price => Number(price.replace(/[^\d]/g, '')) > 0).slice(0, 10);
  const hasPaymentSignal = hasPurchaseSignal && pricesFound.length > 0;
  const hasDeliverySignal = /\b(descarga inmediata|acceso inmediato|entrega automatica|instant download|instant access|acesso imediato|download imediato)\b/.test(text);
  const conflict = [hasPhysicalSignal, hasServiceSignal, hasFreeDigitalSignal].filter(Boolean).length > 1 || (hasDigitalSignal && (hasPhysicalSignal || hasServiceSignal)) || (hasFreeDigitalSignal && hasPaymentSignal);
  let classification = 'sin_evidencia_suficiente';
  if (!conflict) {
    if (hasPhysicalSignal) classification = 'posible_producto_fisico';
    else if (hasServiceSignal) classification = 'posible_servicio';
    else if (hasFreeDigitalSignal && hasDigitalSignal) classification = 'posible_digital_gratuito';
    else if (hasDigitalSignal && hasPaymentSignal) classification = 'candidato_digital_pago';
  }
  return { classification, conflict, hasDigitalSignal, hasPurchaseSignal, hasPaymentSignal, hasPhysicalSignal, hasServiceSignal, hasFreeDigitalSignal, hasDeliverySignal, pricesFound, isCandidate: classification === 'candidato_digital_pago' };
}
