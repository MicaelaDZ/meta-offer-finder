// Self-contained so Playwright can evaluate it in the page. Exclude obsolete
// prices based on DOM semantics and computed styles, not just their wording.
export function extractPageEvidence() {
  const excludedPriceTexts = [];
  function visibleText(element) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || element.getAttribute('aria-hidden') === 'true' || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) return '';
    if (['DEL', 'S', 'STRIKE'].includes(element.tagName) || style.textDecorationLine.includes('line-through')) {
      excludedPriceTexts.push(element.textContent || '');
      return '';
    }
    const block = !['inline', 'contents'].includes(style.display);
    return (block ? '\n' : '') + [...element.childNodes].map(node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeType === Node.ELEMENT_NODE ? visibleText(node) : '').join(' ') + (block ? '\n' : '');
  }
  const fullText = visibleText(document.body).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  const titles = [...new Set([...document.querySelectorAll('h1')].map(heading => visibleText(heading).trim()).filter(Boolean))];
  // Scope a separated heading/current-price/buy-button layout to a single
  // product container. Multiple titles or prices remain ambiguous.
  let productOffer = null;
  const heading = titles.length === 1 ? [...document.querySelectorAll('h1')].find(h => visibleText(h).trim() === titles[0]) : null;
  for (let root = heading?.parentElement, depth = 0; root && depth < 6; root = root.parentElement, depth++) {
    if (['BODY', 'HTML'].includes(root.tagName)) break;
    if (!root.matches('main, article, [itemtype*="Product"], [data-product-id], [data-product]') || root.querySelector('h2, h3') || !root.querySelector('[itemprop="price"], [data-price], [data-product-price], [class*="price"]')) continue;
    if (root.querySelectorAll('h1').length !== 1 || root.querySelectorAll('article, [itemtype*="Product"]').length > 1) continue;
    const scoped = visibleText(root).replace(/[ \t]+/g, ' ').trim();
    const prices = scoped.match(/(?:ARS|USD|EUR|BRL|US\$|R\$|\$|€)\s*\d(?:[\d.,]*\d)?/gi) || [];
    const purchase = [...root.querySelectorAll('button, a, [role="button"], input[type="submit"]')].some(el => /^(comprar|compralo|compra ahora|buy|buy now|purchase|enroll|enroll now|get access|inscribirme|inscribite|inscribirse|inscreva-se|matricularme|agregar al carrito|añadir al carrito|add to cart|compre|comprar agora)(?:\s|$)/i.test((el.innerText || el.value || '').trim()));
    if (prices.length === 1 && purchase && scoped.length <= 20000) {
      productOffer = { productTitle: titles[0], text: scoped, currentPrice: prices[0], purchaseAction: true, scope: 'single_product_dom' }; break;
    }
  }
  return { evidenceText: fullText.slice(0, 100000), textTruncated: fullText.length > 100000,
    productTitle: titles.length === 1 ? titles[0] : null, productOffer, excludedPriceTexts };
}
