import { isIP } from 'node:net';
import { extractPageEvidence } from './page-evidence.mjs';
import { pageSignals } from './association.mjs';
import { diagnostic, failureDiagnostic } from './scrape-diagnostics.mjs';
export function isAllowedLandingUrl(value) {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !isIP(host.replace(/^\[|\]$/g, '')) && host !== 'localhost' && !['.localhost', '.local', '.internal'].some(suffix => host.endsWith(suffix));
  } catch { return false; }
}
export async function verifyLanding(page, url, { deadline = Date.now() + 40000, signal, allowUrl = isAllowedLandingUrl } = {}) {
  const result = { url, lifecycle: { attempted: true, downloaded: false, accessible: false }, redirectChain: [] };
  if (!allowUrl(url)) return { ...result, status: 'error', reason: 'URL no admitida.', diagnostic: diagnostic('INVALID_URL', 'url') };
  let phase = 'download';
  try {
    page.setDefaultTimeout(4000);
    await page.route('**/*', route => allowUrl(route.request().url()) ? route.fallback() : route.abort());
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(1, Math.min(12000, deadline - Date.now())) });
    result.httpStatus = response?.status() ?? null;
    result.finalUrl = page.url();
    result.lifecycle.downloaded = Boolean(response);
    let request = response?.request();
    while (request?.redirectedFrom() && result.redirectChain.length < 10) {
      const previous = request.redirectedFrom();
      result.redirectChain.unshift({ from: previous.url(), to: request.url(), status: (await previous.response())?.status() });
      request = previous;
    }
    if (!allowUrl(result.finalUrl) || result.redirectChain.some(hop => !allowUrl(hop.from) || !allowUrl(hop.to))) return { ...result, status: 'no_accesible', reason: 'La redirección apunta a un destino no admitido.', diagnostic: diagnostic('REDIRECT_BLOCKED', 'redirect') };
    if (!response || result.httpStatus >= 400) return { ...result, status: 'no_accesible', reason: `Respuesta HTTP ${result.httpStatus ?? 'desconocida'}.`, diagnostic: diagnostic('HTTP_ERROR', 'access', { httpStatus: result.httpStatus }) };
    phase = 'extract';
    await page.waitForTimeout(500);
    const gate = await page.evaluate(() => Boolean(document.querySelector('input[type="password"]')) || /captcha|access denied|acceso denegado/i.test(document.title));
    if (gate) return { ...result, status: 'no_accesible', reason: 'La página requiere autenticación o una comprobación de acceso.', diagnostic: diagnostic('ACCESS_GATE', 'access') };
    result.lifecycle.accessible = true;
    const evidence = await page.evaluate(extractPageEvidence);
    const signals = pageSignals(evidence);
    return { ...result, ...evidence, ...signals, title: await page.title(),
      status: signals.classification === 'sin_evidencia_suficiente' ? 'pendiente' : signals.classification,
      textPreview: evidence.evidenceText.slice(0, 500) };
  } catch (error) {
    const details = signal?.aborted ? diagnostic("CANCELLED", phase) : Date.now() >= deadline ? diagnostic("TIMEOUT", phase) : failureDiagnostic(error, phase);
    return { ...result, status: 'error', reason: details.message, diagnostic: details };
  }
}
