import { LIMITS, uniqueAds } from './discovery.mjs';

// Client-side orchestration only. Classification and ranking stay in the APIs.
export async function runDiscoveryWorkflow(data, { post, signal, onProgress = () => {}, onUpdate = () => {}, onWarning = () => {} }) {
  const state = { ads: uniqueAds(data.ads || []).slice(0, LIMITS.ads), groups: [], analyses: {}, pages: [], matches: [], ranking: [] };
  onUpdate({ ads: state.ads });
  function active() { if (signal?.aborted) throw new Error('Exploración cancelada.'); }
  async function step(label, warning, action) {
    active(); onProgress(label);
    try { await action(); active(); }
    catch (error) { active(); onWarning(warning, error.message); }
  }
  if (!state.ads.length) return state;
  await step('Analizando ofertas', 'No se pudieron agrupar todas las ofertas.', async () => {
    const result = await post('/api/group', { ads: state.ads });
    state.groups = result.groups || [];
    onUpdate({ groups: state.groups });
  });
  await step('Analizando ofertas', 'El análisis con IA no estuvo disponible para todas las ofertas. Continuamos con la evidencia observable.', async () => {
    const representatives = state.groups.length ? state.groups.map(group => state.ads.find(ad => ad.id === group.ads[0]?.id)).filter(Boolean) : state.ads;
    const result = await post('/api/analyze', { ads: representatives.slice(0, LIMITS.analyses) });
    state.analyses = Object.fromEntries((result.results || []).map(item => [item.id, item]));
    onUpdate({ analyses: state.analyses });
    const failed = (result.results || []).find(item => item.error);
    if (failed) throw new Error(`${failed.errorCode || 'AI_ERROR'}: ${failed.error}`);
  });
  if (data.externalLinks?.length) {
    await step('Verificando páginas', 'Algunas páginas no pudieron verificarse. Sus ofertas quedan pendientes.', async () => {
      const urls = data.externalLinks.slice(0, LIMITS.pages);
      const result = await post('/api/verify-pages', { urls });
      state.pages = result.results || [];
      onUpdate({ pages: state.pages, verificationCursor: urls.length });
      if (state.pages.some(page => ['error', 'no_accesible'].includes(page.status))) throw new Error('Hay páginas inaccesibles o con errores.');
    });
    await step('Verificando páginas', 'No se pudo comprobar la asociación de algunas páginas con sus productos.', async () => {
      const result = await post('/api/match-pages', { ads: state.ads, pages: state.pages });
      state.matches = result.matches || [];
      onUpdate({ matches: state.matches });
    });
  } else {
    active();
    onWarning('No se encontraron enlaces para verificar. Los candidatos permanecen pendientes.', 'Sin URLs candidatas en esta búsqueda.');
  }
  if (state.groups.length) await step('Preparando resultados', 'No se pudo preparar el ranking. Los anuncios recuperados están en Opciones avanzadas.', async () => {
    const result = await post('/api/rank', { groups: state.groups, pages: state.pages, matches: state.matches });
    state.ranking = result.ranking || [];
    onUpdate({ ranking: state.ranking });
  });
  return state;
}
