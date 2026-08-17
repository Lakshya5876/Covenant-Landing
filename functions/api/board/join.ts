interface Env {
  DB: D1Database;
}

// Kept in sync with src/avatars.ts by hand — small, stable list, not worth a
// build-step to share between the two separate TS programs (frontend vs
// Functions). Validated server-side so a join can't be recorded against an
// avatar id that doesn't exist.
const VALID_AVATAR_IDS = new Set(
  Array.from({ length: 30 }, (_, i) => `avatar-${String(i + 1).padStart(2, '0')}`)
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 120;

// Generous ceiling for the actual JSON shape ({username, email, avatarId}) —
// rejects oversized bodies by header alone, before buffering/parsing them,
// so an attacker can't spend our CPU (or D1, further down) on multi-MB junk.
const MAX_BODY_BYTES = 4096;

// One join attempt per IP per window. The Origin check below only catches
// browsers — any direct scripted client (curl, requests, a bot) just omits
// Origin entirely and sails through it, hitting D1 on every request. IP is
// the only thing here a caller can't opt out of or spoof: CF-Connecting-IP
// is set by Cloudflare's edge from the real TCP connection, not read from
// anything the client sends, so it can't be forged by header manipulation
// the way Origin effectively can (a script can just omit it; it can't
// substitute a different source IP for its own request).
//
// Implemented with the same Cache API already used by count.ts/members.ts —
// no KV, no Durable Objects, no new Cloudflare resource or paid feature.
// It's a best-effort, per-Cloudflare-PoP limiter (the cache isn't globally
// consistent), not a hard global guarantee — but it turns "unlimited D1 hits
// per second from one source" into "at most one every RATE_LIMIT_WINDOW_
// SECONDS, per PoP that source's traffic lands on," which is the actual
// cost driver worth bounding here.
const RATE_LIMIT_WINDOW_SECONDS = 10;

function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

async function isRateLimited(ip: string): Promise<boolean> {
  const cache = caches.default;
  // Synthetic same-origin key — this is never a real route, just a place to
  // hang a per-IP marker in the shared edge cache.
  const key = new Request(`https://rate-limit.internal/join/${encodeURIComponent(ip)}`);

  if (await cache.match(key)) return true;

  // Awaited, not waitUntil'd: the whole point is that the NEXT request from
  // this IP sees the marker, so the write needs to be underway before this
  // request finishes, not deferred after the response is already sent.
  await cache.put(
    key,
    new Response('1', { headers: { 'Cache-Control': `public, max-age=${RATE_LIMIT_WINDOW_SECONDS}` } })
  );
  return false;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const contentLength = ctx.request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return bad('Request body too large.', 413);
  }

  // IP-based limiter first: it's the one check that can't be bypassed by
  // simply not sending a header, so reject on it before spending any more
  // work (including the Origin check, which a direct scripted client would
  // sail past anyway by omitting Origin).
  const ip = ctx.request.headers.get('CF-Connecting-IP');
  if (ip && (await isRateLimited(ip))) {
    return Response.json(
      { ok: false, error: 'Too many requests. Try again in a few seconds.' },
      { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) } }
    );
  }

  // Same-origin only. This isn't an auth boundary (the endpoint is meant to
  // be publicly reachable) — it just stops a third-party page from silently
  // using an unaware visitor's browser as a drive-by spam relay. Absent
  // entirely for non-browser/no-Origin callers (curl, same-site edge cases),
  // which is intentional: this is defense-in-depth on top of the rate
  // limiter above, not the primary control.
  const origin = ctx.request.headers.get('Origin');
  if (origin && origin !== new URL(ctx.request.url).origin) {
    return bad('Cross-origin requests are not allowed.', 403);
  }

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return bad('Send JSON.');
  }
  if (typeof body !== 'object' || body === null) return bad('Send JSON.');
  const { username, email, avatarId } = body as Record<string, unknown>;

  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 40) {
    return bad('Username must be 2–40 characters.');
  }
  if (typeof email !== 'string' || email.trim().length === 0 || email.trim().length > MAX_EMAIL_LEN) {
    return bad('That email doesn\'t look right.');
  }
  if (!EMAIL_RE.test(email.trim())) {
    return bad('That email doesn\'t look right.');
  }
  if (typeof avatarId !== 'string' || !VALID_AVATAR_IDS.has(avatarId)) {
    return bad('Pick an avatar.');
  }

  const cleanUsername = username.trim().slice(0, 40);
  const cleanEmail = email.trim().toLowerCase().slice(0, MAX_EMAIL_LEN);

  try {
    await ctx.env.DB.prepare(
      'INSERT INTO board_members (username, email, avatar_id) VALUES (?1, ?2, ?3)'
    )
      .bind(cleanUsername, cleanEmail, avatarId)
      .run();
  } catch (err) {
    // UNIQUE constraint on email — already a seat, not a new one. Someone
    // re-entering their own email (lost localStorage, different browser,
    // wants their commands back) should get back in without minting a
    // second row: no insert, no error.
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('UNIQUE')) {
      return Response.json({ ok: false, error: 'Could not join right now.' }, { status: 500 });
    }
  }

  // No COUNT(*) here on purpose: no client reads a count back from this
  // endpoint (the landing/board teasers poll GET /api/board/count, which is
  // edge-cached separately). Returning one would mean an unbounded,
  // table-scan-cost read on every single join call — including repeat
  // submissions of an already-registered email — for a value nothing uses.
  return Response.json({ ok: true });
};
