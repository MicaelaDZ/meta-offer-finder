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
  return { evidenceText: fullText.slice(0, 100000), textTruncated: fullText.length > 100000,
    productTitle: titles.length === 1 ? titles[0] : null, excludedPriceTexts };
}
