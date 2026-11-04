const META = ['facebook.com', 'fb.com', 'fb.me', 'meta.com'];
const NON_COMMERCIAL = ['instagram.com', 'whatsapp.com', 'wa.me', 'messenger.com', 'm.me', 'youtube.com', 'youtu.be'];
const hostIn = (host, domains) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
export function decodeDestination(value, depth = 0) {
  if (typeof value !== 'string' || !value.trim() || depth > 4) return { kind: 'invalid', reason: 'invalid_or_nested_url' };
  let url;
  try { url = new URL(value.replace(/&amp;/g, '&'), 'https://www.facebook.com'); }
  catch { return { kind: 'invalid', reason: 'invalid_url' }; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return { kind: 'invalid', reason: 'unsupported_url' };
  const wrapper = ['l.facebook.com', 'lm.facebook.com'].includes(url.hostname) || (hostIn(url.hostname, ['facebook.com']) && url.pathname === '/l.php');
  if (wrapper) {
    const target = url.searchParams.get('u');
    return target ? decodeDestination(target, depth + 1) : { kind: 'meta', reason: 'redirect_without_target' };
  }
  if (hostIn(url.hostname, META)) return { kind: 'meta', reason: 'meta_url' };
  if (hostIn(url.hostname, NON_COMMERCIAL)) return { kind: 'non_commercial', reason: 'social_or_contact_url' };
  // A relative path is an observed Meta URL, never a guessed shop URL.
  return { kind: 'external', url: url.href };
}
export function extractAdUrls(card, copy = '') {
  const counts = { visibleTargets: 0, extracted: 0, metaTargets: 0, nonCommercialTargets: 0, invalidTargets: 0, unsupportedTargets: card.unsupportedTargets || 0 };
  const candidates = [];
  const observed = [...(card.targets || []), ...(copy.match(/https?:\/\/[^\s<>]+/g) || []).map(value => ({ value: value.replace(/[),.;]+$/, ''), source: 'copy' }))];
  for (const target of observed) {
    counts.visibleTargets++;
    const decoded = decodeDestination(target.value);
    if (decoded.kind === 'external' && (card.scope === 'single_ad_card' || target.source === 'copy')) {
      candidates.push({ url: decoded.url, source: target.source, adId: String(card.id), scope: target.source === 'copy' ? 'copy' : card.scope });
    } else if (decoded.kind === 'meta') counts.metaTargets++;
    else if (decoded.kind === 'non_commercial') counts.nonCommercialTargets++;
    else counts.invalidTargets++;
  }
  const links = [...new Map(candidates.map(item => [item.url, item])).values()];
  counts.extracted = links.length;
  const status = links.length ? 'url_extracted' : counts.invalidTargets || counts.unsupportedTargets ? 'url_present_not_extracted' : counts.metaTargets || counts.nonCommercialTargets ? 'meta_or_non_commercial_url' : card.urlHints ? 'url_present_not_extracted' : card.scope === 'unknown' ? 'scope_unresolved' : 'no_visible_url';
  return { urlEvidence: links, urlDiagnostics: { status, ...counts, scope: card.scope || 'unknown' } };
}
export function adUrls(ad) {
  const proven = (ad?.urlEvidence || []).filter(item => String(item.adId) === String(ad.id) && ['single_ad_card', 'copy'].includes(item.scope));
  const copy = (String(ad?.copy || '').match(/https?:\/\/[^\s<>]+/g) || []).map(value => decodeDestination(value.replace(/[),.;]+$/, ''))).filter(item => item.kind === 'external');
  return [...new Set([...proven.map(item => decodeDestination(item.url)).filter(item => item.kind === 'external').map(item => item.url), ...copy.map(item => item.url)])];
}
export function urlSummary(ads) {
  const summary = { ads: ads.length, scope_unresolved: 0, no_visible_url: 0, url_present_not_extracted: 0, url_extracted: 0, meta_or_non_commercial_url: 0, uniqueExternalUrls: new Set(ads.flatMap(adUrls)).size };
  for (const ad of ads) {
    const status = ad.urlDiagnostics?.status || (adUrls(ad).length ? 'url_extracted' : 'no_visible_url');
    summary[status] = (summary[status] || 0) + 1;
  }
  return summary;
}
