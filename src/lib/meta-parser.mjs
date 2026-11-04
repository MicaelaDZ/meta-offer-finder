import { detectLanguage, uniqueAds } from './discovery.mjs';

// Meta changes its DOM regularly. Only explicit library identifiers are accepted.
export const LIBRARY_MARKER = /(?:Identificador de la biblioteca|Library ID|ID da biblioteca):\s*\d+/i;
export function parseMetaText(text) {
  const sections = String(text).split(/(?=(?:Identificador de la biblioteca|Library ID|ID da biblioteca):\s*\d+)/gi);
  const ads = [];
  for (const section of sections) {
    const id = section.match(/^(?:Identificador de la biblioteca|Library ID|ID da biblioteca):\s*(\d+)/i)?.[1];
    if (!id) continue;
    const lines = section.split('\n').map(line => line.trim()).filter(Boolean);
    const index = lines.findIndex(line => /^(Publicidad|Sponsored|Patrocinado)$/i.test(line));
    const fullCopy = index >= 0 ? lines.slice(index + 1).join('\n') : null;
    const copy = fullCopy?.slice(0, 20000) ?? null;
    const copyTruncated = Boolean(fullCopy && (fullCopy.length > 20000 || /^(ver m[aá]s|see more|ver mais)$/im.test(fullCopy)));
    ads.push({ id, advertiser: index > 0 ? lines[index - 1] : null, copy, copyTruncated,
      date: section.match(/(?:En circulación desde el|Started running on|Em veiculação desde)\s+([^\n]+)/i)?.[1] ?? null,
      language: copyTruncated ? 'unknown' : detectLanguage(copy), sourceUrl: `https://www.facebook.com/ads/library/?id=${id}`,
      destinationUrl: null, destinationVerified: false });
  }
  return uniqueAds(ads);
}
