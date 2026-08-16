import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only emulation of the Cloudflare Pages Functions under /functions/api.
 * `npm run dev` (plain Vite) doesn't run those functions or D1, so without
 * this the Board UI would just see 404s. Backed by an in-memory array that
 * resets on server restart — fine for fast local iteration. The real,
 * persistent behavior lives in /functions/api/board/*.ts against D1 and is
 * what actually deploys; test that path with `npm run dev:full`.
 */
function boardDevShim(): Plugin {
  const members: { username: string; avatarId: string; email: string }[] = [];

  return {
    name: 'board-dev-shim',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/board/count' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ count: members.length }));
          return;
        }
        if (req.url === '/api/board/members' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              members: members
                .slice(-24)
                .reverse()
                .map((m) => ({ username: m.username, avatar_id: m.avatarId })),
            })
          );
          return;
        }
        if (req.url === '/api/board/join' && req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk) => (raw += chunk));
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const body = JSON.parse(raw || '{}');
              const username = String(body.username ?? '').trim();
              const email = String(body.email ?? '')
                .trim()
                .toLowerCase();
              const avatarId = String(body.avatarId ?? '');
              if (username.length < 2 || !email.includes('@') || !avatarId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Fill in the form.' }));
                return;
              }
              // Same email again — already a seat, not a new one. Let them
              // through without minting a second entry (matches the real
              // /functions/api/board/join.ts D1 behavior).
              if (!members.some((m) => m.email === email)) {
                members.push({ username, email, avatarId });
              }
              res.end(JSON.stringify({ ok: true, count: members.length }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Bad request.' }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [boardDevShim()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        board: 'board.html',
        install: 'install.html',
      },
    },
  },
});
