export function aiFailure(error, cancelled = false) {
  const message = String(error?.message || '');
  const code = cancelled ? 'AI_CANCELLED' : /timeout|timed out/i.test(message) || error?.name === 'TimeoutError' ? 'AI_TIMEOUT' : error?.status_code === 404 || /model.*not found/i.test(message) ? 'AI_MODEL_MISSING' : error instanceof SyntaxError ? 'AI_INVALID_RESULT' : 'AI_UNAVAILABLE';
  return { code, message: ({ AI_CANCELLED: 'Análisis cancelado.', AI_TIMEOUT: 'La IA superó el límite de 8 segundos.', AI_MODEL_MISSING: 'El modelo de Ollama no está instalado.', AI_INVALID_RESULT: 'La IA devolvió un resultado no válido.', AI_UNAVAILABLE: 'No se pudo conectar con el servicio de IA.' })[code], terminal: code !== 'AI_INVALID_RESULT' };
}

export async function analyzeBatch(ads, analyze, signal) {
  const results = [], seen = new Set();
  for (const ad of ads.slice(0, 5)) {
    if (!ad?.id || seen.has(String(ad.id))) continue;
    seen.add(String(ad.id));
    if (signal?.aborted) break;
    try { results.push(await analyze(ad)); }
    catch (error) {
      const failure = aiFailure(error, signal?.aborted);
      results.push({ id: ad.id, advertiser: ad.advertiser, categoria: 'desconocido', esDigital: false, posibleOportunidad: false, error: failure.message, errorCode: failure.code });
      if (failure.terminal) break;
    }
  }
  return results;
}
