// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './join';

// Coverage for the rate limiter's fail-closed behavior (functions/api/board/
// join.ts): a Cache API failure or a missing CF-Connecting-IP must both deny
// the request with a controlled 503 and must never let it reach D1. This
// exercises the actual exported handler, not a reimplementation, with a
// minimal fake CacheStorage/D1 harness — jsdom isn't relevant here (there's
// no DOM), so this file runs under Node instead (see the pragma above).

interface FakeCacheOptions {
  match?: () => Promise<Response | undefined>;
  put?: () => Promise<void>;
}

function makeFakeCache(opts: FakeCacheOptions = {}) {
  const store = new Map<string, Response>();
  return {
    match: opts.match ?? (async (req: Request) => store.get(req.url)),
    put: opts.put ?? (async (req: Request, res: Response) => void store.set(req.url, res)),
  };
}

function makeFakeDB() {
  let prepareCalls = 0;
  const DB = {
    prepare(_sql: string) {
      prepareCalls++;
      return {
        bind: (..._args: unknown[]) => ({
          run: async () => ({ success: true, meta: {} }),
        }),
      };
    },
  };
  return { DB, prepareCalls: () => prepareCalls };
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('https://covenant-landing.pages.dev/api/board/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username: 'testuser', email: 'testuser@example.com', avatarId: 'avatar-01' }),
  });
}

function makeCtx(request: Request, DB: unknown) {
  return { request, env: { DB } } as unknown as Parameters<typeof onRequestPost>[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('onRequestPost rate limiter', () => {
  it('allows a fresh IP and reaches D1 (baseline sanity check)', async () => {
    vi.stubGlobal('caches', { default: makeFakeCache() });
    const { DB, prepareCalls } = makeFakeDB();

    const res = await onRequestPost(makeCtx(makeRequest({ 'CF-Connecting-IP': '203.0.113.1' }), DB));

    expect(res.status).toBe(200);
    expect(prepareCalls()).toBe(1);
  });

  it('rejects a second request from the same IP within the window (429), never touching D1', async () => {
    const cache = makeFakeCache();
    vi.stubGlobal('caches', { default: cache });
    const { DB, prepareCalls } = makeFakeDB();

    await onRequestPost(makeCtx(makeRequest({ 'CF-Connecting-IP': '203.0.113.2' }), DB));
    const second = await onRequestPost(makeCtx(makeRequest({ 'CF-Connecting-IP': '203.0.113.2' }), DB));

    expect(second.status).toBe(429);
    expect(prepareCalls()).toBe(1); // only the first request reached D1
  });

  it('fails closed with 503 when cache.match() throws, never touching D1', async () => {
    vi.stubGlobal('caches', {
      default: makeFakeCache({
        match: async () => {
          throw new Error('Cache API unavailable');
        },
      }),
    });
    const { DB, prepareCalls } = makeFakeDB();

    const res = await onRequestPost(makeCtx(makeRequest({ 'CF-Connecting-IP': '203.0.113.3' }), DB));
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(prepareCalls()).toBe(0);
  });

  it('fails closed with 503 when cache.put() throws, never touching D1', async () => {
    vi.stubGlobal('caches', {
      default: makeFakeCache({
        match: async () => undefined, // no prior hit — proceeds to put()
        put: async () => {
          throw new Error('Cache API unavailable');
        },
      }),
    });
    const { DB, prepareCalls } = makeFakeDB();

    const res = await onRequestPost(makeCtx(makeRequest({ 'CF-Connecting-IP': '203.0.113.4' }), DB));
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(prepareCalls()).toBe(0);
  });

  it('fails closed with 503 when CF-Connecting-IP is absent, never touching D1', async () => {
    vi.stubGlobal('caches', { default: makeFakeCache() });
    const { DB, prepareCalls } = makeFakeDB();

    // No CF-Connecting-IP header at all.
    const res = await onRequestPost(makeCtx(makeRequest(), DB));
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(prepareCalls()).toBe(0);
  });

  it('scopes the rate-limit key by request host, not just IP', async () => {
    const cache = makeFakeCache();
    vi.stubGlobal('caches', { default: cache });
    const { DB } = makeFakeDB();

    const prodRequest = new Request('https://covenant-landing.pages.dev/api/board/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.5' },
      body: JSON.stringify({ username: 'prod-user', email: 'prod-user@example.com', avatarId: 'avatar-01' }),
    });
    const previewRequest = new Request('https://preview-hash.covenant-landing.pages.dev/api/board/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.5' },
      body: JSON.stringify({ username: 'preview-user', email: 'preview-user@example.com', avatarId: 'avatar-01' }),
    });

    const prodRes = await onRequestPost(makeCtx(prodRequest, DB));
    // Same IP, different host — must NOT be rate-limited by the prod request above.
    const previewRes = await onRequestPost(makeCtx(previewRequest, DB));

    expect(prodRes.status).toBe(200);
    expect(previewRes.status).toBe(200);
  });
});
