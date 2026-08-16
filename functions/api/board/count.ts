interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const row = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM board_members').first<{ n: number }>();
  return Response.json({ count: row?.n ?? 0 });
};
