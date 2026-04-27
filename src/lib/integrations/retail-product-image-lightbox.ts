/**
 * Best-effort higher-resolution URL for retail product images opened in a lightbox.
 * Home Depot CDN uses size suffixes like `-64_65.jpg` / `-100.jpg`; larger assets often end in `-1000.jpg`.
 */
/**
 * Higher-resolution catalog URL for AI reference fetch (Vertex multimodal, GPT‑4o vision summary).
 * Safe to call on signed Supabase URLs — unknown hosts are returned unchanged.
 */
function isHomeDepotProductImageCdnHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "images.thdstatic.com" ||
    h.endsWith(".thdstatic.com") ||
    h === "images.homedepot-static.com" ||
    h.endsWith(".homedepot-static.com")
  );
}

export function retailImageUrlForLightbox(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (isHomeDepotProductImageCdnHost(h)) {
      const p = u.pathname;
      const m = p.match(/^(.+)-(\d+)_(\d+)\.(jpe?g|webp)$/i);
      if (m) {
        u.pathname = `${m[1]}-1000.${m[4].toLowerCase()}`;
        return u.toString();
      }
    }
    if (h === "encrypted-tbn0.gstatic.com" || h.endsWith(".gstatic.com")) {
      return raw.replace(/=s\d+/i, "=s1200");
    }
  } catch {
    return raw;
  }
  return raw;
}

/**
 * Ordered URLs to try when downloading a product image for Vertex (or other server fetch).
 * Try the **stored** URL first (often a working `-64_65` / `-600` thumb), then the `-1000` hi-res
 * variant, then downgrades — avoids long timeouts when `-1000` is missing or slow on the CDN.
 *
 * @param maxCandidates When set, return at most this many URLs (order preserved) so slow mockups
 * do not walk the full Home Depot downgrade ladder when the caller will only try the first few.
 */
export function productReferenceImageFetchCandidateUrls(url: string, maxCandidates?: number): string[] {
  const raw = url.trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string) => {
    const t = u.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  const hiRes = retailImageUrlForLightbox(raw);
  add(raw);
  add(hiRes);

  const pushThdDowngrades = (candidate: string) => {
    try {
      const u = new URL(candidate.trim());
      const h = u.hostname.toLowerCase();
      if (!isHomeDepotProductImageCdnHost(h)) return;
      const p = u.pathname;
      const m1000 = p.match(/^(.+)-1000\.(jpe?g|webp)$/i);
      if (!m1000) return;
      const base = m1000[1];
      const ext = m1000[2].toLowerCase();
      for (const suf of ["-600", "-400", "-300", "-145_145", "-100_100", "-64_65"]) {
        const nu = new URL(u.toString());
        nu.pathname = `${base}${suf}.${ext}`;
        add(nu.toString());
      }
    } catch {
      // ignore
    }
  };

  pushThdDowngrades(hiRes);
  pushThdDowngrades(raw);
  const cap =
    maxCandidates != null && Number.isFinite(maxCandidates) && maxCandidates >= 1
      ? Math.floor(maxCandidates)
      : null;
  return cap != null ? out.slice(0, cap) : out;
}
