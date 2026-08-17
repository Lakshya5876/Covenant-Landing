interface Env {
  DB: D1Database;
}

// Powers the "recent arrivals" strip — real data only, capped small.
// Email is never returned to the client. ORDER BY id DESC LIMIT 24 walks the
// primary-key btree backwards and stops at 24 rows, so unlike count.ts this
// query is already O(24) regardless of table size — but it's still public,
// identical-for-everyone output, so the same short edge cache applies to cut
// repeat-visitor D1 reads to ~1 per PoP per TTL window. See count.ts for the
// cache-key normalization rationale.
const CACHE_TTL_SECONDS = 20;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const cache = caches.default;
  const url = new URL(ctx.request.url);
  url.search = '';
  const cacheKey = new Request(url.toString(), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const { results } = await ctx.env.DB.prepare(
    'SELECT username, avatar_id FROM board_members ORDER BY id DESC LIMIT 24'
  ).all<{ username: string; avatar_id: string }>();
  const response = Response.json(
    { members: results ?? [] },
    { headers: { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` } }
  );
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
