// Pure selection only. The caller retains the existing URL authorization rules.
// A citation selects a page to inspect; it never proves identity or nutrition.
export const MAX_DISCOVERY_PAGES = 6;
export const MAX_DISCOVERY_CITATIONS = 24;

export function sourceResourceURL(value, safeURL) {
  if (typeof value !== 'string' || !safeURL(value)) return null;
  const url = new URL(value);
  url.hash = '';
  return url.href; // Preserve query parameters: they may select a product/variant.
}

export function sourceFamily(value) {
  return new URL(value).hostname.replace(/^www\./, '');
}

// Ranking hints only, never a new fetch allowlist or proof of product identity.
function productPath(value) {
  const url = new URL(value), family = sourceFamily(value);
  if (family === 'smartlabel.pepsico.info') return /^\/\d{12,14}-\d+-en-US\/index\.html$/.test(url.pathname);
  return /^\/(?:p|ip|product|products|natures-own)\/.+/.test(url.pathname)
    || family === 'shop.harmonsgrocery.com' && /\/products?\//.test(url.pathname);
}

function diverseOrder(values) {
  const families = new Map();
  for (const value of values) {
    const family = sourceFamily(value);
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(value);
  }
  const result = [];
  for (let round = 0; result.length < values.length; round++) {
    for (const queue of families.values()) if (queue[round]) result.push(queue[round]);
  }
  return result;
}

export function selectCitedDiscoverySources(annotations, { safeURL, supportedURL }) {
  const unique = [];
  for (const annotation of annotations.slice(0, MAX_DISCOVERY_CITATIONS)) {
    const url = sourceResourceURL(annotation?.url_citation?.url, safeURL);
    if (url && !unique.includes(url)) unique.push(url);
  }
  const supported = unique.filter(supportedURL);
  // First cover product paths across source families, then other supported paths.
  // A model's JSON URL order cannot crowd a cited retailer out of the queue.
  const ordered = diverseOrder(supported.filter(productPath));
  ordered.push(...diverseOrder(supported.filter(url => !productPath(url))));
  // Keep the former unsupported-link diagnostic behavior; readPage still denies it.
  ordered.push(...unique.filter(url => !supportedURL(url)));
  return ordered.slice(0, MAX_DISCOVERY_PAGES);
}
