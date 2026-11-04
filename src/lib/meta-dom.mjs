// Executed in Chromium. No evaluation of onclick scripts, navigation/clicks,
// cookies, local storage, hidden JSON state or authenticated network payloads.
export function extractMetaCards() {
  const marker = /(?:Identificador de la biblioteca|Library ID|ID da biblioteca|Identificador da biblioteca)\s*:?\s*(\d+)/gi;
  function ids(text) { return [...new Set([...String(text).matchAll(marker)].map(match => match[1]))]; }
  function visible(element) { const s = getComputedStyle(element); return s.display !== 'none' && s.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true'; }
  function text(element) {
    if (!visible(element) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'DEL', 'S', 'STRIKE'].includes(element.tagName) || getComputedStyle(element).textDecorationLine.includes('line-through')) return '';
    const block = !['inline', 'contents'].includes(getComputedStyle(element).display);
    return (block ? '\n' : '') + [...element.childNodes].map(node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeType === Node.ELEMENT_NODE ? text(node) : '').join(' ') + (block ? '\n' : '');
  }
  const markers = new Map();
  for (const element of [...document.querySelectorAll('span, p, div')].slice(0, 20000)) {
    if (!visible(element)) continue;
    const value = element.innerText || '';
    if (value.length > 180) continue;
    const found = ids(value);
    if (found.length === 1 && !markers.has(found[0])) markers.set(found[0], element);
  }
  const cards = [];
  for (const [id, element] of [...markers].slice(0, 100)) {
    let current = element, card = null;
    for (let depth = 0; current && depth < 14 && !['BODY', 'HTML'].includes(current.tagName); depth++, current = current.parentElement) {
      const value = current.innerText || '';
      if (ids(value).length !== 1) break;
      if (!/\b(Publicidad|Sponsored|Patrocinado)\b/i.test(value)) continue;
      const semantic = current.matches('article, [role="article"], [data-ad-id]');
      const boundary = current.parentElement && ids(current.parentElement.innerText || '').length > 1;
      if ((semantic || boundary) && !current.querySelector('nav, [role="navigation"]')) { card = current; break; }
    }
    if (!card) continue; // Flat fallback has no authority to attribute global CTAs.
    const targets = [];
    let unsupportedTargets = 0;
    for (const anchor of [...card.querySelectorAll('a, button, [role="button"], [data-href], [data-url], [data-lynx-uri]')].slice(0, 200)) {
      if (!visible(anchor)) continue;
      for (const source of ['href', 'data-href', 'data-url', 'data-lynx-uri']) {
        const value = anchor.getAttribute(source);
        if (value) targets.push({ source, value });
      }
      // Scripts are never executed or treated as proven navigation targets.
      if (/https?:\/\//.test(anchor.getAttribute('onclick') || '')) unsupportedTargets++;
    }
    const raw = text(card).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    const body = card.innerText || '';
    cards.push({ id, text: raw.slice(0, 30000), truncated: raw.length > 30000, scope: 'single_ad_card', targets, unsupportedTargets,
      urlHints: /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.test(body) });
  }
  const body = document.body?.innerText || '';
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(node => node.innerText || '').join(' ');
  const noResults = /no ads found|no se encontraron anuncios|no encontramos resultados|nenhum anuncio encontrado/i.test(body);
  const challenge = /captcha|confirm you are human|confirma que eres humano/i.test(body) ? 'challenge' : document.querySelector('input[type="password"]') ? 'login_required' : /cookies|consentimiento|consent/i.test(dialogs) ? 'consent_required' : null;
  return { cards, markerCount: markers.size, noResults, challenge, scopeFailures: Math.max(0, markers.size - cards.length) };
}
