const META_STOP_MESSAGES = {
  META_SOURCE_DISABLED: 'La búsqueda automática está pausada hasta contar con autorización de Meta.',
  META_ACCESS_REFUSED: 'La navegación automática recibió un rechazo de acceso. No se pudieron consultar los anuncios.',
  META_RATE_LIMITED: 'La consulta automática alcanzó un límite de solicitudes.',
};

export function stopsMetaSearch(detail) {
  return Object.hasOwn(META_STOP_MESSAGES, detail?.code) ||
    ['NETWORK_ACCESS_DENIED', 'LOGIN_REQUIRED', 'CONSENT_REQUIRED', 'CHALLENGE', 'BROWSER_MISSING'].includes(detail?.code);
}

const LABELS = { REDIRECT_BLOCKED: 'La redirección apunta a un destino no admitido.', INVALID_URL: 'URL no admitida.', ACCESS_GATE: 'El destino requiere autenticación o una comprobación de acceso.', CANCELLED: 'Solicitud cancelada.', EXTRACTION_COMPLETE: 'Extracción completada.', PARSE_FAILED: 'Se encontraron identificadores pero el formato de los anuncios no se pudo interpretar.', BROWSER_MISSING: 'Falta el Chromium fijado de Playwright.', TIMEOUT: 'Se agotó el tiempo de esta etapa.', NETWORK_ACCESS_DENIED: 'La red o el destino rechazó la conexión.', DNS_ERROR: 'No se pudo resolver el destino.', TLS_ERROR: 'Falló la verificación TLS del destino.', REDIRECT_ERROR: 'Falló la redirección del destino.', EXTRACTION_ERROR: 'No se pudo extraer el contenido.', NAVIGATION_ERROR: 'Falló la navegación.', LOGIN_REQUIRED: 'Meta requiere iniciar sesión.', CONSENT_REQUIRED: 'Meta requiere consentimiento.', CHALLENGE: 'Meta mostró una comprobación de acceso.', MARKERS_NOT_FOUND: 'La página cargó sin identificadores de anuncio reconocibles.', NO_RESULTS: 'Meta indicó que no hay resultados.', HTTP_ERROR: 'El destino respondió con un error HTTP.' };
export function diagnostic(code, stage, details = {}) { return { code, stage, message: META_STOP_MESSAGES[code] || LABELS[code] || LABELS.EXTRACTION_ERROR, ...details }; }
export function failureDiagnostic(error, stage, details = {}) {
  const message = String(error?.message || '');
  const engineCode = message.match(/net::(ERR_[A-Z_]+)/)?.[1];
  const code = /Executable doesn't exist|browser.*not found/i.test(message) ? 'BROWSER_MISSING' : /timeout|timed out/i.test(message) ? 'TIMEOUT' : /403|forbidden|ERR_TUNNEL|ERR_PROXY|access.denied/i.test(message) ? 'NETWORK_ACCESS_DENIED' : /NAME_NOT_RESOLVED/i.test(message) ? 'DNS_ERROR' : /CERT_|SSL_|TLS/i.test(message) ? 'TLS_ERROR' : /REDIRECT/i.test(message) ? 'REDIRECT_ERROR' : stage === 'extract' ? 'EXTRACTION_ERROR' : 'NAVIGATION_ERROR';
  // Do not retain raw messages/stacks: browser errors can embed URL parameters,
  // credentials, page contents, cookies or tokens. Codes and timings suffice.
  return diagnostic(code, stage, { ...(engineCode ? { engineCode } : {}), ...details });
}
