export const SEARCH_PROFILES = {
  manual: { timeoutMs: 100000, navigationMs: 60000, markerMs: 15000, scrolls: 4, scrollDelayMs: 1500 },
  automatic: { timeoutMs: 18000, navigationMs: 12000, markerMs: 2000, scrolls: 2, scrollDelayMs: 500 },
};
export function searchProfile(mode = 'manual') { return SEARCH_PROFILES[mode] || SEARCH_PROFILES.manual; }
