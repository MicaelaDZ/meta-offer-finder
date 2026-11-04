import { LIMITS } from './discovery.mjs';
export function verificationBatch(urls, cursor = 0) {
  const start = cursor >= urls.length ? 0 : cursor;
  const batch = urls.slice(start, start + LIMITS.pages);
  return { urls: batch, start, nextCursor: start + batch.length, remaining: Math.max(0, urls.length - start - batch.length) };
}
export const CANCELLATION_NOTICE = 'Cancelar detiene nuevas solicitudes. Sólo se conservan las respuestas ya recibidas; los anuncios de una búsqueda todavía en curso no se recuperan al cancelar.';
export const LANGUAGE_NOTICE = 'El idioma se estima por el texto, no por el país ni por la interfaz de Meta. Puede fallar en textos breves o mixtos. Los desconocidos se excluyen al filtrar; “Todos” no garantiza búsquedas en todos los idiomas.';
