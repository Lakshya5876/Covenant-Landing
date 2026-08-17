interface Env {
  DB: D1Database;
}

// COUNT(*) has no index to lean on — its cost grows with total row count, so
// every uncached hit is an O(n) scan. The response is identical for every
// visitor (no auth, no per-request variance), so a short edge cache turns
// unlimited GETs into ~1 D1 read per Cloudflare PoP per TTL window instead
// of 1 per request. Cache key is normalized to the bare path: this endpoint
// takes no query params, so stripping any a caller adds prevents cache-key
// fragmentation (an attacker appending random ?x=... to force cache misses).
const CACHE_TTL_SECONDS = 20;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const cache = caches.default;
  const url = new URL(ctx.request.url);
  url.search = '';
  const cacheKey = new Request(url.toString(), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const row = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM board_members').first<{ n: number }>();
  const response = Response.json(
    { count: row?.n ?? 0 },
    { headers: { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` } }
  );
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
